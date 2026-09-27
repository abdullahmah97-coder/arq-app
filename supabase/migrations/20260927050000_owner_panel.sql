-- =====================================================================
-- لوحة المالك: تقارير المختبرين، طلبات المتاجر، وتوثيق المدربين
--   المالك يُضاف مرة وحدة من SQL Editor في Supabase:
--   insert into public.app_admins (user_id) select id from auth.users where email = '<بريدك>';
-- =====================================================================
create table public.app_admins (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table public.app_admins enable row level security;
create policy admins_self on public.app_admins for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.app_admins from anon, authenticated;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------- تقارير المختبرين: يقرأها المالك فقط ويحدّث حالتها وملاحظته ----------
alter table public.beta_feedback
  add column if not exists admin_note text check (char_length(admin_note) <= 1000),
  add column if not exists screenshot_path text check (char_length(screenshot_path) <= 200),
  add column if not exists updated_at timestamptz;

drop policy if exists "send own feedback" on public.beta_feedback;
create policy "send own feedback" on public.beta_feedback for insert
  with check (user_id = auth.uid() and status = 'new' and admin_note is null
              and (screenshot_path is null or split_part(screenshot_path, '/', 1) = auth.uid()::text));
create policy "owner reads all feedback" on public.beta_feedback for select to authenticated using (is_admin());
create policy "owner triages feedback" on public.beta_feedback for update to authenticated using (is_admin()) with check (is_admin());

-- المالك يغيّر الحالة والملاحظة فقط (نص التقرير وصاحبه ثابتين)
create or replace function public._feedback_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated','anon') and (new.message is distinct from old.message or new.user_id is distinct from old.user_id
      or new.category is distinct from old.category or new.created_at is distinct from old.created_at) then
    raise exception 'report_locked';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger feedback_guard before update on public.beta_feedback for each row execute function public._feedback_guard();

-- صور التقارير: خاصة — صاحب التقرير يرفع في مجلده، والمالك فقط يقرأ الكل
insert into storage.buckets (id, name, public) values ('feedback', 'feedback', false) on conflict (id) do nothing;
create policy "feedback shots upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "feedback shots read" on storage.objects for select to authenticated
  using (bucket_id = 'feedback' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------- طلبات المتاجر: المالك يشوف الكل ويوافق أو يرفض ----------
create policy brands_admin_read on public.brands for select to authenticated using (is_admin());
create policy brands_admin_review on public.brands for update to authenticated using (is_admin()) with check (true);
create policy products_admin_read on public.brand_products for select to authenticated using (is_admin());

create or replace function public._brand_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated','anon') then
    if tg_op = 'INSERT' then
      new.status := 'pending'; new.review_note := null;
    elsif (new.status is distinct from old.status or new.review_note is distinct from old.review_note) and not is_admin() then
      raise exception 'status_locked';
    end if;
  end if;
  return new;
end $$;

-- ---------- توثيق المدربين ----------
create or replace function public.set_coach(p_user uuid, p_value boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  update profiles set is_coach = p_value where id = p_user;
end $$;
revoke all on function public.set_coach(uuid, boolean) from public, anon;
grant execute on function public.set_coach(uuid, boolean) to authenticated;

-- ملخص للوحة: عدد التقارير الجديدة وطلبات المتاجر المعلّقة
create or replace function public.owner_counts()
returns table (new_reports bigint, pending_brands bigint)
language sql stable security definer set search_path = public as $$
  select (select count(*) from beta_feedback where status = 'new'), (select count(*) from brands where status = 'pending')
  where is_admin();
$$;
revoke all on function public.owner_counts() from public, anon;
grant execute on function public.owner_counts() to authenticated;
