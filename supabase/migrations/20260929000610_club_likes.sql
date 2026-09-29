-- الإعجاب في صفحة النادي: إعجاب بالنادي نفسه (فرع أو سلسلة) وإعجاب بتعليقات الأعضاء (التقييمات)،
-- وقائمة تعليقات السلسلة كاملة (كل الفروع) بنفس شكل تعليقات الفرع مع عدد الإعجابات

-- ---------- الإعجاب بالنادي ----------
create table if not exists public.club_likes (
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  gym_id     uuid references public.gyms(id) on delete cascade,
  chain_id   uuid references public.gym_chains(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint club_likes_one_target check ((gym_id is null) <> (chain_id is null))
);
create unique index if not exists club_likes_gym_uq on public.club_likes (gym_id, user_id) where gym_id is not null;
create unique index if not exists club_likes_chain_uq on public.club_likes (chain_id, user_id) where chain_id is not null;
alter table public.club_likes enable row level security;
-- كل واحد يشوف إعجاباته بس، والتغيير من الدالة تحت (ما فيه كتابة مباشرة)
drop policy if exists cl_read_own on public.club_likes;
create policy cl_read_own on public.club_likes for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.club_likes from authenticated, anon;

create or replace function public.club_like_state(p_gym uuid default null, p_chain uuid default null)
returns table (likes integer, liked boolean)
language sql stable security definer set search_path = public as $$
  select (select count(*) from club_likes l where (p_gym is not null and l.gym_id = p_gym) or (p_chain is not null and l.chain_id = p_chain))::int,
         exists (select 1 from club_likes l where l.user_id = auth.uid()
                 and ((p_gym is not null and l.gym_id = p_gym) or (p_chain is not null and l.chain_id = p_chain)));
$$;
revoke all on function public.club_like_state(uuid, uuid) from public, anon;
grant execute on function public.club_like_state(uuid, uuid) to authenticated;

create or replace function public.toggle_club_like(p_gym uuid default null, p_chain uuid default null)
returns table (likes integer, liked boolean)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if (p_gym is null) = (p_chain is null) then raise exception 'bad_target'; end if;
  if p_gym is not null and not exists (select 1 from gyms where id = p_gym) then raise exception 'not_found'; end if;
  if p_chain is not null and not exists (select 1 from gym_chains where id = p_chain) then raise exception 'not_found'; end if;
  if exists (select 1 from club_likes l where l.user_id = auth.uid() and (l.gym_id = p_gym or l.chain_id = p_chain)) then
    delete from club_likes l where l.user_id = auth.uid() and (l.gym_id = p_gym or l.chain_id = p_chain);
  else
    insert into club_likes (user_id, gym_id, chain_id) values (auth.uid(), p_gym, p_chain);
  end if;
  return query select * from club_like_state(p_gym, p_chain);
end $$;
revoke all on function public.toggle_club_like(uuid, uuid) from public, anon;
grant execute on function public.toggle_club_like(uuid, uuid) to authenticated;

-- ---------- الإعجاب بتعليقات الأعضاء ----------
create table if not exists public.review_likes (
  gym_id     uuid not null,
  reviewer   uuid not null,
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (gym_id, reviewer, user_id),
  foreign key (gym_id, reviewer) references public.gym_reviews(gym_id, user_id) on delete cascade
);
create index if not exists review_likes_review_idx on public.review_likes (gym_id, reviewer);
alter table public.review_likes enable row level security;
drop policy if exists rl_read_own on public.review_likes;
create policy rl_read_own on public.review_likes for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.review_likes from authenticated, anon;

create or replace function public.toggle_review_like(p_gym uuid, p_reviewer uuid)
returns table (likes integer, liked boolean)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from gym_reviews where gym_id = p_gym and user_id = p_reviewer) then raise exception 'not_found'; end if;
  if p_reviewer = auth.uid() then raise exception 'own_review'; end if;
  if exists (select 1 from review_likes where gym_id = p_gym and reviewer = p_reviewer and user_id = auth.uid()) then
    delete from review_likes where gym_id = p_gym and reviewer = p_reviewer and user_id = auth.uid();
  else
    insert into review_likes (gym_id, reviewer, user_id) values (p_gym, p_reviewer, auth.uid());
  end if;
  return query
    select (select count(*) from review_likes where gym_id = p_gym and reviewer = p_reviewer)::int,
           exists (select 1 from review_likes where gym_id = p_gym and reviewer = p_reviewer and user_id = auth.uid());
