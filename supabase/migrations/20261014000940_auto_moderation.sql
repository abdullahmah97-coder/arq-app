-- =====================================================================
-- الفحص الآلي للنصوص بعد النشر (خطة Hugging Face، مرحلة «خلال شهر»، البند ٨):
--   فلتر الكلمات (moderation_terms) يمنع الشتائم الواضحة قبل النشر، وصورة المنشور يفحصها Claude قبل ما تبان.
--   هذا يضيف طبقة ثانية للنص نفسه بعد ما ينشر: نموذج Qwen3Guard يقرأ المنشور أو التعليق ويقول آمن أو غير آمن
--   أو «محل خلاف»، ويلقط اللي ما فيه كلمة ممنوعة: تحرش، تنمر، تهديد، إيذاء النفس، بيانات شخصية لشخص ثاني.
--
--   * القرار للمالك: النتيجة تطلع في «بلاغات المجتمع» (نفس الطابور ونفس الأزرار) مع وسم «فحص آلي».
--     الوضع الافتراضي flag = تنبيه بس، ما ينخفى شي. وضع hide (يختاره المالك) يخفي «غير الآمن» مؤقتاً لين يراجعه.
--   * يبدأ موقّف: app_settings.auto_moderation = {"enabled": false, "action": "flag", "messages": false, "daily_cap": 3000}
--     والمالك يشغّله من لوحة إدارة التطبيق ← بلاغات المجتمع ← الفحص الآلي، بعد ما يضيف HF_TOKEN.
--   * الرسائل الخاصة برا الفحص إلا لو شغّلها المالك (messages = true): نصها يروح لمزوّد خارجي ويطلع للمشرف لو انعلّم.
--   * ما يأخر المستخدم: الإضافة تحط المحتوى في طابور (moderation_jobs)، وكل دقيقة pg_cron يصحّي دالة الخادم moderate
--     (طلب HTTP بالخلفية عبر pg_net) وهي تفحص دفعة وترجع النتيجة بـ moderation_settle.
--   * الحد اليومي (daily_cap): عدد الفحوصات بآخر ٢٤ ساعة لكل التطبيق، عشان فاتورة Hugging Face ما تنفلت
--     (فشل التوكن أو الرصيد أو النموذج ما ينحسب منه). وكل كاتب ٢٠٠ فحص باليوم بالأكثر، والدفعة تبدأ بأقدم نص
--     لكل كاتب، فواحد ينشر ويعدّل كثير ما يخلّص حد الكل ولا يأخر فحص غيره.
--   * الإعداد للمالك بس (is_owner). أي مشرف ثاني يقدر يوقفه أو يوقف فحص الرسائل، بس ما يشغّل أو يغيّر شي.
--   * moderation_log: سجل بدون نص وبدون أسماء (النوع، النتيجة، الفئات، النموذج، الوقت) للأرقام بس، ينحذف بعد ٩٠ يوم.
--   أسرار vault (مرة وحدة لكل مشروع):
--     moderation_key  ينشئه هذا الترحيل لو مو موجود.
--     moderation_url  تضيفه بنفسك من SQL Editor:
--       select vault.create_secret('https://<ref>.supabase.co/functions/v1/moderate', 'moderation_url');
--   الشرح الكامل: docs/auto-moderation.md
--   بدون أي DROP (Supabase يطلب تأكيد يدوي على أي DROP)
-- =====================================================================

set local lock_timeout = '5s';

-- ---------- الإعداد ----------
insert into public.app_settings (key, value)
values ('auto_moderation', '{"enabled": false, "action": "flag", "messages": false, "daily_cap": 3000}'::jsonb)
on conflict (key) do nothing;

