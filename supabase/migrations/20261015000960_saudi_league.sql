-- =====================================================================
-- الدوري السعودي داخل أرك: المباريات القادمة والنتائج المباشرة والترتيب، وتذكير قبل المباراة، وحجز التذاكر.
--   * البيانات من API-Football (المفتاح API_FOOTBALL_KEY سر للدوال، يضيفه المالك بنفسه).
--     pg_cron كل دقيقة (run_league) يقرر: وقت مباراة ← تحديث مباشر (live) كل live_every_min دقيقة،
--     وإلا تحديث كامل (full: كل المباريات + الترتيب) كل full_every_hours ساعة، وبعد ما تخلص أي مباراة.
--     الطلب يروح لدالة الخادم league-sync عبر pg_net (مفتاح league_key في الـ vault، مثل moderate).
--   * التطبيق يقرأ من الجداول هنا بس (ما يكلّم المزوّد): league_teams و league_matches و league_standings.
--   * التذكير: «ذكّرني» على مباراة (league_reminders)، أو «فريقي» (league_fans) يذكّرك بكل مبارياته تلقائياً.
--     الإشعار قبل البداية بـ remind_minutes دقيقة، وإشعار النتيجة النهائية لمشجعي الفريقين ولمن طلب التذكير.
--   * التذاكر: رابط المنصة الرسمية (tickets_url، الافتراضي webook). ما نبيع تذاكر داخل التطبيق.
--   * الإعداد: app_settings.league (المالك بس يغيّره). يبدأ موقّف لين يضاف المفتاح.
--   أسرار vault: league_key ينشئه هذا الترحيل، و league_url تضيفه مرة وحدة:
--     select vault.create_secret('https://<ref>.supabase.co/functions/v1/league-sync', 'league_url');
--   الشرح: docs/saudi-league.md — بدون DROP، وبدون حذف صفوف داخل الدوال.
-- =====================================================================

set local lock_timeout = '5s';

insert into public.app_settings (key, value) values ('league', jsonb_build_object(
  'enabled', false, 'league_id', 307, 'remind_minutes', 60, 'live_every_min', 5, 'full_every_hours', 3,
  'tickets_url', 'https://webook.com/ar/spl'))
on conflict (key) do nothing;

-- نفس الحارس (auto_moderation) + فرع league
create or replace function public._app_settings_guard()
returns trigger language plpgsql set search_path = public as $$
declare v jsonb := new.value; t integer; b integer; m integer; l1 integer; l2 integer; l3 integer; l4 integer;
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
  elsif new.key = 'league' then
    -- المالك بس (يكلّف طلبات عند المزوّد)
    if auth.uid() is not null and not is_owner() then raise exception 'not_allowed'; end if;
    begin
      t := (v->>'league_id')::integer; l1 := (v->>'remind_minutes')::integer;
      l2 := (v->>'live_every_min')::integer; l3 := (v->>'full_every_hours')::integer;
      l4 := nullif(v->>'season', '')::integer;
    exception when others then t := null;
    end;
    if t is null or t not between 1 and 100000 or l1 is null or l1 not between 5 and 1440
       or l2 is null or l2 not between 1 and 60 or l3 is null or l3 not between 1 and 24
       or (l4 is not null and l4 not between 2000 and 2100)
       or coalesce(jsonb_typeof(v->'enabled'), '') <> 'boolean'
       or char_length(coalesce(v->>'tickets_url', '')) > 300
       or coalesce(v->>'tickets_url', '') !~ '^https://[^[:space:]]{4,}$' then
      raise exception 'bad_value';
    end if;
    new.value := jsonb_build_object('enabled', (v->>'enabled')::boolean, 'league_id', t, 'remind_minutes', l1,
      'live_every_min', l2, 'full_every_hours', l3, 'tickets_url', v->>'tickets_url')
      || case when l4 is not null then jsonb_build_object('season', l4) else '{}'::jsonb end;
  end if;
  return new;
end $$;

create or replace function public._league()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select value from app_settings where key = 'league'), '{}'::jsonb);
$$;
revoke all on function public._league() from public, anon, authenticated;

