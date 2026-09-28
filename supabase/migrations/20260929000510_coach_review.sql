-- =====================================================================
-- اعتماد ملف المدرب من لوحة المالك
-- المدرب يعبّي ملفه ← ينرسل تلقائياً للوحة المالك ← المالك يعتمد أو يرفض بسبب أو يوقف.
-- قبل الاعتماد: الملف ما يظهر في الدليل ولا صفحات الأندية ولا يقدر يستقبل متدربين أو يوصل لبياناتهم.
-- الاعتماد = علامة «موثّق» (profiles.is_coach) + الظهور للناس. الرفض: المدرب يعدّل ويرجع ينرسل للمراجعة.
-- =====================================================================

alter table public.coach_profiles
  add column if not exists status text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  add column if not exists submitted_at timestamptz not null default now(),
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists review_note text check (char_length(review_note) <= 300);

-- الملفات الموجودة: الموثّق معتمد، والباقي ينتظر المراجعة
update public.coach_profiles c
   set status = case when p.is_coach then 'approved' else 'pending' end,
       submitted_at = coalesce(c.verify_requested_at, c.created_at)
  from public.profiles p where p.id = c.user_id;

create index if not exists coach_profiles_review_idx on public.coach_profiles (status, submitted_at);

-- القراءة: المعتمد للكل، وصاحب الملف والمالك يشوفون الباقي
drop policy if exists cp_read on public.coach_profiles;
create policy cp_read on public.coach_profiles for select to authenticated
  using (status = 'approved' or user_id = auth.uid() or is_admin());

-- المدرب ما يقدر يغيّر حالة المراجعة. تعديله بعد الرفض = إعادة إرسال للمراجعة
create or replace function public._cp_guard() returns trigger language plpgsql as $$
begin
  if auth.uid() is null or is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.submitted_at := now();
    new.reviewed_at := null; new.reviewed_by := null; new.review_note := null;
    return new;
  end if;
  new.status := old.status; new.submitted_at := old.submitted_at;
  new.reviewed_at := old.reviewed_at; new.reviewed_by := old.reviewed_by; new.review_note := old.review_note;
  if old.status = 'rejected' then
    new.status := 'pending'; new.submitted_at := now();
  end if;
  return new;
end $$;
drop trigger if exists cp_guard on public.coach_profiles;
create trigger cp_guard before insert or update on public.coach_profiles for each row execute function public._cp_guard();

-- تنبيه المالك بكل ملف جديد أو معاد إرساله
create or replace function public._cp_submitted() returns trigger language plpgsql security definer set search_path = public as $$
declare v_a uuid;
begin
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    for v_a in select user_id from app_admins loop
      perform _notice(v_a, 'cpr:' || new.user_id || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
        'ملف مدرب ينتظر اعتمادك', _person_label(new.user_id) || ' عبّى ملفه كمدرب. راجعه واعتمده من لوحة المالك.',
        'Coach profile to review', _person_label(new.user_id) || ' submitted a coach profile. Review it in the owner panel.',
        '/owner', new.user_id);
    end loop;
  end if;
  return null;
end $$;
revoke all on function public._cp_submitted() from public, anon, authenticated;
drop trigger if exists cp_submitted on public.coach_profiles;
-- بدون «update of»: التغيير يجي من cp_guard وليس من جملة التحديث نفسها
create trigger cp_submitted after insert or update on public.coach_profiles
  for each row execute function public._cp_submitted();

