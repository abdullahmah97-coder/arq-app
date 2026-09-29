-- =====================================================================
-- اشتراك الوجبات مع المطاعم الصحية:
-- المستخدم يطلب اشتراك ويوافق صراحةً إن المطعم يشوف أهدافه الغذائية فقط (السعرات والماكروز وتوزيع الوجبات وملاحظاته)
-- المطعم يقبل ويجدول الوجبات يوم بيوم من منيوه، والوجبات تنزل في جدول وجبات المستخدم
-- إنهاء الاشتراك يقطع وصول المطعم فوراً
-- =====================================================================
create table public.meal_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  brand_id    uuid not null references public.brands(id) on delete cascade,
  status      text not null default 'requested' check (status in ('requested','active','declined','ended')),
  consent_at  timestamptz not null default now(),
  slots       text[] not null default '{lunch,dinner}' check (cardinality(slots) between 1 and 4 and slots <@ array['breakfast','lunch','snack','dinner']::text[]),
  notes       text check (char_length(notes) <= 300),
  starts_on   date not null default app_today(),
  ended_at    timestamptz,
  created_at  timestamptz not null default now()
);
create unique index meal_sub_open on public.meal_subscriptions (user_id, brand_id) where status in ('requested','active');
create index on public.meal_subscriptions (brand_id, status);

create table public.subscription_meals (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.meal_subscriptions(id) on delete cascade,
  day             date not null,
  slot            text not null check (slot in ('breakfast','lunch','snack','dinner')),
  product_id      uuid references public.brand_products(id) on delete set null,
  name            text not null check (char_length(btrim(name)) between 2 and 80),
  kcal            integer not null check (kcal between 0 and 5000),
  protein_g       numeric(6,1) not null default 0 check (protein_g between 0 and 500),
  carbs_g         numeric(6,1) not null default 0 check (carbs_g between 0 and 1000),
  fat_g           numeric(6,1) not null default 0 check (fat_g between 0 and 500),
  created_at      timestamptz not null default now()
);
create index on public.subscription_meals (subscription_id, day);

-- طرف في الاشتراك (المشترك أو صاحب المطعم)
create or replace function public.sub_party(p_sub uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from meal_subscriptions s join brands b on b.id = s.brand_id
                 where s.id = p_sub and (s.user_id = auth.uid() or b.owner = auth.uid()));
$$;
-- صاحب المطعم واشتراك فعّال
create or replace function public.sub_kitchen(p_sub uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from meal_subscriptions s join brands b on b.id = s.brand_id
                 where s.id = p_sub and s.status = 'active' and b.owner = auth.uid());
$$;
revoke all on function public.sub_party(uuid), public.sub_kitchen(uuid) from public, anon;
grant execute on function public.sub_party(uuid), public.sub_kitchen(uuid) to authenticated;

alter table public.meal_subscriptions enable row level security;
alter table public.subscription_meals enable row level security;
create policy ms_read on public.meal_subscriptions for select to authenticated using (user_id = auth.uid() or owns_brand(brand_id));
create policy sm_read on public.subscription_meals for select to authenticated using (sub_party(subscription_id));
create policy sm_write on public.subscription_meals for insert to authenticated with check (sub_kitchen(subscription_id));
create policy sm_update on public.subscription_meals for update to authenticated using (sub_kitchen(subscription_id)) with check (sub_kitchen(subscription_id));
create policy sm_delete on public.subscription_meals for delete to authenticated using (sub_kitchen(subscription_id));

-- حد معقول: ٨ وجبات باليوم لكل اشتراك
create or replace function public._sm_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from subscription_meals where subscription_id = new.subscription_id and day = new.day) >= 8 then
    raise exception 'too_many_rows';
  end if;
  return new;
end $$;
create trigger sm_limit before insert on public.subscription_meals for each row execute function public._sm_limit();

