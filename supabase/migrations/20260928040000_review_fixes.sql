-- إصلاحات المراجعة الشاملة (28 سبتمبر 2026)

-- ١) صفحة النادي تجيب النادي نفسه برقمه (بدل البحث في أول ٣٠٠ نادي بالترتيب الأبجدي —
--    كانت الأندية الكثيرة اللي انضافت من الخرائط تطلع «النادي غير موجود»)
create or replace function public.gym_card(p_id uuid)
returns table (id uuid, name text, name_en text, chain text, chain_id uuid, chain_logo text, city text, district text, audience text, logo_path text, website text,
               lat double precision, lng double precision, verified boolean,
               rating numeric, reviews bigint, offers bigint, best_monthly numeric, distance_m double precision)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.name_en, coalesce(c.name_en, g.chain), g.chain_id, c.logo_path, g.city, g.district,
         coalesce(case when g.audience = 'mixed' and c.audience <> 'mixed' then c.audience end, g.audience),
         g.logo_path, coalesce(g.website, c.website), g.lat, g.lng, g.verified,
         round((select avg(r.rating) from gym_reviews r where r.gym_id = g.id), 1),
         (select count(*) from gym_reviews r where r.gym_id = g.id),
         (select count(*) from gym_offers o where (o.gym_id = g.id or (g.chain_id is not null and o.chain_id = g.chain_id))
            and o.active and (o.ends_on is null or o.ends_on >= current_date)),
         (select min(o.price_sar / o.months) from gym_offers o where (o.gym_id = g.id or (g.chain_id is not null and o.chain_id = g.chain_id))
            and o.active and o.months > 0 and (o.ends_on is null or o.ends_on >= current_date)),
         null::double precision
  from gyms g left join gym_chains c on c.id = g.chain_id
  where g.id = p_id and g.verified;
$$;
revoke all on function public.gym_card(uuid) from public, anon;
grant execute on function public.gym_card(uuid) to authenticated;

-- ٢) «صاحبك في النادي» يفتح صفحة الموجودين في النادي (بدل تعليقات الحضور)
create or replace function public._on_check_in()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_gym text;
begin
  if (select presence_visibility from profiles where id = new.user_id) = 'hidden' then return null; end if;
  select coalesce(nullif(name, ''), name_en) into v_gym from gyms where id = new.gym_id;
  for r in
    select distinct c.user_id from check_ins c
    where c.gym_id = new.gym_id and c.user_id <> new.user_id
      and c.checked_out_at is null and c.checked_in_at > now() - interval '6 hours'
      and (are_friends(c.user_id, new.user_id) or mutual_follow(c.user_id, new.user_id))
    limit 30
  loop
    perform _notify(r.user_id, new.user_id, 'friend_here', new.id,
      jsonb_build_object('gym', v_gym, 'gym_id', new.gym_id), '/gym/' || new.gym_id);
  end loop;
  return null;
end $$;
