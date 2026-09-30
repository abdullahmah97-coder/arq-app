-- =====================================================================
-- التايم لاين: أنت وأصدقاؤك في مكان واحد
--   * المنشورات (صورة أو رسالة) — مثل قبل
--   * «صحى ☀️»: منشور تلقائي مرة باليوم لما تفتح التطبيق الصبح (وقت المنبّه أو وقت الفتح، بدون بيانات صحية)
--   * «دخل النادي 🏋️»: حضورك يطلع لأصدقائك تلقائياً (إلا لو وضعك خفي أو طفيت المشاركة)
--   * لايك وتعليق على كل شي: المنشورات بإعجابات وتعليقات المنشورات، والحضور بالتصفيق والتعليقات حقته
--   * كل واحد يختار وش يشارك: share_wake و share_checkins
-- =====================================================================

-- ---------- نوع المنشور ----------
alter table public.posts
  add column if not exists kind text not null default 'post' check (kind in ('post','wake')),
  add column if not exists meta jsonb not null default '{}'::jsonb check (pg_column_size(meta) <= 2000);

-- «صحى» مرة وحدة باليوم (بتوقيت الرياض)
create unique index if not exists posts_one_wake_a_day on public.posts (user_id, ((created_at at time zone 'Asia/Riyadh')::date))
  where kind = 'wake';
create index if not exists posts_user_created on public.posts (user_id, created_at desc);

-- المنشورات العادية بس تنكتب مباشرة؛ «صحى» عن طريق post_wake (عشان نتحقق من الوقت)
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated
  with check (user_id = auth.uid() and kind = 'post'
              and (check_in_id is null or exists (select 1 from check_ins c
                   where c.id = check_in_id and c.user_id = auth.uid())));

-- ---------- وش أشارك مع أصدقائي ----------
alter table public.profiles
  add column if not exists share_wake boolean not null default true,
  add column if not exists share_checkins boolean not null default true;
grant update (share_wake, share_checkins) on public.profiles to authenticated;

-- ---------- «صحى ☀️» ----------
-- p_at: وقت الصحيان (وقت المنبّه) أو وقت فتح التطبيق، p_src: alarm | open
-- p_caption: نص بديل للنسخ القديمة من التطبيق (تعرضه كمنشور عادي)
create or replace function public.post_wake(p_at timestamptz, p_src text, p_caption text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_local timestamp := p_at at time zone 'Asia/Riyadh';
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if not coalesce((select share_wake from profiles where id = v_uid), false) then return null; end if;
  if p_src is null or p_src not in ('alarm', 'open') then raise exception 'bad_input'; end if;
  if p_at > now() + interval '5 minutes' or v_local::date <> app_today() or extract(hour from v_local) < 3 then
    raise exception 'bad_time';
  end if;
  insert into posts (user_id, kind, caption, meta, visibility)
  values (v_uid, 'wake', coalesce(nullif(left(btrim(coalesce(p_caption, '')), 120), ''), '☀️'),
          jsonb_build_object('at', p_at, 'src', p_src), 'friends')
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from posts
    where user_id = v_uid and kind = 'wake' and (created_at at time zone 'Asia/Riyadh')::date = app_today();
  end if;
  return v_id;
end $$;
revoke all on function public.post_wake(timestamptz, text, text) from public, anon;
grant execute on function public.post_wake(timestamptz, text, text) to authenticated;

-- ---------- التايم لاين ----------
-- أنا وأصدقائي فقط: المنشورات (ومنها «صحى») والحضور. الأحدث أول، وصفحات بـ p_before.
create or replace function public.timeline(p_before timestamptz default now(), p_limit integer default 20)
returns table (item_type text, id uuid, user_id uuid, username text, full_name text, avatar_url text, is_coach boolean,
               image_path text, caption text, gym_id uuid, gym_name text, meta jsonb, at timestamptz,
               like_count bigint, comment_count bigint, liked_by_me boolean)
language sql stable security definer set search_path = public as $$
  with circle as (
    select auth.uid() as id
    union
    select case when f.requester = auth.uid() then f.addressee else f.requester end
    from friendships f
    where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee)
  ),
  base as (
    select case when po.kind = 'wake' then 'wake' else 'post' end as item_type, po.id, po.user_id,
           po.image_path, po.caption, ci.gym_id, po.meta, po.created_at as at
    from posts po
    left join check_ins ci on ci.id = po.check_in_id
    where po.user_id in (select id from circle) and po.created_at < p_before
    union all
    select 'checkin', c.id, c.user_id, null, null, c.gym_id,
           jsonb_build_object('out', c.checked_out_at), c.checked_in_at
    from check_ins c
    join profiles p on p.id = c.user_id
    where c.user_id in (select id from circle) and c.checked_in_at < p_before
      and (c.user_id = auth.uid() or (p.presence_visibility <> 'hidden' and p.share_checkins))
  ),
  page as (select * from base order by at desc limit least(greatest(coalesce(p_limit, 20), 1), 50))
  select pg.item_type, pg.id, pg.user_id, pr.username, pr.full_name, pr.avatar_url, pr.is_coach,
         pg.image_path, pg.caption, pg.gym_id, g.name, pg.meta, pg.at,
         case when pg.item_type = 'checkin'
              then (select count(*) from checkin_likes l where l.check_in_id = pg.id)
              else (select count(*) from post_likes l where l.post_id = pg.id) end,
         case when pg.item_type = 'checkin'
              then (select count(*) from checkin_comments m where m.check_in_id = pg.id)
              else (select count(*) from comments m where m.post_id = pg.id) end,
         case when pg.item_type = 'checkin'
              then exists (select 1 from checkin_likes l where l.check_in_id = pg.id and l.user_id = auth.uid())
              else exists (select 1 from post_likes l where l.post_id = pg.id and l.user_id = auth.uid()) end
  from page pg
  join profiles pr on pr.id = pg.user_id
  left join gyms g on g.id = pg.gym_id
  order by pg.at desc;
$$;
revoke all on function public.timeline(timestamptz, integer) from public, anon;
grant execute on function public.timeline(timestamptz, integer) to authenticated;

-- ---------- feed: نفسها + نوع المنشور (صفحة المنشور تعرض «صحى» صح) ----------
drop function if exists public.feed(timestamptz, integer, uuid);
create function public.feed(p_before timestamptz default now(), p_limit integer default 20, p_post uuid default null)
returns table (id uuid, user_id uuid, username text, full_name text, avatar_url text,
               image_path text, caption text, check_in_id uuid, gym_name text,
               created_at timestamptz, like_count bigint, comment_count bigint, liked_by_me boolean,
               kind text, meta jsonb)
language sql stable security definer set search_path = public as $$
  select po.id, po.user_id, pr.username, pr.full_name, pr.avatar_url,
         po.image_path, po.caption, po.check_in_id, g.name,
         po.created_at,
         (select count(*) from post_likes l where l.post_id = po.id),
         (select count(*) from comments c where c.post_id = po.id),
         exists (select 1 from post_likes l where l.post_id = po.id and l.user_id = auth.uid()),
         po.kind, po.meta
  from posts po
  join profiles pr on pr.id = po.user_id
  left join check_ins ci on ci.id = po.check_in_id
  left join gyms g on g.id = ci.gym_id
  where (p_post is not null or po.created_at < p_before)
    and (p_post is null or po.id = p_post)
    and can_see_post(po.user_id, po.visibility)
  order by po.created_at desc
  limit least(p_limit, 50);
$$;
revoke all on function public.feed(timestamptz, integer, uuid) from public, anon;
grant execute on function public.feed(timestamptz, integer, uuid) to authenticated;
