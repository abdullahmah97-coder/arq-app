-- =====================================================================
-- عدّاد الذكاء الاصطناعي: نعرف كل استدعاء كم كلّف، مو بس كم مرة (الموجة ١ من خطة Claude)
--   * ai_usage: أعمدة جديدة للنموذج والتوكنات (الداخل، الطالع، المقروء من الكاش، المكتوب للكاش) ووقت تسجيلها.
--     كلها تقبل null: الصفوف القديمة، والاستدعاء اللي فشل قبل ما يرجع رد، تبقى بدون أرقام.
--   * نوعين جداد: coach (المدرب الذكي، ٤٠ رسالة باليوم) و inbody (قراءة تقرير InBody، ١٠ باليوم).
--     قبل كانوا برا ai_take: المدرب يعد coach_log، و InBody يعد التقارير المحفوظة بس (القراءة بدون حفظ ما لها حد).
--   * ai_take: نفس الدالة بالحرف، وفيها الحدين الجداد (آخر ٢٤ ساعة، ونفس القفل لكل مستخدم ونوع).
--   * ai_usage_note: دالة الخادم تناديها بعد رد النموذج بتوكن المستخدم (لو فشلت تنكتب بالسجل بس، ما توصل للمستخدم):
--     تكتب الأرقام على آخر صف للمستخدم نفسه من نفس النوع، من آخر ١٥ دقيقة، وما انكتبت أرقامه قبل.
--     ما فيه صف؟ ما تسوي شي وما ترجع خطأ. كل رقم بين ٠ و ٥ مليون، واسم النموذج ٦٠ حرف بالأكثر.
--     الأرقام ما تأثر على الحد: ai_take يعد الصفوف، مو التوكنات.
--   * office_overview: نفس الدالة بالحرف، بس ai.usage فيه coach و inbody، و ai.fixed_caps فيه حدهم.
--   الشرح: docs/office-web.md (القسم ٣.٩ والقسم ٨)
--   التطبيق: SQL Editor (الصق الملف كامل ← Run) أو npx supabase db push — مو MCP apply_migration (يعلق على revoke)
-- =====================================================================

-- تعديل ai_usage يقفل الجدول لين يخلص الترحيل: لو مشغول أكثر من ٥ ثواني نفشل بدل ما توقف طلبات الذكاء الاصطناعي وراه
-- (set local = لهذا الترحيل بس؛ لو فشل، أعد تشغيله)
set local lock_timeout = '5s';

-- ---------- أعمدة التوكنات (تقبل null) ----------
alter table public.ai_usage
  add column if not exists model              text,
  add column if not exists input_tokens       integer,
  add column if not exists output_tokens      integer,
  add column if not exists cache_read_tokens  integer,
  add column if not exists cache_write_tokens integer,
  add column if not exists recorded_at        timestamptz;

alter table public.ai_usage drop constraint if exists ai_usage_model_len;
alter table public.ai_usage add constraint ai_usage_model_len check (model is null or char_length(model) <= 60);
alter table public.ai_usage drop constraint if exists ai_usage_tokens_range;
alter table public.ai_usage add constraint ai_usage_tokens_range check (
      coalesce(input_tokens, 0)       between 0 and 5000000
  and coalesce(output_tokens, 0)      between 0 and 5000000
  and coalesce(cache_read_tokens, 0)  between 0 and 5000000
  and coalesce(cache_write_tokens, 0) between 0 and 5000000);

-- ---------- النوعين الجداد: coach و inbody ----------
alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check
  check (kind in ('meal_photo', 'barcode', 'plan', 'office', 'coach', 'inbody'));

-- يحجز استخدام واحد إذا ما وصل المستخدم حده اليومي، ويرجع كم باقي
create or replace function public.ai_take(p_kind text)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  s jsonb := (select value from app_settings where key = 'ai_limits');
  cap int;
  used int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  cap := case p_kind
    when 'meal_photo' then coalesce((s->>'meal_photos_per_day')::int, 25)
    when 'barcode' then coalesce((s->>'barcode_per_day')::int, 2)
    when 'plan' then 8
    when 'office' then 80
    when 'coach' then 40
    when 'inbody' then 10
  end;
  if cap is null then raise exception 'bad_status'; end if;
  perform pg_advisory_xact_lock(hashtext('ai_take:' || auth.uid()::text || ':' || p_kind));
  select count(*) into used from ai_usage where user_id = auth.uid() and kind = p_kind and created_at > now() - interval '1 day';
  if used >= cap then raise exception 'rate_limited'; end if;
  insert into ai_usage (user_id, kind) values (auth.uid(), p_kind);
  return cap - used - 1;
end $$;
revoke all on function public.ai_take(text) from public, anon;
grant execute on function public.ai_take(text) to authenticated;

-- يسجّل توكنات رد النموذج على آخر صف حجزه المستخدم بـ ai_take من نفس النوع (آخر ١٥ دقيقة وما انسجل قبل).
-- ما فيه صف = ما تسوي شي. الرقم الفاضي (null) يبقى فاضي، والباقي بين ٠ و ٥ مليون.
create or replace function public.ai_usage_note(p_kind text, p_model text, p_input integer, p_output integer,
                                                p_cache_read integer, p_cache_write integer)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_id bigint;
begin
  if auth.uid() is null or p_kind is null then return; end if;
  -- نفس قفل ai_take: ردّين بنفس اللحظة ما يكتبون على نفس الصف
  perform pg_advisory_xact_lock(hashtext('ai_take:' || auth.uid()::text || ':' || p_kind));
  select id into v_id from ai_usage
   where user_id = auth.uid() and kind = p_kind and recorded_at is null
     and created_at > now() - interval '15 minutes'
   order by created_at desc, id desc
   limit 1;
  if v_id is null then return; end if;
  update ai_usage set
    model              = left(nullif(btrim(p_model), ''), 60),
    input_tokens       = case when p_input is null then null else least(greatest(p_input, 0), 5000000) end,
    output_tokens      = case when p_output is null then null else least(greatest(p_output, 0), 5000000) end,
    cache_read_tokens  = case when p_cache_read is null then null else least(greatest(p_cache_read, 0), 5000000) end,
    cache_write_tokens = case when p_cache_write is null then null else least(greatest(p_cache_write, 0), 5000000) end,
    recorded_at        = now()
  where id = v_id and user_id = auth.uid();
end $$;
revoke all on function public.ai_usage_note(text, text, integer, integer, integer, integer) from public, anon;
grant execute on function public.ai_usage_note(text, text, integer, integer, integer, integer) to authenticated;

-- =====================================================================
-- اللقطة office_overview: نفس دالة 20261008000890_office_web.sql بالحرف،
-- والفرق بس بقسم ai: usage فيه coach و inbody، و fixed_caps فيه حدهم (٤٠ و ١٠).
-- =====================================================================
create or replace function public.office_overview(p_days integer default 7)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  n        int  := least(greatest(coalesce(p_days, 7), 1), 90);
  d0       date := app_today();
  d_cur    date;           -- أول يوم بالفترة الحالية
  d_prev   date;           -- أول يوم بالفترة السابقة
  t_now    timestamptz := now();
  t0       timestamptz;    -- بداية اليوم بتوقيت الرياض
  t1       timestamptz;    -- بداية بكرة
  t_cur    timestamptz;
  t_prev   timestamptz;
  v_admins uuid[];
  v_activity jsonb; v_bookings jsonb; v_store jsonb; v_community jsonb; v_partners jsonb;
  v_reports jsonb; v_marketing jsonb; v_ai jsonb; v_office jsonb;
  j1 jsonb; j2 jsonb; j3 jsonb; j4 jsonb; j5 jsonb; j6 jsonb; j7 jsonb; j8 jsonb;
