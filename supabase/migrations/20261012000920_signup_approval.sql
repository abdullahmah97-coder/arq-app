-- =====================================================================
-- موافقة الإدارة على كل حساب جديد:
--   ١) أي حساب يسجّل من الحين يبدأ «بانتظار الموافقة» (pending)، والحسابات الموجودة قبل كذا كلها مقبولة.
--   ٢) المشرفين يوصلهم إشعار مع كل تسجيل، ويقبلون أو يرفضون من لوحة إدارة التطبيق ← طلبات التسجيل.
--   ٣) اللي ما انقبل ما يقدر ينشر أو يعلّق أو يراسل أو يتابع أو يسجّل حضور أو يحجز أو يستخدم الذكاء الاصطناعي
--      (حماية في الخادم، فوق شاشة الانتظار في التطبيق). يقدر يحذف حسابه ويسجّل جهازه للإشعارات بس.
--   ٤) لما ينقبل يوصله إشعار «تم قبول حسابك» ويكمّل إعداد حسابه.
-- =====================================================================

-- الحسابات الموجودة: مقبولة (العمود ينضاف بقيمة approved)، وبعدها الافتراضي للجديد pending
alter table public.profiles add column if not exists approval text not null default 'approved'
  check (approval in ('pending', 'approved', 'rejected'));
alter table public.profiles alter column approval set default 'pending';
alter table public.profiles add column if not exists approval_at timestamptz;
alter table public.profiles add column if not exists approval_by uuid references public.profiles(id) on delete set null;
create index if not exists profiles_approval_queue on public.profiles (approval, created_at desc) where approval <> 'approved';
-- المستخدم ما يقدر يغيّر حالته (تعديل profiles بأعمدة محددة فقط، وهذي مو منها)

-- مفتاح التشغيل من لوحة الإدارة: app_settings.signup_approval = {"enabled": true|false}
-- موقّف = كل حساب جديد مقبول على طول (لو كثرت التسجيلات وتبي تفتح التطبيق للكل)
insert into public.app_settings (key, value) values ('signup_approval', '{"enabled": true}'::jsonb) on conflict (key) do nothing;

create or replace function public._signup_approval_default()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not coalesce((select (value->>'enabled')::boolean from app_settings where key = 'signup_approval'), true) then
    new.approval := 'approved';
    new.approval_at := now();
  end if;
  return new;
end $$;
revoke all on function public._signup_approval_default() from public, anon, authenticated;
create or replace trigger signup_approval_default before insert on public.profiles for each row execute function public._signup_approval_default();

create or replace function public._is_approved(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_uid and approval = 'approved');
$$;
revoke all on function public._is_approved(uuid) from public, anon, authenticated;

-- حارس الإضافة: أي طلب من مستخدم ما انقبل يرفض. بدون مستخدم (الخادم، المهام المجدولة، إنشاء الحساب) يمر.
-- security definer عشان يشتغل حتى داخل دوال الخادم اللي تضيف باسم المستخدم (مثل تسجيل الحضور)
create or replace function public._require_approved()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is not null and not _is_approved(v_uid) then raise exception 'not_approved'; end if;
  return new;
end $$;
revoke all on function public._require_approved() from public, anon, authenticated;

