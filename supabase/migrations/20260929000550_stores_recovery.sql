-- =====================================================================
-- ١) المتاجر (بدل «البراندات»): أقسام للمطاعم الصحية والملابس الرياضية، وأطباق المطاعم فيها سعرات وماكروز
--    تنسجل في سجل الأكل بضغطة
-- ٢) الاستشفاء: دليل مراكز العلاج الطبيعي والاستشفاء + «أضف مركزك» واعتماد من لوحة المالك
-- =====================================================================

-- ---------- المتاجر ----------
alter table public.brands drop constraint if exists brands_category_check;
alter table public.brands add constraint brands_category_check
  check (category in ('restaurant','apparel','supplements','equipment','accessories','nutrition','other'));
alter table public.brands add column if not exists city text check (city is null or char_length(btrim(city)) between 2 and 40);

alter table public.brand_products
  add column if not exists kcal integer check (kcal is null or kcal between 0 and 5000),
  add column if not exists protein_g numeric(6,1) check (protein_g is null or protein_g between 0 and 500),
  add column if not exists carbs_g numeric(6,1) check (carbs_g is null or carbs_g between 0 and 1000),
  add column if not exists fat_g numeric(6,1) check (fat_g is null or fat_g between 0 and 500);

-- طبق من مطعم شريك ينسجل في سجل الأكل بمصدر «store»
alter table public.food_logs drop constraint if exists food_logs_source_check;
alter table public.food_logs add constraint food_logs_source_check
  check (source in ('db','custom','plan','barcode','photo','store'));

-- ---------- مراكز العلاج الطبيعي والاستشفاء ----------
create table public.recovery_centers (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid unique references public.profiles(id) on delete cascade,  -- فاضي = مدرج من أرك من الموقع الرسمي
  listed_by    text not null default 'owner' check (listed_by in ('owner','arq')),
  name         text not null check (char_length(btrim(name)) between 2 and 80),
  name_en      text check (name_en is null or char_length(btrim(name_en)) between 2 and 80),
  kind         text not null default 'physio' check (kind in ('physio','recovery','sports_medicine','hospital')),
  cities       text[] not null default '{}' check (cardinality(cities) between 1 and 12),
  services     text[] not null default '{}' check (cardinality(services) <= 14 and services <@ array[
                 'sports_injury','manual_therapy','post_op','dry_needling','massage','cupping','cryotherapy','hydrotherapy',
                 'sauna','compression','hbot','home_visits','women_health','performance']::text[]),
  description  text check (char_length(description) <= 600),
  phone        text check (phone is null or phone ~ '^\+?[0-9 ]{6,20}$'),
  whatsapp     text check (whatsapp is null or whatsapp ~ '^[0-9]{8,15}$'),
  website      text check (website is null or website ~* '^https://[^\s]+$'),
  instagram    text check (instagram is null or instagram ~ '^[A-Za-z0-9_.]{1,30}$'),
  logo_path    text check (logo_path is null or char_length(logo_path) <= 200),
  license_no   text check (license_no is null or char_length(btrim(license_no)) between 3 and 40),
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note  text check (char_length(review_note) <= 300),
  created_at   timestamptz not null default now(),
  check (listed_by = 'arq' or owner is not null)
);
create index on public.recovery_centers (status, kind);

-- صاحب المركز ما يغيّر حالة المراجعة، ولو كان مرفوض وعدّل يرجع «قيد المراجعة»
create or replace function public._rc_guard()
returns trigger language plpgsql as $$
begin
  if current_user not in ('authenticated','anon') or is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.owner := auth.uid(); new.listed_by := 'owner'; new.status := 'pending'; new.review_note := null;
  else
    if new.owner is distinct from old.owner or new.listed_by is distinct from old.listed_by or new.review_note is distinct from old.review_note then
      raise exception 'status_locked';
    end if;
    if old.status = 'rejected' then new.status := 'pending';
    elsif new.status is distinct from old.status then raise exception 'status_locked';
    end if;
  end if;
  return new;
end $$;
create trigger rc_guard before insert or update on public.recovery_centers for each row execute function public._rc_guard();

-- إشعار المالك لما يوصل مركز جديد أو يرجع بعد التعديل
create or replace function public._rc_submitted() returns trigger language plpgsql security definer set search_path = public as $$
declare v_a uuid;
begin
  if new.status = 'pending' and new.listed_by = 'owner' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    for v_a in select user_id from app_admins loop
      perform _notice(v_a, 'rc:' || new.id || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
        'مركز علاج طبيعي ينتظر اعتمادك', new.name || ' طلب ينضم لدليل الاستشفاء. راجعه من لوحة المالك.',
        'Recovery center to review', coalesce(new.name_en, new.name) || ' asked to join the recovery directory. Review it in the owner panel.',
        '/owner', new.id);
    end loop;
  end if;
  return new;
