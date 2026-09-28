-- =====================================================================
-- التنبيهات التحفيزية (من التطبيق نفسه): تحمّسك تروح النادي وتذكّرك بالتمرين والوجبات
--   * المالك يكتب النصوص من لوحة المالك، مقسّمة: رجال / نساء / الجميع، وعربي / English
--   * الأنواع وأوقاتها (بتوقيت الرياض):
--       workout  ٩ الصبح       لمن عنده تمرين في خطته اليوم وما بدأه
--       meal     ١ الظهر       لمن ما سجّل أكل اليوم
--       gym      قبل وقتك المعتاد بساعة (أو ٥ العصر)   لمن ما حضر اليوم
--       friend   نفس وقت gym   بدلها لو صديقك حضر اليوم وأنت لا («فيصل بيعضّل قبلك!»)
--       streak   ٩ الليل       لمن عنده سلسلة يومين فأكثر وما حضر اليوم
--   * حد أقصى ٣ تنبيهات باليوم لكل شخص، ومن ٨ الصبح لين ١٠ الليل فقط
--   * المتغيرات في النص: {name} {friend} {gym} {streak} {workout}
-- =====================================================================

-- نوع جديد في سجل التنبيهات
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'follow','friend_request','friend_accept',
  'post_like','post_comment','checkin_like','checkin_comment','friend_here',
  'challenge_invite','challenge_win','rank_up','program_adopt','gym_offer','nudge'));

create table public.nudge_templates (
  id             uuid primary key default gen_random_uuid(),
  category       text not null check (category in ('gym','friend','streak','workout','meal')),
  gender         text not null default 'all' check (gender in ('male','female','all')),
  friend_gender  text not null default 'all' check (friend_gender in ('male','female','all')),
  locale         text not null default 'ar' check (locale in ('ar','en')),
  title          text not null check (char_length(btrim(title)) between 1 and 80),
  body           text not null check (char_length(btrim(body)) between 3 and 240),
  active         boolean not null default true,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index nudge_templates_pick on public.nudge_templates (category, active);
alter table public.nudge_templates enable row level security;
create policy nudges_admin on public.nudge_templates for all to authenticated using (is_admin()) with check (is_admin());

create or replace function public._nudge_stamp()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); new.created_at := now();
  else new.created_by := old.created_by; new.created_at := old.created_at; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger nudge_templates_stamp before insert or update on public.nudge_templates
  for each row execute function public._nudge_stamp();

-- سجل المرسَل: يمنع التكرار ويحدد العدد اليومي (المالك يشوف الإحصاء)
create table public.nudge_log (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  day          date not null,
  slot         text not null check (slot in ('workout','meal','gym','streak')),
  category     text not null,
  template_id  uuid references public.nudge_templates(id) on delete set null,
  sent_at      timestamptz not null default now(),
  primary key (user_id, day, slot)
);
create index nudge_log_day on public.nudge_log (day);
alter table public.nudge_log enable row level security;
create policy nudge_log_admin on public.nudge_log for select to authenticated using (is_admin());

-- ---------------------------------------------------------------------
-- تعبئة المتغيرات واختيار نص مناسب
-- ---------------------------------------------------------------------
create or replace function public._nudge_fill(p text, v jsonb)
returns text language sql immutable as $$
  select replace(replace(replace(replace(replace(p,
    '{name}', coalesce(v->>'name', '')),
    '{friend}', coalesce(v->>'friend', '')),
    '{gym}', coalesce(v->>'gym', '')),
    '{streak}', coalesce(v->>'streak', '')),
    '{workout}', coalesce(v->>'workout', ''));
$$;

-- نص عشوائي من النشطة: نفس الجنس أو «الجميع»، ولغة المستخدم أولاً
create or replace function public._pick_nudge(p_cat text, p_gender text, p_locale text, p_friend_gender text default null)
returns public.nudge_templates language sql stable security definer set search_path = public as $$
  select t.* from nudge_templates t
  where t.active and t.category = p_cat
    and t.gender in ('all', coalesce(p_gender, 'male'))
    and (p_friend_gender is null or t.friend_gender in ('all', p_friend_gender))
  order by (t.locale = coalesce(p_locale, 'ar')) desc, random()
  limit 1;
$$;

