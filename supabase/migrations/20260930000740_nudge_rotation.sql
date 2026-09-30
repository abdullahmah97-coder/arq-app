-- =====================================================================
-- تنبيهات التحفيز: النص الجديد (أو المعدّل) يوصل أول
--   قبل: كل مرة نص عشوائي من كل المفعّلة، فالنص اللي كتبته الإدارة الحين ممكن ما يطلع
--        ويطلع بداله نص قديم.
--   الحين لكل متدرب، بعد لغته:
--     ١) النص اللي ما وصله (أو تعدّل / تفعّل بعد ما وصله) — الأحدث أول
--     ٢) لو وصلته كلها: اللي وصله من زمان أكثر (تتناوب، وما يتكرر نفس النص وفيه غيره)
-- =====================================================================

-- وقت آخر تغيير في محتوى النص (العنوان، النص، الجمهور، اللغة) أو تفعيله.
-- ما يتغير مع «أرسل الحين» (last_broadcast_at) عشان ما يرجع النص «جديد» بعد كل إرسال
alter table public.nudge_templates add column if not exists content_at timestamptz;
update public.nudge_templates set content_at = coalesce(content_at, updated_at, created_at, now()) where content_at is null;
alter table public.nudge_templates alter column content_at set default now();
alter table public.nudge_templates alter column content_at set not null;

create or replace function public._nudge_stamp()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by); new.created_at := now(); new.content_at := now();
  else
    new.created_by := old.created_by; new.created_at := old.created_at;
    if (new.title, new.body, new.category, new.gender, new.friend_gender, new.locale)
         is distinct from (old.title, old.body, old.category, old.gender, old.friend_gender, old.locale)
       or (new.active and not old.active) then
      new.content_at := now();
    else
      new.content_at := old.content_at;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create index if not exists nudge_log_user_template on public.nudge_log (user_id, template_id, sent_at desc);

-- اختيار النص لهذا المتدرب
create or replace function public._pick_nudge_for(p_user uuid, p_cat text, p_gender text, p_locale text, p_friend_gender text default null)
returns public.nudge_templates language sql stable security definer set search_path = public as $$
  select t.* from nudge_templates t
  left join lateral (select max(l.sent_at) as last from nudge_log l where l.user_id = p_user and l.template_id = t.id) s on true
  where t.active and t.category = p_cat
    and t.gender in ('all', coalesce(p_gender, 'male'))
    and (p_friend_gender is null or t.friend_gender in ('all', p_friend_gender))
  order by (t.locale = coalesce(p_locale, 'ar')) desc,
           (s.last is null or s.last < t.content_at) desc,
           case when s.last is null or s.last < t.content_at then t.content_at end desc nulls last,
           s.last asc nulls first,
           random()
  limit 1;
$$;
revoke all on function public._pick_nudge_for(uuid, text, text, text, text) from public, anon, authenticated;

