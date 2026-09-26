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
