-- ألوان بطاقة Wallet (نفس ثيمات التطبيق): النخيل، الواحة، الكثبان، الرمال، الخزامى — العضو يختار قبل ما يضيف البطاقة
alter table public.wallet_links  add column if not exists theme text not null default 'palm' check (theme in ('palm','oasis','dune','sand','lavender'));
alter table public.wallet_passes add column if not exists theme text not null default 'palm' check (theme in ('palm','oasis','dune','sand','lavender'));

drop function if exists public.wallet_link();
create or replace function public.wallet_link(p_theme text default null)
returns table (token text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_tok text; v_exp timestamptz := now() + interval '5 minutes'; v_theme text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  v_theme := coalesce(nullif(p_theme, ''), (select w.theme from wallet_passes w where w.user_id = auth.uid()), 'palm');
  if v_theme not in ('palm','oasis','dune','sand','lavender') then v_theme := 'palm'; end if;
  delete from wallet_links l where l.user_id = auth.uid() and l.created_at < now() - interval '1 day';
  if (select count(*) from wallet_links l where l.user_id = auth.uid() and l.created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'too_many_requests';
  end if;
  v_tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into wallet_links (token_hash, user_id, expires_at, theme) values (_hash(v_tok), auth.uid(), v_exp, v_theme);
  token := v_tok; expires_at := v_exp;
  return next;
end $$;
revoke all on function public.wallet_link(text) from public, anon;
grant execute on function public.wallet_link(text) to authenticated;

drop function if exists public.my_wallet_pass();
create or replace function public.my_wallet_pass()
returns table (has_pass boolean, code_hint text, rotated_at timestamptz, last_used_at timestamptz, theme text)
language sql stable security definer set search_path = public as $$
  select true, w.code_hint, w.rotated_at, w.last_used_at, w.theme from wallet_passes w where w.user_id = auth.uid()
  union all
  select false, null, null, null, null where not exists (select 1 from wallet_passes w where w.user_id = auth.uid());
$$;
revoke all on function public.my_wallet_pass() from public, anon;
grant execute on function public.my_wallet_pass() to authenticated;

drop function if exists public.wallet_issue(text);
create or replace function public.wallet_issue(p_token text)
returns table (user_id uuid, serial uuid, code text, member_name text, username text, member_since date,
               memberships jsonb, locations jsonb, theme text)
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
  insert into wallet_passes as w (user_id, code_hash, code_hint, theme) values (v_uid, _hash(v_code), right(v_code, 4), v_link.theme)
  on conflict on constraint wallet_passes_pkey do update set code_hash = excluded.code_hash, code_hint = excluded.code_hint,
    theme = excluded.theme, rotated_at = now();

  user_id := v_uid; code := v_code; theme := v_link.theme;
  select w.serial into serial from wallet_passes w where w.user_id = v_uid;
  select coalesce(nullif(btrim(p.full_name), ''), p.username), p.username, p.created_at::date
    into member_name, username, member_since from profiles p where p.id = v_uid;

  select coalesce(jsonb_agg(x order by x->>'ends_on' desc), '[]'::jsonb) into memberships from (
    select jsonb_build_object(
      'place', coalesce(g.name, c.name), 'place_en', coalesce(g.name_en, c.name_en),
      'plan', m.plan_name, 'ends_on', m.ends_on,
      'state', membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until)) as x
    from memberships m left join gyms g on g.id = m.gym_id left join gym_chains c on c.id = m.chain_id
    where m.user_id = v_uid and membership_state(m.status, m.starts_on, m.ends_on, m.frozen_from, m.frozen_until) in ('active','frozen','upcoming')
    limit 5) s;

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
