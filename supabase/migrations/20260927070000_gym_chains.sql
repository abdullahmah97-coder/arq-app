-- =====================================================================
-- سلاسل النوادي (وقت اللياقة، جولدز جيم، بودي ماسترز…) وعروضها على مستوى السلسلة
--   * العرض يكون لسلسلة كاملة أو لفرع محدد
--   * كل عرض له مصدر (رابط) وتاريخ آخر تحقق ودرجة ثقة: official / article / uncertain / partner
--   * الشعار يرفعه المالك أو مدير السلسلة (bucket brands)
-- =====================================================================
create table public.gym_chains (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name         text not null check (char_length(btrim(name)) between 2 and 60),
  name_en      text check (char_length(name_en) <= 60),
  audience     text not null default 'mixed' check (audience in ('men','women','mixed')),
  website      text check (website is null or website ~* '^https://[^\s]+$'),
  instagram    text check (instagram is null or instagram ~ '^[A-Za-z0-9_.]{1,30}$'),
  description  text check (char_length(description) <= 400),
  logo_path    text check (char_length(logo_path) <= 200),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

alter table public.gyms add column if not exists chain_id uuid references public.gym_chains(id) on delete set null;
create index on public.gyms (chain_id);

create table public.chain_managers (
  chain_id uuid not null references public.gym_chains(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  primary key (chain_id, user_id)
);
alter table public.chain_managers enable row level security;
create policy cm_read on public.chain_managers for select to authenticated using (user_id = auth.uid() or is_admin());
create policy cm_admin on public.chain_managers for all to authenticated using (is_admin()) with check (is_admin());

create or replace function public.can_manage_chain(p_chain uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_admin() or exists (select 1 from chain_managers m where m.chain_id = p_chain and m.user_id = auth.uid());
$$;
revoke all on function public.can_manage_chain(uuid) from public, anon;
grant execute on function public.can_manage_chain(uuid) to authenticated;

alter table public.gym_chains enable row level security;
create policy chains_read on public.gym_chains for select to authenticated using (active or can_manage_chain(id));
create policy chains_admin_insert on public.gym_chains for insert to authenticated with check (is_admin());
create policy chains_manage on public.gym_chains for update to authenticated using (can_manage_chain(id)) with check (can_manage_chain(id));
create policy chains_admin_delete on public.gym_chains for delete to authenticated using (is_admin());

-- ---------- العروض: لفرع أو لسلسلة، مع المصدر ----------
alter table public.gym_offers alter column gym_id drop not null;
alter table public.gym_offers
  add column if not exists chain_id    uuid references public.gym_chains(id) on delete cascade,
  add column if not exists source_url  text check (source_url is null or source_url ~* '^https://[^\s]+$'),
  add column if not exists seen_on     date default current_date,
  add column if not exists confidence  text not null default 'partner' check (confidence in ('official','article','uncertain','partner'));
alter table public.gym_offers add constraint gym_offers_target check (gym_id is not null or chain_id is not null);
create index on public.gym_offers (chain_id, active);

create or replace function public.can_manage_offer_target(p_gym uuid, p_chain uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (p_gym is not null and can_manage_gym(p_gym)) or (p_chain is not null and can_manage_chain(p_chain));
$$;
revoke all on function public.can_manage_offer_target(uuid, uuid) from public, anon;
grant execute on function public.can_manage_offer_target(uuid, uuid) to authenticated;

drop policy if exists offers_read on public.gym_offers;
drop policy if exists offers_write on public.gym_offers;
create policy offers_read on public.gym_offers for select to authenticated
  using ((active and (ends_on is null or ends_on >= current_date)) or can_manage_offer_target(gym_id, chain_id));
create policy offers_write on public.gym_offers for all to authenticated
  using (can_manage_offer_target(gym_id, chain_id)) with check (can_manage_offer_target(gym_id, chain_id));

-- ---------- دليل السلاسل: الفروع، التقييم المجمّع، العروض، أقل سعر شهري، أقرب فرع ----------
create or replace function public.chains_directory(p_lat double precision default null, p_lng double precision default null)
returns table (id uuid, slug text, name text, name_en text, audience text, website text, instagram text, description text, logo_path text,
               branches bigint, rating numeric, reviews bigint, offers bigint, best_monthly numeric, nearest_m double precision)
language sql stable security definer set search_path = public as $$
  select c.id, c.slug, c.name, c.name_en, c.audience, c.website, c.instagram, c.description, c.logo_path,
         (select count(*) from gyms g where g.chain_id = c.id and g.verified),
         round((select avg(r.rating) from gym_reviews r join gyms g on g.id = r.gym_id where g.chain_id = c.id), 1),
         (select count(*) from gym_reviews r join gyms g on g.id = r.gym_id where g.chain_id = c.id),
         (select count(*) from gym_offers o left join gyms g on g.id = o.gym_id
            where (o.chain_id = c.id or g.chain_id = c.id) and o.active and (o.ends_on is null or o.ends_on >= current_date)),
         (select min(o.price_sar / o.months) from gym_offers o left join gyms g on g.id = o.gym_id
            where (o.chain_id = c.id or g.chain_id = c.id) and o.active and o.months > 0 and (o.ends_on is null or o.ends_on >= current_date)),
         case when p_lat is null then null else
           (select min(distance_m(p_lat, p_lng, g.lat, g.lng)) from gyms g where g.chain_id = c.id and g.verified) end
  from gym_chains c
  where c.active
  order by c.name;
$$;
revoke all on function public.chains_directory(double precision, double precision) from public, anon;
grant execute on function public.chains_directory(double precision, double precision) to authenticated;

-- دليل الفروع يشمل عروض السلسلة في «أقل سعر شهري»
drop function if exists public.gyms_directory(double precision, double precision, text);
create or replace function public.gyms_directory(p_lat double precision default null, p_lng double precision default null, p_city text default null)
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
         case when p_lat is null then null else distance_m(p_lat, p_lng, g.lat, g.lng) end
  from gyms g left join gym_chains c on c.id = g.chain_id
  where g.verified and (p_city is null or g.city = p_city)
  order by case when p_lat is null then 0 else distance_m(p_lat, p_lng, g.lat, g.lng) end, g.name
  limit 300;
$$;
revoke all on function public.gyms_directory(double precision, double precision, text) from public, anon;
grant execute on function public.gyms_directory(double precision, double precision, text) to authenticated;

-- =====================================================================
-- بيانات السلاسل والعروض: جُمعت من المواقع الرسمية ومواقع العروض بتاريخ 2026-09-27
-- كل عرض معه رابط مصدره وتاريخه. العروض المنتهية تختفي تلقائياً بعد ends_on.
-- =====================================================================
insert into public.gym_chains (slug, name, name_en, audience, website, instagram, description) values
  ('fitness-time', 'وقت اللياقة', 'Fitness Time', 'men', 'https://www.fitnesstime.com.sa', 'fitnesstimesa', 'الفئة الأساسية من أندية لجام: مسبح وجاكوزي وصالة حديد وأنشطة مثل الاسكواش.'),
  ('fitness-time-plus', 'وقت اللياقة بلس', 'Fitness Time Plus', 'men', 'https://www.fitnesstime.com.sa', 'fitnesstimesa', 'الفئة الفاخرة من وقت اللياقة: مسابح وجاكوزي وبخار وساونا وخدمات راقية.'),
  ('fitness-time-pro', 'وقت اللياقة برو', 'Fitness Time Pro', 'men', 'https://www.fitnesstime.com.sa', 'fitnesstimesa', 'فئة برو: مسبح تدريبي ومساحات مخصصة لكل نوع تمرين، بسعر أقل من فئة فتنس.'),
  ('fitness-time-xpress', 'وقت اللياقة إكسبرس', 'Fitness Time Xpress', 'mixed', 'https://www.fitnesstime.com.sa', 'fitnesstimesa', 'الفئة الاقتصادية: تجربة رقمية وبعض فروع الرجال 24 ساعة، وفيه فروع للسيدات.'),
  ('fitness-time-ladies', 'وقت اللياقة ليديز', 'Fitness Time Ladies', 'women', 'https://www.fitnesstime.com.sa', 'ftladies', 'أندية وقت اللياقة النسائية بفئات فتنس وبرو وإكسبرس.'),
  ('bfit', 'بي فت', 'B_FIT', 'mixed', 'https://bfit.com.sa', 'bfit_ksa', 'من أرماح الرياضية: كلاسات جماعية ومسبح ومساحات عمل، فروع للسيدات وللرجال ومشتركة في الرياض وجدة.'),
  ('optimo', 'أوبتيمو', 'Optimo', 'mixed', 'https://optimo.com.sa', 'optimo_club', 'العلامة الفاخرة من أرماح في الرياض: فروع للرجال والسيدات في الملقا وفرع رجال في النخيل.'),
  ('golds-gym', 'جولدز جيم', 'Gold''s Gym Arabia', 'mixed', 'https://www.ggarabia.com', 'goldsgymarabia', 'سلسلة جولدز جيم العالمية في المملكة، فروع للرجال والسيدات في أكثر من مدينة.'),
  ('body-masters', 'بودي ماسترز', 'Body Masters', 'men', 'https://www.bodymasters.com.sa', 'bodymasterssa', 'أندية رجالية بفئتين بريميوم وإكسبرس، أكثر من 42 نادي في 18 مدينة.'),
  ('body-motions', 'بودي موشنز', 'Body Motions', 'women', 'https://www.bodymotions.com.sa', 'bodymotionsksa', 'الأندية النسائية لبودي ماسترز: أكثر من 19 نادي في 7 مدن، مسبح وجاكوزي وبخار وساونا.'),
  ('nuyu', 'نيويو', 'NuYu Fitness', 'women', 'https://nuyu-ksa.com', 'nuyuksa', 'سلسلة أندية نسائية بفروع في الرياض والدمام.'),
  ('puregym', 'بيور جيم', 'PureGym KSA', 'mixed', 'https://ksa.puregymarabia.com/en-gb', 'puregymksa', 'نادي اقتصادي مفتوح 24 ساعة بدون عقود، فروع مستقلة للرجال والسيدات في الرياض وجدة والدمام والخبر.'),
  ('gymnation', 'جيم نيشن', 'GymNation', 'mixed', 'https://gymnation.com/en-sa/', 'gymnation_me', 'دفع شهري بدون التزام طويل، مفتوح 24/7، أندية نسائية مستقلة وأكثر من 400 كلاس مجاني بالشهر.'),
  ('fitness-first', 'فتنس فيرست', 'Fitness First KSA', 'mixed', 'https://ksa.fitnessfirstme.com', 'fitnessfirstksa', 'السلسلة العالمية بأندية للرجال والسيدات في الرياض والدمام.'),
  ('oxygen', 'نادي أوكسجين', 'Oxygen Sport Center', 'mixed', 'https://oxygen-gym.com', 'oxygen_gym123', 'مركز رياضي بفروع في المنطقة الشرقية (القطيف وصفوى ورحيمة والدمام) وفرع نسائي بالقطيف.'),
  ('snap-fitness', 'سناب فتنس', 'Snap Fitness Saudi Arabia', 'men', 'https://www.snapfitness.com/sa_en', null, 'نادي 24 ساعة للأعضاء، فرعه المذكور في الجبيل (رجال).'),
  ('smart-fitness', 'اللياقة الذكية', 'Smart Fitness', 'mixed', 'https://smartfitness.com.sa', null, 'أندية لياقة بفروع مستقلة للرجال والسيدات.')
on conflict (slug) do nothing;

insert into public.gym_offers (chain_id, title, price_sar, old_price_sar, months, details, ends_on, source_url, seen_on, confidence)
select c.id, v.title, v.price, v.old, v.months, v.details, v.ends_on::date, v.source, v.seen::date, v.conf from (values
  ('fitness-time', 'عرض اليوم الوطني 96 – سنة فئة فتنس', 3096::numeric, null::numeric, 12::smallint, 'فئة فتنس لمدة سنة + 30 يوم إضافية عند التجديد. السعر القديم والضريبة غير مذكورين.', null, 'https://3rooodnews.net/876210', '2026-08-26', 'article'),
  ('fitness-time', 'السعر الأساسي – 12 شهر (فتنس)', 6029::numeric, null::numeric, 12::smallint, 'سعر ما قبل خصم اليوم الوطني 95 (مقال سبتمبر 2025) — قد يكون تغيّر.', null, 'https://www.economy-today.com/%D8%A7%D9%84%D9%8A%D9%88%D9%85-%D8%A7%D9%84%D9%88%D8%B7%D9%86%D9%8A-95-%D8%AE%D8%B5%D9%88%D9%85%D8%A7%D8%AA-%D9%81%D8%AA%D9%86%D8%B3-%D8%AA%D8%A7%D9%8A%D9%85-%D8%A7%D8%B3%D8%AA%D8%AB%D9%86%D8%A7/', '2025-09-13', 'article'),
  ('fitness-time', 'السعر الأساسي – 6 شهور (فتنس)', 3589::numeric, null::numeric, 6::smallint, 'سعر ما قبل خصم اليوم الوطني 95 (مقال سبتمبر 2025) — قد يكون تغيّر.', null, 'https://www.economy-today.com/%D8%A7%D9%84%D9%8A%D9%88%D9%85-%D8%A7%D9%84%D9%88%D8%B7%D9%86%D9%8A-95-%D8%AE%D8%B5%D9%88%D9%85%D8%A7%D8%AA-%D9%81%D8%AA%D9%86%D8%B3-%D8%AA%D8%A7%D9%8A%D9%85-%D8%A7%D8%B3%D8%AA%D8%AB%D9%86%D8%A7/', '2025-09-13', 'article'),
  ('fitness-time', 'السعر الأساسي – 3 شهور (فتنس)', 2189::numeric, null::numeric, 3::smallint, 'سعر ما قبل خصم اليوم الوطني 95 (مقال سبتمبر 2025) — قد يكون تغيّر.', null, 'https://www.economy-today.com/%D8%A7%D9%84%D9%8A%D9%88%D9%85-%D8%A7%D9%84%D9%88%D8%B7%D9%86%D9%8A-95-%D8%AE%D8%B5%D9%88%D9%85%D8%A7%D8%AA-%D9%81%D8%AA%D9%86%D8%B3-%D8%AA%D8%A7%D9%8A%D9%85-%D8%A7%D8%B3%D8%AA%D8%AB%D9%86%D8%A7/', '2025-09-13', 'article'),
  ('fitness-time-plus', 'اشتراك سنة – بلس', 12644::numeric, null::numeric, 12::smallint, 'من مقال غير رسمي وتغريدة مقارنة أسعار (نوفمبر 2025) — غير مؤكد من المصدر الرسمي.', null, 'https://mqalaty.net/%D8%A7%D8%B3%D8%B9%D8%A7%D8%B1-%D8%A7%D9%84%D8%A7%D8%B4%D8%AA%D8%B1%D8%A7%D9%83-%D9%81%D9%8A-%D9%88%D9%82%D8%AA-%D8%A7%D9%84%D9%84%D9%8A%D8%A7%D9%82%D8%A9/', '2026-06-03', 'uncertain'),
  ('fitness-time-pro', 'السعر الأساسي – 12 شهر (برو)', 4639::numeric, null::numeric, 12::smallint, 'سعر ما قبل خصم اليوم الوطني 95 (مقال سبتمبر 2025) — قد يكون تغيّر.', null, 'https://www.economy-today.com/%D8%A7%D9%84%D9%8A%D9%88%D9%85-%D8%A7%D9%84%D9%88%D8%B7%D9%86%D9%8A-95-%D8%AE%D8%B5%D9%88%D9%85%D8%A7%D8%AA-%D9%81%D8%AA%D9%86%D8%B3-%D8%AA%D8%A7%D9%8A%D9%85-%D8%A7%D8%B3%D8%AA%D8%AB%D9%86%D8%A7/', '2025-09-13', 'article'),
  ('fitness-time-pro', 'السعر الأساسي – 6 شهور (برو)', 2799::numeric, null::numeric, 6::smallint, 'سعر ما قبل خصم اليوم الوطني 95 (مقال سبتمبر 2025) — قد يكون تغيّر.', null, 'https://www.economy-today.com/%D8%A7%D9%84%D9%8A%D9%88%D9%85-%D8%A7%D9%84%D9%88%D8%B7%D9%86%D9%8A-95-%D8%AE%D8%B5%D9%88%D9%85%D8%A7%D8%AA-%D9%81%D8%AA%D9%86%D8%B3-%D8%AA%D8%A7%D9%8A%D9%85-%D8%A7%D8%B3%D8%AA%D8%AB%D9%86%D8%A7/', '2025-09-13', 'article'),
  ('fitness-time-pro', 'السعر الأساسي – 3 شهور (برو)', 1649::numeric, null::numeric, 3::smallint, 'سعر ما قبل خصم اليوم الوطني 95 (مقال سبتمبر 2025) — قد يكون تغيّر.', null, 'https://www.economy-today.com/%D8%A7%D9%84%D9%8A%D9%88%D9%85-%D8%A7%D9%84%D9%88%D8%B7%D9%86%D9%8A-95-%D8%AE%D8%B5%D9%88%D9%85%D8%A7%D8%AA-%D9%81%D8%AA%D9%86%D8%B3-%D8%AA%D8%A7%D9%8A%D9%85-%D8%A7%D8%B3%D8%AA%D8%AB%D9%86%D8%A7/', '2025-09-13', 'article'),
  ('fitness-time-xpress', 'السعر الأساسي – 12 شهر (إكسبرس)', 1899::numeric, null::numeric, 12::smallint, 'سعر ما قبل خصم اليوم الوطني 95 (مقال سبتمبر 2025) — قد يكون تغيّر.', null, 'https://www.economy-today.com/%D8%A7%D9%84%D9%8A%D9%88%D9%85-%D8%A7%D9%84%D9%88%D8%B7%D9%86%D9%8A-95-%D8%AE%D8%B5%D9%88%D9%85%D8%A7%D8%AA-%D9%81%D8%AA%D9%86%D8%B3-%D8%AA%D8%A7%D9%8A%D9%85-%D8%A7%D8%B3%D8%AA%D8%AB%D9%86%D8%A7/', '2025-09-13', 'article'),
  ('fitness-time-xpress', 'السعر الأساسي – 3 شهور (إكسبرس)', 789::numeric, null::numeric, 3::smallint, 'سعر ما قبل خصم اليوم الوطني 95 (مقال سبتمبر 2025) — قد يكون تغيّر.', null, 'https://www.economy-today.com/%D8%A7%D9%84%D9%8A%D9%88%D9%85-%D8%A7%D9%84%D9%88%D8%B7%D9%86%D9%8A-95-%D8%AE%D8%B5%D9%88%D9%85%D8%A7%D8%AA-%D9%81%D8%AA%D9%86%D8%B3-%D8%AA%D8%A7%D9%8A%D9%85-%D8%A7%D8%B3%D8%AA%D8%AB%D9%86%D8%A7/', '2025-09-13', 'article'),
  ('fitness-time-ladies', 'عرض اليوم الوطني 96 – سنة فئة فتنس', 3096::numeric, null::numeric, 12::smallint, 'فئة فتنس للسيدات لمدة سنة + 30 يوم إضافية عند التجديد. السعر القديم والضريبة غير مذكورين.', null, 'https://3rooodnews.net/876794', '2026-08-27', 'article'),
  ('optimo', 'عضوية سنة – دفعة وحدة', 12960::numeric, null::numeric, 12::smallint, 'شامل الضريبة (11,269 قبل الضريبة)، التزام 12 شهر.', null, 'https://optimo.com.sa/memberships', null, 'official'),
  ('golds-gym', 'اشتراك سنة – الرياض (رجال)', 7317::numeric, null::numeric, 12::smallint, 'من المتجر الإلكتروني الرسمي. الضريبة غير مذكورة وقد تكون الأسعار تغيّرت.', null, 'https://shop.ggarabia.com/wp-json/wc/store/v1/products/32437', null, 'official'),
  ('golds-gym', 'اشتراك 6 شهور – الرياض (رجال)', 5072::numeric, null::numeric, 6::smallint, 'من المتجر الإلكتروني الرسمي. الضريبة غير مذكورة وقد تكون الأسعار تغيّرت.', null, 'https://shop.ggarabia.com/wp-json/wc/store/v1/products/32441', null, 'official'),
  ('golds-gym', 'اشتراك 3 شهور – الرياض (رجال)', 3985::numeric, null::numeric, 3::smallint, 'من المتجر الإلكتروني الرسمي. الضريبة غير مذكورة وقد تكون الأسعار تغيّرت.', null, 'https://shop.ggarabia.com/wp-json/wc/store/v1/products/32433', null, 'official'),
  ('golds-gym', 'اشتراك سنة – جدة الزهراء (سيدات)', 7173::numeric, null::numeric, 12::smallint, 'من المتجر الإلكتروني الرسمي. الضريبة غير مذكورة وقد تكون الأسعار تغيّرت.', null, 'https://shop.ggarabia.com/wp-json/wc/store/v1/products/32419', null, 'official'),
  ('golds-gym', 'اشتراك سنة – أبها (رجال)', 5844::numeric, null::numeric, 12::smallint, 'من المتجر الإلكتروني الرسمي. الضريبة غير مذكورة وقد تكون الأسعار تغيّرت.', null, 'https://shop.ggarabia.com/wp-json/wc/store/v1/products/32436', null, 'official'),
  ('golds-gym', 'عرض اليوم الوطني 96 – سنة (أبها)', 1796::numeric, null::numeric, 12::smallint, 'فرع أبها + كاش باك 100 ريال عند التجديد. قد يكون فرع أبها فرنشايز مستقل.', null, 'https://www.3orod.today/saudi-arabia-offers/national-day/golds-gym-abha-2-9-2026.html', '2026-09-02', 'article'),
  ('golds-gym', 'عرض اليوم الوطني 96 – 6 شهور (أبها)', 1396::numeric, null::numeric, 6::smallint, 'فرع أبها + كاش باك 100 ريال عند التجديد.', null, 'https://www.3orod.today/saudi-arabia-offers/national-day/golds-gym-abha-2-9-2026.html', '2026-09-02', 'article'),
  ('golds-gym', 'عرض اليوم الوطني 96 – 3 شهور (أبها)', 996::numeric, null::numeric, 3::smallint, 'فرع أبها + كاش باك 100 ريال عند التجديد.', null, 'https://www.3orod.today/saudi-arabia-offers/national-day/golds-gym-abha-2-9-2026.html', '2026-09-02', 'article'),
  ('body-masters', 'عرض اليوم الوطني – بريميوم 3 شهور', 1008::numeric, 2520::numeric, 3::smallint, '3 شهور + 15 يوم مجاناً، إيقاف مجاني. شامل الضريبة 15%.', '2026-09-30', 'https://3rooodnews.net/885152', '2026-09-25', 'article'),
  ('body-masters', 'عرض اليوم الوطني – بريميوم 6 شهور', 1652::numeric, 4130::numeric, 6::smallint, '6 شهور + 30 يوم مجاناً. شامل الضريبة 15%.', '2026-09-30', 'https://3rooodnews.net/885152', '2026-09-25', 'article'),
  ('body-masters', 'عرض اليوم الوطني – بريميوم سنة', 2552::numeric, 6380::numeric, 12::smallint, '12 شهر + 30 يوم مجاناً. شامل الضريبة 15%.', '2026-09-30', 'https://3rooodnews.net/885152', '2026-09-25', 'article'),
  ('body-masters', 'عرض اليوم الوطني – إكسبرس 3 شهور', 676::numeric, 1691::numeric, 3::smallint, '3 شهور + 15 يوم مجاناً. شامل الضريبة 15%.', '2026-09-30', 'https://3rooodnews.net/885152', '2026-09-25', 'article'),
  ('body-masters', 'عرض اليوم الوطني – إكسبرس 6 شهور', 1148::numeric, 2870::numeric, 6::smallint, '6 شهور + 30 يوم مجاناً. شامل الضريبة 15%.', '2026-09-30', 'https://3rooodnews.net/885152', '2026-09-25', 'article'),
  ('body-masters', 'عرض اليوم الوطني – إكسبرس سنة', 1916::numeric, 4790::numeric, 12::smallint, '12 شهر + 30 يوم مجاناً. شامل الضريبة 15%.', '2026-09-30', 'https://3rooodnews.net/885152', '2026-09-25', 'article'),
  ('puregym', 'عرض اليوم الوطني – كور بـ 96 ريال شهرياً', 96::numeric, null::numeric, 1::smallint, 'سعر شهري على عضوية كور بعقد ثابت 4 شهور، بالكود SND4.', null, 'https://ksa.puregymarabia.com/en-gb/membership-options', null, 'official'),
  ('puregym', 'كور شهري بدون عقد', 242::numeric, null::numeric, 1::smallint, 'فرع السعادة بالرياض (رجال)، نادي واحد، + رسوم انضمام 39 ريال.', null, 'https://ksa.puregymarabia.com/en-gb/gyms/as-saadah-man', null, 'official'),
  ('puregym', 'بلس شهري بدون عقد', 305::numeric, null::numeric, 1::smallint, 'فرع السعادة بالرياض (رجال): أكثر من فرع + كلاسات + تجميد مجاني، + رسوم انضمام 79 ريال.', null, 'https://ksa.puregymarabia.com/en-gb/gyms/as-saadah-man', null, 'official'),
  ('puregym', 'كور شهري – الصفا جدة (سيدات)', 229::numeric, null::numeric, 1::smallint, 'فرع الصفا بجدة للسيدات، + رسوم انضمام 36 ريال.', null, 'https://ksa.puregymarabia.com/en-gb/gyms/jeddah-alsafa-woman/', null, 'official'),
  ('puregym', 'كور 3 شهور (عقد ثابت)', 685::numeric, null::numeric, 3::smallint, 'يبدأ من هذا السعر + رسوم انضمام.', null, 'https://ksa.puregymarabia.com/en-gb/membership-options', null, 'official'),
  ('puregym', 'كور 6 شهور (عقد ثابت)', 1159::numeric, null::numeric, 6::smallint, 'يبدأ من هذا السعر + رسوم انضمام.', null, 'https://ksa.puregymarabia.com/en-gb/membership-options', null, 'official'),
  ('puregym', 'كور 12 شهر (عقد ثابت)', 1824::numeric, null::numeric, 12::smallint, 'يبدأ من هذا السعر + رسوم انضمام.', null, 'https://ksa.puregymarabia.com/en-gb/membership-options', null, 'official'),
  ('puregym', 'بلس 3 شهور (عقد ثابت)', 844::numeric, null::numeric, 3::smallint, 'يبدأ من هذا السعر + رسوم انضمام.', null, 'https://ksa.puregymarabia.com/en-gb/membership-options', null, 'official'),
  ('puregym', 'بلس 6 شهور (عقد ثابت)', 1465::numeric, null::numeric, 6::smallint, 'يبدأ من هذا السعر + رسوم انضمام.', null, 'https://ksa.puregymarabia.com/en-gb/membership-options', null, 'official'),
  ('puregym', 'بلس 12 شهر (عقد ثابت)', 2299::numeric, null::numeric, 12::smallint, 'يبدأ من هذا السعر + رسوم انضمام.', null, 'https://ksa.puregymarabia.com/en-gb/membership-options', null, 'official'),
  ('puregym', 'تذكرة يوم واحد', 75::numeric, null::numeric, 0::smallint, 'تبدأ من 75 ريال.', null, 'https://ksa.puregymarabia.com/en-gb/membership-options', null, 'official'),
  ('puregym', 'تذكرة 3 أيام', 145::numeric, null::numeric, 0::smallint, 'تذكرة لمدة 3 أيام، تبدأ من 145 ريال.', null, 'https://ksa.puregymarabia.com/en-gb/membership-options', null, 'official'),
  ('gymnation', 'كور شهري – قرطبة الرياض', 229::numeric, null::numeric, 1::smallint, 'نادي واحد + جلسة تدريب شخصي أولى مجانية. نفس السعر لفرعي الرجال والسيدات بقرطبة.', null, 'https://gymnation.com/en-sa/gymsnearme/qurtubah-mens/', null, 'official'),
  ('gymnation', 'بلس شهري – كل الفروع', 250::numeric, null::numeric, 1::smallint, 'دخول كل فروع جيم نيشن (السعر من صفحة فرع قرطبة).', null, 'https://gymnation.com/en-sa/gymsnearme/qurtubah-mens/', null, 'official'),
  ('gymnation', 'سيغنتشر شهري', 399::numeric, null::numeric, 1::smallint, 'دخول كامل + برامج هايروكس وبلتز وبيلاتس ريفورمر.', null, 'https://gymnation.com/en-sa/gymsnearme/qurtubah-mens/', null, 'official'),
  ('gymnation', 'كور شهري – المروة جدة (سيدات)', 209::numeric, null::numeric, 1::smallint, 'فرع السيدات في لولو المروة بجدة، نادي واحد.', null, 'https://gymnation.com/en-sa/gymsnearme/al-marwah-ladies/', null, 'official'),
  ('fitness-first', 'تذكرة يوم – رجال', 35::numeric, null::numeric, 0::smallint, 'سعر الدخول ليوم واحد حسب دليل أندية الرياض.', null, 'https://houseofsaud.com/travel/riyadh-gym-guide/', '2026-04-23', 'article'),
  ('fitness-first', 'تذكرة يوم – سيدات', 69::numeric, null::numeric, 0::smallint, 'سعر الدخول ليوم واحد حسب دليل أندية الرياض.', null, 'https://houseofsaud.com/travel/riyadh-gym-guide/', '2026-04-23', 'article'),
  ('smart-fitness', 'عرض اليوم الوطني 96 – 3 شهور للسيدات', 1096::numeric, null::numeric, 3::smallint, '3 شهور + 30 يوم مجاناً لفروع السيدات. شامل الضريبة.', null, 'https://www.3orod.today/saudi-arabia-offers/national-day/smart-fitness-ladies-2-9-2026.html', '2026-09-02', 'article')
) as v(slug, title, price, old, months, details, ends_on, source, seen, conf)
join public.gym_chains c on c.slug = v.slug
where not exists (select 1 from public.gym_offers x where x.chain_id = c.id and x.title = v.title);
