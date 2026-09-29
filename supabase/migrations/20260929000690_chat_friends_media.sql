-- =====================================================================
-- الرسائل: للأصدقاء بس + إرسال الصور
--   * المحادثة تنفتح بعد ما يقبل الطرف الثاني طلب الصداقة (والمدرب مع متدربه).
--     المتابعة صارت متابعة بس: ما تفتح محادثة. المحادثات القديمة تبقى مقروءة.
--   * الصور: حاوية خاصة chat، المسار <المرسل>/<المستلم>/<ملف>، يشوفها الطرفين بس
--   * رسالة الصورة نصها اختياري؛ الصندوق والإشعار يكتبون «📷 صورة»
-- =====================================================================

-- ---------- شرط المراسلة ----------
-- الاسم باقي mutual_follow لأنه مستخدم في سياسة الإرسال وصندوق الرسائل والنسخ القديمة من التطبيق
create or replace function public.mutual_follow(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select a <> b and (
    exists (select 1 from friendships f where f.status = 'accepted'
            and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a)))
    or exists (select 1 from coach_links l where l.status = 'active'
               and ((l.coach_id = a and l.client_id = b) or (l.coach_id = b and l.client_id = a))));
$$;
revoke all on function public.mutual_follow(uuid, uuid) from public, anon;
grant execute on function public.mutual_follow(uuid, uuid) to authenticated;

-- قائمة «رسالة جديدة»: الأصدقاء والمدرب/المتدرب بس
create or replace function public.message_contacts()
returns table (id uuid, username text, full_name text, avatar_url text, points integer, is_coach boolean, relation text)
language sql stable security definer set search_path = public as $$
  with c as (
    select case when f.requester = auth.uid() then f.addressee else f.requester end as id, 'friend'::text as relation, 1 as rank
    from friendships f where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee)
    union all
    select case when l.coach_id = auth.uid() then l.client_id else l.coach_id end, 'coach', 2
    from coach_links l where l.status = 'active' and auth.uid() in (l.coach_id, l.client_id)
  ), best as (
    select distinct on (c.id) c.id, c.relation from c where c.id <> auth.uid() order by c.id, c.rank
  )
  select p.id, p.username, p.full_name, p.avatar_url, p.points, p.is_coach, b.relation
  from best b join profiles p on p.id = b.id
  order by p.full_name nulls last, p.username
  limit 500;
$$;
revoke all on function public.message_contacts() from public, anon;
grant execute on function public.message_contacts() to authenticated;

-- ---------- صور الرسائل ----------
alter table public.messages
  add column if not exists media_path text,
  add column if not exists media_type text,
  add column if not exists media_w    integer,
  add column if not exists media_h    integer;
alter table public.messages alter column body set default '';
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages drop constraint if exists messages_body_or_media;
alter table public.messages add constraint messages_body_or_media check (
  char_length(body) <= 1000 and (char_length(btrim(body)) >= 1 or media_path is not null));
alter table public.messages drop constraint if exists messages_media_ok;
alter table public.messages add constraint messages_media_ok check (
  (media_path is null and media_type is null)
  or (media_path is not null and media_type is not null and media_type = 'image'
      and char_length(media_path) between 10 and 300 and media_path !~ '\.\.'
      and coalesce(media_w, 1) between 1 and 20000 and coalesce(media_h, 1) between 1 and 20000));

-- الإرسال: صديق (أو مدرب)، والصورة لازم تكون في مجلد المرسل لهالمستلم
drop policy if exists msg_send on public.messages;
create policy msg_send on public.messages for insert to authenticated
  with check (sender = auth.uid() and mutual_follow(sender, recipient)
              and (media_path is null or media_path like sender::text || '/' || recipient::text || '/%'));

-- المستلم لا يغيّر إلا وقت القراءة (والصورة ما تتغير بعد الإرسال)
create or replace function public._msg_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated','anon') and (new.body is distinct from old.body or new.sender is distinct from old.sender
      or new.recipient is distinct from old.recipient or new.created_at is distinct from old.created_at
      or new.media_path is distinct from old.media_path or new.media_type is distinct from old.media_type
      or new.media_w is distinct from old.media_w or new.media_h is distinct from old.media_h) then
    raise exception 'read_only_message';
  end if;
  return new;
end $$;

-- صندوق الرسائل: رسالة الصورة بدون نص تطلع «📷» (التطبيق يترجمها)
create or replace function public.inbox()
returns table (other_id uuid, username text, full_name text, avatar_url text, points integer, is_coach boolean,
               last_body text, last_at timestamptz, last_from_me boolean, unread bigint, can_message boolean)
language sql stable security definer set search_path = public as $$
  with mine as (
    select case when m.sender = auth.uid() then m.recipient else m.sender end as other, m.*
    from messages m where auth.uid() in (m.sender, m.recipient)
  ), last as (
    select distinct on (other) other,
           case when btrim(body) = '' and media_path is not null then '📷' else body end as body,
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

-- إشعار الجوال: الصورة تطلع «📷 صورة» بلغة المستلم
create or replace function public._on_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prev text := left(btrim(new.body), 120);
begin
  if v_prev = '' and new.media_path is not null then
    v_prev := case when (select locale from profiles where id = new.recipient) = 'en' then '📷 Photo' else '📷 صورة' end;
  end if;
  perform _push(new.recipient, 'message', new.sender, jsonb_build_object('preview', v_prev), '/chat/' || new.sender);
  return null;
end $$;
revoke all on function public._on_message() from public, anon, authenticated;

-- ---------- حاوية الصور (خاصة) ----------
create or replace function public._try_uuid(p text)
returns uuid language sql immutable as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end;
$$;

insert into storage.buckets (id, name, public) values ('chat', 'chat', false) on conflict (id) do nothing;
do $$
begin
  update storage.buckets set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif']
  where id = 'chat';
exception when undefined_column then null;  -- بيئة الاختبار
end $$;

-- الرفع: في مجلدك، ولصديق (أو مدرب) بس
drop policy if exists "chat upload to friend" on storage.objects;
create policy "chat upload to friend" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat' and (storage.foldername(name))[1] = auth.uid()::text
              and coalesce(mutual_follow(auth.uid(), _try_uuid((storage.foldername(name))[2])), false));
-- العرض: المرسل والمستلم بس
drop policy if exists "chat read both sides" on storage.objects;
create policy "chat read both sides" on storage.objects for select to authenticated
  using (bucket_id = 'chat' and auth.uid()::text in ((storage.foldername(name))[1], (storage.foldername(name))[2]));
-- الحذف: صاحب الصورة
drop policy if exists "chat delete own" on storage.objects;
create policy "chat delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'chat' and (storage.foldername(name))[1] = auth.uid()::text);

-- حذف حساب من الإدارة يشمل صور الرسائل
drop policy if exists "admin list files of deleted user" on storage.objects;
create policy "admin list files of deleted user" on storage.objects for select to authenticated
  using (bucket_id in ('avatars', 'posts', 'body', 'inbody', 'feedback', 'chat') and _admin_deleting((storage.foldername(name))[1]));
drop policy if exists "admin delete files of deleted user" on storage.objects;
create policy "admin delete files of deleted user" on storage.objects for delete to authenticated
  using (bucket_id in ('avatars', 'posts', 'body', 'inbody', 'feedback', 'chat') and _admin_deleting((storage.foldername(name))[1]));