-- نفس الحارس بالحرف (barcode_ai) + فرع auto_moderation
create or replace function public._app_settings_guard()
returns trigger language plpgsql set search_path = public as $$
declare v jsonb := new.value; t integer; b integer; m integer;
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if new.key = 'calorie_alert' then
    begin t := (v->>'threshold')::integer; exception when others then t := null; end;
    if t is null or t < 50 or t > 500 then raise exception 'bad_value'; end if;
    if coalesce(jsonb_typeof(v->'enabled'), '') <> 'boolean' then raise exception 'bad_value'; end if;
    if char_length(btrim(coalesce(v->>'title_ar', ''))) not between 2 and 80
       or char_length(btrim(coalesce(v->>'body_ar', ''))) not between 2 and 200
       or char_length(coalesce(v->>'title_en', '')) > 80 or char_length(coalesce(v->>'body_en', '')) > 200 then
      raise exception 'bad_value';
    end if;
    -- نخزن فقط المفاتيح المعروفة
    new.value := jsonb_build_object('enabled', (v->>'enabled')::boolean, 'threshold', t,
      'title_ar', btrim(v->>'title_ar'), 'body_ar', btrim(v->>'body_ar'),
      'title_en', nullif(btrim(coalesce(v->>'title_en', '')), ''), 'body_en', nullif(btrim(coalesce(v->>'body_en', '')), ''));
  elsif new.key = 'ai_limits' then
    begin
      b := (v->>'barcode_per_day')::integer;
      m := (v->>'meal_photos_per_day')::integer;
    exception when others then b := null;
    end;
    if b is null or m is null or b < 0 or b > 100 or m < 0 or m > 200 then raise exception 'bad_value'; end if;
    new.value := jsonb_build_object('barcode_per_day', b, 'meal_photos_per_day', m);
  elsif new.key = 'auto_moderation' then
    begin t := (v->>'daily_cap')::integer; exception when others then t := null; end;
    if t is null or t < 0 or t > 20000 then raise exception 'bad_value'; end if;
    if coalesce(jsonb_typeof(v->'enabled'), '') <> 'boolean' or coalesce(jsonb_typeof(v->'messages'), '') <> 'boolean'
       or coalesce(v->>'action', '') not in ('flag', 'hide') then
      raise exception 'bad_value';
    end if;
    new.value := jsonb_build_object('enabled', (v->>'enabled')::boolean, 'action', v->>'action',
      'messages', (v->>'messages')::boolean, 'daily_cap', t);
    -- المالك بس يشغّل أو يغيّر (نص الرسائل الخاصة يطلع لمزوّد خارجي). أي مشرف ثاني يقدر يوقف بس
    -- (الخادم والقاعدة نفسها بدون مستخدم: مسموح)
    if auth.uid() is not null and not is_owner() then
      if tg_op <> 'UPDATE'
         or new.value->>'action' is distinct from old.value->>'action'
         or new.value->>'daily_cap' is distinct from old.value->>'daily_cap'
         or ((new.value->>'enabled')::boolean and new.value->>'enabled' is distinct from old.value->>'enabled')
         or ((new.value->>'messages')::boolean and new.value->>'messages' is distinct from old.value->>'messages') then
        raise exception 'not_allowed';
      end if;
    end if;
  end if;
  return new;
end $$;

create or replace function public._automod()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select value from app_settings where key = 'auto_moderation'), '{}'::jsonb);
$$;
revoke all on function public._automod() from public, anon, authenticated;

-- نسخة النص للمراجعة: ١٠٠٠ حرف، أو ٧٠٠ لو حروفه كبيرة (إيموجي) عشان النسخة تبقى تحت ٤٠٠٠ بايت
create or replace function public._automod_snip(t text)
returns text language sql immutable set search_path = public as $$
  select case when octet_length(left(t, 1000)) <= 3000 then left(t, 1000) else left(t, 700) end;
$$;
revoke all on function public._automod_snip(text) from public, anon, authenticated;

-- ---------- الجداول ----------
-- الطابور: محتوى ينتظر الفحص (محد يوصله من التطبيق: الخادم بس)
create table if not exists public.moderation_jobs (
  target_type text not null check (target_type in ('post','comment','checkin_comment','message')),
  target_id   uuid not null,
  attempts    smallint not null default 0,
  next_at     timestamptz not null default now(),
  -- وقت آخر نص انضاف للطابور: لو انعدّل المحتوى وهو ينفحص، نتيجة النص القديم ما تمسح الفحص الجديد
  queued_at   timestamptz not null default clock_timestamp(),
  author      uuid,  -- كاتب النص: الدفعة تتوزع على الكتّاب، ولكل كاتب حد يومي
  primary key (target_type, target_id)
);
create index if not exists moderation_jobs_due on public.moderation_jobs (next_at);
alter table public.moderation_jobs enable row level security;
revoke all on public.moderation_jobs from anon, authenticated;

-- كم فحص لكل كاتب باليوم (يوم الرياض). ينحذف بعد يومين
create table if not exists public.moderation_usage (
  author uuid not null,
  day    date not null,
  n      integer not null default 0,
  primary key (author, day)
);
alter table public.moderation_usage enable row level security;
revoke all on public.moderation_usage from anon, authenticated;

-- نتيجة الفحص اللي تحتاج مراجعة (وحدة لكل محتوى). يشوفها المشرف بس
create table if not exists public.auto_flags (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post','comment','checkin_comment','message')),
  target_id   uuid not null,
  target_user uuid references public.profiles(id) on delete cascade,
  label       text not null check (label in ('unsafe','controversial')),
  categories  text[] not null default '{}' check (categories <@ array['violent','illegal','sexual','pii','self_harm','unethical','political']::text[]),
  model       text check (model is null or char_length(model) <= 100),
  snapshot    jsonb not null default '{}'::jsonb check (pg_column_size(snapshot) <= 4000),
  hidden      boolean not null default false,  -- انخفى تلقائياً (وضع hide)
  status      text not null default 'open' check (status in ('open','actioned','dismissed')),
  action      text check (action is null or action in ('hide','restore','approve','suspend','unsuspend','dismiss')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (target_type, target_id)
);
create index if not exists auto_flags_status on public.auto_flags (status, updated_at desc);
alter table public.auto_flags enable row level security;
do $p$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'auto_flags' and policyname = 'auto_flags_admin') then
    create policy auto_flags_admin on public.auto_flags for select to authenticated using (is_admin());
  end if;
