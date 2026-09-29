-- =====================================================================
-- هدف السعرات اليومي الشخصي: المستخدم يعدّله من مربع السعرات
--   null = يمشي على هدف خطته. الكربوهيدرات والدهون تتعدّل بنفس النسبة والبروتين يبقى (بالتطبيق).
-- =====================================================================
alter table public.profiles add column if not exists kcal_goal integer
  check (kcal_goal is null or kcal_goal between 800 and 6000);
grant update (kcal_goal) on public.profiles to authenticated;
