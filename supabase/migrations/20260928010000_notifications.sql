-- =====================================================================
-- التنبيهات
--   * notifications: سجل التنبيهات داخل التطبيق (الجرس) — كل مستخدم يشوف تنبيهاته فقط
--   * push_tokens: أجهزة المستخدم لإرسال إشعارات الجوال (Expo Push)
--   * notify_prefs في الملف الشخصي: أي أنواع توصل للجوال
--   * التنبيهات تنكتب من الخادم فقط (مشغّلات)، والإرسال للجوال عبر pg_net إلى خدمة Expo
-- =====================================================================

-- pg_net يرسل طلبات HTTP من قاعدة البيانات (موجود في Supabase). لو ما توفر (بيئة الاختبار) نكمل بدون إشعارات جوال.
do $$ begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net not available: phone push disabled';
end $$;

alter table public.profiles
  add column if not exists notify_prefs jsonb not null
    default '{"messages":true,"social":true,"activity":true,"progress":true,"offers":true}'::jsonb
    check (jsonb_typeof(notify_prefs) = 'object' and pg_column_size(notify_prefs) < 1000);
grant update (notify_prefs) on public.profiles to authenticated;

create table public.notifications (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete cascade,
  kind        text not null check (kind in (
                'follow','friend_request','friend_accept',
                'post_like','post_comment','checkin_like','checkin_comment','friend_here',
                'challenge_invite','challenge_win','rank_up','program_adopt','gym_offer')),
  target_id   uuid,
  data        jsonb not null default '{}'::jsonb check (pg_column_size(data) < 2000),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index notifications_user_time on public.notifications (user_id, id desc);
create index notifications_unread on public.notifications (user_id) where read_at is null;
-- نفس الشخص ما يطلع له نفس التنبيه مرتين (إعجاب/إلغاء/إعجاب، متابعة/إلغاء/متابعة…)
create unique index notifications_once on public.notifications (user_id, kind, actor_id, target_id) nulls not distinct
  where kind in ('follow','friend_request','post_like','checkin_like','friend_here','challenge_invite','program_adopt','gym_offer','rank_up');

alter table public.notifications enable row level security;
create policy notif_read   on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

create table public.push_tokens (
  token       text primary key check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,80}\]$'),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  platform    text not null check (platform in ('ios','android')),
  updated_at  timestamptz not null default now()
);
create index push_tokens_user on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
create policy ptok_read   on public.push_tokens for select to authenticated using (user_id = auth.uid());
create policy ptok_delete on public.push_tokens for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- تسجيل الجهاز (لو نفس الجهاز سجّل فيه حساب ثاني، ينتقل له)
-- ---------------------------------------------------------------------
create or replace function public.register_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  insert into push_tokens (token, user_id, platform, updated_at) values (p_token, auth.uid(), p_platform, now())
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
  -- حد أقصى ١٠ أجهزة لكل مستخدم (نحذف الأقدم)
  delete from push_tokens where user_id = auth.uid() and token in (
    select token from push_tokens where user_id = auth.uid() order by updated_at desc offset 10);
end $$;

