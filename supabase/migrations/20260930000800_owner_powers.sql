-- =====================================================================
-- مالك التطبيق (هو بس، مو كل مشرف):
--   * شارة «المالك» بدل الرتبة
--   * كل صلاحيات النشر: النصائح وجداول التمارين بدون شرط الرتبة
--   * يضغط مطوّل على أي جزء في التطبيق ويخفيه عن الكل أو يرجّعه (app_hidden)
-- =====================================================================

alter table public.profiles add column if not exists is_owner boolean not null default false;
-- (ما ينعدّل من التطبيق: تعديل profiles مسموح بس للأعمدة اللي لها صلاحية، وهذا مو منها)

-- صاحب التطبيق
update public.profiles set is_owner = true where id = 'c152b11b-8139-4553-811f-226935f18c3f';

create or replace function public.is_owner(p_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select p_uid is not null and coalesce((select is_owner from profiles where id = p_uid), false);
$$;
revoke all on function public.is_owner(uuid) from public, anon;
grant execute on function public.is_owner(uuid) to authenticated;

-- النشر: المالك مفتوح له كل شي (مثل المدرب الموثّق)
create or replace function public.can_publish(p_kind text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.is_owner or p.is_coach or rank_level(p.points) >= case p_kind when 'tip' then 2 when 'program' then 3 else 99 end
    from profiles p where p.id = auth.uid()
  ), false);
$$;
revoke all on function public.can_publish(text) from public, anon;
grant execute on function public.can_publish(text) to authenticated;

-- ---------- أجزاء التطبيق المخفية (يخفيها المالك بالضغط المطوّل) ----------
-- key = اسم الجزء في التطبيق (مثل home.sleep). الكل يقرأ القائمة، والمالك بس يضيف ويشيل.
create table if not exists public.app_hidden (
  key        text primary key check (key ~ '^[a-z][a-zA-Z0-9_.:-]{1,80}$'),
  label      text check (label is null or char_length(label) <= 120),
  hidden_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  hidden_at  timestamptz not null default now()
);
alter table public.app_hidden enable row level security;
drop policy if exists app_hidden_read on public.app_hidden;
create policy app_hidden_read on public.app_hidden for select to authenticated using (true);
drop policy if exists app_hidden_owner on public.app_hidden;
create policy app_hidden_owner on public.app_hidden for all to authenticated using (is_owner()) with check (is_owner());
grant select, insert, update, delete on public.app_hidden to authenticated;
revoke all on public.app_hidden from anon;
