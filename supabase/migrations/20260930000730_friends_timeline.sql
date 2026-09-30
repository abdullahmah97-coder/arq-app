-- =====================================================================
-- التايم لاين: أنت وأصدقاؤك في مكان واحد (لحظات اليوم على خط زمني)
--   * المنشورات (صورة أو كلام) — مثل قبل
--   * «صباح الخير ☀️»: تلقائي مرة باليوم لما تفتح التطبيق الصبح (وقت منبّه أرك أو وقت الفتح — بدون بيانات صحية)
--   * «تصبحون على خير 🌙»: تنشره أنت من زر ＋، ولما تصحى نحسب كم نمت من الوقتين بس
--   * «في النادي 🏋️»: حضورك يطلع لأصدقائك تلقائياً (إلا لو وضعك خفي أو طفيت المشاركة)
--   * تفاعل بالإيموجي ❤️ 💪 🔥 😂 👏 (بدل اللايك) وتعليقات على كل شي
--   * كل واحد يختار وش يطلع تلقائياً: share_wake و share_checkins
-- =====================================================================

-- ---------- نوع المنشور ----------
alter table public.posts
  add column if not exists kind text not null default 'post' check (kind in ('post','wake','sleep')),
  add column if not exists meta jsonb not null default '{}'::jsonb check (pg_column_size(meta) <= 2000);
create index if not exists posts_user_created on public.posts (user_id, created_at desc);

-- المنشورات العادية بس تنكتب مباشرة؛ «صباح الخير» و«تصبحون على خير» عن طريق post_wake / post_sleep (عشان نتحقق من الوقت)
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated
  with check (user_id = auth.uid() and kind = 'post'
              and (check_in_id is null or exists (select 1 from check_ins c
                   where c.id = check_in_id and c.user_id = auth.uid())));

-- تعديل المنشور (النص) ما يغيّر نوعه ولا وقته
create or replace function public._posts_kind_guard()
returns trigger language plpgsql as $$
begin
  if new.kind is distinct from old.kind or new.meta is distinct from old.meta then raise exception 'not_allowed'; end if;
  return new;
end $$;
drop trigger if exists posts_kind_guard on public.posts;
create trigger posts_kind_guard before update on public.posts for each row execute function public._posts_kind_guard();

-- ---------- وش أشارك مع أصدقائي ----------
alter table public.profiles
  add column if not exists share_wake boolean not null default true,
  add column if not exists share_checkins boolean not null default true;
grant update (share_wake, share_checkins) on public.profiles to authenticated;

-- ---------- التفاعل بالإيموجي ----------
-- love ❤️  strong 💪  fire 🔥  laugh 😂  clap 👏 — اللايك القديم ❤️ للمنشورات و👏 للحضور
alter table public.post_likes
  add column if not exists emoji text not null default 'love' check (emoji in ('love','strong','fire','laugh','clap'));
alter table public.checkin_likes
  add column if not exists emoji text not null default 'clap' check (emoji in ('love','strong','fire','laugh','clap'));
-- تغيير التفاعل = تعديل الإيموجي بس (ما يوصل تنبيه ثاني)
drop policy if exists likes_update on public.post_likes;
create policy likes_update on public.post_likes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists cilikes_update on public.checkin_likes;
create policy cilikes_update on public.checkin_likes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.post_likes, public.checkin_likes from authenticated, anon;
grant update (emoji) on public.post_likes, public.checkin_likes to authenticated;

create or replace function public._reaction_char(p text)
returns text language sql immutable as $$
  select case p when 'love' then '❤️' when 'strong' then '💪' when 'fire' then '🔥' when 'laugh' then '😂' when 'clap' then '👏' else '' end;
$$;

-- عدد التفاعلات، تفاعلي، وآخر ٦ (الاسم والصورة والإيموجي)
create or replace function public._reactions(p_type text, p_id uuid, p_viewer uuid)
returns table (n bigint, mine text, top jsonb)
language sql stable security definer set search_path = public as $$
  with l as (
    select x.user_id, x.emoji, x.created_at, row_number() over (order by x.created_at desc, x.user_id) as rk
    from (select cl.user_id, cl.emoji, cl.created_at from checkin_likes cl where p_type = 'checkin' and cl.check_in_id = p_id
          union all
          select pl.user_id, pl.emoji, pl.created_at from post_likes pl where p_type <> 'checkin' and pl.post_id = p_id) x
  )
  select count(*),
         max(l.emoji) filter (where l.user_id = p_viewer),
         coalesce(jsonb_agg(jsonb_build_object('u', l.user_id, 'n', coalesce(nullif(btrim(rp.full_name), ''), rp.username),
                                               'a', rp.avatar_url, 'e', l.emoji) order by l.rk) filter (where l.rk <= 6), '[]'::jsonb)
  from l left join profiles rp on rp.id = l.user_id;
