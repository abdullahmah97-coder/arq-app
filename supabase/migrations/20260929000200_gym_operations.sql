-- =====================================================================
-- تشغيل النادي: الاشتراكات، موظفين الاستقبال، الدخول بـ QR، بوابات الدخول، الاستيراد،
-- طلبات التجميد والنقل، الملاحظات، ادعُ صديقك، الإعلانات، الحصص والحجز، وتنبيهات التجديد
-- =====================================================================

-- ---------------------------------------------------------------------
-- تنبيه عام بنص جاهز (عربي/إنجليزي): notice للنشاط، promo للعروض (يحترم إعداد «العروض»)
-- ---------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'follow','friend_request','friend_accept',
  'post_like','post_comment','checkin_like','checkin_comment','friend_here',
  'challenge_invite','challenge_win','rank_up','program_adopt','gym_offer','nudge','notice','promo'));

create or replace function public._notif_category(p_kind text)
returns text language sql immutable as $$
  select case
    when p_kind = 'message' then 'messages'
    when p_kind in ('follow','friend_request','friend_accept','friend_here') then 'social'
    when p_kind in ('post_like','post_comment','checkin_like','checkin_comment','program_adopt','notice') then 'activity'
    when p_kind in ('challenge_invite','challenge_win','rank_up') then 'progress'
    when p_kind in ('gym_offer','promo') then 'offers'
    when p_kind = 'nudge' then 'nudges'
    else 'activity' end;
$$;

create or replace function public._notif_text(p_kind text, p_name text, p_data jsonb, p_loc text)
returns text[] language plpgsql immutable as $$
declare
  en boolean := p_loc = 'en';
  n text := coalesce(p_name, case when en then 'Someone' else 'أحد' end);
  pv text := coalesce(p_data->>'preview', '');
  ti text := coalesce(p_data->>'title', '');
  gy text := coalesce(p_data->>'gym', '');
begin
  return case p_kind
    when 'message'          then array[n, pv]
    when 'nudge'            then array[coalesce(p_data->>'title', ''), coalesce(p_data->>'body', '')]
    when 'notice'           then array[coalesce(case when en then p_data->>'title_en' end, p_data->>'title_ar', ''),
                                       coalesce(case when en then p_data->>'body_en' end, p_data->>'body_ar', '')]
    when 'promo'            then array[coalesce(case when en then p_data->>'title_en' end, p_data->>'title_ar', ''),
                                       coalesce(case when en then p_data->>'body_en' end, p_data->>'body_ar', '')]
    when 'follow'           then case when (p_data->>'mutual')::boolean
                                   then array[case when en then 'You follow each other now' else 'صرتوا تتابعون بعض' end,
                                              case when en then n || ' followed you back — you can message each other' else n || ' تابعك — تقدرون تتراسلون الحين' end]
                                   else array[case when en then 'New follower' else 'متابع جديد' end,
                                              case when en then n || ' started following you' else n || ' بدأ يتابعك' end] end
    when 'friend_request'   then array[case when en then 'Friend request' else 'طلب صداقة' end,
                                       case when en then n || ' wants to be your friend' else n || ' يبي يضيفك صديق' end]
    when 'friend_accept'    then array[case when en then 'You''re friends now' else 'صرتوا أصدقاء' end,
                                       case when en then n || ' accepted your friend request' else n || ' قبل طلب صداقتك' end]
    when 'post_like'        then array[case when en then 'New like' else 'إعجاب جديد' end,
                                       case when en then n || ' liked your post' else n || ' أعجبه منشورك' end]
    when 'post_comment'     then array[case when en then 'New comment' else 'تعليق جديد' end, n || ': ' || pv]
    when 'checkin_like'     then array[case when en then '💪 Props' else '💪 تشجيع' end,
                                       case when en then n || ' liked your gym check-in' else n || ' أعجبه حضورك للنادي' end]
    when 'checkin_comment'  then array[case when en then 'Comment on your check-in' else 'تعليق على حضورك' end, n || ': ' || pv]
    when 'friend_here'      then array[case when en then 'Your friend is at the gym' else 'صاحبك في النادي' end,
                                       case when en then n || ' just arrived at ' || gy else n || ' وصل ' || gy || ' الحين' end]
    when 'challenge_invite' then array[case when en then 'Challenge invite' else 'دعوة لتحدي' end,
                                       case when en then n || ' invited you to “' || ti || '”' else n || ' دعاك لتحدي «' || ti || '»' end]
    when 'challenge_win'    then array[case when en then '🏆 You won!' else '🏆 فزت بالتحدي' end,
                                       case when en then 'You won “' || ti || '” and earned ' || coalesce(p_data->>'points', '50') || ' points'
                                            else 'فزت في «' || ti || '» وأخذت ' || coalesce(p_data->>'points', '50') || ' نقطة' end]
    when 'rank_up'          then array[case when en then '⬆️ New rank' else '⬆️ رتبة جديدة' end,
                                       case when en then 'You reached “' || _rank_name((p_data->>'level')::int, 'en') || '”'
                                            else 'وصلت رتبة «' || _rank_name((p_data->>'level')::int, 'ar') || '» 🔥' end]
    when 'program_adopt'    then array[case when en then 'Your program is spreading' else 'برنامجك ينتشر' end,
                                       case when en then n || ' started your program “' || ti || '”' else n || ' بدأ برنامجك «' || ti || '»' end]
    when 'gym_offer'        then array[case when en then 'New offer at ' || gy else 'عرض جديد في ' || gy end,
                                       ti || ' — ' || coalesce(p_data->>'price', '') || case when en then ' SAR' else ' ر.س' end]
    else array[case when en then 'ARQ' else 'أرك' end, '']
  end;
end $$;

-- إرسال تنبيه جاهز النص. p_key يمنع التكرار (مثلاً تنبيه التجديد مرة وحدة لكل اشتراك)
create or replace function public._notice(p_user uuid, p_key text, p_title_ar text, p_body_ar text,
                                          p_title_en text, p_body_en text, p_url text,
                                          p_target uuid default null, p_kind text default 'notice')
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return false; end if;
  if p_key is not null and exists (select 1 from notifications where user_id = p_user and kind = p_kind and data->>'key' = p_key) then
    return false;
  end if;
  perform _notify(p_user, null, p_kind, p_target,
    jsonb_strip_nulls(jsonb_build_object('key', p_key, 'title_ar', left(p_title_ar, 80), 'body_ar', left(p_body_ar, 240),
                       'title_en', left(p_title_en, 80), 'body_en', left(p_body_en, 240), 'url', p_url)), p_url);
  return true;
end $$;
revoke all on function public._notice(uuid, text, text, text, text, text, text, uuid, text) from public, anon, authenticated;

