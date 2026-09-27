-- =====================================================================
-- الرسائل الخاصة: متاحة فقط بين شخصين يتابعون بعض (متابعة متبادلة)
--   * الإرسال مرفوض إذا ما كانت المتابعة من الطرفين (RLS)
--   * المحادثة القديمة تبقى مقروءة لو أحدهم ألغى المتابعة، لكن ما ينرسل جديد
--   * المستلم يعدّل وقت القراءة فقط
-- =====================================================================
create or replace function public.mutual_follow(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select a <> b
     and exists (select 1 from follows where follower = a and followee = b)
     and exists (select 1 from follows where follower = b and followee = a);
$$;
revoke all on function public.mutual_follow(uuid, uuid) from public, anon;
grant execute on function public.mutual_follow(uuid, uuid) to authenticated;

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  sender      uuid not null references public.profiles(id) on delete cascade,
  recipient   uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  check (sender <> recipient)
);
create index on public.messages (sender, recipient, created_at desc);
create index on public.messages (recipient, read_at) where read_at is null;

alter table public.messages enable row level security;
create policy msg_read on public.messages for select to authenticated using (auth.uid() in (sender, recipient));
create policy msg_send on public.messages for insert to authenticated
  with check (sender = auth.uid() and mutual_follow(sender, recipient));
create policy msg_mark_read on public.messages for update to authenticated
  using (recipient = auth.uid()) with check (recipient = auth.uid());
create policy msg_delete_own on public.messages for delete to authenticated using (sender = auth.uid());

-- المستلم لا يغيّر إلا وقت القراءة
create or replace function public._msg_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated','anon') and (new.body is distinct from old.body or new.sender is distinct from old.sender
      or new.recipient is distinct from old.recipient or new.created_at is distinct from old.created_at) then
    raise exception 'read_only_message';
  end if;
  return new;
end $$;
create trigger messages_guard before update on public.messages for each row execute function public._msg_guard();

-- صندوق الرسائل: آخر رسالة مع كل شخص + غير المقروء + هل المراسلة متاحة حالياً
create or replace function public.inbox()
returns table (other_id uuid, username text, full_name text, avatar_url text, points integer, is_coach boolean,
               last_body text, last_at timestamptz, last_from_me boolean, unread bigint, can_message boolean)
language sql stable security definer set search_path = public as $$
  with mine as (
    select case when m.sender = auth.uid() then m.recipient else m.sender end as other, m.*
    from messages m where auth.uid() in (m.sender, m.recipient)
  ), last as (
    select distinct on (other) other, body, created_at, sender = auth.uid() as from_me from mine order by other, created_at desc
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

-- الأشخاص اللي أقدر أراسلهم (متابعة متبادلة)
create or replace function public.mutual_followers()
returns table (id uuid, username text, full_name text, avatar_url text, points integer, is_coach boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.full_name, p.avatar_url, p.points, p.is_coach
  from follows a join follows b on b.follower = a.followee and b.followee = a.follower
  join profiles p on p.id = a.followee
  where a.follower = auth.uid()
  order by p.full_name nulls last, p.username
  limit 300;
$$;
revoke all on function public.mutual_followers() from public, anon;
grant execute on function public.mutual_followers() to authenticated;

-- الرسائل الحيّة (Supabase Realtime) — تحترم RLS فكل واحد يستقبل رسائله فقط
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