-- ---------- الجداول (يقراها الكل، ويكتبها الخادم بس) ----------
create table if not exists public.league_teams (
  id         integer primary key,  -- معرّف الفريق عند المزوّد
  name       text not null check (char_length(name) between 1 and 80),
  name_ar    text check (name_ar is null or char_length(name_ar) between 1 and 40),
  logo_url   text check (logo_url is null or char_length(logo_url) <= 300),
  updated_at timestamptz not null default now()
);

create table if not exists public.league_matches (
  id         bigint primary key,  -- معرّف المباراة عند المزوّد
  league_id  integer not null,
  season     integer not null,
  round      text check (round is null or char_length(round) <= 60),
  kickoff    timestamptz not null,
  status     text not null check (char_length(status) between 1 and 5),
  elapsed    smallint check (elapsed is null or elapsed between 0 and 200),
  home_id    integer not null references public.league_teams(id),
  away_id    integer not null references public.league_teams(id),
  home_goals smallint check (home_goals is null or home_goals between 0 and 99),
  away_goals smallint check (away_goals is null or away_goals between 0 and 99),
  venue      text check (venue is null or char_length(venue) <= 80),
  city       text check (city is null or char_length(city) <= 60),
  ft_pending boolean not null default false,  -- خلصت الحين وإشعار النتيجة ينتظر (يرسله run_league)
  remind_kickoff timestamptz,                  -- الموعد اللي انرسل عليه تذكير المشجعين (موعد جديد = تذكير جديد)
  updated_at timestamptz not null default now()
);
alter table public.league_matches add column if not exists ft_pending boolean not null default false;
alter table public.league_matches add column if not exists remind_kickoff timestamptz;
create index if not exists league_matches_ft_pending on public.league_matches (id) where ft_pending;
create index if not exists league_matches_kickoff on public.league_matches (kickoff);
create index if not exists league_matches_season on public.league_matches (season, kickoff);
create index if not exists league_matches_home on public.league_matches (home_id, kickoff);
create index if not exists league_matches_away on public.league_matches (away_id, kickoff);

create table if not exists public.league_standings (
  season        integer not null,
  team_id       integer not null references public.league_teams(id),
  rank          smallint not null check (rank between 1 and 40),
  points        smallint not null check (points between -50 and 200),
  played        smallint, win smallint, draw smallint, lose smallint,
  goals_for     smallint, goals_against smallint,
  form          text check (form is null or char_length(form) <= 10),
  updated_at    timestamptz not null default now(),
  primary key (season, team_id)
);

do $p$
declare t text;
begin
  foreach t in array array['league_teams', 'league_matches', 'league_standings'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_read') then
      execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    end if;
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon, authenticated', t);
    execute format('revoke select on public.%I from anon', t);
  end loop;
end $p$;

-- «ذكّرني»: صاحبها بس يشوفها ويضيفها ويشيلها (قبل البداية)
create table if not exists public.league_reminders (
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  match_id   bigint not null references public.league_matches(id) on delete cascade,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  primary key (user_id, match_id)
);
create index if not exists league_reminders_match on public.league_reminders (match_id) where sent_at is null;
alter table public.league_reminders enable row level security;
do $p$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'league_reminders' and policyname = 'league_reminders_own') then
    create policy league_reminders_own on public.league_reminders for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'league_reminders' and policyname = 'league_reminders_add') then
    create policy league_reminders_add on public.league_reminders for insert to authenticated
      with check (user_id = auth.uid() and sent_at is null
                  and exists (select 1 from league_matches m where m.id = match_id and m.kickoff > now()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'league_reminders' and policyname = 'league_reminders_remove') then
    create policy league_reminders_remove on public.league_reminders for delete to authenticated using (user_id = auth.uid());
  end if;
end $p$;
revoke update, truncate, references, trigger on public.league_reminders from anon, authenticated;
revoke all on public.league_reminders from anon;

-- «فريقي»: فريق واحد لكل مستخدم (تذكير بكل مبارياته ونتيجتها). صاحبه بس يشوفه
create table if not exists public.league_fans (
  user_id    uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  team_id    integer not null references public.league_teams(id),
  created_at timestamptz not null default now()
);
create index if not exists league_fans_team on public.league_fans (team_id);
alter table public.league_fans enable row level security;
do $p$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'league_fans' and policyname = 'league_fans_own') then
    create policy league_fans_own on public.league_fans for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $p$;
revoke truncate, references, trigger on public.league_fans from anon, authenticated;
revoke all on public.league_fans from anon;

