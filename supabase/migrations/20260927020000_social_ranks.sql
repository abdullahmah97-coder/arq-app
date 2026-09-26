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
