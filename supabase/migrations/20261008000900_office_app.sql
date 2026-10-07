-- =====================================================================
-- مكتب أرك أب على الويب (المرحلة ٤): تبويب «التطبيق»
--   * طلبات التعديل (office_change_requests): المالك يطلب من Claude Code يعدّل التطبيق نفسه، والصفحة تفتح جلسة
--     Claude Code (فرع جديد + طلب دمج للمراجعة) وتحفظ الطلب هنا وتتابع حالته. ولا شي يوصل للناس لين المالك يدمج بنفسه.
--   * المحتوى والإعدادات: إعلان البداية، الفعاليات، تنبيهات التحفيز، الإعدادات (حدود الذكاء الاصطناعي وتنبيه السعرات)،
--     الشركاء (إخفاء/إظهار/شريك)، والمتدربين (تعديل الاسم واسم المستخدم، والتوثيق ✓).
--   كل الدوال في مخطط office_admin (من المرحلة ٣): ما لها أي صلاحية لـ anon/authenticated، بس postgres و service_role.
--   وكل وحدة تبدأ بـ _as_admin: تشتغل «بهوية المالك»، فنفس دوال التطبيق وحرّاس الجداول وسجل الإجراءات يشتغلون مثل ما هم.
--   ما ترجع إيميلات ولا أوقات دخول المستخدمين (users بدونها).
--   الشرح الكامل (كل دالة ورجوعها وأخطاؤها): docs/office-web.md (القسم ٧)
-- =====================================================================

-- =====================================================================
-- طلبات التعديل: سجل لكل طلب أرسله المالك لـ Claude Code من الويب
-- =====================================================================
create table if not exists public.office_change_requests (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) between 2 and 120),
  request     text not null check (char_length(btrim(request)) between 3 and 4000),
  -- القسم: التطبيق كله (app) أو واحد من مكاتب المكتب
  area        text check (area is null or area in ('app', 'lead', 'clubs', 'stores', 'coaches', 'care', 'reports', 'marketing',
                                                   'users', 'ai', 'activity', 'bookings', 'orders', 'community')),
  session_id  text check (session_id is null or session_id ~ '^session_[A-Za-z0-9]{8,80}$'),
  session_url text check (session_url is null or session_url ~ '^https://claude\.ai/code/session_[A-Za-z0-9]{8,80}$'),
  pr_url      text check (pr_url is null or pr_url ~ '^https://github\.com/[^[:space:]]{3,200}$'),
  -- sent: انحفظ بدون جلسة، working: الجلسة شغّالة، needs_you: الجلسة تنتظر ردّك، review: طلب الدمج جاهز لمراجعتك،
  -- done: خلص، failed: الجلسة فشلت، cancelled: ألغيته من الصفحة (يعلّمه بس، ما يوقف الجلسة)
  status      text not null default 'sent'
                check (status in ('sent', 'working', 'needs_you', 'review', 'done', 'failed', 'cancelled')),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists office_change_requests_created_idx on public.office_change_requests (created_at desc);
-- جلسة وحدة = طلب واحد (لو الصفحة أعادت الحفظ بعد خطأ شبكة ما يتكرر)
create unique index if not exists office_change_requests_session_key on public.office_change_requests (session_id)
  where session_id is not null;

alter table public.office_change_requests enable row level security;
-- يقرأها الأدمن بس. ما في سياسة إضافة/تعديل/حذف: الكتابة من office_admin بس
drop policy if exists office_change_requests_admin_read on public.office_change_requests;
create policy office_change_requests_admin_read on public.office_change_requests for select to authenticated using (is_admin());
revoke all on public.office_change_requests from anon;
revoke insert, update, delete, truncate on public.office_change_requests from authenticated;
grant select on public.office_change_requests to authenticated;

create or replace function public._office_change_requests_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists office_change_requests_touch on public.office_change_requests;
create trigger office_change_requests_touch before insert or update on public.office_change_requests
  for each row execute function public._office_change_requests_touch();