-- حالة المزامنة (المشرف يشوفها)
create table if not exists public.league_sync (
  id           boolean primary key default true check (id),
  season       integer,
  last_full_at timestamptz,
  last_live_at timestamptz,
  requested_at timestamptz,
  last_ok_at   timestamptz,
  last_error   text check (last_error is null or char_length(last_error) <= 300),
  last_error_at timestamptz,
  requests_left integer,
  updated_at   timestamptz not null default now()
);
insert into public.league_sync (id) values (true) on conflict do nothing;
alter table public.league_sync enable row level security;
do $p$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'league_sync' and policyname = 'league_sync_admin') then
    create policy league_sync_admin on public.league_sync for select to authenticated using (is_admin());
  end if;
end $p$;
revoke insert, update, delete, truncate, references, trigger on public.league_sync from anon, authenticated;
revoke all on public.league_sync from anon;

-- ---------- أسماء الأندية بالعربي (المزوّد يرجعها بالإنجليزي؛ المالك يقدر يعدّل name_ar بنفسه) ----------
create or replace function public._league_team_ar(p_name text)
returns text language sql immutable set search_path = public as $$
  with n as (select ' ' || regexp_replace(lower(coalesce(p_name, '')), '[^a-z]+', ' ', 'g') || ' ' as s)
  select case
    when s ~ ' hilal ' then 'الهلال'
    when s ~ ' nassr | nasr ' then 'النصر'
    when s ~ ' ittihad ' then 'الاتحاد'
    when s ~ ' ahli ' then 'الأهلي'
    when s ~ ' qadsiah | qadisiyah | qadisiya | qadsia | qadisiah ' then 'القادسية'
    when s ~ ' ettifaq | ittifaq ' then 'الاتفاق'
    when s ~ ' shabab ' then 'الشباب'
    when s ~ ' taawoun | taawon | taawun | ta awoun | ta awon ' then 'التعاون'
    when s ~ ' fateh ' then 'الفتح'
    when s ~ ' khaleej ' then 'الخليج'
    when s ~ ' fayha | feiha | fayhaa ' then 'الفيحاء'
    when s ~ ' okhdood | akhdoud | ukhdood | akhdood ' then 'الأخدود'
    when s ~ ' damac | damak | dhamk ' then 'ضمك'
    when s ~ ' kholood | khulood ' then 'الخلود'
    when s ~ ' hazem | hazm ' then 'الحزم'
    when s ~ ' najma | najmah ' then 'النجمة'
    when s ~ ' neom ' then 'نيوم'
    when s ~ ' raed ' then 'الرائد'
    when s ~ ' wehda | wahda | wehdah ' then 'الوحدة'
    when s ~ ' orobah | uruba | orubah | oruba ' then 'العروبة'
    when s ~ ' abha ' then 'أبها'
    when s ~ ' tai ' then 'الطائي'
    when s ~ ' batin ' then 'الباطن'
    when s ~ ' faisaly | faisali ' then 'الفيصلي'
    when s ~ ' jabalain ' then 'الجبلين'
    when s ~ ' diriyah | diriya | dir iyah ' then 'الدرعية'
    when s ~ ' arabi ' then 'العربي'
    when s ~ ' zulfi ' then 'الزلفي'
    when s ~ ' bukiryah | bukayriyah | bukairiyah ' then 'البكيرية'
    when s ~ ' adalah ' then 'العدالة'
    when s ~ ' jandal ' then 'الجندل'
    when s ~ ' ohod | uhud ' then 'أحد'
    when s ~ ' ula ' then 'العلا'
    when s ~ ' jeddah ' then 'جدة'
    when s ~ ' ain ' then 'العين'
    when s ~ ' riyadh ' then 'الرياض'
  end from n;
$$;

