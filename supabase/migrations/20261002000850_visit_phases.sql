-- =====================================================================
-- التايم لاين: «في النادي» (الدخول) و«انتهى التمرين» (الخروج) لحظتين منفصلتين، لكل وحدة تفاعلها وتعليقاتها
--   قبل كانوا يتشاركون نفس التفاعل والتعليقات، فيطلع نفس التعليق على البطاقتين.
--   phase: in = الدخول (وهو اللي يطلع في صفحة النادي «الموجودين»)، out = «انتهى التمرين»
--   القديم: اللي انكتب بعد الخروج (وبطاقة «انتهى التمرين» ظاهرة) ينتقل لها، والباقي يبقى على الدخول.
--   النسخ القديمة من التطبيق (ما ترسل phase) تكتب على الدخول مثل قبل.
-- =====================================================================

-- «انتهى التمرين» يطلع بس لو الزيارة خلصت ومدتها منطقية (نفس شرط التايم لاين)
create or replace function public._visit_has_out(p_check_in uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from check_ins c where c.id = p_check_in and c.checked_out_at is not null
                 and c.checked_out_at - c.checked_in_at between interval '5 minutes' and interval '6 hours');
$$;
revoke all on function public._visit_has_out(uuid) from public, anon;
grant execute on function public._visit_has_out(uuid) to authenticated;

-- العمود ونقل القديم مرة وحدة بس (لو الترحيل انشغّل مرة ثانية ما يحرّك شي)
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'checkin_likes' and column_name = 'phase') then
    alter table public.checkin_likes add column phase text not null default 'in' check (phase in ('in', 'out'));
    alter table public.checkin_comments add column phase text not null default 'in' check (phase in ('in', 'out'));
    update public.checkin_likes l set phase = 'out' from public.check_ins c
     where c.id = l.check_in_id and c.checked_out_at is not null and l.created_at >= c.checked_out_at
       and c.checked_out_at - c.checked_in_at between interval '5 minutes' and interval '6 hours';
    update public.checkin_comments m set phase = 'out' from public.check_ins c
     where c.id = m.check_in_id and c.checked_out_at is not null and m.created_at >= c.checked_out_at
       and c.checked_out_at - c.checked_in_at between interval '5 minutes' and interval '6 hours';
    -- تفاعل واحد لكل شخص على كل بطاقة
    alter table public.checkin_likes drop constraint checkin_likes_pkey;
    alter table public.checkin_likes add constraint checkin_likes_pkey primary key (check_in_id, user_id, phase);
  end if;
end $$;

-- التفاعل والتعليق على «انتهى التمرين» بس لو البطاقة موجودة
drop policy if exists cilikes_insert on public.checkin_likes;
create policy cilikes_insert on public.checkin_likes for insert to authenticated
  with check (user_id = auth.uid() and can_see_checkin(check_in_id) and (phase = 'in' or _visit_has_out(check_in_id)));
drop policy if exists cicomments_insert on public.checkin_comments;
create policy cicomments_insert on public.checkin_comments for insert to authenticated
  with check (user_id = auth.uid() and can_see_checkin(check_in_id) and (phase = 'in' or _visit_has_out(check_in_id)));

-- التفاعلات: 'checkin' = الدخول، 'checkout' = «انتهى التمرين»، غيرها = منشور
create or replace function public._reactions(p_type text, p_id uuid, p_viewer uuid)
returns table (n bigint, mine text, top jsonb)
language sql stable security definer set search_path = public as $$
  with l as (
    select x.user_id, x.emoji, x.created_at, row_number() over (order by x.created_at desc, x.user_id) as rk
    from (select cl.user_id, cl.emoji, cl.created_at from checkin_likes cl
          where p_type in ('checkin', 'checkout') and cl.check_in_id = p_id
            and cl.phase = case p_type when 'checkout' then 'out' else 'in' end
          union all
          select pl.user_id, pl.emoji, pl.created_at from post_likes pl where p_type not in ('checkin', 'checkout') and pl.post_id = p_id) x
  )
  select count(*),
         max(l.emoji) filter (where l.user_id = p_viewer),
         coalesce(jsonb_agg(jsonb_build_object('u', l.user_id, 'n', coalesce(nullif(btrim(rp.full_name), ''), rp.username),
                                               'a', rp.avatar_url, 'e', l.emoji) order by l.rk) filter (where l.rk <= 6), '[]'::jsonb)
  from l left join profiles rp on rp.id = l.user_id;
$$;
revoke all on function public._reactions(text, uuid, uuid) from public, anon, authenticated;