-- قرار المالك: اعتماد / رفض بسبب / إيقاف
create or replace function public.review_coach(p_user uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_key text;
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  if p_decision not in ('approved','rejected','suspended') then raise exception 'bad_status'; end if;
  update coach_profiles set status = p_decision, reviewed_at = now(), reviewed_by = auth.uid(), review_note = left(v_note, 300)
   where user_id = p_user;
  if not found then raise exception 'user_not_found'; end if;
  update profiles set is_coach = (p_decision = 'approved') where id = p_user;
  v_key := 'cpd:' || p_user || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  if p_decision = 'approved' then
    perform _notice(p_user, v_key, 'انعتمد ملفك كمدرب ✓', 'ملفك صار ظاهر في دليل المدربين وصفحات الأندية، وتقدر تستقبل متدربين.',
      'Your coach profile is approved ✓', 'You now appear in the coach directory and gym pages, and can take clients.', '/coaching', p_user);
  elsif p_decision = 'rejected' then
    perform _notice(p_user, v_key, 'ملفك كمدرب يحتاج تعديل', coalesce(v_note, 'راجع بيانات ملفك وشهاداتك وأرسله مرة ثانية.'),
      'Your coach profile needs changes', coalesce(v_note, 'Review your profile and certifications, then submit again.'), '/coaching/profile', p_user);
  else
    perform _notice(p_user, v_key, 'انوقف ملفك كمدرب', coalesce(v_note, 'ملفك ما يظهر للناس حالياً. تواصل مع إدارة أرك.'),
      'Your coach profile is suspended', coalesce(v_note, 'Your profile is hidden for now. Contact the ARQ team.'), '/coaching', p_user);
  end if;
end $$;
revoke all on function public.review_coach(uuid, text, text) from public, anon;
grant execute on function public.review_coach(uuid, text, text) to authenticated;

-- زر «موثّق» القديم في إدارة المستخدمين يمشي مع حالة ملف المدرب
create or replace function public.set_coach(p_user uuid, p_value boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  update profiles set is_coach = p_value where id = p_user;
  update coach_profiles set status = case when p_value then 'approved' else 'suspended' end, reviewed_at = now(), reviewed_by = auth.uid()
   where user_id = p_user and (p_value and status <> 'approved' or not p_value and status = 'approved');
end $$;

-- طابور المراجعة في لوحة المالك (كل بيانات الملف)
drop function if exists public.coach_verification_queue();
create function public.coach_verification_queue()
returns table (user_id uuid, username text, full_name text, avatar_url text, headline text, bio text, specialties text[], years_exp smallint,
               certifications text, languages text[], trains text, city text, online boolean, in_person boolean, price_from_sar numeric,
               instagram text, submitted_at timestamptz, gyms text[])
language sql stable security definer set search_path = public as $$
  select c.user_id, p.username, p.full_name, p.avatar_url, c.headline, c.bio, c.specialties, c.years_exp, c.certifications, c.languages,
         c.trains, c.city, c.online, c.in_person, c.price_from_sar, c.instagram, c.submitted_at,
         coalesce((select array_agg(coalesce(g.name, g.name_en) order by g.name) from coach_gyms cg join gyms g on g.id = cg.gym_id
                   where cg.coach_id = c.user_id), '{}')
  from coach_profiles c join profiles p on p.id = c.user_id
  where is_admin() and c.status = 'pending'
  order by c.submitted_at;
$$;
revoke all on function public.coach_verification_queue() from public, anon;
grant execute on function public.coach_verification_queue() to authenticated;

-- الدليل: المعتمدين فقط
create or replace function public.coaches_directory(p_q text default null, p_specialty text default null, p_city text default null, p_gym uuid default null)
returns table (user_id uuid, username text, full_name text, avatar_url text, verified boolean, headline text, specialties text[],
               years_exp smallint, city text, trains text, online boolean, in_person boolean, price_from_sar numeric, accepting boolean,
               rating numeric, reviews integer, clients integer, gyms text[])
language sql stable security definer set search_path = public as $$
  select c.user_id, p.username, p.full_name, p.avatar_url, p.is_coach, c.headline, c.specialties, c.years_exp, c.city, c.trains,
         c.online, c.in_person, c.price_from_sar, c.accepting,
         (select round(avg(r.rating), 1) from coach_reviews r where r.coach_id = c.user_id),
         (select count(*) from coach_reviews r where r.coach_id = c.user_id)::int,
         (select count(*) from coach_links l where l.coach_id = c.user_id and l.status = 'active')::int,
         coalesce((select array_agg(coalesce(g.name, g.name_en) order by g.name) from coach_gyms cg join gyms g on g.id = cg.gym_id
                   where cg.coach_id = c.user_id and cg.status = 'approved'), '{}')
  from coach_profiles c join profiles p on p.id = c.user_id
  where c.status = 'approved'
    and (p_q is null or btrim(p_q) = '' or p.username ilike '%' || btrim(p_q) || '%' or p.full_name ilike '%' || btrim(p_q) || '%' or c.headline ilike '%' || btrim(p_q) || '%')
    and (p_specialty is null or p_specialty = any(c.specialties))
    and (p_city is null or c.city ilike p_city)
    and (p_gym is null or exists (select 1 from coach_gyms cg where cg.coach_id = c.user_id and cg.gym_id = p_gym and cg.status = 'approved'))
  order by p.is_coach desc, 15 desc nulls last, 17 desc, c.created_at
  limit 100;
$$;

-- صفحة المدرب: المعتمد للكل، وغير المعتمد لصاحبه والمالك ومن عنده ربط قائم معه
drop function if exists public.coach_detail(uuid);
create function public.coach_detail(p_coach uuid)
returns table (user_id uuid, username text, full_name text, avatar_url text, verified boolean, headline text, bio text, specialties text[],
               years_exp smallint, certifications text, languages text[], city text, trains text, online boolean, in_person boolean,
               price_from_sar numeric, accepting boolean, instagram text, rating numeric, reviews integer, clients integer,
               gyms jsonb, my_link_id uuid, my_link_status text, my_link_by text, my_scopes text[], can_review boolean, is_me boolean,
               status text, review_note text)
language sql stable security definer set search_path = public as $$
  select c.user_id, p.username, p.full_name, p.avatar_url, p.is_coach, c.headline, c.bio, c.specialties, c.years_exp, c.certifications,
         c.languages, c.city, c.trains, c.online, c.in_person, c.price_from_sar, c.accepting, c.instagram,
         (select round(avg(r.rating), 1) from coach_reviews r where r.coach_id = c.user_id),
         (select count(*) from coach_reviews r where r.coach_id = c.user_id)::int,
         (select count(*) from coach_links l where l.coach_id = c.user_id and l.status = 'active')::int,
         coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'name_en', g.name_en) order by g.name)
                   from coach_gyms cg join gyms g on g.id = cg.gym_id where cg.coach_id = c.user_id and cg.status = 'approved'), '[]'),
         l.id, l.status, l.requested_by, l.scopes,
         exists (select 1 from coach_links x where x.coach_id = c.user_id and x.client_id = auth.uid() and x.accepted_at is not null),
         c.user_id = auth.uid(),
         c.status,
         case when c.user_id = auth.uid() or is_admin() then c.review_note end
  from coach_profiles c join profiles p on p.id = c.user_id
  left join lateral (select * from coach_links x where x.coach_id = c.user_id and x.client_id = auth.uid() and x.status in ('pending','active')
                     order by x.created_at desc limit 1) l on true
  where c.user_id = p_coach
    and (c.status = 'approved' or c.user_id = auth.uid() or is_admin() or l.id is not null);
