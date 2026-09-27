-- ARQ — إعداد قاعدة البيانات كاملة (مرة وحدة)
-- الصق هذا الملف كله في Supabase > SQL Editor > New query ثم Run.
-- مولّد تلقائياً من supabase/migrations (13 ملف) — لا تعدّله يدوياً: npm run db:bundle

-- ===================== 20260926000000_init.sql =====================
-- =====================================================================
-- نبض النادي | Gym Social — المخطط الأساسي لقاعدة البيانات (Supabase / Postgres)
-- يشمل: الملفات الشخصية، الأندية، الخطط، الحضور بالموقع، النقاط والمنافسة،
-- الأصدقاء، التحديات، المنشورات والتعليقات، والتخزين.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ثوابت وأدوات مساعدة
-- ---------------------------------------------------------------------

-- "اليوم" حسب توقيت الرياض (يستخدم لحساب نقاط الحضور اليومية والسلسلة)
create or replace function public.app_today()
returns date language sql stable as $$
  select (now() at time zone 'Asia/Riyadh')::date;
$$;

-- المسافة بالمتر بين نقطتين (Haversine) — بدون الحاجة لـ PostGIS
create or replace function public.distance_m(lat1 double precision, lng1 double precision,
                                             lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- ---------------------------------------------------------------------
-- الأندية
-- ---------------------------------------------------------------------
create table public.gyms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  name_en     text,
  city        text,
  lat         double precision not null,
  lng         double precision not null,
  radius_m    integer not null default 150 check (radius_m between 30 and 1000),
  verified    boolean not null default false,  -- النقاط تُحتسب فقط في الأندية الموثّقة (ضد الغش)
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- الملف الشخصي العام (يراه الجميع) + الملف الصحي الخاص (صاحبه فقط)
-- ---------------------------------------------------------------------
create table public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  username         text unique not null check (username ~ '^[a-zA-Z0-9_.]{3,24}$'),
  full_name        text,
  avatar_url       text,
  bio              text check (char_length(bio) <= 200),
  gym_id           uuid references public.gyms(id) on delete set null,
  locale           text not null default 'ar' check (locale in ('ar','en')),
  points           integer not null default 0,
  streak           integer not null default 0,
  best_streak      integer not null default 0,
  last_checkin_on  date,
  onboarded        boolean not null default false,
  created_at       timestamptz not null default now()
);

create table public.health_profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  gender         text check (gender in ('male','female')),
  birth_year     integer check (birth_year between 1920 and 2015),
  height_cm      numeric(5,1) check (height_cm between 100 and 250),
  weight_kg      numeric(5,1) check (weight_kg between 30 and 300),
  goal           text check (goal in ('lose','gain','maintain','fit')),
  level          text check (level in ('beginner','intermediate','advanced')),
  days_per_week  integer check (days_per_week between 2 and 6),
  updated_at     timestamptz not null default now()
);

-- سجل الوزن وصور التقدم (خاص)
create table public.body_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  weight_kg   numeric(5,1) not null check (weight_kg between 30 and 300),
  photo_path  text,          -- مسار داخل حاوية body (خاصة)
  note        text,
  created_at  timestamptz not null default now()
);
create index on public.body_logs (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- الخطة الأسبوعية (تمارين + وجبات) — محفوظة كـ JSON
-- ---------------------------------------------------------------------
create table public.plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  source      text not null check (source in ('ai','rules')),
  data        jsonb not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index on public.plans (user_id, created_at desc);
create unique index plans_one_active on public.plans (user_id) where active;

create table public.workout_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  plan_id     uuid references public.plans(id) on delete set null,
  day_index   integer not null check (day_index between 0 and 6),
  done_on     date not null default public.app_today(),
  created_at  timestamptz not null default now(),
  unique (user_id, done_on)
);

-- ---------------------------------------------------------------------
-- الحضور + النقاط
-- ---------------------------------------------------------------------
create table public.check_ins (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  gym_id           uuid not null references public.gyms(id) on delete cascade,
  checked_in_at    timestamptz not null default now(),
  checked_out_at   timestamptz,
  lat              double precision,
  lng              double precision,
  distance_m       integer,
  points_awarded   integer not null default 0
);
create index on public.check_ins (user_id, checked_in_at desc);
create index on public.check_ins (gym_id, checked_in_at desc);

create table public.points_ledger (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  amount      integer not null,
  reason      text not null check (reason in ('checkin','streak_bonus','long_session','workout','challenge_win')),
  ref_id      uuid,
  created_at  timestamptz not null default now()
);
create index on public.points_ledger (user_id, created_at desc);
create index on public.points_ledger (created_at);

-- ---------------------------------------------------------------------
-- الأصدقاء
-- ---------------------------------------------------------------------
create table public.friendships (
  id          uuid primary key default gen_random_uuid(),
  requester   uuid not null references public.profiles(id) on delete cascade,
  addressee   uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending','accepted')),
  created_at  timestamptz not null default now(),
  check (requester <> addressee)
);
create unique index friendships_pair on public.friendships
  (least(requester, addressee), greatest(requester, addressee));

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from friendships
    where status = 'accepted'
      and ((requester = a and addressee = b) or (requester = b and addressee = a))
  );
$$;

-- ---------------------------------------------------------------------
-- المنشورات والإعجابات والتعليقات
-- ---------------------------------------------------------------------
create table public.posts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  image_path   text,               -- مسار داخل حاوية posts
  caption      text check (char_length(caption) <= 1000),
  check_in_id  uuid references public.check_ins(id) on delete set null,
  visibility   text not null default 'friends' check (visibility in ('public','friends')),
  created_at   timestamptz not null default now(),
  check (image_path is not null or coalesce(caption,'') <> '')
);
create index on public.posts (created_at desc);

create table public.post_likes (
  post_id     uuid not null references public.posts(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 500),
  created_at  timestamptz not null default now()
);
create index on public.comments (post_id, created_at);

create or replace function public.can_see_post(p_owner uuid, p_visibility text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_owner = auth.uid() or p_visibility = 'public' or are_friends(p_owner, auth.uid());
$$;

-- ---------------------------------------------------------------------
-- التحديات
-- ---------------------------------------------------------------------
create table public.challenges (
  id          uuid primary key default gen_random_uuid(),
  creator     uuid not null references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 3 and 80),
  metric      text not null check (metric in ('checkins','workouts','points')),
  target      integer check (target > 0),
  starts_on   date not null,
  ends_on     date not null,
  settled     boolean not null default false,
  created_at  timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 90)
);