end $$;
create trigger rc_submitted after insert or update on public.recovery_centers for each row execute function public._rc_submitted();

-- مركز واحد لكل حساب، وحد للطلبات
create or replace function public._rc_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.listed_by = 'owner' and (select count(*) from recovery_centers where owner = new.owner) >= 1 then raise exception 'duplicate'; end if;
  return new;
end $$;
create trigger rc_limit before insert on public.recovery_centers for each row execute function public._rc_limit();

-- اعتماد أو رفض من المالك
create or replace function public.review_center(p_id uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_c recovery_centers; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'bad_status'; end if;
  if p_decision = 'rejected' and v_note is null and exists (select 1 from recovery_centers where id = p_id and listed_by = 'owner') then
    raise exception 'consent_required';
  end if;
  update recovery_centers set status = p_decision, review_note = left(v_note, 300) where id = p_id returning * into v_c;
  if v_c.id is null then raise exception 'request_not_found'; end if;
  if v_c.owner is not null then
    if p_decision = 'approved' then
      perform _notice(v_c.owner, 'rcr:' || p_id || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
        'انعتمد مركزك ✓', v_c.name || ' صار ظاهر في دليل الاستشفاء لكل مستخدمي أرك.',
        'Your center is approved ✓', coalesce(v_c.name_en, v_c.name) || ' now appears in the ARQ recovery directory.', '/recovery/centers', p_id);
    else
      perform _notice(v_c.owner, 'rcr:' || p_id || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
        'طلب مركزك يحتاج تعديل', coalesce(v_note, 'راجع بيانات المركز وأرسله مرة ثانية.'),
        'Your center needs changes', coalesce(v_note, 'Review your center details and submit again.'), '/recovery/join', p_id);
    end if;
  end if;
end $$;
revoke all on function public.review_center(uuid, text, text) from public, anon;
grant execute on function public.review_center(uuid, text, text) to authenticated;

alter table public.recovery_centers enable row level security;
create policy rc_read on public.recovery_centers for select to authenticated using (status = 'approved' or owner = auth.uid() or is_admin());
create policy rc_insert on public.recovery_centers for insert to authenticated with check (owner = auth.uid() or is_admin());
create policy rc_update on public.recovery_centers for update to authenticated using (owner = auth.uid() or is_admin()) with check (owner = auth.uid() or is_admin());
create policy rc_delete on public.recovery_centers for delete to authenticated using (owner = auth.uid() or is_admin());

-- دليل أولي من المواقع الرسمية للمراكز (بدون شعارات، ويظهر عليها «من الموقع الرسمي» لين تنضم كشريك)
insert into public.recovery_centers (listed_by, status, name, name_en, kind, cities, services, phone, whatsapp, website, instagram)
select 'arq', 'approved', v.name, v.name_en, v.kind, v.cities, v.services, v.phone, v.whatsapp, v.website, v.instagram
from (values
  ('فيزيوثيرابيا', 'PhysioTherabia', 'physio', array['الرياض','جدة','مكة','المدينة','الدمام','الخبر','الجبيل','ينبع','تبوك','الطائف'],
     array['sports_injury','post_op','cryotherapy','hydrotherapy','hbot','home_visits'], null, null, 'https://physiotherabia.com', 'physiotherabia'),
  ('فيزيوتريو', 'PhysioTrio', 'physio', array['الرياض','مكة'], array['sports_injury','manual_therapy','performance','women_health'],
     '8001000246', '9668001000246', 'https://physiotrio.sa', null),
  ('مراكز الأخصائيون للعلاج الطبيعي', 'Physical Therapists Center (PTC)', 'physio', array['الرياض'], array['sports_injury','post_op','performance'],
     '920018825', '966559420841', 'https://ptcsaudi.com', 'PTCSaudi'),
  ('عيادات جوينت', 'Joint Clinic', 'physio', array['الرياض'], array['sports_injury','post_op','performance'],
     '920005342', '966920005342', 'https://joint.clinic', 'jointclinic_sa'),
  ('المركز التشيكي للعلاج الطبيعي والتأهيلي', 'Czech Rehabilitation Center', 'physio', array['الرياض'], array['manual_therapy','post_op'],
     '920002737', null, 'https://www.cz-center.com', null),
  ('موف للطب الرياضي', 'MOVE Comprehensive Sports Medicine', 'sports_medicine', array['الرياض'], array['sports_injury','performance','post_op'],
     '920009298', '966920009298', 'https://move.med.sa', 'move_csm'),
  ('فيزيوويل', 'PhysioWell', 'physio', array['الرياض'], array['sports_injury','manual_therapy','women_health','performance'],
     '+966507937685', null, 'https://physiowell.sa', 'physiowell.sa'),
  ('فيزيو برايم', 'Physio Prime', 'physio', array['الرياض'], array['sports_injury','post_op','hydrotherapy'],
     '+966500442164', '966500442164', 'https://physioprimecare.com', 'physioprimesa'),
  ('المركز التأهيلي الدولي للعلاج الطبيعي', 'International Rehabilitation Physiotherapy Center', 'physio', array['جدة'], array['manual_therapy','sports_injury'],
     '+966506673533', null, 'https://www.ipcjeddah.com', 'ipcjeddah'),
  ('عيادة خبراء الجسد', 'BE Clinic', 'physio', array['جدة'], array['sports_injury','post_op','women_health'],
     null, '966550145991', 'https://beclinic.sa', null),
  ('شفت كلينكس', 'Shift Clinics', 'physio', array['جدة'], array['manual_therapy','sports_injury'],
     '+966552129400', '966552129400', 'https://www.shiftclinics.com', 'shiftclinics'),
  ('مركز التميز للعلاج الطبيعي', 'Al-Tamayuz Physical Therapy Center', 'physio', array['الدمام'], array['dry_needling','massage','cupping','sports_injury','women_health'],
     '+966558118228', '966558118228', 'https://attamayuzph.com', null),
  ('عيادات تعافي', 'Recovery Center', 'physio', array['أبها'], array['sports_injury','post_op'],
     '+966172210111', '966172210111', 'https://recovery.sa', 'rcentersa'),
  ('مركز إيكو', 'ECHO Center', 'recovery', array['الرياض'], array['performance','massage','sports_injury'],
     '+966539643339', '966539643339', 'https://echocenter.sa', null),
  ('كرايو إنفينيتي جدة', 'Cryo Infinity Jeddah', 'recovery', array['جدة'], array['cryotherapy','hbot','sauna','compression'],
     '+966555082562', '966555082562', 'https://cryoinfinityjeddah.com', 'cryoinfinityjeddah'),
  ('لونجيفيتي ويلنس هب', 'Longevity Wellness Hub', 'recovery', array['الرياض'], array['cryotherapy','sauna','hbot'],
     '+966554488824', null, 'https://www.longevity-hub.io', 'longevity.hub.ksa'),
  ('مستشفى كينجز كوليدج لندن - جدة (الطب الرياضي)', 'King''s College Hospital London – Jeddah (Sports Medicine)', 'sports_medicine', array['جدة'], array['sports_injury','post_op'],
     '+966920066668', '966545907276', 'https://kch.sa/en/specialties/orthopaedics/sports-medicine', 'kchlsaudi'),
  ('السعودي الألماني الصحية - العلاج الطبيعي', 'Saudi German Health – Physiotherapy', 'hospital', array['جدة','الرياض','مكة','المدينة','الدمام','حائل','أبها'], array['sports_injury','post_op'],
     '+966920007997', '966920007997', 'https://saudigermanhealth.com/en/department/physiotherapy-rehabilitation', 'sgh.group'),
  ('مستشفى الدكتور سليمان فقيه - العلاج الطبيعي', 'Dr. Soliman Fakeeh Hospital – Physiotherapy', 'hospital', array['الرياض','جدة'], array['post_op','manual_therapy','hydrotherapy','sports_injury'],
     '8001209999', '966920012777', 'https://en.dsfhriyadh.fakeeh.care/specialties/physiotherapy-and-rehabilitation', 'fakeeh.care'),
  ('مجموعة العبير الطبية - العلاج الطبيعي', 'Abeer Medical Group – Physiotherapy', 'hospital', array['جدة','الرياض','الدمام'], array['sports_injury','post_op'],
     '+966920015888', null, 'https://www.abeergroup.com/ksa/Services/Physiotherapy.aspx', 'abeerhc')
) as v(name, name_en, kind, cities, services, phone, whatsapp, website, instagram)
where not exists (select 1 from public.recovery_centers r where r.listed_by = 'arq' and r.name_en = v.name_en);
