-- أسماء لاعبي الدوري بالعربي. المزوّد يرسلها بالإنجليزي، فـ league-sync يكتبها بالعربي مرة وحدة (Wikidata ثم Claude)
-- ويحفظها هنا، والتطبيق يعرضها بدل الإنجليزي. بدون DROP: جدول جديد + دوال جديدة + create or replace لـ league_ingest_details
-- (نفس التوقيع) عشان تسجّل الأسماء اللي تمر عليها.
--   - league_players: الاسم مثل ما يرسله المزوّد ← الاسم العربي ومصدره (wikidata / claude / manual)
--   - المالك يقدر يصحح أي اسم، وتصحيحه ما ينكتب فوقه:
--       update league_players set name_ar = 'الاسم', source = 'manual' where name = 'Name';

create table if not exists public.league_players (
  name       text primary key check (char_length(name) between 1 and 60),
  name_ar    text check (name_ar is null or (char_length(name_ar) between 2 and 60 and name_ar ~ '[ء-ي]' and name_ar !~ '[A-Za-z0-9<>{}()]')),
  source     text check (source is null or source in ('wikidata', 'claude', 'manual')),
  wikidata   text check (wikidata is null or wikidata ~ '^Q[0-9]{1,12}$'),
  tries      smallint not null default 0,
  seen_at    timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists league_players_todo on public.league_players (seen_at desc) where name_ar is null;
alter table public.league_players enable row level security;
do $p$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'league_players' and policyname = 'league_players_read') then
    create policy league_players_read on public.league_players for select to authenticated using (true);
  end if;
end $p$;
revoke insert, update, delete, truncate, references, trigger on public.league_players from anon, authenticated;
revoke select on public.league_players from anon;
grant select on public.league_players to authenticated;

-- الأسماء اللي مرت (من الأحداث والتشكيلة والهدافين) ← league_players (الجديد بدون اسم عربي، والقديم يتحدث وقت آخر ظهور)
create or replace function public._league_players_seen(p_names text[])
returns void language sql security definer set search_path = public as $$
  insert into league_players (name)
  select distinct left(btrim(regexp_replace(n, '\s+', ' ', 'g')), 60) from unnest(coalesce(p_names, '{}')) n
  where n is not null and btrim(n) <> ''
  on conflict (name) do update set seen_at = now();
$$;
revoke all on function public._league_players_seen(text[]) from public, anon, authenticated;

