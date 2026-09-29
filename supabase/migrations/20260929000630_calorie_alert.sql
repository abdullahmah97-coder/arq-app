-- إعدادات يتحكم فيها المالك من «لوحة إدارة التطبيق»، وأولها نص تنبيه «باقي لك ٢٠٠ سعرة»
-- التنبيه نفسه يطلع من جوال المستخدم بعد ما يسجّل أكله، والمستخدم يشغّله أو يطفيه من مربع السعرات
create table if not exists public.app_settings (
  key         text primary key check (key ~ '^[a-z_]{2,40}$'),
  value       jsonb not null check (jsonb_typeof(value) = 'object' and pg_column_size(value) < 4000),
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);
alter table public.app_settings enable row level security;
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings for select to authenticated using (true);
drop policy if exists app_settings_admin on public.app_settings;
create policy app_settings_admin on public.app_settings for all to authenticated using (is_admin()) with check (is_admin());

-- التحقق من القيم قبل الحفظ (الرقم بين ٥٠ و٥٠٠، والعنوان والنص بالعربي مطلوبة)
create or replace function public._app_settings_guard()
returns trigger language plpgsql set search_path = public as $$
declare v jsonb := new.value; t integer;
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if new.key = 'calorie_alert' then
    begin t := (v->>'threshold')::integer; exception when others then t := null; end;
    if t is null or t < 50 or t > 500 then raise exception 'bad_value'; end if;
    if coalesce(jsonb_typeof(v->'enabled'), '') <> 'boolean' then raise exception 'bad_value'; end if;
    if char_length(btrim(coalesce(v->>'title_ar', ''))) not between 2 and 80
       or char_length(btrim(coalesce(v->>'body_ar', ''))) not between 2 and 200
       or char_length(coalesce(v->>'title_en', '')) > 80 or char_length(coalesce(v->>'body_en', '')) > 200 then
      raise exception 'bad_value';
    end if;
    -- نخزن فقط المفاتيح المعروفة
    new.value := jsonb_build_object('enabled', (v->>'enabled')::boolean, 'threshold', t,
      'title_ar', btrim(v->>'title_ar'), 'body_ar', btrim(v->>'body_ar'),
      'title_en', nullif(btrim(coalesce(v->>'title_en', '')), ''), 'body_en', nullif(btrim(coalesce(v->>'body_en', '')), ''));
  end if;
  return new;
end $$;
drop trigger if exists app_settings_guard on public.app_settings;
create trigger app_settings_guard before insert or update on public.app_settings
  for each row execute function public._app_settings_guard();

create or replace function public._app_settings_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then perform _admin_log('setting', new.key, 'edit', null); end if;
  return new;
end $$;
drop trigger if exists app_settings_log on public.app_settings;
create trigger app_settings_log after insert or update on public.app_settings
  for each row execute function public._app_settings_log();

-- النص الافتراضي: {n} = الباقي، {eaten} = اللي أكله، {goal} = احتياجه
insert into public.app_settings (key, value) values ('calorie_alert', jsonb_build_object(
  'enabled', true, 'threshold', 200,
  'title_ar', 'باقي لك {n} سعرة وتكمّل احتياجك',
  'body_ar', 'أكلت {eaten} من {goal} سعرة اليوم. خل آخر شي تاكله خفيف وفيه بروتين.',
  'title_en', '{n} kcal left to hit your target',
  'body_en', 'You''ve had {eaten} of {goal} kcal today. Keep the last bite light and high in protein.'))
on conflict (key) do nothing;
