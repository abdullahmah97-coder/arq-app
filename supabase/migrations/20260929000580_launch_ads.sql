-- إعلان البداية: صفحة تظهر أول ما يفتح التطبيق (صورة أو GIF) مع زر إغلاق وتخطي.
-- المالك يتحكم فيها من لوحته: يضيف، يوقف، يحدد المدة والجمهور وعدد مرات الظهور.
-- نوعين: 'ad' إعلان تسويقي (يظهر عليه «إعلان») و 'occasion' تهنئة بمناسبة (اليوم الوطني مثلاً).
-- الفيديو يجي لاحقاً مع نسخة جديدة من المتجر (يحتاج مكتبة أصلية).

create table if not exists public.launch_ads (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'ad' check (kind in ('ad','occasion')),
  title       text not null check (char_length(btrim(title)) between 2 and 80),
  media_path  text not null check (char_length(media_path) <= 200),
  media_type  text not null default 'image' check (media_type in ('image','gif')),
  link        text check (link is null or (char_length(link) <= 300 and (link like '/%' or link like 'https://%'))),
  cta         text check (cta is null or char_length(cta) <= 30),
  audience    text not null default 'all' check (audience in ('all','men','women')),
  starts_at   timestamptz,
  ends_at     timestamptz,
  active      boolean not null default true,
  frequency   text not null default 'daily' check (frequency in ('every_open','daily','once')),
  auto_close  smallint not null default 6 check (auto_close between 0 and 30),
  priority    smallint not null default 0 check (priority between 0 and 100),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index if not exists launch_ads_live_idx on public.launch_ads (active, priority desc, created_at desc);

alter table public.launch_ads enable row level security;
-- القراءة المباشرة للمالك فقط؛ المستخدمين ياخذون الإعلان الحالي من current_launch_ad()
drop policy if exists launch_ads_admin_read on public.launch_ads;
create policy launch_ads_admin_read on public.launch_ads for select to authenticated using (is_admin());
drop policy if exists launch_ads_admin_write on public.launch_ads;
create policy launch_ads_admin_write on public.launch_ads for all to authenticated using (is_admin()) with check (is_admin());

create or replace function public._launch_ads_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, auth.uid()); end if;
  return new;
end $$;
drop trigger if exists launch_ads_touch on public.launch_ads;
create trigger launch_ads_touch before insert or update on public.launch_ads
  for each row execute function public._launch_ads_touch();

-- كل إضافة أو تعديل أو حذف ينحفظ في سجل المالك
create or replace function public._launch_ads_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then perform _admin_log('ad', old.id::text, 'delete', old.title); return old; end if;
  perform _admin_log('ad', new.id::text,
    case when tg_op = 'INSERT' then 'create'
         when new.active is distinct from old.active then case when new.active then 'show' else 'hide' end
         else 'edit' end, new.title);
  return new;
end $$;
drop trigger if exists launch_ads_log on public.launch_ads;
create trigger launch_ads_log after insert or update or delete on public.launch_ads
  for each row execute function public._launch_ads_log();

-- مشاهدات ونقرات: صف واحد لكل شخص في اليوم لكل نوع، عشان الأرقام تكون أشخاص حقيقيين مو تكرار فتح
create table if not exists public.launch_ad_events (
  ad_id   uuid not null references public.launch_ads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  day     date not null default ((now() at time zone 'Asia/Riyadh')::date),
  kind    text not null check (kind in ('view','click','close')),
  primary key (ad_id, user_id, day, kind)
);
alter table public.launch_ad_events enable row level security;
revoke all on public.launch_ad_events from anon, authenticated;

-- الإعلان الحالي للمستخدم: فعّال، داخل المدة، ويناسب جمهوره. الأعلى أولوية ثم الأحدث.
create or replace function public.current_launch_ad()
returns table (id uuid, kind text, title text, media_path text, media_type text, link text, cta text,
               frequency text, auto_close smallint, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.kind, a.title, a.media_path, a.media_type, a.link, a.cta, a.frequency, a.auto_close, a.updated_at
  from launch_ads a
  left join health_profiles p on p.user_id = auth.uid()
  where auth.uid() is not null
    and a.active
    and (a.starts_at is null or a.starts_at <= now())
    and (a.ends_at is null or a.ends_at > now())
    and (a.audience = 'all'
         or (a.audience = 'men' and p.gender = 'male')
         or (a.audience = 'women' and p.gender = 'female'))
  order by a.priority desc, a.created_at desc
  limit 1;
$$;
revoke all on function public.current_launch_ad() from public, anon;
grant execute on function public.current_launch_ad() to authenticated;

create or replace function public.launch_ad_event(p_ad uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_kind not in ('view','click','close') then raise exception 'bad_status'; end if;
  if not exists (select 1 from launch_ads where id = p_ad) then return; end if;
  insert into launch_ad_events (ad_id, user_id, kind) values (p_ad, auth.uid(), p_kind)
  on conflict do nothing;
end $$;
revoke all on function public.launch_ad_event(uuid, text) from public, anon;
grant execute on function public.launch_ad_event(uuid, text) to authenticated;

-- أرقام كل إعلان للمالك: مشاهدات (أشخاص/يوم)، أشخاص مختلفين، نقرات، إغلاق
create or replace function public.launch_ad_stats()
returns table (ad_id uuid, views bigint, reach bigint, clicks bigint, closes bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  return query
    select a.id,
      count(*) filter (where e.kind = 'view'),
      count(distinct e.user_id) filter (where e.kind = 'view'),
      count(*) filter (where e.kind = 'click'),
      count(*) filter (where e.kind = 'close')
    from launch_ads a left join launch_ad_events e on e.ad_id = a.id
    group by a.id;
end $$;
revoke all on function public.launch_ad_stats() from public, anon;
grant execute on function public.launch_ad_stats() to authenticated;

-- ملفات الإعلانات: قراءة عامة، والرفع والحذف للمالك فقط
insert into storage.buckets (id, name, public) values ('ads', 'ads', true) on conflict (id) do nothing;
drop policy if exists "admin write ads" on storage.objects;
create policy "admin write ads" on storage.objects for insert to authenticated
  with check (bucket_id = 'ads' and public.is_admin());
drop policy if exists "admin update ads" on storage.objects;
create policy "admin update ads" on storage.objects for update to authenticated
  using (bucket_id = 'ads' and public.is_admin());
drop policy if exists "admin delete ads" on storage.objects;
create policy "admin delete ads" on storage.objects for delete to authenticated
  using (bucket_id = 'ads' and public.is_admin());
drop policy if exists "admin list ads" on storage.objects;
create policy "admin list ads" on storage.objects for select to authenticated
  using (bucket_id = 'ads' and public.is_admin());