$$;
revoke all on function public._reactions(text, uuid, uuid) from public, anon, authenticated;

-- كل اللي تفاعلوا (لنافذة «مين تفاعل»): بس لو تقدر تشوف المنشور أو الحضور
create or replace function public.reactions_of(p_type text, p_id uuid)
returns table (user_id uuid, username text, full_name text, avatar_url text, is_coach boolean, emoji text, at timestamptz)
language sql stable security definer set search_path = public as $$
  select x.user_id, p.username, p.full_name, p.avatar_url, p.is_coach, x.emoji, x.created_at
  from (select cl.user_id, cl.emoji, cl.created_at from checkin_likes cl
        where p_type = 'checkin' and cl.check_in_id = p_id and can_see_checkin(p_id)
        union all
        select pl.user_id, pl.emoji, pl.created_at from post_likes pl
        where p_type <> 'checkin' and pl.post_id = p_id
          and exists (select 1 from posts po where po.id = p_id and can_see_post(po.user_id, po.visibility))) x
  join profiles p on p.id = x.user_id
  order by x.created_at desc
  limit 200;
$$;
revoke all on function public.reactions_of(text, uuid) from public, anon;
grant execute on function public.reactions_of(text, uuid) to authenticated;

-- ---------- «تصبحون على خير 🌙» و«صباح الخير ☀️» ----------
-- «نومة مفتوحة»: آخر «تصبحون على خير» خلال ٢٠ ساعة وما بعدها «صباح الخير»
create or replace function public._open_sleep(p_uid uuid, p_now timestamptz)
returns public.posts language sql stable security definer set search_path = public as $$
  select s.* from posts s
  where s.user_id = p_uid and s.kind = 'sleep' and s.created_at > p_now - interval '20 hours' and s.created_at <= p_now
    and not exists (select 1 from posts w where w.user_id = p_uid and w.kind = 'wake' and w.created_at > s.created_at)
  order by s.created_at desc limit 1;
$$;
revoke all on function public._open_sleep(uuid, timestamptz) from public, anon, authenticated;

-- المنطق كله هنا (p_now ثابت في الاختبارات)
--   p_at: وقت الصحيان (وقت منبّه أرك) أو وقت فتح التطبيق، p_src: alarm | open (تلقائي) | manual (من زر ＋)
--   p_caption: نص بديل للنسخ القديمة من التطبيق (تعرضه كمنشور عادي)
--   بعد «تصبحون على خير»: أي ساعة، ونحسب كم نام. بدونها: مرة باليوم من ٣ الفجر (بتوقيت الرياض)
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
    if p_at <= v_sleep.created_at then
      if p_src = 'manual' then p_at := p_now; else raise exception 'too_soon'; end if;
    end if;
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

