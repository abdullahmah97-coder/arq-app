-- =====================================================================
-- خدمات النادي لكل فرع: مسبح، سونا، جاكوزي حار وبارد، مناشف، بار مشروبات، مواقف، برادات مياه…
--   * الكتالوج في جدول amenities (الأدمن يضيف خدمات جديدة بدون تحديث التطبيق)
--   * افتراضي للسلسلة (chain_amenities) + قيمة الفرع تغلبه (gym_amenities)
--   * الزوار يأكدون أو ينفون (amenity_votes) — يُحسب «موثّق» لمن سجّل حضور في الفرع
-- =====================================================================

create table if not exists public.amenities (
  key         text primary key check (key ~ '^[a-z0-9_]{2,30}$'),
  grp         text not null check (grp in ('wellness','services','facilities')),
  sort_order  smallint not null default 100,
  icon        text not null check (char_length(icon) <= 40),
  name_ar     text not null check (char_length(name_ar) between 2 and 40),
  name_en     text not null check (char_length(name_en) between 2 and 40),
  active      boolean not null default true
);
alter table public.amenities enable row level security;
create policy amenities_read on public.amenities for select to authenticated using (true);
create policy amenities_admin on public.amenities for all to authenticated using (is_admin()) with check (is_admin());

insert into public.amenities (key, grp, sort_order, icon, name_ar, name_en) values
  ('pool',              'wellness',   10, 'pool',                     'مسبح',                 'Swimming pool'),
  ('sauna',             'wellness',   20, 'fire',                     'سونا',                 'Sauna'),
  ('steam',             'wellness',   30, 'kettle-steam',             'غرفة بخار',            'Steam room'),
  ('jacuzzi_hot',       'wellness',   40, 'hot-tub',                  'جاكوزي حار',           'Hot jacuzzi'),
  ('jacuzzi_cold',      'wellness',   50, 'snowflake',                'جاكوزي بارد',          'Cold plunge'),
  ('trainers',          'services',   60, 'account-tie',              'مدربين',               'Coaches'),
  ('personal_training', 'services',   70, 'weight-lifter',            'تدريب شخصي',           'Personal training'),
  ('group_classes',     'services',   80, 'account-group',            'حصص جماعية',           'Group classes'),
  ('towels',            'services',   90, 'hanger',                   'خدمة المناشف',         'Towel service'),
  ('drinks_bar',        'services',  100, 'cup',                      'بار مشروبات',          'Drinks bar'),
  ('supplements_shop',  'services',  110, 'store',                    'متجر مكملات',          'Supplements shop'),
  ('water_coolers',     'services',  120, 'cup-water',                'برادات مياه',          'Water coolers'),
  ('lockers',           'facilities',130, 'locker-multiple',          'خزائن',                'Lockers'),
  ('showers',           'facilities',140, 'shower-head',              'دشوش',                 'Showers'),
  ('parking',           'facilities',150, 'parking',                  'مواقف',                'Parking'),
  ('prayer_room',       'facilities',160, 'mosque',                   'مصلى',                 'Prayer room'),
  ('women_section',     'facilities',170, 'face-woman-outline',       'قسم للسيدات',          'Women''s section'),
  ('kids_area',         'facilities',180, 'human-child',              'منطقة أطفال',          'Kids area'),
  ('squash',            'facilities',190, 'racquetball',              'ملاعب اسكواش',         'Squash courts'),
  ('open_24h',          'facilities',200, 'hours-24',                 'مفتوح ٢٤ ساعة',        'Open 24 hours'),
  ('wifi',              'facilities',210, 'wifi',                     'واي فاي',              'Wi-Fi'),
  ('accessible',        'facilities',220, 'wheelchair-accessibility', 'مهيأ لذوي الإعاقة',    'Wheelchair accessible'),
  ('other',             'facilities',990, 'dots-horizontal',          'خدمات أخرى',           'Other services')
on conflict (key) do nothing;

-- ---------- افتراضي السلسلة ----------
create table if not exists public.chain_amenities (
  chain_id    uuid not null references public.gym_chains(id) on delete cascade,
  amenity     text not null references public.amenities(key) on delete cascade,
  available   boolean not null,
  note        text check (char_length(note) <= 120),
  source      text not null default 'manager' check (source in ('manager','admin','public_info')),
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (chain_id, amenity)
);
alter table public.chain_amenities enable row level security;
create policy chain_amen_read on public.chain_amenities for select to authenticated using (true);
create policy chain_amen_write on public.chain_amenities for all to authenticated
  using (can_manage_chain(chain_id)) with check (can_manage_chain(chain_id));

