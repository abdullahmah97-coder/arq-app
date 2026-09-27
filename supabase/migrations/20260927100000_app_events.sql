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
