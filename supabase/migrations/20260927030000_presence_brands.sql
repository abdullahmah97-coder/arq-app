-- =====================================================================
-- ١) الموجودين في النادي (مثل Swarm): من سجّل حضور الآن/اليوم + لايك وتعليق على الحضور
--    الخصوصية: تشوف الموجودين فقط إذا كنت أنت حاضراً في نفس النادي، أو إذا كانوا أصدقاءك.
--    كل مستخدم يختار: gym (الافتراضي) | friends (الأصدقاء فقط) | hidden (وضع خفي)
-- ٢) «أضف متجرك»: أي براند رياضي يسجل متجره ومنتجاته (بعد موافقة الإدارة)
-- =====================================================================

alter table public.profiles
  add column if not exists presence_visibility text not null default 'gym'
  check (presence_visibility in ('gym','friends','hidden'));
grant update (presence_visibility) on public.profiles to authenticated;

-- هل المستخدم الحالي حاضر الآن في هذا النادي؟
create or replace function public.present_at(p_gym uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from check_ins c
                 where c.user_id = auth.uid() and c.gym_id = p_gym
                   and c.checked_out_at is null and c.checked_in_at > now() - interval '6 hours');
$$;

-- هل يحق للمستخدم الحالي رؤية هذا الحضور (وبالتالي الإعجاب والتعليق عليه)؟
create or replace function public.can_see_checkin(p_check_in uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from check_ins c join profiles p on p.id = c.user_id
    where c.id = p_check_in and (
      c.user_id = auth.uid()
      or (p.presence_visibility <> 'hidden' and (
            are_friends(c.user_id, auth.uid())
            or (p.presence_visibility = 'gym' and c.checked_in_at > now() - interval '16 hours' and present_at(c.gym_id))
      ))
    ));
$$;

