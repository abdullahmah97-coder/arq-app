-- =====================================================================
-- الصحة اليومية من الجوال والساعة (Apple Health / Health Connect / حساس الخطوات)
-- خطوات، نوم بمراحله، نبض الراحة، HRV، سعرات نشطة + الجاهزية والإجهاد المحسوبة في الجهاز.
-- =====================================================================

create table public.daily_health (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  day           date not null,
  steps         integer check (steps between 0 and 150000),
  active_kcal   integer check (active_kcal between 0 and 15000),
  distance_m    integer check (distance_m between 0 and 300000),
  resting_hr    numeric(5,1) check (resting_hr between 25 and 150),
  hrv_ms        numeric(6,1) check (hrv_ms between 1 and 400),
  sleep_min     integer check (sleep_min between 0 and 1440),
  in_bed_min    integer check (in_bed_min between 0 and 1440),
  deep_min      integer check (deep_min between 0 and 1440),
  rem_min       integer check (rem_min between 0 and 1440),
  light_min     integer check (light_min between 0 and 1440),
  awake_min     integer check (awake_min between 0 and 1440),
  recovery      smallint check (recovery between 0 and 100),
  strain        numeric(4,1) check (strain between 0 and 21),
  source        text not null default 'pedometer'
                check (source in ('apple_health','health_connect','pedometer','demo')),
  steps_awarded boolean not null default false,
  updated_at    timestamptz not null default now(),
  primary key (user_id, day)
);
create index on public.daily_health (day);

alter table public.daily_health enable row level security;
-- الشخص يرى بياناته فقط؛ الأصدقاء يرون الخطوات عبر الدوال (security definer) لا الجدول مباشرة
create policy "own health read" on public.daily_health for select using (user_id = auth.uid());
-- الكتابة فقط عبر sync_daily_health (للتحقق ومنح النقاط)
revoke insert, update, delete on public.daily_health from anon, authenticated;

-- مصدر نقاط جديد: 10,000 خطوة في اليوم = +5
alter table public.points_ledger drop constraint if exists points_ledger_reason_check;
alter table public.points_ledger add constraint points_ledger_reason_check
  check (reason in ('checkin','streak_bonus','long_session','workout','challenge_win','steps_goal'));

-- مزامنة يوم (أو عدة أيام) من الجهاز. لا يُقبل يوم مستقبلي ولا أقدم من 30 يوماً.
create or replace function public.sync_daily_health(p_days jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_today date := app_today();
  d       jsonb;
  v_day   date;
  v_row   daily_health;
  v_n     integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) > 31 then raise exception 'bad_payload'; end if;

  for d in select * from jsonb_array_elements(p_days) loop
    v_day := (d->>'day')::date;
    if v_day > v_today or v_day < v_today - 30 then continue; end if;

    insert into daily_health as h (user_id, day, steps, active_kcal, distance_m, resting_hr, hrv_ms,
                                   sleep_min, in_bed_min, deep_min, rem_min, light_min, awake_min,
                                   recovery, strain, source, updated_at)
    values (v_uid, v_day, (d->>'steps')::int, (d->>'active_kcal')::int, (d->>'distance_m')::int,
            (d->>'resting_hr')::numeric, (d->>'hrv_ms')::numeric,
            (d->>'sleep_min')::int, (d->>'in_bed_min')::int, (d->>'deep_min')::int, (d->>'rem_min')::int,
            (d->>'light_min')::int, (d->>'awake_min')::int,
            (d->>'recovery')::smallint, (d->>'strain')::numeric, coalesce(d->>'source', 'pedometer'), now())
    on conflict (user_id, day) do update set
      -- الخطوات لا تنقص خلال اليوم (مصادر متعددة): نأخذ الأكبر
      steps       = greatest(coalesce(excluded.steps, 0), coalesce(h.steps, 0)),
      active_kcal = coalesce(excluded.active_kcal, h.active_kcal),
      distance_m  = coalesce(excluded.distance_m, h.distance_m),
      resting_hr  = coalesce(excluded.resting_hr, h.resting_hr),
      hrv_ms      = coalesce(excluded.hrv_ms, h.hrv_ms),
      sleep_min   = coalesce(excluded.sleep_min, h.sleep_min),
      in_bed_min  = coalesce(excluded.in_bed_min, h.in_bed_min),
      deep_min    = coalesce(excluded.deep_min, h.deep_min),
      rem_min     = coalesce(excluded.rem_min, h.rem_min),
      light_min   = coalesce(excluded.light_min, h.light_min),
      awake_min   = coalesce(excluded.awake_min, h.awake_min),
      recovery    = coalesce(excluded.recovery, h.recovery),
      strain      = coalesce(excluded.strain, h.strain),
      source      = excluded.source,
      updated_at  = now()
    returning * into v_row;

    -- نقاط هدف الخطوات مرة واحدة لليوم (المصدر التجريبي لا يمنح نقاطاً)
    if v_row.steps >= 10000 and not v_row.steps_awarded and v_row.source <> 'demo' then
      perform _award(v_uid, 5, 'steps_goal', null);
      update daily_health set steps_awarded = true where user_id = v_uid and day = v_day;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
