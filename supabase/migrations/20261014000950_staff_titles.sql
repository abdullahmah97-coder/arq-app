-- =====================================================================
-- ألقاب فريق الإدارة على الحساب: شارة جنب الاسم بدل الرتبة (مثل شارة المالك).
--   * مالك التطبيق شارته «CEO» من التطبيق نفسه (social.owner)، وما يحتاج لقب هنا.
--   * أي حساب ثاني يقدر المالك يعطيه لقب قصير (مثل XO) يطلع للناس جنب اسمه.
--   * اللقب للعرض بس: ما يعطي أي صلاحية (الإدارة تبقى من app_admins، والمالك من is_owner).
--   * محد يحط لنفسه لقب: التحديث على profiles بأعمدة محددة وهذا مو منها، وفوقه حارس يرفض أي تغيير من التطبيق.
--   المالك يحدده من SQL Editor أو مكتب الويب:
--     update profiles set staff_title = 'XO' where username = 'motaz';
--     update profiles set staff_title = null where username = 'motaz';   -- يشيله
-- =====================================================================

alter table public.profiles add column if not exists staff_title text
  check (staff_title is null or (char_length(staff_title) between 1 and 16 and staff_title = btrim(staff_title)));

create or replace function public._staff_title_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.staff_title is distinct from (case when tg_op = 'UPDATE' then old.staff_title end) then
    raise exception 'not_allowed';
  end if;
  return new;
end $$;
revoke all on function public._staff_title_guard() from public, anon, authenticated;
create or replace trigger profiles_staff_title_guard before insert or update of staff_title on public.profiles
  for each row execute function public._staff_title_guard();
