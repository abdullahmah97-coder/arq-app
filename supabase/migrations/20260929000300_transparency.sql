-- =====================================================================
-- الشفافية: أوقات الذروة، نسبة الحضور، تقييمات موثقة ومفصلة، رد النادي العلني، البلاغات،
-- السعر الكامل للعروض، ومقارنة الأندية
-- =====================================================================

-- ---------- التقييم المفصّل (اختياري) ----------
alter table public.gym_reviews
  add column if not exists f_clean     smallint check (f_clean between 1 and 5),
  add column if not exists f_equipment smallint check (f_equipment between 1 and 5),
  add column if not exists f_crowd     smallint check (f_crowd between 1 and 5),
  add column if not exists f_coaches   smallint check (f_coaches between 1 and 5),
  add column if not exists f_staff     smallint check (f_staff between 1 and 5);

-- التقييم الجديد لازم يكون من زائر فعلي (حضور في الفرع أو فرع من نفس السلسلة). التقييمات القديمة تبقى.
create or replace function public._review_needs_visit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin() then return new; end if;
  if not exists (
    select 1 from check_ins c join gyms g on g.id = c.gym_id
    where c.user_id = new.user_id
      and (c.gym_id = new.gym_id or (g.chain_id is not null and g.chain_id = (select chain_id from gyms where id = new.gym_id)))
  ) then
    raise exception 'review_needs_visit';
  end if;
  return new;
end $$;
drop trigger if exists reviews_need_visit on public.gym_reviews;
create trigger reviews_need_visit before insert on public.gym_reviews for each row execute function public._review_needs_visit();

-- ---------- رد النادي العلني (مرة لكل تقييم، يعدّله المدير، وما يقدر يحذف التقييم نفسه) ----------
create table if not exists public.gym_review_replies (
  gym_id      uuid not null,
  user_id     uuid not null,
  body        text not null check (char_length(btrim(body)) between 2 and 600),
  replied_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (gym_id, user_id),
  foreign key (gym_id, user_id) references public.gym_reviews(gym_id, user_id) on delete cascade
);
alter table public.gym_review_replies enable row level security;
create policy rr_read on public.gym_review_replies for select to authenticated using (true);
create policy rr_write on public.gym_review_replies for insert to authenticated with check (can_manage_gym_or_chain(gym_id));
create policy rr_update on public.gym_review_replies for update to authenticated using (can_manage_gym_or_chain(gym_id)) with check (can_manage_gym_or_chain(gym_id));
create policy rr_delete on public.gym_review_replies for delete to authenticated using (can_manage_gym_or_chain(gym_id) or is_admin());
create or replace function public._rr_touch()
returns trigger language plpgsql as $$ begin new.updated_at := now(); new.replied_by := coalesce(auth.uid(), new.replied_by); return new; end $$;
drop trigger if exists rr_touch on public.gym_review_replies;
create trigger rr_touch before update on public.gym_review_replies for each row execute function public._rr_touch();

create or replace function public._on_review_reply()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform _notice(new.user_id, 'rr:' || new.gym_id || ':' || new.user_id,
    'رد ' || _gym_label(new.gym_id) || ' على تقييمك', left(new.body, 200),
    _gym_label(new.gym_id) || ' replied to your review', left(new.body, 200), '/clubs/' || new.gym_id, new.gym_id);
  return null;
end $$;
drop trigger if exists rr_notify on public.gym_review_replies;
create trigger rr_notify after insert on public.gym_review_replies for each row execute function public._on_review_reply();

-- ---------- بلاغ عن تقييم (يراجعه الأدمن) ----------
create table if not exists public.review_flags (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null,
  user_id     uuid not null,
  flagged_by  uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  reason      text not null check (reason in ('fake','offensive','spam','other')),
  note        text check (char_length(note) <= 300),
  status      text not null default 'new' check (status in ('new','kept','removed')),
  created_at  timestamptz not null default now(),
  unique (gym_id, user_id, flagged_by),
  foreign key (gym_id, user_id) references public.gym_reviews(gym_id, user_id) on delete cascade
);
alter table public.review_flags enable row level security;
create policy rf_insert on public.review_flags for insert to authenticated with check (flagged_by = auth.uid() and status = 'new');
create policy rf_read on public.review_flags for select to authenticated using (flagged_by = auth.uid() or is_admin());
create policy rf_admin on public.review_flags for update to authenticated using (is_admin()) with check (is_admin());

