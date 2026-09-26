-- حذف الحساب من داخل التطبيق (مطلوب من Apple و Google لأي تطبيق فيه تسجيل حساب)
-- يحذف المستخدم من auth.users، وكل بياناته تنحذف تلقائياً (on delete cascade).
-- ملاحظة: الصور في Storage تُحذف من التطبيق قبل استدعاء الدالة.
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  delete from auth.users where id = v_uid;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- لحذف ملفات المستخدم قبل حذف الحساب: قراءة/حذف مجلده الخاص في الصور العامة
create policy "own folder list avatars" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own folder delete avatars" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own folder list posts" on storage.objects for select to authenticated
  using (bucket_id = 'posts' and (storage.foldername(name))[1] = auth.uid()::text);
