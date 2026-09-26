-- =====================================================================
-- تقارير InBody: صورة/ملف التقرير + الأرقام المستخرجة + نتيجة التحليل
-- خاصة تماماً: لا يراها إلا صاحبها
-- =====================================================================

create table public.inbody_reports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  file_path    text,                  -- داخل حاوية inbody الخاصة (صورة أو PDF)
  test_date    date,
  metrics      jsonb not null,        -- الأرقام المستخرجة (بعد مراجعة المستخدم)
  analysis     jsonb,                 -- ناتج محرك التحليل (ملاحظات + الهدف المقترح)
  source       text not null default 'ai' check (source in ('ai','manual')),
  applied      boolean not null default false,  -- هل طُبّق على الخطة
  created_at   timestamptz not null default now()
);
create index on public.inbody_reports (user_id, test_date desc, created_at desc);

alter table public.inbody_reports enable row level security;
create policy inbody_own on public.inbody_reports for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ربط الخطة بالتقرير الذي بُنيت عليه
alter table public.plans add column inbody_report_id uuid references public.inbody_reports(id) on delete set null;

-- حاوية خاصة لملفات التقارير
insert into storage.buckets (id, name, public) values ('inbody', 'inbody', false)
on conflict (id) do nothing;

create policy "inbody files owner only" on storage.objects for all to authenticated
  using (bucket_id = 'inbody' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'inbody' and (storage.foldername(name))[1] = auth.uid()::text);
