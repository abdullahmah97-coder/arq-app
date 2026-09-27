-- =====================================================================
-- عروض النوادي وتقييماتها: أسعار الاشتراكات والعروض، تقييم النادي (١–٥)، وتعليقات المستخدمين
--   * العروض يضيفها مالك التطبيق أو مدير النادي المعتمد (gym_managers)
--   * التقييم: تقييم واحد لكل مستخدم لكل نادي، مع علامة «زار النادي ✓» لمن سجّل حضور فيه
-- =====================================================================
alter table public.gyms
  add column if not exists chain     text check (char_length(chain) <= 60),
  add column if not exists audience  text not null default 'mixed' check (audience in ('men','women','mixed')),
  add column if not exists website   text check (website is null or website ~* '^https://[^\s]+$'),
  add column if not exists logo_path text check (char_length(logo_path) <= 200),
  add column if not exists district  text check (char_length(district) <= 60);

-- مدراء النوادي (يضيفهم المالك): يقدرون ينشرون عروض ناديهم
create table public.gym_managers (
  gym_id   uuid not null references public.gyms(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  primary key (gym_id, user_id)
);
alter table public.gym_managers enable row level security;
create policy gm_self_read on public.gym_managers for select to authenticated using (user_id = auth.uid() or is_admin());
create policy gm_admin_write on public.gym_managers for all to authenticated using (is_admin()) with check (is_admin());

create or replace function public.can_manage_gym(p_gym uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_admin() or exists (select 1 from gym_managers m where m.gym_id = p_gym and m.user_id = auth.uid());
$$;
revoke all on function public.can_manage_gym(uuid) from public, anon;
grant execute on function public.can_manage_gym(uuid) to authenticated;

-- المالك يعدّل بيانات النادي (السلسلة، الفئة، الموقع…) ويوثّقه
create policy gyms_admin_update on public.gyms for update to authenticated using (is_admin()) with check (is_admin());

-- ---------- العروض ----------
create table public.gym_offers (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references public.gyms(id) on delete cascade,
  title           text not null check (char_length(btrim(title)) between 3 and 80),
  details         text check (char_length(details) <= 400),
  price_sar       numeric(8,2) not null check (price_sar between 0 and 100000),
  old_price_sar   numeric(8,2) check (old_price_sar is null or old_price_sar > price_sar),
  months          smallint not null default 1 check (months between 0 and 24),   -- 0 = زيارة/يوم واحد
  ends_on         date,
  url             text check (url is null or url ~* '^https://[^\s]+$'),
  promo_code      text check (char_length(promo_code) <= 30),
  active          boolean not null default true,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index on public.gym_offers (gym_id, active);

alter table public.gym_offers enable row level security;
create policy offers_read on public.gym_offers for select to authenticated
  using ((active and (ends_on is null or ends_on >= current_date)) or can_manage_gym(gym_id));
create policy offers_write on public.gym_offers for all to authenticated
  using (can_manage_gym(gym_id)) with check (can_manage_gym(gym_id));

create or replace function public._offer_stamp()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.created_by := auth.uid(); new.created_at := now();
  else new.created_by := old.created_by; new.created_at := old.created_at; end if;
  return new;
end $$;
create trigger offers_stamp before insert or update on public.gym_offers for each row execute function public._offer_stamp();

-- ---------- التقييمات والتعليقات ----------
create table public.gym_reviews (
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  body        text check (char_length(body) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (gym_id, user_id)
);
create index on public.gym_reviews (gym_id, updated_at desc);

create or replace function public._review_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); new.created_at := old.created_at; return new; end $$;
create trigger reviews_touch before update on public.gym_reviews for each row execute function public._review_touch();

alter table public.gym_reviews enable row level security;
create policy reviews_read on public.gym_reviews for select to authenticated using (true);
create policy reviews_write on public.gym_reviews for insert to authenticated with check (user_id = auth.uid());
create policy reviews_update on public.gym_reviews for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reviews_delete on public.gym_reviews for delete to authenticated using (user_id = auth.uid() or is_admin());

-- دليل النوادي: متوسط التقييم وعدده، أفضل عرض (أقل سعر شهري)، والمسافة إن توفر الموقع
create or replace function public.gyms_directory(p_lat double precision default null, p_lng double precision default null, p_city text default null)
returns table (id uuid, name text, name_en text, chain text, city text, district text, audience text, logo_path text, website text,
               lat double precision, lng double precision, verified boolean,
               rating numeric, reviews bigint, offers bigint, best_monthly numeric, distance_m double precision)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.name_en, g.chain, g.city, g.district, g.audience, g.logo_path, g.website, g.lat, g.lng, g.verified,
         round((select avg(r.rating) from gym_reviews r where r.gym_id = g.id), 1),
         (select count(*) from gym_reviews r where r.gym_id = g.id),
         (select count(*) from gym_offers o where o.gym_id = g.id and o.active and (o.ends_on is null or o.ends_on >= current_date)),
         (select min(o.price_sar / greatest(o.months, 1)) from gym_offers o
            where o.gym_id = g.id and o.active and o.months > 0 and (o.ends_on is null or o.ends_on >= current_date)),
         case when p_lat is null then null else distance_m(p_lat, p_lng, g.lat, g.lng) end
  from gyms g
  where g.verified and (p_city is null or g.city = p_city)
  order by case when p_lat is null then 0 else distance_m(p_lat, p_lng, g.lat, g.lng) end, g.name
  limit 200;
$$;
revoke all on function public.gyms_directory(double precision, double precision, text) from public, anon;
grant execute on function public.gyms_directory(double precision, double precision, text) to authenticated;

-- التعليقات مع علامة «زار النادي ✓» (سجّل حضور فيه مرة على الأقل)
create or replace function public.gym_reviews_list(p_gym uuid)
returns table (user_id uuid, username text, full_name text, avatar_url text, points integer, rating smallint, body text,
               updated_at timestamptz, visited boolean, is_me boolean)
language sql stable security definer set search_path = public as $$
  select r.user_id, p.username, p.full_name, p.avatar_url, p.points, r.rating, r.body, r.updated_at,
         exists (select 1 from check_ins c where c.user_id = r.user_id and c.gym_id = r.gym_id),
         r.user_id = auth.uid()
  from gym_reviews r join profiles p on p.id = r.user_id
  where r.gym_id = p_gym
  order by (r.user_id = auth.uid()) desc,
           exists (select 1 from check_ins c where c.user_id = r.user_id and c.gym_id = r.gym_id) desc,
           r.updated_at desc
  limit 100;
$$;
revoke all on function public.gym_reviews_list(uuid) from public, anon;
grant execute on function public.gym_reviews_list(uuid) to authenticated;
