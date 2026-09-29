-- ARQ — إعداد قاعدة البيانات كاملة (مرة وحدة)
-- الصق هذا الملف كله في Supabase > SQL Editor > New query ثم Run.
-- مولّد تلقائياً من supabase/migrations (48 ملف) — لا تعدّله يدوياً: npm run db:bundle

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


-- ===================== 20260927080000_provider_gyms.sql =====================
-- =====================================================================
-- النوادي القريبة من مزود خرائط: تسجيل الحضور يشتغل في أي نادي حقيقي بدون ما يضيفه أحد يدوياً
--   * دالة الحافة gyms-nearby تجيب النوادي حول موقع المستخدم (OpenStreetMap مجاناً، أو Google Places إذا أُضيف مفتاح)
--   * تضيفها هنا كنوادي موثّقة (مكان حقيقي من الخريطة) وتربطها بسلسلتها إذا طابق الاسم (وقت اللياقة، جولدز…)
--   * كل منطقة (~٢ كم) تُمسح مرة كل أسبوعين فقط
-- =====================================================================
alter table public.gyms
  add column if not exists source      text not null default 'user' check (source in ('user','osm','google','admin')),
  add column if not exists external_id text check (char_length(external_id) <= 200),
  add column if not exists address     text check (char_length(address) <= 200);
create unique index if not exists gyms_source_external on public.gyms (source, external_id) where external_id is not null;

-- سجل المناطق الممسوحة (للخادم فقط — بدون صلاحيات للمستخدمين)
create table if not exists public.gym_area_scans (
  cell        text primary key check (char_length(cell) <= 40),
  provider    text not null check (provider in ('osm','google')),
  scanned_at  timestamptz not null default now(),
  found       integer not null default 0
);
alter table public.gym_area_scans enable row level security;
revoke all on public.gym_area_scans from anon, authenticated;

-- مفتاح مقارنة الأسماء: حروف وأرقام فقط، بدون KSA/Arabia في آخر الاسم الإنجليزي
create or replace function public._name_key(p text)
returns text language sql immutable as $$
  select lower(regexp_replace(regexp_replace(coalesce(p, ''), '\s+(ksa|arabia|saudi arabia)\s*$', '', 'i'),
                              '[[:space:]_''’`".,&|/()+:ـ-]+', '', 'g'));
$$;

-- ربط النادي بسلسلته من اسمه (الأطول يغلب: «وقت اللياقة بلس» قبل «وقت اللياقة»)
create or replace function public._match_chain(p_name text)
returns uuid language sql stable set search_path = public as $$
  with k as (select _name_key(p_name) as n)
  select c.id from gym_chains c, k
  where c.active and char_length(k.n) >= 3 and (
        (char_length(_name_key(c.name_en)) >= 4 and position(_name_key(c.name_en) in k.n) > 0)
     or (char_length(_name_key(c.name)) >= 3 and position(_name_key(c.name) in k.n) > 0))
  order by greatest(char_length(_name_key(c.name_en)), char_length(_name_key(c.name))) desc
  limit 1;
$$;
revoke all on function public._name_key(text) from public, anon, authenticated;
revoke all on function public._match_chain(text) from public, anon, authenticated;

-- إضافة/تحديث نوادي المزود — للخادم فقط (service_role)
create or replace function public.upsert_provider_gyms(p_source text, p_places jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_n   integer := 0;
  r     jsonb;
  v_lat double precision;
  v_lng double precision;
begin
  if p_source not in ('osm','google') then raise exception 'bad_source'; end if;
  for r in select value from jsonb_array_elements(coalesce(p_places, '[]'::jsonb)) loop
    continue when coalesce(r->>'id', '') = '' or coalesce(btrim(r->>'name'), '') = '';
    v_lat := (r->>'lat')::double precision;
    v_lng := (r->>'lng')::double precision;
    continue when v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180;
    insert into gyms (name, name_en, city, address, lat, lng, radius_m, verified, source, external_id, chain_id)
    values (left(btrim(r->>'name'), 80),
            nullif(left(btrim(coalesce(r->>'name_en', '')), 80), ''),
            nullif(left(btrim(coalesce(r->>'city', '')), 60), ''),
            nullif(left(btrim(coalesce(r->>'address', '')), 200), ''),
            v_lat, v_lng, 200, true, p_source, left(r->>'id', 200),
            _match_chain(concat_ws(' ', r->>'name', r->>'name_en')))
    on conflict (source, external_id) where external_id is not null do update set
      name     = excluded.name,
      name_en  = coalesce(excluded.name_en, gyms.name_en),
      city     = coalesce(excluded.city, gyms.city),
      address  = coalesce(excluded.address, gyms.address),
      lat      = excluded.lat,
      lng      = excluded.lng,
      chain_id = coalesce(gyms.chain_id, excluded.chain_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.upsert_provider_gyms(text, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_provider_gyms(text, jsonb) to service_role;

-- النوادي القريبة: نضيف العنوان والسلسلة (لعرضها في قائمة الاختيار)
drop function if exists public.nearby_gyms(double precision, double precision, double precision);
create or replace function public.nearby_gyms(p_lat double precision, p_lng double precision,
                                              p_km double precision default 25)
returns table (id uuid, name text, name_en text, city text, lat double precision,
               lng double precision, radius_m integer, verified boolean, distance_m double precision,
               address text, chain_id uuid)
language sql stable as $$
  select g.id, g.name, g.name_en, g.city, g.lat, g.lng, g.radius_m, g.verified,
         distance_m(p_lat, p_lng, g.lat, g.lng) as d, g.address, g.chain_id
  from gyms g
  where distance_m(p_lat, p_lng, g.lat, g.lng) <= p_km * 1000
  order by d
  limit 50;
$$;
revoke all on function public.nearby_gyms(double precision, double precision, double precision) from public, anon;
grant execute on function public.nearby_gyms(double precision, double precision, double precision) to authenticated;


-- ===================== 20260927090000_food_log.sql =====================
-- =====================================================================
-- سجل الأكل وحساب السعرات: كل مستخدم يسجّل وش أكل (من قاعدة الأطعمة أو أكل مخصص أو وجبة الخطة)
-- خاص تماماً: ما يشوفه إلا صاحبه
-- =====================================================================
create table public.food_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  eaten_on    date not null default app_today(),
  slot        text not null check (slot in ('breakfast','lunch','snack','dinner')),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  food_id     text check (char_length(food_id) <= 60),
  servings    numeric(5,2) not null default 1 check (servings > 0 and servings <= 20),
  kcal        integer not null check (kcal between 0 and 5000),
  protein_g   numeric(6,1) not null default 0 check (protein_g between 0 and 500),
  carbs_g     numeric(6,1) not null default 0 check (carbs_g between 0 and 1000),
  fat_g       numeric(6,1) not null default 0 check (fat_g between 0 and 500),
  source      text not null default 'db' check (source in ('db','custom','plan','barcode','photo')),
  created_at  timestamptz not null default now()
);
create index on public.food_logs (user_id, eaten_on desc);

alter table public.food_logs enable row level security;
create policy food_own on public.food_logs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- مجموع اليوم (أو أي يوم) للمستخدم الحالي
create or replace function public.food_day_totals(p_day date default null)
returns table (kcal bigint, protein_g numeric, carbs_g numeric, fat_g numeric, items bigint)
language sql stable security invoker set search_path = public as $$
  select coalesce(sum(kcal), 0), coalesce(sum(protein_g), 0), coalesce(sum(carbs_g), 0), coalesce(sum(fat_g), 0), count(*)
  from food_logs where user_id = auth.uid() and eaten_on = coalesce(p_day, app_today());
$$;
revoke all on function public.food_day_totals(date) from public, anon;
grant execute on function public.food_day_totals(date) to authenticated;


-- ===================== 20260927100000_app_events.sql =====================
-- =====================================================================
-- سجل أحداث وأخطاء التطبيق (للنسخة التجريبية): يساعدنا نعرف سبب أي مشكلة بدون ما نطلب من المختبر شرح تقني
--   * كل مستخدم يكتب أحداثه فقط، والمالك وحده يقرأها
-- =====================================================================
create table public.app_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid default auth.uid() references public.profiles(id) on delete cascade,
  kind        text not null check (char_length(kind) between 1 and 60),
  detail      jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 8000),
  app         jsonb not null default '{}'::jsonb check (pg_column_size(app) <= 2000),
  created_at  timestamptz not null default now()
);
create index on public.app_events (created_at desc);
create index on public.app_events (kind, created_at desc);

alter table public.app_events enable row level security;
create policy events_insert_own on public.app_events for insert to authenticated with check (user_id = auth.uid());
create policy events_owner_read on public.app_events for select to authenticated using (is_admin());
revoke update, delete on public.app_events from anon, authenticated;


-- ===================== 20260928000000_gym_search.sql =====================
-- =====================================================================
-- البحث عن النادي بالاسم من الخريطة (Google Places، أو OpenStreetMap احتياطياً)
--   دالة الحافة gyms-nearby تستقبل { q } وتضيف النتائج كنوادي حقيقية موثّقة
--   هذا السجل للحد من كثرة البحث (٤٠ بحث بالساعة لكل مستخدم) — للخادم فقط
-- =====================================================================
create table if not exists public.gym_search_log (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  q           text not null check (char_length(q) <= 80),
  created_at  timestamptz not null default now()
);
create index if not exists gym_search_log_user_time on public.gym_search_log (user_id, created_at desc);
alter table public.gym_search_log enable row level security;
revoke all on public.gym_search_log from anon, authenticated;


-- ===================== 20260928010000_notifications.sql =====================
-- =====================================================================
-- التنبيهات
--   * notifications: سجل التنبيهات داخل التطبيق (الجرس) — كل مستخدم يشوف تنبيهاته فقط
--   * push_tokens: أجهزة المستخدم لإرسال إشعارات الجوال (Expo Push)
--   * notify_prefs في الملف الشخصي: أي أنواع توصل للجوال
--   * التنبيهات تنكتب من الخادم فقط (مشغّلات)، والإرسال للجوال عبر pg_net إلى خدمة Expo
-- =====================================================================

-- pg_net يرسل طلبات HTTP من قاعدة البيانات (موجود في Supabase). لو ما توفر (بيئة الاختبار) نكمل بدون إشعارات جوال.
do $$ begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net not available: phone push disabled';
end $$;

alter table public.profiles
  add column if not exists notify_prefs jsonb not null
    default '{"messages":true,"social":true,"activity":true,"progress":true,"offers":true}'::jsonb
    check (jsonb_typeof(notify_prefs) = 'object' and pg_column_size(notify_prefs) < 1000);
grant update (notify_prefs) on public.profiles to authenticated;

create table public.notifications (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete cascade,
  kind        text not null check (kind in (
                'follow','friend_request','friend_accept',
                'post_like','post_comment','checkin_like','checkin_comment','friend_here',
                'challenge_invite','challenge_win','rank_up','program_adopt','gym_offer')),
  target_id   uuid,
  data        jsonb not null default '{}'::jsonb check (pg_column_size(data) < 2000),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index notifications_user_time on public.notifications (user_id, id desc);
create index notifications_unread on public.notifications (user_id) where read_at is null;
-- نفس الشخص ما يطلع له نفس التنبيه مرتين (إعجاب/إلغاء/إعجاب، متابعة/إلغاء/متابعة…)
create unique index notifications_once on public.notifications (user_id, kind, actor_id, target_id) nulls not distinct
  where kind in ('follow','friend_request','post_like','checkin_like','friend_here','challenge_invite','program_adopt','gym_offer','rank_up');

alter table public.notifications enable row level security;
create policy notif_read   on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

create table public.push_tokens (
  token       text primary key check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,80}\]$'),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  platform    text not null check (platform in ('ios','android')),
  updated_at  timestamptz not null default now()
);
create index push_tokens_user on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
create policy ptok_read   on public.push_tokens for select to authenticated using (user_id = auth.uid());
create policy ptok_delete on public.push_tokens for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- تسجيل الجهاز (لو نفس الجهاز سجّل فيه حساب ثاني، ينتقل له)
-- ---------------------------------------------------------------------
create or replace function public.register_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  insert into push_tokens (token, user_id, platform, updated_at) values (p_token, auth.uid(), p_platform, now())
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
  -- حد أقصى ١٠ أجهزة لكل مستخدم (نحذف الأقدم)
  delete from push_tokens where user_id = auth.uid() and token in (
    select token from push_tokens where user_id = auth.uid() order by updated_at desc offset 10);
end $$;

create or replace function public.unregister_push_token(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from push_tokens where token = p_token and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- القراءة
-- ---------------------------------------------------------------------
create or replace function public.my_notifications(p_before bigint default null, p_limit integer default 40)
returns table (id bigint, kind text, target_id uuid, data jsonb, created_at timestamptz, read_at timestamptz,
               actor_id uuid, username text, full_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select n.id, n.kind, n.target_id, n.data, n.created_at, n.read_at, n.actor_id, p.username, p.full_name, p.avatar_url
  from notifications n left join profiles p on p.id = n.actor_id
  where n.user_id = auth.uid() and (p_before is null or n.id < p_before)
  order by n.id desc limit least(greatest(p_limit, 1), 100);
$$;

create or replace function public.mark_notifications_read(p_upto bigint default null)
returns void language sql security definer set search_path = public as $$
  update notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_upto is null or id <= p_upto);
$$;

-- ---------------------------------------------------------------------
-- نصوص إشعار الجوال (بلغة المستلم)
-- ---------------------------------------------------------------------
create or replace function public._rank_name(p_level integer, p_loc text)
returns text language sql immutable as $$
  select case when p_loc = 'en'
    then (array['Beginner','Committed','Advanced','Pro','Elite'])[p_level + 1]
    else (array['مبتدئ','ملتزم','متقدم','محترف','نخبة'])[p_level + 1] end;
$$;

create or replace function public._notif_text(p_kind text, p_name text, p_data jsonb, p_loc text)
returns text[] language plpgsql immutable as $$
declare
  en boolean := p_loc = 'en';
  n text := coalesce(p_name, case when en then 'Someone' else 'أحد' end);
  pv text := coalesce(p_data->>'preview', '');
  ti text := coalesce(p_data->>'title', '');
  gy text := coalesce(p_data->>'gym', '');
begin
  return case p_kind
    when 'message'          then array[n, pv]
    when 'follow'           then case when (p_data->>'mutual')::boolean
                                   then array[case when en then 'You follow each other now' else 'صرتوا تتابعون بعض' end,
                                              case when en then n || ' followed you back — you can message each other' else n || ' تابعك — تقدرون تتراسلون الحين' end]
                                   else array[case when en then 'New follower' else 'متابع جديد' end,
                                              case when en then n || ' started following you' else n || ' بدأ يتابعك' end] end
    when 'friend_request'   then array[case when en then 'Friend request' else 'طلب صداقة' end,
                                       case when en then n || ' wants to be your friend' else n || ' يبي يضيفك صديق' end]
    when 'friend_accept'    then array[case when en then 'You''re friends now' else 'صرتوا أصدقاء' end,
                                       case when en then n || ' accepted your friend request' else n || ' قبل طلب صداقتك' end]
    when 'post_like'        then array[case when en then 'New like' else 'إعجاب جديد' end,
                                       case when en then n || ' liked your post' else n || ' أعجبه منشورك' end]
    when 'post_comment'     then array[case when en then 'New comment' else 'تعليق جديد' end, n || ': ' || pv]
    when 'checkin_like'     then array[case when en then '💪 Props' else '💪 تشجيع' end,
                                       case when en then n || ' liked your gym check-in' else n || ' أعجبه حضورك للنادي' end]
    when 'checkin_comment'  then array[case when en then 'Comment on your check-in' else 'تعليق على حضورك' end, n || ': ' || pv]
    when 'friend_here'      then array[case when en then 'Your friend is at the gym' else 'صاحبك في النادي' end,
                                       case when en then n || ' just arrived at ' || gy else n || ' وصل ' || gy || ' الحين' end]
    when 'challenge_invite' then array[case when en then 'Challenge invite' else 'دعوة لتحدي' end,
                                       case when en then n || ' invited you to “' || ti || '”' else n || ' دعاك لتحدي «' || ti || '»' end]
    when 'challenge_win'    then array[case when en then '🏆 You won!' else '🏆 فزت بالتحدي' end,
                                       case when en then 'You won “' || ti || '” and earned ' || coalesce(p_data->>'points', '50') || ' points'
                                            else 'فزت في «' || ti || '» وأخذت ' || coalesce(p_data->>'points', '50') || ' نقطة' end]
    when 'rank_up'          then array[case when en then '⬆️ New rank' else '⬆️ رتبة جديدة' end,
                                       case when en then 'You reached “' || _rank_name((p_data->>'level')::int, 'en') || '”'
                                            else 'وصلت رتبة «' || _rank_name((p_data->>'level')::int, 'ar') || '» 🔥' end]
    when 'program_adopt'    then array[case when en then 'Your program is spreading' else 'برنامجك ينتشر' end,
                                       case when en then n || ' started your program “' || ti || '”' else n || ' بدأ برنامجك «' || ti || '»' end]
    when 'gym_offer'        then array[case when en then 'New offer at ' || gy else 'عرض جديد في ' || gy end,
                                       ti || ' — ' || coalesce(p_data->>'price', '') || case when en then ' SAR' else ' ر.س' end]
    else array[case when en then 'ARQ' else 'أرك' end, '']
  end;
end $$;

create or replace function public._notif_category(p_kind text)
returns text language sql immutable as $$
  select case
    when p_kind = 'message' then 'messages'
    when p_kind in ('follow','friend_request','friend_accept','friend_here') then 'social'
    when p_kind in ('post_like','post_comment','checkin_like','checkin_comment','program_adopt') then 'activity'
    when p_kind in ('challenge_invite','challenge_win','rank_up') then 'progress'
    when p_kind = 'gym_offer' then 'offers'
    else 'activity' end;
$$;

create or replace function public._display_name(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(full_name), ''), username) from profiles where id = p_user;
$$;

-- ---------------------------------------------------------------------
-- إرسال للجوال: رسالة لكل أجهزة المستخدم (لو فعّل النوع)
-- ---------------------------------------------------------------------
create or replace function public._push(p_user uuid, p_kind text, p_actor uuid, p_data jsonb, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_loc text; v_prefs jsonb; v_badge integer; v_txt text[]; v_msgs jsonb;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return; end if;
  if not exists (select 1 from push_tokens where user_id = p_user) then return; end if;
  select locale, notify_prefs into v_loc, v_prefs from profiles where id = p_user;
  if not found or coalesce((v_prefs->>_notif_category(p_kind))::boolean, true) = false then return; end if;

  v_txt := _notif_text(p_kind, _display_name(p_actor), p_data, v_loc);
  v_badge := (select count(*) from notifications where user_id = p_user and read_at is null)
           + (select count(*) from messages where recipient = p_user and read_at is null);
  select jsonb_agg(jsonb_build_object(
           'to', t.token, 'title', left(v_txt[1], 120), 'body', left(v_txt[2], 240),
           'data', jsonb_build_object('url', p_url, 'kind', p_kind),
           'sound', 'default', 'badge', v_badge, 'channelId', 'default', 'priority', 'high'))
    into v_msgs from push_tokens t where t.user_id = p_user;
  if v_msgs is null then return; end if;

  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 8000)'
    using 'https://exp.host/--/api/v2/push/send', v_msgs,
          '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb;
exception when others then
  -- الإشعار للجوال إضافة: ما نوقف العملية الأصلية (إعجاب، رسالة…) لو فشل
  raise warning 'push failed: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- تسجيل تنبيه + إرساله
-- ---------------------------------------------------------------------
create or replace function public._notify(p_user uuid, p_actor uuid, p_kind text, p_target uuid, p_data jsonb, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if p_user is null or p_user = p_actor then return; end if;
  insert into notifications (user_id, actor_id, kind, target_id, data)
  values (p_user, p_actor, p_kind, p_target, coalesce(p_data, '{}'::jsonb))
  on conflict do nothing
  returning id into v_id;
  if v_id is null then return; end if;
  -- نحتفظ بآخر ٢٠٠ تنبيه فقط لكل مستخدم
  delete from notifications where user_id = p_user and id < (
    select id from notifications where user_id = p_user order by id desc offset 199 limit 1);
  perform _push(p_user, p_kind, p_actor, p_data, p_url);
end $$;

-- ---------------------------------------------------------------------
-- المشغّلات
-- ---------------------------------------------------------------------
create or replace function public._on_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform _notify(new.followee, new.follower, 'follow', new.follower,
    jsonb_build_object('mutual', exists (select 1 from follows where follower = new.followee and followee = new.follower)),
    '/user/' || new.follower);
  return null;
end $$;
create trigger notify_follow after insert on public.follows for each row execute function public._on_follow();

create or replace function public._on_friendship()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform _notify(new.addressee, new.requester, 'friend_request', new.id, '{}', '/friends');
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status is distinct from 'accepted' then
    perform _notify(new.requester, new.addressee, 'friend_accept', new.id, '{}', '/user/' || new.addressee);
  end if;
  return null;
end $$;
create trigger notify_friendship after insert or update on public.friendships for each row execute function public._on_friendship();

create or replace function public._on_post_like()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform _notify((select user_id from posts where id = new.post_id), new.user_id, 'post_like', new.post_id, '{}', '/post/' || new.post_id);
  return null;
end $$;
create trigger notify_post_like after insert on public.post_likes for each row execute function public._on_post_like();

create or replace function public._on_post_comment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform _notify((select user_id from posts where id = new.post_id), new.user_id, 'post_comment', new.post_id,
    jsonb_build_object('preview', left(new.body, 80)), '/post/' || new.post_id);
  return null;
end $$;
create trigger notify_post_comment after insert on public.comments for each row execute function public._on_post_comment();

create or replace function public._on_checkin_like()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform _notify((select user_id from check_ins where id = new.check_in_id), new.user_id, 'checkin_like', new.check_in_id, '{}',
    '/checkin/' || new.check_in_id);
  return null;
end $$;
create trigger notify_checkin_like after insert on public.checkin_likes for each row execute function public._on_checkin_like();

create or replace function public._on_checkin_comment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform _notify((select user_id from check_ins where id = new.check_in_id), new.user_id, 'checkin_comment', new.check_in_id,
    jsonb_build_object('preview', left(new.body, 80)), '/checkin/' || new.check_in_id);
  return null;
end $$;
create trigger notify_checkin_comment after insert on public.checkin_comments for each row execute function public._on_checkin_comment();

-- صاحبك وصل نفس النادي اللي أنت فيه الحين (يحترم خيار «إخفاء حضوري»)
create or replace function public._on_check_in()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_gym text;
begin
  if (select presence_visibility from profiles where id = new.user_id) = 'hidden' then return null; end if;
  select coalesce(nullif(name, ''), name_en) into v_gym from gyms where id = new.gym_id;
  for r in
    select distinct c.user_id from check_ins c
    where c.gym_id = new.gym_id and c.user_id <> new.user_id
      and c.checked_out_at is null and c.checked_in_at > now() - interval '6 hours'
      and (are_friends(c.user_id, new.user_id) or mutual_follow(c.user_id, new.user_id))
    limit 30
  loop
    perform _notify(r.user_id, new.user_id, 'friend_here', new.id, jsonb_build_object('gym', v_gym), '/checkin/' || new.id);
  end loop;
  return null;
end $$;
create trigger notify_check_in after insert on public.check_ins for each row execute function public._on_check_in();

create or replace function public._on_challenge_member()
returns trigger language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if new.status <> 'invited' then return null; end if;
  select id, title, creator into c from challenges where id = new.challenge_id;
  perform _notify(new.user_id, coalesce(auth.uid(), c.creator), 'challenge_invite', c.id,
    jsonb_build_object('title', c.title), '/challenge/' || c.id);
  return null;
end $$;
create trigger notify_challenge_invite after insert on public.challenge_members for each row execute function public._on_challenge_member();

create or replace function public._on_points()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.reason = 'challenge_win' then
    perform _notify(new.user_id, null, 'challenge_win', new.ref_id,
      jsonb_build_object('title', (select title from challenges where id = new.ref_id), 'points', new.amount),
      '/challenge/' || new.ref_id);
  end if;
  return null;
end $$;
create trigger notify_points after insert on public.points_ledger for each row execute function public._on_points();

create or replace function public._on_rank_up()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_level integer := rank_level(new.points);
begin
  if v_level > rank_level(old.points) then
    -- target = معرّف ثابت لكل رتبة، عشان ما يتكرر لو نزلت النقاط ورجعت
    perform _notify(new.id, null, 'rank_up', ('00000000-0000-0000-0000-00000000000' || v_level)::uuid,
      jsonb_build_object('level', v_level), '/ranks');
  end if;
  return null;
end $$;
create trigger notify_rank_up after update of points on public.profiles for each row execute function public._on_rank_up();

create or replace function public._on_program_adopt()
returns trigger language plpgsql security definer set search_path = public as $$
declare p record;
begin
  select id, author, title into p from user_programs where id = new.program_id;
  perform _notify(p.author, new.user_id, 'program_adopt', p.id, jsonb_build_object('title', p.title), '/program/' || p.id);
  return null;
end $$;
create trigger notify_program_adopt after insert on public.program_adopts for each row execute function public._on_program_adopt();

-- عرض جديد في ناديك (أو في سلسلة ناديك): لمن ناديه الأساسي منها أو حضر فيها آخر ٦٠ يوم (حد أقصى ٢٠٠٠)
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
    with branches as (
      select id from gyms where id = new.gym_id or (new.gym_id is null and chain_id = new.chain_id)
    )
    select p.id from profiles p where p.gym_id in (select id from branches)
    union
    select c.user_id from check_ins c
    where c.gym_id in (select id from branches) and c.checked_in_at > now() - interval '60 days'
    limit 2000
  loop
    perform _notify(r.id, null, 'gym_offer', new.id, v_data, v_url);
  end loop;
  return null;
end $$;
create trigger notify_gym_offer after insert on public.gym_offers for each row execute function public._on_gym_offer();

-- الرسائل الخاصة: إشعار جوال فقط (صندوق الرسائل فيه عدّاد غير المقروء أصلاً)
create or replace function public._on_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform _push(new.recipient, 'message', new.sender, jsonb_build_object('preview', left(new.body, 120)), '/chat/' || new.sender);
  return null;
end $$;
create trigger notify_message after insert on public.messages for each row execute function public._on_message();

-- ---------------------------------------------------------------------
-- الصلاحيات
-- ---------------------------------------------------------------------
revoke all on function public._push(uuid, text, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public._notify(uuid, uuid, text, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public._display_name(uuid) from public, anon, authenticated;
revoke all on function public._notif_text(text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public._on_follow() from public, anon, authenticated;
revoke all on function public._on_friendship() from public, anon, authenticated;
revoke all on function public._on_post_like() from public, anon, authenticated;
revoke all on function public._on_post_comment() from public, anon, authenticated;
revoke all on function public._on_checkin_like() from public, anon, authenticated;
revoke all on function public._on_checkin_comment() from public, anon, authenticated;
revoke all on function public._on_check_in() from public, anon, authenticated;
revoke all on function public._on_challenge_member() from public, anon, authenticated;
revoke all on function public._on_points() from public, anon, authenticated;
revoke all on function public._on_rank_up() from public, anon, authenticated;
revoke all on function public._on_program_adopt() from public, anon, authenticated;
revoke all on function public._on_gym_offer() from public, anon, authenticated;
revoke all on function public._on_message() from public, anon, authenticated;
revoke all on function public.register_push_token(text, text) from public, anon;
revoke all on function public.unregister_push_token(text) from public, anon;
revoke all on function public.my_notifications(bigint, integer) from public, anon;
revoke all on function public.mark_notifications_read(bigint) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
grant execute on function public.my_notifications(bigint, integer) to authenticated;
grant execute on function public.mark_notifications_read(bigint) to authenticated;

-- الجرس يتحدّث لحظياً (Realtime يحترم RLS: كل واحد يستقبل تنبيهاته فقط)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;


-- ===================== 20260928020000_foursquare.sql =====================
-- =====================================================================
-- مزود ثالث للنوادي: Foursquare Places (يشتغل تلقائياً لو أُضيف FOURSQUARE_API_KEY في أسرار الدوال)
--   * ترتيب المزودين: Google ← Foursquare ← OpenStreetMap (المجاني)
--   * نفس النادي من مزودين مختلفين ما يتكرر: لو فيه نادي بنفس الاسم على بعد أقل من ٨٠ م نستخدمه
-- =====================================================================

-- نسمح بالمصدر الجديد (نحذف قيود المصدر القديمة أياً كان اسمها)
do $$
declare c record;
begin
  for c in select conname, conrelid::regclass as tbl from pg_constraint
           where contype = 'c' and conrelid in ('public.gyms'::regclass, 'public.gym_area_scans'::regclass)
             and (pg_get_constraintdef(oid) like '%source%''osm''%' or pg_get_constraintdef(oid) like '%provider%''osm''%')
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;
alter table public.gyms add constraint gyms_source_check
  check (source in ('user','osm','google','foursquare','admin'));
alter table public.gym_area_scans add constraint gym_area_scans_provider_check
  check (provider in ('osm','google','foursquare'));

-- إضافة/تحديث نوادي المزود وترجع لكل مكان رقم النادي عندنا: { "<معرّف المزود>": "<gym id>" }
create or replace function public.upsert_provider_gyms_ids(p_source text, p_places jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_out jsonb := '{}'::jsonb;
  r     jsonb;
  v_id  uuid;
  v_lat double precision;
  v_lng double precision;
  v_key text;
  v_key2 text;
begin
  if p_source not in ('osm','google','foursquare') then raise exception 'bad_source'; end if;
  for r in select value from jsonb_array_elements(coalesce(p_places, '[]'::jsonb)) loop
    continue when coalesce(r->>'id', '') = '' or coalesce(btrim(r->>'name'), '') = '';
    v_lat := (r->>'lat')::double precision;
    v_lng := (r->>'lng')::double precision;
    continue when v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180;

    -- ١) نفس المكان من نفس المزود: نحدّثه
    select id into v_id from gyms where source = p_source and external_id = left(r->>'id', 200);
    if v_id is not null then
      update gyms set
        name     = left(btrim(r->>'name'), 80),
        name_en  = coalesce(nullif(left(btrim(coalesce(r->>'name_en', '')), 80), ''), name_en),
        city     = coalesce(nullif(left(btrim(coalesce(r->>'city', '')), 60), ''), city),
        address  = coalesce(nullif(left(btrim(coalesce(r->>'address', '')), 200), ''), address),
        lat      = v_lat,
        lng      = v_lng,
        chain_id = coalesce(chain_id, _match_chain(concat_ws(' ', r->>'name', r->>'name_en')))
      where id = v_id;
    else
      -- ٢) نفس النادي من مزود ثاني (نفس الاسم وعلى بعد أقل من ٨٠ م): نستخدمه بدل ما نكرره
      v_key := _name_key(r->>'name');
      v_key2 := _name_key(r->>'name_en');
      select g.id into v_id from gyms g
      where g.source in ('osm','google','foursquare','admin')
        and g.lat between v_lat - 0.001 and v_lat + 0.001 and g.lng between v_lng - 0.001 and v_lng + 0.001
        and distance_m(g.lat, g.lng, v_lat, v_lng) < 80
        and ((char_length(v_key) >= 3 and v_key in (_name_key(g.name), _name_key(g.name_en)))
          or (char_length(v_key2) >= 3 and v_key2 in (_name_key(g.name), _name_key(g.name_en))))
      order by distance_m(g.lat, g.lng, v_lat, v_lng)
      limit 1;
      if v_id is not null then
        update gyms set
          name_en = coalesce(name_en, nullif(left(btrim(coalesce(r->>'name_en', '')), 80), '')),
          city    = coalesce(city, nullif(left(btrim(coalesce(r->>'city', '')), 60), '')),
          address = coalesce(address, nullif(left(btrim(coalesce(r->>'address', '')), 200), ''))
        where id = v_id;
      else
        -- ٣) نادي جديد (لو طلبين بنفس اللحظة أضافوه، نأخذ الموجود)
        begin
          insert into gyms (name, name_en, city, address, lat, lng, radius_m, verified, source, external_id, chain_id)
          values (left(btrim(r->>'name'), 80),
                  nullif(left(btrim(coalesce(r->>'name_en', '')), 80), ''),
                  nullif(left(btrim(coalesce(r->>'city', '')), 60), ''),
                  nullif(left(btrim(coalesce(r->>'address', '')), 200), ''),
                  v_lat, v_lng, 200, true, p_source, left(r->>'id', 200),
                  _match_chain(concat_ws(' ', r->>'name', r->>'name_en')))
          returning id into v_id;
        exception when unique_violation then
          select id into v_id from gyms where source = p_source and external_id = left(r->>'id', 200);
        end;
      end if;
    end if;
    v_out := v_out || jsonb_build_object(r->>'id', v_id);
  end loop;
  return v_out;
end $$;

-- النسخة القديمة (ترجع العدد) تبقى تشتغل للدالة المنشورة سابقاً
create or replace function public.upsert_provider_gyms(p_source text, p_places jsonb)
returns integer language sql security definer set search_path = public as $$
  select count(*)::integer from jsonb_object_keys(upsert_provider_gyms_ids(p_source, p_places));
$$;

revoke all on function public.upsert_provider_gyms_ids(text, jsonb) from public, anon, authenticated;
revoke all on function public.upsert_provider_gyms(text, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_provider_gyms_ids(text, jsonb) to service_role;
grant execute on function public.upsert_provider_gyms(text, jsonb) to service_role;


-- ===================== 20260928030000_nudges.sql =====================
-- =====================================================================
-- التنبيهات التحفيزية (من التطبيق نفسه): تحمّسك تروح النادي وتذكّرك بالتمرين والوجبات
--   * المالك يكتب النصوص من لوحة المالك، مقسّمة: رجال / نساء / الجميع، وعربي / English
--   * الأنواع وأوقاتها (بتوقيت الرياض):
--       workout  ٩ الصبح       لمن عنده تمرين في خطته اليوم وما بدأه
--       meal     ١ الظهر       لمن ما سجّل أكل اليوم
--       gym      قبل وقتك المعتاد بساعة (أو ٥ العصر)   لمن ما حضر اليوم
--       friend   نفس وقت gym   بدلها لو صديقك حضر اليوم وأنت لا («فيصل بيعضّل قبلك!»)
--       streak   ٩ الليل       لمن عنده سلسلة يومين فأكثر وما حضر اليوم
--   * حد أقصى ٣ تنبيهات باليوم لكل شخص، ومن ٨ الصبح لين ١٠ الليل فقط
--   * المتغيرات في النص: {name} {friend} {gym} {streak} {workout}
-- =====================================================================

-- نوع جديد في سجل التنبيهات
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'follow','friend_request','friend_accept',
  'post_like','post_comment','checkin_like','checkin_comment','friend_here',
  'challenge_invite','challenge_win','rank_up','program_adopt','gym_offer','nudge'));

create table public.nudge_templates (
  id             uuid primary key default gen_random_uuid(),
  category       text not null check (category in ('gym','friend','streak','workout','meal')),
  gender         text not null default 'all' check (gender in ('male','female','all')),
  friend_gender  text not null default 'all' check (friend_gender in ('male','female','all')),
  locale         text not null default 'ar' check (locale in ('ar','en')),
  title          text not null check (char_length(btrim(title)) between 1 and 80),
  body           text not null check (char_length(btrim(body)) between 3 and 240),
  active         boolean not null default true,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index nudge_templates_pick on public.nudge_templates (category, active);
alter table public.nudge_templates enable row level security;
create policy nudges_admin on public.nudge_templates for all to authenticated using (is_admin()) with check (is_admin());

create or replace function public._nudge_stamp()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); new.created_at := now();
  else new.created_by := old.created_by; new.created_at := old.created_at; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger nudge_templates_stamp before insert or update on public.nudge_templates
  for each row execute function public._nudge_stamp();

-- سجل المرسَل: يمنع التكرار ويحدد العدد اليومي (المالك يشوف الإحصاء)
create table public.nudge_log (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  day          date not null,
  slot         text not null check (slot in ('workout','meal','gym','streak')),
  category     text not null,
  template_id  uuid references public.nudge_templates(id) on delete set null,
  sent_at      timestamptz not null default now(),
  primary key (user_id, day, slot)
);
create index nudge_log_day on public.nudge_log (day);
alter table public.nudge_log enable row level security;
create policy nudge_log_admin on public.nudge_log for select to authenticated using (is_admin());

-- ---------------------------------------------------------------------
-- تعبئة المتغيرات واختيار نص مناسب
-- ---------------------------------------------------------------------
create or replace function public._nudge_fill(p text, v jsonb)
returns text language sql immutable as $$
  select replace(replace(replace(replace(replace(p,
    '{name}', coalesce(v->>'name', '')),
    '{friend}', coalesce(v->>'friend', '')),
    '{gym}', coalesce(v->>'gym', '')),
    '{streak}', coalesce(v->>'streak', '')),
    '{workout}', coalesce(v->>'workout', ''));
$$;

-- نص عشوائي من النشطة: نفس الجنس أو «الجميع»، ولغة المستخدم أولاً
create or replace function public._pick_nudge(p_cat text, p_gender text, p_locale text, p_friend_gender text default null)
returns public.nudge_templates language sql stable security definer set search_path = public as $$
  select t.* from nudge_templates t
  where t.active and t.category = p_cat
    and t.gender in ('all', coalesce(p_gender, 'male'))
    and (p_friend_gender is null or t.friend_gender in ('all', p_friend_gender))
  order by (t.locale = coalesce(p_locale, 'ar')) desc, random()
  limit 1;
$$;

-- يرسل تنبيه تحفيزي واحد (لو ما انرسل نفس الموعد اليوم) — يرجع هل انرسل
create or replace function public._send_nudge(p_user uuid, p_day date, p_slot text, p_cat text, p_gender text, p_locale text,
                                               p_vars jsonb, p_url text, p_friend uuid default null, p_friend_gender text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare t nudge_templates; v_title text; v_body text;
begin
  t := _pick_nudge(p_cat, p_gender, p_locale, p_friend_gender);
  if t.id is null then return false; end if;
  insert into nudge_log (user_id, day, slot, category, template_id) values (p_user, p_day, p_slot, p_cat, t.id)
  on conflict do nothing;
  if not found then return false; end if;
  v_title := left(btrim(_nudge_fill(t.title, p_vars)), 120);
  v_body  := left(btrim(_nudge_fill(t.body, p_vars)), 240);
  perform _notify(p_user, p_friend, 'nudge', t.id,
    jsonb_build_object('title', v_title, 'body', v_body, 'cat', p_cat, 'url', p_url), p_url);
  return true;
end $$;

-- ---------------------------------------------------------------------
-- المجدول: يشتغل كل ربع ساعة ويقرر لكل شخص هل يستاهل تنبيه الحين
-- ---------------------------------------------------------------------
create or replace function public.run_nudges(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_day    date := (p_now at time zone 'Asia/Riyadh')::date;
  v_hour   integer := extract(hour from (p_now at time zone 'Asia/Riyadh'))::integer;
  v_dow    integer := extract(dow from (p_now at time zone 'Asia/Riyadh'))::integer;  -- ٠ = الأحد (مثل الخطة)
  v_start  timestamptz := (v_day::timestamp) at time zone 'Asia/Riyadh';
  v_sent   integer := 0;
  u        record;
  f        record;
  v_vars   jsonb;
  v_today  jsonb;
  v_rest   boolean;
  v_in     boolean;
  v_usual  integer;
  v_gymh   integer;
  v_gym    text;
begin
  if v_hour < 8 or v_hour >= 22 then return 0; end if;

  for u in
    select p.id, p.locale, p.streak, p.last_checkin_on, p.full_name, p.username, p.gym_id, h.gender,
           (select pl.data from plans pl where pl.user_id = p.id and pl.active limit 1) as plan
    from profiles p left join health_profiles h on h.user_id = p.id
    where p.onboarded and coalesce((p.notify_prefs->>'nudges')::boolean, true)
  loop
    continue when (select count(*) from nudge_log where user_id = u.id and day = v_day) >= 3;

    v_in := exists (select 1 from check_ins c where c.user_id = u.id and c.checked_in_at >= v_start and c.checked_in_at <= p_now);
    v_today := (select d from jsonb_array_elements(coalesce(u.plan->'days', '[]'::jsonb)) d where (d->>'day')::int = v_dow limit 1);
    v_rest := u.plan is not null and (v_today is null or coalesce((v_today->>'rest')::boolean, false));
    select coalesce(nullif(g.name, ''), g.name_en) into v_gym from gyms g where g.id = u.gym_id;
    v_vars := jsonb_build_object(
      'name', split_part(coalesce(nullif(btrim(u.full_name), ''), u.username), ' ', 1),
      'gym', coalesce(v_gym, case when u.locale = 'en' then 'the gym' else 'النادي' end),
      'streak', u.streak,
      'workout', coalesce(v_today->'focus'->>coalesce(u.locale, 'ar'), v_today->'focus'->>'ar', ''));

    -- ١) تمرين اليوم (٩ الصبح)
    if v_hour = 9 and u.plan is not null and not v_rest
       and not exists (select 1 from workout_sessions w where w.user_id = u.id and w.started_at >= v_start) then
      if _send_nudge(u.id, v_day, 'workout', 'workout', u.gender, u.locale, v_vars, '/(tabs)/plan') then v_sent := v_sent + 1; end if;
    end if;

    -- ٢) الوجبات (١ الظهر): لمن عنده خطة أو يسجّل أكله، وما سجّل شي اليوم
    if v_hour = 13
       and (u.plan is not null or exists (select 1 from food_logs fl where fl.user_id = u.id and fl.eaten_on > v_day - 14))
       and not exists (select 1 from food_logs fl where fl.user_id = u.id and fl.eaten_on = v_day) then
      if _send_nudge(u.id, v_day, 'meal', 'meal', u.gender, u.locale, v_vars, '/food/add') then v_sent := v_sent + 1; end if;
    end if;

    -- ٣) النادي: قبل وقتك المعتاد بساعة (أو ٥ العصر) — ولو صديقك سبقك اليوم نقول لك
    if not v_in and not v_rest then
      select mode() within group (order by extract(hour from c.checked_in_at at time zone 'Asia/Riyadh'))::int into v_usual
      from check_ins c where c.user_id = u.id and c.checked_in_at > p_now - interval '30 days';
      v_gymh := greatest(8, least(20, coalesce(v_usual, 18) - 1));
      if v_hour = v_gymh then
        select p2.id, split_part(coalesce(nullif(btrim(p2.full_name), ''), p2.username), ' ', 1) as fname, h2.gender
          into f
        from check_ins c join profiles p2 on p2.id = c.user_id left join health_profiles h2 on h2.user_id = p2.id
        where c.checked_in_at >= v_start and c.checked_in_at <= p_now and c.user_id <> u.id
          and p2.presence_visibility <> 'hidden'
          and (are_friends(u.id, c.user_id) or mutual_follow(u.id, c.user_id))
        order by c.checked_in_at desc limit 1;
        if f.id is not null and _send_nudge(u.id, v_day, 'gym', 'friend', u.gender, u.locale,
                                            v_vars || jsonb_build_object('friend', f.fname), '/checkin', f.id, coalesce(f.gender, 'all')) then
          v_sent := v_sent + 1;
        elsif _send_nudge(u.id, v_day, 'gym', 'gym', u.gender, u.locale, v_vars, '/checkin') then
          v_sent := v_sent + 1;
        end if;
      end if;
    end if;

    -- ٤) لا تكسر السلسلة (٩ الليل)
    if v_hour = 21 and not v_in and coalesce(u.streak, 0) >= 2 and u.last_checkin_on = v_day - 1 then
      if _send_nudge(u.id, v_day, 'streak', 'streak', u.gender, u.locale, v_vars, '/checkin') then v_sent := v_sent + 1; end if;
    end if;
  end loop;
  return v_sent;
