-- المراسلة للأصدقاء: بعد ما ينقبل طلب الصداقة تنفتح المحادثة على طول
-- قبل: لازم يتابعون بعض (أو مدرب ومتدربه). الحين: أصدقاء، أو يتابعون بعض، أو مدرب ومتدربه.
-- mutual_follow هي شرط المراسلة المستخدم في سياسة الإرسال وصندوق الرسائل والنسخ القديمة من التطبيق.
create or replace function public.mutual_follow(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select a <> b and (
    exists (select 1 from friendships f where f.status = 'accepted'
            and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a)))
    or (exists (select 1 from follows where follower = a and followee = b)
        and exists (select 1 from follows where follower = b and followee = a))
    or exists (select 1 from coach_links l where l.status = 'active'
               and ((l.coach_id = a and l.client_id = b) or (l.coach_id = b and l.client_id = a))));
$$;
revoke all on function public.mutual_follow(uuid, uuid) from public, anon;
grant execute on function public.mutual_follow(uuid, uuid) to authenticated;

-- اللي أقدر أراسلهم، مع نوع العلاقة: friend (صديق) أو mutual (تتابعون بعض) أو coach (مدرب/متدرب)
create or replace function public.message_contacts()
returns table (id uuid, username text, full_name text, avatar_url text, points integer, is_coach boolean, relation text)
language sql stable security definer set search_path = public as $$
  with c as (
    select case when f.requester = auth.uid() then f.addressee else f.requester end as id, 'friend'::text as relation, 1 as rank
    from friendships f where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee)
    union all
    select a.followee, 'mutual', 2
    from follows a join follows b on b.follower = a.followee and b.followee = a.follower
    where a.follower = auth.uid()
    union all
    select case when l.coach_id = auth.uid() then l.client_id else l.coach_id end, 'coach', 3
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

-- النسخ القديمة من التطبيق تقرأ هذي: نفس القائمة بدون نوع العلاقة
create or replace function public.mutual_followers()
returns table (id uuid, username text, full_name text, avatar_url text, points integer, is_coach boolean)
language sql stable security definer set search_path = public as $$
  select m.id, m.username, m.full_name, m.avatar_url, m.points, m.is_coach from message_contacts() m;
$$;
revoke all on function public.mutual_followers() from public, anon;
grant execute on function public.mutual_followers() to authenticated;
