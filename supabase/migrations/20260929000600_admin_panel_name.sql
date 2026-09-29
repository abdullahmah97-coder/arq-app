-- اسم اللوحة صار «لوحة إدارة التطبيق» بدل «لوحة المالك»: نحدّث نصوص تنبيهات الإدارة
-- (نفس الدوال كما هي، تغيّر النص فقط) ونحدّث التنبيهات القديمة المحفوظة عشان تطابق الاسم الجديد

create or replace function public._cp_submitted() returns trigger language plpgsql security definer set search_path = public as $$
declare v_a uuid;
begin
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    for v_a in select user_id from app_admins loop
      perform _notice(v_a, 'cpr:' || new.user_id || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
        'ملف مدرب ينتظر اعتمادك', _person_label(new.user_id) || ' عبّى ملفه كمدرب. راجعه واعتمده من لوحة إدارة التطبيق.',
        'Coach profile to review', _person_label(new.user_id) || ' submitted a coach profile. Review it in App management.',
        '/owner', new.user_id);
    end loop;
  end if;
  return null;
end $$;
revoke all on function public._cp_submitted() from public, anon, authenticated;

create or replace function public._rc_submitted() returns trigger language plpgsql security definer set search_path = public as $$
declare v_a uuid;
begin
  if new.status = 'pending' and new.listed_by = 'owner' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    for v_a in select user_id from app_admins loop
      perform _notice(v_a, 'rc:' || new.id || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
        'مركز علاج طبيعي ينتظر اعتمادك', new.name || ' طلب ينضم لدليل الاستشفاء. راجعه من لوحة إدارة التطبيق.',
        'Recovery center to review', coalesce(new.name_en, new.name) || ' asked to join the recovery directory. Review it in App management.',
        '/owner', new.id);
    end loop;
  end if;
  return new;
end $$;


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
  perform _notify_admins('clq:' || v_id, 'نادي يطلب ينضم كشريك', btrim(p_name) || ': ' || _person_label(auth.uid()) || ' طلب ينضم لأرك كشريك. راجعه من لوحة إدارة التطبيق.',
    'Club partner request', btrim(p_name) || ': ' || _person_label(auth.uid()) || ' asked to join ARQ as a partner. Review it in App management.', v_id);
  return v_id;
end $$;
revoke all on function public.request_club_partner(uuid, uuid, text, text, text, text, text, text, integer, text) from public, anon;
grant execute on function public.request_club_partner(uuid, uuid, text, text, text, text, text, text, integer, text) to authenticated;

create or replace function public._brand_status_notice() returns trigger language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if new.status = 'pending' and new.listed_by = 'owner' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    perform _notify_admins('brq:' || new.id, 'متجر ينتظر اعتمادك', new.name || ' طلب يظهر في المتاجر. راجعه من لوحة إدارة التطبيق.',
      'Store to review', new.name || ' asked to appear in Stores. Review it in App management.', new.id);
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

-- التنبيهات اللي وصلت قبل: نفس النص بالاسم الجديد
update public.notifications
set data = data
  || case when data ? 'body_ar' then jsonb_build_object('body_ar', replace(data->>'body_ar', 'لوحة المالك', 'لوحة إدارة التطبيق')) else '{}'::jsonb end
  || case when data ? 'body_en' then jsonb_build_object('body_en', replace(data->>'body_en', 'the owner panel', 'App management')) else '{}'::jsonb end
where kind = 'notice'
  and (data->>'body_ar' like '%لوحة المالك%' or data->>'body_en' like '%the owner panel%');
