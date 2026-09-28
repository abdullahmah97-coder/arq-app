// اختبارات بطاقة Wallet: رابط التنزيل، إصدار البطاقة (للسيرفر فقط)، تجديد الرمز، الدخول بالباركود، منع مشاركة البطاقة بالبوابة
const { setup } = require('./_harness.cjs');

(async () => {
  const { db, q, as, check, expectErr, U, gym } = await setup();
  await db.exec(`grant usage on schema public to service_role;`);
  const asService = async (sql, params) => {
    await db.exec(`reset role; set role service_role;`);
    try { return await q(sql, params); } finally { await db.exec(`reset role;`); }
  };

  // اشتراك ساري لأحمد (A) في النادي + موظف استقبال (C)
  await as(U.D, `select add_gym_staff($1, 'khalid')`, [gym.id]);
  await as(U.D, `select * from upsert_membership(null, $1, null, 'ahmed', null, null, 'membership', 'شهري', app_today(), app_today()+29, 300, null)`, [gym.id]);

  // الرابط
  await expectErr('anon cannot get a link', () => as(null, `select * from wallet_link()`), /permission denied|not_authenticated/);
  const link = (await as(U.A, `select * from wallet_link()`))[0];
  check('link token issued', /^[0-9a-f]{64}$/.test(link.token));
  check('links not readable directly', (await as(U.A, `select * from wallet_links`)).length === 0);
  await expectErr('member cannot issue a pass directly', () => as(U.A, `select * from wallet_issue($1)`, [link.token]), /permission denied/);
  await expectErr('anon cannot issue a pass', () => as(null, `select * from wallet_issue($1)`, [link.token]), /permission denied/);

  // الإصدار (السيرفر)
  const p1 = (await asService(`select * from wallet_issue($1)`, [link.token]))[0];
  check('pass issued with code + name + membership + location', /^w_[0-9a-f]{40}$/.test(p1.code) && p1.user_id === U.A && p1.member_name === 'Ahmed'
    && p1.memberships.length === 1 && p1.memberships[0].plan === 'شهري' && p1.locations.length >= 1, JSON.stringify(p1).slice(0, 300));
  await expectErr('link works once', () => asService(`select * from wallet_issue($1)`, [link.token]), /code_used/);
  await expectErr('bad link', () => asService(`select * from wallet_issue('nope')`), /code_not_found/);
  const l2 = (await as(U.A, `select * from wallet_link()`))[0];
  await q(`update wallet_links set expires_at = now() - interval '1 second' where token_hash = _hash($1)`, [l2.token]);
  await expectErr('expired link', () => asService(`select * from wallet_issue($1)`, [l2.token]), /code_expired/);
  check('only the hash is stored', (await q(`select count(*)::int n from wallet_passes where code_hash = _hash($1) and code_hash <> $1`, [p1.code]))[0].n === 1);
  check('my_wallet_pass shows hint', (await as(U.A, `select * from my_wallet_pass()`))[0].code_hint === p1.code.slice(-4));
  check('others see nothing', (await as(U.B, `select * from my_wallet_pass()`))[0].has_pass === false);

  // الدخول بالباركود عند الاستقبال (يتكرر عادي)
  const v1 = (await as(U.C, `select * from verify_entry($1, $2)`, ['arq://entry/' + p1.code, gym.id]))[0];
  check('reception accepts wallet barcode', v1.allowed === true && v1.reason === 'ok' && v1.member_name === 'Ahmed' && v1.check_in_id, JSON.stringify(v1));
  const v2 = (await as(U.C, `select * from verify_entry($1, $2)`, [p1.code, gym.id]))[0];
  check('wallet barcode is reusable at reception (already_in flagged)', v2.allowed === true && v2.already_in === true);
  check('last_used_at updated', (await as(U.A, `select * from my_wallet_pass()`))[0].last_used_at != null);

  // البوابة: دخول ثاني خلال ٣ ساعات مرفوض
  const gate = (await as(U.D, `select * from create_gate($1, 'بوابة')`, [gym.id]))[0];
  const g1 = (await as(null, `select * from gate_verify($1, $2)`, [gate.api_key, p1.code]))[0];
  check('gate blocks a second wallet entry within 3h', g1.allowed === false && g1.reason === 'recent_entry', JSON.stringify(g1));
  await q(`update entry_log set created_at = now() - interval '4 hours' where user_id = $1`, [U.A]);
  const g2 = (await as(null, `select * from gate_verify($1, $2)`, [gate.api_key, p1.code]))[0];
  check('gate opens after 3h', g2.allowed === true && g2.first_name === 'Ahmed', JSON.stringify(g2));

  // اللون: الافتراضي النخيل، والعضو يختار (ويتذكره)
  check('default theme palm', p1.theme === 'palm' && (await as(U.A, `select * from my_wallet_pass()`))[0].theme === 'palm');
  const lt = (await as(U.A, `select * from wallet_link('lavender')`))[0];
  const pt = (await asService(`select * from wallet_issue($1)`, [lt.token]))[0];
  check('lavender theme chosen', pt.theme === 'lavender' && (await as(U.A, `select * from my_wallet_pass()`))[0].theme === 'lavender');
  const lr = (await as(U.A, `select * from wallet_link()`))[0];
  const pr = (await asService(`select * from wallet_issue($1)`, [lr.token]))[0];
  check('theme remembered when not given', pr.theme === 'lavender');
  const lx = (await as(U.A, `select * from wallet_link('neon')`))[0];
  const px = (await asService(`select * from wallet_issue($1)`, [lx.token]))[0];
  check('unknown theme falls back to palm', px.theme === 'palm');
  await q(`delete from wallet_links`);

  // تنزيل بطاقة جديدة يلغي القديمة
  const l3 = (await as(U.A, `select * from wallet_link()`))[0];
  const p2 = (await asService(`select * from wallet_issue($1)`, [l3.token]))[0];
  check('same serial, new code', p2.serial === p1.serial && p2.code !== p1.code && p2.theme === 'palm');
  const old = (await as(U.C, `select * from verify_entry($1, $2)`, [p1.code, gym.id]))[0];
  check('old barcode stops working', old.allowed === false && old.reason === 'code_not_found');

  // بدون اشتراك
  const lb = (await as(U.B, `select * from wallet_link()`))[0];
  const pb = (await asService(`select * from wallet_issue($1)`, [lb.token]))[0];
  const vb = (await as(U.C, `select * from verify_entry($1, $2)`, [pb.code, gym.id]))[0];
  check('pass without membership is denied', vb.allowed === false && vb.reason === 'no_membership' && pb.memberships.length === 0);

  // الإيقاف
  await as(U.A, `select revoke_wallet_pass()`);
  const vr = (await as(U.C, `select * from verify_entry($1, $2)`, [p2.code, gym.id]))[0];
  check('revoked pass is denied', vr.allowed === false && vr.reason === 'code_not_found');

  // الرمز المتجدد في التطبيق ما زال يشتغل
  const tok = (await as(U.A, `select * from entry_token()`))[0];
  const vt = (await as(U.C, `select * from verify_entry($1, $2)`, [tok.code, gym.id]))[0];
  check('rotating app code still works', vt.allowed === true);

  // rate limit
  for (let i = 0; i < 4; i++) await as(U.E, `select * from wallet_link()`);
  await as(U.E, `select * from wallet_link()`);
  await expectErr('link rate limit', () => as(U.E, `select * from wallet_link()`), /too_many_requests/);
})();
