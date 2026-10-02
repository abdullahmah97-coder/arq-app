-- =====================================================================
-- التسجيل كشريك:
--   * اختيار «نادي رياضي» (أو أي نوع شريك) وقت التسجيل ما يغيّر نوع الحساب: يبقى متدرب لين يوافق المالك.
--     اختياره ينحفظ في partner_intent (عشان يطلع له «كمّل انضمامك»)، والمالك يجيه تنبيه.
--     نوع الحساب يتغيّر بس من المالك أو قرار المراجعة (الاعتماد).
--   * طلب انضمام النادي: رقم السجل التجاري (١٠ أرقام) وصورته، ورقم رخصة النادي وصورتها — كلها إجبارية.
--     الصور في مجلد خاص (partner_docs): صاحبها والمالك بس يشوفونها.
-- =====================================================================

alter table public.profiles add column if not exists partner_intent text
  check (partner_intent is null or partner_intent in ('club', 'store', 'coach', 'center', 'venue'));

-- اللي اختار نوع شريك بنفسه وما عنده أي شي معتمد أو مقدّم: يرجع متدرب ويبقى اختياره
update public.profiles p
   set partner_intent = case p.account_type when 'restaurant' then 'store' else p.account_type end, account_type = 'trainee'
 where p.account_type <> 'trainee'
   and not exists (select 1 from public.club_requests r where r.user_id = p.id and r.status = 'approved')
   and not exists (select 1 from public.chain_managers m where m.user_id = p.id)
   and not exists (select 1 from public.gym_managers m where m.user_id = p.id)
   and not exists (select 1 from public.brands b where b.owner = p.id)
   and not exists (select 1 from public.coach_profiles c where c.user_id = p.id)
   and not exists (select 1 from public.recovery_centers c where c.owner = p.id)
   and not exists (select 1 from public.venues v where v.owner = p.id);

create or replace function public._account_type_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_kind text; v_ar text; v_en text;
begin
  -- المالك وقرارات المراجعة والخادم: يغيّرون بحرية
  if auth.uid() is null or is_admin() then
    if new.account_type <> 'trainee' and new.account_type is distinct from old.account_type then new.partner_intent := null; end if;
    return new;
  end if;
  -- الشخص نفسه يختار «متدرب»: يمسح أي اختيار شريك
  if new.account_type = 'trainee' then new.partner_intent := null; return new; end if;
  if new.account_type is not distinct from old.account_type then return new; end if;
  -- اختار نوع شريك: نوع حسابه يبقى، ونحفظ اختياره وننبّه المالك (مرة لكل اختيار)
  v_kind := case new.account_type when 'restaurant' then 'store' else new.account_type end;
  new.account_type := old.account_type;
  if old.partner_intent is distinct from v_kind then
    new.partner_intent := v_kind;
    v_ar := case v_kind when 'club' then 'نادي رياضي' when 'store' then 'متجر أو مطعم' when 'coach' then 'مدرب'
                        when 'center' then 'مركز استشفاء' else 'ملعب أو استوديو' end;
    v_en := case v_kind when 'club' then 'gym' when 'store' then 'store or restaurant' when 'coach' then 'coach'
                        when 'center' then 'recovery center' else 'venue or studio' end;
    perform _notify_admins('acct:' || new.id || ':' || v_kind,
      'حساب يبي يصير شريك',
      _person_label(new.id) || ' اختار «' || v_ar || '». ما يصير شريك إلا بعد ما يرسل بياناته وتوافق عليه.',
      'Partner sign-up',
      _person_label(new.id) || ' chose “' || v_en || '”. They only become a partner after sending their details and your approval.',
      new.id);
  end if;
  return new;
end $$;
revoke all on function public._account_type_guard() from public, anon, authenticated;
drop trigger if exists account_type_guard on public.profiles;
create trigger account_type_guard before update of account_type on public.profiles
  for each row execute function public._account_type_guard();

