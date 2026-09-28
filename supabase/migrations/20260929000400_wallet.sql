-- =====================================================================
-- بطاقة أرك في Apple Wallet: باركود ثابت للعضو (يتجدد كل ما نزّل البطاقة من جديد)
-- - الرابط لتنزيل البطاقة قصير العمر (٥ دقايق) ولمرة وحدة، لأن Safari يفتحه بدون تسجيل دخول
-- - الرمز نفسه ما ينحفظ، نحفظ بصمته فقط؛ تنزيل بطاقة جديدة يلغي القديمة
-- - الاستقبال يقرأ باركود البطاقة بنفس شاشة التحقق، والبوابة ترفض دخول ثاني خلال ٣ ساعات (يمنع مشاركة البطاقة)
-- =====================================================================

create table if not exists public.wallet_passes (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  serial       uuid not null default gen_random_uuid() unique,
  code_hash    text not null unique,
  code_hint    text not null,
  created_at   timestamptz not null default now(),
  rotated_at   timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.wallet_passes enable row level security;  -- الوصول عبر الدوال فقط

create table if not exists public.wallet_links (
  token_hash  text primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);
create index if not exists wallet_links_user_idx on public.wallet_links (user_id, created_at desc);
alter table public.wallet_links enable row level security;

-- رابط تنزيل البطاقة (التطبيق يفتحه في Safari)
create or replace function public.wallet_link()
returns table (token text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_tok text; v_exp timestamptz := now() + interval '5 minutes';
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from wallet_links l where l.user_id = auth.uid() and l.created_at < now() - interval '1 day';
  if (select count(*) from wallet_links l where l.user_id = auth.uid() and l.created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'too_many_requests';
  end if;
  v_tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into wallet_links (token_hash, user_id, expires_at) values (_hash(v_tok), auth.uid(), v_exp);
  token := v_tok; expires_at := v_exp;
  return next;
end $$;
revoke all on function public.wallet_link() from public, anon;
grant execute on function public.wallet_link() to authenticated;

-- حالة بطاقتي + إيقافها (لو ضاع الجوال)
create or replace function public.my_wallet_pass()
returns table (has_pass boolean, code_hint text, rotated_at timestamptz, last_used_at timestamptz)
language sql stable security definer set search_path = public as $$
  select true, w.code_hint, w.rotated_at, w.last_used_at from wallet_passes w where w.user_id = auth.uid()
  union all
  select false, null, null, null where not exists (select 1 from wallet_passes w where w.user_id = auth.uid());
$$;
revoke all on function public.my_wallet_pass() from public, anon;
grant execute on function public.my_wallet_pass() to authenticated;

create or replace function public.revoke_wallet_pass()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from wallet_passes where user_id = auth.uid();
end $$;
revoke all on function public.revoke_wallet_pass() from public, anon;
grant execute on function public.revoke_wallet_pass() to authenticated;

-- يستدعيها السيرفر فقط (دالة wallet-pass بمفتاح الخدمة): تستهلك الرابط وتجدد الرمز وترجع بيانات البطاقة
create or replace function public.wallet_issue(p_token text)
returns table (user_id uuid, serial uuid, code text, member_name text, username text, member_since date,
               memberships jsonb, locations jsonb)
language plpgsql security definer set search_path = public as $$
declare v_link wallet_links; v_code text; v_uid uuid;
begin
  select * into v_link from wallet_links l where l.token_hash = _hash(coalesce(p_token, '')) for update;
  if not found then raise exception 'code_not_found'; end if;
  if v_link.used_at is not null then raise exception 'code_used'; end if;
  if v_link.expires_at < now() then raise exception 'code_expired'; end if;
  update wallet_links set used_at = now() where token_hash = v_link.token_hash;
  v_uid := v_link.user_id;

  v_code := 'w_' || replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  insert into wallet_passes as w (user_id, code_hash, code_hint) values (v_uid, _hash(v_code), right(v_code, 4))
  on conflict on constraint wallet_passes_pkey do update set code_hash = excluded.code_hash, code_hint = excluded.code_hint, rotated_at = now();

  user_id := v_uid; code := v_code;
  select w.serial into serial from wallet_passes w where w.user_id = v_uid;
  select coalesce(nullif(btrim(p.full_name), ''), p.username), p.username, p.created_at::date
    into member_name, username, member_since from profiles p where p.id = v_uid;

  -- الاشتراكات السارية/المجمدة/القادمة (الأحدث أولاً)
  select coalesce(jsonb_agg(x order by x->>'ends_on' desc), '[]'::jsonb) into memberships from (
    select jsonb_build_object(
      'place', coalesce(g.name, c.name), 'place_en', coalesce(g.name_en, c.name_en),
      'plan', m.plan_name, 'ends_on', m.ends_on,
      'state', membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until)) as x
    from memberships m left join gyms g on g.id = m.gym_id left join gym_chains c on c.id = m.chain_id
    where m.user_id = v_uid and membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until) in ('active','frozen','upcoming')
    limit 5) s;

  -- مواقع الأندية (تظهر البطاقة على شاشة القفل لما توصل النادي) — بحد أقصى ١٠
  select coalesce(jsonb_agg(jsonb_build_object('lat', q.lat, 'lng', q.lng, 'name', q.name)), '[]'::jsonb) into locations from (
    select distinct on (g.id) g.id, g.lat, g.lng, coalesce(g.name, '') as name
    from memberships m join gyms g on (g.id = m.gym_id or (m.chain_id is not null and g.chain_id = m.chain_id))
    where m.user_id = v_uid and g.lat is not null and g.lng is not null
      and membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until) in ('active','upcoming')
    order by g.id limit 10) q;
  if locations = '[]'::jsonb then
    select coalesce(jsonb_agg(jsonb_build_object('lat', q.lat, 'lng', q.lng, 'name', q.name)), '[]'::jsonb) into locations from (
      select g.lat, g.lng, g.name, max(ci.checked_in_at) as last_at from check_ins ci join gyms g on g.id = ci.gym_id
      where ci.user_id = v_uid and g.lat is not null group by g.id, g.lat, g.lng, g.name order by last_at desc limit 3) q;
  end if;
  return next;
