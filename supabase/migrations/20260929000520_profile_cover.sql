-- خلفية الحساب (خلف الاسم في صفحة الحساب): لون من ألوان أرك أو صورة من جهاز المستخدم.
-- 'auto' = تتبع ثيم التطبيق عند كل مشاهد (السلوك القديم). الصورة تنحفظ في مجلد المستخدم نفسه في avatars.
alter table public.profiles
  add column if not exists cover text not null default 'auto'
    constraint profiles_cover_check check (cover in ('auto','ember','palm','oasis','dune','lavender','night','gold')),
  add column if not exists cover_url text
    constraint profiles_cover_url_check check (cover_url is null or (char_length(cover_url) <= 200 and cover_url like id::text || '/%' and cover_url !~ '\.\.'));

grant update (cover, cover_url) on public.profiles to authenticated;
