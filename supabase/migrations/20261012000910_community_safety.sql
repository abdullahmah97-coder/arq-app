-- =====================================================================
-- أمان المجتمع (شرط App Store رقم 1.2 لأي تطبيق فيه محتوى من المستخدمين: فلترة، إبلاغ، حظر):
--   ١) الحظر: تحظر أي شخص ← محتوى كل طرف يختفي عن الثاني (منشورات، تعليقات، تفاعلات، حضور)،
--      وتنفك الصداقة والمتابعة والتدريب بينكم، وما يقدر يراسلك ولا يعلّق عندك ولا يتابعك.
--   ٢) الإبلاغ: عن منشور أو تعليق أو رسالة وصلتك أو حساب. ينحفظ المحتوى وقت البلاغ (للمراجعة لو انحذف)،
--      وبعد ٣ بلاغات من ناس مختلفين يختفي المنشور أو التعليق تلقائياً لين يراجعه المشرف.
--   ٣) المراجعة: لوحة إدارة التطبيق ← «بلاغات المجتمع»: إخفاء، إرجاع، إيقاف الحساب عن النشر، أو رفض البلاغ.
--   ٤) الفلترة قبل النشر: كلمات مسيئة تنرفض في المنشورات والتعليقات (قائمة يعدّلها المشرف)،
--      وصورة المنشور تبان لصاحبها بس لين تنفحص (دالة moderate-post) وبعدها تبان للباقين.
--   ٥) الإيقاف: الحساب الموقوف ما ينشر ولا يعلّق ولا يراسل لين تنتهي المدة.
--   ٦) إرشادات المجتمع: يوافق عليها المستخدم مرة وحدة قبل أول منشور أو تعليق (guidelines_at).
-- =====================================================================

-- ---------- الجداول ----------
create table if not exists public.user_blocks (
  blocker    uuid not null references public.profiles(id) on delete cascade,
  blocked    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index if not exists user_blocks_blocked on public.user_blocks (blocked, blocker);
alter table public.user_blocks enable row level security;
-- تشوف بس اللي أنت حظرتهم (ومحد يعرف إنه انحظر). الإضافة والحذف من الدوال تحت بس
do $p$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_blocks' and policyname = 'blocks_own') then
    create policy blocks_own on public.user_blocks for select to authenticated using (blocker = auth.uid());
  end if;
end $p$;
revoke insert, update, delete on public.user_blocks from authenticated, anon;

create table if not exists public.content_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter    uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment','checkin_comment','message','user')),
  target_id   uuid not null,
  -- لو صاحب المحتوى حذف حسابه تنحذف البلاغات عنه ونسخة محتواه (سياسة الخصوصية: بياناتك تنحذف نهائياً)
  target_user uuid references public.profiles(id) on delete cascade,
  reason      text not null check (reason in ('spam','harassment','hate','sexual','violence','self_harm','other')),
  note        text check (note is null or char_length(note) <= 500),
  snapshot    jsonb not null default '{}'::jsonb check (pg_column_size(snapshot) <= 4000),
  status      text not null default 'open' check (status in ('open','actioned','dismissed')),
  action      text check (action is null or action in ('hide','restore','approve','suspend','unsuspend','dismiss')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (reporter, target_type, target_id)
);
create index if not exists content_reports_target on public.content_reports (target_type, target_id, status);
create index if not exists content_reports_status on public.content_reports (status, created_at desc);
create index if not exists content_reports_reporter on public.content_reports (reporter, created_at desc);
alter table public.content_reports enable row level security;
do $p$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'content_reports' and policyname = 'reports_read') then
    create policy reports_read on public.content_reports for select to authenticated using (reporter = auth.uid() or is_admin());
  end if;
end $p$;
revoke insert, update, delete on public.content_reports from authenticated, anon;

-- الإيقاف عن النشر (جدول خاص: محد يشوفه إلا صاحبه والمشرف)
create table if not exists public.suspensions (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  until      timestamptz not null,
  note       text check (note is null or char_length(note) <= 300),
  by_admin   uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.suspensions enable row level security;
do $p$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'suspensions' and policyname = 'suspensions_read') then
    create policy suspensions_read on public.suspensions for select to authenticated using (user_id = auth.uid() or is_admin());
  end if;
end $p$;
revoke insert, update, delete on public.suspensions from authenticated, anon;

