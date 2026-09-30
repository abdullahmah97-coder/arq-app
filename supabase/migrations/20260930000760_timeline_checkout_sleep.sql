-- =====================================================================
-- التايم لاين:
--   * «انتهى التمرين 💪»: لما تسجّل خروجك من النادي تطلع لحظة جديدة فوق بوقت الخروج ومدة التمرين
--     (هي نفس زيارة النادي: التفاعل والتعليقات واحد، ونفس خيارات المشاركة والوضع الخفي)
--   * شاشة النوم: بعد «تصبحون على خير» التايم لاين يتقفل لين تضغط «صباح الخير»
--       - الصحيان بعد النوم من الزر بس (مو تلقائي من فتح التطبيق)
--       - my_open_sleep يقول للتطبيق إنك نايم (من أي جهاز)
-- =====================================================================

-- «صباح الخير»: وأنت نايم (فيه «تصبحون على خير» مفتوحة) ما ننشر تلقائي، ننتظر زر شاشة النوم
create or replace function public._post_wake(p_uid uuid, p_at timestamptz, p_src text, p_caption text, p_now timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_day   date := (p_now at time zone 'Asia/Riyadh')::date;
  v_local timestamp := p_at at time zone 'Asia/Riyadh';
  v_sleep posts;
  v_slept integer;
  v_id    uuid;
begin
  if p_uid is null then raise exception 'not_signed_in'; end if;
  if p_src is null or p_src not in ('alarm', 'open', 'manual') then raise exception 'bad_input'; end if;
  if p_src <> 'manual' and not coalesce((select share_wake from profiles where id = p_uid), false) then return null; end if;
  if p_at is null or p_at > p_now + interval '5 minutes' or p_at < p_now - interval '14 hours' then raise exception 'bad_time'; end if;
  perform pg_advisory_xact_lock(hashtext('moment:' || p_uid::text));

  v_sleep := _open_sleep(p_uid, p_now);
  if v_sleep.id is not null then
    if p_src <> 'manual' then return null; end if;
    if p_at <= v_sleep.created_at then p_at := p_now; end if;
    v_slept := floor(extract(epoch from (p_at - v_sleep.created_at)) / 60);
    if v_slept < 20 then v_slept := null; end if;
  else
    select id into v_id from posts
    where user_id = p_uid and kind = 'wake' and (created_at at time zone 'Asia/Riyadh')::date = v_day
    order by created_at desc limit 1;
    if v_id is not null then return v_id; end if;
    if v_local::date <> v_day or extract(hour from v_local) < 3 then raise exception 'bad_time'; end if;
  end if;

  insert into posts (user_id, kind, caption, meta, visibility, created_at)
  values (p_uid, 'wake', coalesce(nullif(left(btrim(coalesce(p_caption, '')), 120), ''), '☀️'),
          jsonb_strip_nulls(jsonb_build_object('at', p_at, 'src', p_src, 'slept', v_slept, 'sleep_id', v_sleep.id)),
          'friends', p_now)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public._post_wake(uuid, timestamptz, text, text, timestamptz) from public, anon, authenticated;

-- أنا نايم؟ («تصبحون على خير» مفتوحة خلال ٢٠ ساعة وما بعدها «صباح الخير»)
create or replace function public.my_open_sleep()
returns table (id uuid, at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.created_at from _open_sleep(auth.uid(), now()) s where s.id is not null;
$$;
revoke all on function public.my_open_sleep() from public, anon;
grant execute on function public.my_open_sleep() to authenticated;

-- التايم لاين + «انتهى التمرين» (checkout) بوقت الخروج
create or replace function public.timeline(p_before timestamptz default now(), p_limit integer default 20)
returns table (item_type text, id uuid, user_id uuid, username text, full_name text, avatar_url text, is_coach boolean,
               image_path text, caption text, gym_id uuid, gym_name text, meta jsonb, at timestamptz,
               like_count bigint, comment_count bigint, my_reaction text, reactors jsonb)
language sql stable security definer set search_path = public as $$
  with circle as (
    select auth.uid() as id
    union
    select case when f.requester = auth.uid() then f.addressee else f.requester end
    from friendships f
    where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee)
  ),
  visits as (
    select c.* from check_ins c
    join profiles p on p.id = c.user_id
    where c.user_id in (select id from circle)
      and (c.user_id = auth.uid() or (p.presence_visibility <> 'hidden' and p.share_checkins))
  ),
  base as (
    select po.kind as item_type, po.id, po.user_id, po.image_path, po.caption, ci.gym_id, po.meta, po.created_at as at
    from posts po
    left join check_ins ci on ci.id = po.check_in_id
    where po.user_id in (select id from circle) and po.created_at < p_before
    union all
    select 'checkin', v.id, v.user_id, null, null, v.gym_id,
           jsonb_build_object('out', v.checked_out_at), v.checked_in_at
    from visits v
    where v.checked_in_at < p_before
    union all
    -- خلّص تمرينه: بس لو المدة منطقية (٥ دقايق – ٦ ساعات)
    select 'checkout', v.id, v.user_id, null, null, v.gym_id,
           jsonb_build_object('in', v.checked_in_at, 'out', v.checked_out_at), v.checked_out_at
    from visits v
    where v.checked_out_at is not null and v.checked_out_at < p_before
      and v.checked_out_at - v.checked_in_at between interval '5 minutes' and interval '6 hours'
  ),
  page as (select * from base order by at desc limit least(greatest(coalesce(p_limit, 20), 1), 50))
  select pg.item_type, pg.id, pg.user_id, pr.username, pr.full_name, pr.avatar_url, pr.is_coach,
         pg.image_path, pg.caption, pg.gym_id, g.name, pg.meta, pg.at,
         r.n,
         case when pg.item_type in ('checkin', 'checkout')
              then (select count(*) from checkin_comments m where m.check_in_id = pg.id)
              else (select count(*) from comments m where m.post_id = pg.id) end,
         r.mine, r.top
  from page pg
  join profiles pr on pr.id = pg.user_id
  left join gyms g on g.id = pg.gym_id
  cross join lateral _reactions(case when pg.item_type in ('checkin', 'checkout') then 'checkin' else 'post' end, pg.id, auth.uid()) r
  order by pg.at desc;
$$;
revoke all on function public.timeline(timestamptz, integer) from public, anon;
grant execute on function public.timeline(timestamptz, integer) to authenticated;
