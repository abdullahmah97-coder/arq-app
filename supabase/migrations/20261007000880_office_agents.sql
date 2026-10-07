-- =====================================================================
-- مكتب أرك أب: موظفين الذكاء الاصطناعي (المرحلة ٢)
--   * office_tasks: كل شغل يجهّزه وكيل (Claude) لمكتب من المكاتب ينحفظ هنا صف:
--       فرز بلاغ مختبِر، مراجعة طلب شريك (نادي/متجر/مدرب/مركز/ملعب)، مسودة تذكير، اقتراح حدود الذكاء، ملخص اليوم.
--   * الوكيل نفسه ما يغيّر أي بيانات بالتطبيق: يكتب اقتراحه وينتظر موافقة المالك (waiting_approval).
--     المالك يعدّل الاقتراح لو يبي، والتطبيق يطبّقه بجلسة المالك نفسه (نفس الدوال الموجودة)،
--     وبعدين يسجّل القرار بـ office_decide (موافقة أو رفض) — والقرار ينكتب في سجل إجراءات المالك.
--   * يقرأها الأدمن بس. الكتابة من دالة الخادم (service role) والقرار من office_decide، ما في كتابة مباشرة.
--   * المهمة اللي خلصت (done/failed) مقفولة: حالتها واقتراحها وقرارها ما يتغيّرون.
--   * مهمة مفتوحة وحدة بس لكل عنصر (بلاغ/طلب): تشغيلتين بنفس الوقت ما ياخذون نفس الطلب.
--   * حد يومي لاستدعاءات المكتب: ٨٠ باليوم لكل أدمن (ai_take('office')).
-- =====================================================================

create table if not exists public.office_tasks (
  id          uuid primary key default gen_random_uuid(),
  desk        text not null check (desk in ('lead','clubs','stores','coaches','care','reports','marketing','users','ai')),
  kind        text not null check (kind in ('triage_report','review_partner','draft_nudge','review_ai_limits','daily_brief')),
  target_kind text check (target_kind in ('report','club','store','coach','center','venue')),
  target_id   uuid,
  title       text check (title is null or char_length(title) <= 120),
  status      text not null default 'in_progress' check (status in ('scheduled','in_progress','waiting_approval','done','failed')),
  input       jsonb not null default '{}'::jsonb check (jsonb_typeof(input) = 'object' and pg_column_size(input) < 8000),
  output      jsonb check (output is null or (jsonb_typeof(output) = 'object' and pg_column_size(output) < 32000)),
  error       text check (error is null or char_length(error) <= 300),
  model       text check (model is null or char_length(model) <= 60),
  request_id  text check (request_id is null or request_id ~ '^[A-Za-z0-9-]{8,64}$'),
  decision    text check (decision in ('approved','rejected')),
  decision_note text check (decision_note is null or char_length(decision_note) <= 300),
  final       jsonb check (final is null or (jsonb_typeof(final) = 'object' and pg_column_size(final) < 8000)),
  decided_by  uuid references public.profiles(id) on delete set null,
  decided_at  timestamptz,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  finished_at timestamptz,
  -- نوع المهمة لازم يطابق مكتبها ونوع العنصر اللي تشتغل عليه
  check (
    (kind = 'triage_report' and desk = 'reports' and target_kind = 'report' and target_id is not null) or
    (kind = 'review_partner' and target_id is not null and (
       (desk = 'clubs' and target_kind = 'club') or (desk = 'stores' and target_kind = 'store') or
       (desk = 'coaches' and target_kind = 'coach') or (desk = 'care' and target_kind in ('center','venue')))) or
    (kind = 'draft_nudge' and desk = 'marketing' and target_kind is null) or
    (kind = 'review_ai_limits' and desk = 'ai' and target_kind is null) or
    (kind = 'daily_brief' and desk = 'lead' and target_kind is null)
  ),
  -- اللي ينتظر موافقة لازم معه اقتراح، والقرار ووقته يجون مع بعض، والمهمة المقرّرة خلصت
  check (status <> 'waiting_approval' or output is not null),
  check ((decision is null) = (decided_at is null)),
  check (decision is null or status = 'done')
);
create index if not exists office_tasks_status on public.office_tasks (status, desk);
create index if not exists office_tasks_recent on public.office_tasks (created_at desc);
-- مهمة مفتوحة وحدة لكل عنصر (لو انشغّلت تشغيلتين بنفس اللحظة الثانية ما تقدر تاخذ نفس الطلب)
create unique index if not exists office_tasks_open_target on public.office_tasks (kind, target_kind, target_id)
  where target_id is not null and status in ('scheduled','in_progress','waiting_approval');