-- يرسل تنبيه تحفيزي واحد (لو ما انرسل نفس الموعد اليوم) — يرجع هل انرسل
create or replace function public._send_nudge(p_user uuid, p_day date, p_slot text, p_cat text, p_gender text, p_locale text,
                                               p_vars jsonb, p_url text, p_friend uuid default null, p_friend_gender text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare t nudge_templates; v_title text; v_body text;
begin
  t := _pick_nudge(p_cat, p_gender, p_locale, p_friend_gender);
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

-- ---------------------------------------------------------------------
-- المجدول: يشتغل كل ربع ساعة ويقرر لكل شخص هل يستاهل تنبيه الحين
-- ---------------------------------------------------------------------
create or replace function public.run_nudges(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_day    date := (p_now at time zone 'Asia/Riyadh')::date;
  v_hour   integer := extract(hour from (p_now at time zone 'Asia/Riyadh'))::integer;
  v_dow    integer := extract(dow from (p_now at time zone 'Asia/Riyadh'))::integer;  -- ٠ = الأحد (مثل الخطة)
  v_start  timestamptz := (v_day::timestamp) at time zone 'Asia/Riyadh';
  v_sent   integer := 0;
  u        record;
  f        record;
  v_vars   jsonb;
  v_today  jsonb;
  v_rest   boolean;
  v_in     boolean;
  v_usual  integer;
  v_gymh   integer;
  v_gym    text;
begin
  if v_hour < 8 or v_hour >= 22 then return 0; end if;

  for u in
    select p.id, p.locale, p.streak, p.last_checkin_on, p.full_name, p.username, p.gym_id, h.gender,
           (select pl.data from plans pl where pl.user_id = p.id and pl.active limit 1) as plan
    from profiles p left join health_profiles h on h.user_id = p.id
    where p.onboarded and coalesce((p.notify_prefs->>'nudges')::boolean, true)
  loop
    continue when (select count(*) from nudge_log where user_id = u.id and day = v_day) >= 3;

    v_in := exists (select 1 from check_ins c where c.user_id = u.id and c.checked_in_at >= v_start and c.checked_in_at <= p_now);
    v_today := (select d from jsonb_array_elements(coalesce(u.plan->'days', '[]'::jsonb)) d where (d->>'day')::int = v_dow limit 1);
    v_rest := u.plan is not null and (v_today is null or coalesce((v_today->>'rest')::boolean, false));
    select coalesce(nullif(g.name, ''), g.name_en) into v_gym from gyms g where g.id = u.gym_id;
    v_vars := jsonb_build_object(
      'name', split_part(coalesce(nullif(btrim(u.full_name), ''), u.username), ' ', 1),
      'gym', coalesce(v_gym, case when u.locale = 'en' then 'the gym' else 'النادي' end),
      'streak', u.streak,
      'workout', coalesce(v_today->'focus'->>coalesce(u.locale, 'ar'), v_today->'focus'->>'ar', ''));

    -- ١) تمرين اليوم (٩ الصبح)
    if v_hour = 9 and u.plan is not null and not v_rest
       and not exists (select 1 from workout_sessions w where w.user_id = u.id and w.started_at >= v_start) then
      if _send_nudge(u.id, v_day, 'workout', 'workout', u.gender, u.locale, v_vars, '/(tabs)/plan') then v_sent := v_sent + 1; end if;
    end if;

    -- ٢) الوجبات (١ الظهر): لمن عنده خطة أو يسجّل أكله، وما سجّل شي اليوم
    if v_hour = 13
       and (u.plan is not null or exists (select 1 from food_logs fl where fl.user_id = u.id and fl.eaten_on > v_day - 14))
       and not exists (select 1 from food_logs fl where fl.user_id = u.id and fl.eaten_on = v_day) then
      if _send_nudge(u.id, v_day, 'meal', 'meal', u.gender, u.locale, v_vars, '/food/add') then v_sent := v_sent + 1; end if;
    end if;

    -- ٣) النادي: قبل وقتك المعتاد بساعة (أو ٥ العصر) — ولو صديقك سبقك اليوم نقول لك
    if not v_in and not v_rest then
      select mode() within group (order by extract(hour from c.checked_in_at at time zone 'Asia/Riyadh'))::int into v_usual
      from check_ins c where c.user_id = u.id and c.checked_in_at > p_now - interval '30 days';
      v_gymh := greatest(8, least(20, coalesce(v_usual, 18) - 1));
      if v_hour = v_gymh then
        select p2.id, split_part(coalesce(nullif(btrim(p2.full_name), ''), p2.username), ' ', 1) as fname, h2.gender
          into f
        from check_ins c join profiles p2 on p2.id = c.user_id left join health_profiles h2 on h2.user_id = p2.id
        where c.checked_in_at >= v_start and c.checked_in_at <= p_now and c.user_id <> u.id
          and p2.presence_visibility <> 'hidden'
          and (are_friends(u.id, c.user_id) or mutual_follow(u.id, c.user_id))
        order by c.checked_in_at desc limit 1;
        if f.id is not null and _send_nudge(u.id, v_day, 'gym', 'friend', u.gender, u.locale,
                                            v_vars || jsonb_build_object('friend', f.fname), '/checkin', f.id, coalesce(f.gender, 'all')) then
          v_sent := v_sent + 1;
        elsif _send_nudge(u.id, v_day, 'gym', 'gym', u.gender, u.locale, v_vars, '/checkin') then
          v_sent := v_sent + 1;
        end if;
      end if;
    end if;

    -- ٤) لا تكسر السلسلة (٩ الليل)
    if v_hour = 21 and not v_in and coalesce(u.streak, 0) >= 2 and u.last_checkin_on = v_day - 1 then
      if _send_nudge(u.id, v_day, 'streak', 'streak', u.gender, u.locale, v_vars, '/checkin') then v_sent := v_sent + 1; end if;
    end if;
  end loop;
  return v_sent;