create table public.challenge_members (
  challenge_id  uuid not null references public.challenges(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  status        text not null default 'invited' check (status in ('invited','joined')),
  joined_at     timestamptz,
  primary key (challenge_id, user_id)
);

create or replace function public.is_challenge_member(p_challenge uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from challenge_members where challenge_id = p_challenge and user_id = auth.uid())
      or exists (select 1 from challenges where id = p_challenge and creator = auth.uid());
$$;

-- =====================================================================
-- المشغّلات (Triggers)
-- =====================================================================

-- إنشاء ملف شخصي تلقائياً عند التسجيل
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_username text := coalesce(nullif(new.raw_user_meta_data->>'username', ''),
                              'user_' || substr(replace(new.id::text, '-', ''), 1, 8));
begin
  if exists (select 1 from profiles where username = v_username) then
    v_username := left(v_username, 15) || '_' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  insert into profiles (id, username, full_name, locale)
  values (new.id, v_username, new.raw_user_meta_data->>'full_name',
          coalesce(nullif(new.raw_user_meta_data->>'locale', ''), 'ar'));
  insert into health_profiles (user_id, gender)
  values (new.id, case when new.raw_user_meta_data->>'gender' in ('male','female')
                       then new.raw_user_meta_data->>'gender' end);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- منشئ التحدي يصبح عضواً فيه تلقائياً
create or replace function public.handle_new_challenge()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into challenge_members (challenge_id, user_id, status, joined_at)
  values (new.id, new.creator, 'joined', now());
  return new;
end $$;

create trigger on_challenge_created
  after insert on public.challenges
  for each row execute function public.handle_new_challenge();

-- =====================================================================
-- الدوال (RPC) — كل منطق النقاط يتم في الخادم حتى لا يمكن التلاعب به
-- =====================================================================

-- إضافة نقاط (داخلية)
create or replace function public._award(p_user uuid, p_amount integer, p_reason text, p_ref uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into points_ledger (user_id, amount, reason, ref_id) values (p_user, p_amount, p_reason, p_ref);
  update profiles set points = points + p_amount where id = p_user;
end $$;
revoke all on function public._award(uuid, integer, text, uuid) from public, anon, authenticated;

-- تسجيل الحضور: يتحقق أن المستخدم داخل نطاق النادي
create or replace function public.check_in(p_gym uuid, p_lat double precision, p_lng double precision,
                                           p_accuracy double precision default 0)
returns public.check_ins
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_gym    gyms;
  v_dist   double precision;
  v_today  date := app_today();
  v_prof   profiles;
  v_row    check_ins;
  v_points integer := 0;
  v_streak integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_gym from gyms where id = p_gym;
  if not found then raise exception 'gym_not_found'; end if;

  v_dist := distance_m(p_lat, p_lng, v_gym.lat, v_gym.lng);
  -- نسمح بهامش دقة GPS حتى 50م إضافية
  if v_dist > v_gym.radius_m + least(greatest(coalesce(p_accuracy, 0), 0), 50) then
    raise exception 'too_far:%', round(v_dist);
  end if;

  if exists (select 1 from check_ins where user_id = v_uid and checked_out_at is null
             and checked_in_at > now() - interval '6 hours') then
    raise exception 'already_checked_in';
  end if;

  select * into v_prof from profiles where id = v_uid for update;

  insert into check_ins (user_id, gym_id, lat, lng, distance_m)
  values (v_uid, p_gym, p_lat, p_lng, round(v_dist))
  returning * into v_row;

  -- أول حضور في اليوم فقط يحصل على نقاط، وفي نادٍ موثّق
  if v_gym.verified and (v_prof.last_checkin_on is null or v_prof.last_checkin_on < v_today) then
    v_streak := case when v_prof.last_checkin_on = v_today - 1 then v_prof.streak + 1 else 1 end;
    v_points := 10;
    perform _award(v_uid, 10, 'checkin', v_row.id);
    if v_streak % 7 = 0 then
      perform _award(v_uid, 25, 'streak_bonus', v_row.id);
      v_points := v_points + 25;
    end if;
    update profiles
       set streak = v_streak,
           best_streak = greatest(best_streak, v_streak),
           last_checkin_on = v_today
     where id = v_uid;
    update check_ins set points_awarded = v_points where id = v_row.id returning * into v_row;
  end if;

  return v_row;
end $$;

-- تسجيل الخروج: جلسة 45 دقيقة فأكثر = +5 نقاط
create or replace function public.check_out(p_check_in uuid)
returns public.check_ins
language plpgsql security definer set search_path = public as $$
declare
  v_row check_ins;
begin
  update check_ins set checked_out_at = now()
   where id = p_check_in and user_id = auth.uid() and checked_out_at is null
  returning * into v_row;
  if not found then raise exception 'check_in_not_open'; end if;

  if v_row.points_awarded > 0
     and v_row.checked_out_at - v_row.checked_in_at >= interval '45 minutes'
     and v_row.checked_out_at - v_row.checked_in_at <= interval '5 hours' then
    perform _award(v_row.user_id, 5, 'long_session', v_row.id);
    update check_ins set points_awarded = points_awarded + 5 where id = v_row.id returning * into v_row;
  end if;
  return v_row;
end $$;

-- إنهاء تمرين اليوم من الخطة: +15 نقطة (مرة في اليوم)
create or replace function public.complete_workout(p_plan uuid, p_day integer)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from plans where id = p_plan and user_id = auth.uid()) then
    raise exception 'plan_not_found';
  end if;
  insert into workout_logs (user_id, plan_id, day_index)
  values (auth.uid(), p_plan, p_day)
  on conflict (user_id, done_on) do nothing
  returning id into v_id;
  if v_id is null then return 0; end if;
  perform _award(auth.uid(), 15, 'workout', v_id);
  return 15;
end $$;

-- لوحة الصدارة: scope = friends | gym | global، منذ تاريخ معيّن
create or replace function public.leaderboard(p_scope text, p_since timestamptz, p_limit integer default 50)
returns table (user_id uuid, username text, full_name text, avatar_url text,
               points bigint, streak integer, rank bigint)
language sql stable security definer set search_path = public as $$
  with me as (select id, gym_id from profiles where id = auth.uid()),
  pool as (
    select p.* from profiles p, me
    where case p_scope
      when 'friends' then p.id = me.id or are_friends(p.id, me.id)
      when 'gym'     then me.gym_id is not null and p.gym_id = me.gym_id
      else true
    end
  ),
  scores as (
    select pool.id, pool.username, pool.full_name, pool.avatar_url, pool.streak,
           coalesce(sum(l.amount), 0)::bigint as pts
    from pool
    left join points_ledger l on l.user_id = pool.id and l.created_at >= p_since
    group by pool.id, pool.username, pool.full_name, pool.avatar_url, pool.streak
  )
  select id, username, full_name, avatar_url, pts, streak,
         rank() over (order by pts desc, streak desc)
  from scores
  order by pts desc, streak desc
  limit least(p_limit, 200);
$$;

-- ترتيب المشاركين في تحدٍّ
create or replace function public.challenge_standings(p_challenge uuid)
returns table (user_id uuid, username text, avatar_url text, status text, score bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  c challenges;
  v_from timestamptz;
  v_to   timestamptz;
begin
  if not is_challenge_member(p_challenge) then raise exception 'forbidden'; end if;
  select * into c from challenges where id = p_challenge;
  v_from := (c.starts_on::timestamp at time zone 'Asia/Riyadh');
  v_to   := ((c.ends_on + 1)::timestamp at time zone 'Asia/Riyadh');

  return query
  select m.user_id, p.username, p.avatar_url, m.status,
         case c.metric
           when 'checkins' then (select count(distinct (ci.checked_in_at at time zone 'Asia/Riyadh')::date)
                                   from check_ins ci
                                  where ci.user_id = m.user_id and ci.points_awarded > 0
                                    and ci.checked_in_at >= v_from and ci.checked_in_at < v_to)
           when 'workouts' then (select count(*) from workout_logs w
                                  where w.user_id = m.user_id and w.done_on between c.starts_on and c.ends_on)
           else (select coalesce(sum(l.amount), 0) from points_ledger l
                  where l.user_id = m.user_id and l.reason <> 'challenge_win'
                    and l.created_at >= v_from and l.created_at < v_to)
         end::bigint as score
  from challenge_members m join profiles p on p.id = m.user_id
  where m.challenge_id = p_challenge
  order by score desc;
end $$;

-- تسوية تحدٍّ منتهٍ: الفائز (أو الفائزون عند التعادل) +50 نقطة
create or replace function public.settle_challenge(p_challenge uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c challenges;
  v_top bigint;
  r record;
begin
  select * into c from challenges where id = p_challenge for update;
  if not found or c.settled or c.ends_on >= app_today() then return; end if;
  if not is_challenge_member(p_challenge) then raise exception 'forbidden'; end if;

  select max(s.score) into v_top from challenge_standings(p_challenge) s where s.status = 'joined';
  if coalesce(v_top, 0) > 0
     and (select count(*) from challenge_members where challenge_id = p_challenge and status = 'joined') > 1 then
    for r in select s.user_id from challenge_standings(p_challenge) s
             where s.status = 'joined' and s.score = v_top loop
      perform _award(r.user_id, 50, 'challenge_win', p_challenge);
    end loop;
  end if;
  update challenges set settled = true where id = p_challenge;
end $$;

-- الانضمام لتحدٍّ مدعو إليه
create or replace function public.join_challenge(p_challenge uuid)
returns void language sql security definer set search_path = public as $$
  update challenge_members set status = 'joined', joined_at = now()
   where challenge_id = p_challenge and user_id = auth.uid() and status = 'invited';
$$;

-- المنشورات مع العدادات
create or replace function public.feed(p_before timestamptz default now(), p_limit integer default 20,
                                       p_post uuid default null)
returns table (id uuid, user_id uuid, username text, full_name text, avatar_url text,
               image_path text, caption text, check_in_id uuid, gym_name text,
               created_at timestamptz, like_count bigint, comment_count bigint, liked_by_me boolean)
language sql stable security definer set search_path = public as $$
  select po.id, po.user_id, pr.username, pr.full_name, pr.avatar_url,
         po.image_path, po.caption, po.check_in_id, g.name,
         po.created_at,
         (select count(*) from post_likes l where l.post_id = po.id),
         (select count(*) from comments c where c.post_id = po.id),
         exists (select 1 from post_likes l where l.post_id = po.id and l.user_id = auth.uid())
  from posts po
  join profiles pr on pr.id = po.user_id
  left join check_ins ci on ci.id = po.check_in_id
  left join gyms g on g.id = ci.gym_id
  where (p_post is not null or po.created_at < p_before)
    and (p_post is null or po.id = p_post)
    and can_see_post(po.user_id, po.visibility)
  order by po.created_at desc
  limit least(p_limit, 50);
$$;

-- الأندية القريبة
create or replace function public.nearby_gyms(p_lat double precision, p_lng double precision,
                                              p_km double precision default 25)
returns table (id uuid, name text, name_en text, city text, lat double precision,
               lng double precision, radius_m integer, verified boolean, distance_m double precision)
language sql stable as $$
  select g.id, g.name, g.name_en, g.city, g.lat, g.lng, g.radius_m, g.verified,
         distance_m(p_lat, p_lng, g.lat, g.lng) as d
  from gyms g
  where distance_m(p_lat, p_lng, g.lat, g.lng) <= p_km * 1000
  order by d
  limit 50;
$$;

-- =====================================================================
-- الصلاحيات (Row Level Security)
-- =====================================================================
alter table public.gyms              enable row level security;
alter table public.profiles          enable row level security;
alter table public.health_profiles   enable row level security;
alter table public.body_logs         enable row level security;
alter table public.plans             enable row level security;
alter table public.workout_logs      enable row level security;
alter table public.check_ins         enable row level security;
alter table public.points_ledger     enable row level security;
alter table public.friendships       enable row level security;
alter table public.posts             enable row level security;
alter table public.post_likes        enable row level security;
alter table public.comments          enable row level security;
alter table public.challenges        enable row level security;
alter table public.challenge_members enable row level security;

-- الأندية: الكل يقرأ، أي مستخدم يضيف نادياً (غير موثّق)
create policy gyms_read   on public.gyms for select to authenticated using (true);
create policy gyms_insert on public.gyms for insert to authenticated
  with check (created_by = auth.uid() and verified = false);

-- الملف العام: الكل يقرأ، صاحبه يعدّل الحقول المسموحة فقط
create policy profiles_read   on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (username, full_name, avatar_url, bio, gym_id, locale, onboarded)
  on public.profiles to authenticated;

-- الملف الصحي وسجل الجسم والخطط: صاحبها فقط
create policy health_own on public.health_profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy body_own on public.body_logs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy plans_own on public.plans for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- سجلات التمارين والحضور والنقاط: قراءة فقط (الكتابة عبر الدوال)
create policy workout_logs_read on public.workout_logs for select to authenticated
  using (user_id = auth.uid() or are_friends(user_id, auth.uid()));
create policy check_ins_read on public.check_ins for select to authenticated
  using (user_id = auth.uid() or are_friends(user_id, auth.uid()));
create policy ledger_read on public.points_ledger for select to authenticated
  using (user_id = auth.uid());

-- الصداقات
create policy friendships_read on public.friendships for select to authenticated
  using (auth.uid() in (requester, addressee));
create policy friendships_request on public.friendships for insert to authenticated
  with check (requester = auth.uid() and status = 'pending');
create policy friendships_accept on public.friendships for update to authenticated
  using (addressee = auth.uid()) with check (addressee = auth.uid() and status = 'accepted');
create policy friendships_delete on public.friendships for delete to authenticated
  using (auth.uid() in (requester, addressee));

-- المنشورات
create policy posts_read on public.posts for select to authenticated
  using (can_see_post(user_id, visibility));
create policy posts_insert on public.posts for insert to authenticated
  with check (user_id = auth.uid()
              and (check_in_id is null or exists (select 1 from check_ins c
                   where c.id = check_in_id and c.user_id = auth.uid())));
create policy posts_update on public.posts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy posts_delete on public.posts for delete to authenticated
  using (user_id = auth.uid());

create policy likes_read on public.post_likes for select to authenticated
  using (exists (select 1 from posts p where p.id = post_id and can_see_post(p.user_id, p.visibility)));
create policy likes_insert on public.post_likes for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from posts p where p.id = post_id and can_see_post(p.user_id, p.visibility)));
create policy likes_delete on public.post_likes for delete to authenticated
  using (user_id = auth.uid());

create policy comments_read on public.comments for select to authenticated
  using (exists (select 1 from posts p where p.id = post_id and can_see_post(p.user_id, p.visibility)));
create policy comments_insert on public.comments for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from posts p where p.id = post_id and can_see_post(p.user_id, p.visibility)));
create policy comments_delete on public.comments for delete to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from posts p where p.id = post_id and p.user_id = auth.uid()));

-- التحديات: يراها الأعضاء، ينشئها أي مستخدم، يدعو أصدقاءه فقط
create policy challenges_read on public.challenges for select to authenticated
  using (creator = auth.uid() or is_challenge_member(id));
create policy challenges_insert on public.challenges for insert to authenticated
  with check (creator = auth.uid() and settled = false);
create policy challenges_delete on public.challenges for delete to authenticated
  using (creator = auth.uid());

create policy cmembers_read on public.challenge_members for select to authenticated
  using (is_challenge_member(challenge_id));
create policy cmembers_invite on public.challenge_members for insert to authenticated
  with check (status = 'invited'
              and exists (select 1 from challenges c where c.id = challenge_id and c.creator = auth.uid())
              and are_friends(user_id, auth.uid()));