end $$;
revoke all on function public.wallet_issue(text) from public, anon, authenticated;
grant execute on function public.wallet_issue(text) to service_role;

-- التحقق من الدخول: نفس المنطق السابق + باركود بطاقة Wallet (w_…)
create or replace function public._verify_entry(p_token text, p_gym uuid, p_staff uuid, p_gate uuid)
returns table (allowed boolean, reason text, member_id uuid, member_name text, username text, avatar_url text,
               plan_name text, ends_on date, days_left integer, membership_id uuid, check_in_id uuid, already_in boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_tok entry_tokens; v_gym gyms; v_m memberships; v_state text; v_ci check_ins; v_open boolean := false;
  v_in text := btrim(coalesce(p_token, ''));
  v_uid uuid; v_wallet boolean := false;
begin
  select * into v_gym from gyms where id = p_gym;
  if not found then raise exception 'gym_not_found'; end if;
  v_in := regexp_replace(v_in, '^arq://entry/', '');

  allowed := false; already_in := false;
  if v_in ~ '^w_[0-9a-f]{40}$' then
    v_wallet := true;
    select w.user_id into v_uid from wallet_passes w where w.code_hash = _hash(v_in);
    if v_uid is null then reason := 'code_not_found'; end if;
  else
    if v_in ~ '^[0-9]{6}$' then
      select * into v_tok from entry_tokens e where e.code = v_in order by e.created_at desc limit 1;
    else
      select * into v_tok from entry_tokens e where e.token_hash = _hash(v_in);
    end if;
    v_uid := v_tok.user_id;
    if v_tok.user_id is null then reason := 'code_not_found';
    elsif v_tok.used_at is not null then reason := 'code_used';
    elsif v_tok.expires_at < now() then reason := 'code_expired';
    end if;
  end if;

  if v_uid is not null then
    select p.id, coalesce(nullif(btrim(p.full_name), ''), p.username), p.username, p.avatar_url
      into member_id, member_name, username, avatar_url from profiles p where p.id = v_uid;
  end if;

  if reason is null then
    -- أفضل اشتراك يصلح لهذا الفرع: ساري أولاً، ثم مجمّد/قادم، ثم الأحدث
    select * into v_m from memberships m
     where m.user_id = v_uid and (m.gym_id = p_gym or (m.chain_id is not null and m.chain_id = v_gym.chain_id))
     order by case membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until)
                when 'active' then 0 when 'frozen' then 1 when 'upcoming' then 2 when 'expired' then 3 else 4 end,
              m.ends_on desc
     limit 1;
    if v_m.id is null then
      reason := case when exists (select 1 from memberships m where m.user_id = v_uid and membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until) = 'active')
                     then 'wrong_gym' else 'no_membership' end;
    else
      v_state := membership_state(v_m.status, v_m.starts_on, v_m.ends_on, v_m.frozen_from, v_m.frozen_until);
      plan_name := v_m.plan_name; ends_on := v_m.ends_on; days_left := membership_days_left(v_m.ends_on); membership_id := v_m.id;
      reason := case v_state when 'active' then 'ok' else v_state end;
      allowed := v_state = 'active';
    end if;
    if v_wallet then
      update wallet_passes set last_used_at = now() where user_id = v_uid;
      -- البوابة (بدون موظف): بطاقة Wallet تدخل مرة وحدة كل ٣ ساعات
      if allowed and p_gate is not null and exists (
        select 1 from entry_log l where l.user_id = v_uid and l.allowed and l.created_at > now() - interval '3 hours') then
        allowed := false; reason := 'recent_entry';
      end if;
    else
      update entry_tokens set used_at = now(), used_gym = p_gym where token_hash = v_tok.token_hash;
    end if;
  end if;

  if allowed then
    v_open := exists (select 1 from check_ins c where c.user_id = v_uid and c.checked_out_at is null and c.checked_in_at > now() - interval '6 hours');
    v_ci := _record_visit(v_uid, p_gym, case when p_gate is not null then 'gate' else 'qr' end);
    check_in_id := v_ci.id; already_in := v_open;
  end if;

  insert into entry_log (gym_id, user_id, staff_id, gate_id, allowed, reason, membership_id)
  values (p_gym, v_uid, p_staff, p_gate, allowed, coalesce(reason, 'code_not_found'), membership_id);
  return next;
end $$;
revoke all on function public._verify_entry(text, uuid, uuid, uuid) from public, anon, authenticated;
