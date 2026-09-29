-- =====================================================================
-- لوحة تحكم المالك بالشركاء (أندية، متاجر ومطاعم، مدربين، مراكز استشفاء)
--   * نوع الحساب يتحدد أول التسجيل (متدرب أو شريك)
--   * الأندية تطلب الانضمام من داخل التطبيق، والمالك يعتمد ويربطها بسلسلتها أو يرفض بسبب
--   * لكل فئة: قائمة كاملة للمالك، واعتماد/رفض/إخفاء/إظهار/حذف، وربط الصفحة بحساب صاحبها، وإضافة صفحات من الإدارة
--   * كل إجراء للمالك ينحفظ في سجل
--   الشريك ما يظهر للناس إلا بعد موافقة المالك
-- =====================================================================

-- ---------- نوع الحساب ----------
alter table public.profiles add column if not exists account_type text not null default 'trainee'
  check (account_type in ('trainee','club','coach','store','restaurant','center'));
grant update (account_type) on public.profiles to authenticated;

-- ---------- سجل إجراءات المالك ----------
create table if not exists public.admin_log (
  id         bigint generated always as identity primary key,
  admin_id   uuid references public.profiles(id) on delete set null,
  kind       text not null,
  target     text not null,
  action     text not null,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.admin_log enable row level security;
create policy admin_log_read on public.admin_log for select to authenticated using (is_admin());
revoke insert, update, delete on public.admin_log from authenticated, anon;

create or replace function public._admin_log(p_kind text, p_target text, p_action text, p_note text default null)
returns void language sql security definer set search_path = public as $$
  insert into admin_log (admin_id, kind, target, action, note) values (auth.uid(), p_kind, p_target, p_action, left(p_note, 300));
$$;
revoke all on function public._admin_log(text, text, text, text) from public, anon, authenticated;

create or replace function public._notify_admins(p_key text, p_title_ar text, p_body_ar text, p_title_en text, p_body_en text, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_a uuid;
begin
  for v_a in select user_id from app_admins loop
    perform _notice(v_a, p_key || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
      p_title_ar, p_body_ar, p_title_en, p_body_en, '/owner', p_target);
  end loop;
end $$;
revoke all on function public._notify_admins(text, text, text, text, text, uuid) from public, anon, authenticated;

create or replace function public._user_by_username(p_username text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from profiles where lower(username) = lower(btrim(coalesce(p_username, ''), ' @'));
$$;
revoke all on function public._user_by_username(text) from public, anon, authenticated;

-- ---------- الأندية الشريكة ----------
alter table public.gym_chains
  add column if not exists partner       boolean not null default false,
  add column if not exists partner_since timestamptz;

create table if not exists public.club_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  chain_id    uuid references public.gym_chains(id) on delete set null,
  gym_id      uuid references public.gyms(id) on delete set null,
  club_name   text not null check (char_length(btrim(club_name)) between 2 and 80),
  role        text not null check (role in ('owner','manager','marketing','other')),
  cr_number   text check (cr_number is null or cr_number ~ '^[0-9]{7,15}$'),
  phone       text not null check (phone ~ '^[0-9]{8,15}$'),
  email       text check (email is null or (char_length(email) <= 120 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  city        text check (char_length(city) <= 40),
  branches    smallint check (branches between 1 and 500),
  note        text check (char_length(note) <= 400),
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note text check (char_length(review_note) <= 300),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index if not exists club_requests_open on public.club_requests (user_id) where status = 'pending';
create index if not exists club_requests_status on public.club_requests (status, created_at);
alter table public.club_requests enable row level security;
create policy clr_read on public.club_requests for select to authenticated using (user_id = auth.uid() or is_admin());
revoke insert, update, delete on public.club_requests from authenticated, anon;

-- طلب انضمام نادي كشريك (من داخل التطبيق)
create or replace function public.request_club_partner(
  p_chain uuid, p_gym uuid, p_name text, p_role text, p_cr text, p_phone text,
  p_email text default null, p_city text default null, p_branches integer default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if exists (select 1 from club_requests where user_id = auth.uid() and status = 'pending') then raise exception 'request_pending'; end if;
  if (select count(*) from club_requests where user_id = auth.uid() and created_at > now() - interval '1 day') >= 3 then
    raise exception 'rate_limited';
  end if;
  if p_chain is not null and exists (select 1 from chain_managers where chain_id = p_chain and user_id = auth.uid()) then
    raise exception 'already_linked';
  end if;
  if v_phone like '05%' then v_phone := '966' || substr(v_phone, 2); end if;
  insert into club_requests (user_id, chain_id, gym_id, club_name, role, cr_number, phone, email, city, branches, note)
  values (auth.uid(), p_chain, p_gym, btrim(p_name), p_role, nullif(regexp_replace(coalesce(p_cr, ''), '[^0-9]', '', 'g'), ''), v_phone,
          nullif(btrim(coalesce(p_email, '')), ''), nullif(btrim(coalesce(p_city, '')), ''), p_branches, nullif(left(btrim(coalesce(p_note, '')), 400), ''))
  returning id into v_id;
  perform _notify_admins('clq:' || v_id, 'نادي يطلب ينضم كشريك', btrim(p_name) || ': ' || _person_label(auth.uid()) || ' طلب ينضم لأرك كشريك. راجعه من لوحة المالك.',
    'Club partner request', btrim(p_name) || ': ' || _person_label(auth.uid()) || ' asked to join ARQ as a partner. Review it in the owner panel.', v_id);
  return v_id;
end $$;
revoke all on function public.request_club_partner(uuid, uuid, text, text, text, text, text, text, integer, text) from public, anon;
grant execute on function public.request_club_partner(uuid, uuid, text, text, text, text, text, text, integer, text) to authenticated;

-- طابور طلبات الأندية للمالك
create or replace function public.club_request_queue()
returns table (id uuid, user_id uuid, username text, full_name text, club_name text, chain_id uuid, chain_name text, gym_id uuid, gym_name text,
               role text, cr_number text, phone text, email text, city text, branches smallint, note text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.user_id, p.username, p.full_name, r.club_name, r.chain_id, c.name, r.gym_id, coalesce(g.name, g.name_en),
         r.role, r.cr_number, r.phone, r.email, r.city, r.branches, r.note, r.created_at
  from club_requests r join profiles p on p.id = r.user_id
  left join gym_chains c on c.id = r.chain_id left join gyms g on g.id = r.gym_id
  where is_admin() and r.status = 'pending'
  order by r.created_at
  limit 100;
$$;
revoke all on function public.club_request_queue() from public, anon;
grant execute on function public.club_request_queue() to authenticated;

create or replace function public._new_chain_slug(p_name_en text)
returns text language plpgsql security definer set search_path = public as $$
declare v text := trim(both '-' from regexp_replace(lower(coalesce(p_name_en, '')), '[^a-z0-9]+', '-', 'g'));
begin
  v := left(v, 30);
  if char_length(v) < 2 or exists (select 1 from gym_chains where slug = v) then
    v := 'club-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  end if;
  return v;
end $$;
revoke all on function public._new_chain_slug(text) from public, anon, authenticated;

-- قرار المالك على طلب نادي: الاعتماد يربط صاحب الطلب بالسلسلة (أو ينشئها) ويخليها شريك
create or replace function public.review_club_request(p_id uuid, p_decision text, p_note text default null, p_chain uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r club_requests; v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_chain uuid; v_gym_chain uuid;
        v_key text := 'clr:' || p_id || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'bad_status'; end if;
  select * into r from club_requests where id = p_id for update;
  if r.id is null then raise exception 'request_not_found'; end if;
  if r.status <> 'pending' then raise exception 'bad_status'; end if;
  if p_decision = 'rejected' then
    if v_note is null then raise exception 'note_required'; end if;
    update club_requests set status = 'rejected', review_note = left(v_note, 300), reviewed_at = now(), reviewed_by = auth.uid() where id = p_id;
    perform _notice(r.user_id, v_key, 'طلب ناديك يحتاج تعديل', v_note, 'Your club request needs changes', v_note, '/clubs/join', p_id);
    perform _admin_log('club', p_id::text, 'reject', v_note);
    return null;
  end if;

  v_chain := coalesce(p_chain, r.chain_id);
  if v_chain is null and r.gym_id is not null then
    select chain_id into v_gym_chain from gyms where id = r.gym_id;
    v_chain := v_gym_chain;
  end if;
  if v_chain is null and r.gym_id is not null then
    insert into gym_managers (gym_id, user_id) values (r.gym_id, r.user_id) on conflict do nothing;
  else
    if v_chain is null then
      insert into gym_chains (slug, name, active) values (_new_chain_slug(null), left(btrim(r.club_name), 60), true) returning id into v_chain;
    end if;
    insert into chain_managers (chain_id, user_id) values (v_chain, r.user_id) on conflict do nothing;
    update gym_chains set partner = true, partner_since = coalesce(partner_since, now()), active = true where id = v_chain;
  end if;
  update club_requests set status = 'approved', chain_id = coalesce(v_chain, chain_id), review_note = left(v_note, 300),
         reviewed_at = now(), reviewed_by = auth.uid() where id = p_id;
  update profiles set account_type = 'club' where id = r.user_id and account_type = 'trainee';
  perform _notice(r.user_id, v_key, 'انعتمد ناديك كشريك في أرك ✓', r.club_name || ': لوحة التحكم صارت جاهزة لك في «بوابة الشركاء».',
    'Your club is now an ARQ partner ✓', r.club_name || ': your dashboard is ready in the Partner hub.', '/partners', p_id);
  perform _admin_log('club', p_id::text, 'approve', v_note);
  return v_chain;
end $$;
revoke all on function public.review_club_request(uuid, text, text, uuid) from public, anon;
grant execute on function public.review_club_request(uuid, text, text, uuid) to authenticated;

-- ---------- المتاجر والمطاعم: المالك يضيف صفحات، ويوقف، ويحذف، ويربط الصفحة بصاحبها ----------
alter table public.brands alter column owner drop not null;
alter table public.brands add column if not exists listed_by text not null default 'owner' check (listed_by in ('owner','arq'));
alter table public.brands drop constraint if exists brands_status_check;
alter table public.brands add constraint brands_status_check check (status in ('pending','approved','rejected','suspended'));
create policy brands_admin_insert on public.brands for insert to authenticated with check (is_admin());
create policy brands_admin_delete on public.brands for delete to authenticated using (is_admin());
create policy products_admin_write on public.brand_products for all to authenticated using (is_admin()) with check (is_admin());

-- صاحب المتجر ما يغيّر الحالة ولا الملكية. تعديله بعد الرفض = إعادة إرسال للمراجعة. المالك حر
create or replace function public._brand_guard()
returns trigger language plpgsql as $$
begin
  if current_user not in ('authenticated','anon') then return new; end if;
  if current_user = 'authenticated' and is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.review_note := null; new.listed_by := 'owner';
    return new;
  end if;
  if new.status is distinct from old.status or new.review_note is distinct from old.review_note
     or new.owner is distinct from old.owner or new.listed_by is distinct from old.listed_by then
    raise exception 'status_locked';
  end if;
  if old.status = 'rejected' then new.status := 'pending'; end if;
  return new;
end $$;

-- تنبيه المالك بكل متجر جديد أو معاد إرساله، وتنبيه صاحب المتجر بقرار المالك
create or replace function public._brand_status_notice() returns trigger language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if new.status = 'pending' and new.listed_by = 'owner' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    perform _notify_admins('brq:' || new.id, 'متجر ينتظر اعتمادك', new.name || ' طلب يظهر في المتاجر. راجعه من لوحة المالك.',
      'Store to review', new.name || ' asked to appear in Stores. Review it in the owner panel.', new.id);
  end if;
  if tg_op = 'UPDATE' and new.owner is not null and new.status is distinct from old.status and new.status <> 'pending' then
    k := 'brr:' || new.id || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
    if new.status = 'approved' then
      perform _notice(new.owner, k, 'انعتمد متجرك ✓', new.name || ' صار ظاهر في المتاجر لكل مستخدمي أرك.',
        'Your store is approved ✓', new.name || ' now appears in ARQ Stores.', '/store/manage', new.id);
    elsif new.status = 'rejected' then
      perform _notice(new.owner, k, 'متجرك يحتاج تعديل', coalesce(new.review_note, 'راجع بيانات المتجر وعدّلها، ويرجع للمراجعة.'),
        'Your store needs changes', coalesce(new.review_note, 'Review your store details; editing sends it back for review.'), '/store/join', new.id);
    else
      perform _notice(new.owner, k, 'انوقف ظهور متجرك', coalesce(new.review_note, 'متجرك ما يظهر للناس حالياً. تواصل مع إدارة أرك.'),
        'Your store is hidden', coalesce(new.review_note, 'Your store is hidden for now. Contact the ARQ team.'), '/store/manage', new.id);
    end if;
  end if;
  return null;
end $$;
revoke all on function public._brand_status_notice() from public, anon, authenticated;
drop trigger if exists brands_status_notice on public.brands;
create trigger brands_status_notice after insert or update on public.brands for each row execute function public._brand_status_notice();

-- اشتراك الوجبات يحتاج صاحب للمطعم (صفحة أضافها أرك بدون صاحب ما تستقبل اشتراكات)
create or replace function public.request_meal_subscription(p_brand uuid, p_slots text[], p_notes text, p_consent boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_b brands; v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not coalesce(p_consent, false) then raise exception 'consent_required'; end if;
  select * into v_b from brands where id = p_brand;
  if v_b.id is null or v_b.status <> 'approved' or v_b.category <> 'restaurant' or v_b.owner is null then raise exception 'brand_not_approved'; end if;
  if v_b.owner = auth.uid() then raise exception 'not_allowed'; end if;
  if exists (select 1 from meal_subscriptions where user_id = auth.uid() and brand_id = p_brand and status in ('requested','active')) then
    raise exception 'request_pending';
  end if;
  if (select count(*) from meal_subscriptions where user_id = auth.uid() and created_at > now() - interval '1 day') >= 5 then
    raise exception 'rate_limited';
  end if;
  insert into meal_subscriptions (user_id, brand_id, slots, notes)
  values (auth.uid(), p_brand, coalesce(p_slots, '{lunch,dinner}'), nullif(left(btrim(coalesce(p_notes, '')), 300), ''))
  returning id into v_id;
  perform _notice(v_b.owner, 'ms:' || v_id, 'طلب اشتراك وجبات جديد', _person_label(auth.uid()) || ' يبي يشترك في وجباتكم وشارككم أهدافه الغذائية.',
    'New meal subscription request', _person_label(auth.uid()) || ' wants to subscribe to your meals and shared their nutrition targets.', '/store/manage', v_id);
  return v_id;
end $$;

-- ---------- مراكز الاستشفاء: إيقاف مؤقت ----------
alter table public.recovery_centers drop constraint if exists recovery_centers_status_check;
alter table public.recovery_centers add constraint recovery_centers_status_check check (status in ('pending','approved','rejected','suspended'));

create or replace function public.review_center(p_id uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_c recovery_centers; v_note text := nullif(btrim(coalesce(p_note, '')), '');
        v_key text := 'rcr:' || p_id || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  if p_decision not in ('approved','rejected','suspended') then raise exception 'bad_status'; end if;
  if p_decision = 'rejected' and v_note is null and exists (select 1 from recovery_centers where id = p_id and listed_by = 'owner') then
    raise exception 'consent_required';
  end if;
  update recovery_centers set status = p_decision, review_note = left(v_note, 300) where id = p_id returning * into v_c;
  if v_c.id is null then raise exception 'request_not_found'; end if;
  if v_c.owner is not null then
    if p_decision = 'approved' then
      perform _notice(v_c.owner, v_key, 'انعتمد مركزك ✓', v_c.name || ' صار ظاهر في دليل الاستشفاء لكل مستخدمي أرك.',
        'Your center is approved ✓', coalesce(v_c.name_en, v_c.name) || ' now appears in the ARQ recovery directory.', '/recovery/centers', p_id);
    elsif p_decision = 'rejected' then
      perform _notice(v_c.owner, v_key, 'طلب مركزك يحتاج تعديل', coalesce(v_note, 'راجع بيانات المركز وأرسله مرة ثانية.'),
        'Your center needs changes', coalesce(v_note, 'Review your center details and submit again.'), '/recovery/join', p_id);
    else
      perform _notice(v_c.owner, v_key, 'انوقف ظهور مركزك', coalesce(v_note, 'مركزك ما يظهر في الدليل حالياً. تواصل مع إدارة أرك.'),
        'Your center is hidden', coalesce(v_note, 'Your center is hidden for now. Contact the ARQ team.'), '/recovery/join', p_id);
    end if;
  end if;
end $$;
revoke all on function public.review_center(uuid, text, text) from public, anon;
grant execute on function public.review_center(uuid, text, text) to authenticated;

-- ---------- المدربين: المالك يعدّل ويحذف ويضيف ----------
create policy cp_admin_update on public.coach_profiles for update to authenticated using (is_admin()) with check (is_admin());
create policy cp_admin_delete on public.coach_profiles for delete to authenticated using (is_admin());

-- ---------- إضافة سلسلة نوادي من الإدارة ----------
create or replace function public.admin_create_chain(p_name text, p_name_en text, p_audience text, p_website text, p_instagram text,
                                                     p_description text, p_logo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  insert into gym_chains (slug, name, name_en, audience, website, instagram, description, logo_path)
  values (_new_chain_slug(p_name_en), btrim(p_name), nullif(btrim(coalesce(p_name_en, '')), ''), coalesce(p_audience, 'mixed'),
          nullif(btrim(coalesce(p_website, '')), ''), nullif(btrim(coalesce(p_instagram, '')), ''), nullif(btrim(coalesce(p_description, '')), ''), p_logo)
  returning id into v_id;
  perform _admin_log('club', v_id::text, 'create', p_name);
  return v_id;
end $$;
revoke all on function public.admin_create_chain(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.admin_create_chain(text, text, text, text, text, text, text) to authenticated;

-- ---------- قائمة الشركاء للمالك (كل الحالات) ----------
create or replace function public.admin_partner_list(p_kind text, p_q text default null)
returns table (id uuid, name text, subtitle text, status text, logo_path text, avatar_url text, owner_id uuid, owner_username text,
               listed_by text, partner boolean, meta jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_q text := nullif(lower(btrim(coalesce(p_q, ''))), '');
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  if p_kind = 'club' then
    return query
      select c.id, c.name, coalesce(c.name_en, ''),
             case when not c.active then 'suspended' when c.partner then 'approved' else 'listed' end,
             c.logo_path, null::text, null::uuid,
             (select string_agg(p.username, '، ' order by p.username) from chain_managers m join profiles p on p.id = m.user_id where m.chain_id = c.id),
             case when c.partner then 'owner' else 'arq' end, c.partner,
             jsonb_build_object('audience', c.audience,
               'branches', (select count(*) from gyms g where g.chain_id = c.id),
               'managers', (select count(*) from chain_managers m where m.chain_id = c.id),
               'offers', (select count(*) from gym_offers o where o.chain_id = c.id and o.active)),
             c.created_at
      from gym_chains c
      where v_q is null or lower(c.name) like '%' || v_q || '%' or lower(coalesce(c.name_en, '')) like '%' || v_q || '%'
      order by c.partner desc, c.name
      limit 500;
  elsif p_kind = 'store' then
    return query
      select b.id, b.name, coalesce(b.tagline, ''), b.status, b.logo_path, null::text, b.owner, p.username, b.listed_by,
             b.listed_by = 'owner' and b.status = 'approved',
             jsonb_build_object('category', b.category, 'city', b.city, 'products', (select count(*) from brand_products x where x.brand_id = b.id)),
             b.created_at
      from brands b left join profiles p on p.id = b.owner
      where v_q is null or lower(b.name) like '%' || v_q || '%' or lower(coalesce(p.username, '')) like '%' || v_q || '%'
      order by (b.status = 'pending') desc, b.created_at desc
      limit 500;
  elsif p_kind = 'coach' then
    return query
      select c.user_id, coalesce(nullif(p.full_name, ''), p.username), coalesce(c.headline, ''), c.status, null::text, p.avatar_url,
             c.user_id, p.username, 'owner'::text, c.status = 'approved',
             jsonb_build_object('city', c.city, 'specialties', c.specialties,
               'clients', (select count(*) from coach_links l where l.coach_id = c.user_id and l.status = 'active')),
             c.created_at
      from coach_profiles c join profiles p on p.id = c.user_id
      where v_q is null or lower(coalesce(p.full_name, '')) like '%' || v_q || '%' or lower(p.username) like '%' || v_q || '%'
      order by (c.status = 'pending') desc, c.submitted_at desc
      limit 500;
  elsif p_kind = 'center' then
    return query
      select r.id, r.name, coalesce(r.name_en, ''), r.status, r.logo_path, null::text, r.owner, p.username, r.listed_by,
             r.listed_by = 'owner' and r.status = 'approved',
             jsonb_build_object('kind', r.kind, 'cities', r.cities, 'license_no', r.license_no),
             r.created_at
      from recovery_centers r left join profiles p on p.id = r.owner
      where v_q is null or lower(r.name) like '%' || v_q || '%' or lower(coalesce(r.name_en, '')) like '%' || v_q || '%'
      order by (r.status = 'pending') desc, (r.listed_by = 'owner') desc, r.created_at desc
      limit 500;
  else
    raise exception 'bad_status';
  end if;
end $$;
revoke all on function public.admin_partner_list(text, text) from public, anon;
grant execute on function public.admin_partner_list(text, text) to authenticated;

-- ---------- ملخص الشركاء للوحة المالك ----------
create or replace function public.partner_overview()
returns table (kind text, pending integer, live integer, partners integer, hidden integer, total integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  return query
    select 'club'::text, (select count(*)::int from club_requests where status = 'pending'),
           (select count(*)::int from gym_chains where active), (select count(*)::int from gym_chains where partner and active),
           (select count(*)::int from gym_chains where not active), (select count(*)::int from gym_chains)
    union all
    select 'store', count(*) filter (where status = 'pending')::int, count(*) filter (where status = 'approved')::int,
           count(*) filter (where status = 'approved' and listed_by = 'owner')::int,
           count(*) filter (where status in ('suspended','rejected'))::int, count(*)::int from brands
    union all
    select 'coach', count(*) filter (where status = 'pending')::int, count(*) filter (where status = 'approved')::int,
           count(*) filter (where status = 'approved')::int, count(*) filter (where status in ('suspended','rejected'))::int, count(*)::int
    from coach_profiles
    union all
    select 'center', count(*) filter (where status = 'pending')::int, count(*) filter (where status = 'approved')::int,
           count(*) filter (where status = 'approved' and listed_by = 'owner')::int,
           count(*) filter (where status in ('suspended','rejected'))::int, count(*)::int from recovery_centers;
end $$;
revoke all on function public.partner_overview() from public, anon;
grant execute on function public.partner_overview() to authenticated;

-- ---------- إجراءات المالك على أي شريك ----------
-- approve / reject / hide / show / delete / partner_on / partner_off
create or replace function public.admin_partner_action(p_kind text, p_id uuid, p_action text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  if p_action not in ('approve','reject','hide','show','delete','partner_on','partner_off') then raise exception 'bad_status'; end if;
  if p_action = 'reject' and v_note is null then raise exception 'note_required'; end if;
  if (p_kind = 'club' and not exists (select 1 from gym_chains where id = p_id))
     or (p_kind = 'store' and not exists (select 1 from brands where id = p_id))
     or (p_kind = 'coach' and not exists (select 1 from coach_profiles where user_id = p_id))
     or (p_kind = 'center' and not exists (select 1 from recovery_centers where id = p_id)) then
    raise exception 'request_not_found';
  end if;

  if p_kind = 'club' then
    if p_action = 'hide' then update gym_chains set active = false where id = p_id;
    elsif p_action = 'show' then update gym_chains set active = true where id = p_id;
    elsif p_action = 'partner_on' then update gym_chains set partner = true, partner_since = coalesce(partner_since, now()) where id = p_id;
    elsif p_action = 'partner_off' then update gym_chains set partner = false where id = p_id;
    elsif p_action = 'delete' then delete from gym_chains where id = p_id;
    else raise exception 'bad_status';
    end if;
  elsif p_kind = 'store' then
    if p_action = 'approve' or p_action = 'show' then update brands set status = 'approved', review_note = null where id = p_id;
    elsif p_action = 'reject' then update brands set status = 'rejected', review_note = left(v_note, 300) where id = p_id;
    elsif p_action = 'hide' then update brands set status = 'suspended', review_note = left(v_note, 300) where id = p_id;
    elsif p_action = 'delete' then delete from brands where id = p_id;
    else raise exception 'bad_status';
    end if;
  elsif p_kind = 'coach' then
    if p_action = 'delete' then
      delete from coach_profiles where user_id = p_id;
      update profiles set is_coach = false where id = p_id;
    elsif p_action in ('approve','show') then perform review_coach(p_id, 'approved', v_note);
    elsif p_action = 'reject' then perform review_coach(p_id, 'rejected', v_note);
    elsif p_action = 'hide' then perform review_coach(p_id, 'suspended', v_note);
    else raise exception 'bad_status';
    end if;
  elsif p_kind = 'center' then
    if p_action = 'delete' then delete from recovery_centers where id = p_id;
    elsif p_action in ('approve','show') then perform review_center(p_id, 'approved', v_note);
    elsif p_action = 'reject' then perform review_center(p_id, 'rejected', v_note);
    elsif p_action = 'hide' then perform review_center(p_id, 'suspended', v_note);
    else raise exception 'bad_status';
    end if;
  else
    raise exception 'bad_status';
  end if;
  perform _admin_log(p_kind, p_id::text, p_action, v_note);
end $$;
revoke all on function public.admin_partner_action(text, uuid, text, text) from public, anon;
grant execute on function public.admin_partner_action(text, uuid, text, text) to authenticated;

-- ربط صفحة شريك بحساب صاحبها (باسم المستخدم): النادي = مدير للسلسلة، المتجر/المركز = يصير صاحبها ويتحول لشريك، المدرب = ملف مدرب معتمد
create or replace function public.admin_assign_partner(p_kind text, p_id uuid, p_username text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid := _user_by_username(p_username); v_name text;
        v_key text := 'asg:' || coalesce(p_id::text, '') || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  if v_user is null then raise exception 'user_not_found'; end if;
  if p_kind = 'club' then
    select name into v_name from gym_chains where id = p_id;
    if v_name is null then raise exception 'request_not_found'; end if;
    insert into chain_managers (chain_id, user_id) values (p_id, v_user) on conflict do nothing;
    update gym_chains set partner = true, partner_since = coalesce(partner_since, now()) where id = p_id;
    update profiles set account_type = 'club' where id = v_user and account_type = 'trainee';
  elsif p_kind = 'store' then
    if exists (select 1 from brands where owner = v_user and id <> p_id) then raise exception 'already_linked'; end if;
    update brands set owner = v_user, listed_by = 'owner' where id = p_id returning name into v_name;
    if v_name is null then raise exception 'request_not_found'; end if;
    update profiles set account_type = case when (select category from brands where id = p_id) = 'restaurant' then 'restaurant' else 'store' end
     where id = v_user and account_type = 'trainee';
  elsif p_kind = 'center' then
    if exists (select 1 from recovery_centers where owner = v_user and id <> p_id) then raise exception 'already_linked'; end if;
    update recovery_centers set owner = v_user, listed_by = 'owner' where id = p_id returning name into v_name;
    if v_name is null then raise exception 'request_not_found'; end if;
    update profiles set account_type = 'center' where id = v_user and account_type = 'trainee';
  elsif p_kind = 'coach' then
    insert into coach_profiles (user_id, status) values (v_user, 'approved') on conflict (user_id) do nothing;
    perform review_coach(v_user, 'approved', null);
    update profiles set account_type = 'coach' where id = v_user and account_type = 'trainee';
    v_name := _person_label(v_user);
  else
    raise exception 'bad_status';
  end if;
  if p_kind <> 'coach' then
    perform _notice(v_user, v_key, 'صرت شريك في أرك ✓', v_name || ': إدارة أرك ربطت الصفحة بحسابك. لوحة التحكم في «بوابة الشركاء».',
      'You''re now an ARQ partner ✓', v_name || ': the ARQ team linked this page to your account. Your dashboard is in the Partner hub.', '/partners', p_id);
  end if;
  perform _admin_log(p_kind, coalesce(p_id, v_user)::text, 'assign', p_username);
  return v_user;
end $$;
revoke all on function public.admin_assign_partner(text, uuid, text) from public, anon;
grant execute on function public.admin_assign_partner(text, uuid, text) to authenticated;

-- مدراء سلسلة (للمالك) وإزالة مدير
create or replace function public.admin_chain_managers(p_chain uuid)
returns table (user_id uuid, username text, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.full_name from chain_managers m join profiles p on p.id = m.user_id
  where is_admin() and m.chain_id = p_chain order by p.username;
$$;
revoke all on function public.admin_chain_managers(uuid) from public, anon;
grant execute on function public.admin_chain_managers(uuid) to authenticated;

create or replace function public.admin_remove_chain_manager(p_chain uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  delete from chain_managers where chain_id = p_chain and user_id = p_user;
  perform _admin_log('club', p_chain::text, 'remove_manager', p_user::text);
end $$;
revoke all on function public.admin_remove_chain_manager(uuid, uuid) from public, anon;
grant execute on function public.admin_remove_chain_manager(uuid, uuid) to authenticated;

-- =====================================================================
-- لوحة تحكم الشريك: الكميات، عروض المتاجر وأكوادها وتقريرها، تنبيهات المتجر لعملائه، وعرض مراكز الاستشفاء
-- =====================================================================

-- ---------- الكميات: فارغ = بدون تتبع، صفر = نفد ----------
alter table public.brand_products add column if not exists stock integer check (stock is null or stock between 0 and 100000);

-- ---------- عروض المتاجر وأكواد الخصم ----------
create table if not exists public.brand_offers (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.brands(id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 3 and 80),
  details     text check (char_length(details) <= 300),
  code        text check (code is null or code ~ '^[A-Za-z0-9_-]{2,30}$'),
  percent     smallint check (percent is null or percent between 1 and 90),
  url         text check (url is null or url ~* '^https://[^\s]+$'),
  ends_on     date,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists brand_offers_brand on public.brand_offers (brand_id, created_at desc);
alter table public.brand_offers enable row level security;
create policy bo_read on public.brand_offers for select to authenticated
  using ((active and brand_live(brand_id) and (ends_on is null or ends_on >= app_today())) or owns_brand(brand_id) or is_admin());
create policy bo_write on public.brand_offers for all to authenticated
  using (owns_brand(brand_id) or is_admin()) with check (owns_brand(brand_id) or is_admin());

-- حد: ١٠ عروض فعالة لكل متجر
create or replace function public._bo_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.active and (select count(*) from brand_offers where brand_id = new.brand_id and active and id <> new.id) >= 10 then
    raise exception 'too_many_rows';
  end if;
  return new;
end $$;
drop trigger if exists bo_limit on public.brand_offers;
create trigger bo_limit before insert or update on public.brand_offers for each row execute function public._bo_limit();

-- أحداث العرض (مشاهدة، كشف الكود، زيارة المتجر): مرة لكل مستخدم لكل نوع لكل يوم، والتقرير أعداد بدون أسماء
create table if not exists public.brand_offer_events (
  offer_id   uuid not null references public.brand_offers(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('view','reveal','visit')),
  day        date not null default app_today(),
  created_at timestamptz not null default now(),
  primary key (offer_id, user_id, kind, day)
);
alter table public.brand_offer_events enable row level security;
revoke insert, update, delete on public.brand_offer_events from authenticated, anon;

create or replace function public.offer_event(p_offer uuid, p_kind text)
returns text language plpgsql security definer set search_path = public as $$
declare o brand_offers;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_kind not in ('view','reveal','visit') then raise exception 'bad_status'; end if;
  select * into o from brand_offers where id = p_offer;
  if o.id is null or not o.active or not brand_live(o.brand_id) or (o.ends_on is not null and o.ends_on < app_today()) then
    raise exception 'code_ended';
  end if;
  if not owns_brand(o.brand_id) then
    insert into brand_offer_events (offer_id, user_id, kind) values (p_offer, auth.uid(), p_kind) on conflict do nothing;
  end if;
  return case when p_kind = 'reveal' then o.code else null end;
end $$;
revoke all on function public.offer_event(uuid, text) from public, anon;
grant execute on function public.offer_event(uuid, text) to authenticated;

create or replace function public.brand_offer_stats(p_brand uuid)
returns table (offer_id uuid, title text, active boolean, views integer, reveals integer, visits integer)
language sql stable security definer set search_path = public as $$
  select o.id, o.title, o.active,
         (select count(distinct e.user_id)::int from brand_offer_events e where e.offer_id = o.id and e.kind = 'view'),
         (select count(distinct e.user_id)::int from brand_offer_events e where e.offer_id = o.id and e.kind = 'reveal'),
         (select count(distinct e.user_id)::int from brand_offer_events e where e.offer_id = o.id and e.kind = 'visit')
  from brand_offers o
  where o.brand_id = p_brand and (owns_brand(p_brand) or is_admin())
  order by o.created_at desc;
$$;
revoke all on function public.brand_offer_stats(uuid) from public, anon;
grant execute on function public.brand_offer_stats(uuid) to authenticated;

-- ---------- قاعدة التنبيهات: الشريك ما يرسل تنبيه إلا لمتدرب مرتبط فيه ----------
--   النادي: أعضاؤه الساريين (ومن اختار النادي ناديه)، المطعم: مشتركين الوجبات، المتجر: اللي اشتركوا في تنبيهاته بأنفسهم،
--   المركز: اللي عندهم موعد معه. غير كذا ما فيه تنبيهات من الشركاء

-- اشتراك المتدرب في تنبيهات متجر (باختياره، ويلغيه متى ما بغى)
create table if not exists public.brand_followers (
  brand_id   uuid not null references public.brands(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (brand_id, user_id)
);
alter table public.brand_followers enable row level security;
create policy bf_read on public.brand_followers for select to authenticated using (user_id = auth.uid() or is_admin());
create policy bf_insert on public.brand_followers for insert to authenticated with check (user_id = auth.uid() and brand_live(brand_id));
create policy bf_delete on public.brand_followers for delete to authenticated using (user_id = auth.uid());

-- عدد المرتبطين بالمتجر (بدون أسماء)
create or replace function public.store_audience(p_brand uuid)
returns table (followers integer, subscribers integer)
language sql stable security definer set search_path = public as $$
  select (select count(*)::int from brand_followers f where f.brand_id = p_brand),
         (select count(*)::int from meal_subscriptions s where s.brand_id = p_brand and s.status = 'active')
  where owns_brand(p_brand) or is_admin();
$$;
revoke all on function public.store_audience(uuid) from public, anon;
grant execute on function public.store_audience(uuid) to authenticated;

create table if not exists public.brand_announcements (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.brands(id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 3 and 60),
  body        text not null check (char_length(btrim(body)) between 3 and 240),
  recipients  integer not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.brand_announcements enable row level security;
create policy ba_read on public.brand_announcements for select to authenticated using (brand_live(brand_id) or owns_brand(brand_id) or is_admin());
revoke insert, update, delete on public.brand_announcements from authenticated, anon;

create or replace function public.send_store_announcement(p_brand uuid, p_title text, p_body text)
returns integer language plpgsql security definer set search_path = public as $$
declare b brands; v_id uuid; v_n integer := 0; u uuid;
begin
  select * into b from brands where id = p_brand;
  if b.id is null or not (b.owner = auth.uid() or is_admin()) then raise exception 'not_allowed'; end if;
  if b.status <> 'approved' then raise exception 'brand_not_approved'; end if;
  if (select count(*) from brand_announcements where brand_id = p_brand and created_at > now() - interval '1 day') >= 1 then
    raise exception 'rate_limited';
  end if;
  insert into brand_announcements (brand_id, title, body) values (p_brand, btrim(p_title), btrim(p_body)) returning id into v_id;
  for u in
    select s.user_id from meal_subscriptions s where s.brand_id = p_brand and s.status = 'active'
    union
    select f.user_id from brand_followers f where f.brand_id = p_brand
    limit 5000
  loop
    if u is distinct from b.owner and _notice(u, 'ban:' || v_id, b.name || ': ' || btrim(p_title), btrim(p_body), b.name || ': ' || btrim(p_title), btrim(p_body),
                   '/store/' || p_brand, v_id, 'promo') then
      v_n := v_n + 1;
    end if;
  end loop;
  update brand_announcements set recipients = v_n where id = v_id;
  return v_n;
end $$;
revoke all on function public.send_store_announcement(uuid, text, text) from public, anon;
grant execute on function public.send_store_announcement(uuid, text, text) to authenticated;

-- عروض النوادي الجديدة: تنبيه لأعضاء النادي الساريين ولمن اختاره ناديه فقط (بدل كل من حضر فيه)
create or replace function public._on_gym_offer()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_gym text; v_data jsonb; v_url text;
begin
  if not new.active or (new.ends_on is not null and new.ends_on < current_date) then return null; end if;
  if new.gym_id is not null then
    select coalesce(nullif(name, ''), name_en) into v_gym from gyms where id = new.gym_id;
    v_url := '/clubs/' || new.gym_id;
  else
    select coalesce(nullif(name, ''), name_en) into v_gym from gym_chains where id = new.chain_id;
    v_url := '/clubs/chain/' || new.chain_id;
  end if;
  v_data := jsonb_build_object('gym', v_gym, 'title', new.title, 'price', trim_scale(new.price_sar)::text,
                               'gym_id', new.gym_id, 'chain_id', new.chain_id);
  for r in
    select u as id from _active_members(new.gym_id, case when new.gym_id is null then new.chain_id end) u
    union
    select p.id from profiles p
    where p.gym_id in (select id from gyms where id = new.gym_id or (new.gym_id is null and chain_id = new.chain_id))
    limit 2000
  loop
    perform _notify(r.id, null, 'gym_offer', new.id, v_data, v_url);
  end loop;
  return null;
end $$;

-- ---------- مواعيد مراكز الاستشفاء (الرابط بين المركز والمتدرب) ----------
create or replace function public.owns_center(p_center uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from recovery_centers c where c.id = p_center and c.owner = auth.uid());
$$;
revoke all on function public.owns_center(uuid) from public, anon;
grant execute on function public.owns_center(uuid) to authenticated;

create table if not exists public.center_appointments (
  id          uuid primary key default gen_random_uuid(),
  center_id   uuid not null references public.recovery_centers(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'requested' check (status in ('requested','confirmed','declined','cancelled','done')),
  preferred   text check (char_length(preferred) <= 120),
  note        text check (char_length(note) <= 300),
  starts_at   timestamptz,
  center_note text check (char_length(center_note) <= 300),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists center_appt_center on public.center_appointments (center_id, status, starts_at);
create index if not exists center_appt_user on public.center_appointments (user_id, created_at desc);
alter table public.center_appointments enable row level security;
create policy ca_appt_read on public.center_appointments for select to authenticated
  using (user_id = auth.uid() or owns_center(center_id) or is_admin());
revoke insert, update, delete on public.center_appointments from authenticated, anon;

create or replace function public.request_center_appointment(p_center uuid, p_preferred text, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c recovery_centers; v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into c from recovery_centers where id = p_center;
  if c.id is null or c.status <> 'approved' or c.owner is null then raise exception 'kind_not_available'; end if;
  if c.owner = auth.uid() then raise exception 'not_allowed'; end if;
  if exists (select 1 from center_appointments where center_id = p_center and user_id = auth.uid() and status = 'requested') then
    raise exception 'request_pending';
  end if;
  if (select count(*) from center_appointments where user_id = auth.uid() and created_at > now() - interval '1 day') >= 3 then
    raise exception 'rate_limited';
  end if;
  insert into center_appointments (center_id, user_id, preferred, note)
  values (p_center, auth.uid(), nullif(left(btrim(coalesce(p_preferred, '')), 120), ''), nullif(left(btrim(coalesce(p_note, '')), 300), ''))
  returning id into v_id;
  perform _notice(c.owner, 'cap:' || v_id, 'طلب موعد جديد', _person_label(auth.uid()) || ' يطلب موعد في ' || c.name || coalesce(' (' || nullif(btrim(p_preferred), '') || ')', '') || '.',
    'New appointment request', _person_label(auth.uid()) || ' asked for an appointment at ' || coalesce(c.name_en, c.name) || '.', '/recovery/manage', v_id);
  return v_id;
end $$;
revoke all on function public.request_center_appointment(uuid, text, text) from public, anon;
grant execute on function public.request_center_appointment(uuid, text, text) to authenticated;

-- المركز يأكد الموعد بوقت محدد أو يعتذر
create or replace function public.respond_center_appointment(p_id uuid, p_accept boolean, p_starts_at timestamptz default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a center_appointments; c recovery_centers; v_note text := nullif(left(btrim(coalesce(p_note, '')), 300), '');
begin
  select * into a from center_appointments where id = p_id;
  if a.id is null or not (owns_center(a.center_id) or is_admin()) then raise exception 'not_allowed'; end if;
  if a.status not in ('requested','confirmed') then raise exception 'bad_status'; end if;
  select * into c from recovery_centers where id = a.center_id;
  if p_accept then
    if p_starts_at is null or p_starts_at < now() then raise exception 'bad_date'; end if;
    update center_appointments set status = 'confirmed', starts_at = p_starts_at, center_note = v_note, updated_at = now() where id = p_id;
    perform _notice(a.user_id, 'cac:' || p_id || ':' || extract(epoch from p_starts_at)::bigint, 'موعدك في ' || c.name || ' ✓',
      'موعدك ' || to_char(p_starts_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') || coalesce('. ' || v_note, ''),
      'Your appointment at ' || coalesce(c.name_en, c.name) || ' ✓', 'On ' || to_char(p_starts_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') || coalesce('. ' || v_note, ''),
      '/recovery/appointments', p_id);
  else
    update center_appointments set status = 'declined', center_note = v_note, updated_at = now() where id = p_id;
    perform _notice(a.user_id, 'cad:' || p_id, c.name || ' اعتذر عن الموعد', coalesce(v_note, 'تقدر تطلب موعد ثاني أو تشوف مراكز ثانية.'),
      coalesce(c.name_en, c.name) || ' declined the appointment', coalesce(v_note, 'You can request another time or try other centers.'), '/recovery/appointments', p_id);
  end if;
end $$;
revoke all on function public.respond_center_appointment(uuid, boolean, timestamptz, text) from public, anon;
grant execute on function public.respond_center_appointment(uuid, boolean, timestamptz, text) to authenticated;

-- إلغاء (المتدرب أو المركز) أو إنهاء (المركز)
create or replace function public.close_center_appointment(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare a center_appointments; c recovery_centers; v_center boolean;
begin
  select * into a from center_appointments where id = p_id;
  if a.id is null then raise exception 'request_not_found'; end if;
  v_center := owns_center(a.center_id) or is_admin();
  if not (v_center or a.user_id = auth.uid()) then raise exception 'not_allowed'; end if;
  if p_status not in ('cancelled','done') or (p_status = 'done' and not v_center) then raise exception 'bad_status'; end if;
  if a.status not in ('requested','confirmed') then raise exception 'bad_status'; end if;
  update center_appointments set status = p_status, updated_at = now() where id = p_id;
  select * into c from recovery_centers where id = a.center_id;
  if p_status = 'cancelled' then
    if a.user_id = auth.uid() then
      perform _notice(c.owner, 'cax:' || p_id, 'انلغى موعد', _person_label(a.user_id) || ' ألغى موعده.', 'Appointment cancelled',
        _person_label(a.user_id) || ' cancelled the appointment.', '/recovery/manage', p_id);
    else
      perform _notice(a.user_id, 'cax:' || p_id, c.name || ' ألغى الموعد', 'تقدر تطلب موعد ثاني.', coalesce(c.name_en, c.name) || ' cancelled the appointment',
        'You can request another time.', '/recovery/appointments', p_id);
    end if;
  end if;
end $$;
revoke all on function public.close_center_appointment(uuid, text) from public, anon;
grant execute on function public.close_center_appointment(uuid, text) to authenticated;

-- مواعيد المركز (لصاحبه): اسم المتدرب لأنه هو اللي طلب الموعد
create or replace function public.center_appointment_list(p_center uuid)
returns table (id uuid, user_id uuid, name text, username text, avatar_url text, status text, preferred text, note text,
               starts_at timestamptz, center_note text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.user_id, coalesce(nullif(p.full_name, ''), p.username), p.username, p.avatar_url, a.status, a.preferred, a.note,
         a.starts_at, a.center_note, a.created_at
  from center_appointments a join profiles p on p.id = a.user_id
  where a.center_id = p_center and (owns_center(p_center) or is_admin())
  order by (a.status = 'requested') desc, a.starts_at nulls first, a.created_at desc
  limit 300;
$$;
revoke all on function public.center_appointment_list(uuid) from public, anon;
grant execute on function public.center_appointment_list(uuid) to authenticated;

-- تنبيه المركز: فقط للي عندهم موعد (طلب أو موعد مؤكد أو زيارة آخر ٦٠ يوم)
create table if not exists public.center_notices (
  id         uuid primary key default gen_random_uuid(),
  center_id  uuid not null references public.recovery_centers(id) on delete cascade,
  title      text not null check (char_length(btrim(title)) between 3 and 60),
  body       text not null check (char_length(btrim(body)) between 3 and 240),
  recipients integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.center_notices enable row level security;
create policy cn_notice_read on public.center_notices for select to authenticated using (owns_center(center_id) or is_admin());
revoke insert, update, delete on public.center_notices from authenticated, anon;

create or replace function public.send_center_notice(p_center uuid, p_title text, p_body text)
returns integer language plpgsql security definer set search_path = public as $$
declare c recovery_centers; v_id uuid; v_n integer := 0; u uuid;
begin
  select * into c from recovery_centers where id = p_center;
  if c.id is null or not (c.owner = auth.uid() or is_admin()) then raise exception 'not_allowed'; end if;
  if (select count(*) from center_notices where center_id = p_center and created_at > now() - interval '1 day') >= 1 then raise exception 'rate_limited'; end if;
  insert into center_notices (center_id, title, body) values (p_center, btrim(p_title), btrim(p_body)) returning id into v_id;
  for u in
    select distinct a.user_id from center_appointments a
    where a.center_id = p_center
      and (a.status in ('requested','confirmed') or (a.status = 'done' and coalesce(a.starts_at, a.updated_at) > now() - interval '60 days'))
    limit 3000
  loop
    if _notice(u, 'cnt:' || v_id, c.name || ': ' || btrim(p_title), btrim(p_body), coalesce(c.name_en, c.name) || ': ' || btrim(p_title), btrim(p_body),
               '/recovery/appointments', v_id) then
      v_n := v_n + 1;
    end if;
  end loop;
  update center_notices set recipients = v_n where id = v_id;
  return v_n;
end $$;
revoke all on function public.send_center_notice(uuid, text, text) from public, anon;
grant execute on function public.send_center_notice(uuid, text, text) to authenticated;

-- تذكير الموعد قبلها بساعتين (كل ربع ساعة)
create or replace function public.run_partner_reminders(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare r record; v_n integer := 0;
begin
  for r in
    select a.id, a.user_id, a.starts_at, c.name, coalesce(c.name_en, c.name) as name_en
    from center_appointments a join recovery_centers c on c.id = a.center_id
    where a.status = 'confirmed' and a.starts_at between p_now + interval '105 minutes' and p_now + interval '135 minutes'
    limit 3000
  loop
    if _notice(r.user_id, 'car:' || r.id, 'موعدك بعد ساعتين ⏰', 'موعدك في ' || r.name || ' الساعة ' || to_char(r.starts_at at time zone 'Asia/Riyadh', 'HH24:MI') || '.',
               'Your appointment is in 2 hours ⏰', 'At ' || r.name_en || ', ' || to_char(r.starts_at at time zone 'Asia/Riyadh', 'HH24:MI') || '.',
               '/recovery/appointments', r.id) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
revoke all on function public.run_partner_reminders(timestamptz) from public, anon, authenticated;

do $$
begin
  perform cron.schedule('arq-partner-reminders', '*/15 * * * *', 'select public.run_partner_reminders()');
exception when others then
  raise notice 'pg_cron not available: partner reminders not scheduled (%)', sqlerrm;
end $$;

-- ---------- عرض مراكز الاستشفاء لمستخدمي أرك ----------
alter table public.recovery_centers
  add column if not exists offer_text text check (char_length(offer_text) <= 120),
  add column if not exists offer_code text check (offer_code is null or offer_code ~ '^[A-Za-z0-9_-]{2,30}$'),
  add column if not exists offer_ends date;

-- ---------- دليل السلاسل يوضح الشريك ----------
drop function if exists public.chains_directory(double precision, double precision);
create function public.chains_directory(p_lat double precision default null, p_lng double precision default null)
returns table (id uuid, slug text, name text, name_en text, audience text, website text, instagram text, description text, logo_path text,
               branches bigint, rating numeric, reviews bigint, offers bigint, best_monthly numeric, nearest_m double precision, partner boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.slug, c.name, c.name_en, c.audience, c.website, c.instagram, c.description, c.logo_path,
         (select count(*) from gyms g where g.chain_id = c.id and g.verified),
         round((select avg(r.rating) from gym_reviews r join gyms g on g.id = r.gym_id where g.chain_id = c.id), 1),
         (select count(*) from gym_reviews r join gyms g on g.id = r.gym_id where g.chain_id = c.id),
         (select count(*) from gym_offers o left join gyms g on g.id = o.gym_id
            where (o.chain_id = c.id or g.chain_id = c.id) and o.active and (o.ends_on is null or o.ends_on >= current_date)),
         (select min(o.price_sar / o.months) from gym_offers o left join gyms g on g.id = o.gym_id
            where (o.chain_id = c.id or g.chain_id = c.id) and o.active and o.months > 0 and (o.ends_on is null or o.ends_on >= current_date)),
         case when p_lat is null then null else
           (select min(distance_m(p_lat, p_lng, g.lat, g.lng)) from gyms g where g.chain_id = c.id and g.verified) end,
         c.partner
  from gym_chains c
  where c.active or can_manage_chain(c.id)
  order by c.partner desc, c.name;
$$;
revoke all on function public.chains_directory(double precision, double precision) from public, anon;
grant execute on function public.chains_directory(double precision, double precision) to authenticated;