create or replace function public._gym_label(p_gym uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(name), ''), name_en) from gyms where id = p_gym;
$$;
revoke all on function public._gym_label(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- موظفين الاستقبال (المدراء في gym_managers / chain_managers كما هم)
-- ---------------------------------------------------------------------
create table if not exists public.gym_staff (
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null default 'reception' check (role in ('reception')),
  added_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  primary key (gym_id, user_id)
);
alter table public.gym_staff enable row level security;
create policy staff_read on public.gym_staff for select to authenticated using (user_id = auth.uid() or can_manage_gym_or_chain(gym_id));
create policy staff_write on public.gym_staff for all to authenticated using (can_manage_gym_or_chain(gym_id)) with check (can_manage_gym_or_chain(gym_id));

create or replace function public.is_gym_staff(p_gym uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select can_manage_gym_or_chain(p_gym) or exists (select 1 from gym_staff s where s.gym_id = p_gym and s.user_id = auth.uid());
$$;
revoke all on function public.is_gym_staff(uuid) from public, anon;
grant execute on function public.is_gym_staff(uuid) to authenticated;

-- الأندية اللي أنا موظف أو مدير فيها (لاختيار الفرع في شاشة الاستقبال)
create or replace function public.my_staff_gyms()
returns table (gym_id uuid, name text, name_en text, chain_id uuid, role text)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.name_en, g.chain_id,
         case when can_manage_gym_or_chain(g.id) then 'manager' else 'reception' end
  from gyms g
  where exists (select 1 from gym_managers m where m.gym_id = g.id and m.user_id = auth.uid())
     or exists (select 1 from gym_staff s where s.gym_id = g.id and s.user_id = auth.uid())
     or (g.chain_id is not null and exists (select 1 from chain_managers c where c.chain_id = g.chain_id and c.user_id = auth.uid()))
  order by g.name
  limit 200;
$$;
revoke all on function public.my_staff_gyms() from public, anon;
grant execute on function public.my_staff_gyms() to authenticated;

-- إضافة موظف استقبال باسم المستخدم
create or replace function public.add_gym_staff(p_gym uuid, p_username text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if not can_manage_gym_or_chain(p_gym) then raise exception 'not_allowed'; end if;
  select id into v_user from profiles where lower(username) = lower(btrim(p_username, ' @'));
  if v_user is null then raise exception 'user_not_found'; end if;
  insert into gym_staff (gym_id, user_id, added_by) values (p_gym, v_user, auth.uid()) on conflict do nothing;
  perform _notice(v_user, 'staff:' || p_gym, 'صرت موظف استقبال', 'تقدر الحين تتحقق من دخول الأعضاء في ' || _gym_label(p_gym) || ' بمسح كود أرك.',
                  'You''re now reception staff', 'You can now verify member entry at ' || _gym_label(p_gym) || ' by scanning their ARQ code.', '/entry/code', p_gym);
  return v_user;
end $$;
revoke all on function public.add_gym_staff(uuid, text) from public, anon;
grant execute on function public.add_gym_staff(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- الاشتراكات: لفرع أو لسلسلة. «منتهي» و«قادم» تُحسب من التواريخ ما تنحفظ
-- ---------------------------------------------------------------------
create table if not exists public.memberships (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.profiles(id) on delete cascade,
  gym_id           uuid references public.gyms(id) on delete cascade,
  chain_id         uuid references public.gym_chains(id) on delete cascade,
  kind             text not null default 'membership' check (kind in ('membership','pass')),
  plan_name        text not null check (char_length(btrim(plan_name)) between 2 and 80),
  starts_on        date not null default current_date,
  ends_on          date not null,
  status           text not null default 'active' check (status in ('active','frozen','cancelled')),
  frozen_from      date,
  frozen_until     date,
  frozen_days_used integer not null default 0 check (frozen_days_used between 0 and 365),
  price_sar        numeric(9,2) check (price_sar is null or price_sar between 0 and 1000000),
  source           text not null default 'gym' check (source in ('gym','arq','import')),
  notes            text check (char_length(notes) <= 300),
  member_name      text check (char_length(member_name) <= 80),
  member_contact   text check (char_length(member_contact) <= 80),
  claim_code       text unique check (claim_code ~ '^[A-Z0-9]{8}$'),
  claimed_at       timestamptz,
  referred_by      uuid references public.profiles(id) on delete set null,
  created_by       uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint memberships_target check (gym_id is not null or chain_id is not null),
  constraint memberships_dates check (ends_on >= starts_on),
  constraint memberships_owner check (user_id is not null or claim_code is not null or member_name is not null)
);
create index if not exists memberships_user_idx on public.memberships (user_id, ends_on desc);
create index if not exists memberships_gym_idx on public.memberships (gym_id, ends_on);
create index if not exists memberships_chain_idx on public.memberships (chain_id, ends_on);

create or replace function public.can_manage_target(p_gym uuid, p_chain uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (p_gym is not null and can_manage_gym_or_chain(p_gym)) or (p_chain is not null and can_manage_chain(p_chain));
$$;
revoke all on function public.can_manage_target(uuid, uuid) from public, anon;
grant execute on function public.can_manage_target(uuid, uuid) to authenticated;

-- موظف الاستقبال يشوف اشتراكات فرعه، واشتراكات السلسلة اللي فرعه منها
create or replace function public.can_staff_target(p_gym uuid, p_chain uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select can_manage_target(p_gym, p_chain)
      or (p_gym is not null and exists (select 1 from gym_staff s where s.gym_id = p_gym and s.user_id = auth.uid()))
      or (p_chain is not null and exists (select 1 from gym_staff s join gyms g on g.id = s.gym_id
                                          where g.chain_id = p_chain and s.user_id = auth.uid()));
$$;
revoke all on function public.can_staff_target(uuid, uuid) from public, anon;
grant execute on function public.can_staff_target(uuid, uuid) to authenticated;

alter table public.memberships enable row level security;
create policy mem_read on public.memberships for select to authenticated
  using (user_id = auth.uid() or can_staff_target(gym_id, chain_id));
create policy mem_insert on public.memberships for insert to authenticated with check (can_manage_target(gym_id, chain_id));
create policy mem_update on public.memberships for update to authenticated
  using (can_manage_target(gym_id, chain_id)) with check (can_manage_target(gym_id, chain_id));
create policy mem_delete on public.memberships for delete to authenticated using (can_manage_target(gym_id, chain_id));

create or replace function public._membership_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists memberships_touch on public.memberships;
create trigger memberships_touch before update on public.memberships for each row execute function public._membership_touch();

-- حالة الاشتراك الآن: active / upcoming / frozen / expired / cancelled + الأيام المتبقية
create or replace function public.membership_state(p_status text, p_starts date, p_ends date, p_fz_from date, p_fz_until date, p_today date default null)
returns text language sql stable as $$
  select case
    when p_status = 'cancelled' then 'cancelled'
    when coalesce(p_today, app_today()) > p_ends then 'expired'
    when p_status = 'frozen' and coalesce(p_today, app_today()) between coalesce(p_fz_from, p_starts) and coalesce(p_fz_until, p_ends) then 'frozen'
    when coalesce(p_today, app_today()) < p_starts then 'upcoming'
    else 'active' end;
$$;
grant execute on function public.membership_state(text, date, date, date, date, date) to authenticated;

create or replace function public.membership_days_left(p_ends date)
returns integer language sql stable as $$
  select greatest(p_ends - app_today() + 1, 0);
$$;
grant execute on function public.membership_days_left(date) to authenticated;

-- اشتراكاتي مع الحالة والأيام المتبقية واسم النادي
create or replace function public.my_memberships()
returns table (id uuid, gym_id uuid, chain_id uuid, target_name text, target_name_en text, kind text, plan_name text,
               starts_on date, ends_on date, state text, days_left integer, frozen_until date, notes text)
language sql stable security definer set search_path = public as $$
  select m.id, m.gym_id, m.chain_id,
         coalesce(g.name, c.name), coalesce(g.name_en, c.name_en), m.kind, m.plan_name, m.starts_on, m.ends_on,
         membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until),
         membership_days_left(m.ends_on), m.frozen_until, m.notes
  from memberships m
  left join gyms g on g.id = m.gym_id
  left join gym_chains c on c.id = m.chain_id
  where m.user_id = auth.uid()
  order by (membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until) in ('expired','cancelled')), m.ends_on desc
  limit 50;
$$;
revoke all on function public.my_memberships() from public, anon;
grant execute on function public.my_memberships() to authenticated;

-- ربط اشتراك مستورد بحسابي بالرمز اللي أعطاني إياه النادي
create or replace function public.claim_membership(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update memberships set user_id = auth.uid(), claimed_at = now(), claim_code = null
   where claim_code = upper(btrim(p_code)) and user_id is null
  returning id into v_id;
  if v_id is null then raise exception 'code_not_found'; end if;
  return v_id;
end $$;
revoke all on function public.claim_membership(text) from public, anon;
grant execute on function public.claim_membership(text) to authenticated;

create or replace function public._claim_code()
returns text language plpgsql volatile as $$
declare v text; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  loop
    v := '';
    for i in 1..8 loop v := v || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from memberships where claim_code = v);
  end loop;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- ادعُ صديقك: رمز لكل عضو في كل نادي، ومكافأة يكتبها النادي
-- ---------------------------------------------------------------------
create table if not exists public.gym_settings (
  gym_id           uuid primary key references public.gyms(id) on delete cascade,
  referral_reward  text check (char_length(referral_reward) <= 160),
  class_cutoff_min integer not null default 60 check (class_cutoff_min between 0 and 1440),
  updated_at       timestamptz not null default now()
);
alter table public.gym_settings enable row level security;
create policy gset_read on public.gym_settings for select to authenticated using (true);
create policy gset_write on public.gym_settings for all to authenticated using (can_manage_gym_or_chain(gym_id)) with check (can_manage_gym_or_chain(gym_id));

create table if not exists public.referral_codes (
  code        text primary key check (code ~ '^[A-Z0-9]{6}$'),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, gym_id)
);
alter table public.referral_codes enable row level security;
create policy refc_read on public.referral_codes for select to authenticated using (user_id = auth.uid() or can_manage_gym_or_chain(gym_id));

create or replace function public.my_referral_code(p_gym uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v text; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select code into v from referral_codes where user_id = auth.uid() and gym_id = p_gym;
  if v is not null then return v; end if;
  loop
    v := '';
    for i in 1..6 loop v := v || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from referral_codes where code = v);
  end loop;
  insert into referral_codes (code, user_id, gym_id) values (v, auth.uid(), p_gym);
  return v;
end $$;
revoke all on function public.my_referral_code(uuid) from public, anon;
grant execute on function public.my_referral_code(uuid) to authenticated;

create or replace function public.my_referrals(p_gym uuid)
returns table (code text, reward text, joined integer)
language sql stable security definer set search_path = public as $$
  select rc.code, gs.referral_reward,
         (select count(*) from memberships m where m.referred_by = auth.uid()
            and (m.gym_id = p_gym or m.chain_id = (select chain_id from gyms where id = p_gym)))::int
  from referral_codes rc
  left join gym_settings gs on gs.gym_id = rc.gym_id
  where rc.user_id = auth.uid() and rc.gym_id = p_gym;
$$;
revoke all on function public.my_referrals(uuid) from public, anon;
grant execute on function public.my_referrals(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- إضافة/تعديل اشتراك من الإدارة (باسم المستخدم، أو اسم وجوال لمن ما عنده حساب → رمز ربط)
-- ---------------------------------------------------------------------
create or replace function public.upsert_membership(
  p_id uuid, p_gym uuid, p_chain uuid, p_username text, p_member_name text, p_member_contact text,
  p_kind text, p_plan text, p_starts date, p_ends date, p_price numeric, p_notes text, p_referral text default null)
returns public.memberships language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_row memberships; v_ref uuid; v_new boolean := p_id is null;
begin
  if not can_manage_target(p_gym, p_chain) then raise exception 'not_allowed'; end if;
  if nullif(btrim(coalesce(p_username, '')), '') is not null then
    select id into v_user from profiles where lower(username) = lower(btrim(p_username, ' @'));
    if v_user is null then raise exception 'user_not_found'; end if;
  end if;
  if nullif(btrim(coalesce(p_referral, '')), '') is not null then
    select user_id into v_ref from referral_codes where code = upper(btrim(p_referral));
    if v_ref is null then raise exception 'referral_not_found'; end if;
    if v_ref = v_user then v_ref := null; end if;
  end if;
  if v_new then
    insert into memberships (user_id, gym_id, chain_id, kind, plan_name, starts_on, ends_on, price_sar, notes,
                             member_name, member_contact, claim_code, referred_by, source)
    values (v_user, p_gym, p_chain, coalesce(p_kind, 'membership'), btrim(p_plan), p_starts, p_ends, p_price, nullif(btrim(coalesce(p_notes, '')), ''),
            nullif(btrim(coalesce(p_member_name, '')), ''), nullif(btrim(coalesce(p_member_contact, '')), ''),
            case when v_user is null then _claim_code() end, v_ref, 'gym')
    returning * into v_row;
  else
    update memberships set
      user_id = coalesce(v_user, user_id), kind = coalesce(p_kind, kind), plan_name = btrim(p_plan), starts_on = p_starts, ends_on = p_ends,
      price_sar = p_price, notes = nullif(btrim(coalesce(p_notes, '')), ''),
      member_name = coalesce(nullif(btrim(coalesce(p_member_name, '')), ''), member_name),
      member_contact = coalesce(nullif(btrim(coalesce(p_member_contact, '')), ''), member_contact),
      referred_by = coalesce(v_ref, referred_by)
    where id = p_id and can_manage_target(gym_id, chain_id)
    returning * into v_row;
    if v_row.id is null then raise exception 'membership_not_found'; end if;
  end if;
  if v_new and v_row.user_id is not null then
    perform _notice(v_row.user_id, 'mem_new:' || v_row.id,
      'اشتراكك جاهز في أرك', 'اشتراك «' || v_row.plan_name || '» في ' || coalesce(_gym_label(p_gym), (select name from gym_chains where id = p_chain)) || ' ينتهي ' || to_char(v_row.ends_on, 'YYYY-MM-DD') || '. بطاقتك للدخول في «اشتراكي».',
      'Your membership is in ARQ', '“' || v_row.plan_name || '” ends ' || to_char(v_row.ends_on, 'YYYY-MM-DD') || '. Your entry card is in My membership.',
      '/membership', v_row.id);
  end if;
  if v_new and v_ref is not null then
    perform _notice(v_ref, 'ref:' || v_row.id, 'صاحبك اشترك بدعوتك 🎉', 'انضم شخص للنادي برمز دعوتك. شوف مكافأتك من النادي.',
                    'Your friend joined 🎉', 'Someone joined the gym with your invite code. Check your reward with the gym.', '/membership', v_row.id);
  end if;
  return v_row;
end $$;
revoke all on function public.upsert_membership(uuid, uuid, uuid, text, text, text, text, text, date, date, numeric, text, text) from public, anon;
grant execute on function public.upsert_membership(uuid, uuid, uuid, text, text, text, text, text, date, date, numeric, text, text) to authenticated;

-- استيراد دفعة من ملف (بعد المعاينة في التطبيق): كل صف يصير اشتراك برمز ربط
create or replace function public.import_memberships(p_gym uuid, p_chain uuid, p_rows jsonb)
returns table (row_no integer, member_name text, claim_code text, error text)
language plpgsql security definer set search_path = public as $$
declare r jsonb; i integer := 0; v_code text; v_err text;
begin
  if not can_manage_target(p_gym, p_chain) then raise exception 'not_allowed'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then raise exception 'too_many_rows'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1; v_code := null; v_err := null;
    begin
      v_code := _claim_code();
      insert into memberships (gym_id, chain_id, plan_name, starts_on, ends_on, price_sar, member_name, member_contact, claim_code, source, notes)
      values (p_gym, p_chain, btrim(r->>'plan'), (r->>'start')::date, (r->>'end')::date, nullif(r->>'price', '')::numeric,
              nullif(btrim(r->>'name'), ''), nullif(btrim(r->>'contact'), ''), v_code, 'import', nullif(btrim(coalesce(r->>'notes', '')), ''));
    exception when others then
      v_code := null; v_err := sqlerrm;
    end;
    row_no := i; member_name := r->>'name'; claim_code := v_code; error := v_err;
    return next;
  end loop;
end $$;
revoke all on function public.import_memberships(uuid, uuid, jsonb) from public, anon;
grant execute on function public.import_memberships(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- الدخول بـ QR: رمز قصير العمر لكل عضو + رقم من ٦ خانات، يُستخدم مرة وحدة
-- ---------------------------------------------------------------------
alter table public.check_ins add column if not exists method text not null default 'gps' check (method in ('gps','qr','gate'));

create table if not exists public.entry_tokens (
  token_hash  text primary key,
  code        text not null check (code ~ '^[0-9]{6}$'),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  used_gym    uuid references public.gyms(id) on delete set null
);
create index if not exists entry_tokens_code_idx on public.entry_tokens (code, expires_at);
create index if not exists entry_tokens_user_idx on public.entry_tokens (user_id, created_at desc);
alter table public.entry_tokens enable row level security;  -- ما فيه سياسات: الوصول عبر الدوال فقط

create table if not exists public.gym_gates (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references public.gyms(id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 2 and 40),
  key_hash     text not null unique,
  key_hint     text not null,
  active       boolean not null default true,
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.gym_gates enable row level security;
create policy gates_read on public.gym_gates for select to authenticated using (can_manage_gym_or_chain(gym_id));
create policy gates_update on public.gym_gates for update to authenticated using (can_manage_gym_or_chain(gym_id)) with check (can_manage_gym_or_chain(gym_id));
create policy gates_delete on public.gym_gates for delete to authenticated using (can_manage_gym_or_chain(gym_id));

create table if not exists public.entry_log (
  id          bigint generated always as identity primary key,
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null,
  staff_id    uuid references public.profiles(id) on delete set null,
  gate_id     uuid references public.gym_gates(id) on delete set null,
  allowed     boolean not null,
  reason      text not null,
  membership_id uuid references public.memberships(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists entry_log_gym_idx on public.entry_log (gym_id, created_at desc);
alter table public.entry_log enable row level security;
create policy entry_log_read on public.entry_log for select to authenticated using (is_gym_staff(gym_id) or user_id = auth.uid());

create or replace function public._hash(p text)
returns text language sql immutable as $$ select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;

-- رمز دخولي: يتجدد كل ٤٥ ثانية تقريباً في التطبيق (صلاحيته ٩٠ ثانية)
create or replace function public.entry_token()
returns table (token text, code text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_tok text; v_code text; v_exp timestamptz := now() + interval '90 seconds';
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from entry_tokens t where t.user_id = auth.uid() and (t.expires_at < now() - interval '1 day' or (t.used_at is null and t.expires_at < now()));
  if (select count(*) from entry_tokens t where t.user_id = auth.uid() and t.created_at > now() - interval '1 minute') >= 6 then
    raise exception 'too_many_requests';
  end if;
  v_tok := replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  loop
    v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when not exists (select 1 from entry_tokens e where e.code = v_code and e.expires_at > now() and e.used_at is null);
  end loop;
  insert into entry_tokens (token_hash, code, user_id, expires_at) values (_hash(v_tok), v_code, auth.uid(), v_exp);
  token := v_tok; code := v_code; expires_at := v_exp;
  return next;
end $$;
revoke all on function public.entry_token() from public, anon;
grant execute on function public.entry_token() to authenticated;

-- حضور بدون GPS (الاستقبال/البوابة): نفس منطق النقاط في check_in (أول حضور باليوم في نادي موثّق)
create or replace function public._record_visit(p_user uuid, p_gym uuid, p_method text)
returns public.check_ins language plpgsql security definer set search_path = public as $$
declare v_gym gyms; v_prof profiles; v_row check_ins; v_today date := app_today(); v_points integer := 0; v_streak integer;
begin
  select * into v_gym from gyms where id = p_gym;
  select * into v_row from check_ins where user_id = p_user and checked_out_at is null and checked_in_at > now() - interval '6 hours' order by checked_in_at desc limit 1;
  if found then return v_row; end if;
  select * into v_prof from profiles where id = p_user for update;
  insert into check_ins (user_id, gym_id, lat, lng, distance_m, method) values (p_user, p_gym, v_gym.lat, v_gym.lng, 0, p_method) returning * into v_row;
  if v_gym.verified and (v_prof.last_checkin_on is null or v_prof.last_checkin_on < v_today) then
    v_streak := case when v_prof.last_checkin_on = v_today - 1 then v_prof.streak + 1 else 1 end;
    v_points := 10;
    perform _award(p_user, 10, 'checkin', v_row.id);
    if v_streak % 7 = 0 then perform _award(p_user, 25, 'streak_bonus', v_row.id); v_points := v_points + 25; end if;
    update profiles set streak = v_streak, best_streak = greatest(best_streak, v_streak), last_checkin_on = v_today where id = p_user;
    update check_ins set points_awarded = v_points where id = v_row.id returning * into v_row;
  end if;
  return v_row;
end $$;
revoke all on function public._record_visit(uuid, uuid, text) from public, anon, authenticated;

-- التحقق الأساسي (يستخدمه الاستقبال والبوابة)
create or replace function public._verify_entry(p_token text, p_gym uuid, p_staff uuid, p_gate uuid)
returns table (allowed boolean, reason text, member_id uuid, member_name text, username text, avatar_url text,
               plan_name text, ends_on date, days_left integer, membership_id uuid, check_in_id uuid, already_in boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_tok entry_tokens; v_gym gyms; v_m memberships; v_state text; v_ci check_ins; v_open boolean := false;
  v_in text := btrim(coalesce(p_token, ''));
begin
  select * into v_gym from gyms where id = p_gym;
  if not found then raise exception 'gym_not_found'; end if;
  v_in := regexp_replace(v_in, '^arq://entry/', '');
  if v_in ~ '^[0-9]{6}$' then
    select * into v_tok from entry_tokens e where e.code = v_in order by e.created_at desc limit 1;
  else
    select * into v_tok from entry_tokens e where e.token_hash = _hash(v_in);
  end if;

  allowed := false; already_in := false;
  if v_tok.user_id is null then reason := 'code_not_found';
  elsif v_tok.used_at is not null then reason := 'code_used';
  elsif v_tok.expires_at < now() then reason := 'code_expired';
  end if;

  if v_tok.user_id is not null then
    select p.id, coalesce(nullif(btrim(p.full_name), ''), p.username), p.username, p.avatar_url
      into member_id, member_name, username, avatar_url from profiles p where p.id = v_tok.user_id;
  end if;

  if reason is null then
    -- أفضل اشتراك يصلح لهذا الفرع: ساري أولاً، ثم مجمّد/قادم، ثم الأحدث
    select * into v_m from memberships m
     where m.user_id = v_tok.user_id and (m.gym_id = p_gym or (m.chain_id is not null and m.chain_id = v_gym.chain_id))
     order by case membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until)
                when 'active' then 0 when 'frozen' then 1 when 'upcoming' then 2 when 'expired' then 3 else 4 end,
              m.ends_on desc
     limit 1;
    if v_m.id is null then
      reason := case when exists (select 1 from memberships m where m.user_id = v_tok.user_id and membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until) = 'active')
                     then 'wrong_gym' else 'no_membership' end;
    else
      v_state := membership_state(v_m.status, v_m.starts_on, v_m.ends_on, v_m.frozen_from, v_m.frozen_until);
      plan_name := v_m.plan_name; ends_on := v_m.ends_on; days_left := membership_days_left(v_m.ends_on); membership_id := v_m.id;
      reason := case v_state when 'active' then 'ok' else v_state end;
      allowed := v_state = 'active';
    end if;
    update entry_tokens set used_at = now(), used_gym = p_gym where token_hash = v_tok.token_hash;
  end if;

  if allowed then
    v_open := exists (select 1 from check_ins c where c.user_id = v_tok.user_id and c.checked_out_at is null and c.checked_in_at > now() - interval '6 hours');
    v_ci := _record_visit(v_tok.user_id, p_gym, case when p_gate is not null then 'gate' else 'qr' end);
    check_in_id := v_ci.id; already_in := v_open;
  end if;

  insert into entry_log (gym_id, user_id, staff_id, gate_id, allowed, reason, membership_id)
  values (p_gym, v_tok.user_id, p_staff, p_gate, allowed, coalesce(reason, 'code_not_found'), membership_id);
  return next;
end $$;
revoke all on function public._verify_entry(text, uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.verify_entry(p_token text, p_gym uuid)
returns table (allowed boolean, reason text, member_id uuid, member_name text, username text, avatar_url text,
               plan_name text, ends_on date, days_left integer, membership_id uuid, check_in_id uuid, already_in boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not is_gym_staff(p_gym) then raise exception 'not_allowed'; end if;
  return query select * from _verify_entry(p_token, p_gym, auth.uid(), null);
end $$;
revoke all on function public.verify_entry(text, uuid) from public, anon;
grant execute on function public.verify_entry(text, uuid) to authenticated;

-- البوابة: مفتاح خاص لكل بوابة (يظهر مرة وحدة عند الإنشاء)
create or replace function public.create_gate(p_gym uuid, p_name text)
returns table (gate_id uuid, api_key text)
language plpgsql security definer set search_path = public as $$
declare v_key text;
begin
  if not can_manage_gym_or_chain(p_gym) then raise exception 'not_allowed'; end if;
  v_key := 'arqg_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into gym_gates (gym_id, name, key_hash, key_hint) values (p_gym, btrim(p_name), _hash(v_key), right(v_key, 4))
  returning id into gate_id;
  api_key := v_key;
  return next;
end $$;
revoke all on function public.create_gate(uuid, text) from public, anon;
grant execute on function public.create_gate(uuid, text) to authenticated;

create or replace function public.gate_verify(gate_key text, token text)
returns table (allowed boolean, reason text, first_name text, days_left integer)
language plpgsql security definer set search_path = public as $$
declare v_gate gym_gates; r record;
begin
  select * into v_gate from gym_gates where key_hash = _hash(coalesce(gate_key, '')) and active;
  if not found then
    allowed := false; reason := 'invalid_gate'; return next; return;
  end if;
  update gym_gates set last_used_at = now() where id = v_gate.id;
  select * into r from _verify_entry(token, v_gate.gym_id, null, v_gate.id);
  allowed := r.allowed; reason := r.reason; first_name := split_part(coalesce(r.member_name, ''), ' ', 1); days_left := r.days_left;
  return next;
end $$;
revoke all on function public.gate_verify(text, text) from public;
grant execute on function public.gate_verify(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- طلبات التجميد والنقل
-- ---------------------------------------------------------------------
create table if not exists public.membership_requests (
  id            uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  kind          text not null check (kind in ('freeze','transfer')),
  days          integer check (days between 1 and 180),
  from_date     date,
  to_gym        uuid references public.gyms(id) on delete set null,
  reason        text check (char_length(reason) <= 300),
  status        text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reply         text check (char_length(reply) <= 300),
  decided_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  decided_at    timestamptz
);
create index if not exists mreq_membership_idx on public.membership_requests (membership_id, created_at desc);
alter table public.membership_requests enable row level security;
create policy mreq_read on public.membership_requests for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from memberships m where m.id = membership_id and can_staff_target(m.gym_id, m.chain_id)));

create or replace function public.request_membership_change(p_membership uuid, p_kind text, p_days integer, p_from date, p_to_gym uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_m memberships; v_id uuid; v_to gyms;
begin
  select * into v_m from memberships where id = p_membership and user_id = auth.uid();
  if not found then raise exception 'membership_not_found'; end if;
  if exists (select 1 from membership_requests where membership_id = p_membership and status = 'pending') then raise exception 'request_pending'; end if;
  if p_kind = 'freeze' and (p_days is null or p_days < 1) then raise exception 'bad_days'; end if;
  if p_kind = 'transfer' then
    select * into v_to from gyms where id = p_to_gym;
    if v_to.id is null or v_to.chain_id is null
       or v_to.chain_id is distinct from coalesce(v_m.chain_id, (select chain_id from gyms where id = v_m.gym_id)) then
      raise exception 'transfer_same_chain_only';
    end if;
  end if;
  insert into membership_requests (membership_id, user_id, kind, days, from_date, to_gym, reason)
  values (p_membership, auth.uid(), p_kind, case when p_kind = 'freeze' then p_days end,
          case when p_kind = 'freeze' then greatest(coalesce(p_from, app_today()), app_today()) end,
          case when p_kind = 'transfer' then p_to_gym end, nullif(btrim(coalesce(p_reason, '')), ''))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.request_membership_change(uuid, text, integer, date, uuid, text) from public, anon;
grant execute on function public.request_membership_change(uuid, text, integer, date, uuid, text) to authenticated;

create or replace function public.decide_membership_request(p_id uuid, p_approve boolean, p_reply text)
returns void language plpgsql security definer set search_path = public as $$
declare v_r membership_requests; v_m memberships;
begin
  select * into v_r from membership_requests where id = p_id and status = 'pending';
  if not found then raise exception 'request_not_found'; end if;
  select * into v_m from memberships where id = v_r.membership_id;
  if not can_manage_target(v_m.gym_id, v_m.chain_id) then raise exception 'not_allowed'; end if;
  update membership_requests set status = case when p_approve then 'approved' else 'rejected' end,
         reply = nullif(btrim(coalesce(p_reply, '')), ''), decided_by = auth.uid(), decided_at = now() where id = p_id;
  if p_approve and v_r.kind = 'freeze' then
    update memberships set status = 'frozen', frozen_from = v_r.from_date, frozen_until = v_r.from_date + v_r.days - 1,
           ends_on = ends_on + v_r.days, frozen_days_used = frozen_days_used + v_r.days where id = v_m.id;
  elsif p_approve and v_r.kind = 'transfer' then
    update memberships set gym_id = v_r.to_gym where id = v_m.id and gym_id is not null;
  end if;
  perform _notice(v_r.user_id, 'mreq:' || p_id,
    case when p_approve then 'تمت الموافقة على طلبك' else 'بخصوص طلبك' end,
    case v_r.kind when 'freeze' then 'طلب تجميد الاشتراك ' else 'طلب نقل الاشتراك ' end ||
      case when p_approve then 'انقبل.' else 'ما انقبل.' end || coalesce(' ' || nullif(btrim(coalesce(p_reply, '')), ''), ''),
    case when p_approve then 'Request approved' else 'About your request' end,
    case v_r.kind when 'freeze' then 'Your freeze request was ' else 'Your transfer request was ' end ||
      case when p_approve then 'approved.' else 'declined.' end || coalesce(' ' || nullif(btrim(coalesce(p_reply, '')), ''), ''),
    '/membership', v_m.id);
end $$;
revoke all on function public.decide_membership_request(uuid, boolean, text) from public, anon;
grant execute on function public.decide_membership_request(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- ملاحظات الأعضاء للنادي (شكوى / اقتراح / شكر) مع متابعة الحالة
-- ---------------------------------------------------------------------
create table if not exists public.gym_feedback (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  category    text not null check (category in ('complaint','suggestion','praise')),
  body        text not null check (char_length(btrim(body)) between 3 and 800),
  status      text not null default 'new' check (status in ('new','in_progress','resolved')),
  reply       text check (char_length(reply) <= 800),
  replied_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists gym_feedback_gym_idx on public.gym_feedback (gym_id, created_at desc);
alter table public.gym_feedback enable row level security;
create policy gfb_read on public.gym_feedback for select to authenticated using (user_id = auth.uid() or is_gym_staff(gym_id));
create policy gfb_insert on public.gym_feedback for insert to authenticated with check (user_id = auth.uid() and status = 'new' and reply is null);

create or replace function public.reply_gym_feedback(p_id uuid, p_status text, p_reply text)
returns void language plpgsql security definer set search_path = public as $$
declare v gym_feedback;
begin
  select * into v from gym_feedback where id = p_id;
  if not found or not is_gym_staff(v.gym_id) then raise exception 'not_allowed'; end if;
  if p_status not in ('new','in_progress','resolved') then raise exception 'bad_status'; end if;
  update gym_feedback set status = p_status, reply = coalesce(nullif(btrim(coalesce(p_reply, '')), ''), reply),
         replied_by = auth.uid(), updated_at = now() where id = p_id;
  if nullif(btrim(coalesce(p_reply, '')), '') is not null then
    perform _notice(v.user_id, 'gfb:' || p_id || ':' || md5(p_reply), 'رد ' || _gym_label(v.gym_id) || ' على ملاحظتك', left(btrim(p_reply), 200),
                    _gym_label(v.gym_id) || ' replied to your feedback', left(btrim(p_reply), 200), '/membership', p_id);
  end if;
end $$;
revoke all on function public.reply_gym_feedback(uuid, text, text) from public, anon;
grant execute on function public.reply_gym_feedback(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- إعلانات النادي للأعضاء الساريين (حد: مرتين باليوم لكل فرع أو سلسلة)
-- ---------------------------------------------------------------------
create table if not exists public.gym_broadcasts (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid references public.gyms(id) on delete cascade,
  chain_id    uuid references public.gym_chains(id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 2 and 80),
  body        text not null check (char_length(btrim(body)) between 3 and 240),
  recipients  integer not null default 0,
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  constraint gb_target check (gym_id is not null or chain_id is not null)
);
alter table public.gym_broadcasts enable row level security;
create policy gb_read on public.gym_broadcasts for select to authenticated using (can_manage_target(gym_id, chain_id));

-- أعضاء ساريين لفرع/سلسلة (عضوية الفرع + عضوية السلسلة اللي الفرع منها)
create or replace function public._active_members(p_gym uuid, p_chain uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct m.user_id from memberships m
  where m.user_id is not null
    and membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until) in ('active','frozen')
    and ((p_gym is not null and (m.gym_id = p_gym or m.chain_id = (select chain_id from gyms where id = p_gym)))
      or (p_chain is not null and (m.chain_id = p_chain or m.gym_id in (select id from gyms where chain_id = p_chain))));
$$;
revoke all on function public._active_members(uuid, uuid) from public, anon, authenticated;

create or replace function public.send_gym_broadcast(p_gym uuid, p_chain uuid, p_title text, p_body text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_n integer := 0; u uuid; v_name text;
begin
  if not can_manage_target(p_gym, p_chain) then raise exception 'not_allowed'; end if;
  if (select count(*) from gym_broadcasts b where b.gym_id is not distinct from p_gym and b.chain_id is not distinct from p_chain
        and b.title <> '__winback__' and b.created_at > now() - interval '1 day') >= 2 then raise exception 'rate_limited'; end if;
  insert into gym_broadcasts (gym_id, chain_id, title, body) values (p_gym, p_chain, btrim(p_title), btrim(p_body)) returning id into v_id;
  v_name := coalesce(_gym_label(p_gym), (select name from gym_chains where id = p_chain));
  for u in select * from _active_members(p_gym, p_chain) limit 5000 loop
    if _notice(u, 'gb:' || v_id, v_name || ': ' || btrim(p_title), btrim(p_body), v_name || ': ' || btrim(p_title), btrim(p_body), '/membership', v_id) then
      v_n := v_n + 1;
    end if;
  end loop;
  update gym_broadcasts set recipients = v_n where id = v_id;
  return v_n;
end $$;
revoke all on function public.send_gym_broadcast(uuid, uuid, text, text) from public, anon;
grant execute on function public.send_gym_broadcast(uuid, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- قائمة أعضاء الفرع للإدارة: قريب ينتهي، منتهي، منقطع، الكل
-- ---------------------------------------------------------------------
create or replace function public.gym_members(p_gym uuid, p_filter text default 'all')
returns table (membership_id uuid, user_id uuid, member_name text, username text, avatar_url text, member_contact text, claim_code text,
               kind text, plan_name text, starts_on date, ends_on date, state text, days_left integer, price_sar numeric,
               last_visit timestamptz, days_since_visit integer, chain_wide boolean)
language sql stable security definer set search_path = public as $$
  with g as (select id, chain_id from gyms where id = p_gym),
  m as (
    select m.*, membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until) as st
    from memberships m, g
    where (m.gym_id = g.id or (m.chain_id is not null and m.chain_id = g.chain_id))
  ),
  x as (
    select m.*, p.full_name, p.username as uname, p.avatar_url as av,
           (select max(c.checked_in_at) from check_ins c where c.user_id = m.user_id and c.gym_id = p_gym) as lv
    from m left join profiles p on p.id = m.user_id
  )
  select x.id, x.user_id, coalesce(nullif(btrim(x.full_name), ''), x.uname, x.member_name), x.uname, x.av, x.member_contact, x.claim_code,
         x.kind, x.plan_name, x.starts_on, x.ends_on, x.st, membership_days_left(x.ends_on), x.price_sar,
         x.lv, case when x.lv is null then null else (app_today() - (x.lv at time zone 'Asia/Riyadh')::date) end, x.chain_id is not null
  from x
  where is_gym_staff(p_gym)
    and case p_filter
      when 'expiring' then x.st in ('active','frozen') and x.ends_on <= app_today() + 14
      when 'expired'  then x.st = 'expired' and x.ends_on >= app_today() - 30
      when 'inactive' then x.st = 'active' and x.user_id is not null and (x.lv is null or x.lv < now() - interval '10 days')
      when 'pending'  then x.user_id is null
      else true end
  order by case when p_filter = 'expiring' then x.ends_on end, x.lv nulls first, x.ends_on desc
  limit 500;
$$;
revoke all on function public.gym_members(uuid, text) from public, anon;
grant execute on function public.gym_members(uuid, text) to authenticated;

-- تذكير الأعضاء المنقطعين (مرة كل ٧ أيام لكل عضو، ومرة باليوم لكل فرع)
create or replace function public.nudge_inactive_members(p_gym uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; v_n integer := 0; v_name text := _gym_label(p_gym); v_week text := to_char(app_today(), 'IYYY-IW');
begin
  if not can_manage_gym_or_chain(p_gym) then raise exception 'not_allowed'; end if;
  if exists (select 1 from gym_broadcasts where gym_id = p_gym and title = '__winback__' and created_at > now() - interval '1 day') then
    raise exception 'rate_limited';
  end if;
  insert into gym_broadcasts (gym_id, title, body) values (p_gym, '__winback__', 'win-back nudge');
  for r in select * from gym_members(p_gym, 'inactive') limit 2000 loop
    if _notice(r.user_id, 'winback:' || p_gym || ':' || v_week,
         'مشتاقين لك في ' || v_name || ' 💪', 'صار لك فترة ما جيت. اشتراكك ساري وباقي له ' || r.days_left || ' يوم، يلا نرجع للروتين!',
         'We miss you at ' || v_name || ' 💪', 'It''s been a while. Your membership is active with ' || r.days_left || ' days left — let''s get back to it!',
         '/membership', p_gym) then
      v_n := v_n + 1;
    end if;
  end loop;
  update gym_broadcasts set recipients = v_n where gym_id = p_gym and title = '__winback__' and created_at > now() - interval '1 minute';
  return v_n;
end $$;
revoke all on function public.nudge_inactive_members(uuid) from public, anon;
grant execute on function public.nudge_inactive_members(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- الحصص الجماعية والحجز
-- ---------------------------------------------------------------------
create table if not exists public.gym_classes (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 2 and 60),
  coach_name    text check (char_length(coach_name) <= 60),
  weekday       smallint not null check (weekday between 0 and 6),   -- ٠ = الأحد
  start_time    time not null,
  duration_min  smallint not null default 45 check (duration_min between 10 and 240),
  capacity      smallint not null default 20 check (capacity between 1 and 500),
  audience      text not null default 'mixed' check (audience in ('men','women','mixed')),
  members_only  boolean not null default true,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists gym_classes_gym_idx on public.gym_classes (gym_id, weekday);
alter table public.gym_classes enable row level security;
create policy gcl_read on public.gym_classes for select to authenticated using (active or can_manage_gym_or_chain(gym_id));
create policy gcl_write on public.gym_classes for all to authenticated using (can_manage_gym_or_chain(gym_id)) with check (can_manage_gym_or_chain(gym_id));

create table if not exists public.class_bookings (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.gym_classes(id) on delete cascade,
  class_date  date not null,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  status      text not null check (status in ('booked','waitlist','cancelled','attended')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (class_id, class_date, user_id)
);
create index if not exists class_bookings_idx on public.class_bookings (class_id, class_date, status, created_at);
alter table public.class_bookings enable row level security;
create policy cb_read on public.class_bookings for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from gym_classes c where c.id = class_id and is_gym_staff(c.gym_id)));

create or replace function public._class_start(p_class gym_classes, p_date date)
returns timestamptz language sql stable as $$
  select (p_date + p_class.start_time) at time zone 'Asia/Riyadh';
$$;

-- جدول الحصص لأيام قادمة مع عدد المحجوز وحالتي
create or replace function public.class_schedule(p_gym uuid, p_days integer default 7)
returns table (class_id uuid, class_date date, name text, coach_name text, start_time time, duration_min smallint,
               capacity smallint, audience text, booked integer, waitlist integer, my_status text, my_booking uuid, starts_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, d::date, c.name, c.coach_name, c.start_time, c.duration_min, c.capacity, c.audience,
         (select count(*) from class_bookings b where b.class_id = c.id and b.class_date = d::date and b.status in ('booked','attended'))::int,
         (select count(*) from class_bookings b where b.class_id = c.id and b.class_date = d::date and b.status = 'waitlist')::int,
         (select b.status from class_bookings b where b.class_id = c.id and b.class_date = d::date and b.user_id = auth.uid() and b.status <> 'cancelled'),
         (select b.id from class_bookings b where b.class_id = c.id and b.class_date = d::date and b.user_id = auth.uid() and b.status <> 'cancelled'),
         _class_start(c, d::date)
  from gym_classes c
  cross join generate_series(app_today(), app_today() + greatest(least(p_days, 21), 1) - 1, interval '1 day') d
  where c.gym_id = p_gym and c.active and extract(dow from d) = c.weekday and _class_start(c, d::date) > now()
  order by d, c.start_time;
$$;
revoke all on function public.class_schedule(uuid, integer) from public, anon;
grant execute on function public.class_schedule(uuid, integer) to authenticated;

create or replace function public.book_class(p_class uuid, p_date date)
returns text language plpgsql security definer set search_path = public as $$
declare v_c gym_classes; v_status text; v_booked integer; v_gym gyms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_c from gym_classes where id = p_class and active for update;
  if not found then raise exception 'class_not_found'; end if;
  if extract(dow from p_date) <> v_c.weekday or _class_start(v_c, p_date) <= now() then raise exception 'bad_date'; end if;
  if p_date > app_today() + 21 then raise exception 'too_far_ahead'; end if;
  select * into v_gym from gyms where id = v_c.gym_id;
  if v_c.members_only and not exists (
      select 1 from memberships m where m.user_id = auth.uid()
        and (m.gym_id = v_c.gym_id or (m.chain_id is not null and m.chain_id = v_gym.chain_id))
        and membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until, p_date) = 'active') then
    raise exception 'members_only';
  end if;
  select count(*) into v_booked from class_bookings where class_id = p_class and class_date = p_date and status in ('booked','attended');
  v_status := case when v_booked < v_c.capacity then 'booked' else 'waitlist' end;
  insert into class_bookings (class_id, class_date, user_id, status) values (p_class, p_date, auth.uid(), v_status)
  on conflict (class_id, class_date, user_id) do update set status = excluded.status, updated_at = now(), created_at = now()
    where class_bookings.status = 'cancelled'
  returning status into v_status;
  if v_status is null then raise exception 'already_booked'; end if;
  return v_status;
end $$;
revoke all on function public.book_class(uuid, date) from public, anon;
grant execute on function public.book_class(uuid, date) to authenticated;

create or replace function public.cancel_class_booking(p_booking uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_b class_bookings; v_c gym_classes; v_cut integer; v_next class_bookings;
begin
  select * into v_b from class_bookings where id = p_booking and user_id = auth.uid() and status in ('booked','waitlist') for update;
  if not found then raise exception 'booking_not_found'; end if;
  select * into v_c from gym_classes where id = v_b.class_id;
  select coalesce((select class_cutoff_min from gym_settings where gym_id = v_c.gym_id), 60) into v_cut;
  if v_b.status = 'booked' and _class_start(v_c, v_b.class_date) - make_interval(mins => v_cut) < now() then
    raise exception 'too_late_to_cancel';
  end if;
  update class_bookings set status = 'cancelled', updated_at = now() where id = p_booking;
  if v_b.status = 'booked' then
    select * into v_next from class_bookings where class_id = v_b.class_id and class_date = v_b.class_date and status = 'waitlist'
     order by created_at limit 1 for update;
    if v_next.id is not null then
      update class_bookings set status = 'booked', updated_at = now() where id = v_next.id;
      perform _notice(v_next.user_id, 'cls_up:' || v_next.id, 'انفتح لك مكان 🎉', 'صار لك مقعد في حصة «' || v_c.name || '» يوم ' || to_char(v_b.class_date, 'YYYY-MM-DD') || ' الساعة ' || to_char(v_c.start_time, 'HH24:MI') || '.',
                      'A spot opened up 🎉', 'You''re in “' || v_c.name || '” on ' || to_char(v_b.class_date, 'YYYY-MM-DD') || ' at ' || to_char(v_c.start_time, 'HH24:MI') || '.',
                      '/classes/' || v_c.gym_id, v_c.id);
    end if;
  end if;
end $$;
revoke all on function public.cancel_class_booking(uuid) from public, anon;
grant execute on function public.cancel_class_booking(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- تنبيهات مجدولة: قبل انتهاء الاشتراك (٧ و٢ أيام) وقبل الحصة بساعة
-- ---------------------------------------------------------------------
create or replace function public.run_gym_reminders(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare r record; v_n integer := 0; v_hour integer := extract(hour from p_now at time zone 'Asia/Riyadh');
begin
  -- التجديد: من ١٠ الصبح لين ٩ الليل بتوقيت الرياض
  if v_hour between 10 and 20 then
    for r in
      select m.id, m.user_id, m.plan_name, m.ends_on, coalesce(g.name, c.name) as place, coalesce(g.name_en, c.name_en, g.name, c.name) as place_en,
             m.ends_on - app_today() as d
      from memberships m left join gyms g on g.id = m.gym_id left join gym_chains c on c.id = m.chain_id
      where m.user_id is not null and m.kind = 'membership'
        and membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until) in ('active','frozen')
        and m.ends_on - app_today() in (7, 2)
      limit 5000
    loop
      if _notice(r.user_id, 'renew' || r.d || ':' || r.id,
           'اشتراكك قرب يخلص ⏳', 'اشتراك «' || r.plan_name || '» في ' || r.place || ' ينتهي بعد ' || r.d || ' أيام. جدّده عشان ما تنقطع سلسلتك.',
           'Your membership ends soon ⏳', '“' || r.plan_name || '” at ' || r.place_en || ' ends in ' || r.d || ' days. Renew to keep your streak going.',
           '/membership', r.id) then v_n := v_n + 1; end if;
    end loop;
  end if;
  -- الحصص: قبل البداية بـ ٤٥–٧٥ دقيقة
  for r in
    select b.id, b.user_id, c.name, c.start_time, c.gym_id
    from class_bookings b join gym_classes c on c.id = b.class_id
    where b.status = 'booked' and _class_start(c, b.class_date) between p_now + interval '45 minutes' and p_now + interval '75 minutes'
    limit 5000
  loop
    if _notice(r.user_id, 'cls_rem:' || r.id, 'حصتك بعد ساعة ⏰', '«' || r.name || '» الساعة ' || to_char(r.start_time, 'HH24:MI') || ' في ' || _gym_label(r.gym_id) || '.',
               'Your class starts in an hour ⏰', '“' || r.name || '” at ' || to_char(r.start_time, 'HH24:MI') || '.', '/classes/' || r.gym_id, r.id) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
revoke all on function public.run_gym_reminders(timestamptz) from public, anon, authenticated;

do $$
begin
  perform cron.schedule('arq-gym-reminders', '*/15 * * * *', 'select public.run_gym_reminders()');
exception when others then
  raise notice 'pg_cron not available: gym reminders not scheduled (%)', sqlerrm;
end $$;