create or replace function public.reactions_of(p_type text, p_id uuid)
returns table (user_id uuid, username text, full_name text, avatar_url text, is_coach boolean, emoji text, at timestamptz)
language sql stable security definer set search_path = public as $$
  select x.user_id, p.username, p.full_name, p.avatar_url, p.is_coach, x.emoji, x.created_at
  from (select cl.user_id, cl.emoji, cl.created_at from checkin_likes cl
        where p_type in ('checkin', 'checkout') and cl.check_in_id = p_id and can_see_checkin(p_id)
          and cl.phase = case p_type when 'checkout' then 'out' else 'in' end
        union all
        select pl.user_id, pl.emoji, pl.created_at from post_likes pl
        where p_type not in ('checkin', 'checkout') and pl.post_id = p_id
          and exists (select 1 from posts po where po.id = p_id and can_see_post(po.user_id, po.visibility))) x
  join profiles p on p.id = x.user_id
  order by x.created_at desc
  limit 200;
$$;
revoke all on function public.reactions_of(text, uuid) from public, anon;
grant execute on function public.reactions_of(text, uuid) to authenticated;

-- التايم لاين: كل بطاقة بتفاعلها وعدد تعليقاتها
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
              then (select count(*) from checkin_comments m
                    where m.check_in_id = pg.id and m.phase = case pg.item_type when 'checkout' then 'out' else 'in' end)
              else (select count(*) from comments m where m.post_id = pg.id) end,
         r.mine, r.top
  from page pg
  join profiles pr on pr.id = pg.user_id
  left join gyms g on g.id = pg.gym_id
  cross join lateral _reactions(case when pg.item_type in ('checkin', 'checkout') then pg.item_type else 'post' end, pg.id, auth.uid()) r
  order by pg.at desc;
$$;
revoke all on function public.timeline(timestamptz, integer) from public, anon;
grant execute on function public.timeline(timestamptz, integer) to authenticated;

-- «الموجودين في النادي»: التشجيع والتعليقات على الدخول بس
create or replace function public.gym_presence(p_gym uuid)
returns table (check_in_id uuid, user_id uuid, username text, full_name text, avatar_url text,
               points integer, is_coach boolean, checked_in_at timestamptz, checked_out_at timestamptz,
               is_friend boolean, is_me boolean, likes bigint, comments bigint, liked_by_me boolean)
language sql stable security definer set search_path = public as $$
  select * from (
    select distinct on (c.user_id)
           c.id, p.id, p.username, p.full_name, p.avatar_url, p.points, p.is_coach, c.checked_in_at, c.checked_out_at,
           are_friends(p.id, auth.uid()), p.id = auth.uid(),
           (select count(*) from checkin_likes l where l.check_in_id = c.id and l.phase = 'in'),
           (select count(*) from checkin_comments m where m.check_in_id = c.id and m.phase = 'in'),
           exists (select 1 from checkin_likes l where l.check_in_id = c.id and l.phase = 'in' and l.user_id = auth.uid())
    from check_ins c join profiles p on p.id = c.user_id
    where c.gym_id = p_gym and c.checked_in_at > now() - interval '16 hours'
      and (c.checked_out_at is not null or c.checked_in_at > now() - interval '6 hours')
      and can_see_checkin(c.id)
    order by c.user_id, c.checked_in_at desc
  ) x
  order by (x.checked_out_at is null) desc, x.checked_in_at desc
  limit 60;
$$;
revoke all on function public.gym_presence(uuid) from public, anon;
grant execute on function public.gym_presence(uuid) to authenticated;

-- التنبيهات: الضغط يفتح البطاقة الصحيحة، والتفاعل على «انتهى التمرين» تنبيه مستقل عن تفاعل الدخول
create or replace function public._on_checkin_like()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform _notify((select user_id from check_ins where id = new.check_in_id), new.user_id, 'checkin_like', new.check_in_id,
    jsonb_strip_nulls(jsonb_build_object('emoji', new.emoji, 'phase', nullif(new.phase, 'in'))),
    '/checkin/' || new.check_in_id || case when new.phase = 'out' then '?phase=out' else '' end);
  return null;
end $$;

create or replace function public._on_checkin_comment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform _notify((select user_id from check_ins where id = new.check_in_id), new.user_id, 'checkin_comment', new.check_in_id,
    jsonb_strip_nulls(jsonb_build_object('preview', left(new.body, 80), 'phase', nullif(new.phase, 'in'))),
    '/checkin/' || new.check_in_id || case when new.phase = 'out' then '?phase=out' else '' end);
  return null;
end $$;

drop index if exists public.notifications_once;
create unique index notifications_once on public.notifications (user_id, kind, actor_id, target_id, (coalesce(data->>'phase', ''))) nulls not distinct
  where kind in ('follow','friend_request','post_like','checkin_like','friend_here','challenge_invite','program_adopt','gym_offer','rank_up');