end $p$;
revoke insert, update, delete on public.auto_flags from anon, authenticated;

-- سجل الأرقام: بدون نص وبدون أسماء أو معرّفات
create table if not exists public.moderation_log (
  id          bigserial primary key,
  target_type text not null check (target_type in ('post','comment','checkin_comment','message')),
  result      text not null check (result in ('safe','unsafe','controversial','error','gone')),
  categories  text[] not null default '{}',
  model       text check (model is null or char_length(model) <= 100),
  ms          integer check (ms is null or ms between 0 and 600000),
  error       text check (error is null or char_length(error) <= 40),
  created_at  timestamptz not null default now()
);
create index if not exists moderation_log_time on public.moderation_log (created_at);
alter table public.moderation_log enable row level security;
do $p$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'moderation_log' and policyname = 'moderation_log_admin') then
    create policy moderation_log_admin on public.moderation_log for select to authenticated using (is_admin());
  end if;
end $p$;
revoke insert, update, delete on public.moderation_log from anon, authenticated;

-- الفحوصات اللي تنحسب من الحد اليومي: كل نداء للمزوّد، إلا اللي فشل بسبب الإعداد (التوكن أو الرصيد أو النموذج)
create or replace function public._automod_used()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from moderation_log
  where created_at > now() - interval '24 hours'
    and (result in ('safe', 'unsafe', 'controversial') or (result = 'error' and coalesce(error, '') not in ('auth', 'credits', 'model')));
$$;
revoke all on function public._automod_used() from public, anon, authenticated;

-- ---------- الإضافة للطابور (بعد النشر أو التعديل) ----------
-- ما توقف النشر أبداً: لو صار خطأ هنا ينكتب تحذير بالسجل والمنشور يكمّل
create or replace function public._automod_enqueue()
returns trigger language plpgsql security definer set search_path = public as $$
declare s jsonb; v_type text; v_text text; v_old text; v_author uuid;
begin
  s := _automod();
  if not coalesce((s->>'enabled')::boolean, false) then return null; end if;
  -- (كل جدول بفرعه: plpgsql يقرأ حقول new وقت التنفيذ، والجداول أعمدتها مختلفة)
  if tg_table_name = 'posts' then
    if new.kind is distinct from 'post' then return null; end if;
    v_type := 'post'; v_text := new.caption; v_author := new.user_id;
    if tg_op = 'UPDATE' then v_old := old.caption; end if;
  elsif tg_table_name = 'comments' then
    v_type := 'comment'; v_text := new.body; v_author := new.user_id;
    if tg_op = 'UPDATE' then v_old := old.body; end if;
  elsif tg_table_name = 'checkin_comments' then
    v_type := 'checkin_comment'; v_text := new.body; v_author := new.user_id;
    if tg_op = 'UPDATE' then v_old := old.body; end if;
  elsif tg_table_name = 'messages' then
    if not coalesce((s->>'messages')::boolean, false) or new.deleted_at is not null then return null; end if;
    v_type := 'message'; v_text := new.body; v_author := new.sender;
    if tg_op = 'UPDATE' then v_old := old.body; end if;
  else
    return null;
  end if;
  if btrim(coalesce(v_text, '')) = '' then return null; end if;
  if tg_op = 'UPDATE' and v_text is not distinct from v_old then return null; end if;
  insert into moderation_jobs (target_type, target_id, author) values (v_type, new.id, v_author)
  on conflict (target_type, target_id) do update set attempts = 0, next_at = now(), queued_at = clock_timestamp(), author = excluded.author;
  return null;
exception when others then
  raise warning 'auto moderation enqueue failed: %', sqlerrm;
  return null;
end $$;
revoke all on function public._automod_enqueue() from public, anon, authenticated;

create or replace trigger posts_automod after insert or update of caption on public.posts
  for each row execute function public._automod_enqueue();
create or replace trigger comments_automod after insert or update of body on public.comments
  for each row execute function public._automod_enqueue();
create or replace trigger checkin_comments_automod after insert or update of body on public.checkin_comments
  for each row execute function public._automod_enqueue();
create or replace trigger messages_automod after insert or update of body on public.messages
  for each row execute function public._automod_enqueue();

