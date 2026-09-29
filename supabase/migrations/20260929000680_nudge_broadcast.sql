-- =====================================================================
-- «أرسل الحين»: الإدارة ترسل نص تحفيزي الحين بدل ما تنتظر وقته
--   * يوصل للمتدربين اللي أكملوا التسجيل: نفس جنس النص (أو الجميع) ونفس لغته
--   * بشرط نوعه نفسه (بدون شرط الساعة) عشان المتغيرات تتعبّى صح:
--       gym      ما حضر اليوم، واليوم مو يوم راحة في خطته
--       friend   نفس gym + صديقه (أو متابعة متبادلة) حضر اليوم — واسمه مكان {friend}
--       streak   سلسلة يومين فأكثر، آخر حضور أمس، وما حضر اليوم
--       workout  عنده خطة، اليوم مو راحة، وما بدأ تمرين اليوم
--       meal     يتابع أكله (خطة أو سجّل خلال أسبوعين) وما سجّل شي اليوم
--   * يحترم: إيقاف «التحفيز» من الإعدادات، الهدوء من ١٠ الليل لين ٨ الصبح،
--     ٣ تنبيهات باليوم كحد أقصى، ونوع واحد مرة باليوم (نفس سجل المجدول nudge_log)
--   * p_dry_run = true: يرجع العدد بس بدون إرسال (للتأكيد قبل الإرسال)
-- =====================================================================

alter table public.nudge_templates
  add column if not exists last_broadcast_at timestamptz,
  add column if not exists last_broadcast_n  integer;

-- المنطق كله هنا (p_now ثابت في الاختبارات)؛ المستخدمين ما يوصلون لها مباشرة
create or replace function public._nudge_broadcast(p_template uuid, p_now timestamptz, p_send boolean)
returns integer language plpgsql security definer set search_path = public as $$
declare
  t        nudge_templates;
  v_day    date := (p_now at time zone 'Asia/Riyadh')::date;
  v_hour   integer := extract(hour from (p_now at time zone 'Asia/Riyadh'))::integer;
  v_dow    integer := extract(dow from (p_now at time zone 'Asia/Riyadh'))::integer;  -- ٠ = الأحد (مثل الخطة)
  v_start  timestamptz := (v_day::timestamp) at time zone 'Asia/Riyadh';
  v_slot   text;
  v_url    text;
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
  if v_hour < 8 or v_hour >= 22 then raise exception 'quiet_hours'; end if;

  v_slot := case t.category when 'friend' then 'gym' else t.category end;
  v_url  := case t.category when 'workout' then '/(tabs)/plan' when 'meal' then '/food/add' else '/checkin' end;

  for u in
    select p.id, p.streak, p.last_checkin_on, p.full_name, p.username, p.gym_id,
           (select pl.data from plans pl where pl.user_id = p.id and pl.active limit 1) as plan
    from profiles p left join health_profiles h on h.user_id = p.id
    where p.onboarded
      and p.account_type = 'trainee'
      and coalesce((p.notify_prefs->>'nudges')::boolean, true)
      and coalesce(p.locale, 'ar') = t.locale
      and t.gender in ('all', coalesce(h.gender, 'male'))
      and not exists (select 1 from nudge_log l where l.user_id = p.id and l.day = v_day and l.slot = v_slot)
      and (select count(*) from nudge_log l where l.user_id = p.id and l.day = v_day) < 3
    order by p.id
    limit 20000
  loop
    v_in := exists (select 1 from check_ins c where c.user_id = u.id and c.checked_in_at >= v_start and c.checked_in_at <= p_now);
    v_today := (select d from jsonb_array_elements(coalesce(u.plan->'days', '[]'::jsonb)) d where (d->>'day')::int = v_dow limit 1);
    v_rest := u.plan is not null and (v_today is null or coalesce((v_today->>'rest')::boolean, false));

    continue when case t.category
      when 'gym'     then v_in or v_rest
      when 'friend'  then v_in or v_rest
      when 'streak'  then v_in or coalesce(u.streak, 0) < 2 or u.last_checkin_on is distinct from v_day - 1
      when 'workout' then u.plan is null or v_rest
                          or exists (select 1 from workout_sessions w where w.user_id = u.id and w.started_at >= v_start)
      when 'meal'    then not (u.plan is not null or exists (select 1 from food_logs fl where fl.user_id = u.id and fl.eaten_on > v_day - 14))
                          or exists (select 1 from food_logs fl where fl.user_id = u.id and fl.eaten_on = v_day)
      else true end;

    v_friend := null; v_fname := null;
    if t.category = 'friend' then
      select p2.id, split_part(coalesce(nullif(btrim(p2.full_name), ''), p2.username), ' ', 1)
        into v_friend, v_fname
      from check_ins c join profiles p2 on p2.id = c.user_id left join health_profiles h2 on h2.user_id = p2.id
      where c.checked_in_at >= v_start and c.checked_in_at <= p_now and c.user_id <> u.id
        and p2.presence_visibility <> 'hidden'
        and t.friend_gender in ('all', coalesce(h2.gender, 'all'))
        and (are_friends(u.id, c.user_id) or mutual_follow(u.id, c.user_id))
      order by c.checked_in_at desc limit 1;
      continue when v_friend is null;
    end if;

    if p_send then
      insert into nudge_log (user_id, day, slot, category, template_id) values (u.id, v_day, v_slot, t.category, t.id)
      on conflict do nothing;
      continue when not found;
      select coalesce(nullif(g.name, ''), g.name_en) into v_gym from gyms g where g.id = u.gym_id;
      v_vars := jsonb_build_object(
        'name', split_part(coalesce(nullif(btrim(u.full_name), ''), u.username), ' ', 1),
        'friend', coalesce(v_fname, ''),
        'gym', coalesce(v_gym, case when t.locale = 'en' then 'the gym' else 'النادي' end),
        'streak', u.streak,
        'workout', coalesce(v_today->'focus'->>t.locale, v_today->'focus'->>'ar', ''));
      v_title := left(btrim(_nudge_fill(t.title, v_vars)), 120);
      v_body  := left(btrim(_nudge_fill(t.body, v_vars)), 240);
      perform _notify(u.id, v_friend, 'nudge', t.id,
        jsonb_build_object('title', v_title, 'body', v_body, 'cat', t.category, 'url', v_url), v_url);
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- للإدارة: p_dry_run = true يرجع كم متدرب بيوصله، وبدونها يرسل ويرجع كم انرسل
create or replace function public.admin_broadcast_nudge(p_template uuid, p_dry_run boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer; v_send boolean := not coalesce(p_dry_run, false);
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  v_n := _nudge_broadcast(p_template, now(), v_send);
  if v_send then
    update nudge_templates set last_broadcast_at = now(), last_broadcast_n = v_n where id = p_template;
    perform _admin_log('nudge', p_template::text, 'broadcast', v_n || ' recipients');
  end if;
  return v_n;
end $$;

revoke all on function public._nudge_broadcast(uuid, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.admin_broadcast_nudge(uuid, boolean) from public, anon;
grant execute on function public.admin_broadcast_nudge(uuid, boolean) to authenticated;
