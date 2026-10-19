-- تفاصيل المباراة في صفحة المباراة: الأحداث (الأهداف والبطاقات والتبديلات)، الإحصائيات، التشكيلة، نتيجة الشوط الأول،
-- وقائمة هدافي الدوري. كلها من SportScore عبر league-sync. بدون DROP: أعمدة جديدة + جدول جديد + دالة جديدة.
--   - league_matches: ht_home/ht_away، events، stats، lineups، details_at (آخر مرة طلبنا التفاصيل)
--   - league_leaders: صف لكل موسم فيه قائمة الهدافين (تنكتب كاملة كل تحديث، فما نحتاج نمسح صفوف)
--   - league_ingest_details: يكتبها الخادم بس (service_role). ما نمسح قائمة محفوظة بقائمة فاضية:
--     المزوّد يشيل الإحصائيات بعد نهاية المباراة بفترة، فالمحفوظ يبقى
-- الأشكال (يكتبها الخادم بعد التنقية):
--   events:  [{min, side: h|a, kind: goal|pen|og|yc|rc|y2|sub|pmiss|var, p?, in?, out?, hs?, as?}]
--   stats:   [{k: possession|shots_on|…, h, a}]
--   lineups: {ok, hf, af, hc, ac, h: [{n, no, pos, c?}], a: […], hs: […], as: […]}
--   scorers: [{rank, name, team, goals, assists, matches, minutes}]

alter table public.league_matches add column if not exists ht_home smallint check (ht_home is null or ht_home between 0 and 99);
alter table public.league_matches add column if not exists ht_away smallint check (ht_away is null or ht_away between 0 and 99);
alter table public.league_matches add column if not exists events jsonb check (events is null or jsonb_typeof(events) = 'array');
alter table public.league_matches add column if not exists stats jsonb check (stats is null or jsonb_typeof(stats) = 'array');
alter table public.league_matches add column if not exists lineups jsonb check (lineups is null or jsonb_typeof(lineups) = 'object');
alter table public.league_matches add column if not exists details_at timestamptz;
create index if not exists league_matches_details_todo on public.league_matches (season, kickoff) where details_at is null;

create table if not exists public.league_leaders (
  season     integer primary key,
  scorers    jsonb not null default '[]'::jsonb check (jsonb_typeof(scorers) = 'array'),
  updated_at timestamptz not null default now()
);
alter table public.league_leaders enable row level security;
do $p$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'league_leaders' and policyname = 'league_leaders_read') then
    create policy league_leaders_read on public.league_leaders for select to authenticated using (true);
  end if;
end $p$;
revoke insert, update, delete, truncate, references, trigger on public.league_leaders from anon, authenticated;
revoke select on public.league_leaders from anon;
grant select on public.league_leaders to authenticated;

-- p_details: [{id, ht?: [h, a], events?, stats?, lineups?}] — عنصر فيه id بس = طلبناها وما لقينا تفاصيل (لقاء ثاني للزوج)،
-- فنسجّل details_at عشان ما نعيد طلبها كل مرة
create or replace function public.league_ingest_details(p_season integer, p_details jsonb default '[]', p_scorers jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  x jsonb; v_id bigint; v_h text; v_a text; n int := 0; v_scorers boolean := false;
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
    if found then n := n + 1; end if;
  end loop;

  if p_season between 2000 and 2100 and jsonb_typeof(p_scorers) = 'array' and jsonb_array_length(p_scorers) between 1 and 60
     and octet_length(p_scorers::text) <= 20000 then
    insert into league_leaders (season, scorers) values (p_season, p_scorers)
    on conflict (season) do update set scorers = excluded.scorers, updated_at = now();
    v_scorers := true;
  end if;
  return jsonb_build_object('ok', true, 'details', n, 'scorers', v_scorers);
end $$;

revoke all on function public.league_ingest_details(integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.league_ingest_details(integer, jsonb, jsonb) to service_role;