-- ---------- الإدخال من دالة الخادم (service_role بس) ----------
-- p_teams: [{id, name, logo}], p_matches: [{id, league, season, round, kickoff, status, elapsed, home, away, hg, ag, venue, city}]
-- p_standings: [{team, rank, points, played, win, draw, lose, gf, ga, form}]
-- مباراة تخلص الحين (من غير نهائية لنهائية، وبدأت قبل أقل من ٦ ساعات) ← ft_pending، وإشعار النتيجة يطلع من run_league
-- (مو هنا: عدد المشجعين ممكن يكون كبير، وما نبي الطلب يطول ويطيح). ومباراة قديمة تخلص بعد توقف أو أعطال: بدون إشعار.
-- موعد مباراة تغيّر ← التذكير ينرسل من جديد على الموعد الجديد
create or replace function public.league_ingest(p_mode text, p_season integer, p_teams jsonb default '[]',
  p_matches jsonb default '[]', p_standings jsonb default '[]', p_error text default null, p_left integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  x jsonb; v_old text; v_old_kick timestamptz; v_new text; v_kick timestamptz; v_done text[] := array['FT','AET','PEN','AWD','WO'];
  n_teams int := 0; n_matches int := 0; n_finished int := 0; v_full_h int;
begin
  if p_mode is null or p_mode not in ('full', 'live') then raise exception 'bad_input'; end if;
  if p_error is not null then
    update league_sync set last_error = left(p_error, 300), last_error_at = now(),
      requests_left = coalesce(p_left, requests_left), updated_at = now() where id;
    return jsonb_build_object('ok', false);
  end if;

  for x in select * from jsonb_array_elements(coalesce(p_teams, '[]'::jsonb)) loop
    if (x->>'id') is null or btrim(coalesce(x->>'name', '')) = '' then continue; end if;
    insert into league_teams (id, name, name_ar, logo_url)
    values ((x->>'id')::int, left(btrim(x->>'name'), 80), _league_team_ar(x->>'name'), left(nullif(x->>'logo', ''), 300))
    on conflict (id) do update set name = excluded.name, logo_url = excluded.logo_url, updated_at = now(),
      name_ar = coalesce(league_teams.name_ar, excluded.name_ar);
    n_teams := n_teams + 1;
  end loop;

  for x in select * from jsonb_array_elements(coalesce(p_matches, '[]'::jsonb)) loop
    if (x->>'id') is null or (x->>'kickoff') is null or (x->>'home') is null or (x->>'away') is null then continue; end if;
    if not exists (select 1 from league_teams where id = (x->>'home')::int)
       or not exists (select 1 from league_teams where id = (x->>'away')::int) then continue; end if;
    v_old := null; v_old_kick := null;
    select status, kickoff into v_old, v_old_kick from league_matches where id = (x->>'id')::bigint;
    v_new := left(coalesce(nullif(x->>'status', ''), 'TBD'), 5);
    v_kick := (x->>'kickoff')::timestamptz;
    insert into league_matches (id, league_id, season, round, kickoff, status, elapsed, home_id, away_id, home_goals, away_goals, venue, city)
    values ((x->>'id')::bigint, coalesce((x->>'league')::int, (_league()->>'league_id')::int, 307), coalesce((x->>'season')::int, p_season), left(x->>'round', 60),
            v_kick, v_new, (x->>'elapsed')::smallint, (x->>'home')::int, (x->>'away')::int,
            (x->>'hg')::smallint, (x->>'ag')::smallint, left(x->>'venue', 80), left(x->>'city', 60))
    on conflict (id) do update set round = excluded.round, kickoff = excluded.kickoff, status = excluded.status,
      elapsed = excluded.elapsed, home_goals = excluded.home_goals, away_goals = excluded.away_goals,
      venue = excluded.venue, city = excluded.city, updated_at = now();
    n_matches := n_matches + 1;

    -- الموعد تغيّر (تأجيل أو تقديم): «ذكّرني» ينرسل من جديد
    if v_old_kick is not null and v_old_kick <> v_kick then
      update league_reminders set sent_at = null where match_id = (x->>'id')::bigint and sent_at is not null;
    end if;

    -- خلصت الحين (وبدأت قبل أقل من ٦ ساعات): إشعار النتيجة بالطابور
    if v_old is not null and not (v_old = any(v_done)) and v_new = any(v_done) and v_kick > now() - interval '6 hours' then
      n_finished := n_finished + 1;
      update league_matches set ft_pending = true where id = (x->>'id')::bigint;
    end if;
  end loop;

  for x in select * from jsonb_array_elements(coalesce(p_standings, '[]'::jsonb)) loop
    if (x->>'team') is null or (x->>'rank') is null
       or not exists (select 1 from league_teams where id = (x->>'team')::int) then continue; end if;
    insert into league_standings (season, team_id, rank, points, played, win, draw, lose, goals_for, goals_against, form)
    values (p_season, (x->>'team')::int, (x->>'rank')::smallint, coalesce((x->>'points')::smallint, 0),
            (x->>'played')::smallint, (x->>'win')::smallint, (x->>'draw')::smallint, (x->>'lose')::smallint,
            (x->>'gf')::smallint, (x->>'ga')::smallint, left(x->>'form', 10))
    on conflict (season, team_id) do update set rank = excluded.rank, points = excluded.points, played = excluded.played,
      win = excluded.win, draw = excluded.draw, lose = excluded.lose, goals_for = excluded.goals_for,
      goals_against = excluded.goals_against, form = excluded.form, updated_at = now();
  end loop;

  v_full_h := coalesce((_league()->>'full_every_hours')::int, 3);
  update league_sync set
    season = coalesce(p_season, season),
    -- مباراة خلصت ← تحديث الترتيب بعد ٧٠ دقيقة تقريباً (المزوّد يحدّث الترتيب كل ساعة)، ولا نأخر تحديث مستحق
    last_full_at = case when p_mode = 'full' then now()
                        when n_finished > 0 then least(coalesce(last_full_at, now()), now() - make_interval(hours => v_full_h) + interval '70 minutes')
                        else last_full_at end,
    last_live_at = case when p_mode = 'live' then now() else last_live_at end,
    last_ok_at = now(), last_error = null, requests_left = coalesce(p_left, requests_left), updated_at = now()
  where id;
  return jsonb_build_object('ok', true, 'teams', n_teams, 'matches', n_matches, 'finished', n_finished);
end $$;

-- ---------- إشعار النتيجة (من run_league كل دقيقة) ----------
-- لمشجعي الفريقين ولمن طلب «ذكّرني»، مرة وحدة لكل شخص (المفتاح يمنع التكرار)
create or replace function public._league_ft_notices()
returns integer language plpgsql security definer set search_path = public as $$
declare v_m record; v_u uuid; n int := 0; v_line_ar text; v_line_en text;
begin
  for v_m in
    select m.id, m.home_id, m.away_id, m.home_goals, m.away_goals,
           coalesce(h.name_ar, h.name) as h_ar, h.name as h_en, coalesce(a.name_ar, a.name) as a_ar, a.name as a_en
    from league_matches m join league_teams h on h.id = m.home_id join league_teams a on a.id = m.away_id
    where m.ft_pending
    order by m.kickoff
    limit 20
  loop
    update league_matches set ft_pending = false where id = v_m.id;
    v_line_ar := v_m.h_ar || ' ' || coalesce(v_m.home_goals, 0) || ' - ' || coalesce(v_m.away_goals, 0) || ' ' || v_m.a_ar;
    v_line_en := v_m.h_en || ' ' || coalesce(v_m.home_goals, 0) || '-' || coalesce(v_m.away_goals, 0) || ' ' || v_m.a_en;
    for v_u in
      select f.user_id from league_fans f where f.team_id in (v_m.home_id, v_m.away_id)
      union
      select r.user_id from league_reminders r where r.match_id = v_m.id
    loop
      perform _notice(v_u, 'league-ft:' || v_m.id, 'انتهت المباراة ⚽', v_line_ar,
        'Full time ⚽', v_line_en, '/league/' || v_m.id, null);
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function public._league_ft_notices() from public, anon, authenticated;

-- ---------- التذكير قبل المباراة ----------
-- اللي طلب «ذكّرني» (صفه ينكتب sent_at)، ومشجعي الفريقين مرة وحدة لكل موعد (remind_kickoff).
-- المفتاح فيه الموعد: مباراة تأجلت وتحدد لها موعد جديد ← تذكير جديد
create or replace function public._league_remind()
returns integer language plpgsql security definer set search_path = public as $$
declare
  s jsonb := _league(); v_min int; v_m record; v_u uuid; n int := 0; v_time text; v_body_ar text; v_body_en text; v_key text;
begin
  v_min := coalesce((s->>'remind_minutes')::int, 60);
  for v_m in
    select m.id, m.kickoff, m.home_id, m.away_id, m.venue, m.remind_kickoff,
           coalesce(h.name_ar, h.name) as h_ar, h.name as h_en, coalesce(a.name_ar, a.name) as a_ar, a.name as a_en
    from league_matches m join league_teams h on h.id = m.home_id join league_teams a on a.id = m.away_id
    -- (TBD = الوقت للحين ما تحدد: ما نذكّر بموعد غير مؤكد)
    where m.status = 'NS' and m.kickoff > now() and m.kickoff <= now() + make_interval(mins => v_min)
  loop
    v_key := 'league-remind:' || v_m.id || ':' || extract(epoch from v_m.kickoff)::bigint;
    v_time := to_char(v_m.kickoff at time zone 'Asia/Riyadh', 'FMHH12:MI') ||
              case when extract(hour from v_m.kickoff at time zone 'Asia/Riyadh') < 12 then ' ص' else ' م' end;
    v_body_ar := 'تبدأ الساعة ' || v_time || coalesce(' في ' || nullif(v_m.venue, ''), '') || '. لا تفوتها!';
    v_body_en := 'Kick-off at ' || to_char(v_m.kickoff at time zone 'Asia/Riyadh', 'FMHH12:MI AM') || ' (Riyadh)'
                 || coalesce(' at ' || nullif(v_m.venue, ''), '') || '.';
    -- اللي طلب «ذكّرني» وللحين ما وصله
    for v_u in
      update league_reminders set sent_at = now() where match_id = v_m.id and sent_at is null returning user_id
    loop
      perform _notice(v_u, v_key, '⚽ ' || v_m.h_ar || ' × ' || v_m.a_ar, v_body_ar,
        '⚽ ' || v_m.h_en || ' v ' || v_m.a_en, v_body_en, '/league/' || v_m.id, null);
      n := n + 1;
    end loop;
    -- مشجعي الفريقين: مرة وحدة لهالموعد (اللي طلب «ذكّرني» وصله فوق)
    if v_m.remind_kickoff is distinct from v_m.kickoff then
      update league_matches set remind_kickoff = v_m.kickoff where id = v_m.id;
      for v_u in
        select f.user_id from league_fans f where f.team_id in (v_m.home_id, v_m.away_id)
          and not exists (select 1 from league_reminders r where r.match_id = v_m.id and r.user_id = f.user_id)
      loop
        perform _notice(v_u, v_key, '⚽ ' || v_m.h_ar || ' × ' || v_m.a_ar, v_body_ar,
          '⚽ ' || v_m.h_en || ' v ' || v_m.a_en, v_body_en, '/league/' || v_m.id, null);
        n := n + 1;
      end loop;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public._league_remind() from public, anon, authenticated;

-- مفتاح دالة الخادم league-sync (نفس طريقة moderation_key_ok)
create or replace function public.league_key_ok(p_key text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_secret text;
begin
  if p_key is null or char_length(p_key) = 0 or char_length(p_key) > 500 then return false; end if;
  begin
    select x.decrypted_secret into v_secret from vault.decrypted_secrets x where x.name = 'league_key' limit 1;
  exception when undefined_table or invalid_schema_name or undefined_column then
    return false;
  end;
  if coalesce(v_secret, '') = '' then return false; end if;
  return sha256(convert_to(p_key, 'UTF8')) = sha256(convert_to(v_secret, 'UTF8'));
end $$;

revoke all on function public.league_ingest(text, integer, jsonb, jsonb, jsonb, text, integer) from public, anon, authenticated;
revoke all on function public.league_key_ok(text) from public, anon, authenticated;
grant execute on function public.league_ingest(text, integer, jsonb, jsonb, jsonb, text, integer) to service_role;
grant execute on function public.league_key_ok(text) to service_role;

-- ---------- كل دقيقة (pg_cron) ----------
-- يذكّر، وبعدها يقرر هل نطلب تحديث من المزوّد: وقت مباراة ← live، وإلا full كل full_every_hours
create or replace function public.run_league()
returns text language plpgsql security definer set search_path = public as $$
declare
  s jsonb := _league(); st record; v_mode text; v_live boolean; v_url text; v_key text;
begin
  if not coalesce((s->>'enabled')::boolean, false) then return 'off'; end if;
  perform _league_ft_notices();
  perform _league_remind();
  select * into st from league_sync where id;
  -- طلب قبل أقل من ٣ دقايق للحين ما رجع (لا نجاح ولا خطأ): ننتظر، عشان ما تتداخل التشغيلات
  if st.requested_at is not null and st.requested_at > now() - interval '3 minutes'
     and (st.last_ok_at is null or st.last_ok_at < st.requested_at)
     and (st.last_error_at is null or st.last_error_at < st.requested_at) then
    return 'waiting';
  end if;
  -- آخر طلب طاح (خطة، مفتاح، حد يومي، شبكة): ننتظر ١٠ دقايق قبل نطلب ثاني عشان ما نحرق الطلبات اليومية
  if st.last_error is not null and st.last_error_at > now() - interval '10 minutes' then
    return 'backoff';
  end if;
  v_live := exists (
    select 1 from league_matches m
    -- (حالة مباشرة لمباراة بدأت قبل أكثر من ٤ ساعات = معلّقة أو بيانات قديمة: ما نصرف عليها طلبات)
    where (m.status in ('1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP') and m.kickoff > now() - interval '4 hours')
       -- (TBD = وقت مبدئي غير مؤكد: ما نصرف عليه طلبات مباشرة، والتحديث الكامل يجيب وقته لما يتأكد)
       or (m.status = 'NS' and m.kickoff between now() - interval '150 minutes' and now() + interval '3 minutes'));
  if v_live and (st.last_live_at is null or st.last_live_at <= now() - make_interval(mins => coalesce((s->>'live_every_min')::int, 5)) + interval '5 seconds') then
    v_mode := 'live';
  elsif st.last_full_at is null or st.last_full_at <= now() - make_interval(hours => coalesce((s->>'full_every_hours')::int, 3)) + interval '5 seconds' then
    v_mode := 'full';
  else
    return 'idle';
  end if;
  begin
    select x.decrypted_secret into v_url from vault.decrypted_secrets x where x.name = 'league_url' limit 1;
    select x.decrypted_secret into v_key from vault.decrypted_secrets x where x.name = 'league_key' limit 1;
  exception when undefined_table or invalid_schema_name or undefined_column then
    return v_mode || ':no_vault';
  end;
  if coalesce(v_url, '') !~ '^https://[^[:space:]]+$' or coalesce(v_key, '') = '' then return v_mode || ':not_configured'; end if;
  update league_sync set requested_at = now(), updated_at = now() where id;
  begin
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 1000)'
      using v_url, jsonb_build_object('mode', v_mode), jsonb_build_object('Content-Type', 'application/json', 'x-league-key', v_key);
  exception when undefined_function or invalid_schema_name then
    return v_mode || ':no_pg_net';
  end;
  return v_mode;
end $$;
revoke all on function public.run_league() from public, anon, authenticated;

do $$
declare v_key text;
begin
  if not exists (select 1 from vault.secrets where name = 'league_key') then
    begin
      v_key := encode(gen_random_bytes(32), 'hex');
    exception when undefined_function then
      v_key := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    end;
    perform vault.create_secret(v_key, 'league_key', 'ARQ pg_cron → league-sync');
  end if;
exception when others then
  raise notice 'vault not available: league_key not created (%)', sqlerrm;
end $$;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('arq-league', '* * * * *', 'select public.run_league()');
exception when others then
  raise notice 'pg_cron not available: league not scheduled (%)', sqlerrm;
end $$;

-- ---------- للمشرف: حالة المزامنة (بدون أسرار) ----------
create or replace function public.admin_league_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare st record; v_ready boolean := false;
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  select * into st from league_sync where id;
  begin
    v_ready := exists (select 1 from vault.decrypted_secrets x where x.name = 'league_url' and x.decrypted_secret ~ '^https://')
           and exists (select 1 from vault.decrypted_secrets x where x.name = 'league_key' and coalesce(x.decrypted_secret, '') <> '');
  exception when undefined_table or invalid_schema_name or undefined_column then
    v_ready := false;
  end;
  return jsonb_build_object('settings', _league(), 'server_ready', v_ready, 'season', st.season,
    'last_ok_at', st.last_ok_at, 'last_full_at', st.last_full_at, 'last_live_at', st.last_live_at,
    'last_error', st.last_error, 'last_error_at', st.last_error_at, 'requests_left', st.requests_left,
    'teams', (select count(*) from league_teams), 'matches', (select count(*) from league_matches where season = st.season),
    'reminders', (select count(*) from league_reminders where sent_at is null), 'fans', (select count(*) from league_fans));
end $$;
revoke all on function public.admin_league_status() from public, anon;
grant execute on function public.admin_league_status() to authenticated;