-- =====================================================================
-- أدوات صغيرة لقراءة حقول JSON من الصفحة (p jsonb). المفتاح مو موجود = تبقى القيمة القديمة.
-- أي قيمة غلط = 'bad_value: <اسم الحقل>' (الصفحة تطابق bad_value وتعرف الحقل من اللي بعده)
-- =====================================================================

-- نص: يتقص من الأطراف، والفاضي = null. أطول من p_max = bad_value
create or replace function office_admin._t(p jsonb, k text, p_max integer, p_old text)
returns text language plpgsql immutable set search_path = public as $$
declare s text;
begin
  if p is null or not (p ? k) then return p_old; end if;
  if jsonb_typeof(p -> k) = 'null' then return null; end if;
  if jsonb_typeof(p -> k) <> 'string' then raise exception 'bad_value: %', k; end if;
  s := regexp_replace(p ->> k, '^\s+|\s+$', '', 'g');
  if s = '' then return null; end if;
  if p_max is not null and char_length(s) > p_max then raise exception 'bad_value: %', k; end if;
  return s;
end $$;

-- قيمة من قائمة ثابتة (ما تقبل null)
create or replace function office_admin._e(p jsonb, k text, p_allowed text[], p_old text)
returns text language plpgsql immutable set search_path = public as $$
declare v text := p_old;
begin
  if p is not null and p ? k then
    if jsonb_typeof(p -> k) <> 'string' then raise exception 'bad_value: %', k; end if;
    v := p ->> k;
  end if;
  if v is null or not (v = any(p_allowed)) then raise exception 'bad_value: %', k; end if;
  return v;
end $$;

-- صح/غلط (ما تقبل null)
create or replace function office_admin._b(p jsonb, k text, p_old boolean)
returns boolean language plpgsql immutable set search_path = public as $$
begin
  if p is null or not (p ? k) then return p_old; end if;
  if jsonb_typeof(p -> k) <> 'boolean' then raise exception 'bad_value: %', k; end if;
  return (p ->> k)::boolean;
end $$;

-- رقم صحيح بين حدّين (رقم أو نص أرقام، يقبل الأرقام العربية)
create or replace function office_admin._i(p jsonb, k text, p_lo integer, p_hi integer, p_old integer)
returns integer language plpgsql immutable set search_path = public as $$
declare n numeric;
begin
  if p is null or not (p ? k) then return p_old; end if;
  n := office_admin._num(p -> k);
  if n is null or n <> round(n) or n < p_lo or n > p_hi then raise exception 'bad_value: %', k; end if;
  return n::integer;
end $$;

-- تاريخ YYYY-MM-DD (فاضي = null)
create or replace function office_admin._d(p jsonb, k text, p_old date)
returns date language plpgsql stable set search_path = public as $$
declare s text;
begin
  if p is null or not (p ? k) then return p_old; end if;
  if jsonb_typeof(p -> k) = 'null' then return null; end if;
  if jsonb_typeof(p -> k) <> 'string' then raise exception 'bad_value: %', k; end if;
  s := btrim(p ->> k);
  if s = '' then return null; end if;
  if s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'bad_value: %', k; end if;
  begin
    return s::date;
  exception when others then
    raise exception 'bad_value: %', k;
  end;
end $$;

-- وقت: ISO مع منطقة زمنية كما هو، وبدونها = وقت الرياض. يوم بس (YYYY-MM-DD) = بداية اليوم بالرياض،
-- أو آخره لو p_end (نفس لوحة الإعلانات بالتطبيق). فاضي = null
create or replace function office_admin._ts(p jsonb, k text, p_end boolean, p_old timestamptz)
returns timestamptz language plpgsql stable set search_path = public as $$
declare s text;
begin
  if p is null or not (p ? k) then return p_old; end if;
  if jsonb_typeof(p -> k) = 'null' then return null; end if;
  if jsonb_typeof(p -> k) <> 'string' then raise exception 'bad_value: %', k; end if;
  s := btrim(p ->> k);
  if s = '' then return null; end if;
  begin
    if s ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      return (s::date + case when p_end then 1 else 0 end)::timestamp at time zone 'Asia/Riyadh';
    end if;
    if s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,6})?)?(Z|[+-][0-9]{2}(:?[0-9]{2})?)?$' then
      raise exception 'bad_value: %', k;
    end if;
    if s ~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' then return s::timestamptz; end if;
    return s::timestamp at time zone 'Asia/Riyadh';
  exception when others then
    raise exception 'bad_value: %', k;
  end;