end $$;

-- ---------------------------------------------------------------------
-- للمالك: تجربة نص على نفسه، وإحصاء المرسَل
-- ---------------------------------------------------------------------
create or replace function public.send_test_nudge(p_template uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t nudge_templates; v_vars jsonb; me record;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  select * into t from nudge_templates where id = p_template;
  if t.id is null then raise exception 'not_found'; end if;
  select p.full_name, p.username, p.streak, g.name as gym into me
  from profiles p left join gyms g on g.id = p.gym_id where p.id = auth.uid();
  v_vars := jsonb_build_object(
    'name', split_part(coalesce(nullif(btrim(me.full_name), ''), me.username), ' ', 1),
    'friend', case when t.locale = 'en' then 'Faisal' when t.friend_gender = 'female' then 'ريم' else 'فيصل' end,
    'gym', coalesce(me.gym, case when t.locale = 'en' then 'the gym' else 'النادي' end),
    'streak', greatest(coalesce(me.streak, 0), 5),
    'workout', case when t.locale = 'en' then 'Chest & triceps' else 'صدر وتراي' end);
  insert into notifications (user_id, kind, target_id, data)
  values (auth.uid(), 'nudge', t.id, jsonb_build_object(
    'title', left(btrim(_nudge_fill(t.title, v_vars)), 120), 'body', left(btrim(_nudge_fill(t.body, v_vars)), 240),
    'cat', t.category, 'url', case t.category when 'workout' then '/(tabs)/plan' when 'meal' then '/food/add' else '/checkin' end,
    'test', true));
  perform _push(auth.uid(), 'nudge', null, jsonb_build_object(
    'title', left(btrim(_nudge_fill(t.title, v_vars)), 120), 'body', left(btrim(_nudge_fill(t.body, v_vars)), 240)), '/notifications');
end $$;

create or replace function public.nudge_stats(p_days integer default 7)
returns table (category text, today bigint, last_days bigint)
language sql stable security definer set search_path = public as $$
  select l.category,
         count(*) filter (where l.day = app_today()),
         count(*)
  from nudge_log l
  where is_admin() and l.day > app_today() - greatest(p_days, 1)
  group by l.category;
$$;

-- نصوص إشعار الجوال للنوع الجديد + فئته في الإعدادات
create or replace function public._notif_category(p_kind text)
returns text language sql immutable as $$
  select case
    when p_kind = 'message' then 'messages'
    when p_kind in ('follow','friend_request','friend_accept','friend_here') then 'social'
    when p_kind in ('post_like','post_comment','checkin_like','checkin_comment','program_adopt') then 'activity'
    when p_kind in ('challenge_invite','challenge_win','rank_up') then 'progress'
    when p_kind = 'gym_offer' then 'offers'
    when p_kind = 'nudge' then 'nudges'
    else 'activity' end;
$$;

-- نص إشعار الجوال للتنبيه التحفيزي = العنوان والنص الجاهزين من القالب
create or replace function public._notif_text(p_kind text, p_name text, p_data jsonb, p_loc text)
returns text[] language plpgsql immutable as $$
declare
  en boolean := p_loc = 'en';
  n text := coalesce(p_name, case when en then 'Someone' else 'أحد' end);
  pv text := coalesce(p_data->>'preview', '');
  ti text := coalesce(p_data->>'title', '');
  gy text := coalesce(p_data->>'gym', '');
begin
  return case p_kind
    when 'message'          then array[n, pv]
    when 'nudge'            then array[coalesce(p_data->>'title', ''), coalesce(p_data->>'body', '')]
    when 'follow'           then case when (p_data->>'mutual')::boolean
                                   then array[case when en then 'You follow each other now' else 'صرتوا تتابعون بعض' end,
                                              case when en then n || ' followed you back — you can message each other' else n || ' تابعك — تقدرون تتراسلون الحين' end]
                                   else array[case when en then 'New follower' else 'متابع جديد' end,
                                              case when en then n || ' started following you' else n || ' بدأ يتابعك' end] end
    when 'friend_request'   then array[case when en then 'Friend request' else 'طلب صداقة' end,
                                       case when en then n || ' wants to be your friend' else n || ' يبي يضيفك صديق' end]
    when 'friend_accept'    then array[case when en then 'You''re friends now' else 'صرتوا أصدقاء' end,
                                       case when en then n || ' accepted your friend request' else n || ' قبل طلب صداقتك' end]
    when 'post_like'        then array[case when en then 'New like' else 'إعجاب جديد' end,
                                       case when en then n || ' liked your post' else n || ' أعجبه منشورك' end]
    when 'post_comment'     then array[case when en then 'New comment' else 'تعليق جديد' end, n || ': ' || pv]
    when 'checkin_like'     then array[case when en then '💪 Props' else '💪 تشجيع' end,
                                       case when en then n || ' liked your gym check-in' else n || ' أعجبه حضورك للنادي' end]
    when 'checkin_comment'  then array[case when en then 'Comment on your check-in' else 'تعليق على حضورك' end, n || ': ' || pv]
    when 'friend_here'      then array[case when en then 'Your friend is at the gym' else 'صاحبك في النادي' end,
                                       case when en then n || ' just arrived at ' || gy else n || ' وصل ' || gy || ' الحين' end]
    when 'challenge_invite' then array[case when en then 'Challenge invite' else 'دعوة لتحدي' end,
                                       case when en then n || ' invited you to “' || ti || '”' else n || ' دعاك لتحدي «' || ti || '»' end]
    when 'challenge_win'    then array[case when en then '🏆 You won!' else '🏆 فزت بالتحدي' end,
                                       case when en then 'You won “' || ti || '” and earned ' || coalesce(p_data->>'points', '50') || ' points'
                                            else 'فزت في «' || ti || '» وأخذت ' || coalesce(p_data->>'points', '50') || ' نقطة' end]
    when 'rank_up'          then array[case when en then '⬆️ New rank' else '⬆️ رتبة جديدة' end,
                                       case when en then 'You reached “' || _rank_name((p_data->>'level')::int, 'en') || '”'
                                            else 'وصلت رتبة «' || _rank_name((p_data->>'level')::int, 'ar') || '» 🔥' end]
    when 'program_adopt'    then array[case when en then 'Your program is spreading' else 'برنامجك ينتشر' end,
                                       case when en then n || ' started your program “' || ti || '”' else n || ' بدأ برنامجك «' || ti || '»' end]
    when 'gym_offer'        then array[case when en then 'New offer at ' || gy else 'عرض جديد في ' || gy end,
                                       ti || ' — ' || coalesce(p_data->>'price', '') || case when en then ' SAR' else ' ر.س' end]
    else array[case when en then 'ARQ' else 'أرك' end, '']
  end;
end $$;

-- ---------------------------------------------------------------------
-- الصلاحيات
-- ---------------------------------------------------------------------
revoke all on function public._nudge_fill(text, jsonb) from public, anon, authenticated;
revoke all on function public._pick_nudge(text, text, text, text) from public, anon, authenticated;
revoke all on function public._send_nudge(uuid, date, text, text, text, text, jsonb, text, uuid, text) from public, anon, authenticated;
revoke all on function public.run_nudges(timestamptz) from public, anon, authenticated;
revoke all on function public._nudge_stamp() from public, anon, authenticated;
revoke all on function public.send_test_nudge(uuid) from public, anon;
revoke all on function public.nudge_stats(integer) from public, anon;
grant execute on function public.send_test_nudge(uuid) to authenticated;
grant execute on function public.nudge_stats(integer) to authenticated;

-- ---------------------------------------------------------------------
-- الجدولة كل ربع ساعة (pg_cron في Supabase). بيئة الاختبار ما فيها pg_cron فنتجاوز
-- ---------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('arq-nudges', '*/15 * * * *', 'select public.run_nudges()');
exception when others then
  raise notice 'pg_cron not available: nudges not scheduled (%)', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- نصوص البداية (المالك يعدّلها ويضيف عليها من لوحة المالك)
-- ---------------------------------------------------------------------
insert into public.nudge_templates (category, gender, friend_gender, locale, title, body) values
  -- النادي — رجال
  ('gym', 'male', 'all', 'ar', 'النادي يناديك 💪', 'يا {name}، جسمك ينتظر هالحصة. روح {gym} اليوم وخلّ التعب يطلع عرق!'),
  ('gym', 'male', 'all', 'ar', 'لا تأجلها لبكرة 🔥', 'أقوى نسخة منك تبدأ بخطوة وحدة… البس جزمتك وروح {gym}.'),
  ('gym', 'male', 'all', 'ar', 'ساعة وحدة تفرق', 'ساعة في {gym} تغيّر مزاج يومك كله. يلا يا بطل!'),
  ('gym', 'male', 'all', 'ar', 'الحديد مشتاق لك 😄', '{name}، الأوزان تسأل عنك. لا تخليها تنتظر، يلا على {gym}!'),
  ('gym', 'male', 'all', 'ar', 'تذكّر ليش بديت', 'يا {name}، اليوم يوم تمرين. وعدت نفسك، لا تخلف وعدك 💪'),
  -- النادي — نساء
  ('gym', 'female', 'all', 'ar', 'النادي يناديك 💪', 'يا {name}، جسمك ينتظر هالحصة. روحي {gym} اليوم وخلّي التعب يطلع عرق!'),
  ('gym', 'female', 'all', 'ar', 'لا تأجليها لبكرة 🔥', 'أقوى نسخة منك تبدأ بخطوة وحدة… البسي جزمتك وروحي {gym}.'),
  ('gym', 'female', 'all', 'ar', 'ساعة وحدة تفرق', 'ساعة في {gym} تغيّر مزاج يومك كله. يلا يا بطلة!'),
  ('gym', 'female', 'all', 'ar', 'الأوزان مشتاقة لك 😄', '{name}، الأوزان تسأل عنك. لا تخلينها تنتظر، يلا على {gym}!'),
  ('gym', 'female', 'all', 'ar', 'تذكّري ليش بديتي', 'يا {name}، اليوم يوم تمرين. وعدتي نفسك، لا تخلفين وعدك 💪'),
  -- صديقك سبقك — رجال
  ('friend', 'male', 'male', 'ar', '{friend} سبقك اليوم 👀', '{friend} راح النادي اليوم وأنت لا… بيعضّل قبلك! الحقه على {gym} 💪'),
  ('friend', 'male', 'male', 'ar', 'المنافسة حامية 🔥', '{friend} سجّل حضوره اليوم. بتخليه يسبقك في الترتيب يا {name}؟'),
  ('friend', 'male', 'female', 'ar', '{friend} سبقتك اليوم 👀', '{friend} راحت النادي اليوم وأنت لا… لا تخليها تسبقك، يلا على {gym}!'),
  ('friend', 'male', 'all', 'ar', 'صاحبك في النادي', '{friend} في النادي اليوم ✅ وأنت؟ يلا يا {name}، لا تتأخر!'),
  -- صديقك سبقك — نساء
  ('friend', 'female', 'female', 'ar', '{friend} سبقتك اليوم 👀', '{friend} راحت النادي اليوم وأنتِ لا… بتعضّل قبلك! الحقيها على {gym} 💪'),
  ('friend', 'female', 'female', 'ar', 'المنافسة حامية 🔥', '{friend} سجّلت حضورها اليوم. بتخلينها تسبقك في الترتيب يا {name}؟'),
  ('friend', 'female', 'male', 'ar', '{friend} سبقك اليوم 👀', '{friend} راح النادي اليوم وأنتِ لا… لا تخلينه يسبقك، يلا على {gym}!'),
  ('friend', 'female', 'all', 'ar', 'صديقتك في النادي', '{friend} في النادي اليوم ✅ وأنتِ؟ يلا يا {name}!'),
  -- السلسلة
  ('streak', 'male', 'all', 'ar', 'سلسلتك {streak} يوم 🔥', 'لا تكسرها يا {name}! باقي وقت تروح {gym} اليوم وتحافظ عليها.'),
  ('streak', 'male', 'all', 'ar', 'لا تضيّع تعبك', '{streak} يوم ورا بعض… خسارة تنقطع اليوم! حتى نص ساعة تكفي.'),
  ('streak', 'female', 'all', 'ar', 'سلسلتك {streak} يوم 🔥', 'لا تكسريها يا {name}! باقي وقت تروحين {gym} اليوم وتحافظين عليها.'),
  ('streak', 'female', 'all', 'ar', 'لا تضيّعين تعبك', '{streak} يوم ورا بعض… خسارة تنقطع اليوم! حتى نص ساعة تكفي.'),
  -- التمرين
  ('workout', 'male', 'all', 'ar', 'تمرين اليوم جاهز 📋', 'صباح الخير يا {name}! تمرينك اليوم: {workout}. افتح خطتك وشوف وش ينتظرك.'),
  ('workout', 'male', 'all', 'ar', 'يوم {workout} 💪', 'اليوم يومك يا {name}. جهّز نفسك، الخطة جاهزة وما باقي إلا أنت.'),
  ('workout', 'female', 'all', 'ar', 'تمرين اليوم جاهز 📋', 'صباح الخير يا {name}! تمرينك اليوم: {workout}. افتحي خطتك وشوفي وش ينتظرك.'),
  ('workout', 'female', 'all', 'ar', 'يوم {workout} 💪', 'اليوم يومك يا {name}. جهّزي نفسك، الخطة جاهزة وما باقي إلا أنتِ.'),
  -- الوجبات
  ('meal', 'male', 'all', 'ar', 'وش تغديت اليوم؟ 🍽️', 'سجّل وجبتك يا {name}. العضلات تنبني بالأكل مو بس بالحديد.'),
  ('meal', 'male', 'all', 'ar', 'البروتين أولاً 🥩', 'لا تنسى بروتينك اليوم يا {name}. سجّل أكلك عشان نعرف وين وصلت.'),
  ('meal', 'female', 'all', 'ar', 'وش تغديتي اليوم؟ 🍽️', 'سجّلي وجبتك يا {name}. النتيجة تبدأ من المطبخ مو بس من النادي.'),
  ('meal', 'female', 'all', 'ar', 'البروتين أولاً 🥗', 'لا تنسين بروتينك اليوم يا {name}. سجّلي أكلك عشان نعرف وين وصلتي.'),
  -- English
  ('gym', 'all', 'all', 'en', 'The gym is calling 💪', '{name}, one session today beats zero. Head to {gym}!'),
  ('gym', 'all', 'all', 'en', 'Don''t push it to tomorrow 🔥', 'Your strongest self starts with one step. Shoes on, {name} — {gym} is waiting.'),
  ('friend', 'all', 'all', 'en', '{friend} beat you to it 👀', '{friend} went to the gym today and you haven''t yet. Catch up, {name}!'),
  ('streak', 'all', 'all', 'en', '{streak}-day streak 🔥', 'Don''t break it, {name}! There''s still time to hit {gym} today.'),
  ('workout', 'all', 'all', 'en', 'Today''s workout is ready 📋', 'Good morning {name}! Today: {workout}. Open your plan and get after it.'),
  ('meal', 'all', 'all', 'en', 'What did you eat today? 🍽️', 'Log your meal, {name}. Muscle is built in the kitchen too.');


-- ===================== 20260928040000_review_fixes.sql =====================
-- إصلاحات المراجعة الشاملة (28 سبتمبر 2026)

-- ١) صفحة النادي تجيب النادي نفسه برقمه (بدل البحث في أول ٣٠٠ نادي بالترتيب الأبجدي —
--    كانت الأندية الكثيرة اللي انضافت من الخرائط تطلع «النادي غير موجود»)
create or replace function public.gym_card(p_id uuid)
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
         null::double precision
  from gyms g left join gym_chains c on c.id = g.chain_id
  where g.id = p_id and g.verified;
$$;
revoke all on function public.gym_card(uuid) from public, anon;
grant execute on function public.gym_card(uuid) to authenticated;

-- ٢) «صاحبك في النادي» يفتح صفحة الموجودين في النادي (بدل تعليقات الحضور)
create or replace function public._on_check_in()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_gym text;
begin
  if (select presence_visibility from profiles where id = new.user_id) = 'hidden' then return null; end if;
  select coalesce(nullif(name, ''), name_en) into v_gym from gyms where id = new.gym_id;
  for r in
    select distinct c.user_id from check_ins c
    where c.gym_id = new.gym_id and c.user_id <> new.user_id
      and c.checked_out_at is null and c.checked_in_at > now() - interval '6 hours'
      and (are_friends(c.user_id, new.user_id) or mutual_follow(c.user_id, new.user_id))
    limit 30
  loop
    perform _notify(r.user_id, new.user_id, 'friend_here', new.id,
      jsonb_build_object('gym', v_gym, 'gym_id', new.gym_id), '/gym/' || new.gym_id);
  end loop;
  return null;
end $$;


-- ===================== 20260929000100_gym_services.sql =====================
-- =====================================================================
-- خدمات النادي لكل فرع: مسبح، سونا، جاكوزي حار وبارد، مناشف، بار مشروبات، مواقف، برادات مياه…
--   * الكتالوج في جدول amenities (الأدمن يضيف خدمات جديدة بدون تحديث التطبيق)
--   * افتراضي للسلسلة (chain_amenities) + قيمة الفرع تغلبه (gym_amenities)
--   * الزوار يأكدون أو ينفون (amenity_votes) — يُحسب «موثّق» لمن سجّل حضور في الفرع
-- =====================================================================

create table if not exists public.amenities (
  key         text primary key check (key ~ '^[a-z0-9_]{2,30}$'),
  grp         text not null check (grp in ('wellness','services','facilities')),
  sort_order  smallint not null default 100,
  icon        text not null check (char_length(icon) <= 40),
  name_ar     text not null check (char_length(name_ar) between 2 and 40),
  name_en     text not null check (char_length(name_en) between 2 and 40),
  active      boolean not null default true
);
alter table public.amenities enable row level security;
create policy amenities_read on public.amenities for select to authenticated using (true);
create policy amenities_admin on public.amenities for all to authenticated using (is_admin()) with check (is_admin());

insert into public.amenities (key, grp, sort_order, icon, name_ar, name_en) values
  ('pool',              'wellness',   10, 'pool',                     'مسبح',                 'Swimming pool'),
  ('sauna',             'wellness',   20, 'fire',                     'سونا',                 'Sauna'),
  ('steam',             'wellness',   30, 'kettle-steam',             'غرفة بخار',            'Steam room'),
  ('jacuzzi_hot',       'wellness',   40, 'hot-tub',                  'جاكوزي حار',           'Hot jacuzzi'),
  ('jacuzzi_cold',      'wellness',   50, 'snowflake',                'جاكوزي بارد',          'Cold plunge'),
  ('trainers',          'services',   60, 'account-tie',              'مدربين',               'Coaches'),
  ('personal_training', 'services',   70, 'weight-lifter',            'تدريب شخصي',           'Personal training'),
  ('group_classes',     'services',   80, 'account-group',            'حصص جماعية',           'Group classes'),
  ('towels',            'services',   90, 'hanger',                   'خدمة المناشف',         'Towel service'),
  ('drinks_bar',        'services',  100, 'cup',                      'بار مشروبات',          'Drinks bar'),
  ('supplements_shop',  'services',  110, 'store',                    'متجر مكملات',          'Supplements shop'),
  ('water_coolers',     'services',  120, 'cup-water',                'برادات مياه',          'Water coolers'),
  ('lockers',           'facilities',130, 'locker-multiple',          'خزائن',                'Lockers'),
  ('showers',           'facilities',140, 'shower-head',              'دشوش',                 'Showers'),
  ('parking',           'facilities',150, 'parking',                  'مواقف',                'Parking'),
  ('prayer_room',       'facilities',160, 'mosque',                   'مصلى',                 'Prayer room'),
  ('women_section',     'facilities',170, 'face-woman-outline',       'قسم للسيدات',          'Women''s section'),
  ('kids_area',         'facilities',180, 'human-child',              'منطقة أطفال',          'Kids area'),
  ('squash',            'facilities',190, 'racquetball',              'ملاعب اسكواش',         'Squash courts'),
  ('open_24h',          'facilities',200, 'hours-24',                 'مفتوح ٢٤ ساعة',        'Open 24 hours'),
  ('wifi',              'facilities',210, 'wifi',                     'واي فاي',              'Wi-Fi'),
  ('accessible',        'facilities',220, 'wheelchair-accessibility', 'مهيأ لذوي الإعاقة',    'Wheelchair accessible'),
  ('other',             'facilities',990, 'dots-horizontal',          'خدمات أخرى',           'Other services')
on conflict (key) do nothing;

-- ---------- افتراضي السلسلة ----------
create table if not exists public.chain_amenities (
  chain_id    uuid not null references public.gym_chains(id) on delete cascade,
  amenity     text not null references public.amenities(key) on delete cascade,
  available   boolean not null,
  note        text check (char_length(note) <= 120),
  source      text not null default 'manager' check (source in ('manager','admin','public_info')),
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (chain_id, amenity)
);
alter table public.chain_amenities enable row level security;
create policy chain_amen_read on public.chain_amenities for select to authenticated using (true);
create policy chain_amen_write on public.chain_amenities for all to authenticated
  using (can_manage_chain(chain_id)) with check (can_manage_chain(chain_id));

-- ---------- قيمة الفرع (تغلب افتراضي السلسلة) ----------
create table if not exists public.gym_amenities (
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  amenity     text not null references public.amenities(key) on delete cascade,
  available   boolean not null,
  note        text check (char_length(note) <= 120),
  hours       text check (char_length(hours) <= 60),
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (gym_id, amenity)
);
create index if not exists gym_amenities_amenity_idx on public.gym_amenities (amenity, available);

create or replace function public.can_manage_gym_or_chain(p_gym uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select can_manage_gym(p_gym)
      or exists (select 1 from gyms g where g.id = p_gym and g.chain_id is not null and can_manage_chain(g.chain_id));
$$;
revoke all on function public.can_manage_gym_or_chain(uuid) from public, anon;
grant execute on function public.can_manage_gym_or_chain(uuid) to authenticated;

alter table public.gym_amenities enable row level security;
create policy gym_amen_read on public.gym_amenities for select to authenticated using (true);
create policy gym_amen_write on public.gym_amenities for all to authenticated
  using (can_manage_gym_or_chain(gym_id)) with check (can_manage_gym_or_chain(gym_id));

create or replace function public._amenity_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
drop trigger if exists gym_amenities_touch on public.gym_amenities;
create trigger gym_amenities_touch before insert or update on public.gym_amenities for each row execute function public._amenity_touch();
drop trigger if exists chain_amenities_touch on public.chain_amenities;
create trigger chain_amenities_touch before insert or update on public.chain_amenities for each row execute function public._amenity_touch();

-- ---------- تأكيد الزوار ----------
create table if not exists public.amenity_votes (
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  amenity     text not null references public.amenities(key) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  vote        boolean not null,               -- true = موجودة، false = مو موجودة
  created_at  timestamptz not null default now(),
  primary key (gym_id, amenity, user_id)
);
alter table public.amenity_votes enable row level security;
create policy amen_votes_own_read on public.amenity_votes for select to authenticated using (user_id = auth.uid());
create policy amen_votes_own_ins on public.amenity_votes for insert to authenticated with check (user_id = auth.uid());
create policy amen_votes_own_upd on public.amenity_votes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy amen_votes_own_del on public.amenity_votes for delete to authenticated using (user_id = auth.uid());

-- ---------- خدمات فرع: القيمة الفعلية + مصدرها + أصوات الزوار ----------
create or replace function public.gym_services(p_gym uuid)
returns table (key text, grp text, sort_order smallint, icon text, name_ar text, name_en text,
               available boolean, note text, hours text, source text,
               yes_votes integer, no_votes integer, yes_verified integer, no_verified integer, my_vote boolean)
language sql stable security definer set search_path = public as $$
  with g as (select id, chain_id from gyms where id = p_gym),
  v as (
    select av.amenity, av.vote,
           exists (select 1 from check_ins c where c.user_id = av.user_id and c.gym_id = av.gym_id) as verified,
           av.user_id = auth.uid() as mine
    from amenity_votes av where av.gym_id = p_gym
  )
  select a.key, a.grp, a.sort_order, a.icon, a.name_ar, a.name_en,
         coalesce(ga.available, ca.available) as available,
         coalesce(ga.note, ca.note) as note,
         ga.hours,
         case when ga.gym_id is not null then 'gym' when ca.chain_id is not null then ca.source else null end as source,
         (select count(*) from v where v.amenity = a.key and v.vote)::int,
         (select count(*) from v where v.amenity = a.key and not v.vote)::int,
         (select count(*) from v where v.amenity = a.key and v.vote and v.verified)::int,
         (select count(*) from v where v.amenity = a.key and not v.vote and v.verified)::int,
         (select v.vote from v where v.amenity = a.key and v.mine limit 1)
  from amenities a
  cross join g
  left join gym_amenities ga on ga.gym_id = g.id and ga.amenity = a.key
  left join chain_amenities ca on ca.chain_id = g.chain_id and ca.amenity = a.key
  where a.active
  order by a.sort_order;
$$;
revoke all on function public.gym_services(uuid) from public, anon;
grant execute on function public.gym_services(uuid) to authenticated;

-- ---------- ملخص السلسلة: كم فرع فيه كل خدمة ----------
create or replace function public.chain_services(p_chain uuid)
returns table (key text, grp text, sort_order smallint, icon text, name_ar text, name_en text,
               chain_default boolean, note text, branches_yes integer, branches_known integer, branches integer)
language sql stable security definer set search_path = public as $$
  with b as (select id from gyms where chain_id = p_chain and verified),
  eff as (
    select a.key, b.id as gym_id, coalesce(ga.available, ca.available) as available
    from amenities a cross join b
    left join gym_amenities ga on ga.gym_id = b.id and ga.amenity = a.key
    left join chain_amenities ca on ca.chain_id = p_chain and ca.amenity = a.key
    where a.active
  )
  select a.key, a.grp, a.sort_order, a.icon, a.name_ar, a.name_en,
         ca.available, ca.note,
         (select count(*) from eff where eff.key = a.key and eff.available)::int,
         (select count(*) from eff where eff.key = a.key and eff.available is not null)::int,
         (select count(*) from b)::int
  from amenities a
  left join chain_amenities ca on ca.chain_id = p_chain and ca.amenity = a.key
  where a.active
  order by a.sort_order;
$$;
revoke all on function public.chain_services(uuid) from public, anon;
grant execute on function public.chain_services(uuid) to authenticated;

-- ---------- فلترة الدليل: الفروع (أو السلاسل) اللي فيها كل الخدمات المطلوبة ----------
create or replace function public.gyms_with_services(p_keys text[])
returns setof uuid language sql stable security definer set search_path = public as $$
  select g.id from gyms g
  where not exists (
    select 1 from unnest(p_keys) k(key)
    where coalesce(
      (select ga.available from gym_amenities ga where ga.gym_id = g.id and ga.amenity = k.key),
      (select ca.available from chain_amenities ca where ca.chain_id = g.chain_id and ca.amenity = k.key),
      false) is not true
  );
$$;
revoke all on function public.gyms_with_services(text[]) from public, anon;
grant execute on function public.gyms_with_services(text[]) to authenticated;

create or replace function public.chains_with_services(p_keys text[])
returns setof uuid language sql stable security definer set search_path = public as $$
  select c.id from gym_chains c
  where c.active and not exists (
    select 1 from unnest(p_keys) k(key)
    where not (
      exists (select 1 from chain_amenities ca where ca.chain_id = c.id and ca.amenity = k.key and ca.available)
      or exists (select 1 from gyms g join gym_amenities ga on ga.gym_id = g.id
                 where g.chain_id = c.id and ga.amenity = k.key and ga.available)
    )
  );
$$;
revoke all on function public.chains_with_services(text[]) from public, anon;
grant execute on function public.chains_with_services(text[]) to authenticated;

-- ---------- بداية: خدمات مذكورة صراحة في وصف السلاسل الرسمي (مصدرها معلومات عامة، والمدير يعدّلها) ----------
insert into public.chain_amenities (chain_id, amenity, available, note, source)
select c.id, v.amenity, true, v.note, 'public_info'
from (values
  ('fitness-time',      'pool',          null::text),
  ('fitness-time',      'jacuzzi_hot',   null),
  ('fitness-time',      'squash',        'حسب الفرع'),
  ('fitness-time-plus', 'pool',          null),
  ('fitness-time-plus', 'jacuzzi_hot',   null),
  ('fitness-time-plus', 'steam',         null),
  ('fitness-time-plus', 'sauna',         null),
  ('fitness-time-pro',  'pool',          null),
  ('bfit',              'group_classes', null),
  ('bfit',              'pool',          'حسب الفرع'),
  ('body-motions',      'pool',          null),
  ('body-motions',      'jacuzzi_hot',   null),
  ('body-motions',      'steam',         null),
  ('body-motions',      'sauna',         null),
  ('puregym',           'open_24h',      null),
  ('gymnation',         'open_24h',      null),
  ('gymnation',         'group_classes', null),
  ('snap-fitness',      'open_24h',      'للأعضاء')
) as v(slug, amenity, note)
join public.gym_chains c on c.slug = v.slug
on conflict (chain_id, amenity) do nothing;


-- ===================== 20260929000200_gym_operations.sql =====================
-- =====================================================================
-- تشغيل النادي: الاشتراكات، موظفين الاستقبال، الدخول بـ QR، بوابات الدخول، الاستيراد،
-- طلبات التجميد والنقل، الملاحظات، ادعُ صديقك، الإعلانات، الحصص والحجز، وتنبيهات التجديد
-- =====================================================================

-- ---------------------------------------------------------------------
-- تنبيه عام بنص جاهز (عربي/إنجليزي): notice للنشاط، promo للعروض (يحترم إعداد «العروض»)
-- ---------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'follow','friend_request','friend_accept',
  'post_like','post_comment','checkin_like','checkin_comment','friend_here',
  'challenge_invite','challenge_win','rank_up','program_adopt','gym_offer','nudge','notice','promo'));