-- ---------- دوال الخادم (service_role بس) ----------
-- تاخذ دفعة من الطابور مع نصها. كل محتوى ينحجز ٣ دقايق (لو طاحت الدالة يرجع بعدها).
-- الترتيب: أقدم نص لكل كاتب أول (بالدور بين الكتّاب)، والكاتب اللي وصل حده اليومي (٢٠٠) ينتظر لبكرة.
create or replace function public.moderation_claim(p_limit integer default 16)
returns table (target_type text, target_id uuid, body text, attempts smallint, queued_at timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare s jsonb := _automod(); v_cap int; v_n int; v_msgs boolean;
  v_author_cap constant int := 200;
begin
  if not coalesce((s->>'enabled')::boolean, false) then return; end if;
  v_msgs := coalesce((s->>'messages')::boolean, false);
  v_cap := coalesce((s->>'daily_cap')::int, 3000);
  v_n := least(greatest(coalesce(p_limit, 16), 1), 50, greatest(v_cap - _automod_used(), 0));
  if v_n <= 0 then return; end if;
  return query
  with ranked as (
    select j.target_type, j.target_id, j.next_at,
           row_number() over (partition by j.author order by j.next_at, j.queued_at) as rn
    from moderation_jobs j
    left join moderation_usage mu on mu.author = j.author and mu.day = app_today()
    where j.next_at <= now() and j.attempts < 6 and (v_msgs or j.target_type <> 'message')
      and coalesce(mu.n, 0) < v_author_cap
  ), c as (
    select j.target_type, j.target_id from moderation_jobs j
    join ranked r on r.target_type = j.target_type and r.target_id = j.target_id
    order by r.rn, r.next_at
    limit v_n
    for update of j skip locked
  ), u as (
    update moderation_jobs j set attempts = j.attempts + 1, next_at = now() + interval '3 minutes'
    from c where j.target_type = c.target_type and j.target_id = c.target_id
    returning j.target_type, j.target_id, j.attempts, j.queued_at
  )
  select u.target_type, u.target_id,
         case u.target_type
           when 'post' then (select po.caption from posts po where po.id = u.target_id and po.kind = 'post')
           when 'comment' then (select c2.body from comments c2 where c2.id = u.target_id)
           when 'checkin_comment' then (select c3.body from checkin_comments c3 where c3.id = u.target_id)
           when 'message' then (select left(m.body, 1000) from messages m where m.id = u.target_id and m.deleted_at is null)
         end,
         u.attempts, u.queued_at
  from u;
end $$;

-- النتيجة: safe و gone (انحذف أو صار فاضي) تشيله من الطابور بس. unsafe و controversial تطلع للمراجعة.
-- copyright و jailbreak ما تخص المجتمع: لو ما فيه غيرها ما ينعلّم.
-- political لحالها تطلع للمراجعة كـ «محل خلاف» وما تنخفى أبداً (النموذج معاير على بيانات غير محلية).
create or replace function public.moderation_settle(p_type text, p_id uuid, p_result text,
  p_categories text[] default '{}', p_model text default null, p_ms integer default null, p_queued_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s jsonb := _automod();
  v_all text[]; v_cats text[]; v_label text := p_result; v_owner uuid; v_snap jsonb; v_author uuid;
  v_hide boolean; v_hidden boolean := false; v_was_open boolean;
  v_what_ar text := case p_type when 'post' then 'منشور' when 'message' then 'رسالة' else 'تعليق' end;
  v_what_en text := case p_type when 'post' then 'post' when 'message' then 'message' else 'comment' end;
begin
  if p_type is null or p_type not in ('post','comment','checkin_comment','message') then raise exception 'bad_input'; end if;
  if p_result is null or p_result not in ('safe','unsafe','controversial','gone') then raise exception 'bad_input'; end if;
  v_all := array(select distinct c from unnest(coalesce(p_categories, '{}'::text[])) c
                 where c = any(array['violent','illegal','sexual','pii','self_harm','unethical','political','copyright','jailbreak']) order by 1);
  insert into moderation_log (target_type, result, categories, model, ms)
  values (p_type, p_result, v_all, left(p_model, 100), case when p_ms between 0 and 600000 then p_ms end);

  -- علامة محتملة: نقفل المحتوى أول (نفس ترتيب تعديل المستخدم: المحتوى ثم الطابور، فما يصير deadlock)،
  -- وبعدها ما يقدر أحد يعدّله لين نخلص، فالنسخة اللي نحفظها هي النص اللي انفحص
  if p_result in ('unsafe', 'controversial') then
    if p_type = 'post' then
      select po.user_id, jsonb_build_object('caption', _automod_snip(po.caption), 'image_path', po.image_path, 'kind', po.kind)
        into v_owner, v_snap from posts po where po.id = p_id for update;
    elsif p_type = 'comment' then
      select c.user_id, jsonb_build_object('body', _automod_snip(c.body), 'post_id', c.post_id)
        into v_owner, v_snap from comments c where c.id = p_id for update;
    elsif p_type = 'checkin_comment' then
      select c.user_id, jsonb_build_object('body', _automod_snip(c.body), 'check_in_id', c.check_in_id)
        into v_owner, v_snap from checkin_comments c where c.id = p_id for update;
    else
      select m.sender, jsonb_build_object('body', _automod_snip(m.body), 'sent_at', m.created_at)
        into v_owner, v_snap from messages m where m.id = p_id and m.deleted_at is null for update;
    end if;
  end if;

  -- نشيل بس النص اللي انفحص (نفس queued_at). ما لقيناه = انعدّل بعد الحجز (وانحجز من جديد أو انفحص):
  -- هالنتيجة قديمة، ما تعلّم ولا تخفي ولا تمسح فحص النص الجديد
  delete from moderation_jobs where target_type = p_type and target_id = p_id
     and (p_queued_at is null or queued_at = p_queued_at)
  returning author into v_author;
  if not found and p_queued_at is not null then return jsonb_build_object('flagged', false, 'stale', true); end if;
  if v_author is not null and p_result <> 'gone' then
    insert into moderation_usage (author, day, n) values (v_author, app_today(), 1)
    on conflict (author, day) do update set n = moderation_usage.n + 1;
  end if;
  if p_result in ('safe', 'gone') then return jsonb_build_object('flagged', false); end if;

  v_cats := array(select c from unnest(v_all) c where c not in ('copyright', 'jailbreak'));
  if cardinality(v_all) > 0 and cardinality(v_cats) = 0 then return jsonb_build_object('flagged', false); end if;
  if v_cats = array['political'] then v_label := 'controversial'; end if;
  if v_owner is null then return jsonb_build_object('flagged', false); end if;

  v_was_open := exists (select 1 from auto_flags where status = 'open');
  insert into auto_flags (target_type, target_id, target_user, label, categories, model, snapshot)
  values (p_type, p_id, v_owner, v_label, v_cats, left(p_model, 100), coalesce(v_snap, '{}'::jsonb))
  on conflict (target_type, target_id) do update
    set label = excluded.label, categories = excluded.categories, model = excluded.model, snapshot = excluded.snapshot,
        target_user = excluded.target_user, status = 'open', action = null, resolved_by = null, resolved_at = null, updated_at = now();

  -- وضع hide: «غير آمن» يختفي مؤقتاً لين يراجعه المشرف (الرسائل ما تنخفى: تبقى عند المستلم والمشرف يقرر)
  v_hide := s->>'action' = 'hide' and v_label = 'unsafe' and p_type in ('post','comment','checkin_comment');
  if v_hide then
    if p_type = 'post' then
      update posts set hidden_at = now(), hidden_reason = 'reports' where id = p_id and hidden_at is null;
      v_hidden := found;
    elsif p_type = 'comment' then
      update comments set hidden_at = now(), hidden_reason = 'reports' where id = p_id and hidden_at is null;
      v_hidden := found;
    else
      update checkin_comments set hidden_at = now(), hidden_reason = 'reports' where id = p_id and hidden_at is null;
      v_hidden := found;
    end if;
    if v_hidden then
      update auto_flags set hidden = true where target_type = p_type and target_id = p_id;
      perform _notice(v_owner, 'hide:' || p_id, 'انخفى ' || v_what_ar || ' لك مؤقتاً',
        'فحصنا الآلي لقى فيه شي ممكن يخالف إرشادات المجتمع، وبيبقى مخفي لين نراجعه.',
        'Your ' || v_what_en || ' is hidden for now', 'Our automatic check found something that may break the community guidelines. It stays hidden until we review it.',
        '/policy/community', p_id);
    end if;
  end if;

  -- المشرفين: إشعار لما الطابور الآلي يبدأ من فاضي (مو إشعار لكل علامة)، أو لما شي ينخفى
  if not v_was_open or v_hidden then
    perform _notify_admins('auto:' || p_type || ':' || p_id, 'الفحص الآلي: محتوى يحتاج مراجعة',
      v_what_ar || ' لـ ' || coalesce(_person_label(v_owner), '') || case when v_hidden then ' (انخفى مؤقتاً)' else '' end
        || '. راجعه من لوحة إدارة التطبيق ← بلاغات المجتمع.',
      'Automatic check: content to review',
      'A ' || v_what_en || ' by ' || coalesce(_person_label(v_owner), '') || case when v_hidden then ' (hidden for now)' else '' end
        || '. Review it in App management → Community reports.',
      p_id);
  end if;
  return jsonb_build_object('flagged', true, 'label', v_label, 'hidden', v_hidden);
end $$;

-- فشل الفحص: يرجع للطابور بعد مهلة تكبر (٢، ٤، ٨، ١٦ دقيقة...) ويسقط بعد ٥ محاولات.
-- auth / credits / model (التوكن أو الرصيد أو النموذج): مشكلة إعداد مو مشكلة المحتوى، فالمحاولة ما تنحسب ويرجع بعد ربع ساعة.
-- skipped: ما انفحص أصلاً (وقفنا الدفعة): يرجع بعد دقيقة بدون ما ينحسب ولا ينكتب بالسجل.
-- (لو انعدّل المحتوى بعد ما انحجز، الطابور فيه النص الجديد بمحاولات جديدة: ما نلمسه)
create or replace function public.moderation_retry(p_type text, p_id uuid, p_reason text default 'error',
  p_model text default null, p_queued_at timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_reason text := left(coalesce(nullif(btrim(p_reason), ''), 'error'), 40);
begin
  if p_type is null or p_type not in ('post','comment','checkin_comment','message') then raise exception 'bad_input'; end if;
  if v_reason <> 'skipped' then
    insert into moderation_log (target_type, result, model, error) values (p_type, 'error', left(p_model, 100), v_reason);
  end if;
  if v_reason in ('skipped', 'auth', 'credits', 'model') then
    update moderation_jobs
       set attempts = greatest(attempts - 1, 0),
           next_at = now() + case when v_reason = 'skipped' then interval '1 minute' else interval '15 minutes' end
     where target_type = p_type and target_id = p_id and (p_queued_at is null or queued_at = p_queued_at);
    return;
  end if;
  delete from moderation_jobs where target_type = p_type and target_id = p_id and attempts >= 5
     and (p_queued_at is null or queued_at = p_queued_at);
  update moderation_jobs set next_at = now() + make_interval(mins => least(power(2, attempts)::int, 120))
   where target_type = p_type and target_id = p_id and (p_queued_at is null or queued_at = p_queued_at);
end $$;

-- مفتاح دالة الخادم: moderate تتأكد منه قبل ما تفحص (نفس طريقة office_agent_key_ok)
create or replace function public.moderation_key_ok(p_key text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_secret text;
begin
  if p_key is null or char_length(p_key) = 0 or char_length(p_key) > 500 then return false; end if;
  begin
    select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'moderation_key' limit 1;
  exception when undefined_table or invalid_schema_name or undefined_column then
    return false;
  end;
  if coalesce(v_secret, '') = '' then return false; end if;
  return sha256(convert_to(p_key, 'UTF8')) = sha256(convert_to(v_secret, 'UTF8'));
end $$;

revoke all on function public.moderation_claim(integer) from public, anon, authenticated;
revoke all on function public.moderation_settle(text, uuid, text, text[], text, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.moderation_retry(text, uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.moderation_key_ok(text) from public, anon, authenticated;
grant execute on function public.moderation_claim(integer) to service_role;
grant execute on function public.moderation_settle(text, uuid, text, text[], text, integer, timestamptz) to service_role;
grant execute on function public.moderation_retry(text, uuid, text, text, timestamptz) to service_role;
grant execute on function public.moderation_key_ok(text) to service_role;

-- ---------- التشغيل كل دقيقة (pg_cron) ----------
-- ينظف، وإذا فيه شي ينتظر يصحّي دالة الخادم (طلب بالخلفية، ما ينتظر ردها)
create or replace function public.run_moderation()
returns void language plpgsql security definer set search_path = public as $$
declare s jsonb := _automod(); v_url text; v_key text;
begin
  delete from moderation_log where created_at < now() - interval '90 days';
  delete from moderation_usage where day < app_today() - 2;
  delete from moderation_jobs where attempts >= 6 or queued_at < now() - interval '2 days'
     or (target_type = 'message' and not coalesce((s->>'messages')::boolean, false));
  if not coalesce((s->>'enabled')::boolean, false) then return; end if;
  if not exists (select 1 from moderation_jobs where next_at <= now()) then return; end if;
  begin
    select x.decrypted_secret into v_url from vault.decrypted_secrets x where x.name = 'moderation_url' limit 1;
    select x.decrypted_secret into v_key from vault.decrypted_secrets x where x.name = 'moderation_key' limit 1;
  exception when undefined_table or invalid_schema_name or undefined_column then
    return;
  end;
  if coalesce(v_url, '') !~ '^https://[^[:space:]]+$' or coalesce(v_key, '') = '' then return; end if;
  begin
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 1000)'
      using v_url, '{}'::jsonb, jsonb_build_object('Content-Type', 'application/json', 'x-moderation-key', v_key);
  exception when undefined_function or invalid_schema_name then
    return;
  end;
end $$;
revoke all on function public.run_moderation() from public, anon, authenticated;

do $$
declare v_key text;
begin
  if not exists (select 1 from vault.secrets where name = 'moderation_key') then
    begin
      v_key := encode(gen_random_bytes(32), 'hex');
    exception when undefined_function then
      v_key := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    end;
    perform vault.create_secret(v_key, 'moderation_key', 'ARQ pg_cron → moderate');
  end if;
exception when others then
  raise notice 'vault not available: moderation_key not created (%)', sqlerrm;
end $$;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('arq-moderation', '* * * * *', 'select public.run_moderation()');
exception when others then
  raise notice 'pg_cron not available: auto moderation not scheduled (%)', sqlerrm;
end $$;

-- ---------- لوحة المشرف ----------
-- أرقام الفحص الآلي: الإعداد، هل الخادم جاهز (المفتاح والرابط)، الطابور، وآخر ٢٤ ساعة
create or replace function public.admin_moderation_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_url boolean := false; v_key boolean := false;
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  begin
    v_url := exists (select 1 from vault.decrypted_secrets x where x.name = 'moderation_url' and x.decrypted_secret ~ '^https://[^[:space:]]+$');
    v_key := exists (select 1 from vault.decrypted_secrets x where x.name = 'moderation_key' and coalesce(x.decrypted_secret, '') <> '');
  exception when undefined_table or invalid_schema_name or undefined_column then
    v_url := false; v_key := false;
  end;
  return jsonb_build_object(
    'settings', _automod(),
    'server_ready', v_url and v_key,
    'queued', (select count(*) from moderation_jobs),
    'checked_24h', (select count(*) from moderation_log where created_at > now() - interval '24 hours' and result in ('safe','unsafe','controversial')),
    'flagged_24h', (select count(*) from moderation_log where created_at > now() - interval '24 hours' and result in ('unsafe','controversial')),
    'errors_24h', (select count(*) from moderation_log where created_at > now() - interval '24 hours' and result = 'error'),
    'used_24h', _automod_used(),
    -- آخر خطأ بس لو صار بعد آخر فحص ناجح (لو رجع يشتغل ما نعرضه)
    'last_error', (select l.error from moderation_log l
                   where l.result = 'error' and l.created_at > now() - interval '24 hours'
                     and l.created_at > coalesce((select max(x.created_at) from moderation_log x where x.result in ('safe','unsafe','controversial')), '-infinity')
                   order by l.created_at desc limit 1),
    'last_at', (select max(created_at) from moderation_log where result in ('safe','unsafe','controversial')),
    'open_flags', (select count(*) from auto_flags where status = 'open'),
    'can_edit', is_owner());
end $$;
revoke all on function public.admin_moderation_stats() from public, anon;
grant execute on function public.admin_moderation_stats() to authenticated;

-- طابور «بلاغات المجتمع»: نفس الدالة (community_safety) + علامات الفحص الآلي مدموجة مع البلاغات على نفس المحتوى.
--   reports = بلاغات الناس بس. reasons فيها auto_unsafe أو auto_controversial وفئات النموذج (cat_*).
create or replace function public.admin_safety_queue(p_status text default 'open', p_limit integer default 50)
returns table (target_type text, target_id uuid, target_user uuid, username text, full_name text, avatar_url text,
               reports bigint, reasons text[], notes text[], snapshot jsonb, first_at timestamptz, last_at timestamptz,
               hidden boolean, screen text, suspended_until timestamptz, status text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  return query
  with allr as (
    select r.target_type as tt, r.target_id as tid, r.target_user as tu, array[r.reason] as rs, r.note as nt,
           r.snapshot as snap, r.created_at as at, r.status as st, true as by_user
    from content_reports r
    where p_status = 'all' or r.status = p_status
    union all
    select f.target_type, f.target_id, f.target_user,
           array['auto_' || f.label] || array(select 'cat_' || c from unnest(f.categories) c),
           null::text, f.snapshot, f.updated_at, f.status, false
    from auto_flags f
    where p_status = 'all' or f.status = p_status
  ),
  why as (
    select x.tt, x.tid, array_agg(distinct y order by y) as rs
    from allr x cross join lateral unnest(x.rs) y
    group by x.tt, x.tid
  ),
  g as (
    select r.tt, r.tid, max(r.tu::text)::uuid as tu, count(*) filter (where r.by_user) as n,
           w.rs,
           array_remove(array_agg(r.nt order by r.at desc), null) as ns,
           -- نسخة المحتوى: من آخر بلاغ لو فيه، وإلا من الفحص الآلي
           (array_agg(r.snap order by r.by_user desc, r.at desc))[1] as snap,
           min(r.at) as f_at, max(r.at) as l_at,
           case when bool_or(r.st = 'open') then 'open' else max(r.st) end as st
    from allr r join why w on w.tt = r.tt and w.tid = r.tid
    group by r.tt, r.tid, w.rs
  ),
  unscreened as (
    select 'post'::text as tt, po.id as tid, po.user_id as tu, 0::bigint as n, array['unscreened']::text[] as rs, array[]::text[] as ns,
           jsonb_build_object('caption', po.caption, 'image_path', po.image_path, 'kind', po.kind) as snap,
           po.created_at as f_at, po.created_at as l_at, 'open'::text as st
    from posts po
    where p_status in ('open', 'all') and po.screen = 'pending' and po.created_at < now() - interval '15 minutes'
      and not exists (select 1 from g where g.tt = 'post' and g.tid = po.id)
  ),
  a as (select * from g union all select * from unscreened)
  select a.tt, a.tid, a.tu, pr.username, pr.full_name, pr.avatar_url, a.n, a.rs, a.ns, a.snap, a.f_at, a.l_at,
         case a.tt when 'post' then (select po.hidden_at is not null from posts po where po.id = a.tid)
                   when 'comment' then (select c.hidden_at is not null from comments c where c.id = a.tid)
                   when 'checkin_comment' then (select c.hidden_at is not null from checkin_comments c where c.id = a.tid)
                   else null end,
         case when a.tt = 'post' then (select po.screen from posts po where po.id = a.tid) end,
         (select s.until from suspensions s where s.user_id = a.tu and s.until > now()),
         a.st
  from a left join profiles pr on pr.id = a.tu
  order by (a.st = 'open') desc, a.l_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;
revoke all on function public.admin_safety_queue(text, integer) from public, anon;
grant execute on function public.admin_safety_queue(text, integer) to authenticated;

create or replace function public.admin_safety_counts()
returns table (open_targets bigint, unscreened bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  return query select
    (select count(*) from (select target_type, target_id from content_reports where status = 'open'
                           union
                           select target_type, target_id from auto_flags where status = 'open') x),
    (select count(*) from posts where screen = 'pending' and created_at < now() - interval '15 minutes');
end $$;
revoke all on function public.admin_safety_counts() from public, anon;
grant execute on function public.admin_safety_counts() to authenticated;

-- إجراء المشرف: نفس الدالة (community_safety) + يقفل علامة الفحص الآلي مع البلاغات، وصاحب المحتوى من العلامة لو انحذف
create or replace function public.admin_safety_act(p_type text, p_id uuid, p_action text, p_days integer default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_what_ar text := case p_type when 'post' then 'منشور' when 'message' then 'رسالة' when 'user' then 'حساب' else 'تعليق' end;
  v_what_en text := case p_type when 'post' then 'post' when 'message' then 'message' when 'user' then 'account' else 'comment' end;
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  if p_action is null or p_action not in ('hide','restore','approve','suspend','unsuspend','dismiss') then raise exception 'bad_status'; end if;
  if p_type is null or p_type not in ('post','comment','checkin_comment','message','user') then raise exception 'bad_status'; end if;
  v_owner := case p_type
    when 'post' then (select user_id from posts where id = p_id)
    when 'comment' then (select user_id from comments where id = p_id)
    when 'checkin_comment' then (select user_id from checkin_comments where id = p_id)
    when 'message' then (select sender from messages where id = p_id)
    when 'user' then (select id from profiles where id = p_id)
  end;
  v_owner := coalesce(v_owner, (select target_user from content_reports where target_type = p_type and target_id = p_id and target_user is not null limit 1));
  v_owner := coalesce(v_owner, (select target_user from auto_flags where target_type = p_type and target_id = p_id and target_user is not null limit 1));

  if p_action = 'hide' then
    if p_type = 'post' then update posts set hidden_at = coalesce(hidden_at, now()), hidden_reason = 'admin' where id = p_id;
    elsif p_type = 'comment' then update comments set hidden_at = coalesce(hidden_at, now()), hidden_reason = 'admin' where id = p_id;
    elsif p_type = 'checkin_comment' then update checkin_comments set hidden_at = coalesce(hidden_at, now()), hidden_reason = 'admin' where id = p_id;
    else raise exception 'bad_status';
    end if;
    perform _notice(v_owner, 'removed:' || p_id, 'انشال ' || v_what_ar || ' لك',
      'انشال لأنه يخالف إرشادات المجتمع.', 'Your ' || v_what_en || ' was removed',
      'It was removed because it breaks the community guidelines.', '/policy/community', p_id);
  elsif p_action in ('restore', 'approve') then
    if p_type = 'post' then update posts set hidden_at = null, hidden_reason = null, screen = 'ok' where id = p_id;
    elsif p_type = 'comment' then update comments set hidden_at = null, hidden_reason = null where id = p_id;
    elsif p_type = 'checkin_comment' then update checkin_comments set hidden_at = null, hidden_reason = null where id = p_id;
    end if;
  elsif p_action = 'suspend' then
    if v_owner is null then raise exception 'user_not_found'; end if;
    if p_days is null or p_days not between 1 and 365 then raise exception 'bad_days'; end if;
    insert into suspensions (user_id, until, note, by_admin)
    values (v_owner, now() + make_interval(days => p_days), left(p_note, 300), auth.uid())
    on conflict (user_id) do update set until = excluded.until, note = excluded.note, by_admin = excluded.by_admin, created_at = now();
    perform _notice(v_owner, 'susp:' || v_owner || ':' || floor(extract(epoch from clock_timestamp()))::bigint,
      'انوقف حسابك عن النشر', 'ما تقدر تنشر أو تعلّق أو تراسل لمدة ' || p_days || ' يوم لأنك خالفت إرشادات المجتمع.',
      'Your account is restricted', 'You can''t post, comment or send messages for ' || p_days || ' days because you broke the community guidelines.',
      '/policy/community', null);
  elsif p_action = 'unsuspend' then
    delete from suspensions where user_id = v_owner;
  end if;

  update content_reports
     set status = case when p_action in ('hide', 'suspend') then 'actioned' else 'dismissed' end,
         action = p_action, resolved_by = auth.uid(), resolved_at = now()
   where target_type = p_type and target_id = p_id and status = 'open';
  update auto_flags
     set status = case when p_action in ('hide', 'suspend') then 'actioned' else 'dismissed' end,
         action = p_action, resolved_by = auth.uid(), resolved_at = now(), updated_at = now()
   where target_type = p_type and target_id = p_id and status = 'open';
  perform _admin_log('safety', p_type || ':' || p_id, p_action, p_note);
end $$;
revoke all on function public.admin_safety_act(text, uuid, text, integer, text) from public, anon;
grant execute on function public.admin_safety_act(text, uuid, text, integer, text) to authenticated;
