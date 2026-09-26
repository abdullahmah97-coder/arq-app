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
