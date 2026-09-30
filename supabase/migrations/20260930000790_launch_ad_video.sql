-- =====================================================================
-- إعلان البداية بالفيديو: نسخة التطبيق الحالية فيها مشغّل الفيديو، فنفتح النوع 'video'
--   * فيديو قصير (لين ٣٠ ثانية و٢٠ ميقا من اللوحة)، يشتغل بدون صوت وفيه زر للصوت
--   * لو «يقفل تلقائياً» مفعّل: يقفل بعد ما يخلص الفيديو، وإلا يبقى لين يضغط تخطي
--   * النسخ القديمة من التطبيق ما تعرف الفيديو: تتخطاه بصمت (ما تقدر تحمّله كصورة)
-- =====================================================================

-- نشيل قيد نوع الملف القديم (أياً كان اسمه) ونحط الجديد
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.launch_ads'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%media_type%'
  loop
    execute format('alter table public.launch_ads drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.launch_ads add constraint launch_ads_media_type_check
  check (media_type in ('image','gif','video'));
