-- =====================================================================
-- حجز الملاعب والحصص: كورة، بادل، تنس، يوقا، بيلاتس
--   * venues: الملعب أو الاستوديو (شريك ينضم بموافقة الإدارة، أو مدرج من أرك من موقعه الرسمي مع زر «احجز من موقعهم»)
--   * venue_courts: ملاعب الكورة والبادل والتنس (الحجز بالوقت حسب ساعات العمل ومدة الحجز)
--   * venue_classes: حصص اليوقا والبيلاتس الأسبوعية (الحجز بالمقعد حسب السعة)
--   * venue_bookings: الحجوزات. ما ينكتب فيها إلا عن طريق الدوال (ما فيه حجزين على نفس الملعب ونفس الوقت)
--   * تنبيه للمستخدم بالموعد أول ما يحجز أو يتأكد حجزه، وتذكير قبل الموعد بساعة، وتنبيه للملعب بكل حجز جديد
--   * الدفع في المكان لين يتفعل الدفع الإلكتروني
-- =====================================================================

-- ---------- نوع الحساب: ملعب أو استوديو ----------
alter table public.profiles drop constraint if exists profiles_account_type_check;
alter table public.profiles add constraint profiles_account_type_check
  check (account_type in ('trainee','club','coach','store','restaurant','center','venue'));

-- ---------- الملاعب والاستوديوهات ----------
create table if not exists public.venues (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid unique references public.profiles(id) on delete cascade,  -- فاضي = مدرج من أرك
  listed_by     text not null default 'owner' check (listed_by in ('owner','arq')),
  sports        text[] not null check (cardinality(sports) between 1 and 5
                  and sports <@ array['football','padel','tennis','yoga','pilates']::text[]),
  name          text not null check (char_length(btrim(name)) between 2 and 80),
  name_en       text check (name_en is null or char_length(btrim(name_en)) between 2 and 80),
  city          text not null check (char_length(btrim(city)) between 2 and 40),
  city_en       text check (city_en is null or char_length(city_en) <= 40),
  district      text check (district is null or char_length(district) <= 60),
  district_en   text check (district_en is null or char_length(district_en) <= 60),
  audience      text check (audience is null or audience in ('men','women','mixed')),
  about         text check (about is null or char_length(about) <= 500),
  about_en      text check (about_en is null or char_length(about_en) <= 500),
  phone         text check (phone is null or phone ~ '^\+?[0-9 ]{6,20}$'),
  maps_url      text check (maps_url is null or (char_length(maps_url) <= 300 and maps_url ~* '^https://[^\s]+$')),
  booking_url   text check (booking_url is null or (char_length(booking_url) <= 300 and booking_url ~* '^https://[^\s]+$')),
  website       text check (website is null or (char_length(website) <= 300 and website ~* '^https://[^\s]+$')),
  instagram     text check (instagram is null or instagram ~ '^[A-Za-z0-9_.]{1,30}$'),
  source_url    text check (source_url is null or (char_length(source_url) <= 300 and source_url ~* '^https://[^\s]+$')),
  image_path    text check (image_path is null or char_length(image_path) <= 200),
  -- الملاعب: ساعات العمل (الإغلاق بعد ١٢ الليل يكتب ٢٥، ٢٦…) ومدة الحجز والسعر
  open_hour     smallint not null default 16 check (open_hour between 0 and 23),
  close_hour    smallint not null default 24 check (close_hour between 1 and 30),
  slot_min      smallint not null default 60 check (slot_min in (30, 60, 90, 120)),
  price_sar     numeric(7,2) check (price_sar is null or price_sar between 0 and 5000),
  auto_confirm  boolean not null default false,
  status        text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  review_note   text check (review_note is null or char_length(review_note) <= 300),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (close_hour > open_hour and close_hour - open_hour <= 24),
  check (listed_by = 'arq' or owner is not null)
);
create index if not exists venues_status_idx on public.venues (status);
create index if not exists venues_sports_idx on public.venues using gin (sports);