end $$;

-- ---------------------------------------------------------------------
-- للمالك: تجربة نص على نفسه، وإحصاء المرسَل
-- ---------------------------------------------------------------------
create or replace function public.send_test_nudge(p_template uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t nudge_templates; v_vars jsonb; me record;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  select * into t from nudge_templates where id = p_template;
  if t.id is null then raise exception 'not_found'; end if;
  select p.full_name, p.username, p.streak, g.name as gym into me
  from profiles p left join gyms g on g.id = p.gym_id where p.id = auth.uid();
  v_vars := jsonb_build_object(
    'name', split_part(coalesce(nullif(btrim(me.full_name), ''), me.username), ' ', 1),
    'friend', case when t.locale = 'en' then 'Faisal' when t.friend_gender = 'female' then 'ريم' else 'فيصل' end,
    'gym', coalesce(me.gym, case when t.locale = 'en' then 'the gym' else 'النادي' end),
    'streak', greatest(coalesce(me.streak, 0), 5),
    'workout', case when t.locale = 'en' then 'Chest & triceps' else 'صدر وتراي' end);
  insert into notifications (user_id, kind, target_id, data)
  values (auth.uid(), 'nudge', t.id, jsonb_build_object(
    'title', left(btrim(_nudge_fill(t.title, v_vars)), 120), 'body', left(btrim(_nudge_fill(t.body, v_vars)), 240),
    'cat', t.category, 'url', case t.category when 'workout' then '/(tabs)/plan' when 'meal' then '/food/add' else '/checkin' end,
    'test', true));
  perform _push(auth.uid(), 'nudge', null, jsonb_build_object(
    'title', left(btrim(_nudge_fill(t.title, v_vars)), 120), 'body', left(btrim(_nudge_fill(t.body, v_vars)), 240)), '/notifications');
end $$;

create or replace function public.nudge_stats(p_days integer default 7)
returns table (category text, today bigint, last_days bigint)
language sql stable security definer set search_path = public as $$
  select l.category,
         count(*) filter (where l.day = app_today()),
         count(*)
  from nudge_log l
  where is_admin() and l.day > app_today() - greatest(p_days, 1)
  group by l.category;
$$;

-- نصوص إشعار الجوال للنوع الجديد + فئته في الإعدادات
create or replace function public._notif_category(p_kind text)
returns text language sql immutable as $$
  select case
    when p_kind = 'message' then 'messages'
    when p_kind in ('follow','friend_request','friend_accept','friend_here') then 'social'
    when p_kind in ('post_like','post_comment','checkin_like','checkin_comment','program_adopt') then 'activity'
    when p_kind in ('challenge_invite','challenge_win','rank_up') then 'progress'
    when p_kind = 'gym_offer' then 'offers'
    when p_kind = 'nudge' then 'nudges'
    else 'activity' end;
$$;

-- نص إشعار الجوال للتنبيه التحفيزي = العنوان والنص الجاهزين من القالب
create or replace function public._notif_text(p_kind text, p_name text, p_data jsonb, p_loc text)
returns text[] language plpgsql immutable as $$
declare
  en boolean := p_loc = 'en';
  n text := coalesce(p_name, case when en then 'Someone' else 'أحد' end);
  pv text := coalesce(p_data->>'preview', '');
  ti text := coalesce(p_data->>'title', '');
  gy text := coalesce(p_data->>'gym', '');
begin
  return case p_kind
    when 'message'          then array[n, pv]
    when 'nudge'            then array[coalesce(p_data->>'title', ''), coalesce(p_data->>'body', '')]
    when 'follow'           then case when (p_data->>'mutual')::boolean
                                   then array[case when en then 'You follow each other now' else 'صرتوا تتابعون بعض' end,
                                              case when en then n || ' followed you back — you can message each other' else n || ' تابعك — تقدرون تتراسلون الحين' end]
                                   else array[case when en then 'New follower' else 'متابع جديد' end,
                                              case when en then n || ' started following you' else n || ' بدأ يتابعك' end] end
    when 'friend_request'   then array[case when en then 'Friend request' else 'طلب صداقة' end,
                                       case when en then n || ' wants to be your friend' else n || ' يبي يضيفك صديق' end]
    when 'friend_accept'    then array[case when en then 'You''re friends now' else 'صرتوا أصدقاء' end,
                                       case when en then n || ' accepted your friend request' else n || ' قبل طلب صداقتك' end]
    when 'post_like'        then array[case when en then 'New like' else 'إعجاب جديد' end,
                                       case when en then n || ' liked your post' else n || ' أعجبه منشورك' end]
    when 'post_comment'     then array[case when en then 'New comment' else 'تعليق جديد' end, n || ': ' || pv]
    when 'checkin_like'     then array[case when en then '💪 Props' else '💪 تشجيع' end,
                                       case when en then n || ' liked your gym check-in' else n || ' أعجبه حضورك للنادي' end]
    when 'checkin_comment'  then array[case when en then 'Comment on your check-in' else 'تعليق على حضورك' end, n || ': ' || pv]
    when 'friend_here'      then array[case when en then 'Your friend is at the gym' else 'صاحبك في النادي' end,
                                       case when en then n || ' just arrived at ' || gy else n || ' وصل ' || gy || ' الحين' end]
    when 'challenge_invite' then array[case when en then 'Challenge invite' else 'دعوة لتحدي' end,
                                       case when en then n || ' invited you to “' || ti || '”' else n || ' دعاك لتحدي «' || ti || '»' end]
    when 'challenge_win'    then array[case when en then '🏆 You won!' else '🏆 فزت بالتحدي' end,
                                       case when en then 'You won “' || ti || '” and earned ' || coalesce(p_data->>'points', '50') || ' points'
                                            else 'فزت في «' || ti || '» وأخذت ' || coalesce(p_data->>'points', '50') || ' نقطة' end]
    when 'rank_up'          then array[case when en then '⬆️ New rank' else '⬆️ رتبة جديدة' end,
                                       case when en then 'You reached “' || _rank_name((p_data->>'level')::int, 'en') || '”'
                                            else 'وصلت رتبة «' || _rank_name((p_data->>'level')::int, 'ar') || '» 🔥' end]
    when 'program_adopt'    then array[case when en then 'Your program is spreading' else 'برنامجك ينتشر' end,
                                       case when en then n || ' started your program “' || ti || '”' else n || ' بدأ برنامجك «' || ti || '»' end]
    when 'gym_offer'        then array[case when en then 'New offer at ' || gy else 'عرض جديد في ' || gy end,
                                       ti || ' — ' || coalesce(p_data->>'price', '') || case when en then ' SAR' else ' ر.س' end]
    else array[case when en then 'ARQ' else 'أرك' end, '']
  end;
end $$;

-- ---------------------------------------------------------------------
-- الصلاحيات
-- ---------------------------------------------------------------------
revoke all on function public._nudge_fill(text, jsonb) from public, anon, authenticated;
revoke all on function public._pick_nudge(text, text, text, text) from public, anon, authenticated;
revoke all on function public._send_nudge(uuid, date, text, text, text, text, jsonb, text, uuid, text) from public, anon, authenticated;
revoke all on function public.run_nudges(timestamptz) from public, anon, authenticated;
revoke all on function public._nudge_stamp() from public, anon, authenticated;
revoke all on function public.send_test_nudge(uuid) from public, anon;
revoke all on function public.nudge_stats(integer) from public, anon;
grant execute on function public.send_test_nudge(uuid) to authenticated;
grant execute on function public.nudge_stats(integer) to authenticated;

-- ---------------------------------------------------------------------
-- الجدولة كل ربع ساعة (pg_cron في Supabase). بيئة الاختبار ما فيها pg_cron فنتجاوز
-- ---------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('arq-nudges', '*/15 * * * *', 'select public.run_nudges()');
exception when others then
  raise notice 'pg_cron not available: nudges not scheduled (%)', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- نصوص البداية (المالك يعدّلها ويضيف عليها من لوحة المالك)
-- ---------------------------------------------------------------------
insert into public.nudge_templates (category, gender, friend_gender, locale, title, body) values
  -- النادي — رجال
  ('gym', 'male', 'all', 'ar', 'النادي يناديك 💪', 'يا {name}، جسمك ينتظر هالحصة. روح {gym} اليوم وخلّ التعب يطلع عرق!'),
  ('gym', 'male', 'all', 'ar', 'لا تأجلها لبكرة 🔥', 'أقوى نسخة منك تبدأ بخطوة وحدة… البس جزمتك وروح {gym}.'),
  ('gym', 'male', 'all', 'ar', 'ساعة وحدة تفرق', 'ساعة في {gym} تغيّر مزاج يومك كله. يلا يا بطل!'),
  ('gym', 'male', 'all', 'ar', 'الحديد مشتاق لك 😄', '{name}، الأوزان تسأل عنك. لا تخليها تنتظر، يلا على {gym}!'),
  ('gym', 'male', 'all', 'ar', 'تذكّر ليش بديت', 'يا {name}، اليوم يوم تمرين. وعدت نفسك، لا تخلف وعدك 💪'),
  -- النادي — نساء
  ('gym', 'female', 'all', 'ar', 'النادي يناديك 💪', 'يا {name}، جسمك ينتظر هالحصة. روحي {gym} اليوم وخلّي التعب يطلع عرق!'),
  ('gym', 'female', 'all', 'ar', 'لا تأجليها لبكرة 🔥', 'أقوى نسخة منك تبدأ بخطوة وحدة… البسي جزمتك وروحي {gym}.'),
  ('gym', 'female', 'all', 'ar', 'ساعة وحدة تفرق', 'ساعة في {gym} تغيّر مزاج يومك كله. يلا يا بطلة!'),
  ('gym', 'female', 'all', 'ar', 'الأوزان مشتاقة لك 😄', '{name}، الأوزان تسأل عنك. لا تخلينها تنتظر، يلا على {gym}!'),
  ('gym', 'female', 'all', 'ar', 'تذكّري ليش بديتي', 'يا {name}، اليوم يوم تمرين. وعدتي نفسك، لا تخلفين وعدك 💪'),
  -- صديقك سبقك — رجال
  ('friend', 'male', 'male', 'ar', '{friend} سبقك اليوم 👀', '{friend} راح النادي اليوم وأنت لا… بيعضّل قبلك! الحقه على {gym} 💪'),
  ('friend', 'male', 'male', 'ar', 'المنافسة حامية 🔥', '{friend} سجّل حضوره اليوم. بتخليه يسبقك في الترتيب يا {name}؟'),
  ('friend', 'male', 'female', 'ar', '{friend} سبقتك اليوم 👀', '{friend} راحت النادي اليوم وأنت لا… لا تخليها تسبقك، يلا على {gym}!'),
  ('friend', 'male', 'all', 'ar', 'صاحبك في النادي', '{friend} في النادي اليوم ✅ وأنت؟ يلا يا {name}، لا تتأخر!'),
  -- صديقك سبقك — نساء
  ('friend', 'female', 'female', 'ar', '{friend} سبقتك اليوم 👀', '{friend} راحت النادي اليوم وأنتِ لا… بتعضّل قبلك! الحقيها على {gym} 💪'),
  ('friend', 'female', 'female', 'ar', 'المنافسة حامية 🔥', '{friend} سجّلت حضورها اليوم. بتخلينها تسبقك في الترتيب يا {name}؟'),
  ('friend', 'female', 'male', 'ar', '{friend} سبقك اليوم 👀', '{friend} راح النادي اليوم وأنتِ لا… لا تخلينه يسبقك، يلا على {gym}!'),
  ('friend', 'female', 'all', 'ar', 'صديقتك في النادي', '{friend} في النادي اليوم ✅ وأنتِ؟ يلا يا {name}!'),
  -- السلسلة
  ('streak', 'male', 'all', 'ar', 'سلسلتك {streak} يوم 🔥', 'لا تكسرها يا {name}! باقي وقت تروح {gym} اليوم وتحافظ عليها.'),
  ('streak', 'male', 'all', 'ar', 'لا تضيّع تعبك', '{streak} يوم ورا بعض… خسارة تنقطع اليوم! حتى نص ساعة تكفي.'),
  ('streak', 'female', 'all', 'ar', 'سلسلتك {streak} يوم 🔥', 'لا تكسريها يا {name}! باقي وقت تروحين {gym} اليوم وتحافظين عليها.'),
  ('streak', 'female', 'all', 'ar', 'لا تضيّعين تعبك', '{streak} يوم ورا بعض… خسارة تنقطع اليوم! حتى نص ساعة تكفي.'),
  -- التمرين
  ('workout', 'male', 'all', 'ar', 'تمرين اليوم جاهز 📋', 'صباح الخير يا {name}! تمرينك اليوم: {workout}. افتح خطتك وشوف وش ينتظرك.'),
  ('workout', 'male', 'all', 'ar', 'يوم {workout} 💪', 'اليوم يومك يا {name}. جهّز نفسك، الخطة جاهزة وما باقي إلا أنت.'),
  ('workout', 'female', 'all', 'ar', 'تمرين اليوم جاهز 📋', 'صباح الخير يا {name}! تمرينك اليوم: {workout}. افتحي خطتك وشوفي وش ينتظرك.'),
  ('workout', 'female', 'all', 'ar', 'يوم {workout} 💪', 'اليوم يومك يا {name}. جهّزي نفسك، الخطة جاهزة وما باقي إلا أنتِ.'),
  -- الوجبات
  ('meal', 'male', 'all', 'ar', 'وش تغديت اليوم؟ 🍽️', 'سجّل وجبتك يا {name}. العضلات تنبني بالأكل مو بس بالحديد.'),
  ('meal', 'male', 'all', 'ar', 'البروتين أولاً 🥩', 'لا تنسى بروتينك اليوم يا {name}. سجّل أكلك عشان نعرف وين وصلت.'),
  ('meal', 'female', 'all', 'ar', 'وش تغديتي اليوم؟ 🍽️', 'سجّلي وجبتك يا {name}. النتيجة تبدأ من المطبخ مو بس من النادي.'),
  ('meal', 'female', 'all', 'ar', 'البروتين أولاً 🥗', 'لا تنسين بروتينك اليوم يا {name}. سجّلي أكلك عشان نعرف وين وصلتي.'),
  -- English
  ('gym', 'all', 'all', 'en', 'The gym is calling 💪', '{name}, one session today beats zero. Head to {gym}!'),
  ('gym', 'all', 'all', 'en', 'Don''t push it to tomorrow 🔥', 'Your strongest self starts with one step. Shoes on, {name} — {gym} is waiting.'),
  ('friend', 'all', 'all', 'en', '{friend} beat you to it 👀', '{friend} went to the gym today and you haven''t yet. Catch up, {name}!'),
  ('streak', 'all', 'all', 'en', '{streak}-day streak 🔥', 'Don''t break it, {name}! There''s still time to hit {gym} today.'),
  ('workout', 'all', 'all', 'en', 'Today''s workout is ready 📋', 'Good morning {name}! Today: {workout}. Open your plan and get after it.'),
  ('meal', 'all', 'all', 'en', 'What did you eat today? 🍽️', 'Log your meal, {name}. Muscle is built in the kitchen too.');
