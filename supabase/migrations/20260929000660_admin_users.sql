-- لوحة إدارة التطبيق ← المتدربين: العدد، الإيميل، تعديل الاسم واسم المستخدم، وحذف الحساب نهائياً
-- كل شي للإدارة فقط (is_admin)، وكل تعديل أو حذف ينحفظ في سجل الإدارة.
-- الإيميل من auth.users وما يطلع إلا للإدارة.

-- ---------- الأرقام ----------
create or replace function public.admin_user_stats()
returns table (total integer, trainees integer, partners integer, new_7d integer, active_7d integer, unconfirmed integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  return query
  select count(*)::int,
         count(*) filter (where p.account_type = 'trainee')::int,
         count(*) filter (where p.account_type <> 'trainee')::int,
         count(*) filter (where p.created_at > now() - interval '7 days')::int,
         count(*) filter (where u.last_sign_in_at > now() - interval '7 days')::int,
         count(*) filter (where u.email_confirmed_at is null)::int
  from profiles p join auth.users u on u.id = p.id;
end $$;
revoke all on function public.admin_user_stats() from public, anon;
grant execute on function public.admin_user_stats() to authenticated;

-- ---------- القائمة: بحث بالاسم أو اسم المستخدم أو الإيميل ----------
-- p_kind: trainee (المتدربين) أو partner (الشركاء) أو all
create or replace function public.admin_user_list(p_search text default null, p_kind text default 'trainee',
                                                  p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, email text, username text, full_name text, avatar_url text, account_type text, gender text,
               created_at timestamptz, last_sign_in_at timestamptz, email_confirmed boolean, points integer,
               gym_name text, gym_name_en text, is_admin boolean, total bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_q text := nullif(trim(coalesce(p_search, '')), '');
  v_like text;
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  if p_kind not in ('trainee', 'partner', 'all') then p_kind := 'trainee'; end if;
  if v_q is not null then
    v_like := '%' || replace(replace(replace(left(v_q, 80), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  return query
  select p.id, u.email::text, p.username, p.full_name, p.avatar_url, p.account_type, hp.gender,
         p.created_at, u.last_sign_in_at, (u.email_confirmed_at is not null), p.points,
         g.name, g.name_en,
         exists (select 1 from app_admins a where a.user_id = p.id),
         count(*) over ()
  from profiles p
  join auth.users u on u.id = p.id
  left join health_profiles hp on hp.user_id = p.id
  left join gyms g on g.id = p.gym_id
  where (p_kind = 'all' or (p_kind = 'trainee') = (p.account_type = 'trainee'))
    and (v_like is null or u.email ilike v_like or p.username ilike v_like or coalesce(p.full_name, '') ilike v_like)
  order by p.created_at desc, p.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end $$;
revoke all on function public.admin_user_list(text, text, integer, integer) from public, anon;
grant execute on function public.admin_user_list(text, text, integer, integer) to authenticated;

-- ---------- التعديل: الاسم واسم المستخدم ----------
create or replace function public.admin_update_user(p_user uuid, p_full_name text, p_username text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_old profiles;
  v_name text := nullif(trim(coalesce(p_full_name, '')), '');
  v_user text := lower(trim(coalesce(p_username, '')));
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  select * into v_old from profiles where id = p_user for update;
  if not found then raise exception 'user_not_found'; end if;
  if v_user !~ '^[a-z0-9_.]{3,24}$' then raise exception 'bad_username'; end if;
  if v_name is not null and char_length(v_name) > 60 then raise exception 'name_too_long'; end if;
  if exists (select 1 from profiles where lower(username) = v_user and id <> p_user) then raise exception 'username_taken'; end if;
  update profiles set full_name = v_name, username = v_user where id = p_user;
  perform _admin_log('user', p_user::text, 'edit',
    concat_ws(' → ', v_old.username || coalesce(' (' || v_old.full_name || ')', ''), v_user || coalesce(' (' || v_name || ')', '')));
end $$;
revoke all on function public.admin_update_user(uuid, text, text) from public, anon;
grant execute on function public.admin_update_user(uuid, text, text) to authenticated;

-- ---------- الحذف ----------
-- ١) admin_prepare_user_delete: يفتح للإدارة ربع ساعة تحذف فيها ملفات هذا الحساب من التخزين (الصور، InBody…)
-- ٢) التطبيق يحذف الملفات
-- ٣) admin_delete_user: يحذف الحساب، وكل بياناته تنحذف بالتسلسل (on delete cascade)
-- ما ينحذف: حسابك أنت، أي حساب إدارة، أو حسابات الشركاء (تنداراو من «إدارة الشركاء»)
create table if not exists public.admin_user_deletes (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  admin_id   uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.admin_user_deletes enable row level security;
revoke all on public.admin_user_deletes from anon, authenticated;

create or replace function public._admin_can_delete(p_user uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare v_type text;
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  if p_user = auth.uid() then raise exception 'cannot_delete_self'; end if;
  if exists (select 1 from app_admins where user_id = p_user) then raise exception 'cannot_delete_admin'; end if;
  select account_type into v_type from profiles where id = p_user;
  if not found then raise exception 'user_not_found'; end if;
  if v_type <> 'trainee' then raise exception 'not_trainee'; end if;
end $$;
revoke all on function public._admin_can_delete(uuid) from public, anon, authenticated;

create or replace function public.admin_prepare_user_delete(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _admin_can_delete(p_user);
  insert into admin_user_deletes (user_id, admin_id) values (p_user, auth.uid())
  on conflict (user_id) do update set admin_id = excluded.admin_id, created_at = now();
end $$;
revoke all on function public.admin_prepare_user_delete(uuid) from public, anon;
grant execute on function public.admin_prepare_user_delete(uuid) to authenticated;

create or replace function public.admin_delete_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_label text;
begin
  perform _admin_can_delete(p_user);
  select p.username || coalesce(' (' || p.full_name || ')', '') into v_label from profiles p where p.id = p_user;
  perform _admin_log('user', p_user::text, 'delete', v_label);
  delete from auth.users where id = p_user;
end $$;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- ملفات الحساب اللي قيد الحذف: الإدارة تقدر تشوف أسماءها وتحذفها خلال ربع ساعة من admin_prepare_user_delete بس
create or replace function public._admin_deleting(p_folder text)
returns boolean language sql stable security definer set search_path = public as $$
  select is_admin() and exists (
    select 1 from admin_user_deletes d
    where d.user_id::text = p_folder and d.created_at > now() - interval '15 minutes');
$$;
revoke all on function public._admin_deleting(text) from public, anon;
grant execute on function public._admin_deleting(text) to authenticated;

drop policy if exists "admin list files of deleted user" on storage.objects;
create policy "admin list files of deleted user" on storage.objects for select to authenticated
  using (bucket_id in ('avatars', 'posts', 'body', 'inbody', 'feedback') and _admin_deleting((storage.foldername(name))[1]));
drop policy if exists "admin delete files of deleted user" on storage.objects;
create policy "admin delete files of deleted user" on storage.objects for delete to authenticated
  using (bucket_id in ('avatars', 'posts', 'body', 'inbody', 'feedback') and _admin_deleting((storage.foldername(name))[1]));
