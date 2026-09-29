-- =====================================================================
-- البحث عن منتج بالباركود بالذكاء الاصطناعي (بحث الويب) لما ما يكون في Open Food Facts
--   * حدود الذكاء الاصطناعي من لوحة التحكم (app_settings.ai_limits):
--       بحث الباركود: مرتين باليوم لكل مستخدم افتراضياً، وتحليل صور الوجبات: ٢٥ باليوم
--     (المنتجات الموجودة في القاعدة المفتوحة أو اللي انبحثت قبل ما تنحسب من الحد)
--   * barcode_products: ذاكرة مشتركة للنتائج. أول واحد يمسح المنتج يدفع البحث، والباقين يطلع لهم فوراً.
--     الكتابة من دالة الخادم فقط (service role). «ما لقيناه» ينحفظ ٧ أيام بس عشان ما نكرر البحث كل مرة.
-- =====================================================================

alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check check (kind in ('meal_photo', 'barcode'));

-- التحقق من إعدادات لوحة التحكم (نفس تنبيه السعرات + حدود الذكاء الاصطناعي)
create or replace function public._app_settings_guard()
returns trigger language plpgsql set search_path = public as $$
declare v jsonb := new.value; t integer; b integer; m integer;
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
  elsif new.key = 'ai_limits' then
    begin
      b := (v->>'barcode_per_day')::integer;
      m := (v->>'meal_photos_per_day')::integer;
    exception when others then b := null;
    end;
    if b is null or m is null or b < 0 or b > 100 or m < 0 or m > 200 then raise exception 'bad_value'; end if;
    new.value := jsonb_build_object('barcode_per_day', b, 'meal_photos_per_day', m);
  end if;
  return new;
end $$;

insert into public.app_settings (key, value)
values ('ai_limits', jsonb_build_object('barcode_per_day', 2, 'meal_photos_per_day', 25))
on conflict (key) do nothing;

-- يحجز استخدام واحد إذا ما وصل المستخدم حده اليومي (من لوحة التحكم)، ويرجع كم باقي
create or replace function public.ai_take(p_kind text)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  s jsonb := (select value from app_settings where key = 'ai_limits');
  cap int;
  used int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  cap := case p_kind
    when 'meal_photo' then coalesce((s->>'meal_photos_per_day')::int, 25)
    when 'barcode' then coalesce((s->>'barcode_per_day')::int, 2)
  end;
  if cap is null then raise exception 'bad_status'; end if;
  perform pg_advisory_xact_lock(hashtext('ai_take:' || auth.uid()::text || ':' || p_kind));
  select count(*) into used from ai_usage where user_id = auth.uid() and kind = p_kind and created_at > now() - interval '1 day';
  if used >= cap then raise exception 'rate_limited'; end if;
  insert into ai_usage (user_id, kind) values (auth.uid(), p_kind);
  return cap - used - 1;
end $$;
revoke all on function public.ai_take(text) from public, anon;
grant execute on function public.ai_take(text) to authenticated;

create table if not exists public.barcode_products (
  code        text primary key check (code ~ '^[0-9]{8,14}$'),
  found       boolean not null,
  source      text not null default 'ai' check (source in ('ai')),
  -- المنتج بعد التنظيف: الأسماء، الوحدة، القيم لكل ١٠٠ وللحصة، حجم الحصة والعبوة
  product     jsonb check (product is null or (jsonb_typeof(product) = 'object' and pg_column_size(product) < 8000)),
  confidence  text check (confidence in ('high', 'medium', 'low')),
  source_url  text check (source_url is null or (char_length(source_url) <= 500 and source_url ~ '^https://')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (found = (product is not null))
);
alter table public.barcode_products enable row level security;
drop policy if exists barcode_products_read on public.barcode_products;
create policy barcode_products_read on public.barcode_products for select to authenticated using (true);
revoke insert, update, delete on public.barcode_products from anon, authenticated;
