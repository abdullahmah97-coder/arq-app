// اختبارات لوحة تحكم المالك بالشركاء: طلبات الأندية، الاعتماد والإخفاء والحذف والربط لكل فئة، ونوع الحساب
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U, gym, visit } = await setup();
  const notes = async (uid, url) => (await q(`select count(*)::int n from notifications where user_id = $1 and data->>'url' = $2`, [uid, url]))[0].n;

  // ---------- نوع الحساب ----------
  await as(U.C, `update profiles set account_type = 'club' where id = $1`, [U.C]);
  check('user can pick an account type at signup', (await q(`select account_type from profiles where id = $1`, [U.C]))[0].account_type === 'club');
  await expectErr('unknown account type rejected', () => as(U.C, `update profiles set account_type = 'boss' where id = $1`, [U.C]), /check constraint/);

  // ---------- طلب انضمام نادي ----------
  const chain = (await q(`select id, name from gym_chains order by name limit 1`))[0];
  const [{ request_club_partner: rid }] = await as(U.C, `select request_club_partner($1, null, 'نادي خالد', 'owner', '1010123456', '0551234567', 'club@example.com', 'الرياض', 3, 'نبي نصير شركاء')`, [chain.id]);
  check('club can request to join as a partner', !!rid);
  const req = (await q(`select * from club_requests where id = $1`, [rid]))[0];
  check('phone normalized to international format', req.phone === '966551234567', req.phone);
  check('admins notified about the club request', (await notes(U.E, '/owner')) >= 1);
  await expectErr('one open request at a time', () => as(U.C, `select request_club_partner(null, null, 'نادي ثاني', 'owner', null, '0550000000')`), /request_pending/);
  await expectErr('users cannot insert requests directly', () => as(U.A, `insert into club_requests (user_id, club_name, role, phone) values ($1, 'x', 'owner', '966500000000')`, [U.A]), /row-level security|permission denied/);
  check('others cannot read club requests', (await as(U.A, `select 1 from club_requests`)).length === 0);
  check('requester sees own request', (await as(U.C, `select 1 from club_requests where id = $1`, [rid])).length === 1);
  await expectErr('non-admin cannot see the queue', async () => { const r = await as(U.A, `select * from club_request_queue()`); if (!r.length) throw new Error('empty_ok'); }, /empty_ok/);
  check('admin sees the queue with chain name', (await as(U.E, `select chain_name from club_request_queue()`))[0]?.chain_name === chain.name);
  await expectErr('non-admin cannot review', () => as(U.A, `select review_club_request($1, 'approved')`, [rid]), /not_allowed/);
  await expectErr('rejecting needs a reason', () => as(U.E, `select review_club_request($1, 'rejected')`, [rid]), /note_required/);
  await as(U.E, `select review_club_request($1, 'approved')`, [rid]);
  check('approval makes the requester a chain manager', (await q(`select 1 from chain_managers where chain_id = $1 and user_id = $2`, [chain.id, U.C])).length === 1);
  check('chain marked as ARQ partner', (await q(`select partner from gym_chains where id = $1`, [chain.id]))[0].partner === true);
  check('club told the dashboard is ready', (await notes(U.C, '/partners')) === 1);
  check('manager can now edit the chain', (await as(U.C, `update gym_chains set description = 'أفضل نادي' where id = $1 returning 1`, [chain.id])).length === 1);
  await expectErr('a decided request cannot be decided again', () => as(U.E, `select review_club_request($1, 'approved')`, [rid]), /bad_status/);

  // نادي جديد مو موجود: الاعتماد ينشئ سلسلة
  const [{ request_club_partner: rid2 }] = await as(U.A, `select request_club_partner(null, null, 'Iron Box', 'manager', null, '966500000001')`);
  const [{ review_club_request: newChain }] = await as(U.E, `select review_club_request($1, 'approved')`, [rid2]);
  const nc = (await q(`select name, partner, slug from gym_chains where id = $1`, [newChain]))[0];
  check('approving an unknown club creates its chain as a partner', nc?.name === 'Iron Box' && nc.partner && /^club-/.test(nc.slug));
  const [{ request_club_partner: rid3 }] = await as(U.B, `select request_club_partner(null, null, 'Sara Gym', 'owner', null, '966500000002')`);
  await as(U.E, `select review_club_request($1, 'rejected', 'أرسل السجل التجاري')`, [rid3]);
  check('rejected club told what to fix', (await notes(U.B, '/clubs/join')) === 1);

  // ---------- قائمة الشركاء والملخص ----------
  await expectErr('non-admin cannot list partners', () => as(U.A, `select * from admin_partner_list('club')`), /not_allowed/);
  const clubs = await as(U.E, `select * from admin_partner_list('club')`);
  check('owner lists all chains, partners first', clubs.length >= 2 && clubs[0].partner === true);
  const ov = Object.fromEntries((await as(U.E, `select * from partner_overview()`)).map((r) => [r.kind, r]));
  check('overview counts every partner type', ['club', 'store', 'coach', 'center'].every((k) => ov[k]) && ov.club.partners >= 2, JSON.stringify(ov.club));

  // ---------- إجراءات الأندية ----------
  await as(U.E, `select admin_partner_action('club', $1, 'hide')`, [newChain]);
  check('hidden chain disappears for users', (await as(U.B, `select 1 from gym_chains where id = $1`, [newChain])).length === 0);
  check('hidden chain still visible to its manager', (await as(U.A, `select 1 from gym_chains where id = $1`, [newChain])).length === 1);
  await as(U.E, `select admin_partner_action('club', $1, 'show')`, [newChain]);
  check('shown again', (await as(U.B, `select 1 from gym_chains where id = $1`, [newChain])).length === 1);
  await as(U.E, `select admin_assign_partner('club', $1, '@sara')`, [newChain]);
  check('owner can add a manager by username', (await as(U.E, `select username from admin_chain_managers($1)`, [newChain])).map((r) => r.username).includes('sara'));
  await as(U.E, `select admin_remove_chain_manager($1, $2)`, [newChain, U.B]);
  check('owner can remove a manager', (await q(`select 1 from chain_managers where chain_id = $1 and user_id = $2`, [newChain, U.B])).length === 0);
  const [{ admin_create_chain: made }] = await as(U.E, `select admin_create_chain('نادي الإدارة', 'Admin Fit', 'men', null, null, null, null)`);
  check('owner can add a chain', (await q(`select slug from gym_chains where id = $1`, [made]))[0].slug === 'admin-fit');
  await expectErr('non-admin cannot add a chain', () => as(U.A, `select admin_create_chain('x', 'x', 'men', null, null, null, null)`), /not_allowed/);
  await as(U.E, `select admin_partner_action('club', $1, 'delete')`, [made]);
  check('owner can delete a chain', (await q(`select 1 from gym_chains where id = $1`, [made])).length === 0);
  await expectErr('unknown partner id', () => as(U.E, `select admin_partner_action('club', gen_random_uuid(), 'hide')`), /request_not_found/);

  // ---------- المتاجر والمطاعم ----------
  const [st] = await as(U.A, `insert into brands (owner, name, category, website) values ($1, 'Protein Bar', 'restaurant', 'https://pb.example') returning id, status`, [U.A]);
  check('new store pending', st.status === 'pending');
  check('admins notified about the new store', (await q(`select count(*)::int n from notifications where user_id = $1 and data->>'title_ar' = 'متجر ينتظر اعتمادك'`, [U.E]))[0].n === 1);
  await expectErr('store owner cannot hand the page to someone else', () => as(U.A, `update brands set owner = $2 where id = $1`, [st.id, U.B]), /status_locked/);
  await expectErr('rejecting a store needs a reason', () => as(U.E, `select admin_partner_action('store', $1, 'reject')`, [st.id]), /note_required/);
  await as(U.E, `select admin_partner_action('store', $1, 'reject', 'أضف المنيو')`, [st.id]);
  check('store told what to fix', (await notes(U.A, '/store/join')) === 1);
  await as(U.A, `update brands set tagline = 'وجبات عالية البروتين' where id = $1`, [st.id]);
  check('editing a rejected store resubmits it', (await q(`select status from brands where id = $1`, [st.id]))[0].status === 'pending');
  await as(U.E, `select admin_partner_action('store', $1, 'approve')`, [st.id]);
  check('approved store visible to all and owner notified', (await as(U.C, `select 1 from brands where id = $1`, [st.id])).length === 1 && (await notes(U.A, '/store/manage')) === 1);
  await as(U.E, `select admin_partner_action('store', $1, 'hide', 'بلاغات')`, [st.id]);
  check('suspended store hidden from users', (await as(U.C, `select 1 from brands where id = $1`, [st.id])).length === 0);
  check('suspended store still visible to its owner', (await as(U.A, `select status from brands where id = $1`, [st.id]))[0].status === 'suspended');
  await expectErr('owner cannot unsuspend', () => as(U.A, `update brands set status = 'approved' where id = $1`, [st.id]), /status_locked/);
  await as(U.E, `select admin_partner_action('store', $1, 'show')`, [st.id]);

  const [arqStore] = await as(U.E, `insert into brands (owner, listed_by, status, name, category, website) values (null, 'arq', 'approved', 'مطبخ صحي', 'restaurant', 'https://healthy.example') returning id, status`);
  check('owner can add a store page with no account behind it', arqStore.status === 'approved');
  await as(U.E, `insert into brand_products (brand_id, name, price_sar, kcal) values ($1, 'سلطة دجاج', 32, 420)`, [arqStore.id]);
  check('owner can add menu items to it', (await q(`select count(*)::int n from brand_products where brand_id = $1`, [arqStore.id]))[0].n === 1);
  await expectErr('no meal subscriptions to a page without an owner', () => as(U.B, `select request_meal_subscription($1, '{lunch}', null, true)`, [arqStore.id]), /brand_not_approved/);
  await expectErr('store with an owner cannot be given to someone who already has one', () => as(U.E, `select admin_assign_partner('store', $1, 'ahmed')`, [arqStore.id]), /already_linked/);
  await as(U.E, `select admin_assign_partner('store', $1, 'khalid')`, [arqStore.id]);
  const linked = (await q(`select owner, listed_by from brands where id = $1`, [arqStore.id]))[0];
  check('assigning makes the account the owner and a partner', linked.owner === U.C && linked.listed_by === 'owner');
  check('new owner told the dashboard is ready', (await notes(U.C, '/partners')) === 2);
  const sid = (await as(U.B, `select request_meal_subscription($1, '{lunch}', null, true) id`, [arqStore.id]))[0].id;
  check('once owned, the restaurant takes subscriptions', !!sid);
  await as(U.E, `select admin_partner_action('store', $1, 'delete')`, [arqStore.id]);
  check('owner can delete a store', (await q(`select 1 from brands where id = $1`, [arqStore.id])).length === 0);

  // ---------- المدربين ----------
  await as(U.E, `select admin_assign_partner('coach', null, 'ahmed')`);
  check('owner can make an account a verified coach', (await q(`select c.status, p.is_coach from coach_profiles c join profiles p on p.id = c.user_id where c.user_id = $1`, [U.A]))[0]?.status === 'approved');
  await as(U.E, `select admin_partner_action('coach', $1, 'hide', 'تحت المراجعة')`, [U.A]);
  check('suspended coach loses the badge', (await q(`select is_coach from profiles where id = $1`, [U.A]))[0].is_coach === false);
  await as(U.E, `update coach_profiles set headline = 'مدرب قوة' where user_id = $1`, [U.A]);
  check('owner can edit a coach page', (await q(`select headline from coach_profiles where user_id = $1`, [U.A]))[0].headline === 'مدرب قوة');
  await as(U.E, `select admin_partner_action('coach', $1, 'delete')`, [U.A]);
  check('owner can remove a coach page', (await q(`select 1 from coach_profiles where user_id = $1`, [U.A])).length === 0);
  check('coach list works', Array.isArray(await as(U.E, `select * from admin_partner_list('coach')`)));

  // ---------- المراكز ----------
  const center = (await q(`select id from recovery_centers where listed_by = 'arq' order by name limit 1`))[0].id;
  await as(U.E, `select admin_partner_action('center', $1, 'hide')`, [center]);
  check('owner can hide a center', (await as(U.B, `select 1 from recovery_centers where id = $1`, [center])).length === 0);
  await as(U.E, `select admin_partner_action('center', $1, 'show')`, [center]);
  await as(U.E, `select admin_assign_partner('center', $1, 'sara')`, [center]);
  const cc = (await q(`select owner, listed_by, status from recovery_centers where id = $1`, [center]))[0];
  check('assigning a listed center turns it into a partner', cc.owner === U.B && cc.listed_by === 'owner' && cc.status === 'approved');
  check('center owner can edit it now', (await as(U.B, `update recovery_centers set description = 'تأهيل رياضي' where id = $1 returning 1`, [center])).length === 1);
  await as(U.E, `select admin_partner_action('center', $1, 'hide', 'تحديث بيانات')`, [center]);
  check('suspended center owner notified', (await q(`select count(*)::int n from notifications where user_id = $1 and data->>'title_ar' = 'انوقف ظهور مركزك'`, [U.B]))[0].n === 1);
  const [ac] = await as(U.E, `insert into recovery_centers (owner, listed_by, status, name, kind, cities) values (null, 'arq', 'approved', 'مركز جديد', 'physio', array['جدة']) returning id, status`);
  check('owner can add a center page', ac.status === 'approved');
  await as(U.E, `select admin_partner_action('center', $1, 'delete')`, [ac.id]);
  check('owner can delete a center', (await q(`select 1 from recovery_centers where id = $1`, [ac.id])).length === 0);


  // ---------- لوحة تحكم المتجر: كميات، عروض وأكواد وتقرير، تنبيهات ----------
  const [prod] = await as(U.A, `insert into brand_products (brand_id, name, price_sar, stock) values ($1, 'بار بروتين', 12, 40) returning id, stock`, [st.id]);
  check('store sets stock quantities', prod.stock === 40);
  await as(U.A, `update brand_products set stock = 0, price_sar = 10 where id = $1`, [prod.id]);
  check('store updates price and marks sold out', (await q(`select stock, price_sar from brand_products where id = $1`, [prod.id]))[0].stock === 0);
  await expectErr('others cannot change a store price', async () => { const r = await as(U.B, `update brand_products set price_sar = 1 where id = $1 returning 1`, [prod.id]); if (!r.length) throw new Error('blocked'); }, /blocked/);
  const [off] = await as(U.A, `insert into brand_offers (brand_id, title, code, percent) values ($1, 'خصم ٢٠٪ لمستخدمي أرك', 'ARQ20', 20) returning id`, [st.id]);
  check('store adds an offer with a code', !!off.id);
  check('live offer visible to users', (await as(U.B, `select 1 from brand_offers where id = $1`, [off.id])).length === 1);
  await expectErr('others cannot add offers to a store', () => as(U.B, `insert into brand_offers (brand_id, title) values ($1, 'fake offer')`, [st.id]), /row-level security/);
  await as(U.B, `select offer_event($1, 'view')`, [off.id]);
  const code = (await as(U.B, `select offer_event($1, 'reveal') c`, [off.id]))[0].c;
  check('revealing returns the code', code === 'ARQ20');
  await as(U.B, `select offer_event($1, 'reveal')`, [off.id]);
  await as(U.C, `select offer_event($1, 'view')`, [off.id]);
  const stt = (await as(U.A, `select * from brand_offer_stats($1)`, [st.id]))[0];
  check('offer report counts people, once per day', stt.views === 2 && stt.reveals === 1, JSON.stringify(stt));
  check('others cannot read the report', (await as(U.B, `select * from brand_offer_stats($1)`, [st.id])).length === 0);
  check('users cannot read raw offer events', (await as(U.B, `select 1 from brand_offer_events`)).length === 0);
  await as(U.B, `insert into brand_followers (brand_id, user_id) values ($1, $2)`, [st.id, U.B]);
  await expectErr('nobody can subscribe someone else to a store', () => as(U.B, `insert into brand_followers (brand_id, user_id) values ($1, $2)`, [st.id, U.C]), /row-level security/);
  check('store sees how many are linked, not who', (await as(U.A, `select * from store_audience($1)`, [st.id]))[0].followers === 1);
  const n1 = (await as(U.A, `select send_store_announcement($1, 'وصل مخزون جديد', 'بار البروتين رجع متوفر') n`, [st.id]))[0].n;
  check('announcement reaches only subscribed customers', n1 === 1, String(n1));
  check('subscriber got it as an offer notification', (await q(`select count(*)::int n from notifications where user_id = $1 and kind = 'promo'`, [U.B]))[0].n === 1);
  check('someone who only looked at an offer gets nothing', (await q(`select count(*)::int n from notifications where user_id = $1 and kind = 'promo'`, [U.C]))[0].n === 0);
  await expectErr('one announcement per day', () => as(U.A, `select send_store_announcement($1, 'ثانية', 'رسالة ثانية')`, [st.id]), /rate_limited/);
  await expectErr('others cannot announce for a store', () => as(U.B, `select send_store_announcement($1, 'fake', 'fake body')`, [st.id]), /not_allowed/);
  await as(U.A, `update brand_offers set active = false where id = $1`, [off.id]);
  await expectErr('ended offer cannot be revealed', () => as(U.C, `select offer_event($1, 'reveal')`, [off.id]), /code_ended/);

  // ---------- عرض مركز الاستشفاء ----------
  await as(U.B, `update recovery_centers set offer_text = 'جلسة تقييم مجانية لمستخدمي أرك', offer_code = 'ARQ-FREE' where id = $1`, [center]);
  check('center owner sets an offer for ARQ users', (await q(`select offer_code from recovery_centers where id = $1`, [center]))[0].offer_code === 'ARQ-FREE');


  // ---------- مواعيد المركز: الرابط الوحيد اللي يسمح للمركز يرسل تنبيه ----------
  const unowned = (await q(`select id from recovery_centers where owner is null and status = 'approved' limit 1`))[0].id;
  await expectErr('no appointments with a center that has no owner', () => as(U.A, `select request_center_appointment($1, 'الأحد العصر')`, [unowned]), /kind_not_available/);
  await as(U.E, `select admin_partner_action('center', $1, 'show')`, [center]);
  const notice0 = (await as(U.B, `select send_center_notice($1, 'تنبيه', 'ما فيه أحد مرتبط') n`, [center]))[0].n;
  check('center without appointments reaches nobody', notice0 === 0);
  await q(`delete from center_notices`);
  const [{ request_center_appointment: ap }] = await as(U.A, `select request_center_appointment($1, 'الأحد العصر', 'ألم أسفل الظهر')`, [center]);
  check('center notified about the appointment request', (await notes(U.B, '/recovery/manage')) === 1);
  await expectErr('one open request per center', () => as(U.A, `select request_center_appointment($1, 'الإثنين')`, [center]), /request_pending/);
  check('center sees who asked', (await as(U.B, `select name from center_appointment_list($1)`, [center]))[0].name === 'Ahmed');
  check('others cannot see the appointments', (await as(U.C, `select * from center_appointment_list($1)`, [center])).length === 0);
  await expectErr('others cannot confirm', () => as(U.C, `select respond_center_appointment($1, true, now() + interval '1 day')`, [ap]), /not_allowed/);
  await expectErr('confirming needs a future time', () => as(U.B, `select respond_center_appointment($1, true, now() - interval '1 hour')`, [ap]), /bad_date/);
  await as(U.B, `select respond_center_appointment($1, true, now() + interval '2 hours', 'تعال قبل ١٠ دقائق')`, [ap]);
  check('trainee told the time', (await notes(U.A, '/recovery/appointments')) === 1);
  const rem = (await q(`select run_partner_reminders(now()) n`))[0].n;
  check('reminder two hours before', rem === 1, String(rem));
  const reached = (await as(U.B, `select send_center_notice($1, 'تغيير الدوام', 'نفتح الساعة ٤ العصر بكرة') n`, [center]))[0].n;
  check('center notice reaches only people with an appointment', reached === 1, String(reached));
  await expectErr('one center notice per day', () => as(U.B, `select send_center_notice($1, 'ثانية', 'رسالة ثانية')`, [center]), /rate_limited/);
  await expectErr('trainee cannot mark done', () => as(U.A, `select close_center_appointment($1, 'done')`, [ap]), /bad_status/);
  await as(U.A, `select close_center_appointment($1, 'cancelled')`, [ap]);
  check('center told about the cancellation', (await notes(U.B, '/recovery/manage')) === 2);


  // ---------- عروض النادي: تنبيه للمرتبطين فقط ----------
  await q(`update profiles set gym_id = $1 where id = $2`, [gym.id, U.B]);
  await q(`delete from notifications where kind = 'gym_offer'`);
  await visit(U.C, gym.id);
  await as(U.E, `insert into gym_offers (gym_id, title, price_sar, months) values ($1, 'عرض الأعضاء', 199, 1)`, [gym.id]);
  const go = async (u) => (await q(`select count(*)::int n from notifications where user_id = $1 and kind = 'gym_offer'`, [u]))[0].n;
  check('gym offer reaches people who chose the club', (await go(U.B)) === 1);
  check('a one-time visitor with no membership gets nothing', (await go(U.C)) === 0);

  // ---------- السجل ----------
  const log = await as(U.E, `select kind, action from admin_log`);
  check('every owner action is logged', log.length >= 10 && log.some((r) => r.action === 'assign') && log.some((r) => r.action === 'delete'), String(log.length));
  check('others cannot read the log', (await as(U.A, `select 1 from admin_log`)).length === 0);
})();