end $$;

-- إعلان البداية كما ترجعه الصفحة: الأعمدة + حالته (نفس adState بالتطبيق: off / ended / scheduled / live)
create or replace function office_admin._ad_json(a public.launch_ads)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', a.id, 'kind', a.kind, 'title', a.title, 'media_path', a.media_path, 'media_type', a.media_type,
    'link', a.link, 'cta', a.cta, 'audience', a.audience, 'starts_at', a.starts_at, 'ends_at', a.ends_at,
    'active', a.active, 'frequency', a.frequency, 'auto_close', a.auto_close, 'priority', a.priority,
    'created_at', a.created_at, 'updated_at', a.updated_at,
    'state', case when not a.active then 'off'
                  when a.ends_at is not null and a.ends_at <= now() then 'ended'
                  when a.starts_at is not null and a.starts_at > now() then 'scheduled'
                  else 'live' end);
$$;

-- تنبيه التحفيز كما ترجعه الصفحة
create or replace function office_admin._nudge_json(n public.nudge_templates)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', n.id, 'category', n.category, 'gender', n.gender, 'friend_gender', n.friend_gender, 'locale', n.locale,
    'title', n.title, 'body', n.body, 'active', n.active, 'updated_at', n.updated_at,
    'last_broadcast_at', n.last_broadcast_at, 'last_broadcast_n', n.last_broadcast_n);
$$;

-- =====================================================================
-- طلبات التعديل
-- =====================================================================

-- آخر p_limit طلب (١..٢٠٠)، الأحدث أول، بكل الأعمدة
create or replace function office_admin.requests(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_lim int := least(greatest(coalesce(p_limit, 50), 1), 200); v jsonb;
begin
  perform office_admin._as_admin();
  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id desc), '[]'::jsonb) into v
  from (select * from office_change_requests order by created_at desc, id desc limit v_lim) r;
  return v;
end $$;