alter table public.office_tasks enable row level security;

-- يقرأها الأدمن بس. ما في سياسة إضافة/تعديل/حذف: الخادم يكتب بالـ service role، والقرار من office_decide
drop policy if exists office_tasks_admin_read on public.office_tasks;
create policy office_tasks_admin_read on public.office_tasks for select to authenticated
  using ((select public.is_admin()));

revoke all on public.office_tasks from anon;
revoke insert, update, delete, truncate on public.office_tasks from authenticated;
grant select on public.office_tasks to authenticated;

-- الحارس: وقت آخر تعديل، قفل المهمة اللي خلصت، ووقت انتهاء شغل الوكيل
create or replace function public._office_task_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  -- اللي خلصت (أو فشلت) ما ترجع تتغيّر: لا حالتها ولا اقتراحها ولا قرارها
  if old.status in ('done', 'failed') and (
       new.status is distinct from old.status or new.output is distinct from old.output
       or new.decision is distinct from old.decision or new.final is distinct from old.final
       or new.decision_note is distinct from old.decision_note) then
    raise exception 'task_locked';
  end if;
  -- أول ما يخلص الوكيل (ينتظر موافقة، خلص، أو فشل) نسجّل وقت الانتهاء
  if new.status in ('waiting_approval', 'done', 'failed') and new.status is distinct from old.status then
    new.finished_at := coalesce(new.finished_at, now());
  end if;
  return new;
end $$;
revoke all on function public._office_task_guard() from public, anon, authenticated;
drop trigger if exists office_tasks_guard on public.office_tasks;
create trigger office_tasks_guard before update on public.office_tasks
  for each row execute function public._office_task_guard();

-- قرار المالك على اقتراح ينتظر موافقته (التطبيق يطبّق الاقتراح بجلسة المالك قبلها، وهذي تسجّل القرار بس)
create or replace function public.office_decide(p_id uuid, p_decision text, p_final jsonb default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_note text := nullif(left(btrim(p_note), 300), '');
  v_title text;
begin
  if not is_admin() then raise exception 'not_allowed'; end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then raise exception 'bad_status'; end if;
  -- النسخة النهائية (بعد تعديل المالك) لازم كائن JSON وبحجم معقول
  if p_final is not null and (jsonb_typeof(p_final) <> 'object' or pg_column_size(p_final) >= 8000) then
    raise exception 'bad_input';
  end if;
  update office_tasks
     set decision = p_decision, final = p_final, decision_note = v_note,
         decided_by = auth.uid(), decided_at = now(), status = 'done'
   where id = p_id and status = 'waiting_approval'
  returning title into v_title;
  -- ما في مهمة تنتظر موافقة بهالرقم (انقرّرت قبل، أو الوكيل لسا يشتغل، أو فشلت)
  if not found then raise exception 'not_waiting'; end if;
  perform _admin_log('office', p_id::text, p_decision, coalesce(v_title, v_note));
end $$;
revoke all on function public.office_decide(uuid, text, jsonb, text) from public, anon;
grant execute on function public.office_decide(uuid, text, jsonb, text) to authenticated;

-- ---------- حد استدعاءات الذكاء الاصطناعي: نوع جديد «office» (٨٠ باليوم لكل أدمن) ----------
alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check check (kind in ('meal_photo', 'barcode', 'plan', 'office'));

-- يحجز استخدام واحد إذا ما وصل المستخدم حده اليومي، ويرجع كم باقي
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
    when 'plan' then 8
    when 'office' then 80
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
