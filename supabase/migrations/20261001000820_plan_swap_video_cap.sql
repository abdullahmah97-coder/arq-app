-- =====================================================================
-- مراجعة الليلة ٢ (من اللي طلع أمس):
--   * تبديل الخطة الفعّالة بخطوة وحدة: قبل كان «وقّف القديمة» ثم «فعّل الجديدة» بطلبين،
--     ولو انقطع الاتصال بينهم يبقى الشخص بدون خطة فعّالة. الحين الاثنين مع بعض أو ولا وحدة.
--   * فيديو المحادثة: القاعدة تمشي على نفس حد التطبيق (دقيقة) للرسائل الجديدة، بدل ١٠ دقايق.
-- =====================================================================

create or replace function public.activate_plan(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from plans where id = p_id and user_id = auth.uid()) then
    raise exception 'not_allowed';
  end if;
  update plans set active = false where user_id = auth.uid() and active and id <> p_id;
  update plans set active = true where id = p_id and not active;
end $$;
revoke all on function public.activate_plan(uuid) from public, anon;
grant execute on function public.activate_plan(uuid) to authenticated;

alter table public.messages drop constraint if exists messages_video_minute;
alter table public.messages add constraint messages_video_minute check (media_dur is null or media_dur <= 61) not valid;