create policy cmembers_leave on public.challenge_members for delete to authenticated
  using (user_id = auth.uid());

-- صلاحيات تنفيذ الدوال
grant execute on function public.check_in(uuid, double precision, double precision, double precision) to authenticated;
grant execute on function public.check_out(uuid) to authenticated;
grant execute on function public.complete_workout(uuid, integer) to authenticated;
grant execute on function public.leaderboard(text, timestamptz, integer) to authenticated;
grant execute on function public.challenge_standings(uuid) to authenticated;
grant execute on function public.settle_challenge(uuid) to authenticated;
grant execute on function public.join_challenge(uuid) to authenticated;
grant execute on function public.feed(timestamptz, integer, uuid) to authenticated;
grant execute on function public.nearby_gyms(double precision, double precision, double precision) to authenticated;

-- =====================================================================
-- التخزين
--   avatars : عامة (صور الملفات الشخصية)
--   posts   : عامة القراءة (مسارات عشوائية) — كتابة في مجلد المستخدم فقط
--   body    : خاصة تماماً — صور الجسم لا يراها إلا صاحبها
-- =====================================================================
insert into storage.buckets (id, name, public) values
  ('avatars', 'avatars', true),
  ('posts',   'posts',   true),
  ('body',    'body',    false)
on conflict (id) do nothing;

create policy "own folder write avatars" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own folder update avatars" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own folder write posts" on storage.objects for insert to authenticated
  with check (bucket_id = 'posts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own folder delete posts" on storage.objects for delete to authenticated
  using (bucket_id = 'posts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "body photos owner only" on storage.objects for all to authenticated
  using (bucket_id = 'body' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'body' and (storage.foldername(name))[1] = auth.uid()::text);


-- ===================== 20260926010000_inbody.sql =====================
-- =====================================================================
-- تقارير InBody: صورة/ملف التقرير + الأرقام المستخرجة + نتيجة التحليل
-- خاصة تماماً: لا يراها إلا صاحبها
-- =====================================================================

create table public.inbody_reports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  file_path    text,                  -- داخل حاوية inbody الخاصة (صورة أو PDF)
  test_date    date,
  metrics      jsonb not null,        -- الأرقام المستخرجة (بعد مراجعة المستخدم)
  analysis     jsonb,                 -- ناتج محرك التحليل (ملاحظات + الهدف المقترح)
  source       text not null default 'ai' check (source in ('ai','manual')),
  applied      boolean not null default false,  -- هل طُبّق على الخطة
  created_at   timestamptz not null default now()
);
create index on public.inbody_reports (user_id, test_date desc, created_at desc);

alter table public.inbody_reports enable row level security;
create policy inbody_own on public.inbody_reports for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ربط الخطة بالتقرير الذي بُنيت عليه
alter table public.plans add column inbody_report_id uuid references public.inbody_reports(id) on delete set null;

-- حاوية خاصة لملفات التقارير
insert into storage.buckets (id, name, public) values ('inbody', 'inbody', false)
on conflict (id) do nothing;

create policy "inbody files owner only" on storage.objects for all to authenticated
  using (bucket_id = 'inbody' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'inbody' and (storage.foldername(name))[1] = auth.uid()::text);


-- ===================== 20260926020000_health.sql =====================
-- =====================================================================
-- الصحة اليومية من الجوال والساعة (Apple Health / Health Connect / حساس الخطوات)
-- خطوات، نوم بمراحله، نبض الراحة، HRV، سعرات نشطة + الجاهزية والإجهاد المحسوبة في الجهاز.
-- =====================================================================

create table public.daily_health (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  day           date not null,
  steps         integer check (steps between 0 and 150000),
  active_kcal   integer check (active_kcal between 0 and 15000),
  distance_m    integer check (distance_m between 0 and 300000),
  resting_hr    numeric(5,1) check (resting_hr between 25 and 150),
  hrv_ms        numeric(6,1) check (hrv_ms between 1 and 400),
  sleep_min     integer check (sleep_min between 0 and 1440),
  in_bed_min    integer check (in_bed_min between 0 and 1440),
  deep_min      integer check (deep_min between 0 and 1440),
  rem_min       integer check (rem_min between 0 and 1440),
  light_min     integer check (light_min between 0 and 1440),
  awake_min     integer check (awake_min between 0 and 1440),
  recovery      smallint check (recovery between 0 and 100),
  strain        numeric(4,1) check (strain between 0 and 21),
  source        text not null default 'pedometer'
                check (source in ('apple_health','health_connect','pedometer','demo')),
  steps_awarded boolean not null default false,
  updated_at    timestamptz not null default now(),
  primary key (user_id, day)
);
create index on public.daily_health (day);

alter table public.daily_health enable row level security;
-- الشخص يرى بياناته فقط؛ الأصدقاء يرون الخطوات عبر الدوال (security definer) لا الجدول مباشرة
create policy "own health read" on public.daily_health for select using (user_id = auth.uid());
-- الكتابة فقط عبر sync_daily_health (للتحقق ومنح النقاط)
revoke insert, update, delete on public.daily_health from anon, authenticated;

-- مصدر نقاط جديد: 10,000 خطوة في اليوم = +5
alter table public.points_ledger drop constraint if exists points_ledger_reason_check;
alter table public.points_ledger add constraint points_ledger_reason_check
  check (reason in ('checkin','streak_bonus','long_session','workout','challenge_win','steps_goal'));

-- مزامنة يوم (أو عدة أيام) من الجهاز. لا يُقبل يوم مستقبلي ولا أقدم من 30 يوماً.
create or replace function public.sync_daily_health(p_days jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_today date := app_today();
  d       jsonb;
  v_day   date;
  v_row   daily_health;
  v_n     integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) > 31 then raise exception 'bad_payload'; end if;

  for d in select * from jsonb_array_elements(p_days) loop
    v_day := (d->>'day')::date;
    if v_day > v_today or v_day < v_today - 30 then continue; end if;

    insert into daily_health as h (user_id, day, steps, active_kcal, distance_m, resting_hr, hrv_ms,
                                   sleep_min, in_bed_min, deep_min, rem_min, light_min, awake_min,
                                   recovery, strain, source, updated_at)
    values (v_uid, v_day, (d->>'steps')::int, (d->>'active_kcal')::int, (d->>'distance_m')::int,
            (d->>'resting_hr')::numeric, (d->>'hrv_ms')::numeric,
            (d->>'sleep_min')::int, (d->>'in_bed_min')::int, (d->>'deep_min')::int, (d->>'rem_min')::int,
            (d->>'light_min')::int, (d->>'awake_min')::int,
            (d->>'recovery')::smallint, (d->>'strain')::numeric, coalesce(d->>'source', 'pedometer'), now())
    on conflict (user_id, day) do update set
      -- الخطوات لا تنقص خلال اليوم (مصادر متعددة): نأخذ الأكبر
      steps       = greatest(coalesce(excluded.steps, 0), coalesce(h.steps, 0)),
      active_kcal = coalesce(excluded.active_kcal, h.active_kcal),
      distance_m  = coalesce(excluded.distance_m, h.distance_m),
      resting_hr  = coalesce(excluded.resting_hr, h.resting_hr),
      hrv_ms      = coalesce(excluded.hrv_ms, h.hrv_ms),
      sleep_min   = coalesce(excluded.sleep_min, h.sleep_min),
      in_bed_min  = coalesce(excluded.in_bed_min, h.in_bed_min),
      deep_min    = coalesce(excluded.deep_min, h.deep_min),
      rem_min     = coalesce(excluded.rem_min, h.rem_min),
      light_min   = coalesce(excluded.light_min, h.light_min),
      awake_min   = coalesce(excluded.awake_min, h.awake_min),
      recovery    = coalesce(excluded.recovery, h.recovery),
      strain      = coalesce(excluded.strain, h.strain),
      source      = excluded.source,
      updated_at  = now()
    returning * into v_row;

    -- نقاط هدف الخطوات مرة واحدة لليوم (المصدر التجريبي لا يمنح نقاطاً)
    if v_row.steps >= 10000 and not v_row.steps_awarded and v_row.source <> 'demo' then
      perform _award(v_uid, 5, 'steps_goal', null);
      update daily_health set steps_awarded = true where user_id = v_uid and day = v_day;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
grant execute on function public.sync_daily_health(jsonb) to authenticated;

-- ترتيب الخطوات بين الأصدقاء لفترة (مثل تحدي WHOOP/Google Fit)
create or replace function public.steps_leaderboard(p_from date, p_to date)
returns table (user_id uuid, username text, full_name text, avatar_url text, steps bigint, rank bigint)
language sql stable security definer set search_path = public as $$
  with circle as (
    select auth.uid() as uid
    union
    select case when f.requester = auth.uid() then f.addressee else f.requester end
      from friendships f
     where f.status = 'accepted' and (f.requester = auth.uid() or f.addressee = auth.uid())
  )
  select p.id, p.username, p.full_name, p.avatar_url,
         coalesce(sum(h.steps), 0)::bigint as steps,
         rank() over (order by coalesce(sum(h.steps), 0) desc) as rank
    from circle c
    join profiles p on p.id = c.uid
    left join daily_health h on h.user_id = p.id and h.day between p_from and p_to
   group by p.id
   order by steps desc
   limit 100;
$$;
grant execute on function public.steps_leaderboard(date, date) to authenticated;

-- التحديات: مقياس جديد "الخطوات"
alter table public.challenges drop constraint if exists challenges_metric_check;
alter table public.challenges add constraint challenges_metric_check
  check (metric in ('checkins','workouts','points','steps'));

create or replace function public.challenge_standings(p_challenge uuid)
returns table (user_id uuid, username text, avatar_url text, status text, score bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  c challenges;
  v_from timestamptz;
  v_to   timestamptz;
begin
  if not is_challenge_member(p_challenge) then raise exception 'forbidden'; end if;
  select * into c from challenges where id = p_challenge;
  v_from := (c.starts_on::timestamp at time zone 'Asia/Riyadh');
  v_to   := ((c.ends_on + 1)::timestamp at time zone 'Asia/Riyadh');

  return query
  select m.user_id, p.username, p.avatar_url, m.status,
         case c.metric
           when 'checkins' then (select count(distinct (ci.checked_in_at at time zone 'Asia/Riyadh')::date)
                                   from check_ins ci
                                  where ci.user_id = m.user_id and ci.points_awarded > 0
                                    and ci.checked_in_at >= v_from and ci.checked_in_at < v_to)
           when 'workouts' then (select count(*) from workout_logs w
                                  where w.user_id = m.user_id and w.done_on between c.starts_on and c.ends_on)
           when 'steps'    then (select coalesce(sum(h.steps), 0) from daily_health h
                                  where h.user_id = m.user_id and h.source <> 'demo'
                                    and h.day between c.starts_on and c.ends_on)
           else (select coalesce(sum(l.amount), 0) from points_ledger l
                  where l.user_id = m.user_id and l.reason <> 'challenge_win'
                    and l.created_at >= v_from and l.created_at < v_to)
         end::bigint as score
  from challenge_members m join profiles p on p.id = m.user_id
  where m.challenge_id = p_challenge
  order by score desc;
end $$;


-- ===================== 20260926040000_beta_feedback.sql =====================
-- =====================================================================
-- ملاحظات المختبرين أثناء الإطلاق التجريبي
-- =====================================================================
create table public.beta_feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  category    text not null default 'other' check (category in ('bug','idea','design','other')),
  message     text not null check (char_length(message) between 3 and 2000),
  screen      text check (char_length(screen) <= 120),
  app_version text check (char_length(app_version) <= 60),
  variant     text check (char_length(variant) <= 20),
  platform    text check (char_length(platform) <= 20),
  update_id   text check (char_length(update_id) <= 80),
  status      text not null default 'new' check (status in ('new','seen','fixed','wontfix')),
  created_at  timestamptz not null default now()
);
create index on public.beta_feedback (created_at desc);

alter table public.beta_feedback enable row level security;
create policy "send own feedback" on public.beta_feedback for insert with check (user_id = auth.uid() and status = 'new');
create policy "read own feedback" on public.beta_feedback for select using (user_id = auth.uid());
-- الفريق يقرأ كل الملاحظات ويحدّث حالتها من لوحة Supabase (service role)


-- ===================== 20260926050000_delete_account.sql =====================
-- حذف الحساب من داخل التطبيق (مطلوب من Apple و Google لأي تطبيق فيه تسجيل حساب)
-- يحذف المستخدم من auth.users، وكل بياناته تنحذف تلقائياً (on delete cascade).
-- ملاحظة: الصور في Storage تُحذف من التطبيق قبل استدعاء الدالة.
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  delete from auth.users where id = v_uid;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- لحذف ملفات المستخدم قبل حذف الحساب: قراءة/حذف مجلده الخاص في الصور العامة
create policy "own folder list avatars" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own folder delete avatars" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own folder list posts" on storage.objects for select to authenticated
  using (bucket_id = 'posts' and (storage.foldername(name))[1] = auth.uid()::text);


-- ===================== 20260927000000_coach.sql =====================
-- =====================================================================
-- مدرب ARQ الذكي: سجل الاستخدام (للتحكم في التكلفة) — بدون حفظ نص المحادثة
-- =====================================================================
create table public.coach_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index on public.coach_log (user_id, created_at desc);
alter table public.coach_log enable row level security;
create policy "own coach log read" on public.coach_log for select using (user_id = auth.uid());
create policy "own coach log insert" on public.coach_log for insert with check (user_id = auth.uid());


-- ===================== 20260927010000_workout_log.sql =====================
-- =====================================================================
-- سجل التمارين التفصيلي: الجلسات والمجموعات (الوزن × العدّات) للمقارنة مع آخر جلسة مماثلة
-- =====================================================================
create table public.workout_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  title        text check (char_length(title) <= 80),
  source       text not null default 'free' check (source in ('plan','coach','free')),
  plan_id      uuid references public.plans(id) on delete set null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  notes        text check (char_length(notes) <= 500),
  check (finished_at is null or finished_at >= started_at)
);
create index on public.workout_sessions (user_id, started_at desc);

