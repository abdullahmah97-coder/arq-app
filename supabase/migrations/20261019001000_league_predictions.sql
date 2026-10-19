-- توقعات الدوري: تتوقع نتيجة المباراة قبل صافرة البداية، تاخذ نقاط بعد النهاية، تنافس أصدقاءك، وتقدر تنشر توقعك في التايم لاين.
-- بدون DROP: جدول جديد + دوال جديدة + create or replace لـ _league_ft_notices (نفس التوقيع).
--   - النقاط: النتيجة بالضبط = ٣، الفائز أو التعادل صح = ١، غير كذا = ٠ (league_pred_points). تنحسب وقت القراءة
--     من نتيجة المباراة، فلو المزوّد صحح نتيجة تنعدل النقاط لحالها
--   - التوقع يقفل مع موعد البداية (أو لو المباراة بدأت/تأجلت): الكتابة عن طريق league_predict بس، وتقدر تعدّله لين البداية
--   - توقعات الأصدقاء تنكشف مع صافرة البداية (قبلها تشوف مين توقّع بس، عشان محد ينقل توقع غيره)
--   - النشر في التايم لاين: منشور عادي (kind = 'post') لأصدقائك، فيه meta.league_pred = {m: رقم المباراة}، والبطاقة
--     تجيب التوقع والنتيجة وقت العرض (league_post_prediction) عشان تتحدث بعد النهاية
--   - إشعار النهاية لمن توقّع فيه نقاطه («توقعك صح بالضبط! +٣»)، وبنفس مفتاح إشعار النهاية فما يوصل مرتين

create table if not exists public.league_predictions (
  user_id    uuid not null references auth.users(id) on delete cascade,
  match_id   bigint not null references public.league_matches(id) on delete cascade,
  home       smallint not null check (home between 0 and 20),
  away       smallint not null check (away between 0 and 20),
  post_id    uuid references public.posts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, match_id)
);
create index if not exists league_predictions_match on public.league_predictions (match_id);

-- نقاط توقع واحد (null = المباراة ما خلصت)
create or replace function public.league_pred_points(p_home integer, p_away integer, p_hg integer, p_ag integer)
returns integer language sql immutable set search_path = public as $$
  select case when p_home is null or p_away is null or p_hg is null or p_ag is null then null
              when p_home = p_hg and p_away = p_ag then 3
              when sign(p_home - p_away) = sign(p_hg - p_ag) then 1
              else 0 end;
$$;
grant execute on function public.league_pred_points(integer, integer, integer, integer) to authenticated;

-- المباراة خلصت (ونتيجتها نهائية)
create or replace function public._league_done(p_status text)
returns boolean language sql immutable as $$ select p_status in ('FT', 'AET', 'PEN', 'AWD', 'WO') $$;

alter table public.league_predictions enable row level security;
do $p$
begin
  -- توقعي دايم، وتوقعات أصدقائي بعد البداية (بدون المحظورين)
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'league_predictions' and policyname = 'league_predictions_read') then
    create policy league_predictions_read on public.league_predictions for select to authenticated
      using (user_id = auth.uid()
             or (exists (select 1 from league_matches m where m.id = match_id and m.kickoff <= now())
                 and are_friends(user_id, auth.uid()) and not is_blocked_pair(user_id, auth.uid())));
  end if;
end $p$;
revoke insert, update, delete, truncate, references, trigger on public.league_predictions from anon, authenticated;
revoke all on public.league_predictions from anon;
grant select on public.league_predictions to authenticated;

