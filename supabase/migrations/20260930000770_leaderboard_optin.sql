-- =====================================================================
-- المنافسة: ما أحد يطلع لناس ما يعرفونه إلا إذا اختار
--   * إعداد «أظهرني في المتصدرين» (show_on_leaderboard) طافي للكل من البداية
--   * «ناديي» و«الكل»: أنت (دايم تشوف ترتيبك) + أصدقاؤك + اللي شغّلوا الإعداد — واللي نقاطهم صفر هالأسبوع ما يطلعون
--   * «الأصدقاء»: زي ما هو (أنت وأصدقاؤك)
-- =====================================================================
alter table public.profiles add column if not exists show_on_leaderboard boolean not null default false;
grant update (show_on_leaderboard) on public.profiles to authenticated;

create or replace function public.leaderboard(p_scope text, p_since timestamptz, p_limit integer default 50)
returns table (user_id uuid, username text, full_name text, avatar_url text,
               points bigint, streak integer, rank bigint)
language sql stable security definer set search_path = public as $$
  with me as (select id, gym_id from profiles where id = auth.uid()),
  pool as (
    select p.id, p.username, p.full_name, p.avatar_url, p.streak, p.id = me.id as is_me
    from profiles p cross join me
    where case p_scope
            when 'friends' then p.id = me.id or are_friends(p.id, me.id)
            when 'gym'     then me.gym_id is not null and p.gym_id = me.gym_id
            else true
          end
      -- غير الأصدقاء: بس اللي اختاروا يظهرون
      and (p_scope = 'friends' or p.id = me.id or p.show_on_leaderboard or are_friends(p.id, me.id))
  ),
  scores as (
    select pool.id, pool.username, pool.full_name, pool.avatar_url, pool.streak, pool.is_me,
           coalesce(sum(l.amount), 0)::bigint as pts
    from pool
    left join points_ledger l on l.user_id = pool.id and l.created_at >= p_since
    group by pool.id, pool.username, pool.full_name, pool.avatar_url, pool.streak, pool.is_me
  )
  select id, username, full_name, avatar_url, pts, streak,
         rank() over (order by pts desc, streak desc)
  from scores
  where p_scope = 'friends' or is_me or pts > 0
  order by pts desc, streak desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;
revoke all on function public.leaderboard(text, timestamptz, integer) from public, anon;
grant execute on function public.leaderboard(text, timestamptz, integer) to authenticated;