-- نفس المرسل قبل، بس يختار النص للمتدرب نفسه
create or replace function public._send_nudge(p_user uuid, p_day date, p_slot text, p_cat text, p_gender text, p_locale text,
                                               p_vars jsonb, p_url text, p_friend uuid default null, p_friend_gender text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare t nudge_templates; v_title text; v_body text;
begin
  t := _pick_nudge_for(p_user, p_cat, p_gender, p_locale, p_friend_gender);
  if t.id is null then return false; end if;
  insert into nudge_log (user_id, day, slot, category, template_id) values (p_user, p_day, p_slot, p_cat, t.id)
  on conflict do nothing;
  if not found then return false; end if;
  v_title := left(btrim(_nudge_fill(t.title, p_vars)), 120);
  v_body  := left(btrim(_nudge_fill(t.body, p_vars)), 240);
  perform _notify(p_user, p_friend, 'nudge', t.id,
    jsonb_build_object('title', v_title, 'body', v_body, 'cat', p_cat, 'url', p_url), p_url);
  return true;
end $$;

-- =====================================================================
-- «أرسل الحين» بخيارات الإدارة (تحدد بنفسك لمين ومتى ووين يفتح)
--   p_audience:      rule = حسب شرط النوع (مثل قبل) | all = كل المتدربين | pick = أشخاص تختارهم (p_users)
--   p_ignore_limits: حتى لو وصلهم تنبيه من هالنوع اليوم أو وصلوا ٣ باليوم
--   p_url:           وين يفتح لما يضغطونه (من قائمة ثابتة)، وإلا حسب النوع
--   p_quiet_ok:      يرسل حتى بوقت الهدوء (١٠ الليل – ٨ الصبح)
--   ثابت دائماً: مكمّل التسجيل، واللي طفّى «التحفيز» من إعداداته ما يوصله
--   لغير «حسب الشرط»: المتغيرات اللي ما لها قيمة تتعبّى بكلمة عامة («صديقك»، «تمرينك»)
-- =====================================================================
drop function if exists public.admin_broadcast_nudge(uuid, boolean);
drop function if exists public._nudge_broadcast(uuid, timestamptz, boolean);

create or replace function public._nudge_broadcast(p_template uuid, p_now timestamptz, p_send boolean,
  p_audience text default 'rule', p_users uuid[] default null, p_ignore_limits boolean default false,
  p_url text default null, p_quiet_ok boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare
  t        nudge_templates;
  v_aud    text := coalesce(p_audience, 'rule');
  v_free   boolean := coalesce(p_ignore_limits, false);
  v_day    date := (p_now at time zone 'Asia/Riyadh')::date;
  v_hour   integer := extract(hour from (p_now at time zone 'Asia/Riyadh'))::integer;
  v_dow    integer := extract(dow from (p_now at time zone 'Asia/Riyadh'))::integer;  -- ٠ = الأحد (مثل الخطة)
  v_start  timestamptz := (v_day::timestamp) at time zone 'Asia/Riyadh';
  v_slot   text;
  v_url    text;
  v_en     boolean;
  v_wants_friend boolean;
  v_n      integer := 0;
  u        record;
  v_vars   jsonb;
  v_today  jsonb;
  v_rest   boolean;
  v_in     boolean;
  v_gym    text;
  v_friend uuid;
  v_fname  text;
  v_title  text;
  v_body   text;
begin
  select * into t from nudge_templates where id = p_template;
  if t.id is null then raise exception 'nudge_not_found'; end if;
  if v_aud not in ('rule', 'all', 'pick') then raise exception 'bad_input'; end if;
  if v_aud = 'pick' and coalesce(cardinality(p_users), 0) = 0 then raise exception 'bad_input'; end if;
  if coalesce(cardinality(p_users), 0) > 200 then raise exception 'too_many_rows'; end if;
  if p_url is not null and p_url not in ('/(tabs)', '/(tabs)/community', '/checkin', '/(tabs)/plan', '/food/add') then
    raise exception 'bad_input';
  end if;
  if not coalesce(p_quiet_ok, false) and (v_hour < 8 or v_hour >= 22) then raise exception 'quiet_hours'; end if;

  v_slot := case t.category when 'friend' then 'gym' else t.category end;
  v_url  := coalesce(p_url, case t.category when 'workout' then '/(tabs)/plan' when 'meal' then '/food/add' else '/checkin' end);
  v_en   := t.locale = 'en';
  v_wants_friend := t.category = 'friend' or position('{friend}' in t.title || ' ' || t.body) > 0;

  for u in
    select p.id, p.streak, p.last_checkin_on, p.full_name, p.username, p.gym_id,
           (select pl.data from plans pl where pl.user_id = p.id and pl.active limit 1) as plan
    from profiles p left join health_profiles h on h.user_id = p.id
    where p.onboarded
      and coalesce((p.notify_prefs->>'nudges')::boolean, true)
      and case when v_aud = 'pick' then p.id = any(p_users)
               else p.account_type = 'trainee'
                    and coalesce(p.locale, 'ar') = t.locale
                    and t.gender in ('all', coalesce(h.gender, 'male')) end
      and (v_free or (
            not exists (select 1 from nudge_log l where l.user_id = p.id and l.day = v_day and l.slot = v_slot)
            and (select count(*) from nudge_log l where l.user_id = p.id and l.day = v_day) < 3))
    order by p.id
    limit 20000
  loop
    v_in := exists (select 1 from check_ins c where c.user_id = u.id and c.checked_in_at >= v_start and c.checked_in_at <= p_now);
    v_today := (select d from jsonb_array_elements(coalesce(u.plan->'days', '[]'::jsonb)) d where (d->>'day')::int = v_dow limit 1);
    v_rest := u.plan is not null and (v_today is null or coalesce((v_today->>'rest')::boolean, false));

    if v_aud = 'rule' then
      continue when case t.category
        when 'gym'     then v_in or v_rest
        when 'friend'  then v_in or v_rest
        when 'streak'  then v_in or coalesce(u.streak, 0) < 2 or u.last_checkin_on is distinct from v_day - 1
        when 'workout' then u.plan is null or v_rest
                            or exists (select 1 from workout_sessions w where w.user_id = u.id and w.started_at >= v_start)
        when 'meal'    then not (u.plan is not null or exists (select 1 from food_logs fl where fl.user_id = u.id and fl.eaten_on > v_day - 14))
                            or exists (select 1 from food_logs fl where fl.user_id = u.id and fl.eaten_on = v_day)
        else true end;
    end if;

    v_friend := null; v_fname := null;
    if v_wants_friend then
      select p2.id, split_part(coalesce(nullif(btrim(p2.full_name), ''), p2.username), ' ', 1)
        into v_friend, v_fname
      from check_ins c join profiles p2 on p2.id = c.user_id left join health_profiles h2 on h2.user_id = p2.id
      where c.checked_in_at >= v_start and c.checked_in_at <= p_now and c.user_id <> u.id
        and p2.presence_visibility <> 'hidden'
        and t.friend_gender in ('all', coalesce(h2.gender, 'all'))
        and (are_friends(u.id, c.user_id) or mutual_follow(u.id, c.user_id))
      order by c.checked_in_at desc limit 1;
      -- «صديقك سبقك» حسب الشرط: لازم صديق حضر اليوم
      continue when v_aud = 'rule' and t.category = 'friend' and v_friend is null;
    end if;

    if p_send then
      insert into nudge_log (user_id, day, slot, category, template_id) values (u.id, v_day, v_slot, t.category, t.id)
      on conflict do nothing;
      continue when not found and not v_free;
      select coalesce(nullif(g.name, ''), g.name_en) into v_gym from gyms g where g.id = u.gym_id;
      v_vars := jsonb_build_object(
        'name', split_part(coalesce(nullif(btrim(u.full_name), ''), u.username), ' ', 1),
        'friend', coalesce(v_fname, case when v_en then 'your friend' else 'صديقك' end),
        'gym', coalesce(v_gym, case when v_en then 'the gym' else 'النادي' end),
        'streak', coalesce(u.streak, 0),
        'workout', coalesce(nullif(v_today->'focus'->>t.locale, ''), nullif(v_today->'focus'->>'ar', ''),
                            case when v_aud = 'rule' then '' when v_en then 'your workout' else 'تمرينك' end));
      v_title := left(btrim(_nudge_fill(t.title, v_vars)), 120);
      v_body  := left(btrim(_nudge_fill(t.body, v_vars)), 240);
      perform _notify(u.id, v_friend, 'nudge', t.id,
        jsonb_build_object('title', v_title, 'body', v_body, 'cat', t.category, 'url', v_url), v_url);
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- للإدارة: p_dry_run = true يرجع كم بيوصله، وبدونها يرسل ويرجع كم انرسل (النسخ القديمة ترسل أول معاملين بس)
create or replace function public.admin_broadcast_nudge(p_template uuid, p_dry_run boolean default false,
  p_audience text default 'rule', p_users uuid[] default null, p_ignore_limits boolean default false,
  p_url text default null, p_quiet_ok boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer; v_send boolean := not coalesce(p_dry_run, false);
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  v_n := _nudge_broadcast(p_template, now(), v_send, p_audience, p_users, p_ignore_limits, p_url, p_quiet_ok);
  if v_send then
    update nudge_templates set last_broadcast_at = now(), last_broadcast_n = v_n where id = p_template;
    perform _admin_log('nudge', p_template::text, 'broadcast',
      v_n || ' recipients · ' || coalesce(p_audience, 'rule')
      || case when coalesce(p_ignore_limits, false) then ' · no limits' else '' end
      || case when coalesce(p_quiet_ok, false) then ' · quiet ok' else '' end
      || coalesce(' · ' || p_url, ''));
  end if;
  return v_n;
end $$;

revoke all on function public._nudge_broadcast(uuid, timestamptz, boolean, text, uuid[], boolean, text, boolean) from public, anon, authenticated;
revoke all on function public.admin_broadcast_nudge(uuid, boolean, text, uuid[], boolean, text, boolean) from public, anon;
grant execute on function public.admin_broadcast_nudge(uuid, boolean, text, uuid[], boolean, text, boolean) to authenticated;
