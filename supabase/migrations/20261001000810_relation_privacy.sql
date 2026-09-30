-- =====================================================================
-- خصوصية العلاقات: are_friends(a, b) و mutual_follow(a, b) كانت تنادى مباشرة من التطبيق لأي شخصين،
-- فأي أحد يقدر يعرف مين صديق مين ومين مدرب مين (والجداول نفسها خاصة بأطرافها).
-- الحين: لو انادت مباشرة (rpc) لازم تكون أنت أحد الطرفين (أو المشرف). داخل القاعدة (السياسات والتنبيهات والمهام)
-- ما تغيّر شي. والنسخ الحالية من التطبيق تسأل عن نفسها بس (أنا وهو) فتشتغل زي ما هي.
-- =====================================================================

-- نادى المستخدم الدالة مباشرة من التطبيق؟ (مسار الطلب في PostgREST)
create or replace function public._called_as_rpc(p_name text)
returns boolean language sql stable set search_path = public as $$
  select coalesce(current_setting('request.path', true), '') like '%/rpc/' || p_name;
$$;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (not _called_as_rpc('are_friends') or coalesce(auth.uid() in (a, b), false) or is_admin())
     and exists (
       select 1 from friendships
       where status = 'accepted'
         and ((requester = a and addressee = b) or (requester = b and addressee = a))
     );
$$;

create or replace function public.mutual_follow(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (not _called_as_rpc('mutual_follow') or coalesce(auth.uid() in (a, b), false) or is_admin())
     and a <> b and (
       exists (select 1 from friendships f where f.status = 'accepted'
               and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a)))
       or exists (select 1 from coach_links l where l.status = 'active'
                  and ((l.coach_id = a and l.client_id = b) or (l.coach_id = b and l.client_id = a))));
$$;
revoke all on function public.mutual_follow(uuid, uuid) from public, anon;
grant execute on function public.mutual_follow(uuid, uuid) to authenticated;
