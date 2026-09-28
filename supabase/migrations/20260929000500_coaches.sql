-- =====================================================================
-- المدربين: ملف المدرب، الأندية اللي يدرّب فيها، ربط المدرب بالمتدرب بموافقة وصلاحيات قابلة للسحب،
-- سجل المتدرب الكامل، البرامج والالتزام، الباقات والحصص، ملاحظات خاصة، تقرير شهري، وتقييمات المدربين.
-- الخصوصية: بيانات الجسم/الإنبدي/الصحة/الأكل ما يشوفها المدرب إلا بموافقة صريحة لكل نوع، وتنسحب متى ما بغى المتدرب،
-- وكل اطلاع من المدرب ينسجل ويشوفه المتدرب. ما تُستخدم أبداً للإعلانات.
-- التوثيق: profiles.is_coach (يعتمده مالك التطبيق من لوحة المالك).
-- =====================================================================

create or replace function public._person_label(p uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(full_name), ''), username) from profiles where id = p;
$$;
revoke all on function public._person_label(uuid) from public, anon, authenticated;

-- ---------- ملف المدرب ----------
create table if not exists public.coach_profiles (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  headline       text check (char_length(headline) <= 80),
  bio            text check (char_length(bio) <= 800),
  specialties    text[] not null default '{}' check (cardinality(specialties) <= 6 and specialties <@ array[
                   'fat_loss','muscle','strength','fitness','rehab','women','seniors','kids','sports','nutrition',
                   'boxing','crossfit','yoga','running','bodybuilding']::text[]),
  years_exp      smallint check (years_exp between 0 and 50),
  certifications text check (char_length(certifications) <= 400),
  languages      text[] not null default '{ar}' check (languages <@ array['ar','en','ur','hi','tl','fr','es']::text[]),
  trains         text not null default 'any' check (trains in ('any','men','women')),
  city           text check (char_length(city) <= 40),
  online         boolean not null default false,
  in_person      boolean not null default true,
  price_from_sar numeric(8,2) check (price_from_sar between 0 and 100000),
  accepting      boolean not null default true,
  instagram      text check (instagram ~ '^[A-Za-z0-9_.]{1,30}$'),
  verify_requested_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.coach_profiles enable row level security;
create policy cp_read   on public.coach_profiles for select to authenticated using (true);
create policy cp_insert on public.coach_profiles for insert to authenticated with check (user_id = auth.uid());
create policy cp_update on public.coach_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cp_delete on public.coach_profiles for delete to authenticated using (user_id = auth.uid());

create or replace function public._cp_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger cp_touch before update on public.coach_profiles for each row execute function public._cp_touch();

-- ---------- الأندية اللي يدرّب فيها (النادي يعتمد) ----------
create table if not exists public.coach_gyms (
  coach_id   uuid not null references public.coach_profiles(user_id) on delete cascade,
  gym_id     uuid not null references public.gyms(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending','approved')),
  decided_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (coach_id, gym_id)
);
create index if not exists coach_gyms_gym_idx on public.coach_gyms (gym_id, status);
alter table public.coach_gyms enable row level security;
create policy cg_read   on public.coach_gyms for select to authenticated using (status = 'approved' or coach_id = auth.uid() or can_manage_gym_or_chain(gym_id));
create policy cg_insert on public.coach_gyms for insert to authenticated with check (coach_id = auth.uid());
create policy cg_update on public.coach_gyms for update to authenticated using (can_manage_gym_or_chain(gym_id)) with check (can_manage_gym_or_chain(gym_id));
create policy cg_delete on public.coach_gyms for delete to authenticated using (coach_id = auth.uid() or can_manage_gym_or_chain(gym_id));

create or replace function public._cg_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare v_m uuid;
begin
  if tg_op = 'INSERT' then
    if not can_manage_gym_or_chain(new.gym_id) then new.status := 'pending'; new.decided_by := null; end if;
    if new.status = 'pending' then
      for v_m in select user_id from gym_managers where gym_id = new.gym_id loop
        perform _notice(v_m, 'cg:' || new.coach_id || ':' || new.gym_id,
          'مدرب يطلب الانضمام لناديك', _person_label(new.coach_id) || ' يقول إنه يدرّب في ' || _gym_label(new.gym_id) || '. اعتمده من إدارة النادي.',
          'A coach wants to join your club', _person_label(new.coach_id) || ' says they coach at ' || _gym_label(new.gym_id) || '. Approve from club management.',
          '/manage/coaches?gymId=' || new.gym_id, new.gym_id);
      end loop;
    end if;
  elsif new.status is distinct from old.status then
    new.decided_by := auth.uid();
    if new.status = 'approved' then
      perform _notice(new.coach_id, 'cga:' || new.gym_id, 'انعتمدت في النادي', 'صرت تظهر كمدرب في صفحة ' || _gym_label(new.gym_id) || '.',
        'Approved by the club', 'You now appear as a coach on ' || _gym_label(new.gym_id) || '.', '/coaching', new.gym_id);
    end if;
  end if;
  return new;
end $$;
create trigger cg_guard before insert or update on public.coach_gyms for each row execute function public._cg_guard();

-- ---------- ربط المدرب بالمتدرب ----------
create table if not exists public.coach_links (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references public.profiles(id) on delete cascade,
  client_id    uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','active','ended','declined')),
  requested_by text not null check (requested_by in ('coach','client')),
  scopes       text[] not null default '{}' check (scopes <@ array['workouts','visits','body','inbody','health','food']::text[]),
  message      text check (char_length(message) <= 300),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  ended_at     timestamptz,
  ended_by     uuid references public.profiles(id) on delete set null,
  check (coach_id <> client_id)
);
create unique index if not exists coach_links_open on public.coach_links (coach_id, client_id) where status in ('pending','active');
create index if not exists coach_links_client_idx on public.coach_links (client_id, status);
alter table public.coach_links enable row level security;
create policy cl_read on public.coach_links for select to authenticated using (auth.uid() in (coach_id, client_id));
-- الكتابة عبر الدوال فقط

create or replace function public._scopes(p text[]) returns text[] language sql immutable as $$
  select coalesce(array(select distinct s from unnest(coalesce(p, '{}')) s
                        where s = any(array['workouts','visits','body','inbody','health','food']) order by s), '{}');
$$;

create or replace function public.coach_invite(p_username text, p_message text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_client uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from coach_profiles where user_id = auth.uid()) then raise exception 'not_a_coach'; end if;
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

create or replace function public.coach_request(p_coach uuid, p_scopes text[], p_message text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_coach = auth.uid() then raise exception 'not_allowed'; end if;
  if not exists (select 1 from coach_profiles where user_id = p_coach and accepting) then raise exception 'not_a_coach'; end if;
  if exists (select 1 from coach_links where coach_id = p_coach and client_id = auth.uid() and status in ('pending','active')) then raise exception 'already_linked'; end if;
  if (select count(*) from coach_links where client_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then raise exception 'rate_limited'; end if;
  insert into coach_links (coach_id, client_id, requested_by, scopes, message) values (p_coach, auth.uid(), 'client', _scopes(p_scopes), nullif(btrim(p_message), ''))
  returning id into v_id;
  perform _notice(p_coach, 'clr:' || v_id, 'متدرب جديد يطلبك', _person_label(auth.uid()) || ' يبيك تدرّبه.',
    'New client request', _person_label(auth.uid()) || ' wants you as their coach.', '/coaching', v_id);
  return v_id;
end $$;

create or replace function public.coach_link_respond(p_link uuid, p_accept boolean, p_scopes text[] default null)
returns void language plpgsql security definer set search_path = public as $$
declare v coach_links; v_other uuid;
begin
  select * into v from coach_links where id = p_link for update;
  if not found or v.status <> 'pending' then raise exception 'link_not_found'; end if;
  if (v.requested_by = 'coach' and v.client_id <> auth.uid()) or (v.requested_by = 'client' and v.coach_id <> auth.uid()) then
    raise exception 'not_allowed';
  end if;
  v_other := case when v.requested_by = 'coach' then v.coach_id else v.client_id end;
  if p_accept then
    update coach_links set status = 'active', accepted_at = now(),
      scopes = case when v.requested_by = 'coach' then _scopes(p_scopes) else scopes end
    where id = p_link;
    perform _notice(v_other, 'cla:' || p_link, 'تم الربط مع ' || _person_label(auth.uid()), 'بدأ التدريب. تقدرون تتابعون السجل والبرنامج والحصص.',
      'Linked with ' || _person_label(auth.uid()), 'Coaching started. Track the record, program and sessions together.',
      case when v.requested_by = 'coach' then '/coaching/client/' || v.client_id else '/my-coach' end, p_link);
  else
    update coach_links set status = 'declined', ended_at = now(), ended_by = auth.uid() where id = p_link;
  end if;
end $$;

create or replace function public.coach_link_scopes(p_link uuid, p_scopes text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  update coach_links set scopes = _scopes(p_scopes)
  where id = p_link and client_id = auth.uid() and status in ('pending','active');
  if not found then raise exception 'link_not_found'; end if;
end $$;

create or replace function public.coach_link_end(p_link uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v coach_links;
begin
  select * into v from coach_links where id = p_link and auth.uid() in (coach_id, client_id) and status in ('pending','active');
  if not found then raise exception 'link_not_found'; end if;
  update coach_links set status = 'ended', ended_at = now(), ended_by = auth.uid(), scopes = '{}' where id = p_link;
  update coach_sessions set status = 'cancelled' where coach_id = v.coach_id and client_id = v.client_id and status = 'booked' and starts_at > now();
end $$;

-- هل المدرب الحالي يقدر يشوف هذا النوع من بيانات المتدرب؟ ('basic' = الربط فعّال فقط)
create or replace function public._coach_can(p_client uuid, p_scope text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from coach_links l where l.coach_id = auth.uid() and l.client_id = p_client and l.status = 'active'
                 and (p_scope = 'basic' or p_scope = any(l.scopes)));
$$;
revoke all on function public._coach_can(uuid, text) from public, anon;
grant execute on function public._coach_can(uuid, text) to authenticated;

-- سجل الاطلاع (المتدرب يشوف متى ووش شاف مدربه)
create table if not exists public.coach_access_log (
  id         bigint generated always as identity primary key,
  coach_id   uuid not null references public.profiles(id) on delete cascade,
  client_id  uuid not null references public.profiles(id) on delete cascade,
  what       text not null,
  at         timestamptz not null default now()
);
create index if not exists coach_access_client_idx on public.coach_access_log (client_id, at desc);
alter table public.coach_access_log enable row level security;
create policy cal_read on public.coach_access_log for select to authenticated using (client_id = auth.uid() or coach_id = auth.uid());

create or replace function public._coach_log(p_client uuid, p_what text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() = p_client then return; end if;
  if not exists (select 1 from coach_access_log where coach_id = auth.uid() and client_id = p_client and what = p_what and at > now() - interval '1 hour') then
    insert into coach_access_log (coach_id, client_id, what) values (auth.uid(), p_client, p_what);
  end if;
end $$;
revoke all on function public._coach_log(uuid, text) from public, anon, authenticated;

-- ---------- ملاحظات المدرب الخاصة ----------
create table if not exists public.coach_notes (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  client_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists coach_notes_idx on public.coach_notes (coach_id, client_id, created_at desc);
alter table public.coach_notes enable row level security;
create policy cn_read   on public.coach_notes for select to authenticated using (coach_id = auth.uid());
create policy cn_insert on public.coach_notes for insert to authenticated with check (coach_id = auth.uid() and _coach_can(client_id, 'basic'));
create policy cn_delete on public.coach_notes for delete to authenticated using (coach_id = auth.uid());

-- ---------- البرنامج المعيّن والالتزام ----------
create table if not exists public.coach_assignments (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  client_id     uuid not null references public.profiles(id) on delete cascade,
  program_id    uuid references public.user_programs(id) on delete set null,
  title         text not null check (char_length(btrim(title)) between 2 and 80),
  starts_on     date not null default app_today(),
  weeks         smallint not null default 4 check (weeks between 1 and 52),
  days_per_week smallint not null default 3 check (days_per_week between 1 and 7),
  notes         text check (char_length(notes) <= 600),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists coach_assign_idx on public.coach_assignments (client_id, active, starts_on desc);
alter table public.coach_assignments enable row level security;
create policy ca_read   on public.coach_assignments for select to authenticated using (auth.uid() in (coach_id, client_id));
create policy ca_insert on public.coach_assignments for insert to authenticated with check (coach_id = auth.uid() and _coach_can(client_id, 'basic'));
create policy ca_update on public.coach_assignments for update to authenticated using (coach_id = auth.uid()) with check (coach_id = auth.uid());
create policy ca_delete on public.coach_assignments for delete to authenticated using (coach_id = auth.uid());

create or replace function public._ca_notify() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update coach_assignments set active = false where client_id = new.client_id and coach_id = new.coach_id and id <> new.id and active;
  perform _notice(new.client_id, 'ca:' || new.id, 'برنامج جديد من مدربك', _person_label(new.coach_id) || ' عيّن لك: ' || new.title,
    'New program from your coach', _person_label(new.coach_id) || ' assigned: ' || new.title, '/my-coach', new.id);
  return new;
end $$;
create trigger ca_notify after insert on public.coach_assignments for each row execute function public._ca_notify();

-- ---------- الباقات والحصص ----------
create table if not exists public.coach_packages (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null default auth.uid() references public.coach_profiles(user_id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 2 and 60),
  sessions    smallint not null check (sessions between 1 and 200),
  price_sar   numeric(8,2) not null check (price_sar between 0 and 100000),
  valid_days  smallint not null default 30 check (valid_days between 1 and 365),
  description text check (char_length(description) <= 300),
  online      boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.coach_packages enable row level security;
create policy cpk_read  on public.coach_packages for select to authenticated using (active or coach_id = auth.uid());
create policy cpk_write on public.coach_packages for all to authenticated using (coach_id = auth.uid()) with check (coach_id = auth.uid());

create table if not exists public.coach_sessions (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  client_id    uuid not null references public.profiles(id) on delete cascade,
  starts_at    timestamptz not null,
  duration_min smallint not null default 60 check (duration_min between 15 and 240),
  place        text check (char_length(place) <= 80),
  status       text not null default 'booked' check (status in ('booked','done','cancelled','no_show')),
  notes        text check (char_length(notes) <= 400),
  created_at   timestamptz not null default now()
);
create index if not exists coach_sessions_coach_idx on public.coach_sessions (coach_id, starts_at);
create index if not exists coach_sessions_client_idx on public.coach_sessions (client_id, starts_at);
alter table public.coach_sessions enable row level security;
create policy cs_read   on public.coach_sessions for select to authenticated using (auth.uid() in (coach_id, client_id));
create policy cs_insert on public.coach_sessions for insert to authenticated with check (coach_id = auth.uid() and _coach_can(client_id, 'basic'));
create policy cs_update on public.coach_sessions for update to authenticated using (coach_id = auth.uid()) with check (coach_id = auth.uid());
create policy cs_delete on public.coach_sessions for delete to authenticated using (coach_id = auth.uid() and status = 'booked');

create or replace function public._cs_notify() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'booked' then
    perform _notice(new.client_id, 'cs:' || new.id, 'حصة تدريب جديدة',
      _person_label(new.coach_id) || ' حجز لك حصة ' || to_char(new.starts_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'),
      'New training session', _person_label(new.coach_id) || ' booked a session ' || to_char(new.starts_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'),
      '/my-coach', new.id);
  end if;
  return new;
end $$;
create trigger cs_notify after insert on public.coach_sessions for each row execute function public._cs_notify();

-- المتدرب يلغي حصته (قبلها بـ ٣ ساعات على الأقل)
create or replace function public.cancel_coach_session(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v coach_sessions;
begin
  select * into v from coach_sessions where id = p_id and client_id = auth.uid() and status = 'booked';
  if not found then raise exception 'booking_not_found'; end if;
  if v.starts_at < now() + interval '3 hours' then raise exception 'too_late_to_cancel'; end if;
  update coach_sessions set status = 'cancelled' where id = p_id;
  perform _notice(v.coach_id, 'csc:' || p_id, 'انلغت حصة', _person_label(auth.uid()) || ' لغى حصة ' || to_char(v.starts_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'),
    'Session cancelled', _person_label(auth.uid()) || ' cancelled the session on ' || to_char(v.starts_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'), '/coaching', p_id);
end $$;

-- ---------- تقييم المدربين (للي تدربوا معه فعلاً) ----------
create table if not exists public.coach_reviews (
  coach_id   uuid not null references public.coach_profiles(user_id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  rating     smallint not null check (rating between 1 and 5),
  body       text check (char_length(body) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (coach_id, user_id)
);
alter table public.coach_reviews enable row level security;
create policy cr_read   on public.coach_reviews for select to authenticated using (true);
create policy cr_insert on public.coach_reviews for insert to authenticated with check (user_id = auth.uid());
create policy cr_update on public.coach_reviews for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cr_delete on public.coach_reviews for delete to authenticated using (user_id = auth.uid());

create or replace function public._cr_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from coach_links l where l.coach_id = new.coach_id and l.client_id = new.user_id and l.accepted_at is not null) then
    raise exception 'not_a_client';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger cr_guard before insert or update on public.coach_reviews for each row execute function public._cr_guard();

-- ---------- القراءة: دليل المدربين وصفحة المدرب ----------
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
  where (p_q is null or btrim(p_q) = '' or p.username ilike '%' || btrim(p_q) || '%' or p.full_name ilike '%' || btrim(p_q) || '%' or c.headline ilike '%' || btrim(p_q) || '%')
    and (p_specialty is null or p_specialty = any(c.specialties))
    and (p_city is null or c.city ilike p_city)
    and (p_gym is null or exists (select 1 from coach_gyms cg where cg.coach_id = c.user_id and cg.gym_id = p_gym and cg.status = 'approved'))
  order by p.is_coach desc, 15 desc nulls last, 17 desc, c.created_at
  limit 100;
$$;
revoke all on function public.coaches_directory(text, text, text, uuid) from public, anon;
grant execute on function public.coaches_directory(text, text, text, uuid) to authenticated;

create or replace function public.coach_detail(p_coach uuid)
returns table (user_id uuid, username text, full_name text, avatar_url text, verified boolean, headline text, bio text, specialties text[],
               years_exp smallint, certifications text, languages text[], city text, trains text, online boolean, in_person boolean,
               price_from_sar numeric, accepting boolean, instagram text, rating numeric, reviews integer, clients integer,
               gyms jsonb, my_link_id uuid, my_link_status text, my_link_by text, my_scopes text[], can_review boolean, is_me boolean)
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
         c.user_id = auth.uid()
  from coach_profiles c join profiles p on p.id = c.user_id
  left join lateral (select * from coach_links x where x.coach_id = c.user_id and x.client_id = auth.uid() and x.status in ('pending','active')
                     order by x.created_at desc limit 1) l on true
  where c.user_id = p_coach;
$$;
revoke all on function public.coach_detail(uuid) from public, anon;
grant execute on function public.coach_detail(uuid) to authenticated;

create or replace function public.coach_reviews_list(p_coach uuid)
returns table (user_id uuid, username text, full_name text, avatar_url text, rating smallint, body text, updated_at timestamptz, is_me boolean)
language sql stable security definer set search_path = public as $$
  select r.user_id, p.username, p.full_name, p.avatar_url, r.rating, r.body, r.updated_at, r.user_id = auth.uid()
  from coach_reviews r join profiles p on p.id = r.user_id where r.coach_id = p_coach order by r.updated_at desc limit 100;
$$;
revoke all on function public.coach_reviews_list(uuid) from public, anon;
grant execute on function public.coach_reviews_list(uuid) to authenticated;

-- ---------- لوحة المدرب: متدربيني + الالتزام ----------
create or replace function public._adherence(p_client uuid, p_days_per_week smallint, p_since date)
returns integer language sql stable security definer set search_path = public as $$
  select least(100, round(100.0 * (
      select count(distinct (s.started_at at time zone 'Asia/Riyadh')::date) from workout_sessions s
      where s.user_id = p_client and s.started_at >= greatest(p_since, app_today() - 27)::timestamp at time zone 'Asia/Riyadh')
    / greatest(1, round(coalesce(p_days_per_week, 3) * least(28, app_today() - greatest(p_since, app_today() - 27) + 1) / 7.0))))::int;
$$;
revoke all on function public._adherence(uuid, smallint, date) from public, anon, authenticated;

create or replace function public.coach_clients()
returns table (link_id uuid, client_id uuid, username text, full_name text, avatar_url text, status text, requested_by text, scopes text[],
               message text, created_at timestamptz, accepted_at timestamptz, last_workout_at timestamptz, last_visit_at timestamptz,
               program text, adherence integer, next_session_at timestamptz, sessions_done integer)
language sql stable security definer set search_path = public as $$
  select l.id, l.client_id, p.username, p.full_name, p.avatar_url, l.status, l.requested_by, l.scopes, l.message, l.created_at, l.accepted_at,
         case when l.status = 'active' and 'workouts' = any(l.scopes) then (select max(s.started_at) from workout_sessions s where s.user_id = l.client_id) end,
         case when l.status = 'active' and 'visits' = any(l.scopes) then (select max(c.checked_in_at) from check_ins c where c.user_id = l.client_id) end,
         a.title,
         case when l.status = 'active' and 'workouts' = any(l.scopes) then _adherence(l.client_id, a.days_per_week, coalesce(a.starts_on, l.accepted_at::date)) end,
         (select min(cs.starts_at) from coach_sessions cs where cs.coach_id = l.coach_id and cs.client_id = l.client_id and cs.status = 'booked' and cs.starts_at > now()),
         (select count(*) from coach_sessions cs where cs.coach_id = l.coach_id and cs.client_id = l.client_id and cs.status = 'done')::int
  from coach_links l join profiles p on p.id = l.client_id
  left join lateral (select * from coach_assignments x where x.coach_id = l.coach_id and x.client_id = l.client_id and x.active order by x.created_at desc limit 1) a on true
  where l.coach_id = auth.uid() and l.status in ('pending','active')
  order by l.status = 'pending' desc, l.accepted_at desc nulls last;
$$;
revoke all on function public.coach_clients() from public, anon;
grant execute on function public.coach_clients() to authenticated;

-- ---------- المتدرب: مدربيني ----------
create or replace function public.my_coaches()
returns table (link_id uuid, coach_id uuid, username text, full_name text, avatar_url text, verified boolean, headline text,
               status text, requested_by text, scopes text[], message text, created_at timestamptz, accepted_at timestamptz,
               program text, program_days smallint, program_notes text, next_session_at timestamptz, last_access_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, l.coach_id, p.username, p.full_name, p.avatar_url, p.is_coach, cp.headline, l.status, l.requested_by, l.scopes, l.message,
         l.created_at, l.accepted_at, a.title, a.days_per_week, a.notes,
         (select min(cs.starts_at) from coach_sessions cs where cs.coach_id = l.coach_id and cs.client_id = l.client_id and cs.status = 'booked' and cs.starts_at > now()),
         (select max(g.at) from coach_access_log g where g.coach_id = l.coach_id and g.client_id = l.client_id)
  from coach_links l join profiles p on p.id = l.coach_id left join coach_profiles cp on cp.user_id = l.coach_id
  left join lateral (select * from coach_assignments x where x.coach_id = l.coach_id and x.client_id = l.client_id and x.active order by x.created_at desc limit 1) a on true
  where l.client_id = auth.uid() and l.status in ('pending','active')
  order by l.status = 'pending' desc, l.accepted_at desc nulls last;
$$;
revoke all on function public.my_coaches() from public, anon;
grant execute on function public.my_coaches() to authenticated;

-- ---------- السجل الكامل (للمتدرب نفسه أو مدربه حسب الصلاحيات) ----------
create or replace function public.client_timeline(p_client uuid, p_from date default null, p_to date default null)
returns table (at timestamptz, kind text, title text, detail jsonb)
language plpgsql stable security definer set search_path = public as $$
declare
  v_self boolean := auth.uid() = p_client;
  v_to date := coalesce(p_to, app_today());
  v_from date := greatest(coalesce(p_from, coalesce(p_to, app_today()) - 29), coalesce(p_to, app_today()) - 91);
  v_ts timestamptz; v_te timestamptz;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not v_self and not _coach_can(p_client, 'basic') then raise exception 'not_allowed'; end if;
  v_ts := v_from::timestamp at time zone 'Asia/Riyadh';
  v_te := (v_to + 1)::timestamp at time zone 'Asia/Riyadh';

  if v_self or _coach_can(p_client, 'workouts') then
    perform _coach_log(p_client, 'workouts');
    return query
      select s.started_at, 'workout'::text, coalesce(s.title, ''),
             jsonb_build_object('sets', count(w.id), 'volume', coalesce(sum(w.reps * w.weight_kg), 0),
                                'exercises', count(distinct w.exercise_id), 'minutes', round(extract(epoch from (s.finished_at - s.started_at)) / 60))
      from workout_sessions s left join workout_sets w on w.session_id = s.id
      where s.user_id = p_client and s.started_at >= v_ts and s.started_at < v_te
      group by s.id;
  end if;
  if v_self or _coach_can(p_client, 'visits') then
    perform _coach_log(p_client, 'visits');
    return query
      select c.checked_in_at, 'visit'::text, coalesce(g.name, g.name_en, ''),
             jsonb_build_object('gym_id', c.gym_id, 'minutes', round(extract(epoch from (coalesce(c.checked_out_at, c.checked_in_at) - c.checked_in_at)) / 60))
      from check_ins c join gyms g on g.id = c.gym_id
      where c.user_id = p_client and c.checked_in_at >= v_ts and c.checked_in_at < v_te;
  end if;
  if v_self or _coach_can(p_client, 'inbody') then
    perform _coach_log(p_client, 'inbody');
    return query
      select coalesce(r.test_date::timestamp at time zone 'Asia/Riyadh', r.created_at), 'inbody'::text, ''::text,
             jsonb_strip_nulls(jsonb_build_object('weight_kg', r.metrics->'weight_kg', 'pbf_pct', r.metrics->'pbf_pct', 'smm_kg', r.metrics->'smm_kg', 'bmi', r.metrics->'bmi'))
      from inbody_reports r
      where r.user_id = p_client and coalesce(r.test_date, r.created_at::date) between v_from and v_to;
  end if;
  if v_self or _coach_can(p_client, 'health') then
    perform _coach_log(p_client, 'health');
    return query
      select h.day::timestamp at time zone 'Asia/Riyadh' + interval '23 hours', 'health'::text, ''::text,
             jsonb_strip_nulls(jsonb_build_object('steps', h.steps, 'sleep_min', h.sleep_min, 'resting_hr', h.resting_hr, 'recovery', h.recovery))
      from daily_health h where h.user_id = p_client and h.day between v_from and v_to;
  end if;
  if v_self or _coach_can(p_client, 'food') then
    perform _coach_log(p_client, 'food');
    return query
      select f.eaten_on::timestamp at time zone 'Asia/Riyadh' + interval '22 hours', 'food'::text, ''::text,
             jsonb_build_object('kcal', sum(f.kcal), 'protein_g', round(sum(f.protein_g)), 'items', count(*))
      from food_logs f where f.user_id = p_client and f.eaten_on between v_from and v_to
      group by f.eaten_on;
  end if;
  return query
    select cs.starts_at, 'session'::text, _person_label(cs.coach_id),
           jsonb_build_object('status', cs.status, 'minutes', cs.duration_min, 'place', cs.place, 'id', cs.id)
    from coach_sessions cs
    where cs.client_id = p_client and (v_self or cs.coach_id = auth.uid()) and cs.starts_at >= v_ts and cs.starts_at < v_te;
  return query
    select a.created_at, 'program'::text, a.title, jsonb_build_object('days_per_week', a.days_per_week, 'weeks', a.weeks, 'coach', _person_label(a.coach_id))
    from coach_assignments a
    where a.client_id = p_client and (v_self or a.coach_id = auth.uid()) and a.created_at >= v_ts and a.created_at < v_te;
  if not v_self then
    return query
      select n.created_at, 'note'::text, n.body, '{}'::jsonb from coach_notes n
      where n.coach_id = auth.uid() and n.client_id = p_client and n.created_at >= v_ts and n.created_at < v_te;
  end if;
end $$;
revoke all on function public.client_timeline(uuid, date, date) from public, anon;
grant execute on function public.client_timeline(uuid, date, date) to authenticated;

-- ---------- التقرير الشهري ----------
create or replace function public.client_month_report(p_client uuid, p_month date default null)
returns table (month date, workouts integer, workout_days integer, volume_kg numeric, top_exercises text[], visits integer,
               sessions_done integer, sessions_missed integer, adherence integer, weight_start numeric, weight_end numeric,
               pbf_start numeric, pbf_end numeric, avg_steps integer, avg_sleep_min integer, avg_kcal integer, avg_protein integer)
language plpgsql stable security definer set search_path = public as $$
declare
  v_self boolean := auth.uid() = p_client;
  v_ms date := date_trunc('month', coalesce(p_month, app_today()))::date;
  v_me date := (date_trunc('month', coalesce(p_month, app_today())) + interval '1 month - 1 day')::date;
  v_ts timestamptz := v_ms::timestamp at time zone 'Asia/Riyadh';
  v_te timestamptz := (v_me + 1)::timestamp at time zone 'Asia/Riyadh';
  v_w boolean; v_v boolean; v_i boolean; v_h boolean; v_f boolean; v_dpw smallint; v_days integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not v_self and not _coach_can(p_client, 'basic') then raise exception 'not_allowed'; end if;
  v_w := v_self or _coach_can(p_client, 'workouts'); v_v := v_self or _coach_can(p_client, 'visits');
  v_i := v_self or _coach_can(p_client, 'inbody');   v_h := v_self or _coach_can(p_client, 'health');
  v_f := v_self or _coach_can(p_client, 'food');
  perform _coach_log(p_client, 'report');
  month := v_ms;
  if v_w then
    select count(distinct s.id)::int, count(distinct (s.started_at at time zone 'Asia/Riyadh')::date)::int, coalesce(sum(w.reps * w.weight_kg), 0)
      into workouts, workout_days, volume_kg
      from workout_sessions s left join workout_sets w on w.session_id = s.id
      where s.user_id = p_client and s.started_at >= v_ts and s.started_at < v_te;
    select coalesce(array_agg(e.exercise_id), '{}') into top_exercises from (
      select w.exercise_id from workout_sets w join workout_sessions s on s.id = w.session_id
      where s.user_id = p_client and s.started_at >= v_ts and s.started_at < v_te
      group by w.exercise_id order by count(*) desc limit 3) e;
    select x.days_per_week into v_dpw from coach_assignments x where x.client_id = p_client and x.active
      and (v_self or x.coach_id = auth.uid()) order by x.created_at desc limit 1;
    v_days := least(v_me, app_today()) - v_ms + 1;
    adherence := case when v_days > 0 then least(100, round(100.0 * workout_days / greatest(1, round(coalesce(v_dpw, 3) * v_days / 7.0))))::int end;
  end if;
  if v_v then
    select count(*)::int into visits from check_ins c where c.user_id = p_client and c.checked_in_at >= v_ts and c.checked_in_at < v_te;
  end if;
  select count(*) filter (where cs.status = 'done')::int, count(*) filter (where cs.status = 'no_show')::int
    into sessions_done, sessions_missed
    from coach_sessions cs where cs.client_id = p_client and (v_self or cs.coach_id = auth.uid()) and cs.starts_at >= v_ts and cs.starts_at < v_te;
  if v_i then
    select (r.metrics->>'weight_kg')::numeric, (r.metrics->>'pbf_pct')::numeric into weight_start, pbf_start
      from inbody_reports r where r.user_id = p_client and coalesce(r.test_date, r.created_at::date) between v_ms and v_me
      order by coalesce(r.test_date, r.created_at::date), r.created_at limit 1;
    select (r.metrics->>'weight_kg')::numeric, (r.metrics->>'pbf_pct')::numeric into weight_end, pbf_end
      from inbody_reports r where r.user_id = p_client and coalesce(r.test_date, r.created_at::date) between v_ms and v_me
      order by coalesce(r.test_date, r.created_at::date) desc, r.created_at desc limit 1;
  end if;
  if v_h then
    select round(avg(h.steps))::int, round(avg(h.sleep_min))::int into avg_steps, avg_sleep_min
      from daily_health h where h.user_id = p_client and h.day between v_ms and v_me;
  end if;
  if v_f then
    select round(avg(d.k))::int, round(avg(d.p))::int into avg_kcal, avg_protein from (
      select sum(f.kcal) k, sum(f.protein_g) p from food_logs f where f.user_id = p_client and f.eaten_on between v_ms and v_me group by f.eaten_on) d;
  end if;
  return next;
end $$;
revoke all on function public.client_month_report(uuid, date) from public, anon;
grant execute on function public.client_month_report(uuid, date) to authenticated;

-- ---------- مدربين النادي (صفحة النادي) + اعتمادهم ----------
create or replace function public.gym_coaches(p_gym uuid)
returns table (user_id uuid, username text, full_name text, avatar_url text, verified boolean, headline text, specialties text[],
               rating numeric, reviews integer, status text)
language sql stable security definer set search_path = public as $$
  select c.user_id, p.username, p.full_name, p.avatar_url, p.is_coach, c.headline, c.specialties,
         (select round(avg(r.rating), 1) from coach_reviews r where r.coach_id = c.user_id),
         (select count(*) from coach_reviews r where r.coach_id = c.user_id)::int, cg.status
  from coach_gyms cg join coach_profiles c on c.user_id = cg.coach_id join profiles p on p.id = c.user_id
  where cg.gym_id = p_gym and (cg.status = 'approved' or can_manage_gym_or_chain(p_gym))
  order by cg.status = 'pending' desc, p.is_coach desc, 8 desc nulls last;
$$;
revoke all on function public.gym_coaches(uuid) from public, anon;
grant execute on function public.gym_coaches(uuid) to authenticated;

-- طلبات توثيق المدربين للوحة المالك
create or replace function public.coach_verification_queue()
returns table (user_id uuid, username text, full_name text, headline text, certifications text, years_exp smallint, requested_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.user_id, p.username, p.full_name, c.headline, c.certifications, c.years_exp, c.verify_requested_at
  from coach_profiles c join profiles p on p.id = c.user_id
  where is_admin() and c.verify_requested_at is not null and not p.is_coach
  order by c.verify_requested_at;
$$;
revoke all on function public.coach_verification_queue() from public, anon;
grant execute on function public.coach_verification_queue() to authenticated;

revoke all on function public.coach_invite(text, text) from public, anon;
revoke all on function public.coach_request(uuid, text[], text) from public, anon;
revoke all on function public.coach_link_respond(uuid, boolean, text[]) from public, anon;
revoke all on function public.coach_link_scopes(uuid, text[]) from public, anon;
revoke all on function public.coach_link_end(uuid) from public, anon;
revoke all on function public.cancel_coach_session(uuid) from public, anon;
grant execute on function public.coach_invite(text, text), public.coach_request(uuid, text[], text), public.coach_link_respond(uuid, boolean, text[]),
  public.coach_link_scopes(uuid, text[]), public.coach_link_end(uuid), public.cancel_coach_session(uuid) to authenticated;

-- المراسلة: المدرب والمتدرب المرتبطين يقدرون يتراسلون حتى بدون متابعة متبادلة
create or replace function public.mutual_follow(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select a <> b and (
    (exists (select 1 from follows where follower = a and followee = b) and exists (select 1 from follows where follower = b and followee = a))
    or exists (select 1 from coach_links l where l.status = 'active' and ((l.coach_id = a and l.client_id = b) or (l.coach_id = b and l.client_id = a))));
$$;