-- الكلمات الممنوعة (يضيفها ويشيلها المشرف من لوحة إدارة التطبيق)
create table if not exists public.moderation_terms (
  term       text primary key check (char_length(btrim(term)) between 2 and 40),
  added_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.moderation_terms enable row level security;
do $p$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'moderation_terms' and policyname = 'terms_admin') then
    create policy terms_admin on public.moderation_terms for all to authenticated using (is_admin()) with check (is_admin());
  end if;
end $p$;

-- ---------- الأعمدة ----------
-- screen: صورة المنشور تنفحص قبل ما تبان للناس (pending ← ok أو blocked). المنشورات القديمة ok
alter table public.posts
  add column if not exists screen        text not null default 'ok' check (screen in ('pending','ok','blocked')),
  add column if not exists hidden_at     timestamptz,
  add column if not exists hidden_reason text check (hidden_reason is null or hidden_reason in ('reports','admin','screen'));
alter table public.comments
  add column if not exists hidden_at     timestamptz,
  add column if not exists hidden_reason text check (hidden_reason is null or hidden_reason in ('reports','admin'));
alter table public.checkin_comments
  add column if not exists hidden_at     timestamptz,
  add column if not exists hidden_reason text check (hidden_reason is null or hidden_reason in ('reports','admin'));
create index if not exists posts_screen_pending on public.posts (created_at) where screen = 'pending';

-- وقت موافقته على إرشادات المجتمع (ما ينعدّل من التطبيق مباشرة: من accept_guidelines بس)
alter table public.profiles add column if not exists guidelines_at timestamptz;

-- ---------- أدوات ----------
-- محظور بين الاثنين (أي طرف حظر الثاني). لو انادت مباشرة من التطبيق لازم تكون أحد الطرفين
create or replace function public.is_blocked_pair(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select a is not null and b is not null and a <> b
     and (not _called_as_rpc('is_blocked_pair') or coalesce(auth.uid() in (a, b), false))
     and exists (select 1 from user_blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a));
