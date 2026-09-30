-- =====================================================================
-- المحادثات مثل الواتساب: تعديل الرسالة، حذفها (لي أو للجميع)، وحذف المحادثة من صندوقي
--   * التعديل: المرسل بس، خلال ١٥ دقيقة من الإرسال، والرسالة ما تكون محذوفة. تطلع عليها «معدّلة».
--   * الحذف للجميع: المرسل بس، خلال يومين. النص والصورة ينشالون من القاعدة وتبقى «🚫 انحذفت هذي الرسالة».
--     ملف الصورة/الفيديو يشيله التطبيق من الحاوية (الدالة ترجع مساره).
--   * الحذف لي: أي طرف، تختفي عنده بس (والطرف الثاني تبقى عنده).
--   * حذف المحادثة: تختفي من صندوقي ورسائلها تنمسح عندي بس. لو وصلت رسالة جديدة ترجع المحادثة بالجديد بس.
--   * الإخفاء في سياسة القراءة نفسها (RLS): المحادثة والرسائل الحيّة وعدّاد غير المقروء كلها تحترمه.
-- =====================================================================

alter table public.messages
  add column if not exists edited_at  timestamptz,
  add column if not exists deleted_at timestamptz;

-- الرسالة المحذوفة للجميع ما يبقى فيها نص ولا ملف
alter table public.messages drop constraint if exists messages_body_or_media;
alter table public.messages add constraint messages_body_or_media check (
  char_length(body) <= 1000 and (deleted_at is not null or char_length(btrim(body)) >= 1 or media_path is not null));
alter table public.messages drop constraint if exists messages_deleted_empty;
alter table public.messages add constraint messages_deleted_empty check (
  deleted_at is null or (body = '' and media_path is null and media_type is null and media_dur is null));