-- ---------- قيمة الفرع (تغلب افتراضي السلسلة) ----------
create table if not exists public.gym_amenities (
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  amenity     text not null references public.amenities(key) on delete cascade,
  available   boolean not null,
  note        text check (char_length(note) <= 120),
  hours       text check (char_length(hours) <= 60),
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (gym_id, amenity)
);
create index if not exists gym_amenities_amenity_idx on public.gym_amenities (amenity, available);

create or replace function public.can_manage_gym_or_chain(p_gym uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select can_manage_gym(p_gym)
      or exists (select 1 from gyms g where g.id = p_gym and g.chain_id is not null and can_manage_chain(g.chain_id));
$$;
revoke all on function public.can_manage_gym_or_chain(uuid) from public, anon;
grant execute on function public.can_manage_gym_or_chain(uuid) to authenticated;

alter table public.gym_amenities enable row level security;
create policy gym_amen_read on public.gym_amenities for select to authenticated using (true);
create policy gym_amen_write on public.gym_amenities for all to authenticated
  using (can_manage_gym_or_chain(gym_id)) with check (can_manage_gym_or_chain(gym_id));

create or replace function public._amenity_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
drop trigger if exists gym_amenities_touch on public.gym_amenities;
create trigger gym_amenities_touch before insert or update on public.gym_amenities for each row execute function public._amenity_touch();
drop trigger if exists chain_amenities_touch on public.chain_amenities;
create trigger chain_amenities_touch before insert or update on public.chain_amenities for each row execute function public._amenity_touch();

-- ---------- تأكيد الزوار ----------
create table if not exists public.amenity_votes (
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  amenity     text not null references public.amenities(key) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  vote        boolean not null,               -- true = موجودة، false = مو موجودة
  created_at  timestamptz not null default now(),
  primary key (gym_id, amenity, user_id)
);
alter table public.amenity_votes enable row level security;
create policy amen_votes_own_read on public.amenity_votes for select to authenticated using (user_id = auth.uid());
create policy amen_votes_own_ins on public.amenity_votes for insert to authenticated with check (user_id = auth.uid());
create policy amen_votes_own_upd on public.amenity_votes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy amen_votes_own_del on public.amenity_votes for delete to authenticated using (user_id = auth.uid());

-- ---------- خدمات فرع: القيمة الفعلية + مصدرها + أصوات الزوار ----------
create or replace function public.gym_services(p_gym uuid)
returns table (key text, grp text, sort_order smallint, icon text, name_ar text, name_en text,
               available boolean, note text, hours text, source text,
               yes_votes integer, no_votes integer, yes_verified integer, no_verified integer, my_vote boolean)
language sql stable security definer set search_path = public as $$
  with g as (select id, chain_id from gyms where id = p_gym),
  v as (
    select av.amenity, av.vote,
           exists (select 1 from check_ins c where c.user_id = av.user_id and c.gym_id = av.gym_id) as verified,
           av.user_id = auth.uid() as mine
    from amenity_votes av where av.gym_id = p_gym
  )
  select a.key, a.grp, a.sort_order, a.icon, a.name_ar, a.name_en,
         coalesce(ga.available, ca.available) as available,
         coalesce(ga.note, ca.note) as note,
         ga.hours,
         case when ga.gym_id is not null then 'gym' when ca.chain_id is not null then ca.source else null end as source,
         (select count(*) from v where v.amenity = a.key and v.vote)::int,
         (select count(*) from v where v.amenity = a.key and not v.vote)::int,
         (select count(*) from v where v.amenity = a.key and v.vote and v.verified)::int,
         (select count(*) from v where v.amenity = a.key and not v.vote and v.verified)::int,
         (select v.vote from v where v.amenity = a.key and v.mine limit 1)
  from amenities a
  cross join g
  left join gym_amenities ga on ga.gym_id = g.id and ga.amenity = a.key
  left join chain_amenities ca on ca.chain_id = g.chain_id and ca.amenity = a.key
  where a.active
  order by a.sort_order;
$$;
revoke all on function public.gym_services(uuid) from public, anon;
grant execute on function public.gym_services(uuid) to authenticated;

-- ---------- ملخص السلسلة: كم فرع فيه كل خدمة ----------
create or replace function public.chain_services(p_chain uuid)
returns table (key text, grp text, sort_order smallint, icon text, name_ar text, name_en text,
               chain_default boolean, note text, branches_yes integer, branches_known integer, branches integer)
language sql stable security definer set search_path = public as $$
  with b as (select id from gyms where chain_id = p_chain and verified),
  eff as (
    select a.key, b.id as gym_id, coalesce(ga.available, ca.available) as available
    from amenities a cross join b
    left join gym_amenities ga on ga.gym_id = b.id and ga.amenity = a.key
    left join chain_amenities ca on ca.chain_id = p_chain and ca.amenity = a.key
    where a.active
  )
  select a.key, a.grp, a.sort_order, a.icon, a.name_ar, a.name_en,
         ca.available, ca.note,
         (select count(*) from eff where eff.key = a.key and eff.available)::int,
         (select count(*) from eff where eff.key = a.key and eff.available is not null)::int,
         (select count(*) from b)::int
  from amenities a
  left join chain_amenities ca on ca.chain_id = p_chain and ca.amenity = a.key
  where a.active
  order by a.sort_order;
$$;
revoke all on function public.chain_services(uuid) from public, anon;
grant execute on function public.chain_services(uuid) to authenticated;

-- ---------- فلترة الدليل: الفروع (أو السلاسل) اللي فيها كل الخدمات المطلوبة ----------
create or replace function public.gyms_with_services(p_keys text[])
returns setof uuid language sql stable security definer set search_path = public as $$
  select g.id from gyms g
  where not exists (
    select 1 from unnest(p_keys) k(key)
    where coalesce(
      (select ga.available from gym_amenities ga where ga.gym_id = g.id and ga.amenity = k.key),
      (select ca.available from chain_amenities ca where ca.chain_id = g.chain_id and ca.amenity = k.key),
      false) is not true
  );
$$;
revoke all on function public.gyms_with_services(text[]) from public, anon;
grant execute on function public.gyms_with_services(text[]) to authenticated;

create or replace function public.chains_with_services(p_keys text[])
returns setof uuid language sql stable security definer set search_path = public as $$
  select c.id from gym_chains c
  where c.active and not exists (
    select 1 from unnest(p_keys) k(key)
    where not (
      exists (select 1 from chain_amenities ca where ca.chain_id = c.id and ca.amenity = k.key and ca.available)
      or exists (select 1 from gyms g join gym_amenities ga on ga.gym_id = g.id
                 where g.chain_id = c.id and ga.amenity = k.key and ga.available)
    )
  );
$$;
revoke all on function public.chains_with_services(text[]) from public, anon;
grant execute on function public.chains_with_services(text[]) to authenticated;

-- ---------- بداية: خدمات مذكورة صراحة في وصف السلاسل الرسمي (مصدرها معلومات عامة، والمدير يعدّلها) ----------
insert into public.chain_amenities (chain_id, amenity, available, note, source)
select c.id, v.amenity, true, v.note, 'public_info'
from (values
  ('fitness-time',      'pool',          null::text),
  ('fitness-time',      'jacuzzi_hot',   null),
  ('fitness-time',      'squash',        'حسب الفرع'),
  ('fitness-time-plus', 'pool',          null),
  ('fitness-time-plus', 'jacuzzi_hot',   null),
  ('fitness-time-plus', 'steam',         null),
  ('fitness-time-plus', 'sauna',         null),
  ('fitness-time-pro',  'pool',          null),
  ('bfit',              'group_classes', null),
  ('bfit',              'pool',          'حسب الفرع'),
  ('body-motions',      'pool',          null),
  ('body-motions',      'jacuzzi_hot',   null),
  ('body-motions',      'steam',         null),
  ('body-motions',      'sauna',         null),
  ('puregym',           'open_24h',      null),
  ('gymnation',         'open_24h',      null),
  ('gymnation',         'group_classes', null),
  ('snap-fitness',      'open_24h',      'للأعضاء')
) as v(slug, amenity, note)
join public.gym_chains c on c.slug = v.slug
on conflict (chain_id, amenity) do nothing;