create or replace function public._notif_category(p_kind text)
returns text language sql immutable as $$
  select case
    when p_kind = 'message' then 'messages'
    when p_kind in ('follow','friend_request','friend_accept','friend_here') then 'social'
    when p_kind in ('post_like','post_comment','checkin_like','checkin_comment','program_adopt','notice') then 'activity'
    when p_kind in ('challenge_invite','challenge_win','rank_up') then 'progress'
    when p_kind in ('gym_offer','promo') then 'offers'
    when p_kind = 'nudge' then 'nudges'
    else 'activity' end;
$$;

create or replace function public._notif_text(p_kind text, p_name text, p_data jsonb, p_loc text)
returns text[] language plpgsql immutable as $$
declare
  en boolean := p_loc = 'en';
  n text := coalesce(p_name, case when en then 'Someone' else 'أحد' end);
  pv text := coalesce(p_data->>'preview', '');
  ti text := coalesce(p_data->>'title', '');
  gy text := coalesce(p_data->>'gym', '');
begin
  return case p_kind
    when 'message'          then array[n, pv]
    when 'nudge'            then array[coalesce(p_data->>'title', ''), coalesce(p_data->>'body', '')]
    when 'notice'           then array[coalesce(case when en then p_data->>'title_en' end, p_data->>'title_ar', ''),
                                       coalesce(case when en then p_data->>'body_en' end, p_data->>'body_ar', '')]
    when 'promo'            then array[coalesce(case when en then p_data->>'title_en' end, p_data->>'title_ar', ''),
                                       coalesce(case when en then p_data->>'body_en' end, p_data->>'body_ar', '')]
    when 'follow'           then case when (p_data->>'mutual')::boolean
                                   then array[case when en then 'You follow each other now' else 'صرتوا تتابعون بعض' end,
                                              case when en then n || ' followed you back — you can message each other' else n || ' تابعك — تقدرون تتراسلون الحين' end]
                                   else array[case when en then 'New follower' else 'متابع جديد' end,
                                              case when en then n || ' started following you' else n || ' بدأ يتابعك' end] end
    when 'friend_request'   then array[case when en then 'Friend request' else 'طلب صداقة' end,
                                       case when en then n || ' wants to be your friend' else n || ' يبي يضيفك صديق' end]
    when 'friend_accept'    then array[case when en then 'You''re friends now' else 'صرتوا أصدقاء' end,
                                       case when en then n || ' accepted your friend request' else n || ' قبل طلب صداقتك' end]
    when 'post_like'        then array[case when en then 'New like' else 'إعجاب جديد' end,
                                       case when en then n || ' liked your post' else n || ' أعجبه منشورك' end]
    when 'post_comment'     then array[case when en then 'New comment' else 'تعليق جديد' end, n || ': ' || pv]
    when 'checkin_like'     then array[case when en then '💪 Props' else '💪 تشجيع' end,
                                       case when en then n || ' liked your gym check-in' else n || ' أعجبه حضورك للنادي' end]
    when 'checkin_comment'  then array[case when en then 'Comment on your check-in' else 'تعليق على حضورك' end, n || ': ' || pv]
    when 'friend_here'      then array[case when en then 'Your friend is at the gym' else 'صاحبك في النادي' end,
                                       case when en then n || ' just arrived at ' || gy else n || ' وصل ' || gy || ' الحين' end]
    when 'challenge_invite' then array[case when en then 'Challenge invite' else 'دعوة لتحدي' end,
                                       case when en then n || ' invited you to “' || ti || '”' else n || ' دعاك لتحدي «' || ti || '»' end]
    when 'challenge_win'    then array[case when en then '🏆 You won!' else '🏆 فزت بالتحدي' end,
                                       case when en then 'You won “' || ti || '” and earned ' || coalesce(p_data->>'points', '50') || ' points'
                                            else 'فزت في «' || ti || '» وأخذت ' || coalesce(p_data->>'points', '50') || ' نقطة' end]
    when 'rank_up'          then array[case when en then '⬆️ New rank' else '⬆️ رتبة جديدة' end,
                                       case when en then 'You reached “' || _rank_name((p_data->>'level')::int, 'en') || '”'
                                            else 'وصلت رتبة «' || _rank_name((p_data->>'level')::int, 'ar') || '» 🔥' end]
    when 'program_adopt'    then array[case when en then 'Your program is spreading' else 'برنامجك ينتشر' end,
                                       case when en then n || ' started your program “' || ti || '”' else n || ' بدأ برنامجك «' || ti || '»' end]
    when 'gym_offer'        then array[case when en then 'New offer at ' || gy else 'عرض جديد في ' || gy end,
                                       ti || ' — ' || coalesce(p_data->>'price', '') || case when en then ' SAR' else ' ر.س' end]
    else array[case when en then 'ARQ' else 'أرك' end, '']
  end;
end $$;

-- إرسال تنبيه جاهز النص. p_key يمنع التكرار (مثلاً تنبيه التجديد مرة وحدة لكل اشتراك)
create or replace function public._notice(p_user uuid, p_key text, p_title_ar text, p_body_ar text,
                                          p_title_en text, p_body_en text, p_url text,
                                          p_target uuid default null, p_kind text default 'notice')
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return false; end if;
  if p_key is not null and exists (select 1 from notifications where user_id = p_user and kind = p_kind and data->>'key' = p_key) then
    return false;
  end if;
  perform _notify(p_user, null, p_kind, p_target,
    jsonb_strip_nulls(jsonb_build_object('key', p_key, 'title_ar', left(p_title_ar, 80), 'body_ar', left(p_body_ar, 240),
                       'title_en', left(p_title_en, 80), 'body_en', left(p_body_en, 240), 'url', p_url)), p_url);
  return true;
end $$;
revoke all on function public._notice(uuid, text, text, text, text, text, text, uuid, text) from public, anon, authenticated;