create table public.workout_sets (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.workout_sessions(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  exercise_id  text not null check (char_length(exercise_id) <= 60),
  set_index    smallint not null check (set_index between 1 and 30),
  reps         smallint not null check (reps between 0 and 200),
  weight_kg    numeric(6,2) not null default 0 check (weight_kg between 0 and 600),
  done_at      timestamptz not null default now(),
  unique (session_id, exercise_id, set_index)
);
create index on public.workout_sets (user_id, exercise_id, done_at desc);
create index on public.workout_sets (session_id);

alter table public.workout_sessions enable row level security;
alter table public.workout_sets enable row level security;
create policy "own sessions" on public.workout_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own sets" on public.workout_sets for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from workout_sessions s where s.id = session_id and s.user_id = auth.uid()));


-- ===================== 20260927020000_social_ranks.sql =====================
-- =====================================================================
-- الحسابات الاجتماعية: المتابعة، الرتب حسب الالتزام، ونشر البرامج والنصائح
--   * المتابعة عامة (بدون قبول) ومنفصلة عن الصداقة (الصداقة تحكم الخصوصية)
--   * الرتبة تُحسب من مجموع النقاط (حضور النادي، السلسلة، التمارين، الخطوات، التحديات)
--   * النشر مقيّد بالرتبة ومفروض على مستوى القاعدة (RLS) لا الواجهة فقط
-- =====================================================================

-- ---------- الرتب ----------
-- 0 مبتدئ | 1 ملتزم (150) | 2 متقدم (500) | 3 محترف (1200) | 4 نخبة (2500)
create or replace function public.rank_level(p_points integer)
returns integer language sql immutable as $$
  select case
    when p_points >= 2500 then 4
    when p_points >= 1200 then 3
    when p_points >= 500  then 2
    when p_points >= 150  then 1
    else 0 end;
$$;

alter table public.profiles
  add column if not exists followers_count integer not null default 0,
  add column if not exists following_count integer not null default 0,
  -- مدرب موثّق: يُمنح يدوياً من الإدارة فقط (ليس ضمن الأعمدة القابلة للتعديل)
  add column if not exists is_coach boolean not null default false;

-- هل يحق للمستخدم الحالي النشر؟ نصيحة: متقدم فأعلى. برنامج: محترف فأعلى. المدرب الموثّق دائماً.
create or replace function public.can_publish(p_kind text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.is_coach or rank_level(p.points) >= case p_kind when 'tip' then 2 when 'program' then 3 else 99 end
    from profiles p where p.id = auth.uid()
  ), false);
$$;
revoke all on function public.can_publish(text) from public, anon;
grant execute on function public.can_publish(text) to authenticated;
grant execute on function public.rank_level(integer) to authenticated;

-- ---------- المتابعة ----------
create table public.follows (
  follower    uuid not null references public.profiles(id) on delete cascade,
  followee    uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);
create index on public.follows (followee, created_at desc);

create or replace function public._follow_counts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update profiles set followers_count = followers_count + 1 where id = new.followee;
    update profiles set following_count = following_count + 1 where id = new.follower;
  else
    update profiles set followers_count = greatest(0, followers_count - 1) where id = old.followee;
    update profiles set following_count = greatest(0, following_count - 1) where id = old.follower;
  end if;
  return null;
end $$;
revoke all on function public._follow_counts() from public, anon, authenticated;
create trigger follows_counts after insert or delete on public.follows
  for each row execute function public._follow_counts();

alter table public.follows enable row level security;
create policy follows_read   on public.follows for select to authenticated using (true);
create policy follows_insert on public.follows for insert to authenticated with check (follower = auth.uid());
create policy follows_delete on public.follows for delete to authenticated using (follower = auth.uid());

