-- =====================================================================
-- موافقة الشركاء على «سياسة تسجيل الشركاء»: مين وافق، على أي نسخة، ولأي نوع شريك، ومتى.
--   * الشريك يضيف موافقته بنفسه مع إرسال طلب التسجيل (نوع الشريك ورقم النسخة بس)،
--     وصاحب الموافقة ووقتها تحددهم القاعدة (ما يقدر يكتبهم أو يغيّرهم).
--   * يشوفها صاحبها ومالك التطبيق. ما أحد يعدّلها أو يحذفها (تنحذف مع حذف الحساب).
--   * موافقة وحدة لكل (شخص، نوع، نسخة): نسخة جديدة من السياسة = موافقة جديدة.
-- =====================================================================
create table if not exists public.partner_terms (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('club', 'store', 'venue', 'center')),
  version     text not null check (version ~ '^[0-9]{1,2}\.[0-9]{1,2}$'),
  accepted_at timestamptz not null default now(),
  unique (user_id, kind, version)
);
alter table public.partner_terms enable row level security;

-- صاحب الموافقة هو اللي مسجّل دخول، ووقتها وقت الإضافة (حتى لو أرسل غيرهم)
create or replace function public._partner_terms_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then new.user_id := auth.uid(); end if;
  new.accepted_at := now();
  return new;
end $$;
revoke all on function public._partner_terms_stamp() from public, anon, authenticated;
drop trigger if exists partner_terms_stamp on public.partner_terms;
create trigger partner_terms_stamp before insert on public.partner_terms
  for each row execute function public._partner_terms_stamp();

drop policy if exists "partner terms insert own" on public.partner_terms;
create policy "partner terms insert own" on public.partner_terms for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "partner terms read own or admin" on public.partner_terms;
create policy "partner terms read own or admin" on public.partner_terms for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

revoke all on public.partner_terms from anon;
revoke update, delete, truncate on public.partner_terms from authenticated;
grant select, insert on public.partner_terms to authenticated;
