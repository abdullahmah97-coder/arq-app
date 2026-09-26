-- بيانات تجريبية: أندية موثّقة للتجربة (الإحداثيات تقريبية — استبدلها بأنديتك الحقيقية)
insert into public.gyms (name, name_en, city, lat, lng, radius_m, verified) values
  ('نادي تجريبي - العليا',     'Demo Gym - Olaya',       'الرياض', 24.6905, 46.6853, 150, true),
  ('نادي تجريبي - النرجس',     'Demo Gym - Al Narjis',   'الرياض', 24.8605, 46.6603, 150, true),
  ('نادي تجريبي - الملقا',     'Demo Gym - Al Malqa',    'الرياض', 24.8110, 46.6130, 150, true),
  ('نادي تجريبي - جدة الروضة', 'Demo Gym - Jeddah Rawdah','جدة',   21.5580, 39.1570, 150, true),
  ('نادي تجريبي - الخبر',      'Demo Gym - Khobar',      'الخبر',  26.2790, 50.2080, 150, true);

-- لتوثيق نادٍ أضافه مستخدم (من لوحة Supabase SQL فقط):
-- update public.gyms set verified = true where id = '...';