-- ---------- قائمة التقييمات الكاملة: موثّق، التفاصيل، ورد النادي ----------
create or replace function public.gym_reviews_full(p_gym uuid)
returns table (user_id uuid, username text, full_name text, avatar_url text, points integer, rating smallint, body text,
               updated_at timestamptz, visited boolean, is_me boolean,
               f_clean smallint, f_equipment smallint, f_crowd smallint, f_coaches smallint, f_staff smallint,
               reply text, reply_at timestamptz, can_reply boolean)
language sql stable security definer set search_path = public as $$
  select r.user_id, p.username, p.full_name, p.avatar_url, p.points, r.rating, r.body, r.updated_at,
         exists (select 1 from check_ins c where c.user_id = r.user_id and c.gym_id = r.gym_id),
         r.user_id = auth.uid(),
         r.f_clean, r.f_equipment, r.f_crowd, r.f_coaches, r.f_staff,
         rr.body, rr.updated_at, can_manage_gym_or_chain(p_gym)
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

create or replace function public.gym_review_facets(p_gym uuid)
returns table (clean numeric, equipment numeric, crowd numeric, coaches numeric, staff numeric, rated integer, verified_share numeric)
language sql stable security definer set search_path = public as $$
  select round(avg(f_clean), 1), round(avg(f_equipment), 1), round(avg(f_crowd), 1), round(avg(f_coaches), 1), round(avg(f_staff), 1),
         count(*) filter (where coalesce(f_clean, f_equipment, f_crowd, f_coaches, f_staff) is not null)::int,
         round(avg(case when exists (select 1 from check_ins c where c.user_id = r.user_id and c.gym_id = r.gym_id) then 1 else 0 end), 2)
  from gym_reviews r where r.gym_id = p_gym;
$$;
revoke all on function public.gym_review_facets(uuid) from public, anon;
grant execute on function public.gym_review_facets(uuid) to authenticated;

-- ---------- أوقات الذروة: متوسط عدد الموجودين لكل ساعة في كل يوم (آخر ٨ أسابيع) ----------
create or replace function public.gym_peak_hours(p_gym uuid, p_weeks integer default 8)
returns table (dow integer, hour integer, avg_present numeric, samples integer)
language sql stable security definer set search_path = public as $$
  with c as (
    select (c.checked_in_at at time zone 'Asia/Riyadh') as t0,
           (least(coalesce(c.checked_out_at, c.checked_in_at + interval '90 minutes'), c.checked_in_at + interval '3 hours') at time zone 'Asia/Riyadh') as t1
    from check_ins c
    where c.gym_id = p_gym and c.checked_in_at > now() - make_interval(weeks => greatest(least(p_weeks, 26), 1))
  ),
  h as (select generate_series(date_trunc('hour', t0), t1, interval '1 hour') as slot from c)
  select extract(dow from slot)::int, extract(hour from slot)::int,
         round(count(*)::numeric / greatest(least(p_weeks, 26), 1), 2),
         (select count(*) from c)::int
  from h group by 1, 2 order by 1, 2;
$$;
revoke all on function public.gym_peak_hours(uuid, integer) from public, anon;
grant execute on function public.gym_peak_hours(uuid, integer) to authenticated;

-- أوقاتي المعتادة (لاقتراح أهدى وقت قريب منها)
create or replace function public.my_usual_hours()
returns table (dow integer, hour integer, visits integer)
language sql stable security definer set search_path = public as $$
  select extract(dow from checked_in_at at time zone 'Asia/Riyadh')::int, extract(hour from checked_in_at at time zone 'Asia/Riyadh')::int, count(*)::int
  from check_ins where user_id = auth.uid() and checked_in_at > now() - interval '90 days'
  group by 1, 2 order by 3 desc limit 20;
$$;
revoke all on function public.my_usual_hours() from public, anon;
grant execute on function public.my_usual_hours() to authenticated;

-- ---------- نسبة الحضور: هدفي الأسبوعي مقابل زياراتي هالشهر ----------
create table if not exists public.attendance_goals (
  user_id        uuid primary key references public.profiles(id) on delete cascade default auth.uid(),
  days_per_week  smallint not null check (days_per_week between 1 and 7),
  updated_at     timestamptz not null default now()
);
alter table public.attendance_goals enable row level security;
create policy ag_own on public.attendance_goals for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.my_attendance()
returns table (days_per_week smallint, month_start date, days_in_month integer, day_of_month integer,
               planned_to_date integer, planned_month integer, visits integer, visit_days date[], last_month_visits integer, last_month_planned integer)
