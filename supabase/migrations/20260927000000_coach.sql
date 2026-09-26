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
