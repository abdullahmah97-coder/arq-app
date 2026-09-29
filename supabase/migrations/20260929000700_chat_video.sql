-- =====================================================================
-- فيديو في الرسائل (نسخة التطبيق اللي فيها مشغّل فيديو)
--   * نوع الوسائط: image أو video، ومدة الفيديو بالثواني (حد ١٠ دقايق للحماية؛ التطبيق يحدّه بدقيقة)
--   * الحاوية chat تقبل mp4/mov وحجم لين ٥٠ ميقا
--   * الصندوق يكتب «🎥» والإشعار «🎥 فيديو»
-- =====================================================================

alter table public.messages add column if not exists media_dur numeric(6,1);

alter table public.messages drop constraint if exists messages_media_ok;
alter table public.messages add constraint messages_media_ok check (
  (media_path is null and media_type is null and media_dur is null)
  or (media_path is not null and media_type is not null and media_type in ('image', 'video')
      and char_length(media_path) between 10 and 300 and media_path !~ '\.\.'
      and coalesce(media_w, 1) between 1 and 20000 and coalesce(media_h, 1) between 1 and 20000
      and (media_dur is null or (media_type = 'video' and media_dur between 0 and 600))));

-- المستلم لا يغيّر إلا وقت القراءة
create or replace function public._msg_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated','anon') and (new.body is distinct from old.body or new.sender is distinct from old.sender
      or new.recipient is distinct from old.recipient or new.created_at is distinct from old.created_at
      or new.media_path is distinct from old.media_path or new.media_type is distinct from old.media_type
      or new.media_w is distinct from old.media_w or new.media_h is distinct from old.media_h
      or new.media_dur is distinct from old.media_dur) then
    raise exception 'read_only_message';
  end if;
  return new;
end $$;

-- صندوق الرسائل: 📷 للصورة و 🎥 للفيديو لو ما معها نص
create or replace function public.inbox()
returns table (other_id uuid, username text, full_name text, avatar_url text, points integer, is_coach boolean,
               last_body text, last_at timestamptz, last_from_me boolean, unread bigint, can_message boolean)
language sql stable security definer set search_path = public as $$
  with mine as (
    select case when m.sender = auth.uid() then m.recipient else m.sender end as other, m.*
    from messages m where auth.uid() in (m.sender, m.recipient)
  ), last as (
    select distinct on (other) other,
           case when btrim(body) = '' and media_path is not null
                then case when media_type = 'video' then '🎥' else '📷' end
                else body end as body,
           created_at, sender = auth.uid() as from_me
    from mine order by other, created_at desc
  )
  select p.id, p.username, p.full_name, p.avatar_url, p.points, p.is_coach, l.body, l.created_at, l.from_me,
         (select count(*) from messages u where u.sender = p.id and u.recipient = auth.uid() and u.read_at is null),
         mutual_follow(auth.uid(), p.id)
  from last l join profiles p on p.id = l.other
  order by l.created_at desc
  limit 100;
$$;
revoke all on function public.inbox() from public, anon;
grant execute on function public.inbox() to authenticated;

-- إشعار الجوال بلغة المستلم
create or replace function public._on_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prev text := left(btrim(new.body), 120); v_en boolean;
begin
  if v_prev = '' and new.media_path is not null then
    v_en := (select locale from profiles where id = new.recipient) = 'en';
    v_prev := case when new.media_type = 'video' then case when v_en then '🎥 Video' else '🎥 فيديو' end
                   else case when v_en then '📷 Photo' else '📷 صورة' end end;
  end if;
  perform _push(new.recipient, 'message', new.sender, jsonb_build_object('preview', v_prev), '/chat/' || new.sender);
  return null;
end $$;
revoke all on function public._on_message() from public, anon, authenticated;

-- الحاوية: فيديو mp4/mov لين ٥٠ ميقا
do $$
begin
  update storage.buckets set file_size_limit = 52428800,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/x-m4v']
  where id = 'chat';
exception when undefined_column then null;  -- بيئة الاختبار
end $$;