-- ---------- توقعي ----------
-- يحفظ أو يعدّل التوقع قبل البداية. أخطاء: not_signed_in / bad_score / not_found / locked / account_suspended
create or replace function public.league_predict(p_match bigint, p_home integer, p_away integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_m record;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if p_home is null or p_away is null or p_home not between 0 and 20 or p_away not between 0 and 20 then raise exception 'bad_score'; end if;
  if is_suspended(v_uid) then raise exception 'account_suspended'; end if;
  select id, kickoff, status into v_m from league_matches where id = p_match;
  if v_m.id is null then raise exception 'not_found'; end if;
  if v_m.kickoff <= now() or v_m.status not in ('NS', 'TBD') then raise exception 'locked'; end if;
  insert into league_predictions (user_id, match_id, home, away) values (v_uid, p_match, p_home, p_away)
  on conflict (user_id, match_id) do update set home = excluded.home, away = excluded.away, updated_at = now();
  return jsonb_build_object('match', p_match, 'home', p_home, 'away', p_away);
end $$;

-- ---------- ملخص مباراة: توقعات الجمهور، توقعي ونقاطي، وأصدقائي ----------
-- { total, home_win, draw, away_win, locked, mine: {home, away, points, shared} | null,
--   friends: [{user_id, username, full_name, avatar_url, home?, away?, points?}] }  (النتيجة تنكشف بعد البداية)
create or replace function public.league_pred_summary(p_match bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_m record; v_locked boolean; v_out jsonb;
begin
  select id, kickoff, status, home_goals, away_goals into v_m from league_matches where id = p_match;
  if v_m.id is null then return null; end if;
  v_locked := v_m.kickoff <= now() or v_m.status not in ('NS', 'TBD');
  select jsonb_build_object(
    'total', count(*),
    'home_win', count(*) filter (where home > away),
    'draw', count(*) filter (where home = away),
    'away_win', count(*) filter (where home < away)
  ) into v_out from league_predictions where match_id = p_match;
  v_out := v_out || jsonb_build_object('locked', v_locked,
    'mine', (select jsonb_build_object('home', p.home, 'away', p.away, 'shared', p.post_id is not null,
                     'points', case when _league_done(v_m.status) then league_pred_points(p.home, p.away, v_m.home_goals, v_m.away_goals) end)
             from league_predictions p where p.match_id = p_match and p.user_id = v_uid),
    'friends', coalesce((
      select jsonb_agg(x order by x->>'points' desc nulls last, x->>'username') from (
        select jsonb_build_object('user_id', pr.id, 'username', pr.username, 'full_name', pr.full_name, 'avatar_url', pr.avatar_url)
               || case when v_locked then jsonb_build_object('home', p.home, 'away', p.away,
                         'points', case when _league_done(v_m.status) then league_pred_points(p.home, p.away, v_m.home_goals, v_m.away_goals) end)
                       else '{}'::jsonb end as x
        from league_predictions p join profiles pr on pr.id = p.user_id
        where p.match_id = p_match and v_uid is not null and p.user_id <> v_uid
          and are_friends(p.user_id, v_uid) and not is_blocked_pair(p.user_id, v_uid)
        limit 100
      ) s), '[]'::jsonb));
  return v_out;
end $$;

-- ---------- الترتيب: أصدقائي أو الكل (الكل = اللي اختاروا يظهرون في المتصدرين + أصدقائي) ----------
create or replace function public.league_pred_board(p_scope text default 'friends', p_season integer default null, p_limit integer default 50)
returns table (user_id uuid, username text, full_name text, avatar_url text,
               points bigint, exact bigint, outcome bigint, played bigint, rank bigint)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id),
  season as (select coalesce(p_season, (select max(season) from league_matches)) as s),
  pool as (
    select p.id, p.username, p.full_name, p.avatar_url, p.id = me.id as is_me
    from profiles p cross join me
    where me.id is not null
      and (p.id = me.id or are_friends(p.id, me.id)
           or (coalesce(p_scope, 'friends') = 'all' and p.show_on_leaderboard and not is_blocked_pair(p.id, me.id)))
  ),
  scores as (
    select pool.id, pool.username, pool.full_name, pool.avatar_url, pool.is_me,
           coalesce(sum(league_pred_points(pr.home, pr.away, m.home_goals, m.away_goals)), 0)::bigint as pts,
           count(*) filter (where league_pred_points(pr.home, pr.away, m.home_goals, m.away_goals) = 3) as exact,
           count(*) filter (where league_pred_points(pr.home, pr.away, m.home_goals, m.away_goals) = 1) as outcome,
           count(m.id) as played,
           count(pr.match_id) as predicted
    from pool
    left join league_predictions pr on pr.user_id = pool.id
    left join league_matches m on m.id = pr.match_id and _league_done(m.status) and m.season = (select s from season)
    group by pool.id, pool.username, pool.full_name, pool.avatar_url, pool.is_me
  )
  select id, username, full_name, avatar_url, pts, exact, outcome, played,
         rank() over (order by pts desc, exact desc)
  from scores
  where is_me or predicted > 0
  order by pts desc, exact desc, username
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- ---------- النشر في التايم لاين ----------
-- منشور لأصدقائك فيه رابط المباراة، والبطاقة تعرض التوقع. مرة وحدة لكل توقع (لو انحذف المنشور تقدر تنشره من جديد)
create or replace function public.league_share_prediction(p_match bigint)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_p record; v_m record; v_post uuid;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if is_suspended(v_uid) then raise exception 'account_suspended'; end if;
  select home, away, post_id into v_p from league_predictions where user_id = v_uid and match_id = p_match;
  if not found then raise exception 'no_prediction'; end if;
  if v_p.post_id is not null and exists (select 1 from posts where id = v_p.post_id) then return v_p.post_id; end if;
  select coalesce(h.name_ar, h.name) as h_ar, coalesce(a.name_ar, a.name) as a_ar into v_m
  from league_matches m join league_teams h on h.id = m.home_id join league_teams a on a.id = m.away_id where m.id = p_match;
  insert into posts (user_id, caption, visibility, kind, meta)
  values (v_uid, 'توقعي لمباراة ' || v_m.h_ar || ' × ' || v_m.a_ar || ' ⚽', 'friends', 'post',
          jsonb_build_object('league_pred', jsonb_build_object('m', p_match)))
  returning id into v_post;
  update league_predictions set post_id = v_post where user_id = v_uid and match_id = p_match;
  return v_post;
end $$;

-- بطاقة منشور التوقع: المباراة وتوقع صاحب المنشور ونقاطه، لمن يقدر يشوف المنشور (هو أو أصدقاؤه، بدون محظور ولا مخفي)
create or replace function public.league_post_prediction(p_post uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'match', m.id, 'kickoff', m.kickoff, 'status', m.status, 'home_goals', m.home_goals, 'away_goals', m.away_goals,
    'home_id', m.home_id, 'away_id', m.away_id,
    'home_name', h.name, 'home_ar', h.name_ar, 'home_logo', h.logo_url,
    'away_name', a.name, 'away_ar', a.name_ar, 'away_logo', a.logo_url,
    'pred_home', pr.home, 'pred_away', pr.away,
    'points', case when _league_done(m.status) then league_pred_points(pr.home, pr.away, m.home_goals, m.away_goals) end)
  from posts po
  join league_predictions pr on pr.post_id = po.id and pr.user_id = po.user_id
  join league_matches m on m.id = pr.match_id
  join league_teams h on h.id = m.home_id
  join league_teams a on a.id = m.away_id
  where po.id = p_post and auth.uid() is not null and po.hidden_at is null
    and (po.user_id = auth.uid() or (are_friends(po.user_id, auth.uid()) and not is_blocked_pair(po.user_id, auth.uid())));
$$;

revoke all on function public.league_predict(bigint, integer, integer) from public, anon;
revoke all on function public.league_pred_summary(bigint) from public, anon;
revoke all on function public.league_pred_board(text, integer, integer) from public, anon;
revoke all on function public.league_share_prediction(bigint) from public, anon;
revoke all on function public.league_post_prediction(uuid) from public, anon;
revoke all on function public._league_done(text) from public, anon;
grant execute on function public.league_predict(bigint, integer, integer) to authenticated;
grant execute on function public.league_pred_summary(bigint) to authenticated;
grant execute on function public.league_pred_board(text, integer, integer) to authenticated;
grant execute on function public.league_share_prediction(bigint) to authenticated;
grant execute on function public.league_post_prediction(uuid) to authenticated;
grant execute on function public._league_done(text) to authenticated;

-- ---------- إشعار النهاية (نفس 20261015000960) ومعه نقاط التوقع ----------
-- اللي توقّع يوصله إشعار فيه نقاطه أول، وبعدها مشجعي الفريقين ومن طلب «ذكّرني» (نفس المفتاح = ما يوصل مرتين)
create or replace function public._league_ft_notices()
returns integer language plpgsql security definer set search_path = public as $$
declare v_m record; v_u uuid; v_p record; n int := 0; v_line_ar text; v_line_en text; v_pts int;
begin
  for v_m in
    select m.id, m.home_id, m.away_id, m.home_goals, m.away_goals, m.status,
           coalesce(h.name_ar, h.name) as h_ar, h.name as h_en, coalesce(a.name_ar, a.name) as a_ar, a.name as a_en
    from league_matches m join league_teams h on h.id = m.home_id join league_teams a on a.id = m.away_id
    where m.ft_pending
    order by m.kickoff
    limit 20
  loop
    update league_matches set ft_pending = false where id = v_m.id;
    v_line_ar := v_m.h_ar || ' ' || coalesce(v_m.home_goals, 0) || ' - ' || coalesce(v_m.away_goals, 0) || ' ' || v_m.a_ar;
    v_line_en := v_m.h_en || ' ' || coalesce(v_m.home_goals, 0) || '-' || coalesce(v_m.away_goals, 0) || ' ' || v_m.a_en;
    for v_p in select user_id, home, away from league_predictions where match_id = v_m.id loop
      v_pts := league_pred_points(v_p.home, v_p.away, v_m.home_goals, v_m.away_goals);
      perform _notice(v_p.user_id, 'league-ft:' || v_m.id,
        case v_pts when 3 then 'توقعك صح بالضبط! +٣ ⚽' when 1 then 'توقعت الفائز صح +١ ⚽' else 'انتهت المباراة ⚽' end,
        v_line_ar || ' · توقعك ' || v_p.home || ' - ' || v_p.away,
        case v_pts when 3 then 'Spot on! +3 ⚽' when 1 then 'You called the result +1 ⚽' else 'Full time ⚽' end,
        v_line_en || ' · your pick ' || v_p.home || '-' || v_p.away,
        '/league/' || v_m.id, null);
      n := n + 1;
    end loop;
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
