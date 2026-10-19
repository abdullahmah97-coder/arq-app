-- تذكير التوقعات قبل مباريات فريقك
--   * مشجع الفريق («فريقي») اللي ما توقّع: إشعار قبل البداية بثلاث ساعات تقريباً، مرة وحدة لكل موعد
--     (المفتاح فيه الموعد: مباراة تأجلت ← تذكير جديد). فيه كم واحد من أصدقائه توقّع (بدون نتايجهم).
--     يقدر يطفيه من شاشة «تحدي التوقعات» (league_fans.pred_remind).
--   * تذكير البداية (قبل remind_minutes) صار يقول لك توقعك، أو يذكّرك تلحق تتوقع.
--   * اللي حسابه موقوف ما يجيه تذكير يتوقع (ما يقدر يتوقع أصلاً).
-- بدون حذف: أعمدة جديدة، ودوال تنكتب من جديد بنفس توقيعها.

alter table public.league_fans add column if not exists pred_remind boolean not null default true;
-- آخر موعد انرسل له تذكير التوقع (مثل remind_kickoff لتذكير البداية)
alter table public.league_matches add column if not exists pred_remind_kickoff timestamptz;

-- وقت البداية بتوقيت الرياض: «6:05 م» و«6:05 PM»
create or replace function public._league_time_ar(p_at timestamptz)
returns text language sql stable set search_path = public as $$
  select to_char(p_at at time zone 'Asia/Riyadh', 'FMHH12:MI') ||
         case when extract(hour from p_at at time zone 'Asia/Riyadh') < 12 then ' ص' else ' م' end;
$$;
create or replace function public._league_time_en(p_at timestamptz)
returns text language sql stable set search_path = public as $$
  select to_char(p_at at time zone 'Asia/Riyadh', 'FMHH12:MI AM');
$$;
revoke all on function public._league_time_ar(timestamptz) from public, anon, authenticated;
revoke all on function public._league_time_en(timestamptz) from public, anon, authenticated;

-- سطر التوقع في تذكير البداية: {عربي، إنجليزي}
create or replace function public._league_pred_line(p_user uuid, p_match bigint)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare v_h smallint; v_a smallint;
begin
  select p.home, p.away into v_h, v_a from league_predictions p where p.user_id = p_user and p.match_id = p_match;
  if found then
    return array['توقعك ' || v_h || ' - ' || v_a || '، لا تفوتها!', 'Your pick: ' || v_h || '-' || v_a || '.'];
  end if;
  -- ما توقّع: نذكّره يلحق، إلا لو طفّى تذكير التوقعات أو حسابه موقوف
  if coalesce((select f.pred_remind from league_fans f where f.user_id = p_user), true) and not is_suspended(p_user) then
    return array['الحق سجّل توقعك قبل البداية ⚽', 'There''s still time to lock in your prediction ⚽'];
  end if;
  return array['لا تفوتها!', null];
end $$;
revoke all on function public._league_pred_line(uuid, bigint) from public, anon, authenticated;

-- ---------- تذكير التوقع (قبل البداية بثلاث ساعات تقريباً) ----------
-- لمشجعي الفريقين اللي ما توقّعوا. المباراة اللي دخلت وقت تذكير البداية ما تاخذ تذكير ثاني:
-- تذكير البداية فيه سطر التوقع.
create or replace function public._league_pred_remind()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_min int := coalesce((_league()->>'remind_minutes')::int, 60);
  v_pre constant int := 180;
  v_m record; v_u uuid; v_f int; n int := 0; v_key text; v_t_ar text; v_t_en text; v_body_ar text; v_body_en text;