-- طلب جديد (بعد ما الصفحة تفتح جلسة Claude Code — أو بدونها لو ما انفتحت). يرجع الصف المحفوظ.
-- مع رقم جلسة: الحالة working، والرابط ينبني منه لو ما جا. نفس الجلسة مرة ثانية = يرجع الطلب اللي قبل بدون تغيير
create or replace function office_admin.add_request(p_title text, p_request text, p_area text, p_session_id text, p_session_url text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid; r office_change_requests;
  v_title text := btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
  v_req   text := regexp_replace(coalesce(p_request, ''), '^\s+|\s+$', '', 'g');
  v_area  text := nullif(btrim(coalesce(p_area, '')), '');
  v_sid   text := nullif(btrim(coalesce(p_session_id, '')), '');
  v_url   text := nullif(btrim(coalesce(p_session_url, '')), '');
begin
  v_admin := office_admin._as_admin();
  if char_length(v_title) not between 2 and 120 or char_length(v_req) not between 3 and 4000 then raise exception 'bad_input'; end if;
  if v_area is not null and v_area not in ('app', 'lead', 'clubs', 'stores', 'coaches', 'care', 'reports', 'marketing',
                                           'users', 'ai', 'activity', 'bookings', 'orders', 'community') then
    raise exception 'bad_input';
  end if;
  if v_sid is not null and v_sid !~ '^session_[A-Za-z0-9]{8,80}$' then raise exception 'bad_input'; end if;
  if v_url is null and v_sid is not null then v_url := 'https://claude.ai/code/' || v_sid; end if;
  if v_url is not null and v_url !~ '^https://claude\.ai/code/session_[A-Za-z0-9]{8,80}$' then raise exception 'bad_input'; end if;
  if v_sid is not null then
    select * into r from office_change_requests where session_id = v_sid;
    if found then return to_jsonb(r); end if;
  end if;
  insert into office_change_requests (title, request, area, session_id, session_url, status, created_by)
  values (v_title, v_req, v_area, v_sid, v_url, case when v_sid is null then 'sent' else 'working' end, v_admin)
  returning * into r;
  return to_jsonb(r);
end $$;

-- حالة الطلب (من «تحديث الحالة» أو «إلغاء») ورابط طلب الدمج لو لقيته الصفحة. p_pr_url = null/فاضي: الرابط اللي قبل يبقى
create or replace function office_admin.update_request(p_id uuid, p_status text, p_pr_url text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r office_change_requests; v_pr text := nullif(btrim(coalesce(p_pr_url, '')), '');
begin
  perform office_admin._as_admin();
  if p_status is null or p_status not in ('sent', 'working', 'needs_you', 'review', 'done', 'failed', 'cancelled') then
    raise exception 'bad_status';
  end if;
  if v_pr is not null and v_pr !~ '^https://github\.com/[^[:space:]]{3,200}$' then raise exception 'bad_input'; end if;
  update office_change_requests set status = p_status, pr_url = coalesce(v_pr, pr_url) where id = p_id
  returning * into r;
  if not found then raise exception 'not_found'; end if;
  return to_jsonb(r);
end $$;

-- =====================================================================
-- المحتوى والإعدادات: كل شي بطلب واحد
-- =====================================================================
create or replace function office_admin.content()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ads jsonb; v_events jsonb; v_nudges jsonb; v_ai jsonb; v_cal jsonb;
begin
  perform office_admin._as_admin();
  -- إعلانات البداية كلها (الأحدث أول)
  select coalesce(jsonb_agg(office_admin._ad_json(a) order by a.created_at desc, a.id), '[]'::jsonb) into v_ads from launch_ads a;
  -- آخر ٨٠ فعالية بتاريخها (أو يوم إضافتها لو بدون تاريخ)، الأحدث أول، بكل الأعمدة
  select coalesce(jsonb_agg(to_jsonb(e) order by coalesce(e.starts_on, (e.created_at at time zone 'Asia/Riyadh')::date) desc, e.id), '[]'::jsonb)
  into v_events
  from (select * from local_events
        order by coalesce(starts_on, (created_at at time zone 'Asia/Riyadh')::date) desc, id limit 80) e;
  -- آخر ٣٠٠ نص تحفيز، مرتبة مثل شاشة التطبيق (النوع، الجمهور، الأقدم أول)
  select coalesce(jsonb_agg(office_admin._nudge_json(n) order by n.category, n.gender, n.created_at, n.id), '[]'::jsonb) into v_nudges
  from nudge_templates n
  where n.id in (select x.id from nudge_templates x order by x.created_at desc, x.id limit 300);
  -- الإعدادات بنفس افتراضي التطبيق لو ما انحفظت
  select value into v_ai from app_settings where key = 'ai_limits';
  select value into v_cal from app_settings where key = 'calorie_alert';
  return jsonb_build_object(
    'ads', v_ads,
    'events', v_events,
    'nudges', v_nudges,
    'settings', jsonb_build_object(
      'ai_limits', jsonb_build_object(
        'barcode_per_day', case when jsonb_typeof(v_ai -> 'barcode_per_day') = 'number' then (v_ai ->> 'barcode_per_day')::numeric else 2 end,
        'meal_photos_per_day', case when jsonb_typeof(v_ai -> 'meal_photos_per_day') = 'number' then (v_ai ->> 'meal_photos_per_day')::numeric else 25 end),
      'calorie_alert', jsonb_build_object(
        'enabled', true, 'threshold', 200,
        'title_ar', 'باقي لك {n} سعرة وتكمّل احتياجك',
        'body_ar', 'أكلت {eaten} من {goal} سعرة اليوم. خل آخر شي تاكله خفيف وفيه بروتين.',
        'title_en', '{n} kcal left to hit your target',
        'body_en', 'You''ve had {eaten} of {goal} kcal today. Keep the last bite light and high in protein.')
        || coalesce(case when jsonb_typeof(v_cal) = 'object' then v_cal end, '{}'::jsonb)));
end $$;

-- ---------- إعلان البداية: تعديل إعلان موجود بس (الجديد يحتاج صورة/فيديو: يتضاف من التطبيق) ----------
-- الحقول اللي ما جت في p تبقى مثل ما هي. سجل الإجراءات من trigger الجدول (edit / show / hide)
create or replace function office_admin.save_ad(p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a launch_ads; v_con text;
begin
  perform office_admin._as_admin();
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'bad_input'; end if;
  select * into a from launch_ads where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  a.title := office_admin._t(p, 'title', 80, a.title);
  if a.title is null or char_length(a.title) < 2 then raise exception 'bad_value: title'; end if;
  a.kind := office_admin._e(p, 'kind', array['ad', 'awareness', 'occasion'], a.kind);
  -- نفس validAdLink بالتطبيق: صفحة داخل التطبيق (/...) أو رابط https
  a.link := office_admin._t(p, 'link', 300, a.link);
  if a.link is not null and not (a.link ~ '^/[A-Za-z0-9_/?=&.%\[\]-]*$' or a.link ~ '^https://[^[:space:]]+$') then
    raise exception 'bad_value: link';
  end if;
  a.cta := office_admin._t(p, 'cta', 30, a.cta);
  a.audience := office_admin._e(p, 'audience', array['all', 'men', 'women'], a.audience);
  a.starts_at := office_admin._ts(p, 'starts_at', false, a.starts_at);
  a.ends_at := office_admin._ts(p, 'ends_at', true, a.ends_at);
  if a.starts_at is not null and a.ends_at is not null and a.ends_at <= a.starts_at then raise exception 'bad_value: ends_at'; end if;
  a.active := office_admin._b(p, 'active', a.active);
  a.frequency := office_admin._e(p, 'frequency', array['every_open', 'daily', 'once'], a.frequency);
  a.auto_close := office_admin._i(p, 'auto_close', 0, 30, a.auto_close);
  a.priority := office_admin._i(p, 'priority', 0, 100, a.priority);
  begin
    update launch_ads set title = a.title, kind = a.kind, link = a.link, cta = a.cta, audience = a.audience,
                          starts_at = a.starts_at, ends_at = a.ends_at, active = a.active, frequency = a.frequency,
                          auto_close = a.auto_close, priority = a.priority
     where id = p_id
    returning * into a;
  exception when check_violation then
    get stacked diagnostics v_con = constraint_name;
    raise exception 'bad_value: %', coalesce(v_con, 'check');
  end;
  return office_admin._ad_json(a);
end $$;

create or replace function office_admin.set_ad_active(p_id uuid, p_active boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform office_admin._as_admin();
  if p_active is null then raise exception 'bad_input'; end if;
  update launch_ads set active = p_active where id = p_id;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- الفعاليات: إضافة (p_id = null) أو تعديل. الصورة (image_path) ما تتغير من هنا ----------
-- النصوص تتقص، والفاضي = null. سجل الإجراءات من trigger الجدول (create / edit / show / hide)
create or replace function office_admin.save_event(p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e local_events; v_con text;
begin
  perform office_admin._as_admin();
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'bad_input'; end if;
  if p_id is null then
    e.category := 'other'; e.featured := false; e.active := true;
  else
    select * into e from local_events where id = p_id for update;
    if not found then raise exception 'not_found'; end if;
  end if;
  e.category := office_admin._e(p, 'category',
    array['running', 'horse_racing', 'hiking', 'shooting', 'boxing', 'motorsport', 'cycling', 'football', 'other'], e.category);
  e.title := office_admin._t(p, 'title', 90, e.title);
  if e.title is null or char_length(e.title) < 2 then raise exception 'bad_value: title'; end if;
  e.title_en := office_admin._t(p, 'title_en', 90, e.title_en);
  e.city := office_admin._t(p, 'city', 40, e.city);
  e.city_en := office_admin._t(p, 'city_en', 40, e.city_en);
  e.venue := office_admin._t(p, 'venue', 90, e.venue);
  e.venue_en := office_admin._t(p, 'venue_en', 90, e.venue_en);
  e.starts_on := office_admin._d(p, 'starts_on', e.starts_on);
  e.ends_on := office_admin._d(p, 'ends_on', e.ends_on);
  if e.starts_on is not null and e.ends_on is not null and e.ends_on < e.starts_on then raise exception 'bad_value: ends_on'; end if;
  e.date_note := office_admin._t(p, 'date_note', 80, e.date_note);
  e.date_note_en := office_admin._t(p, 'date_note_en', 80, e.date_note_en);
  e.summary := office_admin._t(p, 'summary', 500, e.summary);
  e.summary_en := office_admin._t(p, 'summary_en', 500, e.summary_en);
  e.url := office_admin._t(p, 'url', 300, e.url);
  if e.url is not null and e.url !~ '^https://[^[:space:]]+$' then raise exception 'bad_value: url'; end if;
  e.featured := office_admin._b(p, 'featured', e.featured);
  e.active := office_admin._b(p, 'active', e.active);
  -- حرّاس الجدول نفسه احتياط أخير: نفس الرمز
  begin
    if p_id is null then
      insert into local_events (category, title, title_en, city, city_en, venue, venue_en, starts_on, ends_on, date_note, date_note_en,
                                summary, summary_en, url, featured, active)
      values (e.category, e.title, e.title_en, e.city, e.city_en, e.venue, e.venue_en, e.starts_on, e.ends_on, e.date_note, e.date_note_en,
              e.summary, e.summary_en, e.url, e.featured, e.active)
      returning * into e;
    else
      update local_events set category = e.category, title = e.title, title_en = e.title_en, city = e.city, city_en = e.city_en,
                              venue = e.venue, venue_en = e.venue_en, starts_on = e.starts_on, ends_on = e.ends_on,
                              date_note = e.date_note, date_note_en = e.date_note_en, summary = e.summary, summary_en = e.summary_en,
                              url = e.url, featured = e.featured, active = e.active
       where id = p_id
      returning * into e;
    end if;
  exception when check_violation then
    get stacked diagnostics v_con = constraint_name;
    raise exception 'bad_value: %', coalesce(v_con, 'check');
  end;
  return to_jsonb(e);
end $$;

create or replace function office_admin.set_event_active(p_id uuid, p_active boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform office_admin._as_admin();
  if p_active is null then raise exception 'bad_input'; end if;
  update local_events set active = p_active where id = p_id;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- تنبيهات التحفيز: إضافة (موقوف إلا لو active = true) أو تعديل النص والجمهور ----------
-- المتغيرات المسموحة لكل نوع نفس validNudgeText (غيرها = bad_nudge). جمهور الصديق للنوع friend بس (غيره = all).
-- الجدول ما له سجل إجراءات بالتطبيق: نسجّل تعديلات الويب بأنفسنا
create or replace function office_admin.save_nudge(p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n nudge_templates; v_new boolean := p_id is null;
begin
  perform office_admin._as_admin();
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'bad_input'; end if;
  if v_new then
    n.gender := 'all'; n.friend_gender := 'all'; n.locale := 'ar';
    n.active := office_admin._b(p, 'active', false);
  else
    select * into n from nudge_templates where id = p_id for update;
    if not found then raise exception 'not_found'; end if;
  end if;
  n.category := office_admin._e(p, 'category', array['gym', 'friend', 'streak', 'workout', 'meal'], n.category);
  n.gender := office_admin._e(p, 'gender', array['all', 'male', 'female'], n.gender);
  n.friend_gender := office_admin._e(p, 'friend_gender', array['all', 'male', 'female'], n.friend_gender);
  if n.category <> 'friend' then n.friend_gender := 'all'; end if;
  n.locale := office_admin._e(p, 'locale', array['ar', 'en'], n.locale);
  n.title := office_admin._t(p, 'title', null, n.title);
  n.body := office_admin._t(p, 'body', null, n.body);
  if not office_admin._nudge_ok(n.category, n.title, n.body) then raise exception 'bad_nudge'; end if;
  if v_new then
    insert into nudge_templates (category, gender, friend_gender, locale, title, body, active)
    values (n.category, n.gender, n.friend_gender, n.locale, n.title, n.body, n.active)
    returning * into n;
  else
    update nudge_templates set category = n.category, gender = n.gender, friend_gender = n.friend_gender, locale = n.locale,
                               title = n.title, body = n.body
     where id = p_id
    returning * into n;
  end if;
  perform _admin_log('nudge', n.id::text, case when v_new then 'create' else 'edit' end, n.title);
  return office_admin._nudge_json(n);
end $$;

create or replace function office_admin.set_nudge_active(p_id uuid, p_active boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  perform office_admin._as_admin();
  if p_active is null then raise exception 'bad_input'; end if;
  update nudge_templates set active = p_active where id = p_id returning title into v_title;
  if not found then raise exception 'not_found'; end if;
  perform _admin_log('nudge', p_id::text, case when p_active then 'show' else 'hide' end, v_title);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- الإعدادات: حدود الذكاء الاصطناعي وتنبيه السعرات ----------
-- حارس app_settings هو اللي يتحقق وينظّف (bad_value) ويكتب سجل الإجراءات. هنا بس: المفتاح، وإن القيمة كائن،
-- ومتغيرات نص تنبيه السعرات ({n} {eaten} {goal} بس). يرجع القيمة بعد التنظيف
create or replace function office_admin.save_setting(p_key text, p_value jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb; k text; s text; tok text;
begin
  perform office_admin._as_admin();
  if p_key is null or p_key not in ('ai_limits', 'calorie_alert') then raise exception 'bad_input'; end if;
  if p_value is null or jsonb_typeof(p_value) <> 'object' then raise exception 'bad_value'; end if;
  if p_key = 'calorie_alert' then
    foreach k in array array['title_ar', 'body_ar', 'title_en', 'body_en'] loop
      if jsonb_typeof(p_value -> k) = 'string' then
        s := p_value ->> k;
        for tok in select (regexp_matches(s, '\{([^{}]*)\}', 'g'))[1] loop
          if tok not in ('n', 'eaten', 'goal') then raise exception 'bad_value: %', k; end if;
        end loop;
        if regexp_replace(s, '\{[^{}]*\}', '', 'g') ~ '[{}]' then raise exception 'bad_value: %', k; end if;
      end if;
    end loop;
  end if;
  insert into app_settings (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value
  returning value into v;
  return jsonb_build_object('ok', true, 'key', p_key, 'value', v);
end $$;

-- =====================================================================
-- الشركاء: نفس قائمة وإجراءات «إدارة الشركاء» بالتطبيق (بدون اعتماد ولا رفض ولا حذف من هنا)
-- =====================================================================

-- صفوف admin_partner_list (أول ٢٠٠ بنفس ترتيبها). رقم ترخيص المركز ما يطلع
create or replace function office_admin.partners(p_kind text, p_q text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform office_admin._as_admin();
  if p_kind is null or p_kind not in ('club', 'store', 'coach', 'center', 'venue') then raise exception 'bad_status'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.r_id, 'name', l.r_name, 'subtitle', l.r_subtitle, 'status', l.r_status, 'logo_path', l.r_logo,
           'avatar_url', l.r_avatar, 'owner_id', l.r_owner, 'owner_username', l.r_owner_username, 'listed_by', l.r_listed_by,
           'partner', l.r_partner, 'meta', coalesce(l.r_meta, '{}'::jsonb) - 'license_no', 'created_at', l.r_created_at)
         order by l.r_ord), '[]'::jsonb)
  into v
  from (select * from admin_partner_list(p_kind, nullif(left(btrim(coalesce(p_q, '')), 80), ''))
          with ordinality as x(r_id, r_name, r_subtitle, r_status, r_logo, r_avatar, r_owner, r_owner_username, r_listed_by,
                               r_partner, r_meta, r_created_at, r_ord)
        order by x.r_ord limit 200) l;
  return v;
end $$;

-- إخفاء/إظهار/شريك: نفس admin_partner_action (وسجلّه). للمتاجر والمدربين والمراكز والملاعب: الإخفاء للمعتمد بس،
-- والإظهار للموقوف بس — عشان «إظهار» ما يصير اعتماد لطلب معلّق أو مرفوض (الاعتماد من طلبات الشركاء)
create or replace function office_admin.partner_action(p_kind text, p_id uuid, p_action text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_st text; v_note text := nullif(btrim(left(regexp_replace(coalesce(p_note, ''), '^\s+|\s+$', '', 'g'), 300)), '');
begin
  perform office_admin._as_admin();
  if p_action is null or p_action not in ('hide', 'show', 'partner_on', 'partner_off') then raise exception 'bad_status'; end if;
  if p_kind is null or p_kind not in ('club', 'store', 'coach', 'center', 'venue') then raise exception 'bad_status'; end if;
  if p_id is null then raise exception 'request_not_found'; end if;
  if p_kind <> 'club' and p_action in ('hide', 'show') then
    v_st := office_admin._target_status(p_kind, p_id);
    if v_st is null then raise exception 'request_not_found'; end if;
    if (p_action = 'hide' and v_st <> 'approved') or (p_action = 'show' and v_st <> 'suspended') then raise exception 'bad_status'; end if;
  end if;
  perform admin_partner_action(p_kind, p_id, p_action, v_note);
  return jsonb_build_object('ok', true);
end $$;

-- =====================================================================
-- المتدربين: القائمة بدون الإيميل ووقت آخر دخول، وتعديل الاسم واسم المستخدم، والتوثيق ✓
-- =====================================================================

-- صفوف admin_user_list (البحث بالاسم أو اسم المستخدم — أو الإيميل، لكنه ما يرجع أبداً) + is_coach للتوثيق
create or replace function office_admin.users(p_q text default null, p_kind text default 'all', p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb; v_kind text := coalesce(p_kind, 'all');
begin
  perform office_admin._as_admin();
  if v_kind not in ('trainee', 'partner', 'all') then raise exception 'bad_input'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', u.r_id, 'username', u.r_username, 'full_name', u.r_full_name, 'avatar_url', u.r_avatar_url,
           'account_type', u.r_account_type, 'gender', u.r_gender, 'created_at', u.r_created_at,
           'email_confirmed', u.r_email_confirmed, 'points', u.r_points, 'gym_name', u.r_gym_name, 'gym_name_en', u.r_gym_name_en,
           'is_admin', u.r_is_admin, 'partner_intent', u.r_partner_intent, 'is_coach', coalesce(p.is_coach, false),
           'total', u.r_total)
         order by u.r_ord), '[]'::jsonb)
  into v
  from admin_user_list(nullif(left(btrim(coalesce(p_q, '')), 80), ''), v_kind, p_limit, p_offset)
         with ordinality as u(r_id, r_email, r_username, r_full_name, r_avatar_url, r_account_type, r_gender, r_created_at,
                              r_last_sign_in_at, r_email_confirmed, r_points, r_gym_name, r_gym_name_en, r_is_admin, r_total,
                              r_partner_intent, r_ord)
  left join profiles p on p.id = u.r_id;
  return v;
end $$;

-- نفس admin_update_user (وأخطاؤه وسجلّه). يرجع الاسم واسم المستخدم بعد التنظيف
create or replace function office_admin.update_user(p_user uuid, p_full_name text, p_username text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform office_admin._as_admin();
  perform admin_update_user(p_user, p_full_name, p_username);
  select jsonb_build_object('ok', true, 'id', id, 'username', username, 'full_name', full_name) into v from profiles where id = p_user;
  return v;
end $$;

-- التوثيق ✓: نفس set_coach (يمشي مع حالة ملف المدرب لو عنده ملف). set_coach ما يسجّل: نسجّل هنا
create or replace function office_admin.set_verified(p_user uuid, p_value boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_coach boolean;
begin
  perform office_admin._as_admin();
  if p_value is null then raise exception 'bad_input'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'user_not_found'; end if;
  perform set_coach(p_user, p_value);
  perform _admin_log('coach', p_user::text, case when p_value then 'verify' else 'unverify' end, null);
  select is_coach into v_coach from profiles where id = p_user;
  return jsonb_build_object('ok', true, 'is_coach', v_coach);
end $$;

-- ما أحد غير القاعدة نفسها: لا anon ولا authenticated ولا الكل (service_role للخادم)
revoke all on all functions in schema office_admin from public;
revoke all on all functions in schema office_admin from anon, authenticated;
grant execute on all functions in schema office_admin to service_role;
revoke all on function public._office_change_requests_touch() from public, anon, authenticated;