create or replace function public._gym_label(p_gym uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(name), ''), name_en) from gyms where id = p_gym;
$$;
revoke all on function public._gym_label(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- موظفين الاستقبال (المدراء في gym_managers / chain_managers كما هم)
-- ---------------------------------------------------------------------
create table if not exists public.gym_staff (
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null default 'reception' check (role in ('reception')),
  added_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  primary key (gym_id, user_id)
);
alter table public.gym_staff enable row level security;
create policy staff_read on public.gym_staff for select to authenticated using (user_id = auth.uid() or can_manage_gym_or_chain(gym_id));
create policy staff_write on public.gym_staff for all to authenticated using (can_manage_gym_or_chain(gym_id)) with check (can_manage_gym_or_chain(gym_id));

create or replace function public.is_gym_staff(p_gym uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select can_manage_gym_or_chain(p_gym) or exists (select 1 from gym_staff s where s.gym_id = p_gym and s.user_id = auth.uid());
$$;
revoke all on function public.is_gym_staff(uuid) from public, anon;
grant execute on function public.is_gym_staff(uuid) to authenticated;

-- الأندية اللي أنا موظف أو مدير فيها (لاختيار الفرع في شاشة الاستقبال)
create or replace function public.my_staff_gyms()
returns table (gym_id uuid, name text, name_en text, chain_id uuid, role text)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.name_en, g.chain_id,
         case when can_manage_gym_or_chain(g.id) then 'manager' else 'reception' end
  from gyms g
  where exists (select 1 from gym_managers m where m.gym_id = g.id and m.user_id = auth.uid())
     or exists (select 1 from gym_staff s where s.gym_id = g.id and s.user_id = auth.uid())
     or (g.chain_id is not null and exists (select 1 from chain_managers c where c.chain_id = g.chain_id and c.user_id = auth.uid()))
  order by g.name
  limit 200;
$$;
revoke all on function public.my_staff_gyms() from public, anon;
grant execute on function public.my_staff_gyms() to authenticated;

-- إضافة موظف استقبال باسم المستخدم
create or replace function public.add_gym_staff(p_gym uuid, p_username text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if not can_manage_gym_or_chain(p_gym) then raise exception 'not_allowed'; end if;
  select id into v_user from profiles where lower(username) = lower(btrim(p_username, ' @'));
  if v_user is null then raise exception 'user_not_found'; end if;
  insert into gym_staff (gym_id, user_id, added_by) values (p_gym, v_user, auth.uid()) on conflict do nothing;
  perform _notice(v_user, 'staff:' || p_gym, 'صرت موظف استقبال', 'تقدر الحين تتحقق من دخول الأعضاء في ' || _gym_label(p_gym) || ' بمسح كود أرك.',
                  'You''re now reception staff', 'You can now verify member entry at ' || _gym_label(p_gym) || ' by scanning their ARQ code.', '/entry/code', p_gym);
  return v_user;
end $$;
revoke all on function public.add_gym_staff(uuid, text) from public, anon;
grant execute on function public.add_gym_staff(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- الاشتراكات: لفرع أو لسلسلة. «منتهي» و«قادم» تُحسب من التواريخ ما تنحفظ
-- ---------------------------------------------------------------------
create table if not exists public.memberships (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.profiles(id) on delete cascade,
  gym_id           uuid references public.gyms(id) on delete cascade,
  chain_id         uuid references public.gym_chains(id) on delete cascade,
  kind             text not null default 'membership' check (kind in ('membership','pass')),
  plan_name        text not null check (char_length(btrim(plan_name)) between 2 and 80),
  starts_on        date not null default current_date,
  ends_on          date not null,
  status           text not null default 'active' check (status in ('active','frozen','cancelled')),
  frozen_from      date,
  frozen_until     date,
  frozen_days_used integer not null default 0 check (frozen_days_used between 0 and 365),
  price_sar        numeric(9,2) check (price_sar is null or price_sar between 0 and 1000000),
  source           text not null default 'gym' check (source in ('gym','arq','import')),
  notes            text check (char_length(notes) <= 300),
  member_name      text check (char_length(member_name) <= 80),
  member_contact   text check (char_length(member_contact) <= 80),
  claim_code       text unique check (claim_code ~ '^[A-Z0-9]{8}$'),
  claimed_at       timestamptz,
  referred_by      uuid references public.profiles(id) on delete set null,
  created_by       uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint memberships_target check (gym_id is not null or chain_id is not null),
  constraint memberships_dates check (ends_on >= starts_on),
  constraint memberships_owner check (user_id is not null or claim_code is not null or member_name is not null)
);
create index if not exists memberships_user_idx on public.memberships (user_id, ends_on desc);
create index if not exists memberships_gym_idx on public.memberships (gym_id, ends_on);
create index if not exists memberships_chain_idx on public.memberships (chain_id, ends_on);

create or replace function public.can_manage_target(p_gym uuid, p_chain uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (p_gym is not null and can_manage_gym_or_chain(p_gym)) or (p_chain is not null and can_manage_chain(p_chain));
$$;
revoke all on function public.can_manage_target(uuid, uuid) from public, anon;
grant execute on function public.can_manage_target(uuid, uuid) to authenticated;

-- موظف الاستقبال يشوف اشتراكات فرعه، واشتراكات السلسلة اللي فرعه منها
create or replace function public.can_staff_target(p_gym uuid, p_chain uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select can_manage_target(p_gym, p_chain)
      or (p_gym is not null and exists (select 1 from gym_staff s where s.gym_id = p_gym and s.user_id = auth.uid()))
      or (p_chain is not null and exists (select 1 from gym_staff s join gyms g on g.id = s.gym_id
                                          where g.chain_id = p_chain and s.user_id = auth.uid()));
$$;
revoke all on function public.can_staff_target(uuid, uuid) from public, anon;
grant execute on function public.can_staff_target(uuid, uuid) to authenticated;

alter table public.memberships enable row level security;
create policy mem_read on public.memberships for select to authenticated
  using (user_id = auth.uid() or can_staff_target(gym_id, chain_id));
create policy mem_insert on public.memberships for insert to authenticated with check (can_manage_target(gym_id, chain_id));
create policy mem_update on public.memberships for update to authenticated
  using (can_manage_target(gym_id, chain_id)) with check (can_manage_target(gym_id, chain_id));
create policy mem_delete on public.memberships for delete to authenticated using (can_manage_target(gym_id, chain_id));

create or replace function public._membership_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists memberships_touch on public.memberships;
create trigger memberships_touch before update on public.memberships for each row execute function public._membership_touch();

-- حالة الاشتراك الآن: active / upcoming / frozen / expired / cancelled + الأيام المتبقية
create or replace function public.membership_state(p_status text, p_starts date, p_ends date, p_fz_from date, p_fz_until date, p_today date default null)
returns text language sql stable as $$
  select case
    when p_status = 'cancelled' then 'cancelled'
    when coalesce(p_today, app_today()) > p_ends then 'expired'
    when p_status = 'frozen' and coalesce(p_today, app_today()) between coalesce(p_fz_from, p_starts) and coalesce(p_fz_until, p_ends) then 'frozen'
    when coalesce(p_today, app_today()) < p_starts then 'upcoming'
    else 'active' end;
$$;
grant execute on function public.membership_state(text, date, date, date, date, date) to authenticated;

create or replace function public.membership_days_left(p_ends date)
returns integer language sql stable as $$
  select greatest(p_ends - app_today() + 1, 0);
$$;
grant execute on function public.membership_days_left(date) to authenticated;

-- اشتراكاتي مع الحالة والأيام المتبقية واسم النادي
create or replace function public.my_memberships()
returns table (id uuid, gym_id uuid, chain_id uuid, target_name text, target_name_en text, kind text, plan_name text,
               starts_on date, ends_on date, state text, days_left integer, frozen_until date, notes text)
language sql stable security definer set search_path = public as $$
  select m.id, m.gym_id, m.chain_id,
         coalesce(g.name, c.name), coalesce(g.name_en, c.name_en), m.kind, m.plan_name, m.starts_on, m.ends_on,
         membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until),
         membership_days_left(m.ends_on), m.frozen_until, m.notes
  from memberships m
  left join gyms g on g.id = m.gym_id
  left join gym_chains c on c.id = m.chain_id
  where m.user_id = auth.uid()
  order by (membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until) in ('expired','cancelled')), m.ends_on desc
  limit 50;
$$;
revoke all on function public.my_memberships() from public, anon;
grant execute on function public.my_memberships() to authenticated;

-- ربط اشتراك مستورد بحسابي بالرمز اللي أعطاني إياه النادي
create or replace function public.claim_membership(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update memberships set user_id = auth.uid(), claimed_at = now(), claim_code = null
   where claim_code = upper(btrim(p_code)) and user_id is null
  returning id into v_id;
  if v_id is null then raise exception 'code_not_found'; end if;
  return v_id;
end $$;
revoke all on function public.claim_membership(text) from public, anon;
grant execute on function public.claim_membership(text) to authenticated;

create or replace function public._claim_code()
returns text language plpgsql volatile as $$
declare v text; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  loop
    v := '';
    for i in 1..8 loop v := v || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from memberships where claim_code = v);
  end loop;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- ادعُ صديقك: رمز لكل عضو في كل نادي، ومكافأة يكتبها النادي
-- ---------------------------------------------------------------------
create table if not exists public.gym_settings (
  gym_id           uuid primary key references public.gyms(id) on delete cascade,
  referral_reward  text check (char_length(referral_reward) <= 160),
  class_cutoff_min integer not null default 60 check (class_cutoff_min between 0 and 1440),
  updated_at       timestamptz not null default now()
);
alter table public.gym_settings enable row level security;
create policy gset_read on public.gym_settings for select to authenticated using (true);
create policy gset_write on public.gym_settings for all to authenticated using (can_manage_gym_or_chain(gym_id)) with check (can_manage_gym_or_chain(gym_id));

create table if not exists public.referral_codes (
  code        text primary key check (code ~ '^[A-Z0-9]{6}$'),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, gym_id)
);
alter table public.referral_codes enable row level security;
create policy refc_read on public.referral_codes for select to authenticated using (user_id = auth.uid() or can_manage_gym_or_chain(gym_id));

create or replace function public.my_referral_code(p_gym uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v text; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select code into v from referral_codes where user_id = auth.uid() and gym_id = p_gym;
  if v is not null then return v; end if;
  loop
    v := '';
    for i in 1..6 loop v := v || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from referral_codes where code = v);
  end loop;
  insert into referral_codes (code, user_id, gym_id) values (v, auth.uid(), p_gym);
  return v;
end $$;
revoke all on function public.my_referral_code(uuid) from public, anon;
grant execute on function public.my_referral_code(uuid) to authenticated;

create or replace function public.my_referrals(p_gym uuid)
returns table (code text, reward text, joined integer)
language sql stable security definer set search_path = public as $$
  select rc.code, gs.referral_reward,
         (select count(*) from memberships m where m.referred_by = auth.uid()
            and (m.gym_id = p_gym or m.chain_id = (select chain_id from gyms where id = p_gym)))::int
  from referral_codes rc
  left join gym_settings gs on gs.gym_id = rc.gym_id
  where rc.user_id = auth.uid() and rc.gym_id = p_gym;
$$;
revoke all on function public.my_referrals(uuid) from public, anon;
grant execute on function public.my_referrals(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- إضافة/تعديل اشتراك من الإدارة (باسم المستخدم، أو اسم وجوال لمن ما عنده حساب → رمز ربط)
-- ---------------------------------------------------------------------
create or replace function public.upsert_membership(
  p_id uuid, p_gym uuid, p_chain uuid, p_username text, p_member_name text, p_member_contact text,
  p_kind text, p_plan text, p_starts date, p_ends date, p_price numeric, p_notes text, p_referral text default null)
returns public.memberships language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_row memberships; v_ref uuid; v_new boolean := p_id is null;
begin
  if not can_manage_target(p_gym, p_chain) then raise exception 'not_allowed'; end if;
  if nullif(btrim(coalesce(p_username, '')), '') is not null then
    select id into v_user from profiles where lower(username) = lower(btrim(p_username, ' @'));
    if v_user is null then raise exception 'user_not_found'; end if;
  end if;
  if nullif(btrim(coalesce(p_referral, '')), '') is not null then
    select user_id into v_ref from referral_codes where code = upper(btrim(p_referral));
    if v_ref is null then raise exception 'referral_not_found'; end if;
    if v_ref = v_user then v_ref := null; end if;
  end if;
  if v_new then
    insert into memberships (user_id, gym_id, chain_id, kind, plan_name, starts_on, ends_on, price_sar, notes,
                             member_name, member_contact, claim_code, referred_by, source)
    values (v_user, p_gym, p_chain, coalesce(p_kind, 'membership'), btrim(p_plan), p_starts, p_ends, p_price, nullif(btrim(coalesce(p_notes, '')), ''),
            nullif(btrim(coalesce(p_member_name, '')), ''), nullif(btrim(coalesce(p_member_contact, '')), ''),
            case when v_user is null then _claim_code() end, v_ref, 'gym')
    returning * into v_row;
  else
    update memberships set
      user_id = coalesce(v_user, user_id), kind = coalesce(p_kind, kind), plan_name = btrim(p_plan), starts_on = p_starts, ends_on = p_ends,
      price_sar = p_price, notes = nullif(btrim(coalesce(p_notes, '')), ''),
      member_name = coalesce(nullif(btrim(coalesce(p_member_name, '')), ''), member_name),
      member_contact = coalesce(nullif(btrim(coalesce(p_member_contact, '')), ''), member_contact),
      referred_by = coalesce(v_ref, referred_by)
    where id = p_id and can_manage_target(gym_id, chain_id)
    returning * into v_row;
    if v_row.id is null then raise exception 'membership_not_found'; end if;
  end if;
  if v_new and v_row.user_id is not null then
    perform _notice(v_row.user_id, 'mem_new:' || v_row.id,
      'اشتراكك جاهز في أرك', 'اشتراك «' || v_row.plan_name || '» في ' || coalesce(_gym_label(p_gym), (select name from gym_chains where id = p_chain)) || ' ينتهي ' || to_char(v_row.ends_on, 'YYYY-MM-DD') || '. بطاقتك للدخول في «اشتراكي».',
      'Your membership is in ARQ', '“' || v_row.plan_name || '” ends ' || to_char(v_row.ends_on, 'YYYY-MM-DD') || '. Your entry card is in My membership.',
      '/membership', v_row.id);
  end if;
  if v_new and v_ref is not null then
    perform _notice(v_ref, 'ref:' || v_row.id, 'صاحبك اشترك بدعوتك 🎉', 'انضم شخص للنادي برمز دعوتك. شوف مكافأتك من النادي.',
                    'Your friend joined 🎉', 'Someone joined the gym with your invite code. Check your reward with the gym.', '/membership', v_row.id);
  end if;
  return v_row;
end $$;
revoke all on function public.upsert_membership(uuid, uuid, uuid, text, text, text, text, text, date, date, numeric, text, text) from public, anon;
grant execute on function public.upsert_membership(uuid, uuid, uuid, text, text, text, text, text, date, date, numeric, text, text) to authenticated;

-- استيراد دفعة من ملف (بعد المعاينة في التطبيق): كل صف يصير اشتراك برمز ربط
create or replace function public.import_memberships(p_gym uuid, p_chain uuid, p_rows jsonb)
returns table (row_no integer, member_name text, claim_code text, error text)
language plpgsql security definer set search_path = public as $$
declare r jsonb; i integer := 0; v_code text; v_err text;
begin
  if not can_manage_target(p_gym, p_chain) then raise exception 'not_allowed'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then raise exception 'too_many_rows'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1; v_code := null; v_err := null;
    begin
      v_code := _claim_code();
      insert into memberships (gym_id, chain_id, plan_name, starts_on, ends_on, price_sar, member_name, member_contact, claim_code, source, notes)
      values (p_gym, p_chain, btrim(r->>'plan'), (r->>'start')::date, (r->>'end')::date, nullif(r->>'price', '')::numeric,
              nullif(btrim(r->>'name'), ''), nullif(btrim(r->>'contact'), ''), v_code, 'import', nullif(btrim(coalesce(r->>'notes', '')), ''));
    exception when others then
      v_code := null; v_err := sqlerrm;
    end;
    row_no := i; member_name := r->>'name'; claim_code := v_code; error := v_err;
    return next;
  end loop;
end $$;
revoke all on function public.import_memberships(uuid, uuid, jsonb) from public, anon;
grant execute on function public.import_memberships(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- الدخول بـ QR: رمز قصير العمر لكل عضو + رقم من ٦ خانات، يُستخدم مرة وحدة
-- ---------------------------------------------------------------------
alter table public.check_ins add column if not exists method text not null default 'gps' check (method in ('gps','qr','gate'));

create table if not exists public.entry_tokens (
  token_hash  text primary key,
  code        text not null check (code ~ '^[0-9]{6}$'),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  used_gym    uuid references public.gyms(id) on delete set null
);
create index if not exists entry_tokens_code_idx on public.entry_tokens (code, expires_at);
create index if not exists entry_tokens_user_idx on public.entry_tokens (user_id, created_at desc);
alter table public.entry_tokens enable row level security;  -- ما فيه سياسات: الوصول عبر الدوال فقط

create table if not exists public.gym_gates (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references public.gyms(id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 2 and 40),
  key_hash     text not null unique,
  key_hint     text not null,
  active       boolean not null default true,
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.gym_gates enable row level security;
create policy gates_read on public.gym_gates for select to authenticated using (can_manage_gym_or_chain(gym_id));
create policy gates_update on public.gym_gates for update to authenticated using (can_manage_gym_or_chain(gym_id)) with check (can_manage_gym_or_chain(gym_id));
create policy gates_delete on public.gym_gates for delete to authenticated using (can_manage_gym_or_chain(gym_id));

create table if not exists public.entry_log (
  id          bigint generated always as identity primary key,
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null,
  staff_id    uuid references public.profiles(id) on delete set null,
  gate_id     uuid references public.gym_gates(id) on delete set null,
  allowed     boolean not null,
  reason      text not null,
  membership_id uuid references public.memberships(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists entry_log_gym_idx on public.entry_log (gym_id, created_at desc);
alter table public.entry_log enable row level security;
create policy entry_log_read on public.entry_log for select to authenticated using (is_gym_staff(gym_id) or user_id = auth.uid());

create or replace function public._hash(p text)
returns text language sql immutable as $$ select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;

-- رمز دخولي: يتجدد كل ٤٥ ثانية تقريباً في التطبيق (صلاحيته ٩٠ ثانية)
create or replace function public.entry_token()
returns table (token text, code text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_tok text; v_code text; v_exp timestamptz := now() + interval '90 seconds';
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from entry_tokens t where t.user_id = auth.uid() and (t.expires_at < now() - interval '1 day' or (t.used_at is null and t.expires_at < now()));
  if (select count(*) from entry_tokens t where t.user_id = auth.uid() and t.created_at > now() - interval '1 minute') >= 6 then
    raise exception 'too_many_requests';
  end if;
  v_tok := replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  loop
    v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when not exists (select 1 from entry_tokens e where e.code = v_code and e.expires_at > now() and e.used_at is null);
  end loop;
  insert into entry_tokens (token_hash, code, user_id, expires_at) values (_hash(v_tok), v_code, auth.uid(), v_exp);
  token := v_tok; code := v_code; expires_at := v_exp;
  return next;
end $$;
revoke all on function public.entry_token() from public, anon;
grant execute on function public.entry_token() to authenticated;

-- حضور بدون GPS (الاستقبال/البوابة): نفس منطق النقاط في check_in (أول حضور باليوم في نادي موثّق)
create or replace function public._record_visit(p_user uuid, p_gym uuid, p_method text)
returns public.check_ins language plpgsql security definer set search_path = public as $$
declare v_gym gyms; v_prof profiles; v_row check_ins; v_today date := app_today(); v_points integer := 0; v_streak integer;
begin
  select * into v_gym from gyms where id = p_gym;
  select * into v_row from check_ins where user_id = p_user and checked_out_at is null and checked_in_at > now() - interval '6 hours' order by checked_in_at desc limit 1;
  if found then return v_row; end if;
  select * into v_prof from profiles where id = p_user for update;
  insert into check_ins (user_id, gym_id, lat, lng, distance_m, method) values (p_user, p_gym, v_gym.lat, v_gym.lng, 0, p_method) returning * into v_row;
  if v_gym.verified and (v_prof.last_checkin_on is null or v_prof.last_checkin_on < v_today) then
    v_streak := case when v_prof.last_checkin_on = v_today - 1 then v_prof.streak + 1 else 1 end;
    v_points := 10;
    perform _award(p_user, 10, 'checkin', v_row.id);
    if v_streak % 7 = 0 then perform _award(p_user, 25, 'streak_bonus', v_row.id); v_points := v_points + 25; end if;
    update profiles set streak = v_streak, best_streak = greatest(best_streak, v_streak), last_checkin_on = v_today where id = p_user;
    update check_ins set points_awarded = v_points where id = v_row.id returning * into v_row;
  end if;
  return v_row;
end $$;
revoke all on function public._record_visit(uuid, uuid, text) from public, anon, authenticated;

-- التحقق الأساسي (يستخدمه الاستقبال والبوابة)
create or replace function public._verify_entry(p_token text, p_gym uuid, p_staff uuid, p_gate uuid)
returns table (allowed boolean, reason text, member_id uuid, member_name text, username text, avatar_url text,
               plan_name text, ends_on date, days_left integer, membership_id uuid, check_in_id uuid, already_in boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_tok entry_tokens; v_gym gyms; v_m memberships; v_state text; v_ci check_ins; v_open boolean := false;
  v_in text := btrim(coalesce(p_token, ''));
begin
  select * into v_gym from gyms where id = p_gym;
  if not found then raise exception 'gym_not_found'; end if;
  v_in := regexp_replace(v_in, '^arq://entry/', '');
  if v_in ~ '^[0-9]{6}$' then
    select * into v_tok from entry_tokens e where e.code = v_in order by e.created_at desc limit 1;
  else
    select * into v_tok from entry_tokens e where e.token_hash = _hash(v_in);
  end if;

  allowed := false; already_in := false;
  if v_tok.user_id is null then reason := 'code_not_found';
  elsif v_tok.used_at is not null then reason := 'code_used';
  elsif v_tok.expires_at < now() then reason := 'code_expired';
  end if;

  if v_tok.user_id is not null then
    select p.id, coalesce(nullif(btrim(p.full_name), ''), p.username), p.username, p.avatar_url
      into member_id, member_name, username, avatar_url from profiles p where p.id = v_tok.user_id;
  end if;

  if reason is null then
    -- أفضل اشتراك يصلح لهذا الفرع: ساري أولاً، ثم مجمّد/قادم، ثم الأحدث
    select * into v_m from memberships m
     where m.user_id = v_tok.user_id and (m.gym_id = p_gym or (m.chain_id is not null and m.chain_id = v_gym.chain_id))
     order by case membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until)
                when 'active' then 0 when 'frozen' then 1 when 'upcoming' then 2 when 'expired' then 3 else 4 end,
              m.ends_on desc
     limit 1;
    if v_m.id is null then
      reason := case when exists (select 1 from memberships m where m.user_id = v_tok.user_id and membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until) = 'active')
                     then 'wrong_gym' else 'no_membership' end;
    else
      v_state := membership_state(v_m.status, v_m.starts_on, v_m.ends_on, v_m.frozen_from, v_m.frozen_until);
      plan_name := v_m.plan_name; ends_on := v_m.ends_on; days_left := membership_days_left(v_m.ends_on); membership_id := v_m.id;
      reason := case v_state when 'active' then 'ok' else v_state end;
      allowed := v_state = 'active';
    end if;
    update entry_tokens set used_at = now(), used_gym = p_gym where token_hash = v_tok.token_hash;
  end if;

  if allowed then
    v_open := exists (select 1 from check_ins c where c.user_id = v_tok.user_id and c.checked_out_at is null and c.checked_in_at > now() - interval '6 hours');
    v_ci := _record_visit(v_tok.user_id, p_gym, case when p_gate is not null then 'gate' else 'qr' end);
    check_in_id := v_ci.id; already_in := v_open;
  end if;

  insert into entry_log (gym_id, user_id, staff_id, gate_id, allowed, reason, membership_id)
  values (p_gym, v_tok.user_id, p_staff, p_gate, allowed, coalesce(reason, 'code_not_found'), membership_id);
  return next;
end $$;
revoke all on function public._verify_entry(text, uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.verify_entry(p_token text, p_gym uuid)
returns table (allowed boolean, reason text, member_id uuid, member_name text, username text, avatar_url text,
               plan_name text, ends_on date, days_left integer, membership_id uuid, check_in_id uuid, already_in boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not is_gym_staff(p_gym) then raise exception 'not_allowed'; end if;
  return query select * from _verify_entry(p_token, p_gym, auth.uid(), null);
end $$;
revoke all on function public.verify_entry(text, uuid) from public, anon;
grant execute on function public.verify_entry(text, uuid) to authenticated;

-- البوابة: مفتاح خاص لكل بوابة (يظهر مرة وحدة عند الإنشاء)
create or replace function public.create_gate(p_gym uuid, p_name text)
returns table (gate_id uuid, api_key text)
language plpgsql security definer set search_path = public as $$
declare v_key text;
begin
  if not can_manage_gym_or_chain(p_gym) then raise exception 'not_allowed'; end if;
  v_key := 'arqg_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into gym_gates (gym_id, name, key_hash, key_hint) values (p_gym, btrim(p_name), _hash(v_key), right(v_key, 4))
  returning id into gate_id;
  api_key := v_key;
  return next;
end $$;
revoke all on function public.create_gate(uuid, text) from public, anon;
grant execute on function public.create_gate(uuid, text) to authenticated;

create or replace function public.gate_verify(gate_key text, token text)
returns table (allowed boolean, reason text, first_name text, days_left integer)
language plpgsql security definer set search_path = public as $$
declare v_gate gym_gates; r record;
begin
  select * into v_gate from gym_gates where key_hash = _hash(coalesce(gate_key, '')) and active;
  if not found then
    allowed := false; reason := 'invalid_gate'; return next; return;
  end if;
  update gym_gates set last_used_at = now() where id = v_gate.id;
  select * into r from _verify_entry(token, v_gate.gym_id, null, v_gate.id);
  allowed := r.allowed; reason := r.reason; first_name := split_part(coalesce(r.member_name, ''), ' ', 1); days_left := r.days_left;
  return next;
end $$;
revoke all on function public.gate_verify(text, text) from public;
grant execute on function public.gate_verify(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- طلبات التجميد والنقل
-- ---------------------------------------------------------------------
create table if not exists public.membership_requests (
  id            uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  kind          text not null check (kind in ('freeze','transfer')),
  days          integer check (days between 1 and 180),
  from_date     date,
  to_gym        uuid references public.gyms(id) on delete set null,
  reason        text check (char_length(reason) <= 300),
  status        text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reply         text check (char_length(reply) <= 300),
  decided_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  decided_at    timestamptz
);
create index if not exists mreq_membership_idx on public.membership_requests (membership_id, created_at desc);
alter table public.membership_requests enable row level security;
create policy mreq_read on public.membership_requests for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from memberships m where m.id = membership_id and can_staff_target(m.gym_id, m.chain_id)));

create or replace function public.request_membership_change(p_membership uuid, p_kind text, p_days integer, p_from date, p_to_gym uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_m memberships; v_id uuid; v_to gyms;
begin
  select * into v_m from memberships where id = p_membership and user_id = auth.uid();
  if not found then raise exception 'membership_not_found'; end if;
  if exists (select 1 from membership_requests where membership_id = p_membership and status = 'pending') then raise exception 'request_pending'; end if;
  if p_kind = 'freeze' and (p_days is null or p_days < 1) then raise exception 'bad_days'; end if;
  if p_kind = 'transfer' then
    select * into v_to from gyms where id = p_to_gym;
    if v_to.id is null or v_to.chain_id is null
       or v_to.chain_id is distinct from coalesce(v_m.chain_id, (select chain_id from gyms where id = v_m.gym_id)) then
      raise exception 'transfer_same_chain_only';
    end if;
  end if;
  insert into membership_requests (membership_id, user_id, kind, days, from_date, to_gym, reason)
  values (p_membership, auth.uid(), p_kind, case when p_kind = 'freeze' then p_days end,
          case when p_kind = 'freeze' then greatest(coalesce(p_from, app_today()), app_today()) end,
          case when p_kind = 'transfer' then p_to_gym end, nullif(btrim(coalesce(p_reason, '')), ''))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.request_membership_change(uuid, text, integer, date, uuid, text) from public, anon;
grant execute on function public.request_membership_change(uuid, text, integer, date, uuid, text) to authenticated;

create or replace function public.decide_membership_request(p_id uuid, p_approve boolean, p_reply text)
returns void language plpgsql security definer set search_path = public as $$
declare v_r membership_requests; v_m memberships;
begin
  select * into v_r from membership_requests where id = p_id and status = 'pending';
  if not found then raise exception 'request_not_found'; end if;
  select * into v_m from memberships where id = v_r.membership_id;
  if not can_manage_target(v_m.gym_id, v_m.chain_id) then raise exception 'not_allowed'; end if;
  update membership_requests set status = case when p_approve then 'approved' else 'rejected' end,
         reply = nullif(btrim(coalesce(p_reply, '')), ''), decided_by = auth.uid(), decided_at = now() where id = p_id;
  if p_approve and v_r.kind = 'freeze' then
    update memberships set status = 'frozen', frozen_from = v_r.from_date, frozen_until = v_r.from_date + v_r.days - 1,
           ends_on = ends_on + v_r.days, frozen_days_used = frozen_days_used + v_r.days where id = v_m.id;
  elsif p_approve and v_r.kind = 'transfer' then
    update memberships set gym_id = v_r.to_gym where id = v_m.id and gym_id is not null;
  end if;
  perform _notice(v_r.user_id, 'mreq:' || p_id,
    case when p_approve then 'تمت الموافقة على طلبك' else 'بخصوص طلبك' end,
    case v_r.kind when 'freeze' then 'طلب تجميد الاشتراك ' else 'طلب نقل الاشتراك ' end ||
      case when p_approve then 'انقبل.' else 'ما انقبل.' end || coalesce(' ' || nullif(btrim(coalesce(p_reply, '')), ''), ''),
    case when p_approve then 'Request approved' else 'About your request' end,
    case v_r.kind when 'freeze' then 'Your freeze request was ' else 'Your transfer request was ' end ||
      case when p_approve then 'approved.' else 'declined.' end || coalesce(' ' || nullif(btrim(coalesce(p_reply, '')), ''), ''),
    '/membership', v_m.id);
end $$;
revoke all on function public.decide_membership_request(uuid, boolean, text) from public, anon;
grant execute on function public.decide_membership_request(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- ملاحظات الأعضاء للنادي (شكوى / اقتراح / شكر) مع متابعة الحالة
-- ---------------------------------------------------------------------
create table if not exists public.gym_feedback (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  category    text not null check (category in ('complaint','suggestion','praise')),
  body        text not null check (char_length(btrim(body)) between 3 and 800),
  status      text not null default 'new' check (status in ('new','in_progress','resolved')),
  reply       text check (char_length(reply) <= 800),
  replied_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists gym_feedback_gym_idx on public.gym_feedback (gym_id, created_at desc);
alter table public.gym_feedback enable row level security;
create policy gfb_read on public.gym_feedback for select to authenticated using (user_id = auth.uid() or is_gym_staff(gym_id));
create policy gfb_insert on public.gym_feedback for insert to authenticated with check (user_id = auth.uid() and status = 'new' and reply is null);

create or replace function public.reply_gym_feedback(p_id uuid, p_status text, p_reply text)
returns void language plpgsql security definer set search_path = public as $$
declare v gym_feedback;
begin
  select * into v from gym_feedback where id = p_id;
  if not found or not is_gym_staff(v.gym_id) then raise exception 'not_allowed'; end if;
  if p_status not in ('new','in_progress','resolved') then raise exception 'bad_status'; end if;
  update gym_feedback set status = p_status, reply = coalesce(nullif(btrim(coalesce(p_reply, '')), ''), reply),
         replied_by = auth.uid(), updated_at = now() where id = p_id;
  if nullif(btrim(coalesce(p_reply, '')), '') is not null then
    perform _notice(v.user_id, 'gfb:' || p_id || ':' || md5(p_reply), 'رد ' || _gym_label(v.gym_id) || ' على ملاحظتك', left(btrim(p_reply), 200),
                    _gym_label(v.gym_id) || ' replied to your feedback', left(btrim(p_reply), 200), '/membership', p_id);
  end if;
end $$;
revoke all on function public.reply_gym_feedback(uuid, text, text) from public, anon;
grant execute on function public.reply_gym_feedback(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- إعلانات النادي للأعضاء الساريين (حد: مرتين باليوم لكل فرع أو سلسلة)
-- ---------------------------------------------------------------------
create table if not exists public.gym_broadcasts (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid references public.gyms(id) on delete cascade,
  chain_id    uuid references public.gym_chains(id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 2 and 80),
  body        text not null check (char_length(btrim(body)) between 3 and 240),
  recipients  integer not null default 0,
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  constraint gb_target check (gym_id is not null or chain_id is not null)
);
alter table public.gym_broadcasts enable row level security;
create policy gb_read on public.gym_broadcasts for select to authenticated using (can_manage_target(gym_id, chain_id));

-- أعضاء ساريين لفرع/سلسلة (عضوية الفرع + عضوية السلسلة اللي الفرع منها)
create or replace function public._active_members(p_gym uuid, p_chain uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct m.user_id from memberships m
  where m.user_id is not null
    and membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until) in ('active','frozen')
    and ((p_gym is not null and (m.gym_id = p_gym or m.chain_id = (select chain_id from gyms where id = p_gym)))
      or (p_chain is not null and (m.chain_id = p_chain or m.gym_id in (select id from gyms where chain_id = p_chain))));
$$;
revoke all on function public._active_members(uuid, uuid) from public, anon, authenticated;

create or replace function public.send_gym_broadcast(p_gym uuid, p_chain uuid, p_title text, p_body text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_n integer := 0; u uuid; v_name text;
begin
  if not can_manage_target(p_gym, p_chain) then raise exception 'not_allowed'; end if;
  if (select count(*) from gym_broadcasts b where b.gym_id is not distinct from p_gym and b.chain_id is not distinct from p_chain
        and b.title <> '__winback__' and b.created_at > now() - interval '1 day') >= 2 then raise exception 'rate_limited'; end if;
  insert into gym_broadcasts (gym_id, chain_id, title, body) values (p_gym, p_chain, btrim(p_title), btrim(p_body)) returning id into v_id;
  v_name := coalesce(_gym_label(p_gym), (select name from gym_chains where id = p_chain));
  for u in select * from _active_members(p_gym, p_chain) limit 5000 loop
    if _notice(u, 'gb:' || v_id, v_name || ': ' || btrim(p_title), btrim(p_body), v_name || ': ' || btrim(p_title), btrim(p_body), '/membership', v_id) then
      v_n := v_n + 1;
    end if;
  end loop;
  update gym_broadcasts set recipients = v_n where id = v_id;
  return v_n;
end $$;
revoke all on function public.send_gym_broadcast(uuid, uuid, text, text) from public, anon;
grant execute on function public.send_gym_broadcast(uuid, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- قائمة أعضاء الفرع للإدارة: قريب ينتهي، منتهي، منقطع، الكل
-- ---------------------------------------------------------------------
create or replace function public.gym_members(p_gym uuid, p_filter text default 'all')
returns table (membership_id uuid, user_id uuid, member_name text, username text, avatar_url text, member_contact text, claim_code text,
               kind text, plan_name text, starts_on date, ends_on date, state text, days_left integer, price_sar numeric,
               last_visit timestamptz, days_since_visit integer, chain_wide boolean)
language sql stable security definer set search_path = public as $$
  with g as (select id, chain_id from gyms where id = p_gym),
  m as (
    select m.*, membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until) as st
    from memberships m, g
    where (m.gym_id = g.id or (m.chain_id is not null and m.chain_id = g.chain_id))
  ),
  x as (
    select m.*, p.full_name, p.username as uname, p.avatar_url as av,
           (select max(c.checked_in_at) from check_ins c where c.user_id = m.user_id and c.gym_id = p_gym) as lv
    from m left join profiles p on p.id = m.user_id
  )
  select x.id, x.user_id, coalesce(nullif(btrim(x.full_name), ''), x.uname, x.member_name), x.uname, x.av, x.member_contact, x.claim_code,
         x.kind, x.plan_name, x.starts_on, x.ends_on, x.st, membership_days_left(x.ends_on), x.price_sar,
         x.lv, case when x.lv is null then null else (app_today() - (x.lv at time zone 'Asia/Riyadh')::date) end, x.chain_id is not null
  from x
  where is_gym_staff(p_gym)
    and case p_filter
      when 'expiring' then x.st in ('active','frozen') and x.ends_on <= app_today() + 14
      when 'expired'  then x.st = 'expired' and x.ends_on >= app_today() - 30
      when 'inactive' then x.st = 'active' and x.user_id is not null and (x.lv is null or x.lv < now() - interval '10 days')
      when 'pending'  then x.user_id is null
      else true end
  order by case when p_filter = 'expiring' then x.ends_on end, x.lv nulls first, x.ends_on desc
  limit 500;
$$;
revoke all on function public.gym_members(uuid, text) from public, anon;
grant execute on function public.gym_members(uuid, text) to authenticated;

-- تذكير الأعضاء المنقطعين (مرة كل ٧ أيام لكل عضو، ومرة باليوم لكل فرع)
create or replace function public.nudge_inactive_members(p_gym uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; v_n integer := 0; v_name text := _gym_label(p_gym); v_week text := to_char(app_today(), 'IYYY-IW');
begin
  if not can_manage_gym_or_chain(p_gym) then raise exception 'not_allowed'; end if;
  if exists (select 1 from gym_broadcasts where gym_id = p_gym and title = '__winback__' and created_at > now() - interval '1 day') then
    raise exception 'rate_limited';
  end if;
  insert into gym_broadcasts (gym_id, title, body) values (p_gym, '__winback__', 'win-back nudge');
  for r in select * from gym_members(p_gym, 'inactive') limit 2000 loop
    if _notice(r.user_id, 'winback:' || p_gym || ':' || v_week,
         'مشتاقين لك في ' || v_name || ' 💪', 'صار لك فترة ما جيت. اشتراكك ساري وباقي له ' || r.days_left || ' يوم، يلا نرجع للروتين!',
         'We miss you at ' || v_name || ' 💪', 'It''s been a while. Your membership is active with ' || r.days_left || ' days left — let''s get back to it!',
         '/membership', p_gym) then
      v_n := v_n + 1;
    end if;
  end loop;
  update gym_broadcasts set recipients = v_n where gym_id = p_gym and title = '__winback__' and created_at > now() - interval '1 minute';
  return v_n;
end $$;
revoke all on function public.nudge_inactive_members(uuid) from public, anon;
grant execute on function public.nudge_inactive_members(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- الحصص الجماعية والحجز
-- ---------------------------------------------------------------------
create table if not exists public.gym_classes (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 2 and 60),
  coach_name    text check (char_length(coach_name) <= 60),
  weekday       smallint not null check (weekday between 0 and 6),   -- ٠ = الأحد
  start_time    time not null,
  duration_min  smallint not null default 45 check (duration_min between 10 and 240),
  capacity      smallint not null default 20 check (capacity between 1 and 500),
  audience      text not null default 'mixed' check (audience in ('men','women','mixed')),
  members_only  boolean not null default true,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists gym_classes_gym_idx on public.gym_classes (gym_id, weekday);
alter table public.gym_classes enable row level security;
create policy gcl_read on public.gym_classes for select to authenticated using (active or can_manage_gym_or_chain(gym_id));
create policy gcl_write on public.gym_classes for all to authenticated using (can_manage_gym_or_chain(gym_id)) with check (can_manage_gym_or_chain(gym_id));

create table if not exists public.class_bookings (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.gym_classes(id) on delete cascade,
  class_date  date not null,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  status      text not null check (status in ('booked','waitlist','cancelled','attended')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (class_id, class_date, user_id)
);
create index if not exists class_bookings_idx on public.class_bookings (class_id, class_date, status, created_at);
alter table public.class_bookings enable row level security;
create policy cb_read on public.class_bookings for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from gym_classes c where c.id = class_id and is_gym_staff(c.gym_id)));

create or replace function public._class_start(p_class gym_classes, p_date date)
returns timestamptz language sql stable as $$
  select (p_date + p_class.start_time) at time zone 'Asia/Riyadh';
$$;

-- جدول الحصص لأيام قادمة مع عدد المحجوز وحالتي
create or replace function public.class_schedule(p_gym uuid, p_days integer default 7)
returns table (class_id uuid, class_date date, name text, coach_name text, start_time time, duration_min smallint,
               capacity smallint, audience text, booked integer, waitlist integer, my_status text, my_booking uuid, starts_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, d::date, c.name, c.coach_name, c.start_time, c.duration_min, c.capacity, c.audience,
         (select count(*) from class_bookings b where b.class_id = c.id and b.class_date = d::date and b.status in ('booked','attended'))::int,
         (select count(*) from class_bookings b where b.class_id = c.id and b.class_date = d::date and b.status = 'waitlist')::int,
         (select b.status from class_bookings b where b.class_id = c.id and b.class_date = d::date and b.user_id = auth.uid() and b.status <> 'cancelled'),
         (select b.id from class_bookings b where b.class_id = c.id and b.class_date = d::date and b.user_id = auth.uid() and b.status <> 'cancelled'),
         _class_start(c, d::date)
  from gym_classes c
  cross join generate_series(app_today(), app_today() + greatest(least(p_days, 21), 1) - 1, interval '1 day') d
  where c.gym_id = p_gym and c.active and extract(dow from d) = c.weekday and _class_start(c, d::date) > now()
  order by d, c.start_time;
$$;
revoke all on function public.class_schedule(uuid, integer) from public, anon;
grant execute on function public.class_schedule(uuid, integer) to authenticated;

create or replace function public.book_class(p_class uuid, p_date date)
returns text language plpgsql security definer set search_path = public as $$
declare v_c gym_classes; v_status text; v_booked integer; v_gym gyms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_c from gym_classes where id = p_class and active for update;
  if not found then raise exception 'class_not_found'; end if;
  if extract(dow from p_date) <> v_c.weekday or _class_start(v_c, p_date) <= now() then raise exception 'bad_date'; end if;
  if p_date > app_today() + 21 then raise exception 'too_far_ahead'; end if;
  select * into v_gym from gyms where id = v_c.gym_id;
  if v_c.members_only and not exists (
      select 1 from memberships m where m.user_id = auth.uid()
        and (m.gym_id = v_c.gym_id or (m.chain_id is not null and m.chain_id = v_gym.chain_id))
        and membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until, p_date) = 'active') then
    raise exception 'members_only';
  end if;
  select count(*) into v_booked from class_bookings where class_id = p_class and class_date = p_date and status in ('booked','attended');
  v_status := case when v_booked < v_c.capacity then 'booked' else 'waitlist' end;
  insert into class_bookings (class_id, class_date, user_id, status) values (p_class, p_date, auth.uid(), v_status)
  on conflict (class_id, class_date, user_id) do update set status = excluded.status, updated_at = now(), created_at = now()
    where class_bookings.status = 'cancelled'
  returning status into v_status;
  if v_status is null then raise exception 'already_booked'; end if;
  return v_status;
end $$;
revoke all on function public.book_class(uuid, date) from public, anon;
grant execute on function public.book_class(uuid, date) to authenticated;

create or replace function public.cancel_class_booking(p_booking uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_b class_bookings; v_c gym_classes; v_cut integer; v_next class_bookings;
begin
  select * into v_b from class_bookings where id = p_booking and user_id = auth.uid() and status in ('booked','waitlist') for update;
  if not found then raise exception 'booking_not_found'; end if;
  select * into v_c from gym_classes where id = v_b.class_id;
  select coalesce((select class_cutoff_min from gym_settings where gym_id = v_c.gym_id), 60) into v_cut;
  if v_b.status = 'booked' and _class_start(v_c, v_b.class_date) - make_interval(mins => v_cut) < now() then
    raise exception 'too_late_to_cancel';
  end if;
  update class_bookings set status = 'cancelled', updated_at = now() where id = p_booking;
  if v_b.status = 'booked' then
    select * into v_next from class_bookings where class_id = v_b.class_id and class_date = v_b.class_date and status = 'waitlist'
     order by created_at limit 1 for update;
    if v_next.id is not null then
      update class_bookings set status = 'booked', updated_at = now() where id = v_next.id;
      perform _notice(v_next.user_id, 'cls_up:' || v_next.id, 'انفتح لك مكان 🎉', 'صار لك مقعد في حصة «' || v_c.name || '» يوم ' || to_char(v_b.class_date, 'YYYY-MM-DD') || ' الساعة ' || to_char(v_c.start_time, 'HH24:MI') || '.',
                      'A spot opened up 🎉', 'You''re in “' || v_c.name || '” on ' || to_char(v_b.class_date, 'YYYY-MM-DD') || ' at ' || to_char(v_c.start_time, 'HH24:MI') || '.',
                      '/classes/' || v_c.gym_id, v_c.id);
    end if;
  end if;
end $$;
revoke all on function public.cancel_class_booking(uuid) from public, anon;
grant execute on function public.cancel_class_booking(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- تنبيهات مجدولة: قبل انتهاء الاشتراك (٧ و٢ أيام) وقبل الحصة بساعة
-- ---------------------------------------------------------------------
create or replace function public.run_gym_reminders(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare r record; v_n integer := 0; v_hour integer := extract(hour from p_now at time zone 'Asia/Riyadh');
begin
  -- التجديد: من ١٠ الصبح لين ٩ الليل بتوقيت الرياض
  if v_hour between 10 and 20 then
    for r in
      select m.id, m.user_id, m.plan_name, m.ends_on, coalesce(g.name, c.name) as place, coalesce(g.name_en, c.name_en, g.name, c.name) as place_en,
             m.ends_on - app_today() as d
      from memberships m left join gyms g on g.id = m.gym_id left join gym_chains c on c.id = m.chain_id
      where m.user_id is not null and m.kind = 'membership'
        and membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until) in ('active','frozen')
        and m.ends_on - app_today() in (7, 2)
      limit 5000
    loop
      if _notice(r.user_id, 'renew' || r.d || ':' || r.id,
           'اشتراكك قرب يخلص ⏳', 'اشتراك «' || r.plan_name || '» في ' || r.place || ' ينتهي بعد ' || r.d || ' أيام. جدّده عشان ما تنقطع سلسلتك.',
           'Your membership ends soon ⏳', '“' || r.plan_name || '” at ' || r.place_en || ' ends in ' || r.d || ' days. Renew to keep your streak going.',
           '/membership', r.id) then v_n := v_n + 1; end if;
    end loop;
  end if;
  -- الحصص: قبل البداية بـ ٤٥–٧٥ دقيقة
  for r in
    select b.id, b.user_id, c.name, c.start_time, c.gym_id
    from class_bookings b join gym_classes c on c.id = b.class_id
    where b.status = 'booked' and _class_start(c, b.class_date) between p_now + interval '45 minutes' and p_now + interval '75 minutes'
    limit 5000
  loop
    if _notice(r.user_id, 'cls_rem:' || r.id, 'حصتك بعد ساعة ⏰', '«' || r.name || '» الساعة ' || to_char(r.start_time, 'HH24:MI') || ' في ' || _gym_label(r.gym_id) || '.',
               'Your class starts in an hour ⏰', '“' || r.name || '” at ' || to_char(r.start_time, 'HH24:MI') || '.', '/classes/' || r.gym_id, r.id) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
revoke all on function public.run_gym_reminders(timestamptz) from public, anon, authenticated;

do $$
begin
  perform cron.schedule('arq-gym-reminders', '*/15 * * * *', 'select public.run_gym_reminders()');
exception when others then
  raise notice 'pg_cron not available: gym reminders not scheduled (%)', sqlerrm;
end $$;


-- ===================== 20260929000300_transparency.sql =====================
-- =====================================================================
-- الشفافية: أوقات الذروة، نسبة الحضور، تقييمات موثقة ومفصلة، رد النادي العلني، البلاغات،
-- السعر الكامل للعروض، ومقارنة الأندية
-- =====================================================================

-- ---------- التقييم المفصّل (اختياري) ----------
alter table public.gym_reviews
  add column if not exists f_clean     smallint check (f_clean between 1 and 5),
  add column if not exists f_equipment smallint check (f_equipment between 1 and 5),
  add column if not exists f_crowd     smallint check (f_crowd between 1 and 5),
  add column if not exists f_coaches   smallint check (f_coaches between 1 and 5),
  add column if not exists f_staff     smallint check (f_staff between 1 and 5);

-- التقييم الجديد لازم يكون من زائر فعلي (حضور في الفرع أو فرع من نفس السلسلة). التقييمات القديمة تبقى.
create or replace function public._review_needs_visit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin() then return new; end if;
  if not exists (
    select 1 from check_ins c join gyms g on g.id = c.gym_id
    where c.user_id = new.user_id
      and (c.gym_id = new.gym_id or (g.chain_id is not null and g.chain_id = (select chain_id from gyms where id = new.gym_id)))
  ) then
    raise exception 'review_needs_visit';
  end if;
  return new;
end $$;
drop trigger if exists reviews_need_visit on public.gym_reviews;
create trigger reviews_need_visit before insert on public.gym_reviews for each row execute function public._review_needs_visit();

-- ---------- رد النادي العلني (مرة لكل تقييم، يعدّله المدير، وما يقدر يحذف التقييم نفسه) ----------
create table if not exists public.gym_review_replies (
  gym_id      uuid not null,
  user_id     uuid not null,
  body        text not null check (char_length(btrim(body)) between 2 and 600),
  replied_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (gym_id, user_id),
  foreign key (gym_id, user_id) references public.gym_reviews(gym_id, user_id) on delete cascade
);
alter table public.gym_review_replies enable row level security;
create policy rr_read on public.gym_review_replies for select to authenticated using (true);
create policy rr_write on public.gym_review_replies for insert to authenticated with check (can_manage_gym_or_chain(gym_id));
create policy rr_update on public.gym_review_replies for update to authenticated using (can_manage_gym_or_chain(gym_id)) with check (can_manage_gym_or_chain(gym_id));
create policy rr_delete on public.gym_review_replies for delete to authenticated using (can_manage_gym_or_chain(gym_id) or is_admin());
create or replace function public._rr_touch()
returns trigger language plpgsql as $$ begin new.updated_at := now(); new.replied_by := coalesce(auth.uid(), new.replied_by); return new; end $$;
drop trigger if exists rr_touch on public.gym_review_replies;
create trigger rr_touch before update on public.gym_review_replies for each row execute function public._rr_touch();

create or replace function public._on_review_reply()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform _notice(new.user_id, 'rr:' || new.gym_id || ':' || new.user_id,
    'رد ' || _gym_label(new.gym_id) || ' على تقييمك', left(new.body, 200),
    _gym_label(new.gym_id) || ' replied to your review', left(new.body, 200), '/clubs/' || new.gym_id, new.gym_id);
  return null;
end $$;
drop trigger if exists rr_notify on public.gym_review_replies;
create trigger rr_notify after insert on public.gym_review_replies for each row execute function public._on_review_reply();

-- ---------- بلاغ عن تقييم (يراجعه الأدمن) ----------
create table if not exists public.review_flags (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null,
  user_id     uuid not null,
  flagged_by  uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  reason      text not null check (reason in ('fake','offensive','spam','other')),
  note        text check (char_length(note) <= 300),
  status      text not null default 'new' check (status in ('new','kept','removed')),
  created_at  timestamptz not null default now(),
  unique (gym_id, user_id, flagged_by),
  foreign key (gym_id, user_id) references public.gym_reviews(gym_id, user_id) on delete cascade
);
alter table public.review_flags enable row level security;
create policy rf_insert on public.review_flags for insert to authenticated with check (flagged_by = auth.uid() and status = 'new');
create policy rf_read on public.review_flags for select to authenticated using (flagged_by = auth.uid() or is_admin());
create policy rf_admin on public.review_flags for update to authenticated using (is_admin()) with check (is_admin());

-- ---------- قائمة التقييمات الكاملة: موثّق، التفاصيل، ورد النادي ----------
create or replace function public.gym_reviews_full(p_gym uuid)
returns table (user_id uuid, username text, full_name text, avatar_url text, points integer, rating smallint, body text,
               updated_at timestamptz, visited boolean, is_me boolean,
               f_clean smallint, f_equipment smallint, f_crowd smallint, f_coaches smallint, f_staff smallint,
               reply text, reply_at timestamptz, can_reply boolean)
language sql stable security definer set search_path = public as $$
  select r.user_id, p.username, p.full_name, p.avatar_url, p.points, r.rating, r.body, r.updated_at,
         exists (select 1 from check_ins c where c.user_id = r.user_id and c.gym_id = r.gym_id),
         r.user_id = auth.uid(),
         r.f_clean, r.f_equipment, r.f_crowd, r.f_coaches, r.f_staff,
         rr.body, rr.updated_at, can_manage_gym_or_chain(p_gym)
  from gym_reviews r join profiles p on p.id = r.user_id
  left join gym_review_replies rr on rr.gym_id = r.gym_id and rr.user_id = r.user_id
  where r.gym_id = p_gym
  order by (r.user_id = auth.uid()) desc,
           exists (select 1 from check_ins c where c.user_id = r.user_id and c.gym_id = r.gym_id) desc,
           r.updated_at desc
  limit 200;
$$;
revoke all on function public.gym_reviews_full(uuid) from public, anon;
grant execute on function public.gym_reviews_full(uuid) to authenticated;

create or replace function public.gym_review_facets(p_gym uuid)
returns table (clean numeric, equipment numeric, crowd numeric, coaches numeric, staff numeric, rated integer, verified_share numeric)
language sql stable security definer set search_path = public as $$
  select round(avg(f_clean), 1), round(avg(f_equipment), 1), round(avg(f_crowd), 1), round(avg(f_coaches), 1), round(avg(f_staff), 1),
         count(*) filter (where coalesce(f_clean, f_equipment, f_crowd, f_coaches, f_staff) is not null)::int,
         round(avg(case when exists (select 1 from check_ins c where c.user_id = r.user_id and c.gym_id = r.gym_id) then 1 else 0 end), 2)
  from gym_reviews r where r.gym_id = p_gym;
$$;
revoke all on function public.gym_review_facets(uuid) from public, anon;
grant execute on function public.gym_review_facets(uuid) to authenticated;

-- ---------- أوقات الذروة: متوسط عدد الموجودين لكل ساعة في كل يوم (آخر ٨ أسابيع) ----------
create or replace function public.gym_peak_hours(p_gym uuid, p_weeks integer default 8)
returns table (dow integer, hour integer, avg_present numeric, samples integer)
language sql stable security definer set search_path = public as $$
  with c as (
    select (c.checked_in_at at time zone 'Asia/Riyadh') as t0,
           (least(coalesce(c.checked_out_at, c.checked_in_at + interval '90 minutes'), c.checked_in_at + interval '3 hours') at time zone 'Asia/Riyadh') as t1
    from check_ins c
    where c.gym_id = p_gym and c.checked_in_at > now() - make_interval(weeks => greatest(least(p_weeks, 26), 1))
  ),
  h as (select generate_series(date_trunc('hour', t0), t1, interval '1 hour') as slot from c)
  select extract(dow from slot)::int, extract(hour from slot)::int,
         round(count(*)::numeric / greatest(least(p_weeks, 26), 1), 2),
         (select count(*) from c)::int
  from h group by 1, 2 order by 1, 2;
$$;
revoke all on function public.gym_peak_hours(uuid, integer) from public, anon;
grant execute on function public.gym_peak_hours(uuid, integer) to authenticated;

-- أوقاتي المعتادة (لاقتراح أهدى وقت قريب منها)
create or replace function public.my_usual_hours()
returns table (dow integer, hour integer, visits integer)
language sql stable security definer set search_path = public as $$
  select extract(dow from checked_in_at at time zone 'Asia/Riyadh')::int, extract(hour from checked_in_at at time zone 'Asia/Riyadh')::int, count(*)::int
  from check_ins where user_id = auth.uid() and checked_in_at > now() - interval '90 days'
  group by 1, 2 order by 3 desc limit 20;
$$;
revoke all on function public.my_usual_hours() from public, anon;
grant execute on function public.my_usual_hours() to authenticated;

-- ---------- نسبة الحضور: هدفي الأسبوعي مقابل زياراتي هالشهر ----------
create table if not exists public.attendance_goals (
  user_id        uuid primary key references public.profiles(id) on delete cascade default auth.uid(),
  days_per_week  smallint not null check (days_per_week between 1 and 7),
  updated_at     timestamptz not null default now()
);
alter table public.attendance_goals enable row level security;
create policy ag_own on public.attendance_goals for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.my_attendance()
returns table (days_per_week smallint, month_start date, days_in_month integer, day_of_month integer,
               planned_to_date integer, planned_month integer, visits integer, visit_days date[], last_month_visits integer, last_month_planned integer)
language sql stable security definer set search_path = public as $$
  with g as (select coalesce((select a.days_per_week from attendance_goals a where a.user_id = auth.uid()), 3::smallint) as dpw),
  m as (select date_trunc('month', app_today())::date as ms),
  d as (
    select distinct (c.checked_in_at at time zone 'Asia/Riyadh')::date as day
    from check_ins c, m where c.user_id = auth.uid() and c.checked_in_at >= (m.ms - interval '1 month') at time zone 'Asia/Riyadh'
  )
  select g.dpw, m.ms,
         extract(day from (m.ms + interval '1 month - 1 day'))::int,
         extract(day from app_today())::int,
         round(g.dpw * extract(day from app_today()) / 7.0)::int,
         round(g.dpw * extract(day from (m.ms + interval '1 month - 1 day')) / 7.0)::int,
         (select count(*) from d where d.day >= m.ms)::int,
         coalesce((select array_agg(d.day order by d.day) from d where d.day >= m.ms), '{}'),
         (select count(*) from d where d.day >= (m.ms - interval '1 month')::date and d.day < m.ms)::int,
         round(g.dpw * extract(day from (m.ms - interval '1 day')) / 7.0)::int
  from g, m;
$$;
revoke all on function public.my_attendance() from public, anon;
grant execute on function public.my_attendance() to authenticated;

-- ---------- السعر الكامل في العروض ----------
alter table public.gym_offers
  add column if not exists join_fee_sar numeric(8,2) check (join_fee_sar is null or join_fee_sar between 0 and 100000),
  add column if not exists vat_included boolean,
  add column if not exists min_months   smallint check (min_months is null or min_months between 0 and 36),
  add column if not exists terms        text check (char_length(terms) <= 400);

-- ---------- مقارنة الأندية (٢–٣ أندية جنب بعض) ----------
create or replace function public.gym_compare(p_ids uuid[])
returns table (id uuid, name text, name_en text, chain text, chain_id uuid, audience text, logo_path text, chain_logo text,
               rating numeric, reviews integer, best_monthly numeric, present_now integer,
               clean numeric, equipment numeric, crowd numeric, coaches numeric, staff numeric, services text[])
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.name_en, c.name, g.chain_id, coalesce(c.audience, 'mixed'), null::text, c.logo_path,
         round((select avg(r.rating) from gym_reviews r where r.gym_id = g.id), 1),
         (select count(*) from gym_reviews r where r.gym_id = g.id)::int,
         (select min(case when o.months >= 1 then o.price_sar / o.months end) from gym_offers o
            where (o.gym_id = g.id or o.chain_id = g.chain_id) and o.active and (o.ends_on is null or o.ends_on >= current_date)),
         (select count(distinct ci.user_id) from check_ins ci where ci.gym_id = g.id and ci.checked_out_at is null and ci.checked_in_at > now() - interval '6 hours')::int,
         (select round(avg(r.f_clean), 1) from gym_reviews r where r.gym_id = g.id),
         (select round(avg(r.f_equipment), 1) from gym_reviews r where r.gym_id = g.id),
         (select round(avg(r.f_crowd), 1) from gym_reviews r where r.gym_id = g.id),
         (select round(avg(r.f_coaches), 1) from gym_reviews r where r.gym_id = g.id),
         (select round(avg(r.f_staff), 1) from gym_reviews r where r.gym_id = g.id),
         coalesce((select array_agg(a.key order by a.sort_order) from amenities a
                    where a.active and a.key <> 'other' and coalesce(
                      (select ga.available from gym_amenities ga where ga.gym_id = g.id and ga.amenity = a.key),
                      (select ca.available from chain_amenities ca where ca.chain_id = g.chain_id and ca.amenity = a.key), false)), '{}')
  from gyms g left join gym_chains c on c.id = g.chain_id
  where g.id = any(p_ids[1:3]);
$$;
revoke all on function public.gym_compare(uuid[]) from public, anon;
grant execute on function public.gym_compare(uuid[]) to authenticated;


-- ===================== 20260929000400_wallet.sql =====================
-- =====================================================================
-- بطاقة أرك في Apple Wallet: باركود ثابت للعضو (يتجدد كل ما نزّل البطاقة من جديد)
-- - الرابط لتنزيل البطاقة قصير العمر (٥ دقايق) ولمرة وحدة، لأن Safari يفتحه بدون تسجيل دخول
-- - الرمز نفسه ما ينحفظ، نحفظ بصمته فقط؛ تنزيل بطاقة جديدة يلغي القديمة
-- - الاستقبال يقرأ باركود البطاقة بنفس شاشة التحقق، والبوابة ترفض دخول ثاني خلال ٣ ساعات (يمنع مشاركة البطاقة)
-- =====================================================================

create table if not exists public.wallet_passes (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  serial       uuid not null default gen_random_uuid() unique,
  code_hash    text not null unique,
  code_hint    text not null,
  created_at   timestamptz not null default now(),
  rotated_at   timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.wallet_passes enable row level security;  -- الوصول عبر الدوال فقط

create table if not exists public.wallet_links (
  token_hash  text primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);
create index if not exists wallet_links_user_idx on public.wallet_links (user_id, created_at desc);
alter table public.wallet_links enable row level security;

-- رابط تنزيل البطاقة (التطبيق يفتحه في Safari)
create or replace function public.wallet_link()
returns table (token text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_tok text; v_exp timestamptz := now() + interval '5 minutes';
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from wallet_links l where l.user_id = auth.uid() and l.created_at < now() - interval '1 day';
  if (select count(*) from wallet_links l where l.user_id = auth.uid() and l.created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'too_many_requests';
  end if;
  v_tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into wallet_links (token_hash, user_id, expires_at) values (_hash(v_tok), auth.uid(), v_exp);
  token := v_tok; expires_at := v_exp;
  return next;
end $$;
revoke all on function public.wallet_link() from public, anon;
grant execute on function public.wallet_link() to authenticated;

-- حالة بطاقتي + إيقافها (لو ضاع الجوال)
create or replace function public.my_wallet_pass()
returns table (has_pass boolean, code_hint text, rotated_at timestamptz, last_used_at timestamptz)
language sql stable security definer set search_path = public as $$
  select true, w.code_hint, w.rotated_at, w.last_used_at from wallet_passes w where w.user_id = auth.uid()
  union all
  select false, null, null, null where not exists (select 1 from wallet_passes w where w.user_id = auth.uid());
$$;
revoke all on function public.my_wallet_pass() from public, anon;
grant execute on function public.my_wallet_pass() to authenticated;

create or replace function public.revoke_wallet_pass()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from wallet_passes where user_id = auth.uid();
end $$;
revoke all on function public.revoke_wallet_pass() from public, anon;
grant execute on function public.revoke_wallet_pass() to authenticated;

-- يستدعيها السيرفر فقط (دالة wallet-pass بمفتاح الخدمة): تستهلك الرابط وتجدد الرمز وترجع بيانات البطاقة
create or replace function public.wallet_issue(p_token text)
returns table (user_id uuid, serial uuid, code text, member_name text, username text, member_since date,
               memberships jsonb, locations jsonb)
language plpgsql security definer set search_path = public as $$
declare v_link wallet_links; v_code text; v_uid uuid;
begin
  select * into v_link from wallet_links l where l.token_hash = _hash(coalesce(p_token, '')) for update;
  if not found then raise exception 'code_not_found'; end if;
  if v_link.used_at is not null then raise exception 'code_used'; end if;
  if v_link.expires_at < now() then raise exception 'code_expired'; end if;
  update wallet_links set used_at = now() where token_hash = v_link.token_hash;
  v_uid := v_link.user_id;

  v_code := 'w_' || replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  insert into wallet_passes as w (user_id, code_hash, code_hint) values (v_uid, _hash(v_code), right(v_code, 4))
  on conflict on constraint wallet_passes_pkey do update set code_hash = excluded.code_hash, code_hint = excluded.code_hint, rotated_at = now();

  user_id := v_uid; code := v_code;
  select w.serial into serial from wallet_passes w where w.user_id = v_uid;
  select coalesce(nullif(btrim(p.full_name), ''), p.username), p.username, p.created_at::date
    into member_name, username, member_since from profiles p where p.id = v_uid;

  -- الاشتراكات السارية/المجمدة/القادمة (الأحدث أولاً)
  select coalesce(jsonb_agg(x order by x->>'ends_on' desc), '[]'::jsonb) into memberships from (
    select jsonb_build_object(
      'place', coalesce(g.name, c.name), 'place_en', coalesce(g.name_en, c.name_en),
      'plan', m.plan_name, 'ends_on', m.ends_on,
      'state', membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until)) as x
    from memberships m left join gyms g on g.id = m.gym_id left join gym_chains c on c.id = m.chain_id
    where m.user_id = v_uid and membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until) in ('active','frozen','upcoming')
    limit 5) s;

  -- مواقع الأندية (تظهر البطاقة على شاشة القفل لما توصل النادي) — بحد أقصى ١٠
  select coalesce(jsonb_agg(jsonb_build_object('lat', q.lat, 'lng', q.lng, 'name', q.name)), '[]'::jsonb) into locations from (
    select distinct on (g.id) g.id, g.lat, g.lng, coalesce(g.name, '') as name
    from memberships m join gyms g on (g.id = m.gym_id or (m.chain_id is not null and g.chain_id = m.chain_id))
    where m.user_id = v_uid and g.lat is not null and g.lng is not null
      and membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until) in ('active','upcoming')
    order by g.id limit 10) q;
  if locations = '[]'::jsonb then
    select coalesce(jsonb_agg(jsonb_build_object('lat', q.lat, 'lng', q.lng, 'name', q.name)), '[]'::jsonb) into locations from (
      select g.lat, g.lng, g.name, max(ci.checked_in_at) as last_at from check_ins ci join gyms g on g.id = ci.gym_id
      where ci.user_id = v_uid and g.lat is not null group by g.id, g.lat, g.lng, g.name order by last_at desc limit 3) q;
  end if;
  return next;
end $$;
revoke all on function public.wallet_issue(text) from public, anon, authenticated;
grant execute on function public.wallet_issue(text) to service_role;

-- التحقق من الدخول: نفس المنطق السابق + باركود بطاقة Wallet (w_…)
create or replace function public._verify_entry(p_token text, p_gym uuid, p_staff uuid, p_gate uuid)
returns table (allowed boolean, reason text, member_id uuid, member_name text, username text, avatar_url text,
               plan_name text, ends_on date, days_left integer, membership_id uuid, check_in_id uuid, already_in boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_tok entry_tokens; v_gym gyms; v_m memberships; v_state text; v_ci check_ins; v_open boolean := false;
  v_in text := btrim(coalesce(p_token, ''));
  v_uid uuid; v_wallet boolean := false;
begin
  select * into v_gym from gyms where id = p_gym;
  if not found then raise exception 'gym_not_found'; end if;
  v_in := regexp_replace(v_in, '^arq://entry/', '');

  allowed := false; already_in := false;
  if v_in ~ '^w_[0-9a-f]{40}$' then
    v_wallet := true;
    select w.user_id into v_uid from wallet_passes w where w.code_hash = _hash(v_in);
    if v_uid is null then reason := 'code_not_found'; end if;
  else
    if v_in ~ '^[0-9]{6}$' then
      select * into v_tok from entry_tokens e where e.code = v_in order by e.created_at desc limit 1;
    else
      select * into v_tok from entry_tokens e where e.token_hash = _hash(v_in);
    end if;
    v_uid := v_tok.user_id;
    if v_tok.user_id is null then reason := 'code_not_found';
    elsif v_tok.used_at is not null then reason := 'code_used';
    elsif v_tok.expires_at < now() then reason := 'code_expired';
    end if;
  end if;

  if v_uid is not null then
    select p.id, coalesce(nullif(btrim(p.full_name), ''), p.username), p.username, p.avatar_url
      into member_id, member_name, username, avatar_url from profiles p where p.id = v_uid;
  end if;

  if reason is null then
    -- أفضل اشتراك يصلح لهذا الفرع: ساري أولاً، ثم مجمّد/قادم، ثم الأحدث
    select * into v_m from memberships m
     where m.user_id = v_uid and (m.gym_id = p_gym or (m.chain_id is not null and m.chain_id = v_gym.chain_id))
     order by case membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until)
                when 'active' then 0 when 'frozen' then 1 when 'upcoming' then 2 when 'expired' then 3 else 4 end,
              m.ends_on desc
     limit 1;
    if v_m.id is null then
      reason := case when exists (select 1 from memberships m where m.user_id = v_uid and membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until) = 'active')
                     then 'wrong_gym' else 'no_membership' end;
    else
      v_state := membership_state(v_m.status, v_m.starts_on, v_m.ends_on, v_m.frozen_from, v_m.frozen_until);
      plan_name := v_m.plan_name; ends_on := v_m.ends_on; days_left := membership_days_left(v_m.ends_on); membership_id := v_m.id;
      reason := case v_state when 'active' then 'ok' else v_state end;
      allowed := v_state = 'active';
    end if;
    if v_wallet then
      update wallet_passes set last_used_at = now() where user_id = v_uid;
      -- البوابة (بدون موظف): بطاقة Wallet تدخل مرة وحدة كل ٣ ساعات
      if allowed and p_gate is not null and exists (
        select 1 from entry_log l where l.user_id = v_uid and l.allowed and l.created_at > now() - interval '3 hours') then
        allowed := false; reason := 'recent_entry';
      end if;
    else
      update entry_tokens set used_at = now(), used_gym = p_gym where token_hash = v_tok.token_hash;
    end if;
  end if;

  if allowed then
    v_open := exists (select 1 from check_ins c where c.user_id = v_uid and c.checked_out_at is null and c.checked_in_at > now() - interval '6 hours');
    v_ci := _record_visit(v_uid, p_gym, case when p_gate is not null then 'gate' else 'qr' end);
    check_in_id := v_ci.id; already_in := v_open;
  end if;

  insert into entry_log (gym_id, user_id, staff_id, gate_id, allowed, reason, membership_id)
  values (p_gym, v_uid, p_staff, p_gate, allowed, coalesce(reason, 'code_not_found'), membership_id);
  return next;
end $$;
revoke all on function public._verify_entry(text, uuid, uuid, uuid) from public, anon, authenticated;


-- ===================== 20260929000450_wallet_themes.sql =====================
-- ألوان بطاقة Wallet (نفس ثيمات التطبيق): النخيل، الواحة، الكثبان، الرمال، الخزامى — العضو يختار قبل ما يضيف البطاقة
alter table public.wallet_links  add column if not exists theme text not null default 'palm' check (theme in ('palm','oasis','dune','sand','lavender'));
alter table public.wallet_passes add column if not exists theme text not null default 'palm' check (theme in ('palm','oasis','dune','sand','lavender'));

drop function if exists public.wallet_link();
create or replace function public.wallet_link(p_theme text default null)
returns table (token text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_tok text; v_exp timestamptz := now() + interval '5 minutes'; v_theme text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  v_theme := coalesce(nullif(p_theme, ''), (select w.theme from wallet_passes w where w.user_id = auth.uid()), 'palm');
  if v_theme not in ('palm','oasis','dune','sand','lavender') then v_theme := 'palm'; end if;
  delete from wallet_links l where l.user_id = auth.uid() and l.created_at < now() - interval '1 day';
  if (select count(*) from wallet_links l where l.user_id = auth.uid() and l.created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'too_many_requests';
  end if;
  v_tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into wallet_links (token_hash, user_id, expires_at, theme) values (_hash(v_tok), auth.uid(), v_exp, v_theme);
  token := v_tok; expires_at := v_exp;
  return next;
end $$;
revoke all on function public.wallet_link(text) from public, anon;
grant execute on function public.wallet_link(text) to authenticated;

drop function if exists public.my_wallet_pass();
create or replace function public.my_wallet_pass()
returns table (has_pass boolean, code_hint text, rotated_at timestamptz, last_used_at timestamptz, theme text)
language sql stable security definer set search_path = public as $$
  select true, w.code_hint, w.rotated_at, w.last_used_at, w.theme from wallet_passes w where w.user_id = auth.uid()
  union all
  select false, null, null, null, null where not exists (select 1 from wallet_passes w where w.user_id = auth.uid());
$$;
revoke all on function public.my_wallet_pass() from public, anon;
grant execute on function public.my_wallet_pass() to authenticated;

drop function if exists public.wallet_issue(text);
create or replace function public.wallet_issue(p_token text)
returns table (user_id uuid, serial uuid, code text, member_name text, username text, member_since date,
               memberships jsonb, locations jsonb, theme text)
language plpgsql security definer set search_path = public as $$
declare v_link wallet_links; v_code text; v_uid uuid;
begin
  select * into v_link from wallet_links l where l.token_hash = _hash(coalesce(p_token, '')) for update;
  if not found then raise exception 'code_not_found'; end if;
  if v_link.used_at is not null then raise exception 'code_used'; end if;
  if v_link.expires_at < now() then raise exception 'code_expired'; end if;
  update wallet_links set used_at = now() where token_hash = v_link.token_hash;
  v_uid := v_link.user_id;

  v_code := 'w_' || replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  insert into wallet_passes as w (user_id, code_hash, code_hint, theme) values (v_uid, _hash(v_code), right(v_code, 4), v_link.theme)
  on conflict on constraint wallet_passes_pkey do update set code_hash = excluded.code_hash, code_hint = excluded.code_hint,
    theme = excluded.theme, rotated_at = now();

  user_id := v_uid; code := v_code; theme := v_link.theme;
  select w.serial into serial from wallet_passes w where w.user_id = v_uid;
  select coalesce(nullif(btrim(p.full_name), ''), p.username), p.username, p.created_at::date
    into member_name, username, member_since from profiles p where p.id = v_uid;

  select coalesce(jsonb_agg(x order by x->>'ends_on' desc), '[]'::jsonb) into memberships from (
    select jsonb_build_object(
      'place', coalesce(g.name, c.name), 'place_en', coalesce(g.name_en, c.name_en),
      'plan', m.plan_name, 'ends_on', m.ends_on,
      'state', membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until)) as x
    from memberships m left join gyms g on g.id = m.gym_id left join gym_chains c on c.id = m.chain_id
    where m.user_id = v_uid and membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until) in ('active','frozen','upcoming')
    limit 5) s;

  select coalesce(jsonb_agg(jsonb_build_object('lat', q.lat, 'lng', q.lng, 'name', q.name)), '[]'::jsonb) into locations from (
    select distinct on (g.id) g.id, g.lat, g.lng, coalesce(g.name, '') as name
    from memberships m join gyms g on (g.id = m.gym_id or (m.chain_id is not null and g.chain_id = m.chain_id))
    where m.user_id = v_uid and g.lat is not null and g.lng is not null
      and membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until) in ('active','upcoming')
    order by g.id limit 10) q;
  if locations = '[]'::jsonb then
    select coalesce(jsonb_agg(jsonb_build_object('lat', q.lat, 'lng', q.lng, 'name', q.name)), '[]'::jsonb) into locations from (
      select g.lat, g.lng, g.name, max(ci.checked_in_at) as last_at from check_ins ci join gyms g on g.id = ci.gym_id
      where ci.user_id = v_uid and g.lat is not null group by g.id, g.lat, g.lng, g.name order by last_at desc limit 3) q;
  end if;
  return next;
end $$;
revoke all on function public.wallet_issue(text) from public, anon, authenticated;
grant execute on function public.wallet_issue(text) to service_role;


-- ===================== 20260929000500_coaches.sql =====================
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


-- ===================== 20260929000510_coach_review.sql =====================
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


-- ===================== 20260929000520_profile_cover.sql =====================
-- خلفية الحساب (خلف الاسم في صفحة الحساب): لون من ألوان أرك أو صورة من جهاز المستخدم.
-- 'auto' = تتبع ثيم التطبيق عند كل مشاهد (السلوك القديم). الصورة تنحفظ في مجلد المستخدم نفسه في avatars.
alter table public.profiles
  add column if not exists cover text not null default 'auto'
    constraint profiles_cover_check check (cover in ('auto','ember','palm','oasis','dune','lavender','night','gold')),
  add column if not exists cover_url text
    constraint profiles_cover_url_check check (cover_url is null or (char_length(cover_url) <= 200 and cover_url like id::text || '/%' and cover_url !~ '\.\.'));

grant update (cover, cover_url) on public.profiles to authenticated;


-- ===================== 20260929000530_exercise_media.sql =====================
-- صور مكتبة التمارين (Free Exercise DB — ملكية عامة): حاوية عامة للقراءة فقط
-- الرفع يتم مرة وحدة من الخادم بمفتاح الخدمة (بدون سياسات كتابة للمستخدمين)
insert into storage.buckets (id, name, public) values ('exercises', 'exercises', true) on conflict (id) do nothing;


-- ===================== 20260929000540_meal_photo.sql =====================
-- =====================================================================
-- تحليل صورة الوجبة بالذكاء الاصطناعي: حد يومي لكل مستخدم (يحمي التكلفة)
-- الصورة نفسها ما تنحفظ: تنرسل للتحليل وبس، والمستخدم يراجع النتيجة قبل ما تنسجل في سجل الأكل
-- =====================================================================
create table public.ai_usage (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('meal_photo')),
  created_at  timestamptz not null default now()
);
create index on public.ai_usage (user_id, kind, created_at desc);
alter table public.ai_usage enable row level security;
create policy ai_usage_read_own on public.ai_usage for select to authenticated using (user_id = auth.uid());

-- يحجز استخدام واحد إذا ما وصل المستخدم الحد (٢٥ صورة وجبة باليوم)، ويرجع كم باقي
create or replace function public.ai_take(p_kind text)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  cap int := case p_kind when 'meal_photo' then 25 else 0 end;
  used int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if cap = 0 then raise exception 'bad_status'; end if;
  perform pg_advisory_xact_lock(hashtext('ai_take:' || auth.uid()::text || ':' || p_kind));
  select count(*) into used from ai_usage where user_id = auth.uid() and kind = p_kind and created_at > now() - interval '1 day';
  if used >= cap then raise exception 'rate_limited'; end if;
  insert into ai_usage (user_id, kind) values (auth.uid(), p_kind);
  return cap - used - 1;
end $$;
revoke all on function public.ai_take(text) from public, anon;
grant execute on function public.ai_take(text) to authenticated;


-- ===================== 20260929000550_stores_recovery.sql =====================
-- =====================================================================
-- ١) المتاجر (بدل «البراندات»): أقسام للمطاعم الصحية والملابس الرياضية، وأطباق المطاعم فيها سعرات وماكروز
--    تنسجل في سجل الأكل بضغطة
-- ٢) الاستشفاء: دليل مراكز العلاج الطبيعي والاستشفاء + «أضف مركزك» واعتماد من لوحة المالك
-- =====================================================================

-- ---------- المتاجر ----------
alter table public.brands drop constraint if exists brands_category_check;
alter table public.brands add constraint brands_category_check
  check (category in ('restaurant','apparel','supplements','equipment','accessories','nutrition','other'));
alter table public.brands add column if not exists city text check (city is null or char_length(btrim(city)) between 2 and 40);

alter table public.brand_products
  add column if not exists kcal integer check (kcal is null or kcal between 0 and 5000),
  add column if not exists protein_g numeric(6,1) check (protein_g is null or protein_g between 0 and 500),
  add column if not exists carbs_g numeric(6,1) check (carbs_g is null or carbs_g between 0 and 1000),
  add column if not exists fat_g numeric(6,1) check (fat_g is null or fat_g between 0 and 500);

-- طبق من مطعم شريك ينسجل في سجل الأكل بمصدر «store»
alter table public.food_logs drop constraint if exists food_logs_source_check;
alter table public.food_logs add constraint food_logs_source_check
  check (source in ('db','custom','plan','barcode','photo','store'));

-- ---------- مراكز العلاج الطبيعي والاستشفاء ----------
create table public.recovery_centers (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid unique references public.profiles(id) on delete cascade,  -- فاضي = مدرج من أرك من الموقع الرسمي
  listed_by    text not null default 'owner' check (listed_by in ('owner','arq')),
  name         text not null check (char_length(btrim(name)) between 2 and 80),
  name_en      text check (name_en is null or char_length(btrim(name_en)) between 2 and 80),
  kind         text not null default 'physio' check (kind in ('physio','recovery','sports_medicine','hospital')),
  cities       text[] not null default '{}' check (cardinality(cities) between 1 and 12),
  services     text[] not null default '{}' check (cardinality(services) <= 14 and services <@ array[
                 'sports_injury','manual_therapy','post_op','dry_needling','massage','cupping','cryotherapy','hydrotherapy',
                 'sauna','compression','hbot','home_visits','women_health','performance']::text[]),
  description  text check (char_length(description) <= 600),
  phone        text check (phone is null or phone ~ '^\+?[0-9 ]{6,20}$'),
  whatsapp     text check (whatsapp is null or whatsapp ~ '^[0-9]{8,15}$'),
  website      text check (website is null or website ~* '^https://[^\s]+$'),
  instagram    text check (instagram is null or instagram ~ '^[A-Za-z0-9_.]{1,30}$'),
  logo_path    text check (logo_path is null or char_length(logo_path) <= 200),
  license_no   text check (license_no is null or char_length(btrim(license_no)) between 3 and 40),
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note  text check (char_length(review_note) <= 300),
  created_at   timestamptz not null default now(),
  check (listed_by = 'arq' or owner is not null)
);
create index on public.recovery_centers (status, kind);

-- صاحب المركز ما يغيّر حالة المراجعة، ولو كان مرفوض وعدّل يرجع «قيد المراجعة»
create or replace function public._rc_guard()
returns trigger language plpgsql as $$
begin
  if current_user not in ('authenticated','anon') or is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.owner := auth.uid(); new.listed_by := 'owner'; new.status := 'pending'; new.review_note := null;
  else
    if new.owner is distinct from old.owner or new.listed_by is distinct from old.listed_by or new.review_note is distinct from old.review_note then
      raise exception 'status_locked';
    end if;
    if old.status = 'rejected' then new.status := 'pending';
    elsif new.status is distinct from old.status then raise exception 'status_locked';
    end if;
  end if;
  return new;
end $$;
create trigger rc_guard before insert or update on public.recovery_centers for each row execute function public._rc_guard();

-- إشعار المالك لما يوصل مركز جديد أو يرجع بعد التعديل
create or replace function public._rc_submitted() returns trigger language plpgsql security definer set search_path = public as $$
declare v_a uuid;
begin
  if new.status = 'pending' and new.listed_by = 'owner' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    for v_a in select user_id from app_admins loop
      perform _notice(v_a, 'rc:' || new.id || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
        'مركز علاج طبيعي ينتظر اعتمادك', new.name || ' طلب ينضم لدليل الاستشفاء. راجعه من لوحة المالك.',
        'Recovery center to review', coalesce(new.name_en, new.name) || ' asked to join the recovery directory. Review it in the owner panel.',
        '/owner', new.id);
    end loop;
  end if;
  return new;
end $$;
create trigger rc_submitted after insert or update on public.recovery_centers for each row execute function public._rc_submitted();

-- مركز واحد لكل حساب، وحد للطلبات
create or replace function public._rc_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.listed_by = 'owner' and (select count(*) from recovery_centers where owner = new.owner) >= 1 then raise exception 'duplicate'; end if;
  return new;
end $$;
create trigger rc_limit before insert on public.recovery_centers for each row execute function public._rc_limit();

-- اعتماد أو رفض من المالك
create or replace function public.review_center(p_id uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_c recovery_centers; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'bad_status'; end if;
  if p_decision = 'rejected' and v_note is null and exists (select 1 from recovery_centers where id = p_id and listed_by = 'owner') then
    raise exception 'consent_required';
  end if;
  update recovery_centers set status = p_decision, review_note = left(v_note, 300) where id = p_id returning * into v_c;
  if v_c.id is null then raise exception 'request_not_found'; end if;
  if v_c.owner is not null then
    if p_decision = 'approved' then
      perform _notice(v_c.owner, 'rcr:' || p_id || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
        'انعتمد مركزك ✓', v_c.name || ' صار ظاهر في دليل الاستشفاء لكل مستخدمي أرك.',
        'Your center is approved ✓', coalesce(v_c.name_en, v_c.name) || ' now appears in the ARQ recovery directory.', '/recovery/centers', p_id);
    else
      perform _notice(v_c.owner, 'rcr:' || p_id || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
        'طلب مركزك يحتاج تعديل', coalesce(v_note, 'راجع بيانات المركز وأرسله مرة ثانية.'),
        'Your center needs changes', coalesce(v_note, 'Review your center details and submit again.'), '/recovery/join', p_id);
    end if;
  end if;
end $$;
revoke all on function public.review_center(uuid, text, text) from public, anon;
grant execute on function public.review_center(uuid, text, text) to authenticated;

alter table public.recovery_centers enable row level security;
create policy rc_read on public.recovery_centers for select to authenticated using (status = 'approved' or owner = auth.uid() or is_admin());
create policy rc_insert on public.recovery_centers for insert to authenticated with check (owner = auth.uid() or is_admin());
create policy rc_update on public.recovery_centers for update to authenticated using (owner = auth.uid() or is_admin()) with check (owner = auth.uid() or is_admin());
create policy rc_delete on public.recovery_centers for delete to authenticated using (owner = auth.uid() or is_admin());

-- دليل أولي من المواقع الرسمية للمراكز (بدون شعارات، ويظهر عليها «من الموقع الرسمي» لين تنضم كشريك)
insert into public.recovery_centers (listed_by, status, name, name_en, kind, cities, services, phone, whatsapp, website, instagram)
select 'arq', 'approved', v.name, v.name_en, v.kind, v.cities, v.services, v.phone, v.whatsapp, v.website, v.instagram
from (values
  ('فيزيوثيرابيا', 'PhysioTherabia', 'physio', array['الرياض','جدة','مكة','المدينة','الدمام','الخبر','الجبيل','ينبع','تبوك','الطائف'],
     array['sports_injury','post_op','cryotherapy','hydrotherapy','hbot','home_visits'], null, null, 'https://physiotherabia.com', 'physiotherabia'),
  ('فيزيوتريو', 'PhysioTrio', 'physio', array['الرياض','مكة'], array['sports_injury','manual_therapy','performance','women_health'],
     '8001000246', '9668001000246', 'https://physiotrio.sa', null),
  ('مراكز الأخصائيون للعلاج الطبيعي', 'Physical Therapists Center (PTC)', 'physio', array['الرياض'], array['sports_injury','post_op','performance'],
     '920018825', '966559420841', 'https://ptcsaudi.com', 'PTCSaudi'),
  ('عيادات جوينت', 'Joint Clinic', 'physio', array['الرياض'], array['sports_injury','post_op','performance'],
     '920005342', '966920005342', 'https://joint.clinic', 'jointclinic_sa'),
  ('المركز التشيكي للعلاج الطبيعي والتأهيلي', 'Czech Rehabilitation Center', 'physio', array['الرياض'], array['manual_therapy','post_op'],
     '920002737', null, 'https://www.cz-center.com', null),
  ('موف للطب الرياضي', 'MOVE Comprehensive Sports Medicine', 'sports_medicine', array['الرياض'], array['sports_injury','performance','post_op'],
     '920009298', '966920009298', 'https://move.med.sa', 'move_csm'),
  ('فيزيوويل', 'PhysioWell', 'physio', array['الرياض'], array['sports_injury','manual_therapy','women_health','performance'],
     '+966507937685', null, 'https://physiowell.sa', 'physiowell.sa'),
  ('فيزيو برايم', 'Physio Prime', 'physio', array['الرياض'], array['sports_injury','post_op','hydrotherapy'],
     '+966500442164', '966500442164', 'https://physioprimecare.com', 'physioprimesa'),
  ('المركز التأهيلي الدولي للعلاج الطبيعي', 'International Rehabilitation Physiotherapy Center', 'physio', array['جدة'], array['manual_therapy','sports_injury'],
     '+966506673533', null, 'https://www.ipcjeddah.com', 'ipcjeddah'),
  ('عيادة خبراء الجسد', 'BE Clinic', 'physio', array['جدة'], array['sports_injury','post_op','women_health'],
     null, '966550145991', 'https://beclinic.sa', null),
  ('شفت كلينكس', 'Shift Clinics', 'physio', array['جدة'], array['manual_therapy','sports_injury'],
     '+966552129400', '966552129400', 'https://www.shiftclinics.com', 'shiftclinics'),
  ('مركز التميز للعلاج الطبيعي', 'Al-Tamayuz Physical Therapy Center', 'physio', array['الدمام'], array['dry_needling','massage','cupping','sports_injury','women_health'],
     '+966558118228', '966558118228', 'https://attamayuzph.com', null),
  ('عيادات تعافي', 'Recovery Center', 'physio', array['أبها'], array['sports_injury','post_op'],
     '+966172210111', '966172210111', 'https://recovery.sa', 'rcentersa'),
  ('مركز إيكو', 'ECHO Center', 'recovery', array['الرياض'], array['performance','massage','sports_injury'],
     '+966539643339', '966539643339', 'https://echocenter.sa', null),
  ('كرايو إنفينيتي جدة', 'Cryo Infinity Jeddah', 'recovery', array['جدة'], array['cryotherapy','hbot','sauna','compression'],
     '+966555082562', '966555082562', 'https://cryoinfinityjeddah.com', 'cryoinfinityjeddah'),
  ('لونجيفيتي ويلنس هب', 'Longevity Wellness Hub', 'recovery', array['الرياض'], array['cryotherapy','sauna','hbot'],
     '+966554488824', null, 'https://www.longevity-hub.io', 'longevity.hub.ksa'),
  ('مستشفى كينجز كوليدج لندن - جدة (الطب الرياضي)', 'King''s College Hospital London – Jeddah (Sports Medicine)', 'sports_medicine', array['جدة'], array['sports_injury','post_op'],
     '+966920066668', '966545907276', 'https://kch.sa/en/specialties/orthopaedics/sports-medicine', 'kchlsaudi'),
  ('السعودي الألماني الصحية - العلاج الطبيعي', 'Saudi German Health – Physiotherapy', 'hospital', array['جدة','الرياض','مكة','المدينة','الدمام','حائل','أبها'], array['sports_injury','post_op'],
     '+966920007997', '966920007997', 'https://saudigermanhealth.com/en/department/physiotherapy-rehabilitation', 'sgh.group'),
  ('مستشفى الدكتور سليمان فقيه - العلاج الطبيعي', 'Dr. Soliman Fakeeh Hospital – Physiotherapy', 'hospital', array['الرياض','جدة'], array['post_op','manual_therapy','hydrotherapy','sports_injury'],
     '8001209999', '966920012777', 'https://en.dsfhriyadh.fakeeh.care/specialties/physiotherapy-and-rehabilitation', 'fakeeh.care'),
  ('مجموعة العبير الطبية - العلاج الطبيعي', 'Abeer Medical Group – Physiotherapy', 'hospital', array['جدة','الرياض','الدمام'], array['sports_injury','post_op'],
     '+966920015888', null, 'https://www.abeergroup.com/ksa/Services/Physiotherapy.aspx', 'abeerhc')
) as v(name, name_en, kind, cities, services, phone, whatsapp, website, instagram)
where not exists (select 1 from public.recovery_centers r where r.listed_by = 'arq' and r.name_en = v.name_en);


-- ===================== 20260929000560_meal_subscriptions.sql =====================
-- =====================================================================
-- اشتراك الوجبات مع المطاعم الصحية:
-- المستخدم يطلب اشتراك ويوافق صراحةً إن المطعم يشوف أهدافه الغذائية فقط (السعرات والماكروز وتوزيع الوجبات وملاحظاته)
-- المطعم يقبل ويجدول الوجبات يوم بيوم من منيوه، والوجبات تنزل في جدول وجبات المستخدم
-- إنهاء الاشتراك يقطع وصول المطعم فوراً
-- =====================================================================
create table public.meal_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  brand_id    uuid not null references public.brands(id) on delete cascade,
  status      text not null default 'requested' check (status in ('requested','active','declined','ended')),
  consent_at  timestamptz not null default now(),
  slots       text[] not null default '{lunch,dinner}' check (cardinality(slots) between 1 and 4 and slots <@ array['breakfast','lunch','snack','dinner']::text[]),
  notes       text check (char_length(notes) <= 300),
  starts_on   date not null default app_today(),
  ended_at    timestamptz,
  created_at  timestamptz not null default now()
);
create unique index meal_sub_open on public.meal_subscriptions (user_id, brand_id) where status in ('requested','active');
create index on public.meal_subscriptions (brand_id, status);

create table public.subscription_meals (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.meal_subscriptions(id) on delete cascade,
  day             date not null,
  slot            text not null check (slot in ('breakfast','lunch','snack','dinner')),
  product_id      uuid references public.brand_products(id) on delete set null,
  name            text not null check (char_length(btrim(name)) between 2 and 80),
  kcal            integer not null check (kcal between 0 and 5000),
  protein_g       numeric(6,1) not null default 0 check (protein_g between 0 and 500),
  carbs_g         numeric(6,1) not null default 0 check (carbs_g between 0 and 1000),
  fat_g           numeric(6,1) not null default 0 check (fat_g between 0 and 500),
  created_at      timestamptz not null default now()
);
create index on public.subscription_meals (subscription_id, day);

-- طرف في الاشتراك (المشترك أو صاحب المطعم)
create or replace function public.sub_party(p_sub uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from meal_subscriptions s join brands b on b.id = s.brand_id
                 where s.id = p_sub and (s.user_id = auth.uid() or b.owner = auth.uid()));
$$;
-- صاحب المطعم واشتراك فعّال
create or replace function public.sub_kitchen(p_sub uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from meal_subscriptions s join brands b on b.id = s.brand_id
                 where s.id = p_sub and s.status = 'active' and b.owner = auth.uid());
$$;
revoke all on function public.sub_party(uuid), public.sub_kitchen(uuid) from public, anon;
grant execute on function public.sub_party(uuid), public.sub_kitchen(uuid) to authenticated;

alter table public.meal_subscriptions enable row level security;
alter table public.subscription_meals enable row level security;
create policy ms_read on public.meal_subscriptions for select to authenticated using (user_id = auth.uid() or owns_brand(brand_id));
create policy sm_read on public.subscription_meals for select to authenticated using (sub_party(subscription_id));
create policy sm_write on public.subscription_meals for insert to authenticated with check (sub_kitchen(subscription_id));
create policy sm_update on public.subscription_meals for update to authenticated using (sub_kitchen(subscription_id)) with check (sub_kitchen(subscription_id));
create policy sm_delete on public.subscription_meals for delete to authenticated using (sub_kitchen(subscription_id));

-- حد معقول: ٨ وجبات باليوم لكل اشتراك
create or replace function public._sm_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from subscription_meals where subscription_id = new.subscription_id and day = new.day) >= 8 then
    raise exception 'too_many_rows';
  end if;
  return new;
end $$;
create trigger sm_limit before insert on public.subscription_meals for each row execute function public._sm_limit();

-- طلب اشتراك: لازم مطعم معتمد، وموافقة صريحة على مشاركة الأهداف
create or replace function public.request_meal_subscription(p_brand uuid, p_slots text[], p_notes text, p_consent boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_b brands; v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not coalesce(p_consent, false) then raise exception 'consent_required'; end if;
  select * into v_b from brands where id = p_brand;
  if v_b.id is null or v_b.status <> 'approved' or v_b.category <> 'restaurant' then raise exception 'brand_not_approved'; end if;
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

-- رد المطعم على الطلب
create or replace function public.respond_meal_subscription(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_s meal_subscriptions; v_b brands;
begin
  select * into v_s from meal_subscriptions where id = p_id;
  select * into v_b from brands where id = v_s.brand_id;
  if v_s.id is null or v_b.owner is distinct from auth.uid() then raise exception 'not_allowed'; end if;
  if v_s.status <> 'requested' then raise exception 'bad_status'; end if;
  update meal_subscriptions set status = case when p_accept then 'active' else 'declined' end,
         ended_at = case when p_accept then null else now() end where id = p_id;
  perform _notice(v_s.user_id, 'msr:' || p_id,
    case when p_accept then 'اشتراكك مع ' || v_b.name || ' صار فعّال ✓' else v_b.name || ' اعتذر عن الاشتراك' end,
    case when p_accept then 'وجباتك من المطعم بتنزل في جدول وجباتك بخطتي.' else 'تقدر تشوف مطاعم صحية ثانية في المتاجر.' end,
    case when p_accept then 'Your subscription with ' || v_b.name || ' is active ✓' else v_b.name || ' declined the subscription' end,
    case when p_accept then 'Meals from the restaurant will appear in your plan.' else 'You can browse other healthy restaurants in Stores.' end,
    '/(tabs)/plan', p_id);
end $$;

-- إنهاء الاشتراك (المشترك أو المطعم): يوقف مشاركة الأهداف فوراً
create or replace function public.end_meal_subscription(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_s meal_subscriptions; v_b brands;
begin
  select * into v_s from meal_subscriptions where id = p_id;
  select * into v_b from brands where id = v_s.brand_id;
  if v_s.id is null or (v_s.user_id <> auth.uid() and v_b.owner is distinct from auth.uid()) then raise exception 'not_allowed'; end if;
  if v_s.status not in ('requested','active') then return; end if;
  update meal_subscriptions set status = 'ended', ended_at = now() where id = p_id;
  if auth.uid() = v_s.user_id then
    perform _notice(v_b.owner, 'mse:' || p_id, 'انتهى اشتراك', _person_label(v_s.user_id) || ' أنهى اشتراك الوجبات، وتوقفت مشاركة أهدافه معكم.',
      'Subscription ended', _person_label(v_s.user_id) || ' ended their meal subscription; their targets are no longer shared.', '/store/manage', p_id);
  else
    perform _notice(v_s.user_id, 'mse:' || p_id, v_b.name || ' أنهى اشتراك الوجبات', 'توقفت مشاركة أهدافك معهم.',
      v_b.name || ' ended the meal subscription', 'Your targets are no longer shared with them.', '/(tabs)/plan', p_id);
  end if;
end $$;

-- المشتركين للمطعم: الأهداف الغذائية فقط وبس للطلبات والاشتراكات الفعالة
create or replace function public.restaurant_subscribers(p_brand uuid)
returns table (id uuid, status text, slots text[], notes text, starts_on date, created_at timestamptz,
               name text, avatar_url text, calories int, protein_g int, carbs_g int, fat_g int)
language sql stable security definer set search_path = public as $$
  select s.id, s.status, s.slots, s.notes, s.starts_on, s.created_at,
         coalesce(nullif(p.full_name, ''), p.username), p.avatar_url,
         (pl.data->'targets'->>'calories')::numeric::int, (pl.data->'targets'->>'protein_g')::numeric::int,
         (pl.data->'targets'->>'carbs_g')::numeric::int, (pl.data->'targets'->>'fat_g')::numeric::int
  from meal_subscriptions s
  join brands b on b.id = s.brand_id and b.owner = auth.uid()
  join profiles p on p.id = s.user_id
  left join plans pl on pl.user_id = s.user_id and pl.active
  where s.brand_id = p_brand and s.status in ('requested','active')
  order by (s.status = 'requested') desc, s.created_at desc
  limit 200;
$$;

revoke all on function public.request_meal_subscription(uuid, text[], text, boolean), public.respond_meal_subscription(uuid, boolean),
  public.end_meal_subscription(uuid), public.restaurant_subscribers(uuid) from public, anon;
grant execute on function public.request_meal_subscription(uuid, text[], text, boolean), public.respond_meal_subscription(uuid, boolean),
  public.end_meal_subscription(uuid), public.restaurant_subscribers(uuid) to authenticated;


-- ===================== 20260929000570_partner_control.sql =====================
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


-- ===================== 20260929000580_launch_ads.sql =====================
-- إعلان البداية: صفحة تظهر أول ما يفتح التطبيق (صورة أو GIF) مع زر إغلاق وتخطي.
-- المالك يتحكم فيها من لوحته: يضيف، يوقف، يحدد المدة والجمهور وعدد مرات الظهور.
-- ثلاث أنواع: 'ad' إعلان تسويقي (يظهر عليه «إعلان»)، 'awareness' رسالة توعوية، و 'occasion' تهنئة بمناسبة (اليوم الوطني مثلاً).
-- التوعوي والمناسبات بدون كلمة «إعلان»، ومفصولة عن التسويقي في لوحة المالك.
-- الفيديو يجي لاحقاً مع نسخة جديدة من المتجر (يحتاج مكتبة أصلية).

create table if not exists public.launch_ads (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'ad' check (kind in ('ad','awareness','occasion')),
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


-- ===================== 20260929000590_watch_push.sql =====================
-- إشعارات أوضح على الجوال والساعة:
-- • threadId يجمّع الإشعارات: كل محادثة لحالها، وباقي الأنواع حسب فئتها (عروض، نشاط…)
-- • categoryId 'message' يضيف زر «رد» (يشتغل من الساعة بالإملاء أو الردود الجاهزة)
-- • الإعجابات «هادئة» (passive): توصل للقائمة بدون ما تهز الساعة أو تشغّل الشاشة
-- الإضافات لكل نوع (دالة بحتة عشان تتختبر)
create or replace function public._push_extras(p_kind text, p_actor uuid)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object('threadId',
           case when p_kind = 'message' and p_actor is not null then 'chat-' || p_actor::text else _notif_category(p_kind) end)
      || case when p_kind = 'message' then jsonb_build_object('categoryId', 'message') else '{}'::jsonb end
      || case when p_kind in ('post_like','checkin_like') then jsonb_build_object('interruptionLevel', 'passive') else '{}'::jsonb end;
$$;
revoke all on function public._push_extras(text, uuid) from public, anon, authenticated;

create or replace function public._push(p_user uuid, p_kind text, p_actor uuid, p_data jsonb, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_loc text; v_prefs jsonb; v_badge integer; v_txt text[]; v_msgs jsonb; v_extra jsonb;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return; end if;
  if not exists (select 1 from push_tokens where user_id = p_user) then return; end if;
  select locale, notify_prefs into v_loc, v_prefs from profiles where id = p_user;
  if not found or coalesce((v_prefs->>_notif_category(p_kind))::boolean, true) = false then return; end if;

  v_txt := _notif_text(p_kind, _display_name(p_actor), p_data, v_loc);
  v_badge := (select count(*) from notifications where user_id = p_user and read_at is null)
           + (select count(*) from messages where recipient = p_user and read_at is null);
  v_extra := _push_extras(p_kind, p_actor);
  select jsonb_agg(jsonb_build_object(
           'to', t.token, 'title', left(v_txt[1], 120), 'body', left(v_txt[2], 240),
           'data', jsonb_build_object('url', p_url, 'kind', p_kind),
           'sound', 'default', 'badge', v_badge, 'channelId', 'default', 'priority', 'high') || v_extra)
    into v_msgs from push_tokens t where t.user_id = p_user;
  if v_msgs is null then return; end if;

  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 8000)'
    using 'https://exp.host/--/api/v2/push/send', v_msgs,
          '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb;
exception when others then
  -- الإشعار للجوال إضافة: ما نوقف العملية الأصلية (إعجاب، رسالة…) لو فشل
  raise warning 'push failed: %', sqlerrm;
end $$;



-- ===================== 20260929000600_admin_panel_name.sql =====================
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


-- ===================== 20260929000610_club_likes.sql =====================
-- الإعجاب في صفحة النادي: إعجاب بالنادي نفسه (فرع أو سلسلة) وإعجاب بتعليقات الأعضاء (التقييمات)،
-- وقائمة تعليقات السلسلة كاملة (كل الفروع) بنفس شكل تعليقات الفرع مع عدد الإعجابات

-- ---------- الإعجاب بالنادي ----------
create table if not exists public.club_likes (
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  gym_id     uuid references public.gyms(id) on delete cascade,
  chain_id   uuid references public.gym_chains(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint club_likes_one_target check ((gym_id is null) <> (chain_id is null))
);
create unique index if not exists club_likes_gym_uq on public.club_likes (gym_id, user_id) where gym_id is not null;
create unique index if not exists club_likes_chain_uq on public.club_likes (chain_id, user_id) where chain_id is not null;
alter table public.club_likes enable row level security;
-- كل واحد يشوف إعجاباته بس، والتغيير من الدالة تحت (ما فيه كتابة مباشرة)
drop policy if exists cl_read_own on public.club_likes;
create policy cl_read_own on public.club_likes for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.club_likes from authenticated, anon;

create or replace function public.club_like_state(p_gym uuid default null, p_chain uuid default null)
returns table (likes integer, liked boolean)
language sql stable security definer set search_path = public as $$
  select (select count(*) from club_likes l where (p_gym is not null and l.gym_id = p_gym) or (p_chain is not null and l.chain_id = p_chain))::int,
         exists (select 1 from club_likes l where l.user_id = auth.uid()
                 and ((p_gym is not null and l.gym_id = p_gym) or (p_chain is not null and l.chain_id = p_chain)));
$$;
revoke all on function public.club_like_state(uuid, uuid) from public, anon;
grant execute on function public.club_like_state(uuid, uuid) to authenticated;

create or replace function public.toggle_club_like(p_gym uuid default null, p_chain uuid default null)
returns table (likes integer, liked boolean)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if (p_gym is null) = (p_chain is null) then raise exception 'bad_target'; end if;
  if p_gym is not null and not exists (select 1 from gyms where id = p_gym) then raise exception 'not_found'; end if;
  if p_chain is not null and not exists (select 1 from gym_chains where id = p_chain) then raise exception 'not_found'; end if;
  if exists (select 1 from club_likes l where l.user_id = auth.uid() and (l.gym_id = p_gym or l.chain_id = p_chain)) then
    delete from club_likes l where l.user_id = auth.uid() and (l.gym_id = p_gym or l.chain_id = p_chain);
  else
    insert into club_likes (user_id, gym_id, chain_id) values (auth.uid(), p_gym, p_chain);
  end if;
  return query select * from club_like_state(p_gym, p_chain);
end $$;
revoke all on function public.toggle_club_like(uuid, uuid) from public, anon;
grant execute on function public.toggle_club_like(uuid, uuid) to authenticated;

-- ---------- الإعجاب بتعليقات الأعضاء ----------
create table if not exists public.review_likes (
  gym_id     uuid not null,
  reviewer   uuid not null,
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (gym_id, reviewer, user_id),
  foreign key (gym_id, reviewer) references public.gym_reviews(gym_id, user_id) on delete cascade
);
create index if not exists review_likes_review_idx on public.review_likes (gym_id, reviewer);
alter table public.review_likes enable row level security;
drop policy if exists rl_read_own on public.review_likes;
create policy rl_read_own on public.review_likes for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.review_likes from authenticated, anon;

create or replace function public.toggle_review_like(p_gym uuid, p_reviewer uuid)
returns table (likes integer, liked boolean)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from gym_reviews where gym_id = p_gym and user_id = p_reviewer) then raise exception 'not_found'; end if;
  if p_reviewer = auth.uid() then raise exception 'own_review'; end if;
  if exists (select 1 from review_likes where gym_id = p_gym and reviewer = p_reviewer and user_id = auth.uid()) then
    delete from review_likes where gym_id = p_gym and reviewer = p_reviewer and user_id = auth.uid();
  else
    insert into review_likes (gym_id, reviewer, user_id) values (p_gym, p_reviewer, auth.uid());
  end if;
  return query
    select (select count(*) from review_likes where gym_id = p_gym and reviewer = p_reviewer)::int,
           exists (select 1 from review_likes where gym_id = p_gym and reviewer = p_reviewer and user_id = auth.uid());
end $$;
revoke all on function public.toggle_review_like(uuid, uuid) from public, anon;
grant execute on function public.toggle_review_like(uuid, uuid) to authenticated;

-- ---------- تعليقات الفرع: نفس السابق + عدد الإعجابات وإعجابي ----------
-- (نوع النتيجة تغيّر، فنحذف الدالة ونرجّعها)
drop function if exists public.gym_reviews_full(uuid);
create function public.gym_reviews_full(p_gym uuid)
returns table (user_id uuid, username text, full_name text, avatar_url text, points integer, rating smallint, body text,
               updated_at timestamptz, visited boolean, is_me boolean,
               f_clean smallint, f_equipment smallint, f_crowd smallint, f_coaches smallint, f_staff smallint,
               reply text, reply_at timestamptz, can_reply boolean, likes integer, liked boolean)
language sql stable security definer set search_path = public as $$
  select r.user_id, p.username, p.full_name, p.avatar_url, p.points, r.rating, r.body, r.updated_at,
         exists (select 1 from check_ins c where c.user_id = r.user_id and c.gym_id = r.gym_id),
         r.user_id = auth.uid(),
         r.f_clean, r.f_equipment, r.f_crowd, r.f_coaches, r.f_staff,
         rr.body, rr.updated_at, can_manage_gym_or_chain(p_gym),
         (select count(*) from review_likes l where l.gym_id = r.gym_id and l.reviewer = r.user_id)::int,
         exists (select 1 from review_likes l where l.gym_id = r.gym_id and l.reviewer = r.user_id and l.user_id = auth.uid())
  from gym_reviews r join profiles p on p.id = r.user_id
  left join gym_review_replies rr on rr.gym_id = r.gym_id and rr.user_id = r.user_id
  where r.gym_id = p_gym
  order by (r.user_id = auth.uid()) desc,
           exists (select 1 from check_ins c where c.user_id = r.user_id and c.gym_id = r.gym_id) desc,
           r.updated_at desc
  limit 200;
$$;
revoke all on function public.gym_reviews_full(uuid) from public, anon;
grant execute on function public.gym_reviews_full(uuid) to authenticated;

-- ---------- تعليقات السلسلة: كل الفروع مع اسم الفرع ----------
create or replace function public.chain_reviews_full(p_chain uuid)
returns table (gym_id uuid, gym_name text, gym_name_en text, user_id uuid, username text, full_name text, avatar_url text, points integer,
               rating smallint, body text, updated_at timestamptz, visited boolean, is_me boolean,
               f_clean smallint, f_equipment smallint, f_crowd smallint, f_coaches smallint, f_staff smallint,
               reply text, reply_at timestamptz, can_reply boolean, likes integer, liked boolean)
language sql stable security definer set search_path = public as $$
  select r.gym_id, g.name, g.name_en, r.user_id, p.username, p.full_name, p.avatar_url, p.points, r.rating, r.body, r.updated_at,
         exists (select 1 from check_ins c where c.user_id = r.user_id and c.gym_id = r.gym_id),
         r.user_id = auth.uid(),
         r.f_clean, r.f_equipment, r.f_crowd, r.f_coaches, r.f_staff,
         rr.body, rr.updated_at, can_manage_gym_or_chain(r.gym_id),
         (select count(*) from review_likes l where l.gym_id = r.gym_id and l.reviewer = r.user_id)::int,
         exists (select 1 from review_likes l where l.gym_id = r.gym_id and l.reviewer = r.user_id and l.user_id = auth.uid())
  from gym_reviews r join gyms g on g.id = r.gym_id join profiles p on p.id = r.user_id
  left join gym_review_replies rr on rr.gym_id = r.gym_id and rr.user_id = r.user_id
  where g.chain_id = p_chain
  order by (r.user_id = auth.uid()) desc,
           exists (select 1 from check_ins c where c.user_id = r.user_id and c.gym_id = r.gym_id) desc,
           r.updated_at desc
  limit 200;
$$;
revoke all on function public.chain_reviews_full(uuid) from public, anon;
grant execute on function public.chain_reviews_full(uuid) to authenticated;


-- ===================== 20260929000620_local_events.sql =====================
-- البطولات والفعاليات المحلية: ماراثون الرياض، كأس السعودية للخيل، الهايكنج، الرماية، الملاكمة، رياضة المحركات…
-- إدارة التطبيق تضيفها وتعدّلها من لوحتها، والمستخدمين يشوفونها في مربع «البطولات» جنب المتاجر.
-- التاريخ اختياري (للأنشطة المستمرة)، و date_note يظهر بدل التاريخ لو الموعد تقريبي («نهاية يناير، يُعلن لاحقاً»).
create table if not exists public.local_events (
  id           uuid primary key default gen_random_uuid(),
  category     text not null default 'other'
                 check (category in ('running','horse_racing','hiking','shooting','boxing','motorsport','cycling','football','other')),
  title        text not null check (char_length(btrim(title)) between 2 and 90),
  title_en     text check (title_en is null or char_length(title_en) <= 90),
  city         text check (city is null or char_length(city) <= 40),
  city_en      text check (city_en is null or char_length(city_en) <= 40),
  venue        text check (venue is null or char_length(venue) <= 90),
  venue_en     text check (venue_en is null or char_length(venue_en) <= 90),
  starts_on    date,
  ends_on      date,
  date_note    text check (date_note is null or char_length(date_note) <= 80),
  date_note_en text check (date_note_en is null or char_length(date_note_en) <= 80),
  summary      text check (summary is null or char_length(summary) <= 500),
  summary_en   text check (summary_en is null or char_length(summary_en) <= 500),
  url          text check (url is null or (char_length(url) <= 300 and url like 'https://%')),
  image_path   text check (image_path is null or char_length(image_path) <= 200),
  featured     boolean not null default false,
  active       boolean not null default true,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index if not exists local_events_date_idx on public.local_events (active, starts_on);
alter table public.local_events enable row level security;
-- المستخدم يشوف الفعّال، وإدارة التطبيق تشوف الكل وتعدّل
drop policy if exists local_events_read on public.local_events;
create policy local_events_read on public.local_events for select to authenticated using (active or is_admin());
drop policy if exists local_events_admin_write on public.local_events;
create policy local_events_admin_write on public.local_events for all to authenticated using (is_admin()) with check (is_admin());

create or replace function public._local_events_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, auth.uid()); end if;
  return new;
end $$;
drop trigger if exists local_events_touch on public.local_events;
create trigger local_events_touch before insert or update on public.local_events
  for each row execute function public._local_events_touch();

-- كل إضافة أو تعديل أو حذف ينحفظ في سجل الإدارة
create or replace function public._local_events_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then perform _admin_log('event', old.id::text, 'delete', old.title); return old; end if;
  perform _admin_log('event', new.id::text,
    case when tg_op = 'INSERT' then 'create'
         when new.active is distinct from old.active then case when new.active then 'show' else 'hide' end
         else 'edit' end, new.title);
  return new;
end $$;
drop trigger if exists local_events_log on public.local_events;
create trigger local_events_log after insert or update or delete on public.local_events
  for each row execute function public._local_events_log();

-- صور الفعاليات: قراءة عامة، والرفع والحذف لإدارة التطبيق فقط
insert into storage.buckets (id, name, public) values ('events', 'events', true) on conflict (id) do nothing;
drop policy if exists "admin write events" on storage.objects;
create policy "admin write events" on storage.objects for insert to authenticated
  with check (bucket_id = 'events' and public.is_admin());
drop policy if exists "admin update events" on storage.objects;
create policy "admin update events" on storage.objects for update to authenticated
  using (bucket_id = 'events' and public.is_admin());
drop policy if exists "admin delete events" on storage.objects;
create policy "admin delete events" on storage.objects for delete to authenticated
  using (bucket_id = 'events' and public.is_admin());
drop policy if exists "admin list events" on storage.objects;
create policy "admin list events" on storage.objects for select to authenticated
  using (bucket_id = 'events' and public.is_admin());

-- ---------- أول القائمة (من المصادر الرسمية، سبتمبر 2026) ----------
-- المواعيد غير المؤكدة لها ملاحظة تظهر بدل التاريخ، وإدارة التطبيق تحدّثها لما تنعلن
insert into public.local_events (id, category, title, title_en, city, city_en, venue, venue_en, starts_on, ends_on, date_note, date_note_en,
                                 summary, summary_en, url, featured) values
 ('e0e0e0e0-0000-4000-8000-000000000001', 'running', 'ماراثون الرياض 2027', 'Riyadh Marathon 2027', 'الرياض', 'Riyadh', null, null,
  '2027-01-31', null, 'نهاية يناير 2027 (يُعلن الموعد)', 'Late January 2027 (date to be announced)',
  'ماراثون الرياض السنوي من تنظيم الاتحاد السعودي للرياضة للجميع. المسافات: ماراثون 42.2 كم، نصف ماراثون 21.1 كم، 10 كم، و5 كم للجميع. نسخة 2026 كانت في 31 يناير من جامعة الأميرة نورة.',
  'The annual Riyadh Marathon, organised by the Saudi Sports for All Federation. Distances: marathon 42.2 km, half marathon 21.1 km, 10 km and a 5 km fun run. The 2026 edition ran on 31 January from Princess Nourah University.',
  'https://www.riyadhmarathon.org/', true),
 ('e0e0e0e0-0000-4000-8000-000000000002', 'horse_racing', 'كأس السعودية 2027', 'The Saudi Cup 2027', 'الرياض', 'Riyadh', 'ميدان الملك عبدالعزيز للفروسية', 'King Abdulaziz Racecourse',
  '2027-02-05', '2027-02-06', null, null,
  'النسخة الثامنة من كأس السعودية، من أغلى سباقات الخيل في العالم، على مدى يومين ضمن موسم سباقات الرياض.',
  'The eighth Saudi Cup, one of the richest horse races in the world, over two days of the Riyadh racing season.',
  'https://www.visitsaudi.com/ar/riyadh/events/saudi-cup', true),
 ('e0e0e0e0-0000-4000-8000-000000000003', 'horse_racing', 'موسم سباقات الرياض', 'Riyadh Racing Season', 'الرياض', 'Riyadh', 'ميدان الملك عبدالعزيز للفروسية', 'King Abdulaziz Racecourse',
  '2026-10-16', '2027-04-17', null, null,
  'سباقات كل جمعة وسبت، ومن أبرزها كأس السعودية (5 و6 فبراير) وكأس الملك عبدالعزيز (12 مارس).',
  'Racing every Friday and Saturday, including the Saudi Cup (5–6 February) and the King Abdulaziz Cup (12 March).',
  'https://jcsa.sa/en/news/20260813-riyadh-race-programme', false),
 ('e0e0e0e0-0000-4000-8000-000000000004', 'hiking', 'سباق العلا للمسارات 2027', 'AlUla Trail Race 2027', 'العلا', 'AlUla', null, null,
  '2027-01-22', null, null, null,
  'جري ومشي في مسارات العلا الطبيعية بمسافات تناسب الكل: 100 و50 و23 و10 كم، و3 كم وقت الغروب، وسباق للأطفال.',
  'Running and walking AlUla''s natural trails, with a distance for everyone: 100, 50, 23 and 10 km, a 3 km sunset run and a kids'' race.',
  'https://www.experiencealula.com/en/whats-on/events/alula-trail-race', true),
 ('e0e0e0e0-0000-4000-8000-000000000005', 'hiking', 'الهايكنج مع الاتحاد السعودي للتسلق والهايكنج', 'Hiking with the Saudi Climbing & Hiking Federation', 'مناطق المملكة', 'Across Saudi Arabia', null, null,
  null, null, 'المواعيد تُعلن عند الاتحاد', 'Dates announced by the federation',
  'الجهة الرسمية للتسلق والهايكنج في المملكة. تابع رحلاته وفعالياته في مسارات الرياض والطائف وعسير وغيرها.',
  'The official body for climbing and hiking in Saudi Arabia. Follow its trips and events on trails in Riyadh, Taif, Asir and more.',
  'https://climbing.sa/ar/', false),
 ('e0e0e0e0-0000-4000-8000-000000000006', 'shooting', 'معرض الصقور والصيد السعودي الدولي 2026', 'Saudi Falcons & Hunting Exhibition 2026', 'الرياض', 'Riyadh', 'ملهم', 'Malham',
  '2026-10-01', '2026-10-10', null, null,
  'عشرة أيام للصقور والصيد والرحلات والأسلحة الرياضية. في نسخة 2025 قدّم الاتحاد السعودي للرماية تجربة رماية وتدريباً على أساسيات الرماية الآمنة للزوار.',
  'Ten days of falconry, hunting, outdoor trips and sporting firearms. In 2025 the Saudi Shooting Federation ran a shooting experience with safety basics for visitors.',
  'https://www.visitsaudi.com/en/riyadh/events/international-saudi-falcons-hunting-exhibition', true),
 ('e0e0e0e0-0000-4000-8000-000000000007', 'shooting', 'بطولات الاتحاد السعودي للرماية', 'Saudi Shooting Federation championships', 'المملكة', 'Saudi Arabia', null, null,
  null, null, 'المواعيد تُعلن في حساب الاتحاد', 'Dates announced on the federation''s account',
  'بطولات الرماية الرسمية وبرامج التدريب والتأهيل. تابع الاتحاد لمعرفة البطولات القادمة وطريقة المشاركة.',
  'Official shooting championships and training programmes. Follow the federation for upcoming events and how to take part.',
  'https://x.com/saudishooting', false),
 ('e0e0e0e0-0000-4000-8000-000000000008', 'boxing', 'دورة الألعاب الآسيوية للصالات والفنون القتالية', 'Asian Indoor & Martial Arts Games', 'الرياض', 'Riyadh', null, null,
  '2026-12-13', '2026-12-21', null, null,
  'منافسات آسيوية في الرياض تشمل الملاكمة، والفنون القتالية المختلطة، والمواي تاي، والجودو، والتايكوندو، والكاراتيه، والمصارعة.',
  'Asia-wide competition in Riyadh including boxing, MMA, Muay Thai, judo, taekwondo, karate and wrestling.',
  'https://asianboxing.org/event/6th-asian-indoor-martial-art-games/', true),
 ('e0e0e0e0-0000-4000-8000-000000000009', 'boxing', 'نزالات موسم الرياض 2026', 'Riyadh Season 2026 fight nights', 'الرياض', 'Riyadh', null, null,
  '2026-10-21', null, 'من 21 أكتوبر 2026 (مواعيد النزالات تُعلن)', 'From 21 October 2026 (fight dates to be announced)',
  'موسم الرياض ينطلق 21 أكتوبر 2026، ومعه نزالات ملاكمة ومصارعة كبرى تُعلن مواعيدها خلال الموسم.',
  'Riyadh Season starts on 21 October 2026, with major boxing and wrestling nights announced during the season.',
  'https://www.visitsaudi.com/en/seasons/riyadh-season', false),
 ('e0e0e0e0-0000-4000-8000-000000000010', 'motorsport', 'رالي داكار السعودية 2027', 'Dakar Rally Saudi Arabia 2027', 'رابغ', 'Rabigh', 'مدينة الملك عبدالله الاقتصادية', 'King Abdullah Economic City',
  '2027-01-01', '2027-01-15', null, null,
  'أشهر رالي صحراوي في العالم، ينطلق وينتهي في مدينة الملك عبدالله الاقتصادية، ومساره فيه ثلاث مراحل جديدة.',
  'The world''s best-known desert rally, starting and finishing in King Abdullah Economic City, with three new stages on the route.',
  'https://www.spa.gov.sa/en/N2578312', false),
 ('e0e0e0e0-0000-4000-8000-000000000011', 'motorsport', 'جائزة السعودية الكبرى للفورمولا 1 2027', 'Formula 1 Saudi Arabian Grand Prix 2027', 'جدة', 'Jeddah', 'حلبة كورنيش جدة', 'Jeddah Corniche Circuit',
  '2027-03-19', '2027-03-21', null, null,
  'سباق الفورمولا 1 الليلي على حلبة كورنيش جدة، من أسرع حلبات الشوارع في العالم.',
  'The Formula 1 night race on the Jeddah Corniche Circuit, one of the fastest street circuits in the world.',
  'https://ticketing.formula1.com/saudi-arabia/', false)
on conflict (id) do nothing;


-- ===================== 20260929000630_calorie_alert.sql =====================
-- إعدادات يتحكم فيها المالك من «لوحة إدارة التطبيق»، وأولها نص تنبيه «باقي لك ٢٠٠ سعرة»
-- التنبيه نفسه يطلع من جوال المستخدم بعد ما يسجّل أكله، والمستخدم يشغّله أو يطفيه من مربع السعرات
create table if not exists public.app_settings (
  key         text primary key check (key ~ '^[a-z_]{2,40}$'),
  value       jsonb not null check (jsonb_typeof(value) = 'object' and pg_column_size(value) < 4000),
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);
alter table public.app_settings enable row level security;
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings for select to authenticated using (true);
drop policy if exists app_settings_admin on public.app_settings;
create policy app_settings_admin on public.app_settings for all to authenticated using (is_admin()) with check (is_admin());

-- التحقق من القيم قبل الحفظ (الرقم بين ٥٠ و٥٠٠، والعنوان والنص بالعربي مطلوبة)
create or replace function public._app_settings_guard()
returns trigger language plpgsql set search_path = public as $$
declare v jsonb := new.value; t integer;
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if new.key = 'calorie_alert' then
    begin t := (v->>'threshold')::integer; exception when others then t := null; end;
    if t is null or t < 50 or t > 500 then raise exception 'bad_value'; end if;
    if coalesce(jsonb_typeof(v->'enabled'), '') <> 'boolean' then raise exception 'bad_value'; end if;
    if char_length(btrim(coalesce(v->>'title_ar', ''))) not between 2 and 80
       or char_length(btrim(coalesce(v->>'body_ar', ''))) not between 2 and 200
       or char_length(coalesce(v->>'title_en', '')) > 80 or char_length(coalesce(v->>'body_en', '')) > 200 then
      raise exception 'bad_value';
    end if;
    -- نخزن فقط المفاتيح المعروفة
    new.value := jsonb_build_object('enabled', (v->>'enabled')::boolean, 'threshold', t,
      'title_ar', btrim(v->>'title_ar'), 'body_ar', btrim(v->>'body_ar'),
      'title_en', nullif(btrim(coalesce(v->>'title_en', '')), ''), 'body_en', nullif(btrim(coalesce(v->>'body_en', '')), ''));
  end if;
  return new;
end $$;
drop trigger if exists app_settings_guard on public.app_settings;
create trigger app_settings_guard before insert or update on public.app_settings
  for each row execute function public._app_settings_guard();

create or replace function public._app_settings_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then perform _admin_log('setting', new.key, 'edit', null); end if;
  return new;
end $$;
drop trigger if exists app_settings_log on public.app_settings;
create trigger app_settings_log after insert or update on public.app_settings
  for each row execute function public._app_settings_log();

-- النص الافتراضي: {n} = الباقي، {eaten} = اللي أكله، {goal} = احتياجه
insert into public.app_settings (key, value) values ('calorie_alert', jsonb_build_object(
  'enabled', true, 'threshold', 200,
  'title_ar', 'باقي لك {n} سعرة وتكمّل احتياجك',
  'body_ar', 'أكلت {eaten} من {goal} سعرة اليوم. خل آخر شي تاكله خفيف وفيه بروتين.',
  'title_en', '{n} kcal left to hit your target',
  'body_en', 'You''ve had {eaten} of {goal} kcal today. Keep the last bite light and high in protein.'))
on conflict (key) do nothing;


-- ===================== 20260929000640_bookings.sql =====================
-- =====================================================================
-- حجز الملاعب والحصص: كورة، بادل، تنس، يوقا، بيلاتس
--   * venues: الملعب أو الاستوديو (شريك ينضم بموافقة الإدارة، أو مدرج من أرك من موقعه الرسمي مع زر «احجز من موقعهم»)
--   * venue_courts: ملاعب الكورة والبادل والتنس (الحجز بالوقت حسب ساعات العمل ومدة الحجز)
--   * venue_classes: حصص اليوقا والبيلاتس الأسبوعية (الحجز بالمقعد حسب السعة)
--   * venue_bookings: الحجوزات. ما ينكتب فيها إلا عن طريق الدوال (ما فيه حجزين على نفس الملعب ونفس الوقت)
--   * تنبيه للمستخدم بالموعد أول ما يحجز أو يتأكد حجزه، وتذكير قبل الموعد بساعة، وتنبيه للملعب بكل حجز جديد
--   * الدفع في المكان لين يتفعل الدفع الإلكتروني
-- =====================================================================

-- ---------- نوع الحساب: ملعب أو استوديو ----------
alter table public.profiles drop constraint if exists profiles_account_type_check;
alter table public.profiles add constraint profiles_account_type_check
  check (account_type in ('trainee','club','coach','store','restaurant','center','venue'));

-- ---------- الملاعب والاستوديوهات ----------
create table if not exists public.venues (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid unique references public.profiles(id) on delete cascade,  -- فاضي = مدرج من أرك
  listed_by     text not null default 'owner' check (listed_by in ('owner','arq')),
  sports        text[] not null check (cardinality(sports) between 1 and 5
                  and sports <@ array['football','padel','tennis','yoga','pilates']::text[]),
  name          text not null check (char_length(btrim(name)) between 2 and 80),
  name_en       text check (name_en is null or char_length(btrim(name_en)) between 2 and 80),
  city          text not null check (char_length(btrim(city)) between 2 and 40),
  city_en       text check (city_en is null or char_length(city_en) <= 40),
  district      text check (district is null or char_length(district) <= 60),
  district_en   text check (district_en is null or char_length(district_en) <= 60),
  audience      text check (audience is null or audience in ('men','women','mixed')),
  about         text check (about is null or char_length(about) <= 500),
  about_en      text check (about_en is null or char_length(about_en) <= 500),
  phone         text check (phone is null or phone ~ '^\+?[0-9 ]{6,20}$'),
  maps_url      text check (maps_url is null or (char_length(maps_url) <= 300 and maps_url ~* '^https://[^\s]+$')),
  booking_url   text check (booking_url is null or (char_length(booking_url) <= 300 and booking_url ~* '^https://[^\s]+$')),
  website       text check (website is null or (char_length(website) <= 300 and website ~* '^https://[^\s]+$')),
  instagram     text check (instagram is null or instagram ~ '^[A-Za-z0-9_.]{1,30}$'),
  source_url    text check (source_url is null or (char_length(source_url) <= 300 and source_url ~* '^https://[^\s]+$')),
  image_path    text check (image_path is null or char_length(image_path) <= 200),
  -- الملاعب: ساعات العمل (الإغلاق بعد ١٢ الليل يكتب ٢٥، ٢٦…) ومدة الحجز والسعر
  open_hour     smallint not null default 16 check (open_hour between 0 and 23),
  close_hour    smallint not null default 24 check (close_hour between 1 and 30),
  slot_min      smallint not null default 60 check (slot_min in (30, 60, 90, 120)),
  price_sar     numeric(7,2) check (price_sar is null or price_sar between 0 and 5000),
  auto_confirm  boolean not null default false,
  status        text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  review_note   text check (review_note is null or char_length(review_note) <= 300),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (close_hour > open_hour and close_hour - open_hour <= 24),
  check (listed_by = 'arq' or owner is not null)
);
create index if not exists venues_status_idx on public.venues (status);
create index if not exists venues_sports_idx on public.venues using gin (sports);

create or replace function public.can_manage_venue(p_venue uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_admin() or exists (select 1 from venues where id = p_venue and owner = auth.uid());
$$;

-- صاحب الملعب ما يغيّر حالة المراجعة، ولو كان مرفوض وعدّل يرجع «قيد المراجعة»
create or replace function public._venue_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if current_user not in ('authenticated','anon') or is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.owner := auth.uid(); new.listed_by := 'owner'; new.status := 'pending'; new.review_note := null; new.source_url := null;
  else
    if new.owner is distinct from old.owner or new.listed_by is distinct from old.listed_by
       or new.review_note is distinct from old.review_note or new.source_url is distinct from old.source_url then
      raise exception 'not_allowed';
    end if;
    if old.status = 'rejected' then new.status := 'pending';
    elsif new.status is distinct from old.status then raise exception 'status_locked';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists venue_guard on public.venues;
create trigger venue_guard before insert or update on public.venues for each row execute function public._venue_guard();

-- الإدارة تعرف بكل طلب جديد أو معدّل
create or replace function public._venue_submitted() returns trigger language plpgsql security definer set search_path = public as $$
declare v_a uuid;
begin
  if new.status = 'pending' and new.listed_by = 'owner' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    for v_a in select user_id from app_admins loop
      perform _notice(v_a, 'vn:' || new.id || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
        'ملعب أو استوديو ينتظر اعتمادك', new.name || ' طلب ينضم لحجز الملاعب والحصص. راجعه من لوحة إدارة التطبيق.',
        'Venue to review', coalesce(new.name_en, new.name) || ' asked to join court and class booking. Review it in App management.',
        '/owner', new.id);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists venue_submitted on public.venues;
create trigger venue_submitted after insert or update on public.venues for each row execute function public._venue_submitted();

alter table public.venues enable row level security;
drop policy if exists venue_read on public.venues;
create policy venue_read on public.venues for select to authenticated using (status = 'approved' or owner = auth.uid() or is_admin());
drop policy if exists venue_insert on public.venues;
create policy venue_insert on public.venues for insert to authenticated with check (owner = auth.uid() or is_admin());
drop policy if exists venue_update on public.venues;
create policy venue_update on public.venues for update to authenticated using (owner = auth.uid() or is_admin()) with check (owner = auth.uid() or is_admin());
drop policy if exists venue_delete on public.venues;
create policy venue_delete on public.venues for delete to authenticated using (is_admin());

-- ---------- الملاعب (كورة، بادل، تنس) ----------
create table if not exists public.venue_courts (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  sport       text not null check (sport in ('football','padel','tennis')),
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  active      boolean not null default true,
  sort        smallint not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists venue_courts_venue_idx on public.venue_courts (venue_id, sort);

-- ---------- الحصص الأسبوعية (يوقا، بيلاتس) ----------
create table if not exists public.venue_classes (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null references public.venues(id) on delete cascade,
  sport         text not null check (sport in ('yoga','pilates')),
  title         text not null check (char_length(btrim(title)) between 2 and 60),
  title_en      text check (title_en is null or char_length(title_en) <= 60),
  weekday       smallint not null check (weekday between 0 and 6),  -- ٠ = الأحد
  start_time    time not null,
  duration_min  smallint not null default 50 check (duration_min between 20 and 180),
  capacity      smallint not null default 10 check (capacity between 1 and 60),
  coach_name    text check (coach_name is null or char_length(coach_name) <= 60),
  price_sar     numeric(7,2) check (price_sar is null or price_sar between 0 and 2000),
  audience      text not null default 'mixed' check (audience in ('men','women','mixed')),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists venue_classes_venue_idx on public.venue_classes (venue_id, weekday, start_time);

-- الملعب أو الحصة لازم تكون من رياضات المكان
create or replace function public._venue_item_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from venues where id = new.venue_id and new.sport = any(sports)) then raise exception 'bad_sport'; end if;
  return new;
end $$;
drop trigger if exists venue_courts_guard on public.venue_courts;
create trigger venue_courts_guard before insert or update on public.venue_courts for each row execute function public._venue_item_guard();
drop trigger if exists venue_classes_guard on public.venue_classes;
create trigger venue_classes_guard before insert or update on public.venue_classes for each row execute function public._venue_item_guard();

alter table public.venue_courts enable row level security;
drop policy if exists vcourt_read on public.venue_courts;
create policy vcourt_read on public.venue_courts for select to authenticated
  using (exists (select 1 from venues v where v.id = venue_id and v.status = 'approved') or can_manage_venue(venue_id));
drop policy if exists vcourt_write on public.venue_courts;
create policy vcourt_write on public.venue_courts for all to authenticated using (can_manage_venue(venue_id)) with check (can_manage_venue(venue_id));

alter table public.venue_classes enable row level security;
drop policy if exists vclass_read on public.venue_classes;
create policy vclass_read on public.venue_classes for select to authenticated
  using (exists (select 1 from venues v where v.id = venue_id and v.status = 'approved') or can_manage_venue(venue_id));
drop policy if exists vclass_write on public.venue_classes;
create policy vclass_write on public.venue_classes for all to authenticated using (can_manage_venue(venue_id)) with check (can_manage_venue(venue_id));

-- ---------- الحجوزات ----------
create table if not exists public.venue_bookings (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  court_id    uuid references public.venue_courts(id) on delete cascade,
  class_id    uuid references public.venue_classes(id) on delete cascade,
  sport       text not null check (sport in ('football','padel','tennis','yoga','pilates')),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  status      text not null default 'pending' check (status in ('pending','confirmed','declined','cancelled','done','no_show')),
  price_sar   numeric(7,2),
  note        text check (note is null or char_length(note) <= 200),
  venue_note  text check (venue_note is null or char_length(venue_note) <= 200),
  reminded_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check ((court_id is null) <> (class_id is null)),
  check (ends_at > starts_at)
);
-- ما فيه حجزين فعّالين على نفس الملعب ونفس البداية، ولا مقعدين لنفس الشخص في نفس الحصة
create unique index if not exists venue_bookings_court_slot on public.venue_bookings (court_id, starts_at)
  where court_id is not null and status in ('pending','confirmed');
create unique index if not exists venue_bookings_class_seat on public.venue_bookings (class_id, starts_at, user_id)
  where class_id is not null and status in ('pending','confirmed');
create index if not exists venue_bookings_user_idx on public.venue_bookings (user_id, starts_at desc);
create index if not exists venue_bookings_venue_idx on public.venue_bookings (venue_id, starts_at);

alter table public.venue_bookings enable row level security;
drop policy if exists vbook_read on public.venue_bookings;
create policy vbook_read on public.venue_bookings for select to authenticated using (user_id = auth.uid() or can_manage_venue(venue_id));
-- ما فيه إضافة أو تعديل مباشر: كله من الدوال تحت

-- ---------- أدوات النصوص ----------
-- «الخميس 1/10 الساعة 20:00» بتوقيت الرياض
create or replace function public._venue_when(p_ts timestamptz, p_loc text default 'ar')
returns text language sql immutable set search_path = public as $$
  select case when p_loc = 'en'
    then (array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[extract(dow from p_ts at time zone 'Asia/Riyadh')::int + 1]
         || ' ' || to_char(p_ts at time zone 'Asia/Riyadh', 'FMDD/FMMM') || ' at ' || to_char(p_ts at time zone 'Asia/Riyadh', 'HH24:MI')
    else (array['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'])[extract(dow from p_ts at time zone 'Asia/Riyadh')::int + 1]
         || ' ' || to_char(p_ts at time zone 'Asia/Riyadh', 'FMDD/FMMM') || ' الساعة ' || to_char(p_ts at time zone 'Asia/Riyadh', 'HH24:MI')
  end;
$$;

create or replace function public._sport_name(p_sport text, p_loc text default 'ar')
returns text language sql immutable as $$
  select case when p_loc = 'en' then
    case p_sport when 'football' then 'Football' when 'padel' then 'Padel' when 'tennis' then 'Tennis' when 'yoga' then 'Yoga' else 'Pilates' end
  else
    case p_sport when 'football' then 'كورة' when 'padel' then 'بادل' when 'tennis' then 'تنس' when 'yoga' then 'يوقا' else 'بيلاتس' end
  end;
$$;

-- وصف الحجز: «بادل · ملعب 2» أو «يوقا · يوقا الصباح»
create or replace function public._booking_label(b venue_bookings, p_loc text default 'ar')
returns text language sql stable security definer set search_path = public as $$
  select _sport_name(b.sport, p_loc) || ' · ' || coalesce(
    (select name from venue_courts where id = b.court_id),
    (select case when p_loc = 'en' then coalesce(title_en, title) else title end from venue_classes where id = b.class_id), '');
$$;

-- ---------- أوقات الملعب المحجوزة (بدون أسماء) ----------
create or replace function public.venue_taken(p_venue uuid, p_from timestamptz, p_to timestamptz)
returns table (court_id uuid, starts_at timestamptz, ends_at timestamptz, mine boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not exists (select 1 from venues v where v.id = p_venue and (v.status = 'approved' or can_manage_venue(v.id))) then return; end if;
  if p_to <= p_from or p_to - p_from > interval '3 days' then raise exception 'bad_range'; end if;
  return query
    select b.court_id, b.starts_at, b.ends_at, b.user_id = auth.uid()
    from venue_bookings b
    where b.venue_id = p_venue and b.court_id is not null and b.status in ('pending','confirmed')
      and b.starts_at < p_to and b.ends_at > p_from
    order by b.starts_at;
end $$;
revoke all on function public.venue_taken(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.venue_taken(uuid, timestamptz, timestamptz) to authenticated;

-- هل الوقت على جدول الملعب؟ (يدخل فيه اللي بعد ١٢ الليل كجزء من اليوم اللي قبله)
create or replace function public._venue_slot_ok(v venues, p_starts timestamptz)
returns boolean language plpgsql immutable as $$
declare l timestamp := p_starts at time zone 'Asia/Riyadh'; m integer; mm integer;
begin
  if extract(second from l) <> 0 then return false; end if;
  m := extract(hour from l)::int * 60 + extract(minute from l)::int;
  foreach mm in array array[m, m + 1440] loop
    if mm >= v.open_hour * 60 and mm + v.slot_min <= v.close_hour * 60 and (mm - v.open_hour * 60) % v.slot_min = 0 then
      return true;
    end if;
  end loop;
  return false;
end $$;

-- حد للحجوزات القادمة لكل مستخدم (عشان ما أحد يحجز كل الأوقات)
create or replace function public._booking_limit()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if (select count(*) from venue_bookings where user_id = auth.uid() and status in ('pending','confirmed') and starts_at > now()) >= 6 then
    raise exception 'too_many_bookings';
  end if;
end $$;

-- ---------- حجز ملعب ----------
create or replace function public.book_court(p_court uuid, p_starts timestamptz, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c venue_courts; v venues; v_end timestamptz; v_id uuid; v_status text; v_b venue_bookings;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  select * into c from venue_courts where id = p_court;
  select * into v from venues where id = c.venue_id;
  if c.id is null or not c.active or v.status <> 'approved' or v.listed_by <> 'owner' then raise exception 'venue_unavailable'; end if;
  if p_starts < now() + interval '10 minutes' then raise exception 'too_late'; end if;
  if p_starts > now() + interval '21 days' then raise exception 'too_far_ahead'; end if;
  if not _venue_slot_ok(v, p_starts) then raise exception 'bad_slot'; end if;
  v_end := p_starts + make_interval(mins => v.slot_min);
  perform _booking_limit();
  -- قفل على الملعب عشان ما يدخل حجزين بنفس اللحظة
  perform pg_advisory_xact_lock(hashtext('court:' || p_court::text));
  if exists (select 1 from venue_bookings b where b.court_id = p_court and b.status in ('pending','confirmed')
               and b.starts_at < v_end and b.ends_at > p_starts) then
    raise exception 'slot_taken';
  end if;
  v_status := case when v.auto_confirm then 'confirmed' else 'pending' end;
  insert into venue_bookings (venue_id, user_id, court_id, sport, starts_at, ends_at, status, price_sar, note)
  values (v.id, auth.uid(), p_court, c.sport, p_starts, v_end, v_status, v.price_sar, nullif(left(btrim(coalesce(p_note, '')), 200), ''))
  returning * into v_b;
  v_id := v_b.id;

  -- للمستخدم: موعده (مؤكد أو ينتظر تأكيد الملعب)
  if v_status = 'confirmed' then
    perform _notice(auth.uid(), 'vb_ok:' || v_id, 'تأكد حجزك ✓', _booking_label(v_b) || ' في ' || v.name || ' · ' || _venue_when(p_starts) || '. الدفع في المكان.',
      'Booking confirmed ✓', _booking_label(v_b, 'en') || ' at ' || coalesce(v.name_en, v.name) || ' · ' || _venue_when(p_starts, 'en') || '. Pay at the venue.',
      '/bookings', v_id);
  else
    perform _notice(auth.uid(), 'vb_req:' || v_id, 'وصل طلب حجزك', _booking_label(v_b) || ' في ' || v.name || ' · ' || _venue_when(p_starts) || '. بيوصلك تنبيه أول ما يأكده الملعب.',
      'Booking request sent', _booking_label(v_b, 'en') || ' at ' || coalesce(v.name_en, v.name) || ' · ' || _venue_when(p_starts, 'en') || '. We''ll let you know once the venue confirms.',
      '/bookings', v_id);
  end if;
  -- للملعب: حجز جديد
  perform _notice(v.owner, 'vb_new:' || v_id, case when v_status = 'confirmed' then 'حجز جديد ✓' else 'طلب حجز جديد' end,
    _person_label(auth.uid()) || ' · ' || _booking_label(v_b) || ' · ' || _venue_when(p_starts),
    case when v_status = 'confirmed' then 'New booking ✓' else 'New booking request' end,
    _person_label(auth.uid()) || ' · ' || _booking_label(v_b, 'en') || ' · ' || _venue_when(p_starts, 'en'),
    '/venues/manage', v_id);
  return jsonb_build_object('id', v_id, 'status', v_status);
exception when unique_violation then
  raise exception 'slot_taken';
end $$;
revoke all on function public.book_court(uuid, timestamptz, text) from public, anon;
grant execute on function public.book_court(uuid, timestamptz, text) to authenticated;

-- ---------- جدول الحصص (الأسبوعين الجايين) ----------
create or replace function public.venue_class_schedule(p_venue uuid, p_days integer default 14)
returns table (class_id uuid, sport text, title text, title_en text, coach_name text, audience text, price_sar numeric,
               starts_at timestamptz, ends_at timestamptz, capacity integer, booked integer, my_booking uuid, my_status text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not exists (select 1 from venues v where v.id = p_venue and (v.status = 'approved' or can_manage_venue(v.id))) then return; end if;
  return query
    with occ as (
      select c.*, ((d::date + c.start_time)::timestamp at time zone 'Asia/Riyadh') as s
      from venue_classes c
      cross join generate_series(app_today()::timestamp, (app_today() + least(greatest(p_days, 1), 21) - 1)::timestamp, interval '1 day') d
      where c.venue_id = p_venue and c.active and extract(dow from d)::int = c.weekday
    )
    select o.id, o.sport, o.title, o.title_en, o.coach_name, o.audience, o.price_sar, o.s, o.s + make_interval(mins => o.duration_min),
           o.capacity::int,
           (select count(*)::int from venue_bookings b where b.class_id = o.id and b.starts_at = o.s and b.status in ('pending','confirmed')),
           (select b.id from venue_bookings b where b.class_id = o.id and b.starts_at = o.s and b.user_id = auth.uid() and b.status in ('pending','confirmed') limit 1),
           (select b.status from venue_bookings b where b.class_id = o.id and b.starts_at = o.s and b.user_id = auth.uid() and b.status in ('pending','confirmed') limit 1)
    from occ o
    where o.s > now()
    order by o.s, o.title;
end $$;
revoke all on function public.venue_class_schedule(uuid, integer) from public, anon;
grant execute on function public.venue_class_schedule(uuid, integer) to authenticated;

-- ---------- حجز مقعد في حصة (يتأكد على طول لو فيه مكان) ----------
create or replace function public.book_venue_class(p_class uuid, p_starts timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c venue_classes; v venues; l timestamp := p_starts at time zone 'Asia/Riyadh'; v_b venue_bookings;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  select * into c from venue_classes where id = p_class;
  select * into v from venues where id = c.venue_id;
  if c.id is null or not c.active or v.status <> 'approved' or v.listed_by <> 'owner' then raise exception 'venue_unavailable'; end if;
  if extract(dow from l)::int <> c.weekday or l::time <> c.start_time then raise exception 'bad_slot'; end if;
  if p_starts < now() + interval '5 minutes' then raise exception 'too_late'; end if;
  if p_starts > now() + interval '21 days' then raise exception 'too_far_ahead'; end if;
  perform _booking_limit();
  perform pg_advisory_xact_lock(hashtext('class:' || p_class::text || ':' || p_starts::text));
  if exists (select 1 from venue_bookings where class_id = p_class and starts_at = p_starts and user_id = auth.uid() and status in ('pending','confirmed')) then
    raise exception 'already_booked';
  end if;
  if (select count(*) from venue_bookings where class_id = p_class and starts_at = p_starts and status in ('pending','confirmed')) >= c.capacity then
    raise exception 'class_full';
  end if;
  insert into venue_bookings (venue_id, user_id, class_id, sport, starts_at, ends_at, status, price_sar)
  values (v.id, auth.uid(), p_class, c.sport, p_starts, p_starts + make_interval(mins => c.duration_min), 'confirmed', c.price_sar)
  returning * into v_b;
  perform _notice(auth.uid(), 'vb_ok:' || v_b.id, 'تأكد حجزك ✓', _booking_label(v_b) || ' في ' || v.name || ' · ' || _venue_when(p_starts) || '. الدفع في المكان.',
    'Booking confirmed ✓', _booking_label(v_b, 'en') || ' at ' || coalesce(v.name_en, v.name) || ' · ' || _venue_when(p_starts, 'en') || '. Pay at the venue.',
    '/bookings', v_b.id);
  perform _notice(v.owner, 'vb_new:' || v_b.id, 'حجز جديد ✓', _person_label(auth.uid()) || ' · ' || _booking_label(v_b) || ' · ' || _venue_when(p_starts),
    'New booking ✓', _person_label(auth.uid()) || ' · ' || _booking_label(v_b, 'en') || ' · ' || _venue_when(p_starts, 'en'), '/venues/manage', v_b.id);
  return jsonb_build_object('id', v_b.id, 'status', v_b.status);
exception when unique_violation then
  raise exception 'already_booked';
end $$;
revoke all on function public.book_venue_class(uuid, timestamptz) from public, anon;
grant execute on function public.book_venue_class(uuid, timestamptz) to authenticated;

-- ---------- المستخدم يلغي حجزه (قبل الموعد) ----------
create or replace function public.cancel_venue_booking(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_b venue_bookings; v venues;
begin
  select * into v_b from venue_bookings where id = p_id and user_id = auth.uid() for update;
  if v_b.id is null then raise exception 'request_not_found'; end if;
  if v_b.status not in ('pending','confirmed') then raise exception 'bad_status'; end if;
  if v_b.starts_at <= now() then raise exception 'too_late'; end if;
  update venue_bookings set status = 'cancelled', updated_at = now() where id = p_id;
  select * into v from venues where id = v_b.venue_id;
  perform _notice(v.owner, 'vb_cx:' || p_id, 'انلغى حجز', _person_label(auth.uid()) || ' لغى ' || _booking_label(v_b) || ' · ' || _venue_when(v_b.starts_at),
    'Booking cancelled', _person_label(auth.uid()) || ' cancelled ' || _booking_label(v_b, 'en') || ' · ' || _venue_when(v_b.starts_at, 'en'), '/venues/manage', p_id);
end $$;
revoke all on function public.cancel_venue_booking(uuid) from public, anon;
grant execute on function public.cancel_venue_booking(uuid) to authenticated;

-- ---------- الملعب: تأكيد، اعتذار، إلغاء، حضر، ما حضر ----------
create or replace function public.respond_venue_booking(p_id uuid, p_action text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_b venue_bookings; v venues; v_note text := nullif(left(btrim(coalesce(p_note, '')), 200), '');
        v_key text := 'vb_' || p_action || ':' || p_id;
begin
  select * into v_b from venue_bookings where id = p_id for update;
  if v_b.id is null or not can_manage_venue(v_b.venue_id) then raise exception 'not_allowed'; end if;
  select * into v from venues where id = v_b.venue_id;
  if p_action = 'confirm' and v_b.status = 'pending' then
    if v_b.starts_at <= now() then raise exception 'too_late'; end if;
    update venue_bookings set status = 'confirmed', venue_note = coalesce(v_note, venue_note), updated_at = now() where id = p_id;
    perform _notice(v_b.user_id, v_key, 'تأكد حجزك ✓', _booking_label(v_b) || ' في ' || v.name || ' · ' || _venue_when(v_b.starts_at) || '. الدفع في المكان.',
      'Booking confirmed ✓', _booking_label(v_b, 'en') || ' at ' || coalesce(v.name_en, v.name) || ' · ' || _venue_when(v_b.starts_at, 'en') || '. Pay at the venue.',
      '/bookings', p_id);
  elsif p_action = 'decline' and v_b.status = 'pending' then
    update venue_bookings set status = 'declined', venue_note = v_note, updated_at = now() where id = p_id;
    perform _notice(v_b.user_id, v_key, 'ما تأكد حجزك', coalesce(v_note, 'الوقت ما عاد متاح في ' || v.name || '. جرّب وقت ثاني.'),
      'Booking not confirmed', coalesce(v_note, 'That time is no longer available at ' || coalesce(v.name_en, v.name) || '. Try another time.'),
      '/book/' || v.id, p_id);
  elsif p_action = 'cancel' and v_b.status in ('pending','confirmed') then
    if v_note is null then raise exception 'note_required'; end if;
    update venue_bookings set status = 'cancelled', venue_note = v_note, updated_at = now() where id = p_id;
    perform _notice(v_b.user_id, v_key, 'انلغى حجزك', v.name || ': ' || v_note, 'Your booking was cancelled', coalesce(v.name_en, v.name) || ': ' || v_note, '/bookings', p_id);
  elsif p_action in ('done','no_show') and v_b.status = 'confirmed' then
    if v_b.starts_at > now() then raise exception 'too_early'; end if;
    update venue_bookings set status = p_action, updated_at = now() where id = p_id;
  else
    raise exception 'bad_status';
  end if;
end $$;
revoke all on function public.respond_venue_booking(uuid, text, text) from public, anon;
grant execute on function public.respond_venue_booking(uuid, text, text) to authenticated;

-- ---------- قائمة حجوزات الملعب (لصاحبه) ----------
create or replace function public.venue_booking_list(p_venue uuid, p_from timestamptz default now() - interval '1 day', p_limit integer default 200)
returns table (id uuid, sport text, label text, starts_at timestamptz, ends_at timestamptz, status text, price_sar numeric, note text, venue_note text,
               user_id uuid, username text, full_name text, avatar_url text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not can_manage_venue(p_venue) then raise exception 'not_allowed'; end if;
  return query
    select b.id, b.sport, _booking_label(b), b.starts_at, b.ends_at, b.status, b.price_sar, b.note, b.venue_note,
           b.user_id, p.username, p.full_name, p.avatar_url, b.created_at
    from venue_bookings b join profiles p on p.id = b.user_id
    where b.venue_id = p_venue and b.starts_at >= p_from
    order by (b.status = 'pending') desc, b.starts_at
    limit least(greatest(p_limit, 1), 500);
end $$;
revoke all on function public.venue_booking_list(uuid, timestamptz, integer) from public, anon;
grant execute on function public.venue_booking_list(uuid, timestamptz, integer) to authenticated;

-- ---------- حجوزاتي ----------
create or replace function public.my_venue_bookings()
returns table (id uuid, venue_id uuid, venue_name text, venue_name_en text, city text, phone text, maps_url text, sport text,
               label text, label_en text, starts_at timestamptz, ends_at timestamptz, status text, price_sar numeric, venue_note text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.id, v.id, v.name, v.name_en, v.city, v.phone, v.maps_url, b.sport, _booking_label(b), _booking_label(b, 'en'),
         b.starts_at, b.ends_at, b.status, b.price_sar, b.venue_note, b.created_at
  from venue_bookings b join venues v on v.id = b.venue_id
  where b.user_id = auth.uid()
  order by (b.starts_at > now() and b.status in ('pending','confirmed')) desc,
           case when b.starts_at > now() then b.starts_at end asc, b.starts_at desc
  limit 100;
$$;
revoke all on function public.my_venue_bookings() from public, anon;
grant execute on function public.my_venue_bookings() to authenticated;

-- ---------- اعتماد الإدارة ----------
create or replace function public.review_venue(p_id uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v venues; v_note text := nullif(btrim(coalesce(p_note, '')), '');
        v_key text := 'vnr:' || p_id || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  if p_decision not in ('approved','rejected','suspended') then raise exception 'bad_status'; end if;
  if p_decision = 'rejected' and v_note is null and exists (select 1 from venues where id = p_id and listed_by = 'owner') then
    raise exception 'consent_required';
  end if;
  update venues set status = p_decision, review_note = left(v_note, 300) where id = p_id returning * into v;
  if v.id is null then raise exception 'request_not_found'; end if;
  if v.owner is not null then
    if p_decision = 'approved' then
      perform _notice(v.owner, v_key, 'انعتمد مكانك ✓', v.name || ' صار ظاهر في «حجز الملاعب والحصص». أضف ملاعبك أو حصصك وأوقاتك عشان يبدأ الحجز.',
        'Your venue is approved ✓', coalesce(v.name_en, v.name) || ' now appears in court and class booking. Add your courts or classes to start taking bookings.', '/venues/manage', p_id);
    elsif p_decision = 'rejected' then
      perform _notice(v.owner, v_key, 'طلبك يحتاج تعديل', coalesce(v_note, 'راجع بيانات المكان وأرسله مرة ثانية.'),
        'Your venue needs changes', coalesce(v_note, 'Review your venue details and submit again.'), '/venues/join', p_id);
    else
      perform _notice(v.owner, v_key, 'انوقف ظهور مكانك', coalesce(v_note, 'مكانك ما يظهر في الحجز حالياً. تواصل مع إدارة أرك.'),
        'Your venue is hidden', coalesce(v_note, 'Your venue is hidden for now. Contact the ARQ team.'), '/venues/join', p_id);
    end if;
  end if;
end $$;
revoke all on function public.review_venue(uuid, text, text) from public, anon;
grant execute on function public.review_venue(uuid, text, text) to authenticated;

-- ---------- تذكير قبل الموعد بساعة (كل ربع ساعة) ----------
create or replace function public.run_venue_reminders(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare r record; v_n integer := 0;
begin
  for r in
    select b.*, v.name as vname, coalesce(v.name_en, v.name) as vname_en
    from venue_bookings b join venues v on v.id = b.venue_id
    where b.status = 'confirmed' and b.reminded_at is null
      and b.starts_at between p_now + interval '45 minutes' and p_now + interval '75 minutes'
    limit 5000
  loop
    update venue_bookings set reminded_at = p_now where id = r.id;
    if _notice(r.user_id, 'vb_rem:' || r.id, 'موعدك بعد ساعة ⏰',
         _sport_name(r.sport) || ' في ' || r.vname || ' الساعة ' || to_char(r.starts_at at time zone 'Asia/Riyadh', 'HH24:MI') || '. لا تنسى.',
         'Your booking is in an hour ⏰',
         _sport_name(r.sport, 'en') || ' at ' || r.vname_en || ', ' || to_char(r.starts_at at time zone 'Asia/Riyadh', 'HH24:MI') || '.',
         '/bookings', r.id) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
revoke all on function public.run_venue_reminders(timestamptz) from public, anon, authenticated;

do $$
begin
  perform cron.schedule('arq-venue-reminders', '*/15 * * * *', 'select public.run_venue_reminders()');
exception when others then
  raise notice 'pg_cron not available: venue reminders not scheduled (%)', sqlerrm;
end $$;

-- ---------- أول القائمة: ملاعب واستوديوهات من مواقعها الرسمية (سبتمبر 2026) ----------
-- مدرجة من أرك بدون شعارات ولا صور، والحجز يكون من موقعهم لين ينضمون كشركاء ويصير الحجز داخل التطبيق
insert into public.venues (listed_by, status, sports, name, name_en, city, city_en, district, district_en, audience, booking_url, website, instagram, phone, source_url)
select 'arq', 'approved', v.sports, v.name, v.name_en, v.city, v.city_en, v.district, v.district_en, v.audience, v.booking_url, v.website, v.instagram, v.phone, v.source_url
from (values
  (array['football','padel']::text[], 'دوم الرياضة للجميع الدمام', 'SFA Domes Dammam', 'الدمام', 'Dammam', null, null, 'mixed', 'https://sfadomes.com/en/sfa-domes-dammam', 'https://sfadomes.com', null, '+966555129139', 'https://sfadomes.com/ar/sfa-domes-dammam/facilities/football/court-7-football-7-a-side'),
  (array['football','padel']::text[], 'ون تو', 'OneTwo Sports', 'عدة مدن', 'Several cities', null, null, null, 'https://onetwo.sa/', 'https://onetwo.sa', null, null, 'https://onetwo.sa/'),
  (array['padel']::text[], 'Padel In (Ar Rabwah)', 'Padel In (Ar Rabwah)', 'الرياض', 'Riyadh', 'الربوة', 'Ar Rabwah', null, 'https://playtomic.com/clubs/padel-in-rabwah', null, null, null, 'https://playtomic.com/clubs/padel-in-rabwah'),
  (array['padel']::text[], 'Padel UP – Ad Diriyah', 'Padel UP – Ad Diriyah', 'الرياض', 'Riyadh', null, null, null, 'https://playtomic.com/clubs/padel-up-riyadh', null, null, null, 'https://playtomic.com/clubs/padel-up-riyadh'),
  (array['padel']::text[], 'Hala Padel', 'Hala Padel', 'الرياض', 'Riyadh', 'العارض', 'Al Arid', null, 'https://playtomic.com/clubs/hala-padel', null, null, null, 'https://playtomic.com/clubs/hala-padel'),
  (array['padel']::text[], 'Padel In Jeddah Park', 'Padel In Jeddah Park', 'جدة', 'Jeddah', null, null, null, 'https://playtomic.com/clubs/padel-in-jeddah-ksa', null, null, null, 'https://playtomic.com/clubs/padel-in-jeddah-ksa'),
  (array['padel']::text[], 'The Padel Social Club', 'The Padel Social Club', 'جدة', 'Jeddah', null, null, null, 'https://playtomic.com/clubs/the-padel-social-club', null, null, null, 'https://playtomic.com/clubs/the-padel-social-club'),
  (array['tennis']::text[], 'أكاديمية بيت التنس', 'Tennis Home Academy', 'الرياض', 'Riyadh', null, null, null, 'https://tennishomeacademy.com/tennis-court-rent/', 'https://tennishomeacademy.com', 'tennis_homeksa', '+966555003500', 'https://tennishomeacademy.com/'),
  (array['tennis']::text[], 'أكاديمية نت للتنس', 'Net Tennis Academy', 'الدرعية', 'Diriyah', null, null, null, 'https://netacademy.sa', 'https://netacademy.sa', null, null, 'https://netacademy.sa/'),
  (array['tennis']::text[], 'أكاديمة ڤاموس للتنس', 'Vamos Tennis Academy', 'جدة', 'Jeddah', null, null, 'mixed', 'https://www.vamosksa.com/', 'https://www.vamosksa.com', 'vamostennissa', '+966556047070', 'https://www.vamosksa.com/'),
  (array['tennis','padel']::text[], 'Dunes Racquet Club', 'Dunes Racquet Club', 'جدة', 'Jeddah', 'النهضة', 'An Nahdah', null, 'https://dunesclubsa.com/book', 'https://dunesclubsa.com', 'dunesracquetclub', '+966573773731', 'https://dunesclubsa.com/'),
  (array['tennis']::text[], 'Ryze Tennis Club & Academy', 'Ryze Tennis Club & Academy', 'جدة', 'Jeddah', 'الخالدية', 'Al Khalidiyah', null, 'https://ryzetennis.sa/book', 'https://ryzetennis.sa', 'ryzetennis', '+966553165262', 'https://ryzetennis.sa/'),
  (array['tennis']::text[], 'Ace Tennis Academy', 'Ace Tennis Academy', 'الخبر', 'Al Khobar', 'العزيزية', 'Al Aziziyah', null, null, null, 'acetennis_sa', '+966539191828', 'https://tennissaudi.sa/en/tennis/clubs/club-details/77/-.html'),
  (array['yoga']::text[], 'The Yoga House', 'The Yoga House', 'الرياض', 'Riyadh', 'الياسمين', 'Al Yasmin', null, 'https://www.theyogahousesa.com/download-our-app', 'https://www.theyogahousesa.com', 'theyogahouse.sa', '+966538335633', 'https://www.theyogahousesa.com/'),
  (array['yoga']::text[], 'The Art of Qi', 'The Art of Qi', 'الرياض', 'Riyadh', null, null, null, 'https://clients.mindbodyonline.com/classic/ws?studioid=5733994&stype=-7&sView=day&sLoc=0', 'https://theartofqisa.com', 'theartofqi.sa', '+966533696767', 'https://theartofqisa.com/pages/contact'),
  (array['yoga']::text[], 'كراما يوغا', 'Karama Yoga Studio', 'جدة', 'Jeddah', 'الشاطئ', 'Ash Shati', null, 'https://karama-yoga.com/book', 'https://karama-yoga.com', 'karama_yoga', '+966508686446', 'https://karama-yoga.com/'),
  (array['pilates','yoga']::text[], 'Reform Athletica', 'Reform Athletica', 'الرياض', 'Riyadh', 'حي السفارات', 'Diplomatic Quarter', 'mixed', 'https://www.reformathletica.com/sa/schedule', 'https://www.reformathletica.com/sa', 'reformathleticaksa', '+966112522049', 'https://www.reformathletica.com/sa/classes'),
  (array['pilates']::text[], 'Sculptō Reformer Studio', 'Sculptō Reformer Studio', 'الرياض', 'Riyadh', 'النخيل', 'An Nakheel', null, 'https://sculpto.tamarran.com/', 'https://sculptostudio.com', 'sculpto.sa', '+966538091090', 'https://sculptostudio.com/'),
  (array['pilates','yoga']::text[], 'Formé Wellness', 'Formé Wellness', 'الرياض', 'Riyadh', 'العقيق', 'Al Aqiq', null, 'https://formewellness.club/al-aqiq/', 'https://formewellness.club', 'formewellness.sa', '+966551751346', 'https://formewellness.club/al-aqiq/'),
  (array['pilates']::text[], 'كارڤ', 'KARVE', 'جدة', 'Jeddah', 'الروضة', 'Ar Rawdah', 'women', 'https://karve.alfmile.co/go/book', 'https://karve.sa', 'karve.ksa', '+966508002291', 'https://karve.sa/en/home/'),
  (array['pilates']::text[], 'Pilatiq', 'Pilatiq', 'جدة', 'Jeddah', null, null, null, 'https://www.pilatiqstudiojeddah.com/book-now', 'https://www.pilatiqstudiojeddah.com', null, null, 'https://www.pilatiqstudiojeddah.com/'),
  (array['pilates']::text[], 'كيرفا', 'Curva Pilates & Lagree Studio', 'الخبر', 'Al Khobar', 'العليا', 'Al Olaya', null, 'https://curvapilates.com/', 'https://curvapilates.com', 'curvapilates', '+966565570764', 'https://curvapilates.com/')
) as v(sports, name, name_en, city, city_en, district, district_en, audience, booking_url, website, instagram, phone, source_url)
where not exists (select 1 from public.venues x where x.listed_by = 'arq' and x.name_en = v.name_en);

-- ---------- لوحة إدارة التطبيق: الملاعب والاستوديوهات كنوع شريك خامس ----------
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
  elsif p_kind = 'venue' then
    return query
      select v.id, v.name, coalesce(v.name_en, ''), v.status, v.image_path, null::text, v.owner, p.username, v.listed_by,
             v.listed_by = 'owner' and v.status = 'approved',
             jsonb_build_object('sports', v.sports, 'city', v.city, 'booking_url', v.booking_url,
               'courts', (select count(*) from venue_courts c where c.venue_id = v.id and c.active),
               'classes', (select count(*) from venue_classes c where c.venue_id = v.id and c.active),
               'upcoming', (select count(*) from venue_bookings b where b.venue_id = v.id and b.status in ('pending','confirmed') and b.starts_at > now())),
             v.created_at
      from venues v left join profiles p on p.id = v.owner
      where v_q is null or lower(v.name) like '%' || v_q || '%' or lower(coalesce(v.name_en, '')) like '%' || v_q || '%'
      order by (v.status = 'pending') desc, (v.listed_by = 'owner') desc, v.created_at desc
      limit 500;
  else
    raise exception 'bad_status';
  end if;
end $$;
revoke all on function public.admin_partner_list(text, text) from public, anon;
grant execute on function public.admin_partner_list(text, text) to authenticated;

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
           count(*) filter (where status in ('suspended','rejected'))::int, count(*)::int from recovery_centers
    union all
    select 'venue', count(*) filter (where status = 'pending')::int, count(*) filter (where status = 'approved')::int,
           count(*) filter (where status = 'approved' and listed_by = 'owner')::int,
           count(*) filter (where status in ('suspended','rejected'))::int, count(*)::int from venues;
end $$;
revoke all on function public.partner_overview() from public, anon;
grant execute on function public.partner_overview() to authenticated;

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
     or (p_kind = 'center' and not exists (select 1 from recovery_centers where id = p_id))
     or (p_kind = 'venue' and not exists (select 1 from venues where id = p_id)) then
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
  elsif p_kind = 'venue' then
    if p_action = 'delete' then delete from venues where id = p_id;
    elsif p_action in ('approve','show') then perform review_venue(p_id, 'approved', v_note);
    elsif p_action = 'reject' then perform review_venue(p_id, 'rejected', v_note);
    elsif p_action = 'hide' then perform review_venue(p_id, 'suspended', v_note);
    else raise exception 'bad_status';
    end if;
  else
    raise exception 'bad_status';
  end if;
  perform _admin_log(p_kind, p_id::text, p_action, v_note);
end $$;
revoke all on function public.admin_partner_action(text, uuid, text, text) from public, anon;
grant execute on function public.admin_partner_action(text, uuid, text, text) to authenticated;

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
  elsif p_kind = 'venue' then
    if exists (select 1 from venues where owner = v_user and id <> p_id) then raise exception 'already_linked'; end if;
    update venues set owner = v_user, listed_by = 'owner' where id = p_id returning name into v_name;
    if v_name is null then raise exception 'request_not_found'; end if;
    update profiles set account_type = 'venue' where id = v_user and account_type = 'trainee';
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


-- ===================== 20260929000650_chain_amenities_public.sql =====================
-- خدمات السلاسل من مصادرها الرسمية (مواقع السلاسل، تطبيقها الرسمي، أو تقرير الشركة الأم)
-- «حسب الفرع» لما المصدر يقول إنها في بعض الفروع. ما نغيّر أي شي عدّله مدير السلسلة (on conflict do nothing).
-- المصادر (سبتمبر 2026):
--   وقت اللياقة بفئاتها: leejam.com.sa (من نحن + التقرير السنوي 2023) وتطبيق Fitness Time الرسمي
--   أوبتيمو: optimo.com.sa/why-optimo و/locations · بي فت: bfit.com.sa (why-b-fit, personal-training, co-working)
--   جولدز جيم: ggarabia.com (personal training, Les Mills, locate a gym)
--   بودي ماسترز / بودي موشنز: صفحات الكلاسات والتدريب الشخصي وفلاتر «أقرب نادي»
--   نيويو: nuyu-ksa.com · بيور جيم: ksa.puregymarabia.com (about-our-gyms, fitness-classes, personal-training)
--   جيم نيشن: gymnation.com/en-sa (FAQ, facilities, صفحات الفروع) · فتنس فيرست: ksa.fitnessfirstme.com وصفحات أنديتها
--   سناب فتنس: snapfitness.com/sa_en/gyms/al-jubail · اللياقة الذكية: smartfitness.com.sa (الأسئلة الشائعة، نبذة عنا)

insert into public.chain_amenities (chain_id, amenity, available, note, source)
select c.id, v.amenity, true, v.note, 'public_info'
from (values
  ('fitness-time-xpress', 'open_24h',          'فروع الرجال'),
  ('fitness-time-ladies', 'pool',              null::text),
  ('fitness-time-ladies', 'jacuzzi_hot',       null),
  ('fitness-time-ladies', 'jacuzzi_cold',      'أحواض غطس'),
  ('fitness-time-ladies', 'group_classes',     'حسب الفرع'),
  ('fitness-time-ladies', 'personal_training', 'حسب الفرع'),
  ('fitness-time',        'group_classes',     null),
  ('fitness-time',        'personal_training', null),
  ('fitness-time',        'jacuzzi_cold',      'أحواض غطس'),
  ('fitness-time-plus',   'group_classes',     null),
  ('fitness-time-plus',   'personal_training', null),
  ('fitness-time-plus',   'jacuzzi_cold',      'أحواض غطس، حسب الفرع'),
  ('fitness-time-pro',    'group_classes',     null),
  ('fitness-time-pro',    'personal_training', null),
  ('fitness-time-pro',    'jacuzzi_cold',      'أحواض غطس، حسب الفرع'),
  ('optimo',              'pool',              null),
  ('optimo',              'sauna',             null),
  ('optimo',              'steam',             null),
  ('optimo',              'showers',           null),
  ('optimo',              'trainers',          null),
  ('optimo',              'personal_training', null),
  ('optimo',              'group_classes',     null),
  ('optimo',              'drinks_bar',        null),
  ('optimo',              'women_section',     'فرع نسائي'),
  ('bfit',                'personal_training', null),
  ('bfit',                'jacuzzi_hot',       null),
  ('bfit',                'sauna',             null),
  ('bfit',                'lockers',           null),
  ('bfit',                'drinks_bar',        null),
  ('bfit',                'wifi',              'في مساحة العمل'),
  ('golds-gym',           'group_classes',     null),
  ('golds-gym',           'personal_training', 'حسب الفرع'),
  ('golds-gym',           'women_section',     'فروع نسائية'),
  ('body-masters',        'group_classes',     null),
  ('body-masters',        'personal_training', null),
  ('body-masters',        'open_24h',          'حسب الفرع'),
  ('body-masters',        'pool',              'حسب الفرع'),
  ('body-masters',        'sauna',             'حسب الفرع'),
  ('body-masters',        'steam',             'حسب الفرع'),
  ('body-masters',        'lockers',           'حسب الفرع'),
  ('body-masters',        'drinks_bar',        'حسب الفرع'),
  ('body-motions',        'group_classes',     null),
  ('body-motions',        'personal_training', null),
  ('body-motions',        'lockers',           'حسب الفرع'),
  ('body-motions',        'drinks_bar',        'حسب الفرع'),
  ('nuyu',                'trainers',          null),
  ('nuyu',                'personal_training', null),
  ('nuyu',                'group_classes',     null),
  ('puregym',             'group_classes',     null),
  ('puregym',             'personal_training', null),
  ('puregym',             'showers',           null),
  ('puregym',             'lockers',           'مجانية، تجيب قفلك'),
  ('puregym',             'parking',           'مجانية'),
  ('puregym',             'wifi',              null),
  ('puregym',             'women_section',     'فروع نسائية'),
  ('puregym',             'accessible',        'دورات مياه مهيأة'),
  ('gymnation',           'personal_training', 'جلسة مجانية عند الاشتراك'),
  ('gymnation',           'showers',           null),
  ('gymnation',           'lockers',           null),
  ('gymnation',           'parking',           null),
  ('gymnation',           'wifi',              null),
  ('gymnation',           'women_section',     'أقسام نسائية'),
  ('gymnation',           'jacuzzi_cold',      'حمامات ثلج، حسب الفرع'),
  ('gymnation',           'drinks_bar',        'حسب الفرع'),
  ('fitness-first',       'group_classes',     null),
  ('fitness-first',       'personal_training', null),
  ('fitness-first',       'pool',              'حسب الفرع'),
  ('fitness-first',       'steam',             'حسب الفرع'),
  ('fitness-first',       'open_24h',          'حسب الفرع'),
  ('fitness-first',       'lockers',           'حسب الفرع'),
  ('fitness-first',       'wifi',              'حسب الفرع'),
  ('fitness-first',       'drinks_bar',        'حسب الفرع'),
  ('snap-fitness',        'group_classes',     null),
  ('snap-fitness',        'personal_training', null),
  ('snap-fitness',        'showers',           null),
  ('snap-fitness',        'parking',           null),
  ('smart-fitness',       'pool',              null),
  ('smart-fitness',       'sauna',             null),
  ('smart-fitness',       'jacuzzi_hot',       null),
  ('smart-fitness',       'steam',             null),
  ('smart-fitness',       'parking',           null),
  ('smart-fitness',       'trainers',          null),
  ('smart-fitness',       'group_classes',     null),
  ('smart-fitness',       'women_section',     'فروع نسائية')
) as v(slug, amenity, note)
join public.gym_chains c on c.slug = v.slug
join public.amenities a on a.key = v.amenity
on conflict (chain_id, amenity) do nothing;


-- ===================== 20260929000660_admin_users.sql =====================
-- لوحة إدارة التطبيق ← المتدربين: العدد، الإيميل، تعديل الاسم واسم المستخدم، وحذف الحساب نهائياً
-- كل شي للإدارة فقط (is_admin)، وكل تعديل أو حذف ينحفظ في سجل الإدارة.
-- الإيميل من auth.users وما يطلع إلا للإدارة.

-- ---------- الأرقام ----------
create or replace function public.admin_user_stats()
returns table (total integer, trainees integer, partners integer, new_7d integer, active_7d integer, unconfirmed integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  return query
  select count(*)::int,
         count(*) filter (where p.account_type = 'trainee')::int,
         count(*) filter (where p.account_type <> 'trainee')::int,
         count(*) filter (where p.created_at > now() - interval '7 days')::int,
         count(*) filter (where u.last_sign_in_at > now() - interval '7 days')::int,
         count(*) filter (where u.email_confirmed_at is null)::int
  from profiles p join auth.users u on u.id = p.id;
end $$;
revoke all on function public.admin_user_stats() from public, anon;
grant execute on function public.admin_user_stats() to authenticated;

-- ---------- القائمة: بحث بالاسم أو اسم المستخدم أو الإيميل ----------
-- p_kind: trainee (المتدربين) أو partner (الشركاء) أو all
create or replace function public.admin_user_list(p_search text default null, p_kind text default 'trainee',
                                                  p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, email text, username text, full_name text, avatar_url text, account_type text, gender text,
               created_at timestamptz, last_sign_in_at timestamptz, email_confirmed boolean, points integer,
               gym_name text, gym_name_en text, is_admin boolean, total bigint)
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
         count(*) over ()
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

-- ---------- التعديل: الاسم واسم المستخدم ----------
create or replace function public.admin_update_user(p_user uuid, p_full_name text, p_username text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_old profiles;
  v_name text := nullif(trim(coalesce(p_full_name, '')), '');
  v_user text := lower(trim(coalesce(p_username, '')));
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  select * into v_old from profiles where id = p_user for update;
  if not found then raise exception 'user_not_found'; end if;
  if v_user !~ '^[a-z0-9_.]{3,24}$' then raise exception 'bad_username'; end if;
  if v_name is not null and char_length(v_name) > 60 then raise exception 'name_too_long'; end if;
  if exists (select 1 from profiles where lower(username) = v_user and id <> p_user) then raise exception 'username_taken'; end if;
  update profiles set full_name = v_name, username = v_user where id = p_user;
  perform _admin_log('user', p_user::text, 'edit',
    concat_ws(' → ', v_old.username || coalesce(' (' || v_old.full_name || ')', ''), v_user || coalesce(' (' || v_name || ')', '')));
end $$;
revoke all on function public.admin_update_user(uuid, text, text) from public, anon;
grant execute on function public.admin_update_user(uuid, text, text) to authenticated;

-- ---------- الحذف ----------
-- ١) admin_prepare_user_delete: يفتح للإدارة ربع ساعة تحذف فيها ملفات هذا الحساب من التخزين (الصور، InBody…)
-- ٢) التطبيق يحذف الملفات
-- ٣) admin_delete_user: يحذف الحساب، وكل بياناته تنحذف بالتسلسل (on delete cascade)
-- ما ينحذف: حسابك أنت، أي حساب إدارة، أو حسابات الشركاء (تنداراو من «إدارة الشركاء»)
create table if not exists public.admin_user_deletes (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  admin_id   uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.admin_user_deletes enable row level security;
revoke all on public.admin_user_deletes from anon, authenticated;

create or replace function public._admin_can_delete(p_user uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare v_type text;
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  if p_user = auth.uid() then raise exception 'cannot_delete_self'; end if;
  if exists (select 1 from app_admins where user_id = p_user) then raise exception 'cannot_delete_admin'; end if;
  select account_type into v_type from profiles where id = p_user;
  if not found then raise exception 'user_not_found'; end if;
  if v_type <> 'trainee' then raise exception 'not_trainee'; end if;
end $$;
revoke all on function public._admin_can_delete(uuid) from public, anon, authenticated;

create or replace function public.admin_prepare_user_delete(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _admin_can_delete(p_user);
  insert into admin_user_deletes (user_id, admin_id) values (p_user, auth.uid())
  on conflict (user_id) do update set admin_id = excluded.admin_id, created_at = now();
end $$;
revoke all on function public.admin_prepare_user_delete(uuid) from public, anon;
grant execute on function public.admin_prepare_user_delete(uuid) to authenticated;

create or replace function public.admin_delete_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_label text;
begin
  perform _admin_can_delete(p_user);
  select p.username || coalesce(' (' || p.full_name || ')', '') into v_label from profiles p where p.id = p_user;
  perform _admin_log('user', p_user::text, 'delete', v_label);
  delete from auth.users where id = p_user;
end $$;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- ملفات الحساب اللي قيد الحذف: الإدارة تقدر تشوف أسماءها وتحذفها خلال ربع ساعة من admin_prepare_user_delete بس
create or replace function public._admin_deleting(p_folder text)
returns boolean language sql stable security definer set search_path = public as $$
  select is_admin() and exists (
    select 1 from admin_user_deletes d
    where d.user_id::text = p_folder and d.created_at > now() - interval '15 minutes');
$$;
revoke all on function public._admin_deleting(text) from public, anon;
grant execute on function public._admin_deleting(text) to authenticated;

drop policy if exists "admin list files of deleted user" on storage.objects;
create policy "admin list files of deleted user" on storage.objects for select to authenticated
  using (bucket_id in ('avatars', 'posts', 'body', 'inbody', 'feedback') and _admin_deleting((storage.foldername(name))[1]));
drop policy if exists "admin delete files of deleted user" on storage.objects;
create policy "admin delete files of deleted user" on storage.objects for delete to authenticated
  using (bucket_id in ('avatars', 'posts', 'body', 'inbody', 'feedback') and _admin_deleting((storage.foldername(name))[1]));


-- ===================== 20260929000670_chat_friends.sql =====================
-- المراسلة للأصدقاء: بعد ما ينقبل طلب الصداقة تنفتح المحادثة على طول
-- قبل: لازم يتابعون بعض (أو مدرب ومتدربه). الحين: أصدقاء، أو يتابعون بعض، أو مدرب ومتدربه.
-- mutual_follow هي شرط المراسلة المستخدم في سياسة الإرسال وصندوق الرسائل والنسخ القديمة من التطبيق.
create or replace function public.mutual_follow(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select a <> b and (
    exists (select 1 from friendships f where f.status = 'accepted'
            and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a)))
    or (exists (select 1 from follows where follower = a and followee = b)
        and exists (select 1 from follows where follower = b and followee = a))
    or exists (select 1 from coach_links l where l.status = 'active'
               and ((l.coach_id = a and l.client_id = b) or (l.coach_id = b and l.client_id = a))));
$$;
revoke all on function public.mutual_follow(uuid, uuid) from public, anon;
grant execute on function public.mutual_follow(uuid, uuid) to authenticated;

-- اللي أقدر أراسلهم، مع نوع العلاقة: friend (صديق) أو mutual (تتابعون بعض) أو coach (مدرب/متدرب)
create or replace function public.message_contacts()
returns table (id uuid, username text, full_name text, avatar_url text, points integer, is_coach boolean, relation text)
language sql stable security definer set search_path = public as $$
  with c as (
    select case when f.requester = auth.uid() then f.addressee else f.requester end as id, 'friend'::text as relation, 1 as rank
    from friendships f where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee)
    union all
    select a.followee, 'mutual', 2
    from follows a join follows b on b.follower = a.followee and b.followee = a.follower
    where a.follower = auth.uid()
    union all
    select case when l.coach_id = auth.uid() then l.client_id else l.coach_id end, 'coach', 3
    from coach_links l where l.status = 'active' and auth.uid() in (l.coach_id, l.client_id)
  ), best as (
    select distinct on (c.id) c.id, c.relation from c where c.id <> auth.uid() order by c.id, c.rank
  )
  select p.id, p.username, p.full_name, p.avatar_url, p.points, p.is_coach, b.relation
  from best b join profiles p on p.id = b.id
  order by p.full_name nulls last, p.username
  limit 500;
$$;
revoke all on function public.message_contacts() from public, anon;
grant execute on function public.message_contacts() to authenticated;

-- النسخ القديمة من التطبيق تقرأ هذي: نفس القائمة بدون نوع العلاقة
create or replace function public.mutual_followers()
returns table (id uuid, username text, full_name text, avatar_url text, points integer, is_coach boolean)
language sql stable security definer set search_path = public as $$
  select m.id, m.username, m.full_name, m.avatar_url, m.points, m.is_coach from message_contacts() m;
$$;
revoke all on function public.mutual_followers() from public, anon;
grant execute on function public.mutual_followers() to authenticated;


-- ===================== 20260929000680_nudge_broadcast.sql =====================
-- =====================================================================
-- «أرسل الحين»: الإدارة ترسل نص تحفيزي الحين بدل ما تنتظر وقته
--   * يوصل للمتدربين اللي أكملوا التسجيل: نفس جنس النص (أو الجميع) ونفس لغته
--   * بشرط نوعه نفسه (بدون شرط الساعة) عشان المتغيرات تتعبّى صح:
--       gym      ما حضر اليوم، واليوم مو يوم راحة في خطته
--       friend   نفس gym + صديقه (أو متابعة متبادلة) حضر اليوم — واسمه مكان {friend}
--       streak   سلسلة يومين فأكثر، آخر حضور أمس، وما حضر اليوم
--       workout  عنده خطة، اليوم مو راحة، وما بدأ تمرين اليوم
--       meal     يتابع أكله (خطة أو سجّل خلال أسبوعين) وما سجّل شي اليوم
--   * يحترم: إيقاف «التحفيز» من الإعدادات، الهدوء من ١٠ الليل لين ٨ الصبح،
--     ٣ تنبيهات باليوم كحد أقصى، ونوع واحد مرة باليوم (نفس سجل المجدول nudge_log)
--   * p_dry_run = true: يرجع العدد بس بدون إرسال (للتأكيد قبل الإرسال)
-- =====================================================================

alter table public.nudge_templates
  add column if not exists last_broadcast_at timestamptz,
  add column if not exists last_broadcast_n  integer;

-- المنطق كله هنا (p_now ثابت في الاختبارات)؛ المستخدمين ما يوصلون لها مباشرة
create or replace function public._nudge_broadcast(p_template uuid, p_now timestamptz, p_send boolean)
returns integer language plpgsql security definer set search_path = public as $$
declare
  t        nudge_templates;
  v_day    date := (p_now at time zone 'Asia/Riyadh')::date;
  v_hour   integer := extract(hour from (p_now at time zone 'Asia/Riyadh'))::integer;
  v_dow    integer := extract(dow from (p_now at time zone 'Asia/Riyadh'))::integer;  -- ٠ = الأحد (مثل الخطة)
  v_start  timestamptz := (v_day::timestamp) at time zone 'Asia/Riyadh';
  v_slot   text;
  v_url    text;
  v_n      integer := 0;
  u        record;
  v_vars   jsonb;
  v_today  jsonb;
  v_rest   boolean;
  v_in     boolean;
  v_gym    text;
  v_friend uuid;
  v_fname  text;
  v_title  text;
  v_body   text;
begin
  select * into t from nudge_templates where id = p_template;
  if t.id is null then raise exception 'nudge_not_found'; end if;
  if v_hour < 8 or v_hour >= 22 then raise exception 'quiet_hours'; end if;

  v_slot := case t.category when 'friend' then 'gym' else t.category end;
  v_url  := case t.category when 'workout' then '/(tabs)/plan' when 'meal' then '/food/add' else '/checkin' end;

  for u in
    select p.id, p.streak, p.last_checkin_on, p.full_name, p.username, p.gym_id,
           (select pl.data from plans pl where pl.user_id = p.id and pl.active limit 1) as plan
    from profiles p left join health_profiles h on h.user_id = p.id
    where p.onboarded
      and p.account_type = 'trainee'
      and coalesce((p.notify_prefs->>'nudges')::boolean, true)
      and coalesce(p.locale, 'ar') = t.locale
      and t.gender in ('all', coalesce(h.gender, 'male'))
      and not exists (select 1 from nudge_log l where l.user_id = p.id and l.day = v_day and l.slot = v_slot)
      and (select count(*) from nudge_log l where l.user_id = p.id and l.day = v_day) < 3
    order by p.id
    limit 20000
  loop
    v_in := exists (select 1 from check_ins c where c.user_id = u.id and c.checked_in_at >= v_start and c.checked_in_at <= p_now);
    v_today := (select d from jsonb_array_elements(coalesce(u.plan->'days', '[]'::jsonb)) d where (d->>'day')::int = v_dow limit 1);
    v_rest := u.plan is not null and (v_today is null or coalesce((v_today->>'rest')::boolean, false));

    continue when case t.category
      when 'gym'     then v_in or v_rest
      when 'friend'  then v_in or v_rest
      when 'streak'  then v_in or coalesce(u.streak, 0) < 2 or u.last_checkin_on is distinct from v_day - 1
      when 'workout' then u.plan is null or v_rest
                          or exists (select 1 from workout_sessions w where w.user_id = u.id and w.started_at >= v_start)
      when 'meal'    then not (u.plan is not null or exists (select 1 from food_logs fl where fl.user_id = u.id and fl.eaten_on > v_day - 14))
                          or exists (select 1 from food_logs fl where fl.user_id = u.id and fl.eaten_on = v_day)
      else true end;

    v_friend := null; v_fname := null;
    if t.category = 'friend' then
      select p2.id, split_part(coalesce(nullif(btrim(p2.full_name), ''), p2.username), ' ', 1)
        into v_friend, v_fname
      from check_ins c join profiles p2 on p2.id = c.user_id left join health_profiles h2 on h2.user_id = p2.id
      where c.checked_in_at >= v_start and c.checked_in_at <= p_now and c.user_id <> u.id
        and p2.presence_visibility <> 'hidden'
        and t.friend_gender in ('all', coalesce(h2.gender, 'all'))
        and (are_friends(u.id, c.user_id) or mutual_follow(u.id, c.user_id))
      order by c.checked_in_at desc limit 1;
      continue when v_friend is null;
    end if;

    if p_send then
      insert into nudge_log (user_id, day, slot, category, template_id) values (u.id, v_day, v_slot, t.category, t.id)
      on conflict do nothing;
      continue when not found;
      select coalesce(nullif(g.name, ''), g.name_en) into v_gym from gyms g where g.id = u.gym_id;
      v_vars := jsonb_build_object(
        'name', split_part(coalesce(nullif(btrim(u.full_name), ''), u.username), ' ', 1),
        'friend', coalesce(v_fname, ''),
        'gym', coalesce(v_gym, case when t.locale = 'en' then 'the gym' else 'النادي' end),
        'streak', u.streak,
        'workout', coalesce(v_today->'focus'->>t.locale, v_today->'focus'->>'ar', ''));
      v_title := left(btrim(_nudge_fill(t.title, v_vars)), 120);
      v_body  := left(btrim(_nudge_fill(t.body, v_vars)), 240);
      perform _notify(u.id, v_friend, 'nudge', t.id,
        jsonb_build_object('title', v_title, 'body', v_body, 'cat', t.category, 'url', v_url), v_url);
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- للإدارة: p_dry_run = true يرجع كم متدرب بيوصله، وبدونها يرسل ويرجع كم انرسل
create or replace function public.admin_broadcast_nudge(p_template uuid, p_dry_run boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer; v_send boolean := not coalesce(p_dry_run, false);
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  v_n := _nudge_broadcast(p_template, now(), v_send);
  if v_send then
    update nudge_templates set last_broadcast_at = now(), last_broadcast_n = v_n where id = p_template;
    perform _admin_log('nudge', p_template::text, 'broadcast', v_n || ' recipients');
  end if;
  return v_n;
end $$;

revoke all on function public._nudge_broadcast(uuid, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.admin_broadcast_nudge(uuid, boolean) from public, anon;
grant execute on function public.admin_broadcast_nudge(uuid, boolean) to authenticated;


-- ===================== 20260929000690_chat_friends_media.sql =====================
-- =====================================================================
-- الرسائل: للأصدقاء بس + إرسال الصور
--   * المحادثة تنفتح بعد ما يقبل الطرف الثاني طلب الصداقة (والمدرب مع متدربه).
--     المتابعة صارت متابعة بس: ما تفتح محادثة. المحادثات القديمة تبقى مقروءة.
--   * الصور: حاوية خاصة chat، المسار <المرسل>/<المستلم>/<ملف>، يشوفها الطرفين بس
--   * رسالة الصورة نصها اختياري؛ الصندوق والإشعار يكتبون «📷 صورة»
-- =====================================================================

-- ---------- شرط المراسلة ----------
-- الاسم باقي mutual_follow لأنه مستخدم في سياسة الإرسال وصندوق الرسائل والنسخ القديمة من التطبيق
create or replace function public.mutual_follow(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select a <> b and (
    exists (select 1 from friendships f where f.status = 'accepted'
            and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a)))
    or exists (select 1 from coach_links l where l.status = 'active'
               and ((l.coach_id = a and l.client_id = b) or (l.coach_id = b and l.client_id = a))));
$$;
revoke all on function public.mutual_follow(uuid, uuid) from public, anon;
grant execute on function public.mutual_follow(uuid, uuid) to authenticated;

-- قائمة «رسالة جديدة»: الأصدقاء والمدرب/المتدرب بس
create or replace function public.message_contacts()
returns table (id uuid, username text, full_name text, avatar_url text, points integer, is_coach boolean, relation text)
language sql stable security definer set search_path = public as $$
  with c as (
    select case when f.requester = auth.uid() then f.addressee else f.requester end as id, 'friend'::text as relation, 1 as rank
    from friendships f where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee)
    union all
    select case when l.coach_id = auth.uid() then l.client_id else l.coach_id end, 'coach', 2
    from coach_links l where l.status = 'active' and auth.uid() in (l.coach_id, l.client_id)
  ), best as (
    select distinct on (c.id) c.id, c.relation from c where c.id <> auth.uid() order by c.id, c.rank
  )
  select p.id, p.username, p.full_name, p.avatar_url, p.points, p.is_coach, b.relation
  from best b join profiles p on p.id = b.id
  order by p.full_name nulls last, p.username
  limit 500;
$$;
revoke all on function public.message_contacts() from public, anon;
grant execute on function public.message_contacts() to authenticated;

-- ---------- صور الرسائل ----------
alter table public.messages
  add column if not exists media_path text,
  add column if not exists media_type text,
  add column if not exists media_w    integer,
  add column if not exists media_h    integer;
alter table public.messages alter column body set default '';
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages drop constraint if exists messages_body_or_media;
alter table public.messages add constraint messages_body_or_media check (
  char_length(body) <= 1000 and (char_length(btrim(body)) >= 1 or media_path is not null));
alter table public.messages drop constraint if exists messages_media_ok;
alter table public.messages add constraint messages_media_ok check (
  (media_path is null and media_type is null)
  or (media_path is not null and media_type is not null and media_type = 'image'
      and char_length(media_path) between 10 and 300 and media_path !~ '\.\.'
      and coalesce(media_w, 1) between 1 and 20000 and coalesce(media_h, 1) between 1 and 20000));

-- الإرسال: صديق (أو مدرب)، والصورة لازم تكون في مجلد المرسل لهالمستلم
drop policy if exists msg_send on public.messages;
create policy msg_send on public.messages for insert to authenticated
  with check (sender = auth.uid() and mutual_follow(sender, recipient)
              and (media_path is null or media_path like sender::text || '/' || recipient::text || '/%'));

-- المستلم لا يغيّر إلا وقت القراءة (والصورة ما تتغير بعد الإرسال)
create or replace function public._msg_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated','anon') and (new.body is distinct from old.body or new.sender is distinct from old.sender
      or new.recipient is distinct from old.recipient or new.created_at is distinct from old.created_at
      or new.media_path is distinct from old.media_path or new.media_type is distinct from old.media_type
      or new.media_w is distinct from old.media_w or new.media_h is distinct from old.media_h) then
    raise exception 'read_only_message';
  end if;
  return new;
end $$;

-- صندوق الرسائل: رسالة الصورة بدون نص تطلع «📷» (التطبيق يترجمها)
create or replace function public.inbox()
returns table (other_id uuid, username text, full_name text, avatar_url text, points integer, is_coach boolean,
               last_body text, last_at timestamptz, last_from_me boolean, unread bigint, can_message boolean)
language sql stable security definer set search_path = public as $$
  with mine as (
    select case when m.sender = auth.uid() then m.recipient else m.sender end as other, m.*
    from messages m where auth.uid() in (m.sender, m.recipient)
  ), last as (
    select distinct on (other) other,
           case when btrim(body) = '' and media_path is not null then '📷' else body end as body,
           created_at, sender = auth.uid() as from_me
    from mine order by other, created_at desc
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

-- إشعار الجوال: الصورة تطلع «📷 صورة» بلغة المستلم
create or replace function public._on_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prev text := left(btrim(new.body), 120);
begin
  if v_prev = '' and new.media_path is not null then
    v_prev := case when (select locale from profiles where id = new.recipient) = 'en' then '📷 Photo' else '📷 صورة' end;
  end if;
  perform _push(new.recipient, 'message', new.sender, jsonb_build_object('preview', v_prev), '/chat/' || new.sender);
  return null;
end $$;
revoke all on function public._on_message() from public, anon, authenticated;

-- ---------- حاوية الصور (خاصة) ----------
create or replace function public._try_uuid(p text)
returns uuid language sql immutable as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end;
$$;

insert into storage.buckets (id, name, public) values ('chat', 'chat', false) on conflict (id) do nothing;
do $$
begin
  update storage.buckets set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif']
  where id = 'chat';
exception when undefined_column then null;  -- بيئة الاختبار
end $$;

-- الرفع: في مجلدك، ولصديق (أو مدرب) بس
drop policy if exists "chat upload to friend" on storage.objects;
create policy "chat upload to friend" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat' and (storage.foldername(name))[1] = auth.uid()::text
              and coalesce(mutual_follow(auth.uid(), _try_uuid((storage.foldername(name))[2])), false));
-- العرض: المرسل والمستلم بس
drop policy if exists "chat read both sides" on storage.objects;
create policy "chat read both sides" on storage.objects for select to authenticated
  using (bucket_id = 'chat' and auth.uid()::text in ((storage.foldername(name))[1], (storage.foldername(name))[2]));
-- الحذف: صاحب الصورة
drop policy if exists "chat delete own" on storage.objects;
create policy "chat delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'chat' and (storage.foldername(name))[1] = auth.uid()::text);

-- حذف حساب من الإدارة يشمل صور الرسائل
drop policy if exists "admin list files of deleted user" on storage.objects;
create policy "admin list files of deleted user" on storage.objects for select to authenticated
  using (bucket_id in ('avatars', 'posts', 'body', 'inbody', 'feedback', 'chat') and _admin_deleting((storage.foldername(name))[1]));
drop policy if exists "admin delete files of deleted user" on storage.objects;
create policy "admin delete files of deleted user" on storage.objects for delete to authenticated
  using (bucket_id in ('avatars', 'posts', 'body', 'inbody', 'feedback', 'chat') and _admin_deleting((storage.foldername(name))[1]));


-- ===================== 20260929000700_chat_video.sql =====================
-- =====================================================================
-- فيديو في الرسائل (نسخة التطبيق اللي فيها مشغّل فيديو)
--   * نوع الوسائط: image أو video، ومدة الفيديو بالثواني (حد ١٠ دقايق للحماية؛ التطبيق يحدّه بدقيقة)
--   * الحاوية chat تقبل mp4/mov وحجم لين ٥٠ ميقا
--   * الصندوق يكتب «🎥» والإشعار «🎥 فيديو»
-- =====================================================================

alter table public.messages add column if not exists media_dur numeric(6,1);

alter table public.messages drop constraint if exists messages_media_ok;
alter table public.messages add constraint messages_media_ok check (
  (media_path is null and media_type is null and media_dur is null)
  or (media_path is not null and media_type is not null and media_type in ('image', 'video')
      and char_length(media_path) between 10 and 300 and media_path !~ '\.\.'
      and coalesce(media_w, 1) between 1 and 20000 and coalesce(media_h, 1) between 1 and 20000
      and (media_dur is null or (media_type = 'video' and media_dur between 0 and 600))));

-- المستلم لا يغيّر إلا وقت القراءة
create or replace function public._msg_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated','anon') and (new.body is distinct from old.body or new.sender is distinct from old.sender
      or new.recipient is distinct from old.recipient or new.created_at is distinct from old.created_at
      or new.media_path is distinct from old.media_path or new.media_type is distinct from old.media_type
      or new.media_w is distinct from old.media_w or new.media_h is distinct from old.media_h
      or new.media_dur is distinct from old.media_dur) then
    raise exception 'read_only_message';
  end if;
  return new;
end $$;

-- صندوق الرسائل: 📷 للصورة و 🎥 للفيديو لو ما معها نص
create or replace function public.inbox()
returns table (other_id uuid, username text, full_name text, avatar_url text, points integer, is_coach boolean,
               last_body text, last_at timestamptz, last_from_me boolean, unread bigint, can_message boolean)
language sql stable security definer set search_path = public as $$
  with mine as (
    select case when m.sender = auth.uid() then m.recipient else m.sender end as other, m.*
    from messages m where auth.uid() in (m.sender, m.recipient)
  ), last as (
    select distinct on (other) other,
           case when btrim(body) = '' and media_path is not null
                then case when media_type = 'video' then '🎥' else '📷' end
                else body end as body,
           created_at, sender = auth.uid() as from_me
    from mine order by other, created_at desc
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

-- إشعار الجوال بلغة المستلم
create or replace function public._on_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prev text := left(btrim(new.body), 120); v_en boolean;
begin
  if v_prev = '' and new.media_path is not null then
    v_en := (select locale from profiles where id = new.recipient) = 'en';
    v_prev := case when new.media_type = 'video' then case when v_en then '🎥 Video' else '🎥 فيديو' end
                   else case when v_en then '📷 Photo' else '📷 صورة' end end;
  end if;
  perform _push(new.recipient, 'message', new.sender, jsonb_build_object('preview', v_prev), '/chat/' || new.sender);
  return null;
end $$;
revoke all on function public._on_message() from public, anon, authenticated;

-- الحاوية: فيديو mp4/mov لين ٥٠ ميقا
do $$
begin
  update storage.buckets set file_size_limit = 52428800,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/x-m4v']
  where id = 'chat';
exception when undefined_column then null;  -- بيئة الاختبار
end $$;


-- ===================== 20260929000710_barcode_ai.sql =====================
-- =====================================================================
-- البحث عن منتج بالباركود بالذكاء الاصطناعي (بحث الويب) لما ما يكون في Open Food Facts
--   * حدود الذكاء الاصطناعي من لوحة التحكم (app_settings.ai_limits):
--       بحث الباركود: مرتين باليوم لكل مستخدم افتراضياً، وتحليل صور الوجبات: ٢٥ باليوم
--     (المنتجات الموجودة في القاعدة المفتوحة أو اللي انبحثت قبل ما تنحسب من الحد)
--   * barcode_products: ذاكرة مشتركة للنتائج. أول واحد يمسح المنتج يدفع البحث، والباقين يطلع لهم فوراً.
--     الكتابة من دالة الخادم فقط (service role). «ما لقيناه» ينحفظ ٧ أيام بس عشان ما نكرر البحث كل مرة.
-- =====================================================================

alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check check (kind in ('meal_photo', 'barcode'));

-- التحقق من إعدادات لوحة التحكم (نفس تنبيه السعرات + حدود الذكاء الاصطناعي)
create or replace function public._app_settings_guard()
returns trigger language plpgsql set search_path = public as $$
declare v jsonb := new.value; t integer; b integer; m integer;
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if new.key = 'calorie_alert' then
    begin t := (v->>'threshold')::integer; exception when others then t := null; end;
    if t is null or t < 50 or t > 500 then raise exception 'bad_value'; end if;
    if coalesce(jsonb_typeof(v->'enabled'), '') <> 'boolean' then raise exception 'bad_value'; end if;
    if char_length(btrim(coalesce(v->>'title_ar', ''))) not between 2 and 80
       or char_length(btrim(coalesce(v->>'body_ar', ''))) not between 2 and 200
       or char_length(coalesce(v->>'title_en', '')) > 80 or char_length(coalesce(v->>'body_en', '')) > 200 then
      raise exception 'bad_value';
    end if;
    -- نخزن فقط المفاتيح المعروفة
    new.value := jsonb_build_object('enabled', (v->>'enabled')::boolean, 'threshold', t,
      'title_ar', btrim(v->>'title_ar'), 'body_ar', btrim(v->>'body_ar'),
      'title_en', nullif(btrim(coalesce(v->>'title_en', '')), ''), 'body_en', nullif(btrim(coalesce(v->>'body_en', '')), ''));
  elsif new.key = 'ai_limits' then
    begin
      b := (v->>'barcode_per_day')::integer;
      m := (v->>'meal_photos_per_day')::integer;
    exception when others then b := null;
    end;
    if b is null or m is null or b < 0 or b > 100 or m < 0 or m > 200 then raise exception 'bad_value'; end if;
    new.value := jsonb_build_object('barcode_per_day', b, 'meal_photos_per_day', m);
  end if;
  return new;
end $$;

insert into public.app_settings (key, value)
values ('ai_limits', jsonb_build_object('barcode_per_day', 2, 'meal_photos_per_day', 25))
on conflict (key) do nothing;

-- يحجز استخدام واحد إذا ما وصل المستخدم حده اليومي (من لوحة التحكم)، ويرجع كم باقي
create or replace function public.ai_take(p_kind text)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  s jsonb := (select value from app_settings where key = 'ai_limits');
  cap int;
  used int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  cap := case p_kind
    when 'meal_photo' then coalesce((s->>'meal_photos_per_day')::int, 25)
    when 'barcode' then coalesce((s->>'barcode_per_day')::int, 2)
  end;
  if cap is null then raise exception 'bad_status'; end if;
  perform pg_advisory_xact_lock(hashtext('ai_take:' || auth.uid()::text || ':' || p_kind));
  select count(*) into used from ai_usage where user_id = auth.uid() and kind = p_kind and created_at > now() - interval '1 day';
  if used >= cap then raise exception 'rate_limited'; end if;
  insert into ai_usage (user_id, kind) values (auth.uid(), p_kind);
  return cap - used - 1;
end $$;
revoke all on function public.ai_take(text) from public, anon;
grant execute on function public.ai_take(text) to authenticated;

create table if not exists public.barcode_products (
  code        text primary key check (code ~ '^[0-9]{8,14}$'),
  found       boolean not null,
  source      text not null default 'ai' check (source in ('ai')),
  -- المنتج بعد التنظيف: الأسماء، الوحدة، القيم لكل ١٠٠ وللحصة، حجم الحصة والعبوة
  product     jsonb check (product is null or (jsonb_typeof(product) = 'object' and pg_column_size(product) < 8000)),
  confidence  text check (confidence in ('high', 'medium', 'low')),
  source_url  text check (source_url is null or (char_length(source_url) <= 500 and source_url ~ '^https://')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (found = (product is not null))
);
alter table public.barcode_products enable row level security;
drop policy if exists barcode_products_read on public.barcode_products;
create policy barcode_products_read on public.barcode_products for select to authenticated using (true);
revoke insert, update, delete on public.barcode_products from anon, authenticated;