-- ---------- برامج المستخدمين ----------
-- days: [{ "title": "...", "exercises": [{ "exercise_id", "sets", "reps", "rest_sec", "rir" }] }]
create table public.user_programs (
  id             uuid primary key default gen_random_uuid(),
  author         uuid not null references public.profiles(id) on delete cascade,
  title          text not null check (char_length(title) between 3 and 80),
  description    text check (char_length(description) <= 600),
  level          text not null default 'intermediate' check (level in ('beginner','intermediate','advanced')),
  goal           text check (goal in ('lose','gain','maintain','fit')),
  days           jsonb not null check (jsonb_typeof(days) = 'array' and jsonb_array_length(days) between 1 and 7
                                       and pg_column_size(days) < 24000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.user_programs (author, created_at desc);
create index on public.user_programs (created_at desc);

create table public.program_adopts (
  program_id  uuid not null references public.user_programs(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (program_id, user_id)
);

alter table public.user_programs enable row level security;
alter table public.program_adopts enable row level security;
create policy uprog_read   on public.user_programs for select to authenticated using (true);
create policy uprog_insert on public.user_programs for insert to authenticated
  with check (author = auth.uid() and can_publish('program'));
create policy uprog_update on public.user_programs for update to authenticated
  using (author = auth.uid()) with check (author = auth.uid() and can_publish('program'));
create policy uprog_delete on public.user_programs for delete to authenticated using (author = auth.uid());

create policy adopts_read on public.program_adopts for select to authenticated using (true);
create policy adopts_delete on public.program_adopts for delete to authenticated using (user_id = auth.uid());
-- الإضافة عبر adopt_program فقط (لمنح نقاط الكاتب مرة واحدة)
revoke insert, update on public.program_adopts from anon, authenticated;

-- مكافأة العطاء: +10 لصاحب البرنامج عن كل متدرب جديد يعتمده (مرة لكل متدرب، ولا تحسب لنفسه)
alter table public.points_ledger drop constraint if exists points_ledger_reason_check;
alter table public.points_ledger add constraint points_ledger_reason_check
  check (reason in ('checkin','streak_bonus','long_session','workout','challenge_win','steps_goal','program_adopted'));

create or replace function public.adopt_program(p_program uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
  v_new boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select author into v_author from user_programs where id = p_program;
  if v_author is null then raise exception 'program_not_found'; end if;
  insert into program_adopts (program_id, user_id) values (p_program, v_uid)
    on conflict do nothing returning true into v_new;
  if coalesce(v_new, false) and v_author <> v_uid then
    perform _award(v_author, 10, 'program_adopted', p_program);
    return 10;
  end if;
  return 0;
end $$;
revoke all on function public.adopt_program(uuid) from public, anon;
grant execute on function public.adopt_program(uuid) to authenticated;

-- ---------- النصائح ----------
create table public.tips (
  id          uuid primary key default gen_random_uuid(),
  author      uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 3 and 500),
  tag         text not null default 'training' check (tag in ('training','nutrition','recovery','mindset')),
  created_at  timestamptz not null default now()
);
create index on public.tips (created_at desc);
create index on public.tips (author, created_at desc);

create table public.tip_likes (
  tip_id   uuid not null references public.tips(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  primary key (tip_id, user_id)
);

alter table public.tips enable row level security;
alter table public.tip_likes enable row level security;
create policy tips_read   on public.tips for select to authenticated using (true);
create policy tips_insert on public.tips for insert to authenticated
  with check (author = auth.uid() and can_publish('tip'));
create policy tips_delete on public.tips for delete to authenticated using (author = auth.uid());
create policy tlikes_read   on public.tip_likes for select to authenticated using (true);
create policy tlikes_insert on public.tip_likes for insert to authenticated with check (user_id = auth.uid());
create policy tlikes_delete on public.tip_likes for delete to authenticated using (user_id = auth.uid());


-- ===================== 20260927030000_presence_brands.sql =====================
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


-- ===================== 20260927040000_messages.sql =====================
-- =====================================================================
-- الرسائل الخاصة: متاحة فقط بين شخصين يتابعون بعض (متابعة متبادلة)
--   * الإرسال مرفوض إذا ما كانت المتابعة من الطرفين (RLS)
--   * المحادثة القديمة تبقى مقروءة لو أحدهم ألغى المتابعة، لكن ما ينرسل جديد
--   * المستلم يعدّل وقت القراءة فقط
-- =====================================================================
create or replace function public.mutual_follow(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select a <> b
     and exists (select 1 from follows where follower = a and followee = b)
     and exists (select 1 from follows where follower = b and followee = a);
$$;
revoke all on function public.mutual_follow(uuid, uuid) from public, anon;
grant execute on function public.mutual_follow(uuid, uuid) to authenticated;

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  sender      uuid not null references public.profiles(id) on delete cascade,
  recipient   uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  check (sender <> recipient)
);
create index on public.messages (sender, recipient, created_at desc);
create index on public.messages (recipient, read_at) where read_at is null;

alter table public.messages enable row level security;
create policy msg_read on public.messages for select to authenticated using (auth.uid() in (sender, recipient));
create policy msg_send on public.messages for insert to authenticated
  with check (sender = auth.uid() and mutual_follow(sender, recipient));
create policy msg_mark_read on public.messages for update to authenticated
  using (recipient = auth.uid()) with check (recipient = auth.uid());
create policy msg_delete_own on public.messages for delete to authenticated using (sender = auth.uid());

-- المستلم لا يغيّر إلا وقت القراءة
create or replace function public._msg_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated','anon') and (new.body is distinct from old.body or new.sender is distinct from old.sender
      or new.recipient is distinct from old.recipient or new.created_at is distinct from old.created_at) then
    raise exception 'read_only_message';
  end if;
  return new;
end $$;
create trigger messages_guard before update on public.messages for each row execute function public._msg_guard();

-- صندوق الرسائل: آخر رسالة مع كل شخص + غير المقروء + هل المراسلة متاحة حالياً
create or replace function public.inbox()
returns table (other_id uuid, username text, full_name text, avatar_url text, points integer, is_coach boolean,
               last_body text, last_at timestamptz, last_from_me boolean, unread bigint, can_message boolean)
language sql stable security definer set search_path = public as $$
  with mine as (
    select case when m.sender = auth.uid() then m.recipient else m.sender end as other, m.*
    from messages m where auth.uid() in (m.sender, m.recipient)
  ), last as (
    select distinct on (other) other, body, created_at, sender = auth.uid() as from_me from mine order by other, created_at desc
  )
  select p.id, p.username, p.full_name, p.avatar_url, p.points, p.is_coach, l.body, l.created_at, l.from_me,
         (select count(*) from messages u where u.sender = p.id and u.recipient = auth.uid() and u.read_at is null),
         mutual_follow(auth.uid(), p.id)
  from last l join profiles p on p.id = l.other
  order by l.created_at desc
  limit 100;
$$;
revoke all on function public.inbox() from public, anon;
grant execute on function public.inbox() to authenticated;

-- الأشخاص اللي أقدر أراسلهم (متابعة متبادلة)
create or replace function public.mutual_followers()
returns table (id uuid, username text, full_name text, avatar_url text, points integer, is_coach boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.full_name, p.avatar_url, p.points, p.is_coach
  from follows a join follows b on b.follower = a.followee and b.followee = a.follower
  join profiles p on p.id = a.followee
  where a.follower = auth.uid()
  order by p.full_name nulls last, p.username
  limit 300;
$$;
revoke all on function public.mutual_followers() from public, anon;
grant execute on function public.mutual_followers() to authenticated;

-- الرسائل الحيّة (Supabase Realtime) — تحترم RLS فكل واحد يستقبل رسائله فقط
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;


-- ===================== 20260927050000_owner_panel.sql =====================
-- =====================================================================
-- لوحة المالك: تقارير المختبرين، طلبات المتاجر، وتوثيق المدربين
--   المالك يُضاف مرة وحدة من SQL Editor في Supabase:
--   insert into public.app_admins (user_id) select id from auth.users where email = '<بريدك>';
-- =====================================================================
create table public.app_admins (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table public.app_admins enable row level security;
create policy admins_self on public.app_admins for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.app_admins from anon, authenticated;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------- تقارير المختبرين: يقرأها المالك فقط ويحدّث حالتها وملاحظته ----------
alter table public.beta_feedback
  add column if not exists admin_note text check (char_length(admin_note) <= 1000),
  add column if not exists screenshot_path text check (char_length(screenshot_path) <= 200),
  add column if not exists updated_at timestamptz;

drop policy if exists "send own feedback" on public.beta_feedback;
create policy "send own feedback" on public.beta_feedback for insert
  with check (user_id = auth.uid() and status = 'new' and admin_note is null
              and (screenshot_path is null or split_part(screenshot_path, '/', 1) = auth.uid()::text));
create policy "owner reads all feedback" on public.beta_feedback for select to authenticated using (is_admin());
create policy "owner triages feedback" on public.beta_feedback for update to authenticated using (is_admin()) with check (is_admin());

-- المالك يغيّر الحالة والملاحظة فقط (نص التقرير وصاحبه ثابتين)
create or replace function public._feedback_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated','anon') and (new.message is distinct from old.message or new.user_id is distinct from old.user_id
      or new.category is distinct from old.category or new.created_at is distinct from old.created_at) then
    raise exception 'report_locked';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger feedback_guard before update on public.beta_feedback for each row execute function public._feedback_guard();

-- صور التقارير: خاصة — صاحب التقرير يرفع في مجلده، والمالك فقط يقرأ الكل
insert into storage.buckets (id, name, public) values ('feedback', 'feedback', false) on conflict (id) do nothing;
create policy "feedback shots upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "feedback shots read" on storage.objects for select to authenticated
  using (bucket_id = 'feedback' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------- طلبات المتاجر: المالك يشوف الكل ويوافق أو يرفض ----------
create policy brands_admin_read on public.brands for select to authenticated using (is_admin());
create policy brands_admin_review on public.brands for update to authenticated using (is_admin()) with check (true);
create policy products_admin_read on public.brand_products for select to authenticated using (is_admin());

create or replace function public._brand_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated','anon') then
    if tg_op = 'INSERT' then
      new.status := 'pending'; new.review_note := null;
    elsif (new.status is distinct from old.status or new.review_note is distinct from old.review_note) and not is_admin() then
      raise exception 'status_locked';
    end if;
  end if;
  return new;
end $$;

-- ---------- توثيق المدربين ----------
create or replace function public.set_coach(p_user uuid, p_value boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  update profiles set is_coach = p_value where id = p_user;
end $$;
revoke all on function public.set_coach(uuid, boolean) from public, anon;
grant execute on function public.set_coach(uuid, boolean) to authenticated;

-- ملخص للوحة: عدد التقارير الجديدة وطلبات المتاجر المعلّقة
create or replace function public.owner_counts()
returns table (new_reports bigint, pending_brands bigint)
language sql stable security definer set search_path = public as $$
  select (select count(*) from beta_feedback where status = 'new'), (select count(*) from brands where status = 'pending')
  where is_admin();
$$;
revoke all on function public.owner_counts() from public, anon;
grant execute on function public.owner_counts() to authenticated;


-- ===================== 20260927060000_gym_offers.sql =====================
-- =====================================================================
-- عروض النوادي وتقييماتها: أسعار الاشتراكات والعروض، تقييم النادي (١–٥)، وتعليقات المستخدمين
--   * العروض يضيفها مالك التطبيق أو مدير النادي المعتمد (gym_managers)
--   * التقييم: تقييم واحد لكل مستخدم لكل نادي، مع علامة «زار النادي ✓» لمن سجّل حضور فيه
-- =====================================================================
alter table public.gyms
  add column if not exists chain     text check (char_length(chain) <= 60),
  add column if not exists audience  text not null default 'mixed' check (audience in ('men','women','mixed')),
  add column if not exists website   text check (website is null or website ~* '^https://[^\s]+$'),
  add column if not exists logo_path text check (char_length(logo_path) <= 200),
  add column if not exists district  text check (char_length(district) <= 60);

-- مدراء النوادي (يضيفهم المالك): يقدرون ينشرون عروض ناديهم
create table public.gym_managers (
  gym_id   uuid not null references public.gyms(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  primary key (gym_id, user_id)
);
alter table public.gym_managers enable row level security;
create policy gm_self_read on public.gym_managers for select to authenticated using (user_id = auth.uid() or is_admin());
create policy gm_admin_write on public.gym_managers for all to authenticated using (is_admin()) with check (is_admin());

create or replace function public.can_manage_gym(p_gym uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_admin() or exists (select 1 from gym_managers m where m.gym_id = p_gym and m.user_id = auth.uid());
$$;
revoke all on function public.can_manage_gym(uuid) from public, anon;
grant execute on function public.can_manage_gym(uuid) to authenticated;

-- المالك يعدّل بيانات النادي (السلسلة، الفئة، الموقع…) ويوثّقه
create policy gyms_admin_update on public.gyms for update to authenticated using (is_admin()) with check (is_admin());

-- ---------- العروض ----------
create table public.gym_offers (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references public.gyms(id) on delete cascade,
  title           text not null check (char_length(btrim(title)) between 3 and 80),
  details         text check (char_length(details) <= 400),
  price_sar       numeric(8,2) not null check (price_sar between 0 and 100000),
  old_price_sar   numeric(8,2) check (old_price_sar is null or old_price_sar > price_sar),
  months          smallint not null default 1 check (months between 0 and 24),   -- 0 = زيارة/يوم واحد
  ends_on         date,
  url             text check (url is null or url ~* '^https://[^\s]+$'),
  promo_code      text check (char_length(promo_code) <= 30),
  active          boolean not null default true,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index on public.gym_offers (gym_id, active);

alter table public.gym_offers enable row level security;
create policy offers_read on public.gym_offers for select to authenticated
  using ((active and (ends_on is null or ends_on >= current_date)) or can_manage_gym(gym_id));
create policy offers_write on public.gym_offers for all to authenticated
  using (can_manage_gym(gym_id)) with check (can_manage_gym(gym_id));

create or replace function public._offer_stamp()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.created_by := auth.uid(); new.created_at := now();
  else new.created_by := old.created_by; new.created_at := old.created_at; end if;
  return new;
end $$;
create trigger offers_stamp before insert or update on public.gym_offers for each row execute function public._offer_stamp();

-- ---------- التقييمات والتعليقات ----------
create table public.gym_reviews (
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  body        text check (char_length(body) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (gym_id, user_id)
);
create index on public.gym_reviews (gym_id, updated_at desc);

create or replace function public._review_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); new.created_at := old.created_at; return new; end $$;
create trigger reviews_touch before update on public.gym_reviews for each row execute function public._review_touch();

alter table public.gym_reviews enable row level security;
create policy reviews_read on public.gym_reviews for select to authenticated using (true);
create policy reviews_write on public.gym_reviews for insert to authenticated with check (user_id = auth.uid());
create policy reviews_update on public.gym_reviews for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reviews_delete on public.gym_reviews for delete to authenticated using (user_id = auth.uid() or is_admin());

-- دليل النوادي: متوسط التقييم وعدده، أفضل عرض (أقل سعر شهري)، والمسافة إن توفر الموقع
create or replace function public.gyms_directory(p_lat double precision default null, p_lng double precision default null, p_city text default null)
returns table (id uuid, name text, name_en text, chain text, city text, district text, audience text, logo_path text, website text,
               lat double precision, lng double precision, verified boolean,
               rating numeric, reviews bigint, offers bigint, best_monthly numeric, distance_m double precision)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.name_en, g.chain, g.city, g.district, g.audience, g.logo_path, g.website, g.lat, g.lng, g.verified,
         round((select avg(r.rating) from gym_reviews r where r.gym_id = g.id), 1),
         (select count(*) from gym_reviews r where r.gym_id = g.id),
         (select count(*) from gym_offers o where o.gym_id = g.id and o.active and (o.ends_on is null or o.ends_on >= current_date)),
         (select min(o.price_sar / greatest(o.months, 1)) from gym_offers o
            where o.gym_id = g.id and o.active and o.months > 0 and (o.ends_on is null or o.ends_on >= current_date)),
         case when p_lat is null then null else distance_m(p_lat, p_lng, g.lat, g.lng) end
  from gyms g
  where g.verified and (p_city is null or g.city = p_city)
  order by case when p_lat is null then 0 else distance_m(p_lat, p_lng, g.lat, g.lng) end, g.name
  limit 200;
$$;
revoke all on function public.gyms_directory(double precision, double precision, text) from public, anon;
grant execute on function public.gyms_directory(double precision, double precision, text) to authenticated;

-- التعليقات مع علامة «زار النادي ✓» (سجّل حضور فيه مرة على الأقل)
create or replace function public.gym_reviews_list(p_gym uuid)
returns table (user_id uuid, username text, full_name text, avatar_url text, points integer, rating smallint, body text,
               updated_at timestamptz, visited boolean, is_me boolean)
language sql stable security definer set search_path = public as $$
  select r.user_id, p.username, p.full_name, p.avatar_url, p.points, r.rating, r.body, r.updated_at,
         exists (select 1 from check_ins c where c.user_id = r.user_id and c.gym_id = r.gym_id),
         r.user_id = auth.uid()
  from gym_reviews r join profiles p on p.id = r.user_id
  where r.gym_id = p_gym
  order by (r.user_id = auth.uid()) desc,
           exists (select 1 from check_ins c where c.user_id = r.user_id and c.gym_id = r.gym_id) desc,
           r.updated_at desc
  limit 100;
$$;
revoke all on function public.gym_reviews_list(uuid) from public, anon;
grant execute on function public.gym_reviews_list(uuid) to authenticated;


-- ===================== 20260927070000_gym_chains.sql =====================
-- =====================================================================
-- سلاسل النوادي (وقت اللياقة، جولدز جيم، بودي ماسترز…) وعروضها على مستوى السلسلة
--   * العرض يكون لسلسلة كاملة أو لفرع محدد
--   * كل عرض له مصدر (رابط) وتاريخ آخر تحقق ودرجة ثقة: official / article / uncertain / partner
--   * الشعار يرفعه المالك أو مدير السلسلة (bucket brands)
-- =====================================================================
create table public.gym_chains (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name         text not null check (char_length(btrim(name)) between 2 and 60),
  name_en      text check (char_length(name_en) <= 60),
  audience     text not null default 'mixed' check (audience in ('men','women','mixed')),
  website      text check (website is null or website ~* '^https://[^\s]+$'),
  instagram    text check (instagram is null or instagram ~ '^[A-Za-z0-9_.]{1,30}$'),
  description  text check (char_length(description) <= 400),
  logo_path    text check (char_length(logo_path) <= 200),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

alter table public.gyms add column if not exists chain_id uuid references public.gym_chains(id) on delete set null;
create index on public.gyms (chain_id);

create table public.chain_managers (
  chain_id uuid not null references public.gym_chains(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  primary key (chain_id, user_id)
);
alter table public.chain_managers enable row level security;
create policy cm_read on public.chain_managers for select to authenticated using (user_id = auth.uid() or is_admin());
create policy cm_admin on public.chain_managers for all to authenticated using (is_admin()) with check (is_admin());

create or replace function public.can_manage_chain(p_chain uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_admin() or exists (select 1 from chain_managers m where m.chain_id = p_chain and m.user_id = auth.uid());
$$;
revoke all on function public.can_manage_chain(uuid) from public, anon;
grant execute on function public.can_manage_chain(uuid) to authenticated;

alter table public.gym_chains enable row level security;
create policy chains_read on public.gym_chains for select to authenticated using (active or can_manage_chain(id));
create policy chains_admin_insert on public.gym_chains for insert to authenticated with check (is_admin());
create policy chains_manage on public.gym_chains for update to authenticated using (can_manage_chain(id)) with check (can_manage_chain(id));
create policy chains_admin_delete on public.gym_chains for delete to authenticated using (is_admin());

-- ---------- العروض: لفرع أو لسلسلة، مع المصدر ----------
alter table public.gym_offers alter column gym_id drop not null;
alter table public.gym_offers
  add column if not exists chain_id    uuid references public.gym_chains(id) on delete cascade,
  add column if not exists source_url  text check (source_url is null or source_url ~* '^https://[^\s]+$'),
  add column if not exists seen_on     date default current_date,
  add column if not exists confidence  text not null default 'partner' check (confidence in ('official','article','uncertain','partner'));
alter table public.gym_offers add constraint gym_offers_target check (gym_id is not null or chain_id is not null);
create index on public.gym_offers (chain_id, active);

create or replace function public.can_manage_offer_target(p_gym uuid, p_chain uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (p_gym is not null and can_manage_gym(p_gym)) or (p_chain is not null and can_manage_chain(p_chain));
$$;
revoke all on function public.can_manage_offer_target(uuid, uuid) from public, anon;
grant execute on function public.can_manage_offer_target(uuid, uuid) to authenticated;

drop policy if exists offers_read on public.gym_offers;
drop policy if exists offers_write on public.gym_offers;
create policy offers_read on public.gym_offers for select to authenticated
  using ((active and (ends_on is null or ends_on >= current_date)) or can_manage_offer_target(gym_id, chain_id));
create policy offers_write on public.gym_offers for all to authenticated
  using (can_manage_offer_target(gym_id, chain_id)) with check (can_manage_offer_target(gym_id, chain_id));

-- ---------- دليل السلاسل: الفروع، التقييم المجمّع، العروض، أقل سعر شهري، أقرب فرع ----------
create or replace function public.chains_directory(p_lat double precision default null, p_lng double precision default null)
returns table (id uuid, slug text, name text, name_en text, audience text, website text, instagram text, description text, logo_path text,
               branches bigint, rating numeric, reviews bigint, offers bigint, best_monthly numeric, nearest_m double precision)
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
           (select min(distance_m(p_lat, p_lng, g.lat, g.lng)) from gyms g where g.chain_id = c.id and g.verified) end
  from gym_chains c
  where c.active
  order by c.name;
$$;
revoke all on function public.chains_directory(double precision, double precision) from public, anon;
grant execute on function public.chains_directory(double precision, double precision) to authenticated;

-- دليل الفروع يشمل عروض السلسلة في «أقل سعر شهري»
drop function if exists public.gyms_directory(double precision, double precision, text);
create or replace function public.gyms_directory(p_lat double precision default null, p_lng double precision default null, p_city text default null)
returns table (id uuid, name text, name_en text, chain text, chain_id uuid, chain_logo text, city text, district text, audience text, logo_path text, website text,
               lat double precision, lng double precision, verified boolean,
               rating numeric, reviews bigint, offers bigint, best_monthly numeric, distance_m double precision)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.name_en, coalesce(c.name_en, g.chain), g.chain_id, c.logo_path, g.city, g.district,
         coalesce(case when g.audience = 'mixed' and c.audience <> 'mixed' then c.audience end, g.audience),
         g.logo_path, coalesce(g.website, c.website), g.lat, g.lng, g.verified,
         round((select avg(r.rating) from gym_reviews r where r.gym_id = g.id), 1),
         (select count(*) from gym_reviews r where r.gym_id = g.id),
         (select count(*) from gym_offers o where (o.gym_id = g.id or (g.chain_id is not null and o.chain_id = g.chain_id))
            and o.active and (o.ends_on is null or o.ends_on >= current_date)),
         (select min(o.price_sar / o.months) from gym_offers o where (o.gym_id = g.id or (g.chain_id is not null and o.chain_id = g.chain_id))
            and o.active and o.months > 0 and (o.ends_on is null or o.ends_on >= current_date)),
         case when p_lat is null then null else distance_m(p_lat, p_lng, g.lat, g.lng) end
  from gyms g left join gym_chains c on c.id = g.chain_id
  where g.verified and (p_city is null or g.city = p_city)
  order by case when p_lat is null then 0 else distance_m(p_lat, p_lng, g.lat, g.lng) end, g.name
  limit 300;
$$;
revoke all on function public.gyms_directory(double precision, double precision, text) from public, anon;
grant execute on function public.gyms_directory(double precision, double precision, text) to authenticated;

-- =====================================================================
-- بيانات السلاسل والعروض: جُمعت من المواقع الرسمية ومواقع العروض بتاريخ 2026-09-27
-- كل عرض معه رابط مصدره وتاريخه. العروض المنتهية تختفي تلقائياً بعد ends_on.
-- =====================================================================
insert into public.gym_chains (slug, name, name_en, audience, website, instagram, description) values
  ('fitness-time', 'وقت اللياقة', 'Fitness Time', 'men', 'https://www.fitnesstime.com.sa', 'fitnesstimesa', 'الفئة الأساسية من أندية لجام: مسبح وجاكوزي وصالة حديد وأنشطة مثل الاسكواش.'),
  ('fitness-time-plus', 'وقت اللياقة بلس', 'Fitness Time Plus', 'men', 'https://www.fitnesstime.com.sa', 'fitnesstimesa', 'الفئة الفاخرة من وقت اللياقة: مسابح وجاكوزي وبخار وساونا وخدمات راقية.'),
  ('fitness-time-pro', 'وقت اللياقة برو', 'Fitness Time Pro', 'men', 'https://www.fitnesstime.com.sa', 'fitnesstimesa', 'فئة برو: مسبح تدريبي ومساحات مخصصة لكل نوع تمرين، بسعر أقل من فئة فتنس.'),
  ('fitness-time-xpress', 'وقت اللياقة إكسبرس', 'Fitness Time Xpress', 'mixed', 'https://www.fitnesstime.com.sa', 'fitnesstimesa', 'الفئة الاقتصادية: تجربة رقمية وبعض فروع الرجال 24 ساعة، وفيه فروع للسيدات.'),
  ('fitness-time-ladies', 'وقت اللياقة ليديز', 'Fitness Time Ladies', 'women', 'https://www.fitnesstime.com.sa', 'ftladies', 'أندية وقت اللياقة النسائية بفئات فتنس وبرو وإكسبرس.'),
  ('bfit', 'بي فت', 'B_FIT', 'mixed', 'https://bfit.com.sa', 'bfit_ksa', 'من أرماح الرياضية: كلاسات جماعية ومسبح ومساحات عمل، فروع للسيدات وللرجال ومشتركة في الرياض وجدة.'),
  ('optimo', 'أوبتيمو', 'Optimo', 'mixed', 'https://optimo.com.sa', 'optimo_club', 'العلامة الفاخرة من أرماح في الرياض: فروع للرجال والسيدات في الملقا وفرع رجال في النخيل.'),
  ('golds-gym', 'جولدز جيم', 'Gold''s Gym Arabia', 'mixed', 'https://www.ggarabia.com', 'goldsgymarabia', 'سلسلة جولدز جيم العالمية في المملكة، فروع للرجال والسيدات في أكثر من مدينة.'),
  ('body-masters', 'بودي ماسترز', 'Body Masters', 'men', 'https://www.bodymasters.com.sa', 'bodymasterssa', 'أندية رجالية بفئتين بريميوم وإكسبرس، أكثر من 42 نادي في 18 مدينة.'),
  ('body-motions', 'بودي موشنز', 'Body Motions', 'women', 'https://www.bodymotions.com.sa', 'bodymotionsksa', 'الأندية النسائية لبودي ماسترز: أكثر من 19 نادي في 7 مدن، مسبح وجاكوزي وبخار وساونا.'),
  ('nuyu', 'نيويو', 'NuYu Fitness', 'women', 'https://nuyu-ksa.com', 'nuyuksa', 'سلسلة أندية نسائية بفروع في الرياض والدمام.'),
  ('puregym', 'بيور جيم', 'PureGym KSA', 'mixed', 'https://ksa.puregymarabia.com/en-gb', 'puregymksa', 'نادي اقتصادي مفتوح 24 ساعة بدون عقود، فروع مستقلة للرجال والسيدات في الرياض وجدة والدمام والخبر.'),
  ('gymnation', 'جيم نيشن', 'GymNation', 'mixed', 'https://gymnation.com/en-sa/', 'gymnation_me', 'دفع شهري بدون التزام طويل، مفتوح 24/7، أندية نسائية مستقلة وأكثر من 400 كلاس مجاني بالشهر.'),
  ('fitness-first', 'فتنس فيرست', 'Fitness First KSA', 'mixed', 'https://ksa.fitnessfirstme.com', 'fitnessfirstksa', 'السلسلة العالمية بأندية للرجال والسيدات في الرياض والدمام.'),
  ('oxygen', 'نادي أوكسجين', 'Oxygen Sport Center', 'mixed', 'https://oxygen-gym.com', 'oxygen_gym123', 'مركز رياضي بفروع في المنطقة الشرقية (القطيف وصفوى ورحيمة والدمام) وفرع نسائي بالقطيف.'),
  ('snap-fitness', 'سناب فتنس', 'Snap Fitness Saudi Arabia', 'men', 'https://www.snapfitness.com/sa_en', null, 'نادي 24 ساعة للأعضاء، فرعه المذكور في الجبيل (رجال).'),
  ('smart-fitness', 'اللياقة الذكية', 'Smart Fitness', 'mixed', 'https://smartfitness.com.sa', null, 'أندية لياقة بفروع مستقلة للرجال والسيدات.')
on conflict (slug) do nothing;

insert into public.gym_offers (chain_id, title, price_sar, old_price_sar, months, details, ends_on, source_url, seen_on, confidence)
select c.id, v.title, v.price, v.old, v.months, v.details, v.ends_on::date, v.source, v.seen::date, v.conf from (values
  ('fitness-time', 'عرض اليوم الوطني 96 – سنة فئة فتنس', 3096::numeric, null::numeric, 12::smallint, 'فئة فتنس لمدة سنة + 30 يوم إضافية عند التجديد. السعر القديم والضريبة غير مذكورين.', null, 'https://3rooodnews.net/876210', '2026-08-26', 'article'),
  ('fitness-time', 'السعر الأساسي – 12 شهر (فتنس)', 6029::numeric, null::numeric, 12::smallint, 'سعر ما قبل خصم اليوم الوطني 95 (مقال سبتمبر 2025) — قد يكون تغيّر.', null, 'https://www.economy-today.com/%D8%A7%D9%84%D9%8A%D9%88%D9%85-%D8%A7%D9%84%D9%88%D8%B7%D9%86%D9%8A-95-%D8%AE%D8%B5%D9%88%D9%85%D8%A7%D8%AA-%D9%81%D8%AA%D9%86%D8%B3-%D8%AA%D8%A7%D9%8A%D9%85-%D8%A7%D8%B3%D8%AA%D8%AB%D9%86%D8%A7/', '2025-09-13', 'article'),
  ('fitness-time', 'السعر الأساسي – 6 شهور (فتنس)', 3589::numeric, null::numeric, 6::smallint, 'سعر ما قبل خصم اليوم الوطني 95 (مقال سبتمبر 2025) — قد يكون تغيّر.', null, 'https://www.economy-today.com/%D8%A7%D9%84%D9%8A%D9%88%D9%85-%D8%A7%D9%84%D9%88%D8%B7%D9%86%D9%8A-95-%D8%AE%D8%B5%D9%88%D9%85%D8%A7%D8%AA-%D9%81%D8%AA%D9%86%D8%B3-%D8%AA%D8%A7%D9%8A%D9%85-%D8%A7%D8%B3%D8%AA%D8%AB%D9%86%D8%A7/', '2025-09-13', 'article'),
  ('fitness-time', 'السعر الأساسي – 3 شهور (فتنس)', 2189::numeric, null::numeric, 3::smallint, 'سعر ما قبل خصم اليوم الوطني 95 (مقال سبتمبر 2025) — قد يكون تغيّر.', null, 'https://www.economy-today.com/%D8%A7%D9%84%D9%8A%D9%88%D9%85-%D8%A7%D9%84%D9%88%D8%B7%D9%86%D9%8A-95-%D8%AE%D8%B5%D9%88%D9%85%D8%A7%D8%AA-%D9%81%D8%AA%D9%86%D8%B3-%D8%AA%D8%A7%D9%8A%D9%85-%D8%A7%D8%B3%D8%AA%D8%AB%D9%86%D8%A7/', '2025-09-13', 'article'),
  ('fitness-time-plus', 'اشتراك سنة – بلس', 12644::numeric, null::numeric, 12::smallint, 'من مقال غير رسمي وتغريدة مقارنة أسعار (نوفمبر 2025) — غير مؤكد من المصدر الرسمي.', null, 'https://mqalaty.net/%D8%A7%D8%B3%D8%B9%D8%A7%D8%B1-%D8%A7%D9%84%D8%A7%D8%B4%D8%AA%D8%B1%D8%A7%D9%83-%D9%81%D9%8A-%D9%88%D9%82%D8%AA-%D8%A7%D9%84%D9%84%D9%8A%D8%A7%D9%82%D8%A9/', '2026-06-03', 'uncertain'),
  ('fitness-time-pro', 'السعر الأساسي – 12 شهر (برو)', 4639::numeric, null::numeric, 12::smallint, 'سعر ما قبل خصم اليوم الوطني 95 (مقال سبتمبر 2025) — قد يكون تغيّر.', null, 'https://www.economy-today.com/%D8%A7%D9%84%D9%8A%D9%88%D9%85-%D8%A7%D9%84%D9%88%D8%B7%D9%86%D9%8A-95-%D8%AE%D8%B5%D9%88%D9%85%D8%A7%D8%AA-%D9%81%D8%AA%D9%86%D8%B3-%D8%AA%D8%A7%D9%8A%D9%85-%D8%A7%D8%B3%D8%AA%D8%AB%D9%86%D8%A7/', '2025-09-13', 'article'),
  ('fitness-time-pro', 'السعر الأساسي – 6 شهور (برو)', 2799::numeric, null::numeric, 6::smallint, 'سعر ما قبل خصم اليوم الوطني 95 (مقال سبتمبر 2025) — قد يكون تغيّر.', null, 'https://www.economy-today.com/%D8%A7%D9%84%D9%8A%D9%88%D9%85-%D8%A7%D9%84%D9%88%D8%B7%D9%86%D9%8A-95-%D8%AE%D8%B5%D9%88%D9%85%D8%A7%D8%AA-%D9%81%D8%AA%D9%86%D8%B3-%D8%AA%D8%A7%D9%8A%D9%85-%D8%A7%D8%B3%D8%AA%D8%AB%D9%86%D8%A7/', '2025-09-13', 'article'),
  ('fitness-time-pro', 'السعر الأساسي – 3 شهور (برو)', 1649::numeric, null::numeric, 3::smallint, 'سعر ما قبل خصم اليوم الوطني 95 (مقال سبتمبر 2025) — قد يكون تغيّر.', null, 'https://www.economy-today.com/%D8%A7%D9%84%D9%8A%D9%88%D9%85-%D8%A7%D9%84%D9%88%D8%B7%D9%86%D9%8A-95-%D8%AE%D8%B5%D9%88%D9%85%D8%A7%D8%AA-%D9%81%D8%AA%D9%86%D8%B3-%D8%AA%D8%A7%D9%8A%D9%85-%D8%A7%D8%B3%D8%AA%D8%AB%D9%86%D8%A7/', '2025-09-13', 'article'),
  ('fitness-time-xpress', 'السعر الأساسي – 12 شهر (إكسبرس)', 1899::numeric, null::numeric, 12::smallint, 'سعر ما قبل خصم اليوم الوطني 95 (مقال سبتمبر 2025) — قد يكون تغيّر.', null, 'https://www.economy-today.com/%D8%A7%D9%84%D9%8A%D9%88%D9%85-%D8%A7%D9%84%D9%88%D8%B7%D9%86%D9%8A-95-%D8%AE%D8%B5%D9%88%D9%85%D8%A7%D8%AA-%D9%81%D8%AA%D9%86%D8%B3-%D8%AA%D8%A7%D9%8A%D9%85-%D8%A7%D8%B3%D8%AA%D8%AB%D9%86%D8%A7/', '2025-09-13', 'article'),
  ('fitness-time-xpress', 'السعر الأساسي – 3 شهور (إكسبرس)', 789::numeric, null::numeric, 3::smallint, 'سعر ما قبل خصم اليوم الوطني 95 (مقال سبتمبر 2025) — قد يكون تغيّر.', null, 'https://www.economy-today.com/%D8%A7%D9%84%D9%8A%D9%88%D9%85-%D8%A7%D9%84%D9%88%D8%B7%D9%86%D9%8A-95-%D8%AE%D8%B5%D9%88%D9%85%D8%A7%D8%AA-%D9%81%D8%AA%D9%86%D8%B3-%D8%AA%D8%A7%D9%8A%D9%85-%D8%A7%D8%B3%D8%AA%D8%AB%D9%86%D8%A7/', '2025-09-13', 'article'),
  ('fitness-time-ladies', 'عرض اليوم الوطني 96 – سنة فئة فتنس', 3096::numeric, null::numeric, 12::smallint, 'فئة فتنس للسيدات لمدة سنة + 30 يوم إضافية عند التجديد. السعر القديم والضريبة غير مذكورين.', null, 'https://3rooodnews.net/876794', '2026-08-27', 'article'),
  ('optimo', 'عضوية سنة – دفعة وحدة', 12960::numeric, null::numeric, 12::smallint, 'شامل الضريبة (11,269 قبل الضريبة)، التزام 12 شهر.', null, 'https://optimo.com.sa/memberships', null, 'official'),
  ('golds-gym', 'اشتراك سنة – الرياض (رجال)', 7317::numeric, null::numeric, 12::smallint, 'من المتجر الإلكتروني الرسمي. الضريبة غير مذكورة وقد تكون الأسعار تغيّرت.', null, 'https://shop.ggarabia.com/wp-json/wc/store/v1/products/32437', null, 'official'),
  ('golds-gym', 'اشتراك 6 شهور – الرياض (رجال)', 5072::numeric, null::numeric, 6::smallint, 'من المتجر الإلكتروني الرسمي. الضريبة غير مذكورة وقد تكون الأسعار تغيّرت.', null, 'https://shop.ggarabia.com/wp-json/wc/store/v1/products/32441', null, 'official'),
  ('golds-gym', 'اشتراك 3 شهور – الرياض (رجال)', 3985::numeric, null::numeric, 3::smallint, 'من المتجر الإلكتروني الرسمي. الضريبة غير مذكورة وقد تكون الأسعار تغيّرت.', null, 'https://shop.ggarabia.com/wp-json/wc/store/v1/products/32433', null, 'official'),
  ('golds-gym', 'اشتراك سنة – جدة الزهراء (سيدات)', 7173::numeric, null::numeric, 12::smallint, 'من المتجر الإلكتروني الرسمي. الضريبة غير مذكورة وقد تكون الأسعار تغيّرت.', null, 'https://shop.ggarabia.com/wp-json/wc/store/v1/products/32419', null, 'official'),
  ('golds-gym', 'اشتراك سنة – أبها (رجال)', 5844::numeric, null::numeric, 12::smallint, 'من المتجر الإلكتروني الرسمي. الضريبة غير مذكورة وقد تكون الأسعار تغيّرت.', null, 'https://shop.ggarabia.com/wp-json/wc/store/v1/products/32436', null, 'official'),
  ('golds-gym', 'عرض اليوم الوطني 96 – سنة (أبها)', 1796::numeric, null::numeric, 12::smallint, 'فرع أبها + كاش باك 100 ريال عند التجديد. قد يكون فرع أبها فرنشايز مستقل.', null, 'https://www.3orod.today/saudi-arabia-offers/national-day/golds-gym-abha-2-9-2026.html', '2026-09-02', 'article'),
  ('golds-gym', 'عرض اليوم الوطني 96 – 6 شهور (أبها)', 1396::numeric, null::numeric, 6::smallint, 'فرع أبها + كاش باك 100 ريال عند التجديد.', null, 'https://www.3orod.today/saudi-arabia-offers/national-day/golds-gym-abha-2-9-2026.html', '2026-09-02', 'article'),
  ('golds-gym', 'عرض اليوم الوطني 96 – 3 شهور (أبها)', 996::numeric, null::numeric, 3::smallint, 'فرع أبها + كاش باك 100 ريال عند التجديد.', null, 'https://www.3orod.today/saudi-arabia-offers/national-day/golds-gym-abha-2-9-2026.html', '2026-09-02', 'article'),
  ('body-masters', 'عرض اليوم الوطني – بريميوم 3 شهور', 1008::numeric, 2520::numeric, 3::smallint, '3 شهور + 15 يوم مجاناً، إيقاف مجاني. شامل الضريبة 15%.', '2026-09-30', 'https://3rooodnews.net/885152', '2026-09-25', 'article'),
  ('body-masters', 'عرض اليوم الوطني – بريميوم 6 شهور', 1652::numeric, 4130::numeric, 6::smallint, '6 شهور + 30 يوم مجاناً. شامل الضريبة 15%.', '2026-09-30', 'https://3rooodnews.net/885152', '2026-09-25', 'article'),
  ('body-masters', 'عرض اليوم الوطني – بريميوم سنة', 2552::numeric, 6380::numeric, 12::smallint, '12 شهر + 30 يوم مجاناً. شامل الضريبة 15%.', '2026-09-30', 'https://3rooodnews.net/885152', '2026-09-25', 'article'),
  ('body-masters', 'عرض اليوم الوطني – إكسبرس 3 شهور', 676::numeric, 1691::numeric, 3::smallint, '3 شهور + 15 يوم مجاناً. شامل الضريبة 15%.', '2026-09-30', 'https://3rooodnews.net/885152', '2026-09-25', 'article'),
  ('body-masters', 'عرض اليوم الوطني – إكسبرس 6 شهور', 1148::numeric, 2870::numeric, 6::smallint, '6 شهور + 30 يوم مجاناً. شامل الضريبة 15%.', '2026-09-30', 'https://3rooodnews.net/885152', '2026-09-25', 'article'),
  ('body-masters', 'عرض اليوم الوطني – إكسبرس سنة', 1916::numeric, 4790::numeric, 12::smallint, '12 شهر + 30 يوم مجاناً. شامل الضريبة 15%.', '2026-09-30', 'https://3rooodnews.net/885152', '2026-09-25', 'article'),
  ('puregym', 'عرض اليوم الوطني – كور بـ 96 ريال شهرياً', 96::numeric, null::numeric, 1::smallint, 'سعر شهري على عضوية كور بعقد ثابت 4 شهور، بالكود SND4.', null, 'https://ksa.puregymarabia.com/en-gb/membership-options', null, 'official'),
  ('puregym', 'كور شهري بدون عقد', 242::numeric, null::numeric, 1::smallint, 'فرع السعادة بالرياض (رجال)، نادي واحد، + رسوم انضمام 39 ريال.', null, 'https://ksa.puregymarabia.com/en-gb/gyms/as-saadah-man', null, 'official'),
  ('puregym', 'بلس شهري بدون عقد', 305::numeric, null::numeric, 1::smallint, 'فرع السعادة بالرياض (رجال): أكثر من فرع + كلاسات + تجميد مجاني، + رسوم انضمام 79 ريال.', null, 'https://ksa.puregymarabia.com/en-gb/gyms/as-saadah-man', null, 'official'),
  ('puregym', 'كور شهري – الصفا جدة (سيدات)', 229::numeric, null::numeric, 1::smallint, 'فرع الصفا بجدة للسيدات، + رسوم انضمام 36 ريال.', null, 'https://ksa.puregymarabia.com/en-gb/gyms/jeddah-alsafa-woman/', null, 'official'),
  ('puregym', 'كور 3 شهور (عقد ثابت)', 685::numeric, null::numeric, 3::smallint, 'يبدأ من هذا السعر + رسوم انضمام.', null, 'https://ksa.puregymarabia.com/en-gb/membership-options', null, 'official'),
  ('puregym', 'كور 6 شهور (عقد ثابت)', 1159::numeric, null::numeric, 6::smallint, 'يبدأ من هذا السعر + رسوم انضمام.', null, 'https://ksa.puregymarabia.com/en-gb/membership-options', null, 'official'),
  ('puregym', 'كور 12 شهر (عقد ثابت)', 1824::numeric, null::numeric, 12::smallint, 'يبدأ من هذا السعر + رسوم انضمام.', null, 'https://ksa.puregymarabia.com/en-gb/membership-options', null, 'official'),
  ('puregym', 'بلس 3 شهور (عقد ثابت)', 844::numeric, null::numeric, 3::smallint, 'يبدأ من هذا السعر + رسوم انضمام.', null, 'https://ksa.puregymarabia.com/en-gb/membership-options', null, 'official'),
  ('puregym', 'بلس 6 شهور (عقد ثابت)', 1465::numeric, null::numeric, 6::smallint, 'يبدأ من هذا السعر + رسوم انضمام.', null, 'https://ksa.puregymarabia.com/en-gb/membership-options', null, 'official'),
  ('puregym', 'بلس 12 شهر (عقد ثابت)', 2299::numeric, null::numeric, 12::smallint, 'يبدأ من هذا السعر + رسوم انضمام.', null, 'https://ksa.puregymarabia.com/en-gb/membership-options', null, 'official'),
  ('puregym', 'تذكرة يوم واحد', 75::numeric, null::numeric, 0::smallint, 'تبدأ من 75 ريال.', null, 'https://ksa.puregymarabia.com/en-gb/membership-options', null, 'official'),
  ('puregym', 'تذكرة 3 أيام', 145::numeric, null::numeric, 0::smallint, 'تذكرة لمدة 3 أيام، تبدأ من 145 ريال.', null, 'https://ksa.puregymarabia.com/en-gb/membership-options', null, 'official'),
  ('gymnation', 'كور شهري – قرطبة الرياض', 229::numeric, null::numeric, 1::smallint, 'نادي واحد + جلسة تدريب شخصي أولى مجانية. نفس السعر لفرعي الرجال والسيدات بقرطبة.', null, 'https://gymnation.com/en-sa/gymsnearme/qurtubah-mens/', null, 'official'),
  ('gymnation', 'بلس شهري – كل الفروع', 250::numeric, null::numeric, 1::smallint, 'دخول كل فروع جيم نيشن (السعر من صفحة فرع قرطبة).', null, 'https://gymnation.com/en-sa/gymsnearme/qurtubah-mens/', null, 'official'),
  ('gymnation', 'سيغنتشر شهري', 399::numeric, null::numeric, 1::smallint, 'دخول كامل + برامج هايروكس وبلتز وبيلاتس ريفورمر.', null, 'https://gymnation.com/en-sa/gymsnearme/qurtubah-mens/', null, 'official'),
  ('gymnation', 'كور شهري – المروة جدة (سيدات)', 209::numeric, null::numeric, 1::smallint, 'فرع السيدات في لولو المروة بجدة، نادي واحد.', null, 'https://gymnation.com/en-sa/gymsnearme/al-marwah-ladies/', null, 'official'),
  ('fitness-first', 'تذكرة يوم – رجال', 35::numeric, null::numeric, 0::smallint, 'سعر الدخول ليوم واحد حسب دليل أندية الرياض.', null, 'https://houseofsaud.com/travel/riyadh-gym-guide/', '2026-04-23', 'article'),
  ('fitness-first', 'تذكرة يوم – سيدات', 69::numeric, null::numeric, 0::smallint, 'سعر الدخول ليوم واحد حسب دليل أندية الرياض.', null, 'https://houseofsaud.com/travel/riyadh-gym-guide/', '2026-04-23', 'article'),
  ('smart-fitness', 'عرض اليوم الوطني 96 – 3 شهور للسيدات', 1096::numeric, null::numeric, 3::smallint, '3 شهور + 30 يوم مجاناً لفروع السيدات. شامل الضريبة.', null, 'https://www.3orod.today/saudi-arabia-offers/national-day/smart-fitness-ladies-2-9-2026.html', '2026-09-02', 'article')
) as v(slug, title, price, old, months, details, ends_on, source, seen, conf)
join public.gym_chains c on c.slug = v.slug
where not exists (select 1 from public.gym_offers x where x.chain_id = c.id and x.title = v.title);
