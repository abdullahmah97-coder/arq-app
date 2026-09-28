-- =====================================================================
-- مزود ثالث للنوادي: Foursquare Places (يشتغل تلقائياً لو أُضيف FOURSQUARE_API_KEY في أسرار الدوال)
--   * ترتيب المزودين: Google ← Foursquare ← OpenStreetMap (المجاني)
--   * نفس النادي من مزودين مختلفين ما يتكرر: لو فيه نادي بنفس الاسم على بعد أقل من ٨٠ م نستخدمه
-- =====================================================================

-- نسمح بالمصدر الجديد (نحذف قيود المصدر القديمة أياً كان اسمها)
do $$
declare c record;
begin
  for c in select conname, conrelid::regclass as tbl from pg_constraint
           where contype = 'c' and conrelid in ('public.gyms'::regclass, 'public.gym_area_scans'::regclass)
             and (pg_get_constraintdef(oid) like '%source%''osm''%' or pg_get_constraintdef(oid) like '%provider%''osm''%')
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;
alter table public.gyms add constraint gyms_source_check
  check (source in ('user','osm','google','foursquare','admin'));
alter table public.gym_area_scans add constraint gym_area_scans_provider_check
  check (provider in ('osm','google','foursquare'));

-- إضافة/تحديث نوادي المزود وترجع لكل مكان رقم النادي عندنا: { "<معرّف المزود>": "<gym id>" }
create or replace function public.upsert_provider_gyms_ids(p_source text, p_places jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_out jsonb := '{}'::jsonb;
  r     jsonb;
  v_id  uuid;
  v_lat double precision;
  v_lng double precision;
  v_key text;
  v_key2 text;
begin
  if p_source not in ('osm','google','foursquare') then raise exception 'bad_source'; end if;
  for r in select value from jsonb_array_elements(coalesce(p_places, '[]'::jsonb)) loop
    continue when coalesce(r->>'id', '') = '' or coalesce(btrim(r->>'name'), '') = '';
    v_lat := (r->>'lat')::double precision;
    v_lng := (r->>'lng')::double precision;
    continue when v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180;

    -- ١) نفس المكان من نفس المزود: نحدّثه
    select id into v_id from gyms where source = p_source and external_id = left(r->>'id', 200);
    if v_id is not null then
      update gyms set
        name     = left(btrim(r->>'name'), 80),
        name_en  = coalesce(nullif(left(btrim(coalesce(r->>'name_en', '')), 80), ''), name_en),
        city     = coalesce(nullif(left(btrim(coalesce(r->>'city', '')), 60), ''), city),
        address  = coalesce(nullif(left(btrim(coalesce(r->>'address', '')), 200), ''), address),
        lat      = v_lat,
        lng      = v_lng,
        chain_id = coalesce(chain_id, _match_chain(concat_ws(' ', r->>'name', r->>'name_en')))
      where id = v_id;
    else
      -- ٢) نفس النادي من مزود ثاني (نفس الاسم وعلى بعد أقل من ٨٠ م): نستخدمه بدل ما نكرره
      v_key := _name_key(r->>'name');
      v_key2 := _name_key(r->>'name_en');
      select g.id into v_id from gyms g
      where g.source in ('osm','google','foursquare','admin')
        and g.lat between v_lat - 0.001 and v_lat + 0.001 and g.lng between v_lng - 0.001 and v_lng + 0.001
        and distance_m(g.lat, g.lng, v_lat, v_lng) < 80
        and ((char_length(v_key) >= 3 and v_key in (_name_key(g.name), _name_key(g.name_en)))
          or (char_length(v_key2) >= 3 and v_key2 in (_name_key(g.name), _name_key(g.name_en))))
      order by distance_m(g.lat, g.lng, v_lat, v_lng)
      limit 1;
      if v_id is not null then
        update gyms set
          name_en = coalesce(name_en, nullif(left(btrim(coalesce(r->>'name_en', '')), 80), '')),
          city    = coalesce(city, nullif(left(btrim(coalesce(r->>'city', '')), 60), '')),
          address = coalesce(address, nullif(left(btrim(coalesce(r->>'address', '')), 200), ''))
        where id = v_id;
      else
        -- ٣) نادي جديد (لو طلبين بنفس اللحظة أضافوه، نأخذ الموجود)
        begin
          insert into gyms (name, name_en, city, address, lat, lng, radius_m, verified, source, external_id, chain_id)
          values (left(btrim(r->>'name'), 80),
                  nullif(left(btrim(coalesce(r->>'name_en', '')), 80), ''),
                  nullif(left(btrim(coalesce(r->>'city', '')), 60), ''),
                  nullif(left(btrim(coalesce(r->>'address', '')), 200), ''),
                  v_lat, v_lng, 200, true, p_source, left(r->>'id', 200),
                  _match_chain(concat_ws(' ', r->>'name', r->>'name_en')))
          returning id into v_id;
        exception when unique_violation then
          select id into v_id from gyms where source = p_source and external_id = left(r->>'id', 200);
        end;
      end if;
    end if;
    v_out := v_out || jsonb_build_object(r->>'id', v_id);
  end loop;
  return v_out;
end $$;

-- النسخة القديمة (ترجع العدد) تبقى تشتغل للدالة المنشورة سابقاً
create or replace function public.upsert_provider_gyms(p_source text, p_places jsonb)
returns integer language sql security definer set search_path = public as $$
  select count(*)::integer from jsonb_object_keys(upsert_provider_gyms_ids(p_source, p_places));
$$;

revoke all on function public.upsert_provider_gyms_ids(text, jsonb) from public, anon, authenticated;
revoke all on function public.upsert_provider_gyms(text, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_provider_gyms_ids(text, jsonb) to service_role;
grant execute on function public.upsert_provider_gyms(text, jsonb) to service_role;