begin
  if v_pre <= v_min then return 0; end if;
  for v_m in
    select m.id, m.kickoff, m.home_id, m.away_id,
           coalesce(h.name_ar, h.name) as h_ar, h.name as h_en, coalesce(a.name_ar, a.name) as a_ar, a.name as a_en
    from league_matches m join league_teams h on h.id = m.home_id join league_teams a on a.id = m.away_id
    -- (TBD = الوقت للحين ما تحدد: ما نذكّر بموعد غير مؤكد)
    where m.status = 'NS'
      and m.kickoff > now() + make_interval(mins => v_min) and m.kickoff <= now() + make_interval(mins => v_pre)
      and m.pred_remind_kickoff is distinct from m.kickoff
    order by m.kickoff
    limit 20
  loop
    update league_matches set pred_remind_kickoff = v_m.kickoff where id = v_m.id;
    v_key := 'league-pred:' || v_m.id || ':' || extract(epoch from v_m.kickoff)::bigint;
    v_t_ar := _league_time_ar(v_m.kickoff);
    v_t_en := _league_time_en(v_m.kickoff);
    for v_u in
      select f.user_id from league_fans f
      where f.team_id in (v_m.home_id, v_m.away_id) and f.pred_remind
        and not exists (select 1 from league_predictions p where p.user_id = f.user_id and p.match_id = v_m.id)
        and not is_suspended(f.user_id)
    loop
      -- كم واحد من أصدقائه توقّع (العدد بس: النتايج تنكشف مع البداية)
      select count(*) into v_f from league_predictions p
      where p.match_id = v_m.id and p.user_id <> v_u and are_friends(p.user_id, v_u) and not is_blocked_pair(p.user_id, v_u);
      if v_f = 0 then
        v_body_ar := 'تبدأ الساعة ' || v_t_ar || '. ثبّت توقعك قبل صافرة البداية: النتيجة بالضبط +٣ والفائز +١.';
        v_body_en := 'Kick-off at ' || v_t_en || ' (Riyadh). Lock in your score before kick-off: exact score +3, right result +1.';
      else
        v_body_ar := case when v_f = 1 then 'واحد من أصدقائك توقّع، وأنت؟'
                          when v_f = 2 then 'اثنين من أصدقائك توقّعوا، وأنت؟'
                          else v_f || ' من أصدقائك توقّعوا، وأنت؟' end
                     || ' تبدأ الساعة ' || v_t_ar || ' وتقفل التوقعات مع البداية.';
        v_body_en := case when v_f = 1 then '1 friend has predicted. Your turn?' else v_f || ' friends have predicted. Your turn?' end
                     || ' Kick-off at ' || v_t_en || ' (Riyadh); predictions lock at kick-off.';
      end if;
      if _notice(v_u, v_key, 'وش توقعك؟ ' || v_m.h_ar || ' × ' || v_m.a_ar || ' ⚽', v_body_ar,
           'Your prediction? ' || v_m.h_en || ' v ' || v_m.a_en || ' ⚽', v_body_en, '/league/' || v_m.id, null) then
        n := n + 1;
      end if;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function public._league_pred_remind() from public, anon, authenticated;

-- ---------- التذكير قبل المباراة ----------
-- اللي طلب «ذكّرني» (صفه ينكتب sent_at)، ومشجعي الفريقين مرة وحدة لكل موعد (remind_kickoff).
-- المفتاح فيه الموعد: مباراة تأجلت وتحدد لها موعد جديد ← تذكير جديد.
-- جديد: النص فيه توقعك أو تذكير تتوقع، وبعدها تذكير التوقع (لو طاح ما يوقف تذكير البداية ولا التحديث)
create or replace function public._league_remind()
returns integer language plpgsql security definer set search_path = public as $$
declare
  s jsonb := _league(); v_min int; v_m record; v_u uuid; n int := 0; v_base_ar text; v_base_en text; v_key text; v_line text[];
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
    v_base_ar := 'تبدأ الساعة ' || _league_time_ar(v_m.kickoff) || coalesce(' في ' || nullif(v_m.venue, ''), '') || '. ';
    v_base_en := 'Kick-off at ' || _league_time_en(v_m.kickoff) || ' (Riyadh)' || coalesce(' at ' || nullif(v_m.venue, ''), '') || '.';
    -- اللي طلب «ذكّرني» وللحين ما وصله
    for v_u in
      update league_reminders set sent_at = now() where match_id = v_m.id and sent_at is null returning user_id
    loop
      v_line := _league_pred_line(v_u, v_m.id);
      perform _notice(v_u, v_key, '⚽ ' || v_m.h_ar || ' × ' || v_m.a_ar, v_base_ar || v_line[1],
        '⚽ ' || v_m.h_en || ' v ' || v_m.a_en, v_base_en || coalesce(' ' || v_line[2], ''), '/league/' || v_m.id, null);
      n := n + 1;
    end loop;
    -- مشجعي الفريقين: مرة وحدة لهالموعد (اللي طلب «ذكّرني» وصله فوق)
    if v_m.remind_kickoff is distinct from v_m.kickoff then
      update league_matches set remind_kickoff = v_m.kickoff where id = v_m.id;
      for v_u in
        select f.user_id from league_fans f where f.team_id in (v_m.home_id, v_m.away_id)
          and not exists (select 1 from league_reminders r where r.match_id = v_m.id and r.user_id = f.user_id)
      loop
        v_line := _league_pred_line(v_u, v_m.id);
        perform _notice(v_u, v_key, '⚽ ' || v_m.h_ar || ' × ' || v_m.a_ar, v_base_ar || v_line[1],
          '⚽ ' || v_m.h_en || ' v ' || v_m.a_en, v_base_en || coalesce(' ' || v_line[2], ''), '/league/' || v_m.id, null);
        n := n + 1;
      end loop;
    end if;
  end loop;
  begin
    n := n + _league_pred_remind();
  exception when others then
    raise warning 'league prediction reminders failed: %', sqlerrm;
  end;
  return n;
end $$;
revoke all on function public._league_remind() from public, anon, authenticated;