end $$;
revoke all on function public.toggle_review_like(uuid, uuid) from public, anon;
grant execute on function public.toggle_review_like(uuid, uuid) to authenticated;

-- ---------- تعليقات الفرع: نفس السابق + عدد الإعجابات وإعجابي ----------
-- (نوع النتيجة تغيّر، فنحذف الدالة ونرجّعها)
drop function if exists public.gym_reviews_full(uuid);
create function public.gym_reviews_full(p_gym uuid)
returns table (user_id uuid, username text, full_name text, avatar_url text, points integer, rating smallint, body text,
               updated_at timestamptz, visited boolean, is_me boolean,
               f_clean smallint, f_equipment smallint, f_crowd smallint, f_coaches smallint, f_staff smallint,
               reply text, reply_at timestamptz, can_reply boolean, likes integer, liked boolean)
language sql stable security definer set search_path = public as $$
  select r.user_id, p.username, p.full_name, p.avatar_url, p.points, r.rating, r.body, r.updated_at,
         exists (select 1 from check_ins c where c.user_id = r.user_id and c.gym_id = r.gym_id),
         r.user_id = auth.uid(),
         r.f_clean, r.f_equipment, r.f_crowd, r.f_coaches, r.f_staff,
         rr.body, rr.updated_at, can_manage_gym_or_chain(p_gym),
         (select count(*) from review_likes l where l.gym_id = r.gym_id and l.reviewer = r.user_id)::int,
         exists (select 1 from review_likes l where l.gym_id = r.gym_id and l.reviewer = r.user_id and l.user_id = auth.uid())
  from gym_reviews r join profiles p on p.id = r.user_id
  left join gym_review_replies rr on rr.gym_id = r.gym_id and rr.user_id = r.user_id
  where r.gym_id = p_gym
  order by (r.user_id = auth.uid()) desc,
           exists (select 1 from check_ins c where c.user_id = r.user_id and c.gym_id = r.gym_id) desc,
           r.updated_at desc
  limit 200;
$$;
revoke all on function public.gym_reviews_full(uuid) from public, anon;
grant execute on function public.gym_reviews_full(uuid) to authenticated;

-- ---------- تعليقات السلسلة: كل الفروع مع اسم الفرع ----------
create or replace function public.chain_reviews_full(p_chain uuid)
returns table (gym_id uuid, gym_name text, gym_name_en text, user_id uuid, username text, full_name text, avatar_url text, points integer,
               rating smallint, body text, updated_at timestamptz, visited boolean, is_me boolean,
               f_clean smallint, f_equipment smallint, f_crowd smallint, f_coaches smallint, f_staff smallint,
               reply text, reply_at timestamptz, can_reply boolean, likes integer, liked boolean)
language sql stable security definer set search_path = public as $$
  select r.gym_id, g.name, g.name_en, r.user_id, p.username, p.full_name, p.avatar_url, p.points, r.rating, r.body, r.updated_at,
         exists (select 1 from check_ins c where c.user_id = r.user_id and c.gym_id = r.gym_id),
         r.user_id = auth.uid(),
         r.f_clean, r.f_equipment, r.f_crowd, r.f_coaches, r.f_staff,
         rr.body, rr.updated_at, can_manage_gym_or_chain(r.gym_id),
         (select count(*) from review_likes l where l.gym_id = r.gym_id and l.reviewer = r.user_id)::int,
         exists (select 1 from review_likes l where l.gym_id = r.gym_id and l.reviewer = r.user_id and l.user_id = auth.uid())
  from gym_reviews r join gyms g on g.id = r.gym_id join profiles p on p.id = r.user_id
  left join gym_review_replies rr on rr.gym_id = r.gym_id and rr.user_id = r.user_id
  where g.chain_id = p_chain
  order by (r.user_id = auth.uid()) desc,
           exists (select 1 from check_ins c where c.user_id = r.user_id and c.gym_id = r.gym_id) desc,
           r.updated_at desc
  limit 200;
$$;
revoke all on function public.chain_reviews_full(uuid) from public, anon;
grant execute on function public.chain_reviews_full(uuid) to authenticated;