$$;
revoke all on function public.is_blocked_pair(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_pair(uuid, uuid) to authenticated;

create or replace function public.is_suspended(p_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select p_uid is not null
     and (not _called_as_rpc('is_suspended') or p_uid = auth.uid() or is_admin())
     and exists (select 1 from suspensions where user_id = p_uid and until > now());
$$;
revoke all on function public.is_suspended(uuid) from public, anon;
grant execute on function public.is_suspended(uuid) to authenticated;

-- توحيد النص قبل المقارنة: حروف صغيرة، بدون تشكيل وتطويل، الألف والياء والتاء المربوطة بشكل واحد،
-- الأرقام العربية لاتينية، والحرف المكرر ٣ مرات وأكثر يصير حرف واحد (كلللب ← كلب)
-- (الأقواس: U+064B إلى U+065F تشكيل، و U+0670 ألف خنجرية، و U+0640 تطويل؛ الأرقام العربية U+0660+ ما تنشال)
create or replace function public._norm_text(t text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(
           translate(regexp_replace(lower(coalesce(t, '')), '[ً-ٰٟـ]', '', 'g'),
                     'أإآٱىةؤئ٠١٢٣٤٥٦٧٨٩', 'اااايهوي0123456789'),
           '(.)\1{2,}', '\1', 'g');
$$;

-- أول كلمة ممنوعة في النص (أو null). يقارن كلمات كاملة (وعبارات)، ومع شيل «ال» وحروف الجر الملتصقة فيها
create or replace function public._text_violation(t text)
returns text language sql stable security definer set search_path = public as $$
  with n as (
    select ' ' || btrim(regexp_replace(_norm_text(t), '[^a-z0-9ء-ي]+', ' ', 'g')) || ' ' as s
  ), n2 as (
    select s, regexp_replace(s, ' (وال|بال|فال|كال|لل|ال)', ' ', 'g') as s2 from n
  )
  select m.term from moderation_terms m, n2
  where coalesce(btrim(t), '') <> ''
    and (position(' ' || _norm_text(m.term) || ' ' in n2.s) > 0 or position(' ' || _norm_text(m.term) || ' ' in n2.s2) > 0)
  limit 1;
$$;
revoke all on function public._text_violation(text) from public, anon;
grant execute on function public._text_violation(text) to authenticated;

-- علامات المنشور لصاحبه بس (عشان يعرف إن منشوره قيد الفحص أو انخفى): تنضاف لـ meta
create or replace function public._post_flags(p_screen text, p_hidden timestamptz)
returns jsonb language sql immutable set search_path = public as $$
  select case when p_hidden is not null then jsonb_build_object('hidden', true)
              when p_screen is distinct from 'ok' then jsonb_build_object('screen', p_screen)
              else '{}'::jsonb end;
$$;

-- ---------- الحماية عند الكتابة ----------
-- (بدون security definer عشان current_user يكون دور المستخدم. الدوال اللي تكتب بصلاحية الخادم ما تتقيّد)
create or replace function public._posts_safety_ins()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if is_suspended(new.user_id) then raise exception 'account_suspended'; end if;
    new.hidden_at := null; new.hidden_reason := null;
    new.screen := case when new.image_path is not null then 'pending' else 'ok' end;
  end if;
  if new.kind = 'post' and _text_violation(new.caption) is not null then raise exception 'content_blocked'; end if;
  return new;
end $$;
create or replace trigger posts_safety_ins before insert on public.posts for each row execute function public._posts_safety_ins();

create or replace function public._posts_safety_upd()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.screen is distinct from old.screen or new.hidden_at is distinct from old.hidden_at
       or new.hidden_reason is distinct from old.hidden_reason then raise exception 'not_allowed'; end if;
    -- صورة جديدة = فحص جديد
    if new.image_path is distinct from old.image_path and new.image_path is not null then new.screen := 'pending'; end if;
  end if;
  if new.kind = 'post' and new.caption is distinct from old.caption and _text_violation(new.caption) is not null then
    raise exception 'content_blocked';
  end if;
  return new;
end $$;
create or replace trigger posts_safety_upd before update on public.posts for each row execute function public._posts_safety_upd();

create or replace function public._comments_safety()
returns trigger language plpgsql set search_path = public as $$
declare v_owner uuid;
begin
  if current_user in ('authenticated', 'anon') then
    if is_suspended(new.user_id) then raise exception 'account_suspended'; end if;
    new.hidden_at := null; new.hidden_reason := null;
  end if;
  if tg_table_name = 'comments' then
    select user_id into v_owner from posts where id = new.post_id;
  else
    select user_id into v_owner from check_ins where id = new.check_in_id;
  end if;
  if is_blocked_pair(new.user_id, v_owner) then raise exception 'blocked_user'; end if;
  if _text_violation(new.body) is not null then raise exception 'content_blocked'; end if;
  return new;
end $$;
create or replace trigger comments_safety before insert on public.comments for each row execute function public._comments_safety();
create or replace trigger checkin_comments_safety before insert on public.checkin_comments for each row execute function public._comments_safety();

create or replace function public._hidden_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.hidden_at is distinct from old.hidden_at or new.hidden_reason is distinct from old.hidden_reason) then
    raise exception 'not_allowed';
  end if;
  return new;
end $$;
create or replace trigger comments_hidden_guard before update on public.comments for each row execute function public._hidden_guard();
create or replace trigger checkin_comments_hidden_guard before update on public.checkin_comments for each row execute function public._hidden_guard();

create or replace function public._messages_safety()
returns trigger language plpgsql set search_path = public as $$
begin
  if is_blocked_pair(new.sender, new.recipient) then raise exception 'blocked_user'; end if;
  if current_user in ('authenticated', 'anon') and is_suspended(new.sender) then raise exception 'account_suspended'; end if;
  return new;
end $$;
create or replace trigger messages_safety before insert on public.messages for each row execute function public._messages_safety();

create or replace function public._relation_block_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  -- (كل جدول بفرعه: plpgsql يقرأ حقول new وقت التنفيذ، والجدولين أعمدتهم مختلفة)
  if tg_table_name = 'follows' then
    if is_blocked_pair(new.follower, new.followee) then raise exception 'blocked_user'; end if;
  elsif is_blocked_pair(new.requester, new.addressee) then
    raise exception 'blocked_user';
  end if;
  return new;
end $$;
create or replace trigger follows_block_guard before insert on public.follows for each row execute function public._relation_block_guard();
create or replace trigger friendships_block_guard before insert on public.friendships for each row execute function public._relation_block_guard();

-- ---------- القراءة ----------
-- المنشور ما يبان بين اثنين بينهم حظر (المحتوى نفسه، والتعليقات والتفاعلات عليه)
create or replace function public.can_see_post(p_owner uuid, p_visibility text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_owner = auth.uid()
      or ((p_visibility = 'public' or are_friends(p_owner, auth.uid())) and not is_blocked_pair(p_owner, auth.uid()));
$$;

alter policy posts_read on public.posts
  using (can_see_post(user_id, visibility)
         and (user_id = auth.uid() or is_admin() or (screen = 'ok' and hidden_at is null)));

alter policy comments_read on public.comments
  using (exists (select 1 from posts p where p.id = post_id and can_see_post(p.user_id, p.visibility))
         and (user_id = auth.uid() or is_admin() or (hidden_at is null and not is_blocked_pair(user_id, auth.uid()))));

create or replace function public.can_see_checkin(p_check_in uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from check_ins c join profiles p on p.id = c.user_id
    where c.id = p_check_in and (
      c.user_id = auth.uid()
      or (p.presence_visibility <> 'hidden' and not is_blocked_pair(c.user_id, auth.uid()) and (
            are_friends(c.user_id, auth.uid())
            or (p.presence_visibility = 'gym' and c.checked_in_at > now() - interval '16 hours' and present_at(c.gym_id))
      ))
    ));
$$;

alter policy cicomments_read on public.checkin_comments
  using (can_see_checkin(check_in_id)
         and (user_id = auth.uid() or is_admin() or (hidden_at is null and not is_blocked_pair(user_id, auth.uid()))));

-- التفاعلات: نشيل تفاعل اللي بينك وبينه حظر من العدد والقائمة
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
    where not is_blocked_pair(x.user_id, p_viewer)
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
  where not is_blocked_pair(x.user_id, auth.uid())
  order by x.created_at desc
  limit 200;
$$;

-- صفحة المنشور: نفس الشروط + علامة «قيد الفحص» أو «مخفي» لصاحبه + عدد التعليقات الظاهرة له بس
create or replace function public.feed(p_before timestamptz default now(), p_limit integer default 20, p_post uuid default null)
returns table (id uuid, user_id uuid, username text, full_name text, avatar_url text,
               image_path text, caption text, check_in_id uuid, gym_name text,
               created_at timestamptz, like_count bigint, comment_count bigint, liked_by_me boolean,
               kind text, meta jsonb, my_reaction text, reactors jsonb, is_coach boolean)
language sql stable security definer set search_path = public as $$
  select po.id, po.user_id, pr.username, pr.full_name, pr.avatar_url,
         po.image_path, po.caption, po.check_in_id, g.name,
         po.created_at,
         r.n,
         (select count(*) from comments c where c.post_id = po.id
            and (c.user_id = auth.uid() or (c.hidden_at is null and not is_blocked_pair(c.user_id, auth.uid())))),
         r.mine is not null,
         po.kind, po.meta || case when po.user_id = auth.uid() then _post_flags(po.screen, po.hidden_at) else '{}'::jsonb end,
         r.mine, r.top, pr.is_coach
  from posts po
  join profiles pr on pr.id = po.user_id
  left join check_ins ci on ci.id = po.check_in_id
  left join gyms g on g.id = ci.gym_id
  cross join lateral _reactions('post', po.id, auth.uid()) r
  where (p_post is not null or po.created_at < p_before)
    and (p_post is null or po.id = p_post)
    and can_see_post(po.user_id, po.visibility)
    and (po.user_id = auth.uid() or (po.screen = 'ok' and po.hidden_at is null))
  order by po.created_at desc
  limit least(p_limit, 50);
$$;
revoke all on function public.feed(timestamptz, integer, uuid) from public, anon;
grant execute on function public.feed(timestamptz, integer, uuid) to authenticated;

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
    select po.kind as item_type, po.id, po.user_id, po.image_path, po.caption, ci.gym_id,
           po.meta || case when po.user_id = auth.uid() then _post_flags(po.screen, po.hidden_at) else '{}'::jsonb end as meta,
           po.created_at as at
    from posts po
    left join check_ins ci on ci.id = po.check_in_id
    where po.user_id in (select id from circle) and po.created_at < p_before
      and (po.user_id = auth.uid() or (po.screen = 'ok' and po.hidden_at is null and not is_blocked_pair(po.user_id, auth.uid())))
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
                    where m.check_in_id = pg.id and m.phase = case pg.item_type when 'checkout' then 'out' else 'in' end
                      and (m.user_id = auth.uid() or (m.hidden_at is null and not is_blocked_pair(m.user_id, auth.uid()))))
              else (select count(*) from comments m where m.post_id = pg.id
                      and (m.user_id = auth.uid() or (m.hidden_at is null and not is_blocked_pair(m.user_id, auth.uid())))) end,
         r.mine, r.top
  from page pg
  join profiles pr on pr.id = pg.user_id
  left join gyms g on g.id = pg.gym_id
  cross join lateral _reactions(case when pg.item_type in ('checkin', 'checkout') then pg.item_type else 'post' end, pg.id, auth.uid()) r
  order by pg.at desc;
$$;
revoke all on function public.timeline(timestamptz, integer) from public, anon;
grant execute on function public.timeline(timestamptz, integer) to authenticated;

-- ---------- الحظر ----------
create or replace function public.block_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if p_user is null or p_user = me or not exists (select 1 from profiles where id = p_user) then raise exception 'user_not_found'; end if;
  insert into user_blocks (blocker, blocked) values (me, p_user) on conflict do nothing;
  delete from friendships where (requester = me and addressee = p_user) or (requester = p_user and addressee = me);
  delete from follows where (follower = me and followee = p_user) or (follower = p_user and followee = me);
  -- التدريب بينكم ينتهي (أو ينرفض لو كان طلب)
  update coach_links set status = 'ended', ended_at = now(), ended_by = me, scopes = '{}'
   where status = 'active' and ((coach_id = me and client_id = p_user) or (coach_id = p_user and client_id = me));
  update coach_links set status = 'declined', ended_at = now(), ended_by = me
   where status = 'pending' and ((coach_id = me and client_id = p_user) or (coach_id = p_user and client_id = me));
end $$;
revoke all on function public.block_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated;

create or replace function public.unblock_user(p_user uuid)
returns void language sql security definer set search_path = public as $$
  delete from user_blocks where blocker = auth.uid() and blocked = p_user;
$$;
revoke all on function public.unblock_user(uuid) from public, anon;
grant execute on function public.unblock_user(uuid) to authenticated;

create or replace function public.my_blocks()
returns table (user_id uuid, username text, full_name text, avatar_url text, blocked_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.full_name, p.avatar_url, b.created_at
  from user_blocks b join profiles p on p.id = b.blocked
  where b.blocker = auth.uid()
  order by b.created_at desc;
$$;
revoke all on function public.my_blocks() from public, anon;
grant execute on function public.my_blocks() to authenticated;

-- ---------- الإبلاغ ----------
create or replace function public.report_content(p_type text, p_id uuid, p_reason text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_owner uuid; v_snap jsonb; v_n integer; v_new boolean; v_hidden boolean := false;
  v_what_ar text := case p_type when 'post' then 'منشور' when 'message' then 'رسالة' when 'user' then 'حساب' else 'تعليق' end;
  v_what_en text := case p_type when 'post' then 'post' when 'message' then 'message' when 'user' then 'account' else 'comment' end;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if p_reason is null or p_reason not in ('spam','harassment','hate','sexual','violence','self_harm','other') then raise exception 'bad_status'; end if;
  if (select count(*) from content_reports where reporter = me and created_at > now() - interval '1 day') >= 30 then
    raise exception 'rate_limited';
  end if;

  -- تقدر تبلّغ بس عن شي تشوفه (ونحفظ نسخة منه وقت البلاغ)
  if p_type = 'post' then
    select po.user_id, jsonb_build_object('caption', left(po.caption, 1000), 'image_path', po.image_path, 'kind', po.kind)
      into v_owner, v_snap from posts po where po.id = p_id and can_see_post(po.user_id, po.visibility);
  elsif p_type = 'comment' then
    select c.user_id, jsonb_build_object('body', c.body, 'post_id', c.post_id)
      into v_owner, v_snap from comments c join posts po on po.id = c.post_id
     where c.id = p_id and can_see_post(po.user_id, po.visibility);
  elsif p_type = 'checkin_comment' then
    select c.user_id, jsonb_build_object('body', c.body, 'check_in_id', c.check_in_id)
      into v_owner, v_snap from checkin_comments c where c.id = p_id and can_see_checkin(c.check_in_id);
  elsif p_type = 'message' then
    select m.sender, jsonb_build_object('body', left(m.body, 1000), 'media_path', m.media_path, 'media_type', m.media_type, 'sent_at', m.created_at)
      into v_owner, v_snap from messages m where m.id = p_id and m.recipient = me;
  elsif p_type = 'user' then
    select pr.id, jsonb_build_object('username', pr.username, 'full_name', pr.full_name, 'bio', left(pr.bio, 300), 'avatar_url', pr.avatar_url)
      into v_owner, v_snap from profiles pr where pr.id = p_id;
  else
    raise exception 'bad_status';
  end if;
  if v_owner is null then raise exception 'target_not_found'; end if;
  if v_owner = me then raise exception 'not_allowed'; end if;

  insert into content_reports (reporter, target_type, target_id, target_user, reason, note, snapshot)
  values (me, p_type, p_id, v_owner, p_reason, nullif(left(btrim(coalesce(p_note, '')), 500), ''), coalesce(v_snap, '{}'::jsonb))
  on conflict (reporter, target_type, target_id)
    do update set reason = excluded.reason, note = coalesce(excluded.note, content_reports.note)
  returning (xmax = 0) into v_new;

  -- ٣ بلاغات مفتوحة من ناس مختلفين ← يختفي لين يراجعه المشرف
  select count(distinct reporter) into v_n from content_reports
   where target_type = p_type and target_id = p_id and status = 'open';
  if v_n >= 3 then
    if p_type = 'post' then
      update posts set hidden_at = now(), hidden_reason = 'reports' where id = p_id and hidden_at is null;
      v_hidden := found;
    elsif p_type = 'comment' then
      update comments set hidden_at = now(), hidden_reason = 'reports' where id = p_id and hidden_at is null;
      v_hidden := found;
    elsif p_type = 'checkin_comment' then
      update checkin_comments set hidden_at = now(), hidden_reason = 'reports' where id = p_id and hidden_at is null;
      v_hidden := found;
    end if;
    if v_hidden then
      perform _notice(v_owner, 'hide:' || p_id, 'انخفى ' || v_what_ar || ' لك مؤقتاً',
        'وصلتنا بلاغات عنه، وبيبقى مخفي لين نراجعه.',
        'Your ' || v_what_en || ' is hidden for now', 'It was reported, and it stays hidden until we review it.',
        '/policy/community', p_id);
    end if;
  end if;

  -- أول بلاغ على هالمحتوى يوصل للمشرفين (الرد بسرعة من شروط App Store)
  if v_new and v_n = 1 then
    perform _notify_admins('rep:' || p_type || ':' || p_id, 'بلاغ جديد في المجتمع',
      'بلاغ عن ' || v_what_ar || ' لـ ' || coalesce(_person_label(v_owner), '') || '. راجعه من لوحة إدارة التطبيق ← بلاغات المجتمع.',
      'New community report', 'A ' || v_what_en || ' by ' || coalesce(_person_label(v_owner), '') || ' was reported. Review it in App management → Community reports.',
      p_id);
  end if;
  return jsonb_build_object('ok', true, 'hidden', v_hidden);
end $$;
revoke all on function public.report_content(text, uuid, text, text) from public, anon;
grant execute on function public.report_content(text, uuid, text, text) to authenticated;

-- ---------- إرشادات المجتمع ----------
create or replace function public.accept_guidelines()
returns timestamptz language sql volatile security definer set search_path = public as $$
  update profiles set guidelines_at = now() where id = auth.uid() returning guidelines_at;
$$;
revoke all on function public.accept_guidelines() from public, anon;
grant execute on function public.accept_guidelines() to authenticated;

-- حالتي: موقوف لين متى (أو null)
create or replace function public.my_suspension()
returns timestamptz language sql stable security definer set search_path = public as $$
  select until from suspensions where user_id = auth.uid() and until > now();
$$;
revoke all on function public.my_suspension() from public, anon;
grant execute on function public.my_suspension() to authenticated;

-- ---------- المراجعة (المشرف) ----------
-- كل محتوى عليه بلاغات (مجمّع)، والصور اللي ما انفحصت من أكثر من ربع ساعة (لو تعطل الفحص)
create or replace function public.admin_safety_queue(p_status text default 'open', p_limit integer default 50)
returns table (target_type text, target_id uuid, target_user uuid, username text, full_name text, avatar_url text,
               reports bigint, reasons text[], notes text[], snapshot jsonb, first_at timestamptz, last_at timestamptz,
               hidden boolean, screen text, suspended_until timestamptz, status text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  return query
  with g as (
    select r.target_type as tt, r.target_id as tid, max(r.target_user::text)::uuid as tu, count(*) as n,
           array_agg(distinct r.reason) as rs,
           array_remove(array_agg(r.note order by r.created_at desc), null) as ns,
           (array_agg(r.snapshot order by r.created_at desc))[1] as snap,
           min(r.created_at) as f_at, max(r.created_at) as l_at,
           case when bool_or(r.status = 'open') then 'open' else max(r.status) end as st
    from content_reports r
    where p_status = 'all' or r.status = p_status
    group by r.target_type, r.target_id
  ),
  unscreened as (
    select 'post'::text as tt, po.id as tid, po.user_id as tu, 0::bigint as n, array['unscreened']::text[] as rs, array[]::text[] as ns,
           jsonb_build_object('caption', po.caption, 'image_path', po.image_path, 'kind', po.kind) as snap,
           po.created_at as f_at, po.created_at as l_at, 'open'::text as st
    from posts po
    where p_status in ('open', 'all') and po.screen = 'pending' and po.created_at < now() - interval '15 minutes'
      and not exists (select 1 from g where g.tt = 'post' and g.tid = po.id)
  ),
  a as (select * from g union all select * from unscreened)
  select a.tt, a.tid, a.tu, pr.username, pr.full_name, pr.avatar_url, a.n, a.rs, a.ns, a.snap, a.f_at, a.l_at,
         case a.tt when 'post' then (select po.hidden_at is not null from posts po where po.id = a.tid)
                   when 'comment' then (select c.hidden_at is not null from comments c where c.id = a.tid)
                   when 'checkin_comment' then (select c.hidden_at is not null from checkin_comments c where c.id = a.tid)
                   else null end,
         case when a.tt = 'post' then (select po.screen from posts po where po.id = a.tid) end,
         (select s.until from suspensions s where s.user_id = a.tu and s.until > now()),
         a.st
  from a left join profiles pr on pr.id = a.tu
  order by (a.st = 'open') desc, a.l_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;
revoke all on function public.admin_safety_queue(text, integer) from public, anon;
grant execute on function public.admin_safety_queue(text, integer) to authenticated;

create or replace function public.admin_safety_counts()
returns table (open_targets bigint, unscreened bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  return query select
    (select count(*) from (select distinct target_type, target_id from content_reports where status = 'open') x),
    (select count(*) from posts where screen = 'pending' and created_at < now() - interval '15 minutes');
end $$;
revoke all on function public.admin_safety_counts() from public, anon;
grant execute on function public.admin_safety_counts() to authenticated;

-- إجراء المشرف: hide (إخفاء) · restore (إرجاع) · approve (صورة سليمة) · suspend (إيقاف أيام) · unsuspend · dismiss (رفض البلاغ)
create or replace function public.admin_safety_act(p_type text, p_id uuid, p_action text, p_days integer default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_what_ar text := case p_type when 'post' then 'منشور' when 'message' then 'رسالة' when 'user' then 'حساب' else 'تعليق' end;
  v_what_en text := case p_type when 'post' then 'post' when 'message' then 'message' when 'user' then 'account' else 'comment' end;
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  if p_action is null or p_action not in ('hide','restore','approve','suspend','unsuspend','dismiss') then raise exception 'bad_status'; end if;
  if p_type is null or p_type not in ('post','comment','checkin_comment','message','user') then raise exception 'bad_status'; end if;
  v_owner := case p_type
    when 'post' then (select user_id from posts where id = p_id)
    when 'comment' then (select user_id from comments where id = p_id)
    when 'checkin_comment' then (select user_id from checkin_comments where id = p_id)
    when 'message' then (select sender from messages where id = p_id)
    when 'user' then (select id from profiles where id = p_id)
  end;
  v_owner := coalesce(v_owner, (select target_user from content_reports where target_type = p_type and target_id = p_id and target_user is not null limit 1));

  if p_action = 'hide' then
    if p_type = 'post' then update posts set hidden_at = coalesce(hidden_at, now()), hidden_reason = 'admin' where id = p_id;
    elsif p_type = 'comment' then update comments set hidden_at = coalesce(hidden_at, now()), hidden_reason = 'admin' where id = p_id;
    elsif p_type = 'checkin_comment' then update checkin_comments set hidden_at = coalesce(hidden_at, now()), hidden_reason = 'admin' where id = p_id;
    else raise exception 'bad_status';
    end if;
    perform _notice(v_owner, 'removed:' || p_id, 'انشال ' || v_what_ar || ' لك',
      'انشال لأنه يخالف إرشادات المجتمع.', 'Your ' || v_what_en || ' was removed',
      'It was removed because it breaks the community guidelines.', '/policy/community', p_id);
  elsif p_action in ('restore', 'approve') then
    if p_type = 'post' then update posts set hidden_at = null, hidden_reason = null, screen = 'ok' where id = p_id;
    elsif p_type = 'comment' then update comments set hidden_at = null, hidden_reason = null where id = p_id;
    elsif p_type = 'checkin_comment' then update checkin_comments set hidden_at = null, hidden_reason = null where id = p_id;
    end if;
  elsif p_action = 'suspend' then
    if v_owner is null then raise exception 'user_not_found'; end if;
    if p_days is null or p_days not between 1 and 365 then raise exception 'bad_days'; end if;
    insert into suspensions (user_id, until, note, by_admin)
    values (v_owner, now() + make_interval(days => p_days), left(p_note, 300), auth.uid())
    on conflict (user_id) do update set until = excluded.until, note = excluded.note, by_admin = excluded.by_admin, created_at = now();
    perform _notice(v_owner, 'susp:' || v_owner || ':' || floor(extract(epoch from clock_timestamp()))::bigint,
      'انوقف حسابك عن النشر', 'ما تقدر تنشر أو تعلّق أو تراسل لمدة ' || p_days || ' يوم لأنك خالفت إرشادات المجتمع.',
      'Your account is restricted', 'You can''t post, comment or send messages for ' || p_days || ' days because you broke the community guidelines.',
      '/policy/community', null);
  elsif p_action = 'unsuspend' then
    delete from suspensions where user_id = v_owner;
  end if;

  update content_reports
     set status = case when p_action in ('hide', 'suspend') then 'actioned' else 'dismissed' end,
         action = p_action, resolved_by = auth.uid(), resolved_at = now()
   where target_type = p_type and target_id = p_id and status = 'open';
  perform _admin_log('safety', p_type || ':' || p_id, p_action, p_note);
end $$;
revoke all on function public.admin_safety_act(text, uuid, text, integer, text) from public, anon;
grant execute on function public.admin_safety_act(text, uuid, text, integer, text) to authenticated;

-- ---------- حد يومي لفحص الصور ----------
-- كل منشور فيه صورة ينفحص مرة وحدة، فالحد = ٤٠ منشور فيه صورة آخر ٢٤ ساعة لكل مستخدم.
-- (بدون جدول ai_usage: ما نلمس قيود أنواعه اللي يستخدمها وكيل المكتب على الخادم)
create or replace function public.moderation_quota()
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  cap constant int := 40;
  used int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select count(*) into used from posts where user_id = auth.uid() and image_path is not null and created_at > now() - interval '1 day';
  -- المنشور اللي ينفحص الحين محسوب، فالحد يتعدى لما يزيد العدد عنه
  if used > cap then raise exception 'rate_limited'; end if;
  return cap - used;
end $$;
revoke all on function public.moderation_quota() from public, anon;
grant execute on function public.moderation_quota() to authenticated;

-- ---------- الكلمات الممنوعة: بداية (المشرف يزيد ويشيل من لوحة إدارة التطبيق) ----------
-- كلمات كاملة أو عبارات، بعد التوحيد (_norm_text). كلمات تجي بمعنى عادي (مثل «كلب» و«حمار») ما تنمنع إلا مع «يا».
insert into public.moderation_terms (term) values
  ('سكس'), ('سكسي'), ('نيك'), ('انيك'), ('ينيك'), ('نيكه'), ('منيوك'), ('منيوكه'), ('متناك'), ('متناكه'), ('نياك'),
  ('زب'), ('زبي'), ('زبك'), ('كس'), ('كسك'), ('كسمك'), ('كس امك'), ('كس اختك'), ('طيز'), ('طيزك'),
  ('شرموط'), ('شرموطه'), ('شراميط'), ('قحبه'), ('قحاب'), ('عاهره'), ('لوطي'), ('خول'), ('عرص'), ('معرص'), ('ديوث'),
  ('بورن'), ('اباحي'), ('اباحيه'),
  ('يا كلب'), ('ابن الكلب'), ('ابن كلب'), ('يا حمار'), ('يا حيوان'), ('يا خنزير'), ('يا زباله'), ('يا وسخ'),
  ('ولد الحرام'), ('ابن الحرام'), ('يلعن ابوك'), ('يلعن امك'), ('يلعن دينك'), ('الله يلعنك'), ('يا عبد'),
  ('رافضي'), ('روافض'), ('اقتل نفسك'), ('روح انتحر'),
  ('fuck'), ('fucking'), ('fucker'), ('motherfucker'), ('bitch'), ('bitches'), ('slut'), ('whore'), ('cunt'),
  ('pussy'), ('porn'), ('porno'), ('nudes'), ('onlyfans'), ('nigger'), ('nigga'), ('faggot'), ('fag'), ('retard'),
  ('asshole'), ('kys'), ('kill yourself')
on conflict do nothing;
