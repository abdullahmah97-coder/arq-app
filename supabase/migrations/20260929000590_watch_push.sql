-- إشعارات أوضح على الجوال والساعة:
-- • threadId يجمّع الإشعارات: كل محادثة لحالها، وباقي الأنواع حسب فئتها (عروض، نشاط…)
-- • categoryId 'message' يضيف زر «رد» (يشتغل من الساعة بالإملاء أو الردود الجاهزة)
-- • الإعجابات «هادئة» (passive): توصل للقائمة بدون ما تهز الساعة أو تشغّل الشاشة
-- الإضافات لكل نوع (دالة بحتة عشان تتختبر)
create or replace function public._push_extras(p_kind text, p_actor uuid)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object('threadId',
           case when p_kind = 'message' and p_actor is not null then 'chat-' || p_actor::text else _notif_category(p_kind) end)
      || case when p_kind = 'message' then jsonb_build_object('categoryId', 'message') else '{}'::jsonb end
      || case when p_kind in ('post_like','checkin_like') then jsonb_build_object('interruptionLevel', 'passive') else '{}'::jsonb end;
$$;
revoke all on function public._push_extras(text, uuid) from public, anon, authenticated;

create or replace function public._push(p_user uuid, p_kind text, p_actor uuid, p_data jsonb, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_loc text; v_prefs jsonb; v_badge integer; v_txt text[]; v_msgs jsonb; v_extra jsonb;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return; end if;
  if not exists (select 1 from push_tokens where user_id = p_user) then return; end if;
  select locale, notify_prefs into v_loc, v_prefs from profiles where id = p_user;
  if not found or coalesce((v_prefs->>_notif_category(p_kind))::boolean, true) = false then return; end if;

  v_txt := _notif_text(p_kind, _display_name(p_actor), p_data, v_loc);
  v_badge := (select count(*) from notifications where user_id = p_user and read_at is null)
           + (select count(*) from messages where recipient = p_user and read_at is null);
  v_extra := _push_extras(p_kind, p_actor);
  select jsonb_agg(jsonb_build_object(
           'to', t.token, 'title', left(v_txt[1], 120), 'body', left(v_txt[2], 240),
           'data', jsonb_build_object('url', p_url, 'kind', p_kind),
           'sound', 'default', 'badge', v_badge, 'channelId', 'default', 'priority', 'high') || v_extra)
    into v_msgs from push_tokens t where t.user_id = p_user;
  if v_msgs is null then return; end if;

  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 8000)'
    using 'https://exp.host/--/api/v2/push/send', v_msgs,
          '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb;
exception when others then
  -- الإشعار للجوال إضافة: ما نوقف العملية الأصلية (إعجاب، رسالة…) لو فشل
  raise warning 'push failed: %', sqlerrm;
end $$;