create or replace function public._post_sleep(p_uid uuid, p_caption text, p_now timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_open posts; v_id uuid;
begin
  if p_uid is null then raise exception 'not_signed_in'; end if;
  perform pg_advisory_xact_lock(hashtext('moment:' || p_uid::text));
  -- ضغطة ثانية وهو ما صحى من نومته (خلال ٣ ساعات) = نفس المنشور
  v_open := _open_sleep(p_uid, p_now);
  if v_open.id is not null and v_open.created_at > p_now - interval '3 hours' then return v_open.id; end if;
  if (select count(*) from posts where user_id = p_uid and kind = 'sleep' and created_at > p_now - interval '24 hours') >= 4 then
    raise exception 'rate_limited';
  end if;
  insert into posts (user_id, kind, caption, meta, visibility, created_at)
  values (p_uid, 'sleep', coalesce(nullif(left(btrim(coalesce(p_caption, '')), 120), ''), '🌙'),
          jsonb_build_object('at', p_now), 'friends', p_now)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public._post_sleep(uuid, text, timestamptz) from public, anon, authenticated;

create or replace function public.post_wake(p_at timestamptz, p_src text, p_caption text)
returns uuid language sql security definer set search_path = public as $$
  select _post_wake(auth.uid(), p_at, p_src, p_caption, now());
$$;
revoke all on function public.post_wake(timestamptz, text, text) from public, anon;
grant execute on function public.post_wake(timestamptz, text, text) to authenticated;

create or replace function public.post_sleep(p_caption text default null)
returns uuid language sql security definer set search_path = public as $$
  select _post_sleep(auth.uid(), p_caption, now());
$$;
revoke all on function public.post_sleep(text) from public, anon;
grant execute on function public.post_sleep(text) to authenticated;

-- ---------- التايم لاين ----------
-- أنا وأصدقائي فقط: المنشورات (ومنها الصحيان والنوم) والحضور. الأحدث أول، وصفحات بـ p_before.
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
  base as (
    select po.kind as item_type, po.id, po.user_id, po.image_path, po.caption, ci.gym_id, po.meta, po.created_at as at
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
         r.n,
         case when pg.item_type = 'checkin'
              then (select count(*) from checkin_comments m where m.check_in_id = pg.id)
              else (select count(*) from comments m where m.post_id = pg.id) end,
         r.mine, r.top
  from page pg
  join profiles pr on pr.id = pg.user_id
  left join gyms g on g.id = pg.gym_id
  cross join lateral _reactions(case when pg.item_type = 'checkin' then 'checkin' else 'post' end, pg.id, auth.uid()) r
  order by pg.at desc;
$$;
revoke all on function public.timeline(timestamptz, integer) from public, anon;
grant execute on function public.timeline(timestamptz, integer) to authenticated;

-- ---------- feed: نفسها + نوع المنشور والتفاعلات (صفحة المنشور) ----------
drop function if exists public.feed(timestamptz, integer, uuid);
create function public.feed(p_before timestamptz default now(), p_limit integer default 20, p_post uuid default null)
returns table (id uuid, user_id uuid, username text, full_name text, avatar_url text,
               image_path text, caption text, check_in_id uuid, gym_name text,
               created_at timestamptz, like_count bigint, comment_count bigint, liked_by_me boolean,
               kind text, meta jsonb, my_reaction text, reactors jsonb, is_coach boolean)
language sql stable security definer set search_path = public as $$
  select po.id, po.user_id, pr.username, pr.full_name, pr.avatar_url,
         po.image_path, po.caption, po.check_in_id, g.name,
         po.created_at,
         r.n,
         (select count(*) from comments c where c.post_id = po.id),
         r.mine is not null,
         po.kind, po.meta, r.mine, r.top, pr.is_coach
  from posts po
  join profiles pr on pr.id = po.user_id
  left join check_ins ci on ci.id = po.check_in_id
  left join gyms g on g.id = ci.gym_id
  cross join lateral _reactions('post', po.id, auth.uid()) r
  where (p_post is not null or po.created_at < p_before)
    and (p_post is null or po.id = p_post)
    and can_see_post(po.user_id, po.visibility)
  order by po.created_at desc
  limit least(p_limit, 50);
$$;
revoke all on function public.feed(timestamptz, integer, uuid) from public, anon;
grant execute on function public.feed(timestamptz, integer, uuid) to authenticated;

-- ---------- تنبيه التفاعل: بالإيموجي ----------
create or replace function public._on_post_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_kind text;
begin
  select user_id, kind into v_owner, v_kind from posts where id = new.post_id;
  perform _notify(v_owner, new.user_id, 'post_like', new.post_id,
    jsonb_build_object('emoji', new.emoji, 'post_kind', coalesce(v_kind, 'post')), '/post/' || new.post_id);
  return null;
end $$;

create or replace function public._on_checkin_like()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform _notify((select user_id from check_ins where id = new.check_in_id), new.user_id, 'checkin_like', new.check_in_id,
    jsonb_build_object('emoji', new.emoji), '/checkin/' || new.check_in_id);
  return null;
end $$;

-- نص إشعار الجوال (نفس اللي قبل + التفاعل بالإيموجي)
create or replace function public._notif_text(p_kind text, p_name text, p_data jsonb, p_loc text)
returns text[] language plpgsql immutable as $$
declare
  en boolean := p_loc = 'en';
  n text := coalesce(p_name, case when en then 'Someone' else 'أحد' end);
  pv text := coalesce(p_data->>'preview', '');
  ti text := coalesce(p_data->>'title', '');
  gy text := coalesce(p_data->>'gym', '');
  em text := _reaction_char(p_data->>'emoji');
begin
  return case p_kind
    when 'message'          then array[n, pv]
    when 'nudge'            then array[coalesce(p_data->>'title', ''), coalesce(p_data->>'body', '')]
    when 'notice'           then array[coalesce(case when en then p_data->>'title_en' end, p_data->>'title_ar', ''),
                                       coalesce(case when en then p_data->>'body_en' end, p_data->>'body_ar', '')]
    when 'promo'            then array[coalesce(case when en then p_data->>'title_en' end, p_data->>'title_ar', ''),
                                       coalesce(case when en then p_data->>'body_en' end, p_data->>'body_ar', '')]
    when 'follow'           then case when (p_data->>'mutual')::boolean
                                   then array[case when en then 'You follow each other now' else 'صرتوا تتابعون بعض' end,
                                              case when en then n || ' followed you back — you can message each other' else n || ' تابعك — تقدرون تتراسلون الحين' end]
                                   else array[case when en then 'New follower' else 'متابع جديد' end,
                                              case when en then n || ' started following you' else n || ' بدأ يتابعك' end] end
    when 'friend_request'   then array[case when en then 'Friend request' else 'طلب صداقة' end,
                                       case when en then n || ' wants to be your friend' else n || ' يبي يضيفك صديق' end]
    when 'friend_accept'    then array[case when en then 'You''re friends now' else 'صرتوا أصدقاء' end,
                                       case when en then n || ' accepted your friend request' else n || ' قبل طلب صداقتك' end]
    when 'post_like'        then case when em <> ''
                                   then array[case when en then 'New reaction ' || em else 'تفاعل جديد ' || em end,
                                              case when en then n || ' reacted ' || em || ' to your '
                                                                || case p_data->>'post_kind' when 'wake' then 'good morning ☀️' when 'sleep' then 'good night 🌙' else 'post' end
                                                   else n || ' تفاعل ' || em || ' مع '
                                                        || case p_data->>'post_kind' when 'wake' then 'صباحك ☀️' when 'sleep' then 'نومتك 🌙' else 'منشورك' end end]
                                   else array[case when en then 'New like' else 'إعجاب جديد' end,
                                              case when en then n || ' liked your post' else n || ' أعجبه منشورك' end] end
    when 'post_comment'     then array[case when en then 'New comment' else 'تعليق جديد' end, n || ': ' || pv]
    when 'checkin_like'     then case when em <> ''
                                   then array[case when en then 'Props ' || em else 'تشجيع ' || em end,
                                              case when en then n || ' reacted ' || em || ' to your gym check-in' else n || ' تفاعل ' || em || ' مع حضورك للنادي' end]
                                   else array[case when en then '💪 Props' else '💪 تشجيع' end,
                                              case when en then n || ' liked your gym check-in' else n || ' أعجبه حضورك للنادي' end] end
    when 'checkin_comment'  then array[case when en then 'Comment on your check-in' else 'تعليق على حضورك' end, n || ': ' || pv]
    when 'friend_here'      then array[case when en then 'Your friend is at the gym' else 'صاحبك في النادي' end,
                                       case when en then n || ' just arrived at ' || gy else n || ' وصل ' || gy || ' الحين' end]
    when 'challenge_invite' then array[case when en then 'Challenge invite' else 'دعوة لتحدي' end,
                                       case when en then n || ' invited you to “' || ti || '”' else n || ' دعاك لتحدي «' || ti || '»' end]
    when 'challenge_win'    then array[case when en then '🏆 You won!' else '🏆 فزت بالتحدي' end,
                                       case when en then 'You won “' || ti || '” and earned ' || coalesce(p_data->>'points', '50') || ' points'
                                            else 'فزت في «' || ti || '» وأخذت ' || coalesce(p_data->>'points', '50') || ' نقطة' end]
    when 'rank_up'          then array[case when en then '⬆️ New rank' else '⬆️ رتبة جديدة' end,
                                       case when en then 'You reached “' || _rank_name((p_data->>'level')::int, 'en') || '”'
                                            else 'وصلت رتبة «' || _rank_name((p_data->>'level')::int, 'ar') || '» 🔥' end]
    when 'program_adopt'    then array[case when en then 'Your program is spreading' else 'برنامجك ينتشر' end,
                                       case when en then n || ' started your program “' || ti || '”' else n || ' بدأ برنامجك «' || ti || '»' end]
    when 'gym_offer'        then array[case when en then 'New offer at ' || gy else 'عرض جديد في ' || gy end,
                                       ti || ' — ' || coalesce(p_data->>'price', '') || case when en then ' SAR' else ' ر.س' end]
    else array[case when en then 'ARQ' else 'أرك' end, '']
  end;
end $$;