begin
  -- الأدمن من التطبيق، أو جلسة القاعدة نفسها بدون توكن (موصّل Supabase / SQL Editor / service_role).
  -- session_user ما ينفع هنا (بالـ API هو authenticator). anon و authenticated بدون أدمن: مرفوضين
  if not (coalesce(is_admin(), false)
          or (auth.uid() is null
              and coalesce(nullif(current_setting('role', true), ''), 'none') in ('none', 'postgres', 'service_role'))) then
    raise exception 'not_allowed';
  end if;
  d_cur  := d0 - (n - 1);
  d_prev := d0 - (2 * n - 1);
  t0     := d0::timestamp at time zone 'Asia/Riyadh';
  t1     := (d0 + 1)::timestamp at time zone 'Asia/Riyadh';
  t_cur  := d_cur::timestamp at time zone 'Asia/Riyadh';
  t_prev := d_prev::timestamp at time zone 'Asia/Riyadh';
  select coalesce(array_agg(user_id), '{}'::uuid[]) into v_admins from app_admins;

  -- ===================================================================
  -- النشاط: المستخدمين، التسجيل، النشطين، الزيارات، التمارين، أخطاء التطبيق، اللي يبون يصيرون شركاء
  -- ===================================================================
  select jsonb_build_object(
    'total', count(*),
    'trainees', count(*) filter (where p.account_type = 'trainee'),
    'partners', count(*) filter (where p.account_type <> 'trainee'),
    'by_account_type', jsonb_build_object(
      'trainee', count(*) filter (where p.account_type = 'trainee'),
      'club', count(*) filter (where p.account_type = 'club'),
      'coach', count(*) filter (where p.account_type = 'coach'),
      'store', count(*) filter (where p.account_type = 'store'),
      'restaurant', count(*) filter (where p.account_type = 'restaurant'),
      'center', count(*) filter (where p.account_type = 'center'),
      'venue', count(*) filter (where p.account_type = 'venue')))
  into j1 from profiles p where p.id <> all(v_admins);

  with s as (
    select (p.created_at at time zone 'Asia/Riyadh')::date as d, p.created_at
    from profiles p where p.created_at >= t_prev and p.id <> all(v_admins)
  )
  select jsonb_build_object(
    'today', count(*) filter (where s.created_at >= t0),
    'cur', count(*) filter (where s.created_at >= t_cur),
    'prev', count(*) filter (where s.created_at < t_cur),
    'daily', (select jsonb_agg(jsonb_build_object('day', g.d, 'n', (select count(*) from s s2 where s2.d = g.d)) order by g.d)
              from (select d_cur + i as d from generate_series(0, n - 1) i) g))
  into j2 from s;

  -- النشطين (تقدير أقل من الحقيقة): أي أثر من المستخدم نفسه بالفترة. رقم الحساب والوقت بس، بدون أي محتوى
  with act as (
              select user_id as u, checked_in_at as ts from check_ins where checked_in_at >= t_prev
    union all select user_id, started_at from workout_sessions where started_at >= t_prev
    union all select user_id, created_at from workout_logs where created_at >= t_prev
    union all select user_id, created_at from food_logs where created_at >= t_prev
    union all select user_id, updated_at from daily_health where day >= d_prev - 31 and updated_at >= t_prev and source <> 'demo'
    union all select user_id, created_at from posts where created_at >= t_prev
    union all select user_id, created_at from post_likes where created_at >= t_prev
    union all select user_id, created_at from comments where created_at >= t_prev
    union all select user_id, created_at from checkin_likes where created_at >= t_prev
    union all select user_id, created_at from checkin_comments where created_at >= t_prev
    union all select follower, created_at from follows where created_at >= t_prev
    union all select sender, created_at from messages where created_at >= t_prev
    union all select user_id, created_at from ai_usage where created_at >= t_prev and kind <> 'office'
    union all select user_id, created_at from coach_log where created_at >= t_prev
    union all select user_id, created_at from body_logs where created_at >= t_prev
    union all select user_id, created_at from inbody_reports where created_at >= t_prev
    union all select user_id, created_at from app_events where created_at >= t_prev
    union all select user_id, updated_at from push_tokens where updated_at >= t_prev
    union all select id, last_sign_in_at from auth.users where last_sign_in_at >= t_prev
  ),
  a as (
    select distinct u, (ts at time zone 'Asia/Riyadh')::date as d
    from act where u is not null and u <> all(v_admins) and ts <= t_now
  )
  select jsonb_build_object(
    'today', count(distinct u) filter (where a.d = d0),
    'cur', count(distinct u) filter (where a.d >= d_cur),
    'prev', count(distinct u) filter (where a.d < d_cur),
    'daily', (select jsonb_agg(jsonb_build_object('day', g.d, 'n', coalesce(x.n, 0)) order by g.d)
              from (select d_cur + i as d from generate_series(0, n - 1) i) g
              left join (select a2.d, count(*) as n from a a2 group by a2.d) x on x.d = g.d))
  into j3 from a;

  with c as (
    select user_id, checked_in_at, (checked_in_at at time zone 'Asia/Riyadh')::date as d
    from check_ins where checked_in_at >= t_prev and user_id <> all(v_admins)
  )
  select jsonb_build_object(
    'today', count(*) filter (where c.checked_in_at >= t0),
    'cur', count(*) filter (where c.checked_in_at >= t_cur),
    'prev', count(*) filter (where c.checked_in_at < t_cur),
    'users_cur', count(distinct c.user_id) filter (where c.checked_in_at >= t_cur),
    -- «موجود الحين»: زيارة مفتوحة من آخر ٦ ساعات (نفس قاعدة التطبيق)
    'present_now', (select count(distinct x.user_id) from check_ins x
                    where x.checked_out_at is null and x.checked_in_at > t_now - interval '6 hours' and x.user_id <> all(v_admins)),
    'daily', (select jsonb_agg(jsonb_build_object('day', g.d, 'n', (select count(*) from c c2 where c2.d = g.d)) order by g.d)
              from (select d_cur + i as d from generate_series(0, n - 1) i) g))
  into j4 from c;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.n desc, x.users desc, x.name), '[]'::jsonb) into j5 from (
    select g.id, g.name, g.name_en, count(*) as n, count(distinct c.user_id) as users
    from check_ins c join gyms g on g.id = c.gym_id
    where c.checked_in_at >= t_cur and c.user_id <> all(v_admins)
    group by g.id, g.name, g.name_en
    order by count(*) desc, count(distinct c.user_id) desc, g.name limit 10) x;

  select jsonb_build_object(
    'today', count(*) filter (where w.started_at >= t0),
    'cur', count(*) filter (where w.started_at >= t_cur),
    'prev', count(*) filter (where w.started_at < t_cur),
    'users_cur', count(distinct w.user_id) filter (where w.started_at >= t_cur),
    'finished_cur', count(*) filter (where w.started_at >= t_cur and w.finished_at is not null),
    'plan_days_cur', (select count(*) from workout_logs l where l.created_at >= t_cur and l.user_id <> all(v_admins)),
    'plan_days_prev', (select count(*) from workout_logs l where l.created_at >= t_prev and l.created_at < t_cur and l.user_id <> all(v_admins)))
  into j6 from workout_sessions w where w.started_at >= t_prev and w.user_id <> all(v_admins);

  -- أخطاء التطبيق (app_events): النوع والعدد بس — ما نرجع التفاصيل ولا الـ stack
  with e as (
    select kind, user_id, created_at from app_events
    where created_at >= t_prev and kind ~ '(error|fatal|crashed|fail)'
  )
  select jsonb_build_object(
    'today', count(*) filter (where e.created_at >= t0),
    'cur', count(*) filter (where e.created_at >= t_cur),
    'prev', count(*) filter (where e.created_at < t_cur),
    'users_cur', count(distinct e.user_id) filter (where e.created_at >= t_cur),
    'top', (select coalesce(jsonb_agg(to_jsonb(x) order by x.n desc, x.kind), '[]'::jsonb) from (
              select e2.kind, count(*) as n, count(distinct e2.user_id) as users from e e2
              where e2.created_at >= t_cur group by e2.kind order by count(*) desc, e2.kind limit 5) x))
  into j7 from e;

  -- اختار نوع شريك وقت التسجيل وللحين ما انعتمد (يبقى متدرب لين يوافق المالك).
  -- اللي عنده أي شي معتمد (أو موقوف بعد اعتماد) ما ينحسب: اعتماد المدرب مثلاً يحط is_coach بس وما يمسح partner_intent.
  -- الفلتر بالـ where عشان total و no_submission و by_kind يطلعون من نفس الناس
  select jsonb_build_object(
    'total', count(*),
    'no_submission', count(*) filter (where
        not exists (select 1 from club_requests r where r.user_id = p.id)
        and not exists (select 1 from brands b where b.owner = p.id)
        and not exists (select 1 from coach_profiles cp where cp.user_id = p.id)
        and not exists (select 1 from recovery_centers rc where rc.owner = p.id)
        and not exists (select 1 from venues v where v.owner = p.id)),
    'by_kind', jsonb_build_object(
      'club', count(*) filter (where p.partner_intent = 'club'),
      'store', count(*) filter (where p.partner_intent = 'store'),
      'coach', count(*) filter (where p.partner_intent = 'coach'),
      'center', count(*) filter (where p.partner_intent = 'center'),
      'venue', count(*) filter (where p.partner_intent = 'venue')))
  into j8 from profiles p
  where p.partner_intent is not null and p.id <> all(v_admins) and not p.is_coach
    and not exists (select 1 from club_requests r where r.user_id = p.id and r.status = 'approved')
    and not exists (select 1 from brands b where b.owner = p.id and b.status in ('approved', 'suspended'))
    and not exists (select 1 from coach_profiles cp where cp.user_id = p.id and cp.status in ('approved', 'suspended'))
    and not exists (select 1 from recovery_centers rc where rc.owner = p.id and rc.status in ('approved', 'suspended'))
    and not exists (select 1 from venues v where v.owner = p.id and v.status in ('approved', 'suspended'));

  v_activity := jsonb_build_object('users', j1, 'signups', j2, 'active_users', j3, 'checkins', j4, 'top_gyms', j5,
                                   'workouts', j6, 'errors', j7, 'partner_intent', j8);

  -- ===================================================================
  -- الحجوزات والاشتراكات (ما فيه دفع داخل التطبيق: المبالغ = قيمة الحجز المسجّلة، مو دخل أرك)
  -- ===================================================================
  with b as (
    select x.venue_id, x.status, x.starts_at, x.ends_at, x.price_sar, x.created_at, x.updated_at, x.court_id is not null as is_court
    from venue_bookings x
    where x.created_at >= t_prev or x.updated_at >= t_prev or x.starts_at >= t_prev or x.status in ('pending', 'confirmed')
  )
  select jsonb_build_object(
    'created', jsonb_build_object('today', count(*) filter (where b.created_at >= t0),
                                  'cur', count(*) filter (where b.created_at >= t_cur),
                                  'prev', count(*) filter (where b.created_at >= t_prev and b.created_at < t_cur)),
    'courts_cur', count(*) filter (where b.created_at >= t_cur and b.is_court),
    'classes_cur', count(*) filter (where b.created_at >= t_cur and not b.is_court),
    'by_status_cur', jsonb_build_object(
      'pending', count(*) filter (where b.created_at >= t_cur and b.status = 'pending'),
      'confirmed', count(*) filter (where b.created_at >= t_cur and b.status = 'confirmed'),
      'declined', count(*) filter (where b.created_at >= t_cur and b.status = 'declined'),
      'cancelled', count(*) filter (where b.created_at >= t_cur and b.status = 'cancelled'),
      'done', count(*) filter (where b.created_at >= t_cur and b.status = 'done'),
      'no_show', count(*) filter (where b.created_at >= t_cur and b.status = 'no_show')),
    'today', jsonb_build_object(
      'total', count(*) filter (where b.starts_at >= t0 and b.starts_at < t1 and b.status in ('pending', 'confirmed', 'done', 'no_show')),
      'pending', count(*) filter (where b.starts_at >= t0 and b.starts_at < t1 and b.status = 'pending')),
    'upcoming_7d', count(*) filter (where b.status in ('pending', 'confirmed') and b.starts_at >= t_now and b.starts_at < t_now + interval '7 days'),
    'awaiting_venue', count(*) filter (where b.status = 'pending' and b.starts_at > t_now),
    'cancelled', jsonb_build_object(
      'cur', count(*) filter (where b.status = 'cancelled' and b.updated_at >= t_cur),
      'prev', count(*) filter (where b.status = 'cancelled' and b.updated_at >= t_prev and b.updated_at < t_cur)),
    'declined_cur', count(*) filter (where b.status = 'declined' and b.updated_at >= t_cur),
    'value_sar', jsonb_build_object(
      'cur', coalesce(sum(b.price_sar) filter (where b.status in ('confirmed', 'done') and b.starts_at >= t_cur and b.starts_at < t1), 0),
      'prev', coalesce(sum(b.price_sar) filter (where b.status in ('confirmed', 'done') and b.starts_at >= t_prev and b.starts_at < t_cur), 0)),
    'stale_pending', count(*) filter (where b.status = 'pending' and b.starts_at <= t_now),
    'unclosed', count(*) filter (where b.status = 'confirmed' and b.ends_at < t_now - interval '1 day'),
    'venues', (select jsonb_build_object(
        'in_app', count(*) filter (where v.listed_by = 'owner' and v.status = 'approved'),
        'directory', count(*) filter (where v.listed_by = 'arq' and v.status = 'approved'),
        'pending', count(*) filter (where v.status = 'pending'),
        'hidden', count(*) filter (where v.status in ('rejected', 'suspended')))
      from venues v))
  into j1 from b;

  with cb as (
    select x.class_date, x.status, x.created_at, x.updated_at from class_bookings x
    where x.created_at >= t_prev or x.updated_at >= t_prev or x.class_date >= d0
  )
  select jsonb_build_object(
    'created', jsonb_build_object('today', count(*) filter (where cb.created_at >= t0),
                                  'cur', count(*) filter (where cb.created_at >= t_cur),
                                  'prev', count(*) filter (where cb.created_at >= t_prev and cb.created_at < t_cur)),
    'today', jsonb_build_object('booked', count(*) filter (where cb.class_date = d0 and cb.status in ('booked', 'attended')),
                                'waitlist', count(*) filter (where cb.class_date = d0 and cb.status = 'waitlist')),
    'upcoming_7d', jsonb_build_object('booked', count(*) filter (where cb.class_date between d0 and d0 + 6 and cb.status = 'booked'),
                                      'waitlist', count(*) filter (where cb.class_date between d0 and d0 + 6 and cb.status = 'waitlist')),
    'cancelled', jsonb_build_object('cur', count(*) filter (where cb.status = 'cancelled' and cb.updated_at >= t_cur),
                                    'prev', count(*) filter (where cb.status = 'cancelled' and cb.updated_at >= t_prev and cb.updated_at < t_cur)),
    'active_classes', (select count(*) from gym_classes g where g.active))
  into j2 from cb;

  -- اشتراكات الأندية: الحالة محسوبة مثل التطبيق (membership_state)، بدون أسماء أو أرقام الأعضاء
  with m as (
    select x.kind, x.created_at, x.ends_on,
           membership_state(x.status, x.starts_on, x.ends_on, x.frozen_from, x.frozen_until) as st
    from memberships x where x.ends_on >= d_prev - 1 or x.created_at >= t_prev
  )
  select jsonb_build_object(
    'live', count(*) filter (where m.st in ('active', 'frozen')),
    'active', count(*) filter (where m.st = 'active'),
    'frozen', count(*) filter (where m.st = 'frozen'),
    'upcoming', count(*) filter (where m.st = 'upcoming'),
    'new', jsonb_build_object('today', count(*) filter (where m.created_at >= t0),
                              'cur', count(*) filter (where m.created_at >= t_cur),
                              'prev', count(*) filter (where m.created_at >= t_prev and m.created_at < t_cur)),
    'expiring_7d', count(*) filter (where m.kind = 'membership' and m.st in ('active', 'frozen') and m.ends_on between d0 and d0 + 6),
    -- ينتهي الاشتراك بعد آخر يوم فيه: اللي آخر يوم له أمس انتهى اليوم
    'expired', jsonb_build_object('cur', count(*) filter (where m.st = 'expired' and m.ends_on between d_cur - 1 and d0 - 1),
                                  'prev', count(*) filter (where m.st = 'expired' and m.ends_on between d_prev - 1 and d_cur - 2)),
    'requests_pending', (select count(*) from membership_requests r where r.status = 'pending'),
    'requests_over_48h', (select count(*) from membership_requests r where r.status = 'pending' and r.created_at < t_now - interval '48 hours'))
  into j3 from m;

  select jsonb_build_object(
    'coaches_approved', (select count(*) from coach_profiles cp where cp.status = 'approved'),
    'clients_active', (select count(*) from coach_links l where l.status = 'active'),
    'link_requests', (select jsonb_build_object(
        'pending', count(*) filter (where l.status = 'pending'),
        'pending_over_72h', count(*) filter (where l.status = 'pending' and l.created_at < t_now - interval '72 hours'),
        'cur', count(*) filter (where l.created_at >= t_cur),
        'prev', count(*) filter (where l.created_at >= t_prev and l.created_at < t_cur))
      from coach_links l where l.created_at >= t_prev or l.status = 'pending'),
    'sessions', (select jsonb_build_object(
        'today', count(*) filter (where s.starts_at >= t0 and s.starts_at < t1 and s.status in ('booked', 'done', 'no_show')),
        'upcoming_7d', count(*) filter (where s.status = 'booked' and s.starts_at >= t_now and s.starts_at < t_now + interval '7 days'),
        'done', jsonb_build_object('cur', count(*) filter (where s.status = 'done' and s.starts_at >= t_cur and s.starts_at < t1),
                                   'prev', count(*) filter (where s.status = 'done' and s.starts_at >= t_prev and s.starts_at < t_cur)),
        'cancelled_cur', count(*) filter (where s.status = 'cancelled' and s.starts_at >= t_cur and s.starts_at < t1),
        'no_show_cur', count(*) filter (where s.status = 'no_show' and s.starts_at >= t_cur and s.starts_at < t1),
        'stale_booked', count(*) filter (where s.status = 'booked' and s.starts_at < t_now - interval '1 day'))
      from coach_sessions s where s.starts_at >= t_prev or s.created_at >= t_prev or s.status = 'booked'))
  into j4;

  with a as (
    select x.status, x.starts_at, x.created_at, x.updated_at from center_appointments x
    where x.created_at >= t_prev or x.updated_at >= t_prev or x.status in ('requested', 'confirmed')
  )
  select jsonb_build_object(
    'requests', jsonb_build_object('today', count(*) filter (where a.created_at >= t0),
                                   'cur', count(*) filter (where a.created_at >= t_cur),
                                   'prev', count(*) filter (where a.created_at >= t_prev and a.created_at < t_cur)),
    'open_requests', count(*) filter (where a.status = 'requested'),
    'requests_over_24h', count(*) filter (where a.status = 'requested' and a.created_at < t_now - interval '24 hours'),
    'today', count(*) filter (where a.status in ('confirmed', 'done') and a.starts_at >= t0 and a.starts_at < t1),
    'upcoming_7d', count(*) filter (where a.status = 'confirmed' and a.starts_at >= t_now and a.starts_at < t_now + interval '7 days'),
    'done_cur', count(*) filter (where a.status = 'done' and a.updated_at >= t_cur),
    'declined_cur', count(*) filter (where a.status = 'declined' and a.updated_at >= t_cur),
    'cancelled', jsonb_build_object('cur', count(*) filter (where a.status = 'cancelled' and a.updated_at >= t_cur),
                                    'prev', count(*) filter (where a.status = 'cancelled' and a.updated_at >= t_prev and a.updated_at < t_cur)),
    'unclosed', count(*) filter (where a.status = 'confirmed' and a.starts_at < t_now - interval '1 day'))
  into j5 from a;

  select jsonb_build_object(
    'active', count(*) filter (where s.status = 'active'),
    'subscribers', count(distinct s.user_id) filter (where s.status = 'active'),
    'restaurants', count(distinct s.brand_id) filter (where s.status = 'active'),
    'requests', jsonb_build_object('today', count(*) filter (where s.created_at >= t0),
                                   'cur', count(*) filter (where s.created_at >= t_cur),
                                   'prev', count(*) filter (where s.created_at >= t_prev and s.created_at < t_cur)),
    'open_requests', count(*) filter (where s.status = 'requested'),
    'requests_over_48h', count(*) filter (where s.status = 'requested' and s.created_at < t_now - interval '48 hours'),
    'ended', jsonb_build_object('cur', count(*) filter (where s.status = 'ended' and s.ended_at >= t_cur),
                                'prev', count(*) filter (where s.status = 'ended' and s.ended_at >= t_prev and s.ended_at < t_cur)),
    'declined_cur', count(*) filter (where s.status = 'declined' and s.ended_at >= t_cur),
    'meals_today', (select count(*) from subscription_meals sm join meal_subscriptions s2 on s2.id = sm.subscription_id
                    where s2.status = 'active' and sm.day = d0),
    'active_without_meals_3d', count(*) filter (where s.status = 'active' and not exists (
        select 1 from subscription_meals sm where sm.subscription_id = s.id and sm.day between d0 and d0 + 2)))
  into j6 from meal_subscriptions s
  where s.status in ('requested', 'active') or s.created_at >= t_prev or s.ended_at >= t_prev;

  -- يحتاج متابعتك: أسماء الأنشطة التجارية بس (نادي/ملعب/مدرب/مركز/مطعم) — ما فيه أسماء أعضاء
  select coalesce(jsonb_agg(to_jsonb(z) order by z.priority, z.since nulls last), '[]'::jsonb) into j7 from (
    select * from (
      (select 1 as priority, 'venue_unanswered_bookings'::text as kind, 'venue'::text as target, v.id, v.name,
              count(*)::int as n, min(x.created_at) as since
       from venue_bookings x join venues v on v.id = x.venue_id
       where x.status = 'pending' and x.starts_at > t_now and x.created_at < t_now - interval '6 hours'
       group by v.id, v.name order by min(x.created_at) limit 10)
      union all
      (select 1, 'gym_requests_waiting', case when g.id is not null then 'gym' else 'chain' end, coalesce(g.id, ch.id),
              coalesce(g.name, ch.name), count(*)::int, min(r.created_at)
       from membership_requests r join memberships m on m.id = r.membership_id
       left join gyms g on g.id = m.gym_id left join gym_chains ch on ch.id = m.chain_id and m.gym_id is null
       where r.status = 'pending' and r.created_at < t_now - interval '48 hours'
       group by g.id, ch.id, g.name, ch.name order by min(r.created_at) limit 10)
      union all
      (select 1, 'center_requests_waiting', 'center', rc.id, rc.name, count(*)::int, min(x.created_at)
       from center_appointments x join recovery_centers rc on rc.id = x.center_id
       where x.status = 'requested' and x.created_at < t_now - interval '24 hours'
       group by rc.id, rc.name order by min(x.created_at) limit 10)
      union all
      (select 1, 'restaurant_requests_waiting', 'store', br.id, br.name, count(*)::int, min(s.created_at)
       from meal_subscriptions s join brands br on br.id = s.brand_id
       where s.status = 'requested' and s.created_at < t_now - interval '48 hours'
       group by br.id, br.name order by min(s.created_at) limit 10)
      union all
      (select 2, 'venue_expired_requests', 'venue', v.id, v.name, count(*)::int, min(x.starts_at)
       from venue_bookings x join venues v on v.id = x.venue_id
       where x.status = 'pending' and x.starts_at <= t_now and x.starts_at >= t_prev
       group by v.id, v.name order by count(*) desc limit 10)
      union all
      (select 2, 'coach_requests_waiting', 'coach', l.coach_id, coalesce(nullif(btrim(p.full_name), ''), p.username),
              count(*)::int, min(l.created_at)
       from coach_links l join profiles p on p.id = l.coach_id
       where l.status = 'pending' and l.requested_by = 'client' and l.created_at < t_now - interval '72 hours'
       group by l.coach_id, p.full_name, p.username order by min(l.created_at) limit 10)
      union all
      (select 2, 'restaurant_no_meals_planned', 'store', br.id, br.name, count(*)::int, min(s.created_at)
       from meal_subscriptions s join brands br on br.id = s.brand_id
       where s.status = 'active'
         and not exists (select 1 from subscription_meals sm where sm.subscription_id = s.id and sm.day between d0 and d0 + 2)
       group by br.id, br.name order by count(*) desc limit 10)
      union all
      (select 3, 'coach_sessions_unclosed', 'coach', s.coach_id, coalesce(nullif(btrim(p.full_name), ''), p.username),
              count(*)::int, min(s.starts_at)
       from coach_sessions s join profiles p on p.id = s.coach_id
       where s.status = 'booked' and s.starts_at < t_now - interval '1 day'
       group by s.coach_id, p.full_name, p.username order by count(*) desc limit 10)
    ) u order by u.priority, u.since nulls last limit 20) z;

  v_bookings := jsonb_build_object('venue_bookings', j1, 'gym_classes', j2, 'memberships', j3, 'coaching', j4,
                                   'recovery', j5, 'meal_subscriptions', j6, 'attention', j7);

  -- ===================================================================
  -- المتجر: كتالوج بس — ما فيه طلبات ولا سلة ولا دفع ولا استبدال نقاط داخل التطبيق للحين
  -- ===================================================================
  select jsonb_build_object(
    'live', count(*) filter (where br.status = 'approved'),
    'live_partner', count(*) filter (where br.status = 'approved' and br.listed_by = 'owner'),
    'live_unclaimed', count(*) filter (where br.status = 'approved' and br.owner is null),
    'live_restaurants', count(*) filter (where br.status = 'approved' and br.category = 'restaurant'),
    'pending', count(*) filter (where br.status = 'pending'),
    'rejected', count(*) filter (where br.status = 'rejected'),
    'suspended', count(*) filter (where br.status = 'suspended'),
    'new', jsonb_build_object('today', count(*) filter (where br.created_at >= t0),
                              'cur', count(*) filter (where br.created_at >= t_cur),
                              'prev', count(*) filter (where br.created_at >= t_prev and br.created_at < t_cur)))
  into j1 from brands br;

  with p as (
    select x.id, x.name, x.brand_id, x.price_sar, x.stock, x.created_at, br.name as brand, (x.active and br.status = 'approved') as live
    from brand_products x join brands br on br.id = x.brand_id
  )
  select jsonb_build_object(
    'live', count(*) filter (where p.live),
    'new', jsonb_build_object('cur', count(*) filter (where p.created_at >= t_cur),
                              'prev', count(*) filter (where p.created_at >= t_prev and p.created_at < t_cur)),
    'sold_out', count(*) filter (where p.live and p.stock = 0),
    'low_stock', count(*) filter (where p.live and p.stock between 1 and 5),
    'stock_untracked', count(*) filter (where p.live and p.stock is null),
    'no_price', count(*) filter (where p.live and p.price_sar is null),
    'avg_price_sar', round(avg(p.price_sar) filter (where p.live), 2),
    'low_stock_items', (select coalesce(jsonb_agg(to_jsonb(x) order by x.stock, x.brand, x.product), '[]'::jsonb) from (
        select p2.id as product_id, p2.name as product, p2.brand_id, p2.brand, p2.stock
        from p p2 where p2.live and p2.stock <= 5
        order by p2.stock, p2.brand, p2.name limit 10) x))
  into j2 from p;

  select jsonb_build_object(
    'live', (select count(*) from brand_offers o join brands br on br.id = o.brand_id
             where o.active and br.status = 'approved' and (o.ends_on is null or o.ends_on >= d0)),
    'ending_3d', (select count(*) from brand_offers o join brands br on br.id = o.brand_id
                  where o.active and br.status = 'approved' and o.ends_on between d0 and d0 + 3),
    'expired_still_active', (select count(*) from brand_offers o where o.active and o.ends_on < d0),
    -- أحداث العروض: شخص/يوم (مشاهدة، إظهار الكود، زيارة الموقع)
    'views', jsonb_build_object('today', count(*) filter (where e.kind = 'view' and e.day = d0),
                                'cur', count(*) filter (where e.kind = 'view' and e.day >= d_cur),
                                'prev', count(*) filter (where e.kind = 'view' and e.day < d_cur)),
    'reveals', jsonb_build_object('cur', count(*) filter (where e.kind = 'reveal' and e.day >= d_cur),
                                  'prev', count(*) filter (where e.kind = 'reveal' and e.day < d_cur)),
    'visits', jsonb_build_object('cur', count(*) filter (where e.kind = 'visit' and e.day >= d_cur),
                                 'prev', count(*) filter (where e.kind = 'visit' and e.day < d_cur)),
    'people', jsonb_build_object('cur', count(distinct e.user_id) filter (where e.day >= d_cur),
                                 'prev', count(distinct e.user_id) filter (where e.day < d_cur)))
  into j3 from brand_offer_events e where e.day between d_prev and d0;

  select jsonb_build_object(
    'total', count(*),
    'new', jsonb_build_object('cur', count(*) filter (where f.created_at >= t_cur),
                              'prev', count(*) filter (where f.created_at >= t_prev and f.created_at < t_cur)))
  into j4 from brand_followers f;

  -- أكثر المتاجر تفاعل بالفترة: ناس تفاعلوا مع عروضها + متابعين جدد + اشتراكات وجبات فعّالة
  with eng as (
    select o.brand_id, count(*) filter (where e.kind = 'view') as offer_views,
           count(*) filter (where e.kind = 'reveal') as code_reveals,
           count(*) filter (where e.kind = 'visit') as site_visits, count(distinct e.user_id) as people
    from brand_offer_events e join brand_offers o on o.id = e.offer_id
    where e.day between d_cur and d0 group by o.brand_id
  ),
  fol as (
    select f.brand_id, count(*) as followers, count(*) filter (where f.created_at >= t_cur) as followers_new
    from brand_followers f group by f.brand_id
  ),
  subs as (
    select s.brand_id, count(*) as active_subs from meal_subscriptions s where s.status = 'active' group by s.brand_id
  ),
  prod as (
    select x.brand_id, count(*) filter (where x.active) as live_products from brand_products x group by x.brand_id
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.engagement desc, x.followers desc, x.name), '[]'::jsonb) into j5 from (
    select br.id, br.name, br.category, br.city,
           coalesce(e.people, 0) + coalesce(f.followers_new, 0) + coalesce(s.active_subs, 0) as engagement,
           coalesce(f.followers, 0) as followers, coalesce(f.followers_new, 0) as followers_new,
           coalesce(e.offer_views, 0) as offer_views, coalesce(e.code_reveals, 0) as code_reveals,
           coalesce(e.site_visits, 0) as site_visits, coalesce(s.active_subs, 0) as active_subs,
           coalesce(pr.live_products, 0) as live_products
    from brands br
    left join eng e on e.brand_id = br.id left join fol f on f.brand_id = br.id
    left join subs s on s.brand_id = br.id left join prod pr on pr.brand_id = br.id
    where br.status = 'approved'
    order by 5 desc, 6 desc, br.name limit 5) x;

  -- أكثر الأطباق: وجبات جدولتها المطاعم لمشتركينها بالفترة (الطلب الوحيد على منتج اللي نقدر نقيسه)
  select coalesce(jsonb_agg(to_jsonb(x) order by x.meals desc, x.product), '[]'::jsonb) into j6 from (
    select p.id as product_id, p.name as product, br.id as brand_id, br.name as brand, p.price_sar, count(*) as meals
    from subscription_meals m join brand_products p on p.id = m.product_id join brands br on br.id = p.brand_id
    where m.day between d_cur and d0
    group by p.id, p.name, br.id, br.name, p.price_sar
    order by count(*) desc, p.name limit 5) x;

  select jsonb_build_object(
    'points', jsonb_build_object('today', coalesce(sum(l.amount) filter (where l.created_at >= t0), 0),
                                 'cur', coalesce(sum(l.amount) filter (where l.created_at >= t_cur), 0),
                                 'prev', coalesce(sum(l.amount) filter (where l.created_at < t_cur), 0)),
    'earners_cur', count(distinct l.user_id) filter (where l.created_at >= t_cur),
    'outstanding', (select coalesce(sum(p.points), 0) from profiles p where p.id <> all(v_admins)),
    'holders', (select count(*) from profiles p where p.points > 0 and p.id <> all(v_admins)))
  into j7 from points_ledger l where l.created_at >= t_prev and l.user_id <> all(v_admins);

  v_store := jsonb_build_object('orders_enabled', false, 'redemption_enabled', false,
                                'brands', j1, 'products', j2, 'offers', j3, 'followers', j4,
                                'top_brands', j5, 'top_products', j6, 'rewards', j7);

  -- ===================================================================
  -- المجتمع والمحادثات: أعداد بس (بدون نص منشور أو تعليق أو رسالة، وبدون مين يكلّم مين)
  -- ===================================================================
  select jsonb_build_object(
    'today', count(*) filter (where x.kind = 'post' and x.created_at >= t0),
    'cur', count(*) filter (where x.kind = 'post' and x.created_at >= t_cur),
    'prev', count(*) filter (where x.kind = 'post' and x.created_at < t_cur),
    'posters_cur', count(distinct x.user_id) filter (where x.kind = 'post' and x.created_at >= t_cur),
    'with_photo_cur', count(*) filter (where x.kind = 'post' and x.created_at >= t_cur and x.image_path is not null),
    'public_cur', count(*) filter (where x.kind = 'post' and x.created_at >= t_cur and x.visibility = 'public'),
    -- «صباح الخير» تنكتب تلقائي أول ما يفتح التطبيق الصبح (لو مفعّلة): تقريب لمرات الفتح
    'wake_cur', count(*) filter (where x.kind = 'wake' and x.created_at >= t_cur))
  into j1 from posts x where x.created_at >= t_prev and x.user_id <> all(v_admins);

  with c as (
    select user_id, created_at from comments where created_at >= t_prev
    union all select user_id, created_at from checkin_comments where created_at >= t_prev
  )
  select jsonb_build_object('today', count(*) filter (where c.created_at >= t0),
                            'cur', count(*) filter (where c.created_at >= t_cur),
                            'prev', count(*) filter (where c.created_at < t_cur))
  into j2 from c where c.user_id <> all(v_admins);

  with r as (
    select user_id, created_at from post_likes where created_at >= t_prev
    union all select user_id, created_at from checkin_likes where created_at >= t_prev
  )
  select jsonb_build_object('today', count(*) filter (where r.created_at >= t0),
                            'cur', count(*) filter (where r.created_at >= t_cur),
                            'prev', count(*) filter (where r.created_at < t_cur))
  into j3 from r where r.user_id <> all(v_admins);

  select jsonb_build_object(
    'follows', (select jsonb_build_object('cur', count(*) filter (where f.created_at >= t_cur),
                                          'prev', count(*) filter (where f.created_at < t_cur))
                from follows f where f.created_at >= t_prev and f.follower <> all(v_admins)),
    'friend_requests', (select jsonb_build_object(
        'cur', count(*) filter (where fr.created_at >= t_cur),
        'prev', count(*) filter (where fr.created_at >= t_prev and fr.created_at < t_cur),
        'pending', count(*) filter (where fr.status = 'pending'),
        'pending_over_7d', count(*) filter (where fr.status = 'pending' and fr.created_at < t_now - interval '7 days'))
      from friendships fr where fr.requester <> all(v_admins)),
    'challenges', (select jsonb_build_object(
        'created_cur', count(*) filter (where ch.created_at >= t_cur),
        'created_prev', count(*) filter (where ch.created_at >= t_prev and ch.created_at < t_cur),
        'running', count(*) filter (where ch.starts_on <= d0 and ch.ends_on >= d0),
        -- انتهى وما أحد ضغط «احسب الفائز»: الفايز ما أخذ نقاطه
        'ended_unsettled', count(*) filter (where ch.ends_on < d0 and not ch.settled),
        'joins_cur', (select count(*) from challenge_members cm where cm.status = 'joined' and cm.joined_at >= t_cur))
      from challenges ch),
    'tips', (select jsonb_build_object('cur', count(*) filter (where t.created_at >= t_cur),
                                       'prev', count(*) filter (where t.created_at >= t_prev and t.created_at < t_cur),
                                       'total', count(*))
             from tips t),
    'programs', (select jsonb_build_object('cur', count(*) filter (where up.created_at >= t_cur),
                                           'prev', count(*) filter (where up.created_at >= t_prev and up.created_at < t_cur),
                                           'total', count(*),
                                           'adopts_cur', (select count(*) from program_adopts pa where pa.created_at >= t_cur),
                                           'adopts_prev', (select count(*) from program_adopts pa where pa.created_at >= t_prev and pa.created_at < t_cur))
                 from user_programs up))
  into j4;

  with ev as (
    select 'posts'::text as k, created_at from posts where created_at >= t_cur and kind = 'post' and user_id <> all(v_admins)
    union all select 'comments', created_at from comments where created_at >= t_cur and user_id <> all(v_admins)
    union all select 'comments', created_at from checkin_comments where created_at >= t_cur and user_id <> all(v_admins)
    union all select 'reactions', created_at from post_likes where created_at >= t_cur and user_id <> all(v_admins)
    union all select 'reactions', created_at from checkin_likes where created_at >= t_cur and user_id <> all(v_admins)
  ),
  agg as (select (ev.created_at at time zone 'Asia/Riyadh')::date as d, ev.k, count(*) as n from ev group by 1, 2)
  select jsonb_agg(jsonb_build_object(
           'day', g.d,
           'posts', coalesce((select a.n from agg a where a.d = g.d and a.k = 'posts'), 0),
           'comments', coalesce((select a.n from agg a where a.d = g.d and a.k = 'comments'), 0),
           'reactions', coalesce((select a.n from agg a where a.d = g.d and a.k = 'reactions'), 0)) order by g.d)
  into j5 from (select d_cur + i as d from generate_series(0, n - 1) i) g;

  -- الإشراف: البلاغ الوحيد الموجود بالتطبيق = بلاغ على تقييم نادي (review_flags). ما نرجع نص التقييم ولا ملاحظة
  -- المبلّغ ولا مين بلّغ — بس صاحب التقييم (اسم مستخدمه العام) والسبب والحالة
  select jsonb_build_object(
    'reports_supported', jsonb_build_array('gym_review'),
    'user_report_block', false,
    'reported', jsonb_build_object('open', count(*) filter (where f.status = 'new'),
                                   'cur', count(*) filter (where f.created_at >= t_cur),
                                   'prev', count(*) filter (where f.created_at >= t_prev and f.created_at < t_cur)),
    'kept', count(*) filter (where f.status = 'kept'),
    'removed', count(*) filter (where f.status = 'removed'),
    'latest', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) from (
        select f2.id, 'gym_review'::text as kind, f2.gym_id as target_id, coalesce(g.name, g.name_en) as target_name,
               pr.username as author_username, f2.reason, f2.status, f2.created_at
        from review_flags f2 left join gyms g on g.id = f2.gym_id left join profiles pr on pr.id = f2.user_id
        order by f2.created_at desc limit 10) x))
  into j6 from review_flags f;

  -- المحادثات: أعداد بس — ولا نص ولا ملف ولا مين مع مين
  with m as (
    select created_at, sender, media_type, least(sender, recipient) as a, greatest(sender, recipient) as b
    from messages where created_at >= t_prev and sender <> all(v_admins)
  )
  select jsonb_build_object(
    'messages', jsonb_build_object('today', count(*) filter (where m.created_at >= t0),
                                   'cur', count(*) filter (where m.created_at >= t_cur),
                                   'prev', count(*) filter (where m.created_at < t_cur)),
    'senders', jsonb_build_object('cur', count(distinct m.sender) filter (where m.created_at >= t_cur),
                                  'prev', count(distinct m.sender) filter (where m.created_at < t_cur)),
    'conversations', jsonb_build_object('cur', count(distinct (m.a, m.b)) filter (where m.created_at >= t_cur),
                                        'prev', count(distinct (m.a, m.b)) filter (where m.created_at < t_cur)),
    'media', jsonb_build_object('cur', count(*) filter (where m.created_at >= t_cur and m.media_type is not null),
                                'prev', count(*) filter (where m.created_at < t_cur and m.media_type is not null)),
    'media_pct_cur', coalesce(round(100.0 * count(*) filter (where m.created_at >= t_cur and m.media_type is not null)
                                    / nullif(count(*) filter (where m.created_at >= t_cur), 0))::int, 0),
    'unread_over_24h', (select count(*) from messages x where x.read_at is null and x.deleted_at is null
                          and x.created_at < t_now - interval '24 hours' and x.created_at >= t_now - interval '90 days'),
    'daily', (select jsonb_agg(jsonb_build_object('day', g.d, 'n', (select count(*) from m m2
                where m2.created_at >= g.d::timestamp at time zone 'Asia/Riyadh'
                  and m2.created_at < (g.d + 1)::timestamp at time zone 'Asia/Riyadh')) order by g.d)
              from (select d_cur + i as d from generate_series(0, n - 1) i) g))
  into j7 from m;

  v_community := jsonb_build_object('posts', j1, 'comments', j2, 'reactions', j3) || j4
                 || jsonb_build_object('daily', j5, 'moderation', j6, 'chats', j7);

  -- ===================================================================
  -- الشركاء: المعلّق لكل نوع (نفس أرقام partner_overview) + نفس الطلبات اللي تطلع على مكاتب المكتب
  -- ===================================================================
  select jsonb_build_object(
    'club', (select count(*) from club_requests where status = 'pending'),
    'store', (select count(*) from brands where status = 'pending'),
    'coach', (select count(*) from coach_profiles where status = 'pending'),
    'center', (select count(*) from recovery_centers where status = 'pending'),
    'venue', (select count(*) from venues where status = 'pending'))
  into j1;

  with items as (
    select 'club'::text as kind, r.id, coalesce(ch.name, coalesce(g.name, g.name_en), r.club_name) as name,
           r.created_at, r.city, p.username
    from club_requests r join profiles p on p.id = r.user_id
    left join gym_chains ch on ch.id = r.chain_id left join gyms g on g.id = r.gym_id
    where r.status = 'pending'
    union all
    select 'store', br.id, br.name, br.created_at, br.city, p.username
    from brands br left join profiles p on p.id = br.owner where br.status = 'pending'
    union all
    select 'coach', cp.user_id, coalesce(nullif(btrim(p.full_name), ''), '@' || p.username),
           coalesce(cp.submitted_at, cp.created_at), cp.city, p.username
    from coach_profiles cp join profiles p on p.id = cp.user_id where cp.status = 'pending'
    union all
    select 'center', rc.id, rc.name, rc.created_at, rc.cities[1], p.username
    from recovery_centers rc left join profiles p on p.id = rc.owner where rc.status = 'pending' and rc.listed_by = 'owner'
    union all
    select 'venue', v.id, v.name, v.created_at, v.city, p.username
    from venues v left join profiles p on p.id = v.owner where v.status = 'pending'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', x.kind, 'id', x.id, 'name', x.name, 'created_at', x.created_at, 'city', x.city, 'username', x.username,
           'agent_task', case when t.id is null then null else jsonb_build_object('id', t.id, 'status', t.status) end)
         order by x.created_at, x.kind, x.id), '[]'::jsonb)
  into j2
  from (select * from items order by created_at, kind, id limit 25) x
  left join lateral (select ot.id, ot.status from office_tasks ot
                     where ot.target_kind = x.kind and ot.target_id = x.id
                       and ot.status in ('scheduled', 'in_progress', 'waiting_approval')
                     order by ot.created_at desc limit 1) t on true;

  -- من المعلّق: كم عليه مهمة وكيل مفتوحة — على كل المعلّق، مو بس أول ٢٥ في items
  -- (فيه مهمة مفتوحة وحدة بالكثير لكل عنصر: الفهرس office_tasks_open_target، فالـ join ما يكرر)
  with ot as (select t.target_kind as k, t.target_id as id from office_tasks t
              where t.kind = 'review_partner' and t.status in ('scheduled', 'in_progress', 'waiting_approval'))
  select jsonb_build_object(
    'club', (select count(*) from club_requests x join ot on ot.k = 'club' and ot.id = x.id where x.status = 'pending'),
    'store', (select count(*) from brands x join ot on ot.k = 'store' and ot.id = x.id where x.status = 'pending'),
    'coach', (select count(*) from coach_profiles x join ot on ot.k = 'coach' and ot.id = x.user_id where x.status = 'pending'),
    'center', (select count(*) from recovery_centers x join ot on ot.k = 'center' and ot.id = x.id where x.status = 'pending'),
    'venue', (select count(*) from venues x join ot on ot.k = 'venue' and ot.id = x.id where x.status = 'pending'))
  into j3;

  v_partners := jsonb_build_object('pending', j1,
    'pending_total', (j1->>'club')::int + (j1->>'store')::int + (j1->>'coach')::int + (j1->>'center')::int + (j1->>'venue')::int,
    'pending_covered', j3,
    'items', j2);

  -- ===================================================================
  -- بلاغات المختبرين (نصهم يوصل للمالك أصلاً: هنا أول ١٤٠ حرف بس)
  -- ===================================================================
  select jsonb_build_object(
    'by_status', jsonb_build_object('new', count(*) filter (where f.status = 'new'),
                                    'seen', count(*) filter (where f.status = 'seen'),
                                    'fixed', count(*) filter (where f.status = 'fixed'),
                                    'wontfix', count(*) filter (where f.status = 'wontfix')),
    -- الجديدة اللي عليها مهمة وكيل مفتوحة — على كل الجديدة، مو بس أول ٢٠ في latest_new
    'new_covered', count(*) filter (where f.status = 'new' and exists (
        select 1 from office_tasks ot where ot.kind = 'triage_report' and ot.target_kind = 'report' and ot.target_id = f.id
          and ot.status in ('scheduled', 'in_progress', 'waiting_approval'))),
    'received', jsonb_build_object('today', count(*) filter (where f.created_at >= t0),
                                   'cur', count(*) filter (where f.created_at >= t_cur),
                                   'prev', count(*) filter (where f.created_at >= t_prev and f.created_at < t_cur)))
  into j1 from beta_feedback f;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'category', x.category,
           'message', left(btrim(regexp_replace(x.message, '\s+', ' ', 'g')), 140),
           'created_at', x.created_at, 'username', p.username,
           'agent_task', case when t.id is null then null else jsonb_build_object('id', t.id, 'status', t.status) end)
         order by x.created_at desc, x.id), '[]'::jsonb)
  into j2
  from (select f.id, f.user_id, f.category, f.message, f.created_at from beta_feedback f
        where f.status = 'new' order by f.created_at desc, f.id limit 20) x
  left join profiles p on p.id = x.user_id
  left join lateral (select ot.id, ot.status from office_tasks ot
                     where ot.target_kind = 'report' and ot.target_id = x.id
                       and ot.status in ('scheduled', 'in_progress', 'waiting_approval')
                     order by ot.created_at desc limit 1) t on true;

  v_reports := j1 || jsonb_build_object('latest_new', j2);

  -- ===================================================================
  -- التسويق: إعلان الافتتاح، الفعاليات القادمة، تنبيهات التحفيز
  -- ===================================================================
  with ads as (
    select a.*, case when not a.active then 'off'
                     when a.ends_at is not null and a.ends_at <= t_now then 'ended'
                     when a.starts_at is not null and a.starts_at > t_now then 'scheduled'
                     else 'live' end as state
    from launch_ads a
  )
  select jsonb_build_object(
    -- نفس ترتيب current_launch_ad: الأعلى أولوية ثم الأحدث
    'live_ad', (select jsonb_build_object('id', x.id, 'title', x.title, 'kind', x.kind, 'starts_at', x.starts_at, 'ends_at', x.ends_at)
                from ads x where x.state = 'live' order by x.priority desc, x.created_at desc limit 1),
    'ads', jsonb_build_object('live', count(*) filter (where ads.state = 'live'),
                              'live_marketing', count(*) filter (where ads.state = 'live' and ads.kind = 'ad'),
                              'scheduled', count(*) filter (where ads.state = 'scheduled'),
                              'ended', count(*) filter (where ads.state = 'ended'),
                              'off', count(*) filter (where ads.state = 'off')))
  into j1 from ads;

  select jsonb_build_object(
    'cur', jsonb_build_object('views', count(*) filter (where e.kind = 'view' and e.day >= d_cur),
                              'reach', count(distinct e.user_id) filter (where e.kind = 'view' and e.day >= d_cur),
                              'clicks', count(*) filter (where e.kind = 'click' and e.day >= d_cur),
                              'closes', count(*) filter (where e.kind = 'close' and e.day >= d_cur)),
    'prev', jsonb_build_object('views', count(*) filter (where e.kind = 'view' and e.day < d_cur),
                               'reach', count(distinct e.user_id) filter (where e.kind = 'view' and e.day < d_cur),
                               'clicks', count(*) filter (where e.kind = 'click' and e.day < d_cur),
                               'closes', count(*) filter (where e.kind = 'close' and e.day < d_cur)))
  into j2 from launch_ad_events e where e.day between d_prev and d0;

  select jsonb_build_object(
    'active', count(*) filter (where ev.active),
    'past_still_active', count(*) filter (where ev.active and coalesce(ev.ends_on, ev.starts_on) < d0),
    'upcoming', (select coalesce(jsonb_agg(to_jsonb(x) order by x.starts_on, x.id), '[]'::jsonb) from (
        select e.id, e.title, e.title_en, e.starts_on, e.ends_on, e.city, e.category
        from local_events e
        where e.active and e.starts_on is not null and coalesce(e.ends_on, e.starts_on) >= d0
        order by e.starts_on, e.id limit 10) x))
  into j3 from local_events ev;

  select jsonb_build_object(
    'today', count(*) filter (where l.day = d0),
    'cur', count(*) filter (where l.day >= d_cur),
    'prev', count(*) filter (where l.day < d_cur),
    'by_category_cur', jsonb_build_object(
      'gym', count(*) filter (where l.day >= d_cur and l.category = 'gym'),
      'friend', count(*) filter (where l.day >= d_cur and l.category = 'friend'),
      'streak', count(*) filter (where l.day >= d_cur and l.category = 'streak'),
      'workout', count(*) filter (where l.day >= d_cur and l.category = 'workout'),
      'meal', count(*) filter (where l.day >= d_cur and l.category = 'meal')),
    'templates_active', (select count(*) from nudge_templates t where t.active),
    'templates_paused', (select count(*) from nudge_templates t where not t.active))
  into j4 from nudge_log l where l.day between d_prev and d0;

  v_marketing := j1 || jsonb_build_object('ad_stats', j2, 'events', j3, 'nudges', j4);

  -- ===================================================================
  -- الذكاء الاصطناعي: الحدود اليومية، والاستخدام لكل نوع، ومهام المكتب اليوم
  -- ===================================================================
  select value into j1 from app_settings where key = 'ai_limits';
  with u as (select kind, user_id, created_at from ai_usage where created_at >= t_prev),
  k as (select kk as kind from unnest(array['meal_photo', 'barcode', 'plan', 'office', 'coach', 'inbody']) kk)
  select jsonb_object_agg(k.kind, jsonb_build_object(
           'uses_today', (select count(*) from u where u.kind = k.kind and u.created_at >= t0),
           'uses_cur', (select count(*) from u where u.kind = k.kind and u.created_at >= t_cur),
           'uses_prev', (select count(*) from u where u.kind = k.kind and u.created_at < t_cur),
           'users_cur', (select count(distinct u.user_id) from u where u.kind = k.kind and u.created_at >= t_cur)))
  into j2 from k;

  v_ai := jsonb_build_object(
    -- نفس الافتراضي بالتطبيق لو الإعداد ما انحفظ
    'limits', jsonb_build_object(
      'barcode_per_day', case when jsonb_typeof(j1->'barcode_per_day') = 'number' then (j1->>'barcode_per_day')::numeric else 2 end,
      'meal_photos_per_day', case when jsonb_typeof(j1->'meal_photos_per_day') = 'number' then (j1->>'meal_photos_per_day')::numeric else 25 end),
    'fixed_caps', jsonb_build_object('plan', 8, 'office', 80, 'coach', 40, 'inbody', 10),
    'usage', j2,
    'office_tasks_today', (select count(*) from office_tasks t where t.created_at >= t0));

  -- ===================================================================
  -- المكتب نفسه: مهام الوكلاء حسب الحالة والمكتب
  -- ===================================================================
  with s as (select st from unnest(array['scheduled', 'in_progress', 'waiting_approval', 'done', 'failed']) st),
  dk as (select dd as desk from unnest(array['lead', 'clubs', 'stores', 'coaches', 'care', 'reports', 'marketing', 'users', 'ai']) dd),
  c as (select t.desk, t.status, count(*) as n from office_tasks t group by t.desk, t.status)
  select jsonb_build_object(
    'by_status', (select jsonb_object_agg(s.st, coalesce((select sum(c.n) from c where c.status = s.st), 0)) from s),
    'by_desk', (select jsonb_object_agg(dk.desk, (select jsonb_object_agg(s.st,
                   coalesce((select c.n from c where c.desk = dk.desk and c.status = s.st), 0)) from s)) from dk),
    'waiting_total', coalesce((select sum(c.n) from c where c.status = 'waiting_approval'), 0),
    'working_total', coalesce((select sum(c.n) from c where c.status in ('scheduled', 'in_progress')), 0),
    'oldest_waiting_at', (select min(t.created_at) from office_tasks t where t.status = 'waiting_approval'))
  into v_office;

  return jsonb_build_object(
    'meta', jsonb_build_object('generated_at', t_now, 'days', n, 'today', d0, 'cur_from', d_cur,
                               'prev_from', d_prev, 'prev_to', d_cur - 1, 'timezone', 'Asia/Riyadh'),
    'activity', v_activity,
    'bookings', v_bookings,
    'store', v_store,
    'community', v_community,
    'partners', v_partners,
    'reports', v_reports,
    'marketing', v_marketing,
    'ai', v_ai,
    'office', v_office);
end $$;
revoke all on function public.office_overview(integer) from public, anon;
grant execute on function public.office_overview(integer) to authenticated, service_role;