create table public.checkin_likes (
  check_in_id uuid not null references public.check_ins(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (check_in_id, user_id)
);
create table public.checkin_comments (
  id          uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.check_ins(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 300),
  created_at  timestamptz not null default now()
);
create index on public.checkin_comments (check_in_id, created_at);

alter table public.checkin_likes enable row level security;
alter table public.checkin_comments enable row level security;
create policy cilikes_read on public.checkin_likes for select to authenticated using (can_see_checkin(check_in_id));
create policy cilikes_insert on public.checkin_likes for insert to authenticated
  with check (user_id = auth.uid() and can_see_checkin(check_in_id));
create policy cilikes_delete on public.checkin_likes for delete to authenticated using (user_id = auth.uid());
create policy cicomments_read on public.checkin_comments for select to authenticated using (can_see_checkin(check_in_id));
create policy cicomments_insert on public.checkin_comments for insert to authenticated
  with check (user_id = auth.uid() and can_see_checkin(check_in_id));
create policy cicomments_delete on public.checkin_comments for delete to authenticated
  using (user_id = auth.uid() or exists (select 1 from check_ins c where c.id = check_in_id and c.user_id = auth.uid()));

-- قائمة الموجودين في النادي (الآن أولاً ثم من حضر اليوم)
create or replace function public.gym_presence(p_gym uuid)
returns table (check_in_id uuid, user_id uuid, username text, full_name text, avatar_url text,
               points integer, is_coach boolean, checked_in_at timestamptz, checked_out_at timestamptz,
               is_friend boolean, is_me boolean, likes bigint, comments bigint, liked_by_me boolean)
language sql stable security definer set search_path = public as $$
  select * from (
    select distinct on (c.user_id)
           c.id, p.id, p.username, p.full_name, p.avatar_url, p.points, p.is_coach, c.checked_in_at, c.checked_out_at,
           are_friends(p.id, auth.uid()), p.id = auth.uid(),
           (select count(*) from checkin_likes l where l.check_in_id = c.id),
           (select count(*) from checkin_comments m where m.check_in_id = c.id),
           exists (select 1 from checkin_likes l where l.check_in_id = c.id and l.user_id = auth.uid())
    from check_ins c join profiles p on p.id = c.user_id
    where c.gym_id = p_gym and c.checked_in_at > now() - interval '16 hours'
      and (c.checked_out_at is not null or c.checked_in_at > now() - interval '6 hours')
      and can_see_checkin(c.id)
    order by c.user_id, c.checked_in_at desc
  ) x
  order by (x.checked_out_at is null) desc, x.checked_in_at desc
  limit 60;
$$;

-- عدد الحاضرين الآن (رقم فقط بدون هويات — يشمل من اختار الوضع الخفي)
create or replace function public.gym_present_count(p_gym uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(distinct user_id)::int from check_ins
  where gym_id = p_gym and checked_out_at is null and checked_in_at > now() - interval '6 hours';
$$;

revoke all on function public.present_at(uuid), public.can_see_checkin(uuid), public.gym_presence(uuid), public.gym_present_count(uuid) from public, anon;
grant execute on function public.present_at(uuid), public.can_see_checkin(uuid), public.gym_presence(uuid), public.gym_present_count(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- «أضف متجرك»: متاجر البراندات الرياضية ومنتجاتها
-- ---------------------------------------------------------------------
create table public.brands (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null unique references public.profiles(id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 2 and 60),
  tagline      text check (char_length(tagline) <= 120),
  description  text check (char_length(description) <= 600),
  category     text not null default 'apparel' check (category in ('apparel','supplements','equipment','accessories','nutrition','other')),
  logo_path    text,
  website      text check (website is null or website ~* '^https://[^\s]+$'),
  instagram    text check (instagram is null or instagram ~ '^[A-Za-z0-9_.]{1,30}$'),
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note  text,
  created_at   timestamptz not null default now()
);

create table public.brand_products (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.brands(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 2 and 80),
  description text check (char_length(description) <= 300),
  price_sar   numeric(8,2) check (price_sar is null or price_sar between 0 and 100000),
  image_path  text,
  url         text check (url is null or url ~* '^https://[^\s]+$'),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index on public.brand_products (brand_id, created_at desc);

-- صاحب المتجر لا يغيّر حالة المراجعة ولا ملاحظتها (الإدارة فقط من لوحة Supabase)
create or replace function public._brand_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated','anon') then
    if tg_op = 'INSERT' then
      new.status := 'pending'; new.review_note := null;
    elsif new.status is distinct from old.status or new.review_note is distinct from old.review_note then
      raise exception 'status_locked';
    end if;
  end if;
  return new;
end $$;
create trigger brands_guard before insert or update on public.brands for each row execute function public._brand_guard();

-- حد أعلى ٦٠ منتج لكل متجر
create or replace function public._product_limit()
returns trigger language plpgsql as $$
begin
  if (select count(*) from brand_products where brand_id = new.brand_id) >= 60 then raise exception 'too_many_products'; end if;
  return new;
end $$;
create trigger products_limit before insert on public.brand_products for each row execute function public._product_limit();

create or replace function public.owns_brand(p_brand uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from brands b where b.id = p_brand and b.owner = auth.uid());
$$;
create or replace function public.brand_live(p_brand uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from brands b where b.id = p_brand and b.status = 'approved');
$$;
revoke all on function public.owns_brand(uuid), public.brand_live(uuid) from public, anon;
grant execute on function public.owns_brand(uuid), public.brand_live(uuid) to authenticated;

alter table public.brands enable row level security;
alter table public.brand_products enable row level security;
create policy brands_read   on public.brands for select to authenticated using (status = 'approved' or owner = auth.uid());
create policy brands_insert on public.brands for insert to authenticated with check (owner = auth.uid());
create policy brands_update on public.brands for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy brands_delete on public.brands for delete to authenticated using (owner = auth.uid());
create policy products_read on public.brand_products for select to authenticated
  using ((active and brand_live(brand_id)) or owns_brand(brand_id));
create policy products_write on public.brand_products for all to authenticated
  using (owns_brand(brand_id)) with check (owns_brand(brand_id));

insert into storage.buckets (id, name, public) values ('brands', 'brands', true) on conflict (id) do nothing;
create policy "own folder write brands" on storage.objects for insert to authenticated
  with check (bucket_id = 'brands' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own folder update brands" on storage.objects for update to authenticated
  using (bucket_id = 'brands' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own folder delete brands" on storage.objects for delete to authenticated
  using (bucket_id = 'brands' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own folder list brands" on storage.objects for select to authenticated
  using (bucket_id = 'brands' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- ٣) أفضل رقم بين الأصدقاء لكل تمرين (أثناء التسجيل): أعلى ٣ + رقمي
--    الترتيب بالقوة التقديرية (Epley): الوزن × (1 + min(العدّات,12)/30) مثل التطبيق؛ تمارين وزن الجسم بالعدّات.
--    الأرقام تظهر للأصدقاء المقبولين فقط — سجل المجموعات نفسه يبقى خاصاً.
-- ---------------------------------------------------------------------
create or replace function public.friends_best(p_exercises text[])
returns table (exercise_id text, user_id uuid, username text, full_name text, avatar_url text,
               weight_kg numeric, reps smallint, done_at timestamptz, is_me boolean, place integer)
language sql stable security definer set search_path = public as $$
  with pool as (
    select auth.uid() as id
    union
    select case when f.requester = auth.uid() then f.addressee else f.requester end
    from friendships f where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee)
  ), best as (
    select distinct on (s.exercise_id, s.user_id)
           s.exercise_id, s.user_id, s.weight_kg, s.reps, s.done_at,
           case when s.weight_kg > 0 then s.weight_kg * (1 + least(s.reps, 12) / 30.0) else s.reps / 1000.0 end as score
    from workout_sets s join pool on pool.id = s.user_id
    where s.exercise_id = any(p_exercises[1:30]) and s.reps between 1 and 50
    order by s.exercise_id, s.user_id, score desc, s.done_at
  ), ranked as (
    select b.*, row_number() over (partition by b.exercise_id order by b.score desc, b.done_at)::int as place from best b
  )
  select r.exercise_id, r.user_id, p.username, p.full_name, p.avatar_url, r.weight_kg, r.reps, r.done_at,
         r.user_id = auth.uid(), r.place
  from ranked r join profiles p on p.id = r.user_id
  where r.place <= 3 or r.user_id = auth.uid()
  order by r.exercise_id, r.place;
$$;
revoke all on function public.friends_best(text[]) from public, anon;
grant execute on function public.friends_best(text[]) to authenticated;
