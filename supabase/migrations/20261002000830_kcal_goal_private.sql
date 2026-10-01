-- =====================================================================
-- هدف السعرات صار خاص: ينتقل من profiles (يقرأها أي مستخدم مسجّل) إلى health_profiles (صاحبها بس)
--   * ننسخ الأهداف الموجودة ونفرّغها من profiles
--   * نسخ التطبيق القديمة اللي تكتب profiles.kcal_goal: الكتابة تنتقل تلقائياً لـ health_profiles
--     و profiles.kcal_goal يبقى فاضي دايماً (العمود باقي عشان الكتابة القديمة ما تفشل)
-- يتشغّل أكثر من مرة بدون مشاكل. الترتيب مهم: نشيل المحوّل أول عشان تفريغ profiles ما يمسح النسخة
-- =====================================================================
drop trigger if exists kcal_goal_private on public.profiles;

alter table public.health_profiles add column if not exists kcal_goal integer
  check (kcal_goal is null or kcal_goal between 800 and 6000);

-- نسخ الأهداف الحالية (ولو ما عنده صف صحي، ننشئه) ثم تفريغها من الجدول العام
insert into public.health_profiles (user_id, kcal_goal)
select p.id, p.kcal_goal from public.profiles p where p.kcal_goal is not null
on conflict (user_id) do update set kcal_goal = excluded.kcal_goal;
update public.profiles set kcal_goal = null where kcal_goal is not null;

-- أي كتابة على profiles.kcal_goal (نسخ قديمة، وتشمل «رجّع هدف الخطة» = null) تروح للجدول الخاص
create or replace function public._kcal_goal_private()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into health_profiles (user_id, kcal_goal) values (new.id, new.kcal_goal)
  on conflict (user_id) do update set kcal_goal = excluded.kcal_goal;
  new.kcal_goal := null;
  return new;
end $$;
revoke all on function public._kcal_goal_private() from public, anon, authenticated;

create trigger kcal_goal_private before update of kcal_goal on public.profiles
  for each row execute function public._kcal_goal_private();
