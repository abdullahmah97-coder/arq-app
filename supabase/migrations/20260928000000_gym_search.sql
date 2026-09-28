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