language sql stable security definer set search_path = public as $$
  with g as (select coalesce((select a.days_per_week from attendance_goals a where a.user_id = auth.uid()), 3::smallint) as dpw),
  m as (select date_trunc('month', app_today())::date as ms),
  d as (
    select distinct (c.checked_in_at at time zone 'Asia/Riyadh')::date as day
    from check_ins c, m where c.user_id = auth.uid() and c.checked_in_at >= (m.ms - interval '1 month') at time zone 'Asia/Riyadh'
  )
  select g.dpw, m.ms,
         extract(day from (m.ms + interval '1 month - 1 day'))::int,
         extract(day from app_today())::int,
         round(g.dpw * extract(day from app_today()) / 7.0)::int,
         round(g.dpw * extract(day from (m.ms + interval '1 month - 1 day')) / 7.0)::int,
         (select count(*) from d where d.day >= m.ms)::int,
         coalesce((select array_agg(d.day order by d.day) from d where d.day >= m.ms), '{}'),
         (select count(*) from d where d.day >= (m.ms - interval '1 month')::date and d.day < m.ms)::int,
         round(g.dpw * extract(day from (m.ms - interval '1 day')) / 7.0)::int
  from g, m;
$$;
revoke all on function public.my_attendance() from public, anon;
grant execute on function public.my_attendance() to authenticated;

-- ---------- السعر الكامل في العروض ----------
alter table public.gym_offers
  add column if not exists join_fee_sar numeric(8,2) check (join_fee_sar is null or join_fee_sar between 0 and 100000),
  add column if not exists vat_included boolean,
  add column if not exists min_months   smallint check (min_months is null or min_months between 0 and 36),
  add column if not exists terms        text check (char_length(terms) <= 400);

-- ---------- مقارنة الأندية (٢–٣ أندية جنب بعض) ----------
create or replace function public.gym_compare(p_ids uuid[])
returns table (id uuid, name text, name_en text, chain text, chain_id uuid, audience text, logo_path text, chain_logo text,
               rating numeric, reviews integer, best_monthly numeric, present_now integer,
               clean numeric, equipment numeric, crowd numeric, coaches numeric, staff numeric, services text[])
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.name_en, c.name, g.chain_id, coalesce(c.audience, 'mixed'), null::text, c.logo_path,
         round((select avg(r.rating) from gym_reviews r where r.gym_id = g.id), 1),
         (select count(*) from gym_reviews r where r.gym_id = g.id)::int,
         (select min(case when o.months >= 1 then o.price_sar / o.months end) from gym_offers o
            where (o.gym_id = g.id or o.chain_id = g.chain_id) and o.active and (o.ends_on is null or o.ends_on >= current_date)),
         (select count(distinct ci.user_id) from check_ins ci where ci.gym_id = g.id and ci.checked_out_at is null and ci.checked_in_at > now() - interval '6 hours')::int,
         (select round(avg(r.f_clean), 1) from gym_reviews r where r.gym_id = g.id),
         (select round(avg(r.f_equipment), 1) from gym_reviews r where r.gym_id = g.id),
         (select round(avg(r.f_crowd), 1) from gym_reviews r where r.gym_id = g.id),
         (select round(avg(r.f_coaches), 1) from gym_reviews r where r.gym_id = g.id),
         (select round(avg(r.f_staff), 1) from gym_reviews r where r.gym_id = g.id),
         coalesce((select array_agg(a.key order by a.sort_order) from amenities a
                    where a.active and a.key <> 'other' and coalesce(
                      (select ga.available from gym_amenities ga where ga.gym_id = g.id and ga.amenity = a.key),
                      (select ca.available from chain_amenities ca where ca.chain_id = g.chain_id and ca.amenity = a.key), false)), '{}')
  from gyms g left join gym_chains c on c.id = g.chain_id
  where g.id = any(p_ids[1:3]);
$$;
revoke all on function public.gym_compare(uuid[]) from public, anon;
grant execute on function public.gym_compare(uuid[]) to authenticated;
