-- =====================================================================
-- النوادي القريبة من مزود خرائط: تسجيل الحضور يشتغل في أي نادي حقيقي بدون ما يضيفه أحد يدوياً
--   * دالة الحافة gyms-nearby تجيب النوادي حول موقع المستخدم (OpenStreetMap مجاناً، أو Google Places إذا أُضيف مفتاح)
--   * تضيفها هنا كنوادي موثّقة (مكان حقيقي من الخريطة) وتربطها بسلسلتها إذا طابق الاسم (وقت اللياقة، جولدز…)
--   * كل منطقة (~٢ كم) تُمسح مرة كل أسبوعين فقط
-- =====================================================================
alter table public.gyms
  add column if not exists source      text not null default 'user' check (source in ('user','osm','google','admin')),
  add column if not exists external_id text check (char_length(external_id) <= 200),
  add column if not exists address     text check (char_length(address) <= 200);
create unique index if not exists gyms_source_external on public.gyms (source, external_id) where external_id is not null;

-- سجل المناطق الممسوحة (للخادم فقط — بدون صلاحيات للمستخدمين)
create table if not exists public.gym_area_scans (
  cell        text primary key check (char_length(cell) <= 40),
  provider    text not null check (provider in ('osm','google')),
  scanned_at  timestamptz not null default now(),
  found       integer not null default 0
);
alter table public.gym_area_scans enable row level security;
revoke all on public.gym_area_scans from anon, authenticated;

-- مفتاح مقارنة الأسماء: حروف وأرقام فقط، بدون KSA/Arabia في آخر الاسم الإنجليزي
create or replace function public._name_key(p text)
returns text language sql immutable as $$
  select lower(regexp_replace(regexp_replace(coalesce(p, ''), '\s+(ksa|arabia|saudi arabia)\s*$', '', 'i'),
                              '[[:space:]_''’`".,&|/()+:ـ-]+', '', 'g'));
$$;

-- ربط النادي بسلسلته من اسمه (الأطول يغلب: «وقت اللياقة بلس» قبل «وقت اللياقة»)
create or replace function public._match_chain(p_name text)
returns uuid language sql stable set search_path = public as $$
  with k as (select _name_key(p_name) as n)
  select c.id from gym_chains c, k
  where c.active and char_length(k.n) >= 3 and (
        (char_length(_name_key(c.name_en)) >= 4 and position(_name_key(c.name_en) in k.n) > 0)
     or (char_length(_name_key(c.name)) >= 3 and position(_name_key(c.name) in k.n) > 0))
  order by greatest(char_length(_name_key(c.name_en)), char_length(_name_key(c.name))) desc
  limit 1;
$$;
revoke all on function public._name_key(text) from public, anon, authenticated;
revoke all on function public._match_chain(text) from public, anon, authenticated;

-- إضافة/تحديث نوادي المزود — للخادم فقط (service_role)
create or replace function public.upsert_provider_gyms(p_source text, p_places jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_n   integer := 0;
  r     jsonb;
  v_lat double precision;
  v_lng double precision;
begin
  if p_source not in ('osm','google') then raise exception 'bad_source'; end if;
  for r in select value from jsonb_array_elements(coalesce(p_places, '[]'::jsonb)) loop
    continue when coalesce(r->>'id', '') = '' or coalesce(btrim(r->>'name'), '') = '';
    v_lat := (r->>'lat')::double precision;
    v_lng := (r->>'lng')::double precision;
    continue when v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180;
    insert into gyms (name, name_en, city, address, lat, lng, radius_m, verified, source, external_id, chain_id)
    values (left(btrim(r->>'name'), 80),
            nullif(left(btrim(coalesce(r->>'name_en', '')), 80), ''),
            nullif(left(btrim(coalesce(r->>'city', '')), 60), ''),
            nullif(left(btrim(coalesce(r->>'address', '')), 200), ''),
            v_lat, v_lng, 200, true, p_source, left(r->>'id', 200),
            _match_chain(concat_ws(' ', r->>'name', r->>'name_en')))
    on conflict (source, external_id) where external_id is not null do update set
      name     = excluded.name,
      name_en  = coalesce(excluded.name_en, gyms.name_en),
      city     = coalesce(excluded.city, gyms.city),
      address  = coalesce(excluded.address, gyms.address),
      lat      = excluded.lat,
      lng      = excluded.lng,
      chain_id = coalesce(gyms.chain_id, excluded.chain_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.upsert_provider_gyms(text, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_provider_gyms(text, jsonb) to service_role;

-- النوادي القريبة: نضيف العنوان والسلسلة (لعرضها في قائمة الاختيار)
drop function if exists public.nearby_gyms(double precision, double precision, double precision);
create or replace function public.nearby_gyms(p_lat double precision, p_lng double precision,
                                              p_km double precision default 25)
returns table (id uuid, name text, name_en text, city text, lat double precision,
               lng double precision, radius_m integer, verified boolean, distance_m double precision,
               address text, chain_id uuid)
language sql stable as $$
  select g.id, g.name, g.name_en, g.city, g.lat, g.lng, g.radius_m, g.verified,
         distance_m(p_lat, p_lng, g.lat, g.lng) as d, g.address, g.chain_id
  from gyms g
  where distance_m(p_lat, p_lng, g.lat, g.lng) <= p_km * 1000
  order by d
  limit 50;
$$;
revoke all on function public.nearby_gyms(double precision, double precision, double precision) from public, anon;
grant execute on function public.nearby_gyms(double precision, double precision, double precision) to authenticated;