-- ---------- طلب النادي: السجل التجاري والرخصة وصورهم ----------
alter table public.club_requests
  add column if not exists license_number   text check (license_number is null or char_length(btrim(license_number)) between 3 and 40),
  add column if not exists cr_doc_path      text check (cr_doc_path is null or char_length(cr_doc_path) <= 300),
  add column if not exists license_doc_path text check (license_doc_path is null or char_length(license_doc_path) <= 300);

insert into storage.buckets (id, name, public) values ('partner_docs', 'partner_docs', false) on conflict (id) do nothing;
drop policy if exists "partner docs upload own" on storage.objects;
create policy "partner docs upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'partner_docs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "partner docs read" on storage.objects;
create policy "partner docs read" on storage.objects for select to authenticated
  using (bucket_id = 'partner_docs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
-- حذف حساب من الإدارة يشمل صور المستندات
drop policy if exists "admin list files of deleted user" on storage.objects;
create policy "admin list files of deleted user" on storage.objects for select to authenticated
  using (bucket_id in ('avatars', 'posts', 'body', 'inbody', 'feedback', 'chat', 'partner_docs') and _admin_deleting((storage.foldername(name))[1]));
drop policy if exists "admin delete files of deleted user" on storage.objects;
create policy "admin delete files of deleted user" on storage.objects for delete to authenticated
  using (bucket_id in ('avatars', 'posts', 'body', 'inbody', 'feedback', 'chat', 'partner_docs') and _admin_deleting((storage.foldername(name))[1]));

drop function if exists public.request_club_partner(uuid, uuid, text, text, text, text, text, text, integer, text);
create or replace function public.request_club_partner(
  p_chain uuid, p_gym uuid, p_name text, p_role text, p_cr text, p_phone text,
  p_email text default null, p_city text default null, p_branches integer default null, p_note text default null,
  p_license text default null, p_cr_doc text default null, p_license_doc text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_cr text := regexp_replace(coalesce(p_cr, ''), '[^0-9]', '', 'g');
  v_license text := nullif(btrim(coalesce(p_license, '')), '');
  v_dir text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  v_dir := auth.uid()::text || '/';
  -- السجل التجاري (١٠ أرقام) ورخصة النادي، وصورة كل واحد مرفوعة في مجلده: إجباري (النسخ القديمة من التطبيق ما ترسلها)
  if v_cr !~ '^[0-9]{10}$' or v_license is null or char_length(v_license) not between 3 and 40
     or p_cr_doc is null or p_license_doc is null or p_cr_doc = p_license_doc
     or left(p_cr_doc, length(v_dir)) <> v_dir or left(p_license_doc, length(v_dir)) <> v_dir
     or not exists (select 1 from storage.objects o where o.bucket_id = 'partner_docs' and o.name = p_cr_doc)
     or not exists (select 1 from storage.objects o where o.bucket_id = 'partner_docs' and o.name = p_license_doc) then
    raise exception 'docs_required';
  end if;
  if exists (select 1 from club_requests where user_id = auth.uid() and status = 'pending') then raise exception 'request_pending'; end if;
  if (select count(*) from club_requests where user_id = auth.uid() and created_at > now() - interval '1 day') >= 3 then
    raise exception 'rate_limited';
  end if;
  if p_chain is not null and exists (select 1 from chain_managers where chain_id = p_chain and user_id = auth.uid()) then
    raise exception 'already_linked';
  end if;
  if v_phone like '05%' then v_phone := '966' || substr(v_phone, 2); end if;
  insert into club_requests (user_id, chain_id, gym_id, club_name, role, cr_number, phone, email, city, branches, note,
                             license_number, cr_doc_path, license_doc_path)
  values (auth.uid(), p_chain, p_gym, btrim(p_name), p_role, v_cr, v_phone,
          nullif(btrim(coalesce(p_email, '')), ''), nullif(btrim(coalesce(p_city, '')), ''), p_branches, nullif(left(btrim(coalesce(p_note, '')), 400), ''),
          v_license, p_cr_doc, p_license_doc)
  returning id into v_id;
  perform _notify_admins('clq:' || v_id, 'نادي يطلب ينضم كشريك',
    btrim(p_name) || ': ' || _person_label(auth.uid()) || ' أرسل طلب انضمام مع السجل التجاري ورخصة النادي. راجعه من لوحة إدارة التطبيق.',
    'Club partner request',
    btrim(p_name) || ': ' || _person_label(auth.uid()) || ' sent a partner request with the commercial registration and club license. Review it in App management.', v_id);
  return v_id;
end $$;
revoke all on function public.request_club_partner(uuid, uuid, text, text, text, text, text, text, integer, text, text, text, text) from public, anon;
grant execute on function public.request_club_partner(uuid, uuid, text, text, text, text, text, text, integer, text, text, text, text) to authenticated;

-- طابور طلبات الأندية للمالك (مع الرخصة والمستندات)
drop function if exists public.club_request_queue();
create or replace function public.club_request_queue()
returns table (id uuid, user_id uuid, username text, full_name text, club_name text, chain_id uuid, chain_name text, gym_id uuid, gym_name text,
               role text, cr_number text, phone text, email text, city text, branches smallint, note text, created_at timestamptz,
               license_number text, cr_doc_path text, license_doc_path text)
language sql stable security definer set search_path = public as $$
  select r.id, r.user_id, p.username, p.full_name, r.club_name, r.chain_id, c.name, r.gym_id, coalesce(g.name, g.name_en),
         r.role, r.cr_number, r.phone, r.email, r.city, r.branches, r.note, r.created_at,
         r.license_number, r.cr_doc_path, r.license_doc_path
  from club_requests r join profiles p on p.id = r.user_id
  left join gym_chains c on c.id = r.chain_id left join gyms g on g.id = r.gym_id
  where is_admin() and r.status = 'pending'
  order by r.created_at
  limit 100;
$$;
revoke all on function public.club_request_queue() from public, anon;
grant execute on function public.club_request_queue() to authenticated;

-- قائمة المستخدمين للمالك: ومعها اللي اختار يصير شريك وما اعتمد (partner_intent)
drop function if exists public.admin_user_list(text, text, integer, integer);
create or replace function public.admin_user_list(p_search text default null, p_kind text default 'trainee',
                                                  p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, email text, username text, full_name text, avatar_url text, account_type text, gender text,
               created_at timestamptz, last_sign_in_at timestamptz, email_confirmed boolean, points integer,
               gym_name text, gym_name_en text, is_admin boolean, total bigint, partner_intent text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_q text := nullif(trim(coalesce(p_search, '')), '');
  v_like text;
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  if p_kind not in ('trainee', 'partner', 'all') then p_kind := 'trainee'; end if;
  if v_q is not null then
    v_like := '%' || replace(replace(replace(left(v_q, 80), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  return query
  select p.id, u.email::text, p.username, p.full_name, p.avatar_url, p.account_type, hp.gender,
         p.created_at, u.last_sign_in_at, (u.email_confirmed_at is not null), p.points,
         g.name, g.name_en,
         exists (select 1 from app_admins a where a.user_id = p.id),
         count(*) over (),
         p.partner_intent
  from profiles p
  join auth.users u on u.id = p.id
  left join health_profiles hp on hp.user_id = p.id
  left join gyms g on g.id = p.gym_id
  where (p_kind = 'all' or (p_kind = 'trainee') = (p.account_type = 'trainee'))
    and (v_like is null or u.email ilike v_like or p.username ilike v_like or coalesce(p.full_name, '') ilike v_like)
  order by p.created_at desc, p.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end $$;
revoke all on function public.admin_user_list(text, text, integer, integer) from public, anon;
grant execute on function public.admin_user_list(text, text, integer, integer) to authenticated;
