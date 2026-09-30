-- =====================================================================
-- تفاعل جديد في التايم لاين: خاروف 🐑 (مع ❤️ 💪 🔥 😂 👏)
-- =====================================================================
alter table public.post_likes drop constraint if exists post_likes_emoji_check;
alter table public.post_likes add constraint post_likes_emoji_check
  check (emoji in ('love','strong','fire','laugh','clap','sheep'));
alter table public.checkin_likes drop constraint if exists checkin_likes_emoji_check;
alter table public.checkin_likes add constraint checkin_likes_emoji_check
  check (emoji in ('love','strong','fire','laugh','clap','sheep'));

-- نص إشعار التفاعل: «فيصل تفاعل 🐑 مع منشورك»
create or replace function public._reaction_char(p text)
returns text language sql immutable as $$
  select case p when 'love' then '❤️' when 'strong' then '💪' when 'fire' then '🔥' when 'laugh' then '😂'
                when 'clap' then '👏' when 'sheep' then '🐑' else '' end;
$$;
