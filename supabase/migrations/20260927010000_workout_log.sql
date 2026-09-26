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