-- الجداول اللي تمس الناس الثانيين أو تكلّف (محتوى، تواصل، حضور، حجوزات، طلبات شراكة، ذكاء اصطناعي، بلاغات)
do $$
declare t text;
begin
  foreach t in array array[
    'posts', 'comments', 'checkin_comments', 'messages', 'follows', 'friendships',
    'post_likes', 'checkin_likes', 'tip_likes', 'tips', 'user_programs', 'challenges', 'challenge_members',
    'check_ins', 'gym_reviews', 'gym_review_replies', 'coach_reviews', 'review_flags', 'amenity_votes', 'brand_followers',
    'gym_feedback', 'class_bookings', 'venue_bookings', 'center_appointments', 'membership_requests', 'meal_subscriptions',
    'club_requests', 'coach_links', 'coach_profiles', 'ai_usage', 'content_reports'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('create or replace trigger zz_require_approved before insert on public.%I for each row execute function public._require_approved()', t);
    end if;
  end loop;
end $$;

-- كل تسجيل جديد: إشعار للمشرفين (يفتح لوحة إدارة التطبيق)
create or replace function public._signup_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.approval = 'pending' then
    perform _notify_admins('signup:' || new.id,
      'حساب جديد ينتظر موافقتك',
      coalesce(nullif(btrim(new.full_name), ''), '@' || new.username) || ' سجّل في أرك. افتح لوحة إدارة التطبيق ← طلبات التسجيل.',
      'New sign-up waiting for you',
      coalesce(nullif(btrim(new.full_name), ''), '@' || new.username) || ' joined ARQ. Open App management → Sign-up requests.',
      new.id);
  end if;
  return new;
end $$;
revoke all on function public._signup_notify() from public, anon, authenticated;
create or replace trigger signup_notify after insert on public.profiles for each row execute function public._signup_notify();

-- ---------- لوحة الإدارة ----------
create or replace function public.admin_signups(p_status text default 'pending', p_limit integer default 100)
returns table (id uuid, username text, full_name text, avatar_url text, email text, gender text, account_type text,
               created_at timestamptz, approval text, approval_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  if p_status is null or p_status not in ('pending', 'approved', 'rejected') then raise exception 'bad_status'; end if;
  return query
    select p.id, p.username, p.full_name, p.avatar_url, u.email::text, h.gender, p.account_type,
           p.created_at, p.approval, p.approval_at, u.last_sign_in_at
      from profiles p
      left join auth.users u on u.id = p.id
      left join health_profiles h on h.user_id = p.id
     where p.approval = p_status
     order by case when p_status = 'pending' then p.created_at end asc,
              coalesce(p.approval_at, p.created_at) desc
     limit least(greatest(coalesce(p_limit, 100), 1), 300);
end $$;
revoke all on function public.admin_signups(text, integer) from public, anon;
grant execute on function public.admin_signups(text, integer) to authenticated;

create or replace function public.admin_signup_counts()
returns integer language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  return (select count(*)::int from profiles where approval = 'pending');
end $$;
revoke all on function public.admin_signup_counts() from public, anon;
grant execute on function public.admin_signup_counts() to authenticated;

-- قبول أو رفض (أو إرجاع للانتظار). يرجع عدد الحسابات اللي تغيّرت
create or replace function public.admin_set_approval(p_users uuid[], p_approval text, p_note text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  n int := 0;
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  if p_approval is null or p_approval not in ('pending', 'approved', 'rejected') then raise exception 'bad_status'; end if;
  if coalesce(array_length(p_users, 1), 0) = 0 then return 0; end if;
  if array_length(p_users, 1) > 300 then raise exception 'too_many_rows'; end if;
  -- المشرف ما يغيّر حالته (ولا يقفل نفسه برا التطبيق)
  if auth.uid() = any (p_users) then raise exception 'cannot_change_self'; end if;
  for v_id in
    update profiles set approval = p_approval, approval_at = now(), approval_by = auth.uid()
     where id = any (p_users) and approval is distinct from p_approval
    returning id
  loop
    n := n + 1;
    if p_approval = 'approved' then
      perform _notice(v_id, 'approved:' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
        'تم قبول حسابك 🎉', 'حياك في أرك! افتح التطبيق وكمّل إعداد حسابك.',
        'You''re in 🎉', 'Welcome to ARQ! Open the app to finish setting up your account.', '/', v_id);
    end if;
    perform _admin_log('approval', v_id::text, p_approval, p_note);
  end loop;
  return n;
end $$;
revoke all on function public.admin_set_approval(uuid[], text, text) from public, anon;
grant execute on function public.admin_set_approval(uuid[], text, text) to authenticated;