grant execute on function public.sync_daily_health(jsonb) to authenticated;

-- ترتيب الخطوات بين الأصدقاء لفترة (مثل تحدي WHOOP/Google Fit)
create or replace function public.steps_leaderboard(p_from date, p_to date)
returns table (user_id uuid, username text, full_name text, avatar_url text, steps bigint, rank bigint)
language sql stable security definer set search_path = public as $$
  with circle as (
    select auth.uid() as uid
    union
    select case when f.requester = auth.uid() then f.addressee else f.requester end
      from friendships f
     where f.status = 'accepted' and (f.requester = auth.uid() or f.addressee = auth.uid())
  )
  select p.id, p.username, p.full_name, p.avatar_url,
         coalesce(sum(h.steps), 0)::bigint as steps,
         rank() over (order by coalesce(sum(h.steps), 0) desc) as rank
    from circle c
    join profiles p on p.id = c.uid
    left join daily_health h on h.user_id = p.id and h.day between p_from and p_to
   group by p.id
   order by steps desc
   limit 100;
$$;
grant execute on function public.steps_leaderboard(date, date) to authenticated;

-- التحديات: مقياس جديد "الخطوات"
alter table public.challenges drop constraint if exists challenges_metric_check;
alter table public.challenges add constraint challenges_metric_check
  check (metric in ('checkins','workouts','points','steps'));

create or replace function public.challenge_standings(p_challenge uuid)
returns table (user_id uuid, username text, avatar_url text, status text, score bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  c challenges;
  v_from timestamptz;
  v_to   timestamptz;
begin
  if not is_challenge_member(p_challenge) then raise exception 'forbidden'; end if;
  select * into c from challenges where id = p_challenge;
  v_from := (c.starts_on::timestamp at time zone 'Asia/Riyadh');
  v_to   := ((c.ends_on + 1)::timestamp at time zone 'Asia/Riyadh');

  return query
  select m.user_id, p.username, p.avatar_url, m.status,
         case c.metric
           when 'checkins' then (select count(distinct (ci.checked_in_at at time zone 'Asia/Riyadh')::date)
                                   from check_ins ci
                                  where ci.user_id = m.user_id and ci.points_awarded > 0
                                    and ci.checked_in_at >= v_from and ci.checked_in_at < v_to)
           when 'workouts' then (select count(*) from workout_logs w
                                  where w.user_id = m.user_id and w.done_on between c.starts_on and c.ends_on)
           when 'steps'    then (select coalesce(sum(h.steps), 0) from daily_health h
                                  where h.user_id = m.user_id and h.source <> 'demo'
                                    and h.day between c.starts_on and c.ends_on)
           else (select coalesce(sum(l.amount), 0) from points_ledger l
                  where l.user_id = m.user_id and l.reason <> 'challenge_win'
                    and l.created_at >= v_from and l.created_at < v_to)
         end::bigint as score
  from challenge_members m join profiles p on p.id = m.user_id
  where m.challenge_id = p_challenge
  order by score desc;
end $$;