create or replace function public.unregister_push_token(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from push_tokens where token = p_token and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- القراءة
-- ---------------------------------------------------------------------
create or replace function public.my_notifications(p_before bigint default null, p_limit integer default 40)
returns table (id bigint, kind text, target_id uuid, data jsonb, created_at timestamptz, read_at timestamptz,
               actor_id uuid, username text, full_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select n.id, n.kind, n.target_id, n.data, n.created_at, n.read_at, n.actor_id, p.username, p.full_name, p.avatar_url
  from notifications n left join profiles p on p.id = n.actor_id
  where n.user_id = auth.uid() and (p_before is null or n.id < p_before)
  order by n.id desc limit least(greatest(p_limit, 1), 100);
$$;

create or replace function public.mark_notifications_read(p_upto bigint default null)
returns void language sql security definer set search_path = public as $$
  update notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_upto is null or id <= p_upto);
$$;

-- ---------------------------------------------------------------------
-- نصوص إشعار الجوال (بلغة المستلم)
-- ---------------------------------------------------------------------
create or replace function public._rank_name(p_level integer, p_loc text)
returns text language sql immutable as $$
  select case when p_loc = 'en'
    then (array['Beginner','Committed','Advanced','Pro','Elite'])[p_level + 1]
    else (array['مبتدئ','ملتزم','متقدم','محترف','نخبة'])[p_level + 1] end;
$$;

create or replace function public._notif_text(p_kind text, p_name text, p_data jsonb, p_loc text)
returns text[] language plpgsql immutable as $$
declare
  en boolean := p_loc = 'en';
  n text := coalesce(p_name, case when en then 'Someone' else 'أحد' end);
  pv text := coalesce(p_data->>'preview', '');
  ti text := coalesce(p_data->>'title', '');
  gy text := coalesce(p_data->>'gym', '');
begin
  return case p_kind
    when 'message'          then array[n, pv]
    when 'follow'           then case when (p_data->>'mutual')::boolean
                                   then array[case when en then 'You follow each other now' else 'صرتوا تتابعون بعض' end,
                                              case when en then n || ' followed you back — you can message each other' else n || ' تابعك — تقدرون تتراسلون الحين' end]
                                   else array[case when en then 'New follower' else 'متابع جديد' end,
                                              case when en then n || ' started following you' else n || ' بدأ يتابعك' end] end
    when 'friend_request'   then array[case when en then 'Friend request' else 'طلب صداقة' end,
                                       case when en then n || ' wants to be your friend' else n || ' يبي يضيفك صديق' end]
    when 'friend_accept'    then array[case when en then 'You''re friends now' else 'صرتوا أصدقاء' end,
                                       case when en then n || ' accepted your friend request' else n || ' قبل طلب صداقتك' end]
    when 'post_like'        then array[case when en then 'New like' else 'إعجاب جديد' end,
                                       case when en then n || ' liked your post' else n || ' أعجبه منشورك' end]
    when 'post_comment'     then array[case when en then 'New comment' else 'تعليق جديد' end, n || ': ' || pv]
    when 'checkin_like'     then array[case when en then '💪 Props' else '💪 تشجيع' end,
                                       case when en then n || ' liked your gym check-in' else n || ' أعجبه حضورك للنادي' end]
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

create or replace function public._notif_category(p_kind text)
returns text language sql immutable as $$
  select case
    when p_kind = 'message' then 'messages'
    when p_kind in ('follow','friend_request','friend_accept','friend_here') then 'social'
    when p_kind in ('post_like','post_comment','checkin_like','checkin_comment','program_adopt') then 'activity'
    when p_kind in ('challenge_invite','challenge_win','rank_up') then 'progress'
    when p_kind = 'gym_offer' then 'offers'
    else 'activity' end;
$$;

create or replace function public._display_name(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(full_name), ''), username) from profiles where id = p_user;
$$;

-- ---------------------------------------------------------------------
-- إرسال للجوال: رسالة لكل أجهزة المستخدم (لو فعّل النوع)
-- ---------------------------------------------------------------------
create or replace function public._push(p_user uuid, p_kind text, p_actor uuid, p_data jsonb, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_loc text; v_prefs jsonb; v_badge integer; v_txt text[]; v_msgs jsonb;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return; end if;
  if not exists (select 1 from push_tokens where user_id = p_user) then return; end if;
  select locale, notify_prefs into v_loc, v_prefs from profiles where id = p_user;
  if not found or coalesce((v_prefs->>_notif_category(p_kind))::boolean, true) = false then return; end if;

  v_txt := _notif_text(p_kind, _display_name(p_actor), p_data, v_loc);
  v_badge := (select count(*) from notifications where user_id = p_user and read_at is null)
           + (select count(*) from messages where recipient = p_user and read_at is null);
  select jsonb_agg(jsonb_build_object(
           'to', t.token, 'title', left(v_txt[1], 120), 'body', left(v_txt[2], 240),
           'data', jsonb_build_object('url', p_url, 'kind', p_kind),
           'sound', 'default', 'badge', v_badge, 'channelId', 'default', 'priority', 'high'))
    into v_msgs from push_tokens t where t.user_id = p_user;
  if v_msgs is null then return; end if;

  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 8000)'
    using 'https://exp.host/--/api/v2/push/send', v_msgs,
          '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb;
exception when others then
  -- الإشعار للجوال إضافة: ما نوقف العملية الأصلية (إعجاب، رسالة…) لو فشل
  raise warning 'push failed: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- تسجيل تنبيه + إرساله