create or replace function public.can_manage_venue(p_venue uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_admin() or exists (select 1 from venues where id = p_venue and owner = auth.uid());
$$;

-- صاحب الملعب ما يغيّر حالة المراجعة، ولو كان مرفوض وعدّل يرجع «قيد المراجعة»
create or replace function public._venue_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if current_user not in ('authenticated','anon') or is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.owner := auth.uid(); new.listed_by := 'owner'; new.status := 'pending'; new.review_note := null; new.source_url := null;
  else
    if new.owner is distinct from old.owner or new.listed_by is distinct from old.listed_by
       or new.review_note is distinct from old.review_note or new.source_url is distinct from old.source_url then
      raise exception 'not_allowed';
    end if;
    if old.status = 'rejected' then new.status := 'pending';
    elsif new.status is distinct from old.status then raise exception 'status_locked';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists venue_guard on public.venues;
create trigger venue_guard before insert or update on public.venues for each row execute function public._venue_guard();

-- الإدارة تعرف بكل طلب جديد أو معدّل
create or replace function public._venue_submitted() returns trigger language plpgsql security definer set search_path = public as $$
declare v_a uuid;
begin
  if new.status = 'pending' and new.listed_by = 'owner' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    for v_a in select user_id from app_admins loop
      perform _notice(v_a, 'vn:' || new.id || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
        'ملعب أو استوديو ينتظر اعتمادك', new.name || ' طلب ينضم لحجز الملاعب والحصص. راجعه من لوحة إدارة التطبيق.',
        'Venue to review', coalesce(new.name_en, new.name) || ' asked to join court and class booking. Review it in App management.',
        '/owner', new.id);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists venue_submitted on public.venues;
create trigger venue_submitted after insert or update on public.venues for each row execute function public._venue_submitted();

alter table public.venues enable row level security;
drop policy if exists venue_read on public.venues;
create policy venue_read on public.venues for select to authenticated using (status = 'approved' or owner = auth.uid() or is_admin());
drop policy if exists venue_insert on public.venues;
create policy venue_insert on public.venues for insert to authenticated with check (owner = auth.uid() or is_admin());
drop policy if exists venue_update on public.venues;
create policy venue_update on public.venues for update to authenticated using (owner = auth.uid() or is_admin()) with check (owner = auth.uid() or is_admin());
drop policy if exists venue_delete on public.venues;
create policy venue_delete on public.venues for delete to authenticated using (is_admin());

-- ---------- الملاعب (كورة، بادل، تنس) ----------
create table if not exists public.venue_courts (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  sport       text not null check (sport in ('football','padel','tennis')),
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  active      boolean not null default true,
  sort        smallint not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists venue_courts_venue_idx on public.venue_courts (venue_id, sort);

-- ---------- الحصص الأسبوعية (يوقا، بيلاتس) ----------
create table if not exists public.venue_classes (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null references public.venues(id) on delete cascade,
  sport         text not null check (sport in ('yoga','pilates')),
  title         text not null check (char_length(btrim(title)) between 2 and 60),
  title_en      text check (title_en is null or char_length(title_en) <= 60),
  weekday       smallint not null check (weekday between 0 and 6),  -- ٠ = الأحد
  start_time    time not null,
  duration_min  smallint not null default 50 check (duration_min between 20 and 180),
  capacity      smallint not null default 10 check (capacity between 1 and 60),
  coach_name    text check (coach_name is null or char_length(coach_name) <= 60),
  price_sar     numeric(7,2) check (price_sar is null or price_sar between 0 and 2000),
  audience      text not null default 'mixed' check (audience in ('men','women','mixed')),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists venue_classes_venue_idx on public.venue_classes (venue_id, weekday, start_time);

-- الملعب أو الحصة لازم تكون من رياضات المكان
create or replace function public._venue_item_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from venues where id = new.venue_id and new.sport = any(sports)) then raise exception 'bad_sport'; end if;
  return new;
end $$;
drop trigger if exists venue_courts_guard on public.venue_courts;
create trigger venue_courts_guard before insert or update on public.venue_courts for each row execute function public._venue_item_guard();
drop trigger if exists venue_classes_guard on public.venue_classes;
create trigger venue_classes_guard before insert or update on public.venue_classes for each row execute function public._venue_item_guard();

alter table public.venue_courts enable row level security;
drop policy if exists vcourt_read on public.venue_courts;
create policy vcourt_read on public.venue_courts for select to authenticated
  using (exists (select 1 from venues v where v.id = venue_id and v.status = 'approved') or can_manage_venue(venue_id));
drop policy if exists vcourt_write on public.venue_courts;
create policy vcourt_write on public.venue_courts for all to authenticated using (can_manage_venue(venue_id)) with check (can_manage_venue(venue_id));

alter table public.venue_classes enable row level security;
drop policy if exists vclass_read on public.venue_classes;
create policy vclass_read on public.venue_classes for select to authenticated
  using (exists (select 1 from venues v where v.id = venue_id and v.status = 'approved') or can_manage_venue(venue_id));
drop policy if exists vclass_write on public.venue_classes;
create policy vclass_write on public.venue_classes for all to authenticated using (can_manage_venue(venue_id)) with check (can_manage_venue(venue_id));

-- ---------- الحجوزات ----------
create table if not exists public.venue_bookings (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  court_id    uuid references public.venue_courts(id) on delete cascade,
  class_id    uuid references public.venue_classes(id) on delete cascade,
  sport       text not null check (sport in ('football','padel','tennis','yoga','pilates')),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  status      text not null default 'pending' check (status in ('pending','confirmed','declined','cancelled','done','no_show')),
  price_sar   numeric(7,2),
  note        text check (note is null or char_length(note) <= 200),
  venue_note  text check (venue_note is null or char_length(venue_note) <= 200),
  reminded_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check ((court_id is null) <> (class_id is null)),
  check (ends_at > starts_at)
);
-- ما فيه حجزين فعّالين على نفس الملعب ونفس البداية، ولا مقعدين لنفس الشخص في نفس الحصة
create unique index if not exists venue_bookings_court_slot on public.venue_bookings (court_id, starts_at)
  where court_id is not null and status in ('pending','confirmed');
create unique index if not exists venue_bookings_class_seat on public.venue_bookings (class_id, starts_at, user_id)
  where class_id is not null and status in ('pending','confirmed');
create index if not exists venue_bookings_user_idx on public.venue_bookings (user_id, starts_at desc);
create index if not exists venue_bookings_venue_idx on public.venue_bookings (venue_id, starts_at);

alter table public.venue_bookings enable row level security;
drop policy if exists vbook_read on public.venue_bookings;
create policy vbook_read on public.venue_bookings for select to authenticated using (user_id = auth.uid() or can_manage_venue(venue_id));
-- ما فيه إضافة أو تعديل مباشر: كله من الدوال تحت

-- ---------- أدوات النصوص ----------
-- «الخميس 1/10 الساعة 20:00» بتوقيت الرياض
create or replace function public._venue_when(p_ts timestamptz, p_loc text default 'ar')
returns text language sql immutable set search_path = public as $$
  select case when p_loc = 'en'
    then (array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[extract(dow from p_ts at time zone 'Asia/Riyadh')::int + 1]
         || ' ' || to_char(p_ts at time zone 'Asia/Riyadh', 'FMDD/FMMM') || ' at ' || to_char(p_ts at time zone 'Asia/Riyadh', 'HH24:MI')
    else (array['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'])[extract(dow from p_ts at time zone 'Asia/Riyadh')::int + 1]
         || ' ' || to_char(p_ts at time zone 'Asia/Riyadh', 'FMDD/FMMM') || ' الساعة ' || to_char(p_ts at time zone 'Asia/Riyadh', 'HH24:MI')
  end;
$$;

create or replace function public._sport_name(p_sport text, p_loc text default 'ar')
returns text language sql immutable as $$
  select case when p_loc = 'en' then
    case p_sport when 'football' then 'Football' when 'padel' then 'Padel' when 'tennis' then 'Tennis' when 'yoga' then 'Yoga' else 'Pilates' end
  else
    case p_sport when 'football' then 'كورة' when 'padel' then 'بادل' when 'tennis' then 'تنس' when 'yoga' then 'يوقا' else 'بيلاتس' end
  end;
$$;

-- وصف الحجز: «بادل · ملعب 2» أو «يوقا · يوقا الصباح»
create or replace function public._booking_label(b venue_bookings, p_loc text default 'ar')
returns text language sql stable security definer set search_path = public as $$
  select _sport_name(b.sport, p_loc) || ' · ' || coalesce(
    (select name from venue_courts where id = b.court_id),
    (select case when p_loc = 'en' then coalesce(title_en, title) else title end from venue_classes where id = b.class_id), '');
$$;

-- ---------- أوقات الملعب المحجوزة (بدون أسماء) ----------
create or replace function public.venue_taken(p_venue uuid, p_from timestamptz, p_to timestamptz)
returns table (court_id uuid, starts_at timestamptz, ends_at timestamptz, mine boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not exists (select 1 from venues v where v.id = p_venue and (v.status = 'approved' or can_manage_venue(v.id))) then return; end if;
  if p_to <= p_from or p_to - p_from > interval '3 days' then raise exception 'bad_range'; end if;
  return query
    select b.court_id, b.starts_at, b.ends_at, b.user_id = auth.uid()
    from venue_bookings b
    where b.venue_id = p_venue and b.court_id is not null and b.status in ('pending','confirmed')
      and b.starts_at < p_to and b.ends_at > p_from
    order by b.starts_at;
end $$;
revoke all on function public.venue_taken(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.venue_taken(uuid, timestamptz, timestamptz) to authenticated;

-- هل الوقت على جدول الملعب؟ (يدخل فيه اللي بعد ١٢ الليل كجزء من اليوم اللي قبله)
create or replace function public._venue_slot_ok(v venues, p_starts timestamptz)
returns boolean language plpgsql immutable as $$
declare l timestamp := p_starts at time zone 'Asia/Riyadh'; m integer; mm integer;
begin
  if extract(second from l) <> 0 then return false; end if;
  m := extract(hour from l)::int * 60 + extract(minute from l)::int;
  foreach mm in array array[m, m + 1440] loop
    if mm >= v.open_hour * 60 and mm + v.slot_min <= v.close_hour * 60 and (mm - v.open_hour * 60) % v.slot_min = 0 then
      return true;
    end if;
  end loop;
  return false;
end $$;

-- حد للحجوزات القادمة لكل مستخدم (عشان ما أحد يحجز كل الأوقات)
create or replace function public._booking_limit()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if (select count(*) from venue_bookings where user_id = auth.uid() and status in ('pending','confirmed') and starts_at > now()) >= 6 then
    raise exception 'too_many_bookings';
  end if;
end $$;

-- ---------- حجز ملعب ----------
create or replace function public.book_court(p_court uuid, p_starts timestamptz, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c venue_courts; v venues; v_end timestamptz; v_id uuid; v_status text; v_b venue_bookings;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  select * into c from venue_courts where id = p_court;
  select * into v from venues where id = c.venue_id;
  if c.id is null or not c.active or v.status <> 'approved' or v.listed_by <> 'owner' then raise exception 'venue_unavailable'; end if;
  if p_starts < now() + interval '10 minutes' then raise exception 'too_late'; end if;
  if p_starts > now() + interval '21 days' then raise exception 'too_far_ahead'; end if;
  if not _venue_slot_ok(v, p_starts) then raise exception 'bad_slot'; end if;
  v_end := p_starts + make_interval(mins => v.slot_min);
  perform _booking_limit();
  -- قفل على الملعب عشان ما يدخل حجزين بنفس اللحظة
  perform pg_advisory_xact_lock(hashtext('court:' || p_court::text));
  if exists (select 1 from venue_bookings b where b.court_id = p_court and b.status in ('pending','confirmed')
               and b.starts_at < v_end and b.ends_at > p_starts) then
    raise exception 'slot_taken';
  end if;
  v_status := case when v.auto_confirm then 'confirmed' else 'pending' end;
  insert into venue_bookings (venue_id, user_id, court_id, sport, starts_at, ends_at, status, price_sar, note)
  values (v.id, auth.uid(), p_court, c.sport, p_starts, v_end, v_status, v.price_sar, nullif(left(btrim(coalesce(p_note, '')), 200), ''))
  returning * into v_b;
  v_id := v_b.id;

  -- للمستخدم: موعده (مؤكد أو ينتظر تأكيد الملعب)
  if v_status = 'confirmed' then
    perform _notice(auth.uid(), 'vb_ok:' || v_id, 'تأكد حجزك ✓', _booking_label(v_b) || ' في ' || v.name || ' · ' || _venue_when(p_starts) || '. الدفع في المكان.',
      'Booking confirmed ✓', _booking_label(v_b, 'en') || ' at ' || coalesce(v.name_en, v.name) || ' · ' || _venue_when(p_starts, 'en') || '. Pay at the venue.',
      '/bookings', v_id);
  else
    perform _notice(auth.uid(), 'vb_req:' || v_id, 'وصل طلب حجزك', _booking_label(v_b) || ' في ' || v.name || ' · ' || _venue_when(p_starts) || '. بيوصلك تنبيه أول ما يأكده الملعب.',
      'Booking request sent', _booking_label(v_b, 'en') || ' at ' || coalesce(v.name_en, v.name) || ' · ' || _venue_when(p_starts, 'en') || '. We''ll let you know once the venue confirms.',
      '/bookings', v_id);
  end if;
  -- للملعب: حجز جديد
  perform _notice(v.owner, 'vb_new:' || v_id, case when v_status = 'confirmed' then 'حجز جديد ✓' else 'طلب حجز جديد' end,
    _person_label(auth.uid()) || ' · ' || _booking_label(v_b) || ' · ' || _venue_when(p_starts),
    case when v_status = 'confirmed' then 'New booking ✓' else 'New booking request' end,
    _person_label(auth.uid()) || ' · ' || _booking_label(v_b, 'en') || ' · ' || _venue_when(p_starts, 'en'),
    '/venues/manage', v_id);
  return jsonb_build_object('id', v_id, 'status', v_status);
exception when unique_violation then
  raise exception 'slot_taken';
end $$;
revoke all on function public.book_court(uuid, timestamptz, text) from public, anon;
grant execute on function public.book_court(uuid, timestamptz, text) to authenticated;

-- ---------- جدول الحصص (الأسبوعين الجايين) ----------
create or replace function public.venue_class_schedule(p_venue uuid, p_days integer default 14)
returns table (class_id uuid, sport text, title text, title_en text, coach_name text, audience text, price_sar numeric,
               starts_at timestamptz, ends_at timestamptz, capacity integer, booked integer, my_booking uuid, my_status text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not exists (select 1 from venues v where v.id = p_venue and (v.status = 'approved' or can_manage_venue(v.id))) then return; end if;
  return query
    with occ as (
      select c.*, ((d::date + c.start_time)::timestamp at time zone 'Asia/Riyadh') as s
      from venue_classes c
      cross join generate_series(app_today()::timestamp, (app_today() + least(greatest(p_days, 1), 21) - 1)::timestamp, interval '1 day') d
      where c.venue_id = p_venue and c.active and extract(dow from d)::int = c.weekday
    )
    select o.id, o.sport, o.title, o.title_en, o.coach_name, o.audience, o.price_sar, o.s, o.s + make_interval(mins => o.duration_min),
           o.capacity::int,
           (select count(*)::int from venue_bookings b where b.class_id = o.id and b.starts_at = o.s and b.status in ('pending','confirmed')),
           (select b.id from venue_bookings b where b.class_id = o.id and b.starts_at = o.s and b.user_id = auth.uid() and b.status in ('pending','confirmed') limit 1),
           (select b.status from venue_bookings b where b.class_id = o.id and b.starts_at = o.s and b.user_id = auth.uid() and b.status in ('pending','confirmed') limit 1)
    from occ o
    where o.s > now()
    order by o.s, o.title;
end $$;
revoke all on function public.venue_class_schedule(uuid, integer) from public, anon;
grant execute on function public.venue_class_schedule(uuid, integer) to authenticated;

-- ---------- حجز مقعد في حصة (يتأكد على طول لو فيه مكان) ----------
create or replace function public.book_venue_class(p_class uuid, p_starts timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c venue_classes; v venues; l timestamp := p_starts at time zone 'Asia/Riyadh'; v_b venue_bookings;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  select * into c from venue_classes where id = p_class;
  select * into v from venues where id = c.venue_id;
  if c.id is null or not c.active or v.status <> 'approved' or v.listed_by <> 'owner' then raise exception 'venue_unavailable'; end if;
  if extract(dow from l)::int <> c.weekday or l::time <> c.start_time then raise exception 'bad_slot'; end if;
  if p_starts < now() + interval '5 minutes' then raise exception 'too_late'; end if;
  if p_starts > now() + interval '21 days' then raise exception 'too_far_ahead'; end if;
  perform _booking_limit();
  perform pg_advisory_xact_lock(hashtext('class:' || p_class::text || ':' || p_starts::text));
  if exists (select 1 from venue_bookings where class_id = p_class and starts_at = p_starts and user_id = auth.uid() and status in ('pending','confirmed')) then
    raise exception 'already_booked';
  end if;
  if (select count(*) from venue_bookings where class_id = p_class and starts_at = p_starts and status in ('pending','confirmed')) >= c.capacity then
    raise exception 'class_full';
  end if;
  insert into venue_bookings (venue_id, user_id, class_id, sport, starts_at, ends_at, status, price_sar)
  values (v.id, auth.uid(), p_class, c.sport, p_starts, p_starts + make_interval(mins => c.duration_min), 'confirmed', c.price_sar)
  returning * into v_b;
  perform _notice(auth.uid(), 'vb_ok:' || v_b.id, 'تأكد حجزك ✓', _booking_label(v_b) || ' في ' || v.name || ' · ' || _venue_when(p_starts) || '. الدفع في المكان.',
    'Booking confirmed ✓', _booking_label(v_b, 'en') || ' at ' || coalesce(v.name_en, v.name) || ' · ' || _venue_when(p_starts, 'en') || '. Pay at the venue.',
    '/bookings', v_b.id);
  perform _notice(v.owner, 'vb_new:' || v_b.id, 'حجز جديد ✓', _person_label(auth.uid()) || ' · ' || _booking_label(v_b) || ' · ' || _venue_when(p_starts),
    'New booking ✓', _person_label(auth.uid()) || ' · ' || _booking_label(v_b, 'en') || ' · ' || _venue_when(p_starts, 'en'), '/venues/manage', v_b.id);
  return jsonb_build_object('id', v_b.id, 'status', v_b.status);
exception when unique_violation then
  raise exception 'already_booked';
end $$;
revoke all on function public.book_venue_class(uuid, timestamptz) from public, anon;
grant execute on function public.book_venue_class(uuid, timestamptz) to authenticated;

-- ---------- المستخدم يلغي حجزه (قبل الموعد) ----------
create or replace function public.cancel_venue_booking(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_b venue_bookings; v venues;
begin
  select * into v_b from venue_bookings where id = p_id and user_id = auth.uid() for update;
  if v_b.id is null then raise exception 'request_not_found'; end if;
  if v_b.status not in ('pending','confirmed') then raise exception 'bad_status'; end if;
  if v_b.starts_at <= now() then raise exception 'too_late'; end if;
  update venue_bookings set status = 'cancelled', updated_at = now() where id = p_id;
  select * into v from venues where id = v_b.venue_id;
  perform _notice(v.owner, 'vb_cx:' || p_id, 'انلغى حجز', _person_label(auth.uid()) || ' لغى ' || _booking_label(v_b) || ' · ' || _venue_when(v_b.starts_at),
    'Booking cancelled', _person_label(auth.uid()) || ' cancelled ' || _booking_label(v_b, 'en') || ' · ' || _venue_when(v_b.starts_at, 'en'), '/venues/manage', p_id);
end $$;
revoke all on function public.cancel_venue_booking(uuid) from public, anon;
grant execute on function public.cancel_venue_booking(uuid) to authenticated;

-- ---------- الملعب: تأكيد، اعتذار، إلغاء، حضر، ما حضر ----------
create or replace function public.respond_venue_booking(p_id uuid, p_action text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_b venue_bookings; v venues; v_note text := nullif(left(btrim(coalesce(p_note, '')), 200), '');
        v_key text := 'vb_' || p_action || ':' || p_id;
begin
  select * into v_b from venue_bookings where id = p_id for update;
  if v_b.id is null or not can_manage_venue(v_b.venue_id) then raise exception 'not_allowed'; end if;
  select * into v from venues where id = v_b.venue_id;
  if p_action = 'confirm' and v_b.status = 'pending' then
    if v_b.starts_at <= now() then raise exception 'too_late'; end if;
    update venue_bookings set status = 'confirmed', venue_note = coalesce(v_note, venue_note), updated_at = now() where id = p_id;
    perform _notice(v_b.user_id, v_key, 'تأكد حجزك ✓', _booking_label(v_b) || ' في ' || v.name || ' · ' || _venue_when(v_b.starts_at) || '. الدفع في المكان.',
      'Booking confirmed ✓', _booking_label(v_b, 'en') || ' at ' || coalesce(v.name_en, v.name) || ' · ' || _venue_when(v_b.starts_at, 'en') || '. Pay at the venue.',
      '/bookings', p_id);
  elsif p_action = 'decline' and v_b.status = 'pending' then
    update venue_bookings set status = 'declined', venue_note = v_note, updated_at = now() where id = p_id;
    perform _notice(v_b.user_id, v_key, 'ما تأكد حجزك', coalesce(v_note, 'الوقت ما عاد متاح في ' || v.name || '. جرّب وقت ثاني.'),
      'Booking not confirmed', coalesce(v_note, 'That time is no longer available at ' || coalesce(v.name_en, v.name) || '. Try another time.'),
      '/book/' || v.id, p_id);
  elsif p_action = 'cancel' and v_b.status in ('pending','confirmed') then
    if v_note is null then raise exception 'note_required'; end if;
    update venue_bookings set status = 'cancelled', venue_note = v_note, updated_at = now() where id = p_id;
    perform _notice(v_b.user_id, v_key, 'انلغى حجزك', v.name || ': ' || v_note, 'Your booking was cancelled', coalesce(v.name_en, v.name) || ': ' || v_note, '/bookings', p_id);
  elsif p_action in ('done','no_show') and v_b.status = 'confirmed' then
    if v_b.starts_at > now() then raise exception 'too_early'; end if;
    update venue_bookings set status = p_action, updated_at = now() where id = p_id;
  else
    raise exception 'bad_status';
  end if;
end $$;
revoke all on function public.respond_venue_booking(uuid, text, text) from public, anon;
grant execute on function public.respond_venue_booking(uuid, text, text) to authenticated;

-- ---------- قائمة حجوزات الملعب (لصاحبه) ----------
create or replace function public.venue_booking_list(p_venue uuid, p_from timestamptz default now() - interval '1 day', p_limit integer default 200)
returns table (id uuid, sport text, label text, starts_at timestamptz, ends_at timestamptz, status text, price_sar numeric, note text, venue_note text,
               user_id uuid, username text, full_name text, avatar_url text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not can_manage_venue(p_venue) then raise exception 'not_allowed'; end if;
  return query
    select b.id, b.sport, _booking_label(b), b.starts_at, b.ends_at, b.status, b.price_sar, b.note, b.venue_note,
           b.user_id, p.username, p.full_name, p.avatar_url, b.created_at
    from venue_bookings b join profiles p on p.id = b.user_id
    where b.venue_id = p_venue and b.starts_at >= p_from
    order by (b.status = 'pending') desc, b.starts_at
    limit least(greatest(p_limit, 1), 500);
end $$;
revoke all on function public.venue_booking_list(uuid, timestamptz, integer) from public, anon;
grant execute on function public.venue_booking_list(uuid, timestamptz, integer) to authenticated;

-- ---------- حجوزاتي ----------
create or replace function public.my_venue_bookings()
returns table (id uuid, venue_id uuid, venue_name text, venue_name_en text, city text, phone text, maps_url text, sport text,
               label text, label_en text, starts_at timestamptz, ends_at timestamptz, status text, price_sar numeric, venue_note text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.id, v.id, v.name, v.name_en, v.city, v.phone, v.maps_url, b.sport, _booking_label(b), _booking_label(b, 'en'),
         b.starts_at, b.ends_at, b.status, b.price_sar, b.venue_note, b.created_at
  from venue_bookings b join venues v on v.id = b.venue_id
  where b.user_id = auth.uid()
  order by (b.starts_at > now() and b.status in ('pending','confirmed')) desc,
           case when b.starts_at > now() then b.starts_at end asc, b.starts_at desc
  limit 100;
$$;
revoke all on function public.my_venue_bookings() from public, anon;
grant execute on function public.my_venue_bookings() to authenticated;

-- ---------- اعتماد الإدارة ----------
create or replace function public.review_venue(p_id uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v venues; v_note text := nullif(btrim(coalesce(p_note, '')), '');
        v_key text := 'vnr:' || p_id || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  if p_decision not in ('approved','rejected','suspended') then raise exception 'bad_status'; end if;
  if p_decision = 'rejected' and v_note is null and exists (select 1 from venues where id = p_id and listed_by = 'owner') then
    raise exception 'consent_required';
  end if;
  update venues set status = p_decision, review_note = left(v_note, 300) where id = p_id returning * into v;
  if v.id is null then raise exception 'request_not_found'; end if;
  if v.owner is not null then
    if p_decision = 'approved' then
      perform _notice(v.owner, v_key, 'انعتمد مكانك ✓', v.name || ' صار ظاهر في «حجز الملاعب والحصص». أضف ملاعبك أو حصصك وأوقاتك عشان يبدأ الحجز.',
        'Your venue is approved ✓', coalesce(v.name_en, v.name) || ' now appears in court and class booking. Add your courts or classes to start taking bookings.', '/venues/manage', p_id);
    elsif p_decision = 'rejected' then
      perform _notice(v.owner, v_key, 'طلبك يحتاج تعديل', coalesce(v_note, 'راجع بيانات المكان وأرسله مرة ثانية.'),
        'Your venue needs changes', coalesce(v_note, 'Review your venue details and submit again.'), '/venues/join', p_id);
    else
      perform _notice(v.owner, v_key, 'انوقف ظهور مكانك', coalesce(v_note, 'مكانك ما يظهر في الحجز حالياً. تواصل مع إدارة أرك.'),
        'Your venue is hidden', coalesce(v_note, 'Your venue is hidden for now. Contact the ARQ team.'), '/venues/join', p_id);
    end if;
  end if;
end $$;
revoke all on function public.review_venue(uuid, text, text) from public, anon;
grant execute on function public.review_venue(uuid, text, text) to authenticated;

-- ---------- تذكير قبل الموعد بساعة (كل ربع ساعة) ----------
create or replace function public.run_venue_reminders(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare r record; v_n integer := 0;
begin
  for r in
    select b.*, v.name as vname, coalesce(v.name_en, v.name) as vname_en
    from venue_bookings b join venues v on v.id = b.venue_id
    where b.status = 'confirmed' and b.reminded_at is null
      and b.starts_at between p_now + interval '45 minutes' and p_now + interval '75 minutes'
    limit 5000
  loop
    update venue_bookings set reminded_at = p_now where id = r.id;
    if _notice(r.user_id, 'vb_rem:' || r.id, 'موعدك بعد ساعة ⏰',
         _sport_name(r.sport) || ' في ' || r.vname || ' الساعة ' || to_char(r.starts_at at time zone 'Asia/Riyadh', 'HH24:MI') || '. لا تنسى.',
         'Your booking is in an hour ⏰',
         _sport_name(r.sport, 'en') || ' at ' || r.vname_en || ', ' || to_char(r.starts_at at time zone 'Asia/Riyadh', 'HH24:MI') || '.',
         '/bookings', r.id) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
revoke all on function public.run_venue_reminders(timestamptz) from public, anon, authenticated;

do $$
begin
  perform cron.schedule('arq-venue-reminders', '*/15 * * * *', 'select public.run_venue_reminders()');
exception when others then
  raise notice 'pg_cron not available: venue reminders not scheduled (%)', sqlerrm;
end $$;

-- ---------- أول القائمة: ملاعب واستوديوهات من مواقعها الرسمية (سبتمبر 2026) ----------
-- مدرجة من أرك بدون شعارات ولا صور، والحجز يكون من موقعهم لين ينضمون كشركاء ويصير الحجز داخل التطبيق
insert into public.venues (listed_by, status, sports, name, name_en, city, city_en, district, district_en, audience, booking_url, website, instagram, phone, source_url)
select 'arq', 'approved', v.sports, v.name, v.name_en, v.city, v.city_en, v.district, v.district_en, v.audience, v.booking_url, v.website, v.instagram, v.phone, v.source_url
from (values
  (array['football','padel']::text[], 'دوم الرياضة للجميع الدمام', 'SFA Domes Dammam', 'الدمام', 'Dammam', null, null, 'mixed', 'https://sfadomes.com/en/sfa-domes-dammam', 'https://sfadomes.com', null, '+966555129139', 'https://sfadomes.com/ar/sfa-domes-dammam/facilities/football/court-7-football-7-a-side'),
  (array['football','padel']::text[], 'ون تو', 'OneTwo Sports', 'عدة مدن', 'Several cities', null, null, null, 'https://onetwo.sa/', 'https://onetwo.sa', null, null, 'https://onetwo.sa/'),
  (array['padel']::text[], 'Padel In (Ar Rabwah)', 'Padel In (Ar Rabwah)', 'الرياض', 'Riyadh', 'الربوة', 'Ar Rabwah', null, 'https://playtomic.com/clubs/padel-in-rabwah', null, null, null, 'https://playtomic.com/clubs/padel-in-rabwah'),
  (array['padel']::text[], 'Padel UP – Ad Diriyah', 'Padel UP – Ad Diriyah', 'الرياض', 'Riyadh', null, null, null, 'https://playtomic.com/clubs/padel-up-riyadh', null, null, null, 'https://playtomic.com/clubs/padel-up-riyadh'),
  (array['padel']::text[], 'Hala Padel', 'Hala Padel', 'الرياض', 'Riyadh', 'العارض', 'Al Arid', null, 'https://playtomic.com/clubs/hala-padel', null, null, null, 'https://playtomic.com/clubs/hala-padel'),
  (array['padel']::text[], 'Padel In Jeddah Park', 'Padel In Jeddah Park', 'جدة', 'Jeddah', null, null, null, 'https://playtomic.com/clubs/padel-in-jeddah-ksa', null, null, null, 'https://playtomic.com/clubs/padel-in-jeddah-ksa'),
  (array['padel']::text[], 'The Padel Social Club', 'The Padel Social Club', 'جدة', 'Jeddah', null, null, null, 'https://playtomic.com/clubs/the-padel-social-club', null, null, null, 'https://playtomic.com/clubs/the-padel-social-club'),
  (array['tennis']::text[], 'أكاديمية بيت التنس', 'Tennis Home Academy', 'الرياض', 'Riyadh', null, null, null, 'https://tennishomeacademy.com/tennis-court-rent/', 'https://tennishomeacademy.com', 'tennis_homeksa', '+966555003500', 'https://tennishomeacademy.com/'),
  (array['tennis']::text[], 'أكاديمية نت للتنس', 'Net Tennis Academy', 'الدرعية', 'Diriyah', null, null, null, 'https://netacademy.sa', 'https://netacademy.sa', null, null, 'https://netacademy.sa/'),
  (array['tennis']::text[], 'أكاديمة ڤاموس للتنس', 'Vamos Tennis Academy', 'جدة', 'Jeddah', null, null, 'mixed', 'https://www.vamosksa.com/', 'https://www.vamosksa.com', 'vamostennissa', '+966556047070', 'https://www.vamosksa.com/'),
  (array['tennis','padel']::text[], 'Dunes Racquet Club', 'Dunes Racquet Club', 'جدة', 'Jeddah', 'النهضة', 'An Nahdah', null, 'https://dunesclubsa.com/book', 'https://dunesclubsa.com', 'dunesracquetclub', '+966573773731', 'https://dunesclubsa.com/'),
  (array['tennis']::text[], 'Ryze Tennis Club & Academy', 'Ryze Tennis Club & Academy', 'جدة', 'Jeddah', 'الخالدية', 'Al Khalidiyah', null, 'https://ryzetennis.sa/book', 'https://ryzetennis.sa', 'ryzetennis', '+966553165262', 'https://ryzetennis.sa/'),
  (array['tennis']::text[], 'Ace Tennis Academy', 'Ace Tennis Academy', 'الخبر', 'Al Khobar', 'العزيزية', 'Al Aziziyah', null, null, null, 'acetennis_sa', '+966539191828', 'https://tennissaudi.sa/en/tennis/clubs/club-details/77/-.html'),
  (array['yoga']::text[], 'The Yoga House', 'The Yoga House', 'الرياض', 'Riyadh', 'الياسمين', 'Al Yasmin', null, 'https://www.theyogahousesa.com/download-our-app', 'https://www.theyogahousesa.com', 'theyogahouse.sa', '+966538335633', 'https://www.theyogahousesa.com/'),
  (array['yoga']::text[], 'The Art of Qi', 'The Art of Qi', 'الرياض', 'Riyadh', null, null, null, 'https://clients.mindbodyonline.com/classic/ws?studioid=5733994&stype=-7&sView=day&sLoc=0', 'https://theartofqisa.com', 'theartofqi.sa', '+966533696767', 'https://theartofqisa.com/pages/contact'),
  (array['yoga']::text[], 'كراما يوغا', 'Karama Yoga Studio', 'جدة', 'Jeddah', 'الشاطئ', 'Ash Shati', null, 'https://karama-yoga.com/book', 'https://karama-yoga.com', 'karama_yoga', '+966508686446', 'https://karama-yoga.com/'),
  (array['pilates','yoga']::text[], 'Reform Athletica', 'Reform Athletica', 'الرياض', 'Riyadh', 'حي السفارات', 'Diplomatic Quarter', 'mixed', 'https://www.reformathletica.com/sa/schedule', 'https://www.reformathletica.com/sa', 'reformathleticaksa', '+966112522049', 'https://www.reformathletica.com/sa/classes'),
  (array['pilates']::text[], 'Sculptō Reformer Studio', 'Sculptō Reformer Studio', 'الرياض', 'Riyadh', 'النخيل', 'An Nakheel', null, 'https://sculpto.tamarran.com/', 'https://sculptostudio.com', 'sculpto.sa', '+966538091090', 'https://sculptostudio.com/'),
  (array['pilates','yoga']::text[], 'Formé Wellness', 'Formé Wellness', 'الرياض', 'Riyadh', 'العقيق', 'Al Aqiq', null, 'https://formewellness.club/al-aqiq/', 'https://formewellness.club', 'formewellness.sa', '+966551751346', 'https://formewellness.club/al-aqiq/'),
  (array['pilates']::text[], 'كارڤ', 'KARVE', 'جدة', 'Jeddah', 'الروضة', 'Ar Rawdah', 'women', 'https://karve.alfmile.co/go/book', 'https://karve.sa', 'karve.ksa', '+966508002291', 'https://karve.sa/en/home/'),
  (array['pilates']::text[], 'Pilatiq', 'Pilatiq', 'جدة', 'Jeddah', null, null, null, 'https://www.pilatiqstudiojeddah.com/book-now', 'https://www.pilatiqstudiojeddah.com', null, null, 'https://www.pilatiqstudiojeddah.com/'),
  (array['pilates']::text[], 'كيرفا', 'Curva Pilates & Lagree Studio', 'الخبر', 'Al Khobar', 'العليا', 'Al Olaya', null, 'https://curvapilates.com/', 'https://curvapilates.com', 'curvapilates', '+966565570764', 'https://curvapilates.com/')
) as v(sports, name, name_en, city, city_en, district, district_en, audience, booking_url, website, instagram, phone, source_url)
where not exists (select 1 from public.venues x where x.listed_by = 'arq' and x.name_en = v.name_en);

-- ---------- لوحة إدارة التطبيق: الملاعب والاستوديوهات كنوع شريك خامس ----------
create or replace function public.admin_partner_list(p_kind text, p_q text default null)
returns table (id uuid, name text, subtitle text, status text, logo_path text, avatar_url text, owner_id uuid, owner_username text,
               listed_by text, partner boolean, meta jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_q text := nullif(lower(btrim(coalesce(p_q, ''))), '');
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  if p_kind = 'club' then
    return query
      select c.id, c.name, coalesce(c.name_en, ''),
             case when not c.active then 'suspended' when c.partner then 'approved' else 'listed' end,
             c.logo_path, null::text, null::uuid,
             (select string_agg(p.username, '، ' order by p.username) from chain_managers m join profiles p on p.id = m.user_id where m.chain_id = c.id),
             case when c.partner then 'owner' else 'arq' end, c.partner,
             jsonb_build_object('audience', c.audience,
               'branches', (select count(*) from gyms g where g.chain_id = c.id),
               'managers', (select count(*) from chain_managers m where m.chain_id = c.id),
               'offers', (select count(*) from gym_offers o where o.chain_id = c.id and o.active)),
             c.created_at
      from gym_chains c
      where v_q is null or lower(c.name) like '%' || v_q || '%' or lower(coalesce(c.name_en, '')) like '%' || v_q || '%'
      order by c.partner desc, c.name
      limit 500;
  elsif p_kind = 'store' then
    return query
      select b.id, b.name, coalesce(b.tagline, ''), b.status, b.logo_path, null::text, b.owner, p.username, b.listed_by,
             b.listed_by = 'owner' and b.status = 'approved',
             jsonb_build_object('category', b.category, 'city', b.city, 'products', (select count(*) from brand_products x where x.brand_id = b.id)),
             b.created_at
      from brands b left join profiles p on p.id = b.owner
      where v_q is null or lower(b.name) like '%' || v_q || '%' or lower(coalesce(p.username, '')) like '%' || v_q || '%'
      order by (b.status = 'pending') desc, b.created_at desc
      limit 500;
  elsif p_kind = 'coach' then
    return query
      select c.user_id, coalesce(nullif(p.full_name, ''), p.username), coalesce(c.headline, ''), c.status, null::text, p.avatar_url,
             c.user_id, p.username, 'owner'::text, c.status = 'approved',
             jsonb_build_object('city', c.city, 'specialties', c.specialties,
               'clients', (select count(*) from coach_links l where l.coach_id = c.user_id and l.status = 'active')),
             c.created_at
      from coach_profiles c join profiles p on p.id = c.user_id
      where v_q is null or lower(coalesce(p.full_name, '')) like '%' || v_q || '%' or lower(p.username) like '%' || v_q || '%'
      order by (c.status = 'pending') desc, c.submitted_at desc
      limit 500;
  elsif p_kind = 'center' then
    return query
      select r.id, r.name, coalesce(r.name_en, ''), r.status, r.logo_path, null::text, r.owner, p.username, r.listed_by,
             r.listed_by = 'owner' and r.status = 'approved',
             jsonb_build_object('kind', r.kind, 'cities', r.cities, 'license_no', r.license_no),
             r.created_at
      from recovery_centers r left join profiles p on p.id = r.owner
      where v_q is null or lower(r.name) like '%' || v_q || '%' or lower(coalesce(r.name_en, '')) like '%' || v_q || '%'
      order by (r.status = 'pending') desc, (r.listed_by = 'owner') desc, r.created_at desc
      limit 500;
  elsif p_kind = 'venue' then
    return query
      select v.id, v.name, coalesce(v.name_en, ''), v.status, v.image_path, null::text, v.owner, p.username, v.listed_by,
             v.listed_by = 'owner' and v.status = 'approved',
             jsonb_build_object('sports', v.sports, 'city', v.city, 'booking_url', v.booking_url,
               'courts', (select count(*) from venue_courts c where c.venue_id = v.id and c.active),
               'classes', (select count(*) from venue_classes c where c.venue_id = v.id and c.active),
               'upcoming', (select count(*) from venue_bookings b where b.venue_id = v.id and b.status in ('pending','confirmed') and b.starts_at > now())),
             v.created_at
      from venues v left join profiles p on p.id = v.owner
      where v_q is null or lower(v.name) like '%' || v_q || '%' or lower(coalesce(v.name_en, '')) like '%' || v_q || '%'
      order by (v.status = 'pending') desc, (v.listed_by = 'owner') desc, v.created_at desc
      limit 500;
  else
    raise exception 'bad_status';
  end if;
end $$;
revoke all on function public.admin_partner_list(text, text) from public, anon;
grant execute on function public.admin_partner_list(text, text) to authenticated;

create or replace function public.partner_overview()
returns table (kind text, pending integer, live integer, partners integer, hidden integer, total integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  return query
    select 'club'::text, (select count(*)::int from club_requests where status = 'pending'),
           (select count(*)::int from gym_chains where active), (select count(*)::int from gym_chains where partner and active),
           (select count(*)::int from gym_chains where not active), (select count(*)::int from gym_chains)
    union all
    select 'store', count(*) filter (where status = 'pending')::int, count(*) filter (where status = 'approved')::int,
           count(*) filter (where status = 'approved' and listed_by = 'owner')::int,
           count(*) filter (where status in ('suspended','rejected'))::int, count(*)::int from brands
    union all
    select 'coach', count(*) filter (where status = 'pending')::int, count(*) filter (where status = 'approved')::int,
           count(*) filter (where status = 'approved')::int, count(*) filter (where status in ('suspended','rejected'))::int, count(*)::int
    from coach_profiles
    union all
    select 'center', count(*) filter (where status = 'pending')::int, count(*) filter (where status = 'approved')::int,
           count(*) filter (where status = 'approved' and listed_by = 'owner')::int,
           count(*) filter (where status in ('suspended','rejected'))::int, count(*)::int from recovery_centers
    union all
    select 'venue', count(*) filter (where status = 'pending')::int, count(*) filter (where status = 'approved')::int,
           count(*) filter (where status = 'approved' and listed_by = 'owner')::int,
           count(*) filter (where status in ('suspended','rejected'))::int, count(*)::int from venues;
end $$;
revoke all on function public.partner_overview() from public, anon;
grant execute on function public.partner_overview() to authenticated;

create or replace function public.admin_partner_action(p_kind text, p_id uuid, p_action text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  if p_action not in ('approve','reject','hide','show','delete','partner_on','partner_off') then raise exception 'bad_status'; end if;
  if p_action = 'reject' and v_note is null then raise exception 'note_required'; end if;
  if (p_kind = 'club' and not exists (select 1 from gym_chains where id = p_id))
     or (p_kind = 'store' and not exists (select 1 from brands where id = p_id))
     or (p_kind = 'coach' and not exists (select 1 from coach_profiles where user_id = p_id))
     or (p_kind = 'center' and not exists (select 1 from recovery_centers where id = p_id))
     or (p_kind = 'venue' and not exists (select 1 from venues where id = p_id)) then
    raise exception 'request_not_found';
  end if;

  if p_kind = 'club' then
    if p_action = 'hide' then update gym_chains set active = false where id = p_id;
    elsif p_action = 'show' then update gym_chains set active = true where id = p_id;
    elsif p_action = 'partner_on' then update gym_chains set partner = true, partner_since = coalesce(partner_since, now()) where id = p_id;
    elsif p_action = 'partner_off' then update gym_chains set partner = false where id = p_id;
    elsif p_action = 'delete' then delete from gym_chains where id = p_id;
    else raise exception 'bad_status';
    end if;
  elsif p_kind = 'store' then
    if p_action = 'approve' or p_action = 'show' then update brands set status = 'approved', review_note = null where id = p_id;
    elsif p_action = 'reject' then update brands set status = 'rejected', review_note = left(v_note, 300) where id = p_id;
    elsif p_action = 'hide' then update brands set status = 'suspended', review_note = left(v_note, 300) where id = p_id;
    elsif p_action = 'delete' then delete from brands where id = p_id;
    else raise exception 'bad_status';
    end if;
  elsif p_kind = 'coach' then
    if p_action = 'delete' then
      delete from coach_profiles where user_id = p_id;
      update profiles set is_coach = false where id = p_id;
    elsif p_action in ('approve','show') then perform review_coach(p_id, 'approved', v_note);
    elsif p_action = 'reject' then perform review_coach(p_id, 'rejected', v_note);
    elsif p_action = 'hide' then perform review_coach(p_id, 'suspended', v_note);
    else raise exception 'bad_status';
    end if;
  elsif p_kind = 'center' then
    if p_action = 'delete' then delete from recovery_centers where id = p_id;
    elsif p_action in ('approve','show') then perform review_center(p_id, 'approved', v_note);
    elsif p_action = 'reject' then perform review_center(p_id, 'rejected', v_note);
    elsif p_action = 'hide' then perform review_center(p_id, 'suspended', v_note);
    else raise exception 'bad_status';
    end if;
  elsif p_kind = 'venue' then
    if p_action = 'delete' then delete from venues where id = p_id;
    elsif p_action in ('approve','show') then perform review_venue(p_id, 'approved', v_note);
    elsif p_action = 'reject' then perform review_venue(p_id, 'rejected', v_note);
    elsif p_action = 'hide' then perform review_venue(p_id, 'suspended', v_note);
    else raise exception 'bad_status';
    end if;
  else
    raise exception 'bad_status';
  end if;
  perform _admin_log(p_kind, p_id::text, p_action, v_note);
end $$;
revoke all on function public.admin_partner_action(text, uuid, text, text) from public, anon;
grant execute on function public.admin_partner_action(text, uuid, text, text) to authenticated;

create or replace function public.admin_assign_partner(p_kind text, p_id uuid, p_username text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid := _user_by_username(p_username); v_name text;
        v_key text := 'asg:' || coalesce(p_id::text, '') || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  if v_user is null then raise exception 'user_not_found'; end if;
  if p_kind = 'club' then
    select name into v_name from gym_chains where id = p_id;
    if v_name is null then raise exception 'request_not_found'; end if;
    insert into chain_managers (chain_id, user_id) values (p_id, v_user) on conflict do nothing;
    update gym_chains set partner = true, partner_since = coalesce(partner_since, now()) where id = p_id;
    update profiles set account_type = 'club' where id = v_user and account_type = 'trainee';
  elsif p_kind = 'store' then
    if exists (select 1 from brands where owner = v_user and id <> p_id) then raise exception 'already_linked'; end if;
    update brands set owner = v_user, listed_by = 'owner' where id = p_id returning name into v_name;
    if v_name is null then raise exception 'request_not_found'; end if;
    update profiles set account_type = case when (select category from brands where id = p_id) = 'restaurant' then 'restaurant' else 'store' end
     where id = v_user and account_type = 'trainee';
  elsif p_kind = 'center' then
    if exists (select 1 from recovery_centers where owner = v_user and id <> p_id) then raise exception 'already_linked'; end if;
    update recovery_centers set owner = v_user, listed_by = 'owner' where id = p_id returning name into v_name;
    if v_name is null then raise exception 'request_not_found'; end if;
    update profiles set account_type = 'center' where id = v_user and account_type = 'trainee';
  elsif p_kind = 'venue' then
    if exists (select 1 from venues where owner = v_user and id <> p_id) then raise exception 'already_linked'; end if;
    update venues set owner = v_user, listed_by = 'owner' where id = p_id returning name into v_name;
    if v_name is null then raise exception 'request_not_found'; end if;
    update profiles set account_type = 'venue' where id = v_user and account_type = 'trainee';
  elsif p_kind = 'coach' then
    insert into coach_profiles (user_id, status) values (v_user, 'approved') on conflict (user_id) do nothing;
    perform review_coach(v_user, 'approved', null);
    update profiles set account_type = 'coach' where id = v_user and account_type = 'trainee';
    v_name := _person_label(v_user);
  else
    raise exception 'bad_status';
  end if;
  if p_kind <> 'coach' then
    perform _notice(v_user, v_key, 'صرت شريك في أرك ✓', v_name || ': إدارة أرك ربطت الصفحة بحسابك. لوحة التحكم في «بوابة الشركاء».',
      'You''re now an ARQ partner ✓', v_name || ': the ARQ team linked this page to your account. Your dashboard is in the Partner hub.', '/partners', p_id);
  end if;
  perform _admin_log(p_kind, coalesce(p_id, v_user)::text, 'assign', p_username);
  return v_user;
end $$;
revoke all on function public.admin_assign_partner(text, uuid, text) from public, anon;
grant execute on function public.admin_assign_partner(text, uuid, text) to authenticated;