$$;
revoke all on function public.coach_detail(uuid) from public, anon;
grant execute on function public.coach_detail(uuid) to authenticated;

-- صفحة النادي: المدرب يظهر للناس بعد اعتماد النادي واعتماد ملفه
create or replace function public.gym_coaches(p_gym uuid)
returns table (user_id uuid, username text, full_name text, avatar_url text, verified boolean, headline text, specialties text[],
               rating numeric, reviews integer, status text)
language sql stable security definer set search_path = public as $$
  select c.user_id, p.username, p.full_name, p.avatar_url, p.is_coach, c.headline, c.specialties,
         (select round(avg(r.rating), 1) from coach_reviews r where r.coach_id = c.user_id),
         (select count(*) from coach_reviews r where r.coach_id = c.user_id)::int, cg.status
  from coach_gyms cg join coach_profiles c on c.user_id = cg.coach_id join profiles p on p.id = c.user_id
  where cg.gym_id = p_gym and ((cg.status = 'approved' and c.status = 'approved') or can_manage_gym_or_chain(p_gym))
  order by cg.status = 'pending' desc, p.is_coach desc, 8 desc nulls last;
$$;

-- الوصول لبيانات المتدربين والملاحظات والحصص: للمدرب المعتمد فقط (الإيقاف يقطع الوصول فوراً)
create or replace function public._coach_can(p_client uuid, p_scope text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from coach_links l join coach_profiles cp on cp.user_id = l.coach_id and cp.status = 'approved'
                 where l.coach_id = auth.uid() and l.client_id = p_client and l.status = 'active'
                   and (p_scope = 'basic' or p_scope = any(l.scopes)));
$$;

-- دعوة متدرب: بعد الاعتماد فقط
create or replace function public.coach_invite(p_username text, p_message text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_client uuid; v_id uuid; v_status text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select status into v_status from coach_profiles where user_id = auth.uid();
  if v_status is null then raise exception 'not_a_coach'; end if;
  if v_status <> 'approved' then raise exception 'coach_pending_review'; end if;
  select id into v_client from profiles where lower(username) = lower(regexp_replace(btrim(coalesce(p_username, '')), '^@', ''));
  if v_client is null then raise exception 'user_not_found'; end if;
  if v_client = auth.uid() then raise exception 'not_allowed'; end if;
  if exists (select 1 from coach_links where coach_id = auth.uid() and client_id = v_client and status in ('pending','active')) then raise exception 'already_linked'; end if;
  if (select count(*) from coach_links where coach_id = auth.uid() and created_at > now() - interval '1 day') >= 30 then raise exception 'rate_limited'; end if;
  insert into coach_links (coach_id, client_id, requested_by, message) values (auth.uid(), v_client, 'coach', nullif(btrim(p_message), ''))
  returning id into v_id;
  perform _notice(v_client, 'cli:' || v_id, 'طلب تدريب', _person_label(auth.uid()) || ' يبي يكون مدربك. انت تحدد وش يشوف من بياناتك.',
    'Coaching invite', _person_label(auth.uid()) || ' wants to be your coach. You choose what they can see.', '/my-coach', v_id);
  return v_id;
end $$;

-- طلب تدريب من المتدرب: للمدرب المعتمد اللي يستقبل متدربين
create or replace function public.coach_request(p_coach uuid, p_scopes text[], p_message text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_coach = auth.uid() then raise exception 'not_allowed'; end if;
  if not exists (select 1 from coach_profiles where user_id = p_coach and accepting and status = 'approved') then raise exception 'not_a_coach'; end if;
  if exists (select 1 from coach_links where coach_id = p_coach and client_id = auth.uid() and status in ('pending','active')) then raise exception 'already_linked'; end if;
  if (select count(*) from coach_links where client_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then raise exception 'rate_limited'; end if;
  insert into coach_links (coach_id, client_id, requested_by, scopes, message) values (p_coach, auth.uid(), 'client', _scopes(p_scopes), nullif(btrim(p_message), ''))
  returning id into v_id;
  perform _notice(p_coach, 'clr:' || v_id, 'متدرب جديد يطلبك', _person_label(auth.uid()) || ' يبيك تدرّبه.',
    'New client request', _person_label(auth.uid()) || ' wants you as their coach.', '/coaching', v_id);
  return v_id;
end $$;