-- طلب اشتراك: لازم مطعم معتمد، وموافقة صريحة على مشاركة الأهداف
create or replace function public.request_meal_subscription(p_brand uuid, p_slots text[], p_notes text, p_consent boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_b brands; v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not coalesce(p_consent, false) then raise exception 'consent_required'; end if;
  select * into v_b from brands where id = p_brand;
  if v_b.id is null or v_b.status <> 'approved' or v_b.category <> 'restaurant' then raise exception 'brand_not_approved'; end if;
  if v_b.owner = auth.uid() then raise exception 'not_allowed'; end if;
  if exists (select 1 from meal_subscriptions where user_id = auth.uid() and brand_id = p_brand and status in ('requested','active')) then
    raise exception 'request_pending';
  end if;
  if (select count(*) from meal_subscriptions where user_id = auth.uid() and created_at > now() - interval '1 day') >= 5 then
    raise exception 'rate_limited';
  end if;
  insert into meal_subscriptions (user_id, brand_id, slots, notes)
  values (auth.uid(), p_brand, coalesce(p_slots, '{lunch,dinner}'), nullif(left(btrim(coalesce(p_notes, '')), 300), ''))
  returning id into v_id;
  perform _notice(v_b.owner, 'ms:' || v_id, 'طلب اشتراك وجبات جديد', _person_label(auth.uid()) || ' يبي يشترك في وجباتكم وشارككم أهدافه الغذائية.',
    'New meal subscription request', _person_label(auth.uid()) || ' wants to subscribe to your meals and shared their nutrition targets.', '/store/manage', v_id);
  return v_id;
end $$;

-- رد المطعم على الطلب
create or replace function public.respond_meal_subscription(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_s meal_subscriptions; v_b brands;
begin
  select * into v_s from meal_subscriptions where id = p_id;
  select * into v_b from brands where id = v_s.brand_id;
  if v_s.id is null or v_b.owner is distinct from auth.uid() then raise exception 'not_allowed'; end if;
  if v_s.status <> 'requested' then raise exception 'bad_status'; end if;
  update meal_subscriptions set status = case when p_accept then 'active' else 'declined' end,
         ended_at = case when p_accept then null else now() end where id = p_id;
  perform _notice(v_s.user_id, 'msr:' || p_id,
    case when p_accept then 'اشتراكك مع ' || v_b.name || ' صار فعّال ✓' else v_b.name || ' اعتذر عن الاشتراك' end,
    case when p_accept then 'وجباتك من المطعم بتنزل في جدول وجباتك بخطتي.' else 'تقدر تشوف مطاعم صحية ثانية في المتاجر.' end,
    case when p_accept then 'Your subscription with ' || v_b.name || ' is active ✓' else v_b.name || ' declined the subscription' end,
    case when p_accept then 'Meals from the restaurant will appear in your plan.' else 'You can browse other healthy restaurants in Stores.' end,
    '/(tabs)/plan', p_id);
end $$;

-- إنهاء الاشتراك (المشترك أو المطعم): يوقف مشاركة الأهداف فوراً
create or replace function public.end_meal_subscription(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_s meal_subscriptions; v_b brands;
begin
  select * into v_s from meal_subscriptions where id = p_id;
  select * into v_b from brands where id = v_s.brand_id;
  if v_s.id is null or (v_s.user_id <> auth.uid() and v_b.owner is distinct from auth.uid()) then raise exception 'not_allowed'; end if;
  if v_s.status not in ('requested','active') then return; end if;
  update meal_subscriptions set status = 'ended', ended_at = now() where id = p_id;
  if auth.uid() = v_s.user_id then
    perform _notice(v_b.owner, 'mse:' || p_id, 'انتهى اشتراك', _person_label(v_s.user_id) || ' أنهى اشتراك الوجبات، وتوقفت مشاركة أهدافه معكم.',
      'Subscription ended', _person_label(v_s.user_id) || ' ended their meal subscription; their targets are no longer shared.', '/store/manage', p_id);
  else
    perform _notice(v_s.user_id, 'mse:' || p_id, v_b.name || ' أنهى اشتراك الوجبات', 'توقفت مشاركة أهدافك معهم.',
      v_b.name || ' ended the meal subscription', 'Your targets are no longer shared with them.', '/(tabs)/plan', p_id);
  end if;
end $$;

-- المشتركين للمطعم: الأهداف الغذائية فقط وبس للطلبات والاشتراكات الفعالة
create or replace function public.restaurant_subscribers(p_brand uuid)
returns table (id uuid, status text, slots text[], notes text, starts_on date, created_at timestamptz,
               name text, avatar_url text, calories int, protein_g int, carbs_g int, fat_g int)
language sql stable security definer set search_path = public as $$
  select s.id, s.status, s.slots, s.notes, s.starts_on, s.created_at,
         coalesce(nullif(p.full_name, ''), p.username), p.avatar_url,
         (pl.data->'targets'->>'calories')::numeric::int, (pl.data->'targets'->>'protein_g')::numeric::int,
         (pl.data->'targets'->>'carbs_g')::numeric::int, (pl.data->'targets'->>'fat_g')::numeric::int
  from meal_subscriptions s
  join brands b on b.id = s.brand_id and b.owner = auth.uid()
  join profiles p on p.id = s.user_id
  left join plans pl on pl.user_id = s.user_id and pl.active
  where s.brand_id = p_brand and s.status in ('requested','active')
  order by (s.status = 'requested') desc, s.created_at desc
  limit 200;
$$;

revoke all on function public.request_meal_subscription(uuid, text[], text, boolean), public.respond_meal_subscription(uuid, boolean),
  public.end_meal_subscription(uuid), public.restaurant_subscribers(uuid) from public, anon;
grant execute on function public.request_meal_subscription(uuid, text[], text, boolean), public.respond_meal_subscription(uuid, boolean),
  public.end_meal_subscription(uuid), public.restaurant_subscribers(uuid) to authenticated;
