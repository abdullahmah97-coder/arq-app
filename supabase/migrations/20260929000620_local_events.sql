-- البطولات والفعاليات المحلية: ماراثون الرياض، كأس السعودية للخيل، الهايكنج، الرماية، الملاكمة، رياضة المحركات…
-- إدارة التطبيق تضيفها وتعدّلها من لوحتها، والمستخدمين يشوفونها في مربع «البطولات» جنب المتاجر.
-- التاريخ اختياري (للأنشطة المستمرة)، و date_note يظهر بدل التاريخ لو الموعد تقريبي («نهاية يناير، يُعلن لاحقاً»).
create table if not exists public.local_events (
  id           uuid primary key default gen_random_uuid(),
  category     text not null default 'other'
                 check (category in ('running','horse_racing','hiking','shooting','boxing','motorsport','cycling','football','other')),
  title        text not null check (char_length(btrim(title)) between 2 and 90),
  title_en     text check (title_en is null or char_length(title_en) <= 90),
  city         text check (city is null or char_length(city) <= 40),
  city_en      text check (city_en is null or char_length(city_en) <= 40),
  venue        text check (venue is null or char_length(venue) <= 90),
  venue_en     text check (venue_en is null or char_length(venue_en) <= 90),
  starts_on    date,
  ends_on      date,
  date_note    text check (date_note is null or char_length(date_note) <= 80),
  date_note_en text check (date_note_en is null or char_length(date_note_en) <= 80),
  summary      text check (summary is null or char_length(summary) <= 500),
  summary_en   text check (summary_en is null or char_length(summary_en) <= 500),
  url          text check (url is null or (char_length(url) <= 300 and url like 'https://%')),
  image_path   text check (image_path is null or char_length(image_path) <= 200),
  featured     boolean not null default false,
  active       boolean not null default true,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index if not exists local_events_date_idx on public.local_events (active, starts_on);
alter table public.local_events enable row level security;
-- المستخدم يشوف الفعّال، وإدارة التطبيق تشوف الكل وتعدّل
drop policy if exists local_events_read on public.local_events;
create policy local_events_read on public.local_events for select to authenticated using (active or is_admin());
drop policy if exists local_events_admin_write on public.local_events;
create policy local_events_admin_write on public.local_events for all to authenticated using (is_admin()) with check (is_admin());

create or replace function public._local_events_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, auth.uid()); end if;
  return new;
end $$;
drop trigger if exists local_events_touch on public.local_events;
create trigger local_events_touch before insert or update on public.local_events
  for each row execute function public._local_events_touch();

-- كل إضافة أو تعديل أو حذف ينحفظ في سجل الإدارة
create or replace function public._local_events_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then perform _admin_log('event', old.id::text, 'delete', old.title); return old; end if;
  perform _admin_log('event', new.id::text,
    case when tg_op = 'INSERT' then 'create'
         when new.active is distinct from old.active then case when new.active then 'show' else 'hide' end
         else 'edit' end, new.title);
  return new;
end $$;
drop trigger if exists local_events_log on public.local_events;
create trigger local_events_log after insert or update or delete on public.local_events
  for each row execute function public._local_events_log();

-- صور الفعاليات: قراءة عامة، والرفع والحذف لإدارة التطبيق فقط
insert into storage.buckets (id, name, public) values ('events', 'events', true) on conflict (id) do nothing;
drop policy if exists "admin write events" on storage.objects;
create policy "admin write events" on storage.objects for insert to authenticated
  with check (bucket_id = 'events' and public.is_admin());
drop policy if exists "admin update events" on storage.objects;
create policy "admin update events" on storage.objects for update to authenticated
  using (bucket_id = 'events' and public.is_admin());
drop policy if exists "admin delete events" on storage.objects;
create policy "admin delete events" on storage.objects for delete to authenticated
  using (bucket_id = 'events' and public.is_admin());
drop policy if exists "admin list events" on storage.objects;
create policy "admin list events" on storage.objects for select to authenticated
  using (bucket_id = 'events' and public.is_admin());

