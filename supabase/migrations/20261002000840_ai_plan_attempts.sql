-- =====================================================================
-- خطط الذكاء الاصطناعي: حد يومي «ذرّي» لعدد المحاولات (٨ باليوم لكل مستخدم)
--   حد الخطط المحفوظة (٥ باليوم) يتحقق بالدالة قبل ما تبدأ، بس الطلبات المتزامنة كانت تعدّيه
--   (كلها تشيّك قبل ما تنحفظ أي خطة). الحين كل محاولة تحجز مكانها قبل استدعاء الذكاء الاصطناعي،
--   بقفل لكل مستخدم، فما يقدر يتعدى الحد ولو أرسل طلبات كثير بنفس اللحظة.
--   المحاولة اللي تفشل تنحسب (لأنها تكلّف)، والزيادة عن ٥ تعطي مجال لو فشلت محاولة أو ثنتين.
-- =====================================================================
alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check check (kind in ('meal_photo', 'barcode', 'plan'));

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