-- ---------------------------------------------------------------------
create or replace function public._notify(p_user uuid, p_actor uuid, p_kind text, p_target uuid, p_data jsonb, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if p_user is null or p_user = p_actor then return; end if;
  insert into notifications (user_id, actor_id, kind, target_id, data)
  values (p_user, p_actor, p_kind, p_target, coalesce(p_data, '{}'::jsonb))
  on conflict do nothing
  returning id into v_id;
  if v_id is null then return; end if;
  -- نحتفظ بآخر ٢٠٠ تنبيه فقط لكل مستخدم
  delete from notifications where user_id = p_user and id < (
    select id from notifications where user_id = p_user order by id desc offset 199 limit 1);
  perform _push(p_user, p_kind, p_actor, p_data, p_url);
end $$;

-- ---------------------------------------------------------------------
-- المشغّلات
-- ---------------------------------------------------------------------
create or replace function public._on_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform _notify(new.followee, new.follower, 'follow', new.follower,
    jsonb_build_object('mutual', exists (select 1 from follows where follower = new.followee and followee = new.follower)),
    '/user/' || new.follower);
  return null;
end $$;
create trigger notify_follow after insert on public.follows for each row execute function public._on_follow();

create or replace function public._on_friendship()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform _notify(new.addressee, new.requester, 'friend_request', new.id, '{}', '/friends');
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status is distinct from 'accepted' then
    perform _notify(new.requester, new.addressee, 'friend_accept', new.id, '{}', '/user/' || new.addressee);
  end if;
  return null;
end $$;
create trigger notify_friendship after insert or update on public.friendships for each row execute function public._on_friendship();

create or replace function public._on_post_like()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform _notify((select user_id from posts where id = new.post_id), new.user_id, 'post_like', new.post_id, '{}', '/post/' || new.post_id);
  return null;
end $$;
create trigger notify_post_like after insert on public.post_likes for each row execute function public._on_post_like();

create or replace function public._on_post_comment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform _notify((select user_id from posts where id = new.post_id), new.user_id, 'post_comment', new.post_id,
    jsonb_build_object('preview', left(new.body, 80)), '/post/' || new.post_id);
  return null;
end $$;
create trigger notify_post_comment after insert on public.comments for each row execute function public._on_post_comment();

create or replace function public._on_checkin_like()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform _notify((select user_id from check_ins where id = new.check_in_id), new.user_id, 'checkin_like', new.check_in_id, '{}',
    '/checkin/' || new.check_in_id);
  return null;
end $$;
create trigger notify_checkin_like after insert on public.checkin_likes for each row execute function public._on_checkin_like();

create or replace function public._on_checkin_comment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform _notify((select user_id from check_ins where id = new.check_in_id), new.user_id, 'checkin_comment', new.check_in_id,
    jsonb_build_object('preview', left(new.body, 80)), '/checkin/' || new.check_in_id);
  return null;
end $$;
create trigger notify_checkin_comment after insert on public.checkin_comments for each row execute function public._on_checkin_comment();

-- صاحبك وصل نفس النادي اللي أنت فيه الحين (يحترم خيار «إخفاء حضوري»)
create or replace function public._on_check_in()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_gym text;
begin
  if (select presence_visibility from profiles where id = new.user_id) = 'hidden' then return null; end if;
  select coalesce(nullif(name, ''), name_en) into v_gym from gyms where id = new.gym_id;
  for r in
    select distinct c.user_id from check_ins c
    where c.gym_id = new.gym_id and c.user_id <> new.user_id
      and c.checked_out_at is null and c.checked_in_at > now() - interval '6 hours'
      and (are_friends(c.user_id, new.user_id) or mutual_follow(c.user_id, new.user_id))
    limit 30
  loop
    perform _notify(r.user_id, new.user_id, 'friend_here', new.id, jsonb_build_object('gym', v_gym), '/checkin/' || new.id);
  end loop;
  return null;
end $$;
create trigger notify_check_in after insert on public.check_ins for each row execute function public._on_check_in();

create or replace function public._on_challenge_member()
returns trigger language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if new.status <> 'invited' then return null; end if;
  select id, title, creator into c from challenges where id = new.challenge_id;
  perform _notify(new.user_id, coalesce(auth.uid(), c.creator), 'challenge_invite', c.id,
    jsonb_build_object('title', c.title), '/challenge/' || c.id);
  return null;
end $$;
create trigger notify_challenge_invite after insert on public.challenge_members for each row execute function public._on_challenge_member();

create or replace function public._on_points()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.reason = 'challenge_win' then
    perform _notify(new.user_id, null, 'challenge_win', new.ref_id,
      jsonb_build_object('title', (select title from challenges where id = new.ref_id), 'points', new.amount),
      '/challenge/' || new.ref_id);
  end if;
  return null;
end $$;
create trigger notify_points after insert on public.points_ledger for each row execute function public._on_points();

create or replace function public._on_rank_up()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_level integer := rank_level(new.points);
begin
  if v_level > rank_level(old.points) then
    -- target = معرّف ثابت لكل رتبة، عشان ما يتكرر لو نزلت النقاط ورجعت
    perform _notify(new.id, null, 'rank_up', ('00000000-0000-0000-0000-00000000000' || v_level)::uuid,
      jsonb_build_object('level', v_level), '/ranks');
  end if;
  return null;
end $$;
create trigger notify_rank_up after update of points on public.profiles for each row execute function public._on_rank_up();

create or replace function public._on_program_adopt()
returns trigger language plpgsql security definer set search_path = public as $$
declare p record;
begin
  select id, author, title into p from user_programs where id = new.program_id;
  perform _notify(p.author, new.user_id, 'program_adopt', p.id, jsonb_build_object('title', p.title), '/program/' || p.id);
  return null;
end $$;
create trigger notify_program_adopt after insert on public.program_adopts for each row execute function public._on_program_adopt();

-- عرض جديد في ناديك (أو في سلسلة ناديك): لمن ناديه الأساسي منها أو حضر فيها آخر ٦٠ يوم (حد أقصى ٢٠٠٠)
create or replace function public._on_gym_offer()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_gym text; v_data jsonb; v_url text;
begin
  if not new.active or (new.ends_on is not null and new.ends_on < current_date) then return null; end if;
  if new.gym_id is not null then
    select coalesce(nullif(name, ''), name_en) into v_gym from gyms where id = new.gym_id;
    v_url := '/clubs/' || new.gym_id;
  else
    select coalesce(nullif(name, ''), name_en) into v_gym from gym_chains where id = new.chain_id;
    v_url := '/clubs/chain/' || new.chain_id;
  end if;
  v_data := jsonb_build_object('gym', v_gym, 'title', new.title, 'price', trim_scale(new.price_sar)::text,
                               'gym_id', new.gym_id, 'chain_id', new.chain_id);
  for r in
    with branches as (
      select id from gyms where id = new.gym_id or (new.gym_id is null and chain_id = new.chain_id)
    )
    select p.id from profiles p where p.gym_id in (select id from branches)
    union
    select c.user_id from check_ins c
    where c.gym_id in (select id from branches) and c.checked_in_at > now() - interval '60 days'
    limit 2000
  loop
    perform _notify(r.id, null, 'gym_offer', new.id, v_data, v_url);
  end loop;
  return null;
end $$;
create trigger notify_gym_offer after insert on public.gym_offers for each row execute function public._on_gym_offer();

-- الرسائل الخاصة: إشعار جوال فقط (صندوق الرسائل فيه عدّاد غير المقروء أصلاً)
create or replace function public._on_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform _push(new.recipient, 'message', new.sender, jsonb_build_object('preview', left(new.body, 120)), '/chat/' || new.sender);
  return null;
end $$;
create trigger notify_message after insert on public.messages for each row execute function public._on_message();

-- ---------------------------------------------------------------------
-- الصلاحيات
-- ---------------------------------------------------------------------
revoke all on function public._push(uuid, text, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public._notify(uuid, uuid, text, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public._display_name(uuid) from public, anon, authenticated;
revoke all on function public._notif_text(text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public._on_follow() from public, anon, authenticated;
revoke all on function public._on_friendship() from public, anon, authenticated;
revoke all on function public._on_post_like() from public, anon, authenticated;
revoke all on function public._on_post_comment() from public, anon, authenticated;
revoke all on function public._on_checkin_like() from public, anon, authenticated;
revoke all on function public._on_checkin_comment() from public, anon, authenticated;
revoke all on function public._on_check_in() from public, anon, authenticated;
revoke all on function public._on_challenge_member() from public, anon, authenticated;
revoke all on function public._on_points() from public, anon, authenticated;
revoke all on function public._on_rank_up() from public, anon, authenticated;
revoke all on function public._on_program_adopt() from public, anon, authenticated;
revoke all on function public._on_gym_offer() from public, anon, authenticated;
revoke all on function public._on_message() from public, anon, authenticated;
revoke all on function public.register_push_token(text, text) from public, anon;
revoke all on function public.unregister_push_token(text) from public, anon;
revoke all on function public.my_notifications(bigint, integer) from public, anon;
revoke all on function public.mark_notifications_read(bigint) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
grant execute on function public.my_notifications(bigint, integer) to authenticated;
grant execute on function public.mark_notifications_read(bigint) to authenticated;

-- الجرس يتحدّث لحظياً (Realtime يحترم RLS: كل واحد يستقبل تنبيهاته فقط)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