-- نفس league_ingest_details من 20261019000980، ومعها تسجيل أسماء اللاعبين
create or replace function public.league_ingest_details(p_season integer, p_details jsonb default '[]', p_scorers jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  x jsonb; v_id bigint; v_h text; v_a text; n int := 0; v_scorers boolean := false; v_names text[] := '{}';
begin
  for x in select * from jsonb_array_elements(case when jsonb_typeof(p_details) = 'array' then p_details else '[]'::jsonb end) loop
    if jsonb_typeof(x) <> 'object' or coalesce(x->>'id', '') !~ '^[0-9]{1,16}$' then continue; end if;
    v_id := (x->>'id')::bigint;
    v_h := case when jsonb_typeof(x->'ht') = 'array' then x->'ht'->>0 end;
    v_a := case when jsonb_typeof(x->'ht') = 'array' then x->'ht'->>1 end;
    update league_matches m set
      ht_home = case when v_h ~ '^[0-9]{1,2}$' and v_a ~ '^[0-9]{1,2}$' then v_h::smallint else m.ht_home end,
      ht_away = case when v_h ~ '^[0-9]{1,2}$' and v_a ~ '^[0-9]{1,2}$' then v_a::smallint else m.ht_away end,
      events = case when jsonb_typeof(x->'events') = 'array' and jsonb_array_length(x->'events') between 1 and 150
                     and octet_length((x->'events')::text) <= 40000 then x->'events' else m.events end,
      stats = case when jsonb_typeof(x->'stats') = 'array' and jsonb_array_length(x->'stats') between 1 and 40
                    and octet_length((x->'stats')::text) <= 8000 then x->'stats' else m.stats end,
      lineups = case when jsonb_typeof(x->'lineups') = 'object' and octet_length((x->'lineups')::text) <= 40000
                      then x->'lineups' else m.lineups end,
      details_at = now(), updated_at = now()
    where m.id = v_id;
    if found then
      n := n + 1;
      v_names := v_names || array(
        select v #>> '{}' from (
          select jsonb_path_query(x, '$.events[*].p ? (@.type() == "string")') v
          union all select jsonb_path_query(x, '$.events[*].in ? (@.type() == "string")')
          union all select jsonb_path_query(x, '$.events[*].out ? (@.type() == "string")')
          union all select jsonb_path_query(x, '$.lineups.h[*].n ? (@.type() == "string")')
          union all select jsonb_path_query(x, '$.lineups.a[*].n ? (@.type() == "string")')
          union all select jsonb_path_query(x, '$.lineups.hs[*].n ? (@.type() == "string")')
          union all select jsonb_path_query(x, '$.lineups.as[*].n ? (@.type() == "string")')
        ) s limit 200);
    end if;
  end loop;

  if p_season between 2000 and 2100 and jsonb_typeof(p_scorers) = 'array' and jsonb_array_length(p_scorers) between 1 and 60
     and octet_length(p_scorers::text) <= 20000 then
    insert into league_leaders (season, scorers) values (p_season, p_scorers)
    on conflict (season) do update set scorers = excluded.scorers, updated_at = now();
    v_scorers := true;
    v_names := v_names || array(select v #>> '{}' from jsonb_path_query(p_scorers, '$[*].name ? (@.type() == "string")') v limit 60);
  end if;

  perform _league_players_seen(v_names);
  return jsonb_build_object('ok', true, 'details', n, 'scorers', v_scorers);
end $$;

revoke all on function public.league_ingest_details(integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.league_ingest_details(integer, jsonb, jsonb) to service_role;

-- أسماء تنتظر اسم عربي (الأحدث ظهوراً أول). بعد ٣ محاولات فاشلة نوقف، ونعيد بعد يوم
create or replace function public.league_names_todo(p_limit integer default 60)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(name), '{}') from (
    select name from league_players
    where name_ar is null and (tries < 3 or updated_at < now() - interval '1 day')
    order by seen_at desc, name
    limit least(greatest(coalesce(p_limit, 60), 1), 300)
  ) s;
$$;

-- p_names: [{name, ar, source: wikidata|claude, qid?}] — اسم صالح بس، وتصحيح المالك (manual) ما ينكتب فوقه.
-- p_tried: أسماء سألنا عنها وما طلع لها اسم ← محاولة زيادة
create or replace function public.league_names_save(p_names jsonb default '[]', p_tried text[] default '{}')
returns integer language plpgsql security definer set search_path = public as $$
declare x jsonb; v_ar text; v_src text; n int := 0;
begin
  for x in select * from jsonb_array_elements(case when jsonb_typeof(p_names) = 'array' then p_names else '[]'::jsonb end) loop
    if jsonb_typeof(x) <> 'object' then continue; end if;
    v_ar := btrim(regexp_replace(coalesce(x->>'ar', ''), '\s+', ' ', 'g'));
    v_src := x->>'source';
    if coalesce(v_src, '') not in ('wikidata', 'claude') or char_length(v_ar) not between 2 and 60
       or v_ar !~ '[ء-ي]' or v_ar ~ '[A-Za-z0-9<>{}()]' then continue; end if;
    update league_players set name_ar = v_ar, source = v_src,
      wikidata = case when v_src = 'wikidata' and coalesce(x->>'qid', '') ~ '^Q[0-9]{1,12}$' then x->>'qid' end,
      updated_at = now()
    where name = x->>'name' and coalesce(source, '') <> 'manual';
    if found then n := n + 1; end if;
  end loop;
  update league_players set tries = least(tries + 1, 100), updated_at = now()
  where name = any(coalesce(p_tried, '{}')) and name_ar is null;
  return n;
end $$;

revoke all on function public.league_names_todo(integer) from public, anon, authenticated;
revoke all on function public.league_names_save(jsonb, text[]) from public, anon, authenticated;
grant execute on function public.league_names_todo(integer) to service_role;
grant execute on function public.league_names_save(jsonb, text[]) to service_role;

-- للتطبيق: الأسماء العربية لمجموعة أسماء (لين ٣٠٠) ← {"Name": "الاسم"}
create or replace function public.league_player_names(p_names text[])
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_object_agg(name, name_ar), '{}'::jsonb)
  from league_players
  where name = any((coalesce(p_names, '{}'))[1:300]) and name_ar is not null;
$$;
revoke all on function public.league_player_names(text[]) from public, anon;
grant execute on function public.league_player_names(text[]) to authenticated;
