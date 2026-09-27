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
