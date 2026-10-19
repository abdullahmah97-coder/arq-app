-- الدوري السعودي من SportScore بدل API-Football (مجاني بدون مفتاح). بدون DROP: عمود جديد + create or replace.
--   - league_matches.source_ref: مرجع المباراة عند المزوّد «<الزوج>/<المعرّف>»، تستخدمه league-sync للتحديث المباشر
--   - league_ingest: يحفظ المرجع، وما يمسح الجولة والملعب لو المزوّد ما رجّعها (SportScore ما يعطيها)
--   - _league_team_ar: «Diraiyah» (تهجئة SportScore) ← الدرعية
-- المعرّفات: SportScore ما عنده أرقام، فالدالة تصنع رقم ثابت للفريق من اسمه وللمباراة من معرّفها في الرابط.
-- الجداول كانت فاضية (مفتاح API-Football ما انضاف)، فما فيه بيانات قديمة تتعارض.

alter table public.league_matches add column if not exists source_ref text;

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
    when s ~ ' diriyah | diriya | dir iyah | diraiyah | diraiya ' then 'الدرعية'
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

-- p_teams: [{id, name, logo}], p_matches: [{id, league, season, round, kickoff, status, elapsed, home, away, hg, ag, venue, city, ref}]
-- p_standings: [{team, rank, points, played, win, draw, lose, gf, ga, form}]
-- مباراة تخلص الحين (من غير نهائية لنهائية، وبدأت قبل أقل من ٦ ساعات) ← ft_pending، وإشعار النتيجة يطلع من run_league
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
    insert into league_matches (id, league_id, season, round, kickoff, status, elapsed, home_id, away_id, home_goals, away_goals, venue, city, source_ref)
    values ((x->>'id')::bigint, coalesce((x->>'league')::int, (_league()->>'league_id')::int, 307), coalesce((x->>'season')::int, p_season), left(x->>'round', 60),
            v_kick, v_new, (x->>'elapsed')::smallint, (x->>'home')::int, (x->>'away')::int,
            (x->>'hg')::smallint, (x->>'ag')::smallint, left(x->>'venue', 80), left(x->>'city', 60),
            case when coalesce(x->>'ref', '') ~ '^[a-z0-9-]{1,160}/[a-z0-9]{6,32}$' then x->>'ref' end)
    on conflict (id) do update set round = coalesce(excluded.round, league_matches.round), kickoff = excluded.kickoff, status = excluded.status,
      elapsed = excluded.elapsed, home_goals = excluded.home_goals, away_goals = excluded.away_goals,
      venue = coalesce(excluded.venue, league_matches.venue), city = coalesce(excluded.city, league_matches.city),
      source_ref = coalesce(excluded.source_ref, league_matches.source_ref), updated_at = now();
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
