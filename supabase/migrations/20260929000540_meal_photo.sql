-- =====================================================================
-- تحليل صورة الوجبة بالذكاء الاصطناعي: حد يومي لكل مستخدم (يحمي التكلفة)
-- الصورة نفسها ما تنحفظ: تنرسل للتحليل وبس، والمستخدم يراجع النتيجة قبل ما تنسجل في سجل الأكل
-- =====================================================================
create table public.ai_usage (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('meal_photo')),
  created_at  timestamptz not null default now()
);
create index on public.ai_usage (user_id, kind, created_at desc);
alter table public.ai_usage enable row level security;
create policy ai_usage_read_own on public.ai_usage for select to authenticated using (user_id = auth.uid());

-- يحجز استخدام واحد إذا ما وصل المستخدم الحد (٢٥ صورة وجبة باليوم)، ويرجع كم باقي
create or replace function public.ai_take(p_kind text)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  cap int := case p_kind when 'meal_photo' then 25 else 0 end;
  used int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if cap = 0 then raise exception 'bad_status'; end if;
  perform pg_advisory_xact_lock(hashtext('ai_take:' || auth.uid()::text || ':' || p_kind));
  select count(*) into used from ai_usage where user_id = auth.uid() and kind = p_kind and created_at > now() - interval '1 day';
  if used >= cap then raise exception 'rate_limited'; end if;
  insert into ai_usage (user_id, kind) values (auth.uid(), p_kind);
  return cap - used - 1;
end $$;
revoke all on function public.ai_take(text) from public, anon;
grant execute on function public.ai_take(text) to authenticated;