-- ---------- الحذف لي ----------
create table if not exists public.message_hides (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
alter table public.message_hides enable row level security;
drop policy if exists message_hides_own on public.message_hides;
create policy message_hides_own on public.message_hides for select to authenticated using (user_id = auth.uid());

-- ---------- حذف المحادثة (لي) ----------
create table if not exists public.chat_clears (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  other_id   uuid not null references public.profiles(id) on delete cascade,
  cleared_at timestamptz not null default now(),
  primary key (user_id, other_id),
  check (user_id <> other_id)
);
alter table public.chat_clears enable row level security;
drop policy if exists chat_clears_own on public.chat_clears;
create policy chat_clears_own on public.chat_clears for select to authenticated using (user_id = auth.uid());

-- هل الرسالة ظاهرة لهالمستخدم؟ (طرف فيها، وما أخفاها، وبعد آخر حذف للمحادثة عنده)
create or replace function public._msg_visible(p_user uuid, p_id uuid, p_sender uuid, p_recipient uuid, p_at timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null and p_user in (p_sender, p_recipient)
     and not exists (select 1 from message_hides h where h.user_id = p_user and h.message_id = p_id)
     and not exists (select 1 from chat_clears c
                     where c.user_id = p_user
                       and c.other_id = case when p_sender = p_user then p_recipient else p_sender end
                       and p_at <= c.cleared_at);
$$;
revoke all on function public._msg_visible(uuid, uuid, uuid, uuid, timestamptz) from public, anon;
grant execute on function public._msg_visible(uuid, uuid, uuid, uuid, timestamptz) to authenticated;

drop policy if exists msg_read on public.messages;
create policy msg_read on public.messages for select to authenticated
  using (_msg_visible(auth.uid(), id, sender, recipient, created_at));

-- الإرسال: نفس الشروط، والرسالة الجديدة ما تنرسل «معدّلة» أو «محذوفة»
drop policy if exists msg_send on public.messages;
create policy msg_send on public.messages for insert to authenticated
  with check (sender = auth.uid() and mutual_follow(sender, recipient)
              and edited_at is null and deleted_at is null
              and (media_path is null or media_path like sender::text || '/' || recipient::text || '/%'));

-- الحذف للجميع من الدالة بس (نافذة اليومين، وتبقى «انحذفت هذي الرسالة»، ويتشال الملف) بدل الحذف المباشر القديم
drop policy if exists msg_delete_own on public.messages;

-- المستلم لا يغيّر إلا وقت القراءة. التعديل والحذف من الدوال تحت بس
create or replace function public._msg_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated','anon') and (new.body is distinct from old.body or new.sender is distinct from old.sender
      or new.recipient is distinct from old.recipient or new.created_at is distinct from old.created_at
      or new.media_path is distinct from old.media_path or new.media_type is distinct from old.media_type
      or new.media_w is distinct from old.media_w or new.media_h is distinct from old.media_h
      or new.media_dur is distinct from old.media_dur
      or new.edited_at is distinct from old.edited_at or new.deleted_at is distinct from old.deleted_at) then
    raise exception 'read_only_message';
  end if;
  return new;
end $$;

-- ---------- تعديل رسالة (المرسل، خلال ١٥ دقيقة) ----------
create or replace function public.edit_message(p_id uuid, p_body text)
returns public.messages language plpgsql security definer set search_path = public as $$
declare v messages; v_body text := btrim(coalesce(p_body, ''));
begin
  select * into v from messages where id = p_id for update;
  if not found or auth.uid() is null or v.sender <> auth.uid() then raise exception 'not_allowed'; end if;
  if v.deleted_at is not null then raise exception 'message_deleted'; end if;
  if v.created_at < now() - interval '15 minutes' then raise exception 'edit_window_passed'; end if;
  if char_length(v_body) > 1000 then raise exception 'message_too_long'; end if;
  if v_body = '' and v.media_path is null then raise exception 'empty_message'; end if;
  if v_body = v.body then return v; end if;
  update messages set body = v_body, edited_at = now() where id = p_id returning * into v;
  return v;
end $$;
revoke all on function public.edit_message(uuid, text) from public, anon;
grant execute on function public.edit_message(uuid, text) to authenticated;

-- ---------- حذف رسالة: لي، أو للجميع (المرسل، خلال يومين) ----------
-- ترجع مسار الملف لو انحذفت للجميع وكان فيها صورة/فيديو (التطبيق يشيله من الحاوية)
create or replace function public.delete_message(p_id uuid, p_everyone boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare v messages;
begin
  select * into v from messages where id = p_id for update;
  if not found or auth.uid() is null or auth.uid() not in (v.sender, v.recipient) then raise exception 'not_allowed'; end if;
  if coalesce(p_everyone, false) then
    if v.sender <> auth.uid() then raise exception 'not_allowed'; end if;
    if v.deleted_at is not null then return null; end if;
    if v.created_at < now() - interval '2 days' then raise exception 'delete_window_passed'; end if;
    update messages set body = '', media_path = null, media_type = null, media_w = null, media_h = null, media_dur = null,
                        edited_at = null, deleted_at = now()
     where id = p_id;
    return v.media_path;
  end if;
  insert into message_hides (user_id, message_id) values (auth.uid(), p_id) on conflict do nothing;
  -- اللي انحذفت عندك ما تبقى «غير مقروءة» (العدّاد ورقم الأيقونة)
  if v.recipient = auth.uid() and v.read_at is null then update messages set read_at = now() where id = p_id; end if;
  return null;
end $$;
revoke all on function public.delete_message(uuid, boolean) from public, anon;
grant execute on function public.delete_message(uuid, boolean) to authenticated;

-- ---------- حذف المحادثة من عندي ----------
create or replace function public.clear_chat(p_other uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_other is null or p_other = auth.uid() then raise exception 'not_allowed'; end if;
  insert into chat_clears (user_id, other_id, cleared_at) values (auth.uid(), p_other, now())
  on conflict (user_id, other_id) do update set cleared_at = excluded.cleared_at;
  update messages set read_at = now() where recipient = auth.uid() and sender = p_other and read_at is null;
  -- الإخفاءات القديمة ما لها داعي بعد المسح
  delete from message_hides h using messages m
   where h.user_id = auth.uid() and h.message_id = m.id
     and ((m.sender = auth.uid() and m.recipient = p_other) or (m.sender = p_other and m.recipient = auth.uid()));
end $$;
revoke all on function public.clear_chat(uuid) from public, anon;
grant execute on function public.clear_chat(uuid) to authenticated;

-- ---------- صندوق الرسائل ----------
-- يتجاهل المخفي والممسوح عندي، و«🚫» للمحذوفة للجميع، ومعه حالة آخر رسالة (مقروءة؟ نوعها)
-- (أعمدة زيادة في الآخر: النسخ القديمة من التطبيق تقرأ الأعمدة اللي تعرفها بس)
drop function if exists public.inbox();
create function public.inbox()
returns table (other_id uuid, username text, full_name text, avatar_url text, points integer, is_coach boolean,
               last_body text, last_at timestamptz, last_from_me boolean, unread bigint, can_message boolean,
               last_read boolean, last_deleted boolean, last_type text)
language sql stable security definer set search_path = public as $$
  with vis as (
    select case when m.sender = auth.uid() then m.recipient else m.sender end as other, m.*
    from messages m
    where auth.uid() in (m.sender, m.recipient)
      and _msg_visible(auth.uid(), m.id, m.sender, m.recipient, m.created_at)
  ), last as (
    select distinct on (other) other,
           case when deleted_at is not null then '🚫'
                when btrim(body) = '' and media_path is not null
                then case when media_type = 'video' then '🎥' else '📷' end
                else body end as body,
           created_at, sender = auth.uid() as from_me, read_at is not null as is_read,
           deleted_at is not null as is_deleted, coalesce(media_type, 'text') as mtype
    from vis order by other, created_at desc
  )
  select p.id, p.username, p.full_name, p.avatar_url, p.points, p.is_coach, l.body, l.created_at, l.from_me,
         (select count(*) from vis u where u.other = p.id and u.sender = p.id and u.read_at is null),
         mutual_follow(auth.uid(), p.id), l.is_read, l.is_deleted, l.mtype
  from last l join profiles p on p.id = l.other
  order by l.created_at desc
  limit 100;
$$;
revoke all on function public.inbox() from public, anon;
grant execute on function public.inbox() to authenticated;