-- ---------- أول القائمة (من المصادر الرسمية، سبتمبر 2026) ----------
-- المواعيد غير المؤكدة لها ملاحظة تظهر بدل التاريخ، وإدارة التطبيق تحدّثها لما تنعلن
insert into public.local_events (id, category, title, title_en, city, city_en, venue, venue_en, starts_on, ends_on, date_note, date_note_en,
                                 summary, summary_en, url, featured) values
 ('e0e0e0e0-0000-4000-8000-000000000001', 'running', 'ماراثون الرياض 2027', 'Riyadh Marathon 2027', 'الرياض', 'Riyadh', null, null,
  '2027-01-31', null, 'نهاية يناير 2027 (يُعلن الموعد)', 'Late January 2027 (date to be announced)',
  'ماراثون الرياض السنوي من تنظيم الاتحاد السعودي للرياضة للجميع. المسافات: ماراثون 42.2 كم، نصف ماراثون 21.1 كم، 10 كم، و5 كم للجميع. نسخة 2026 كانت في 31 يناير من جامعة الأميرة نورة.',
  'The annual Riyadh Marathon, organised by the Saudi Sports for All Federation. Distances: marathon 42.2 km, half marathon 21.1 km, 10 km and a 5 km fun run. The 2026 edition ran on 31 January from Princess Nourah University.',
  'https://www.riyadhmarathon.org/', true),
 ('e0e0e0e0-0000-4000-8000-000000000002', 'horse_racing', 'كأس السعودية 2027', 'The Saudi Cup 2027', 'الرياض', 'Riyadh', 'ميدان الملك عبدالعزيز للفروسية', 'King Abdulaziz Racecourse',
  '2027-02-05', '2027-02-06', null, null,
  'النسخة الثامنة من كأس السعودية، من أغلى سباقات الخيل في العالم، على مدى يومين ضمن موسم سباقات الرياض.',
  'The eighth Saudi Cup, one of the richest horse races in the world, over two days of the Riyadh racing season.',
  'https://www.visitsaudi.com/ar/riyadh/events/saudi-cup', true),
 ('e0e0e0e0-0000-4000-8000-000000000003', 'horse_racing', 'موسم سباقات الرياض', 'Riyadh Racing Season', 'الرياض', 'Riyadh', 'ميدان الملك عبدالعزيز للفروسية', 'King Abdulaziz Racecourse',
  '2026-10-16', '2027-04-17', null, null,
  'سباقات كل جمعة وسبت، ومن أبرزها كأس السعودية (5 و6 فبراير) وكأس الملك عبدالعزيز (12 مارس).',
  'Racing every Friday and Saturday, including the Saudi Cup (5–6 February) and the King Abdulaziz Cup (12 March).',
  'https://jcsa.sa/en/news/20260813-riyadh-race-programme', false),
 ('e0e0e0e0-0000-4000-8000-000000000004', 'hiking', 'سباق العلا للمسارات 2027', 'AlUla Trail Race 2027', 'العلا', 'AlUla', null, null,
  '2027-01-22', null, null, null,
  'جري ومشي في مسارات العلا الطبيعية بمسافات تناسب الكل: 100 و50 و23 و10 كم، و3 كم وقت الغروب، وسباق للأطفال.',
  'Running and walking AlUla''s natural trails, with a distance for everyone: 100, 50, 23 and 10 km, a 3 km sunset run and a kids'' race.',
  'https://www.experiencealula.com/en/whats-on/events/alula-trail-race', true),
 ('e0e0e0e0-0000-4000-8000-000000000005', 'hiking', 'الهايكنج مع الاتحاد السعودي للتسلق والهايكنج', 'Hiking with the Saudi Climbing & Hiking Federation', 'مناطق المملكة', 'Across Saudi Arabia', null, null,
  null, null, 'المواعيد تُعلن عند الاتحاد', 'Dates announced by the federation',
  'الجهة الرسمية للتسلق والهايكنج في المملكة. تابع رحلاته وفعالياته في مسارات الرياض والطائف وعسير وغيرها.',
  'The official body for climbing and hiking in Saudi Arabia. Follow its trips and events on trails in Riyadh, Taif, Asir and more.',
  'https://climbing.sa/ar/', false),
 ('e0e0e0e0-0000-4000-8000-000000000006', 'shooting', 'معرض الصقور والصيد السعودي الدولي 2026', 'Saudi Falcons & Hunting Exhibition 2026', 'الرياض', 'Riyadh', 'ملهم', 'Malham',
  '2026-10-01', '2026-10-10', null, null,
  'عشرة أيام للصقور والصيد والرحلات والأسلحة الرياضية. في نسخة 2025 قدّم الاتحاد السعودي للرماية تجربة رماية وتدريباً على أساسيات الرماية الآمنة للزوار.',
  'Ten days of falconry, hunting, outdoor trips and sporting firearms. In 2025 the Saudi Shooting Federation ran a shooting experience with safety basics for visitors.',
  'https://www.visitsaudi.com/en/riyadh/events/international-saudi-falcons-hunting-exhibition', true),
 ('e0e0e0e0-0000-4000-8000-000000000007', 'shooting', 'بطولات الاتحاد السعودي للرماية', 'Saudi Shooting Federation championships', 'المملكة', 'Saudi Arabia', null, null,
  null, null, 'المواعيد تُعلن في حساب الاتحاد', 'Dates announced on the federation''s account',
  'بطولات الرماية الرسمية وبرامج التدريب والتأهيل. تابع الاتحاد لمعرفة البطولات القادمة وطريقة المشاركة.',
  'Official shooting championships and training programmes. Follow the federation for upcoming events and how to take part.',
  'https://x.com/saudishooting', false),
 ('e0e0e0e0-0000-4000-8000-000000000008', 'boxing', 'دورة الألعاب الآسيوية للصالات والفنون القتالية', 'Asian Indoor & Martial Arts Games', 'الرياض', 'Riyadh', null, null,
  '2026-12-13', '2026-12-21', null, null,
  'منافسات آسيوية في الرياض تشمل الملاكمة، والفنون القتالية المختلطة، والمواي تاي، والجودو، والتايكوندو، والكاراتيه، والمصارعة.',
  'Asia-wide competition in Riyadh including boxing, MMA, Muay Thai, judo, taekwondo, karate and wrestling.',
  'https://asianboxing.org/event/6th-asian-indoor-martial-art-games/', true),
 ('e0e0e0e0-0000-4000-8000-000000000009', 'boxing', 'نزالات موسم الرياض 2026', 'Riyadh Season 2026 fight nights', 'الرياض', 'Riyadh', null, null,
  '2026-10-21', null, 'من 21 أكتوبر 2026 (مواعيد النزالات تُعلن)', 'From 21 October 2026 (fight dates to be announced)',
  'موسم الرياض ينطلق 21 أكتوبر 2026، ومعه نزالات ملاكمة ومصارعة كبرى تُعلن مواعيدها خلال الموسم.',
  'Riyadh Season starts on 21 October 2026, with major boxing and wrestling nights announced during the season.',
  'https://www.visitsaudi.com/en/seasons/riyadh-season', false),
 ('e0e0e0e0-0000-4000-8000-000000000010', 'motorsport', 'رالي داكار السعودية 2027', 'Dakar Rally Saudi Arabia 2027', 'رابغ', 'Rabigh', 'مدينة الملك عبدالله الاقتصادية', 'King Abdullah Economic City',
  '2027-01-01', '2027-01-15', null, null,
  'أشهر رالي صحراوي في العالم، ينطلق وينتهي في مدينة الملك عبدالله الاقتصادية، ومساره فيه ثلاث مراحل جديدة.',
  'The world''s best-known desert rally, starting and finishing in King Abdullah Economic City, with three new stages on the route.',
  'https://www.spa.gov.sa/en/N2578312', false),
 ('e0e0e0e0-0000-4000-8000-000000000011', 'motorsport', 'جائزة السعودية الكبرى للفورمولا 1 2027', 'Formula 1 Saudi Arabian Grand Prix 2027', 'جدة', 'Jeddah', 'حلبة كورنيش جدة', 'Jeddah Corniche Circuit',
  '2027-03-19', '2027-03-21', null, null,
  'سباق الفورمولا 1 الليلي على حلبة كورنيش جدة، من أسرع حلبات الشوارع في العالم.',
  'The Formula 1 night race on the Jeddah Corniche Circuit, one of the fastest street circuits in the world.',
  'https://ticketing.formula1.com/saudi-arabia/', false)
on conflict (id) do nothing;
