// اختبارات تشغيل النادي: الاشتراكات، الاستقبال، QR، البوابة، الاستيراد، الطلبات، الحصص، التنبيهات
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U, gym } = await setup();
  const other = (await q(`select * from gyms where verified and id <> $1 order by name limit 1`, [gym.id]))[0];
  const today = (await q(`select app_today() d`))[0].d;

  // ---------- staff ----------
  await expectErr('stranger cannot add staff', () => as(U.A, `select add_gym_staff($1, 'khalid')`, [gym.id]), /not_allowed/);
  await as(U.D, `select add_gym_staff($1, '@khalid')`, [gym.id]);
  check('reception added', (await q(`select count(*)::int n from gym_staff where gym_id=$1 and user_id=$2`, [gym.id, U.C]))[0].n === 1);
  check('reception sees gym in my_staff_gyms', (await as(U.C, `select * from my_staff_gyms()`)).some((g) => g.gym_id === gym.id && g.role === 'reception'));
  check('manager role shown', (await as(U.D, `select * from my_staff_gyms()`)).some((g) => g.gym_id === gym.id && g.role === 'manager'));

  // ---------- memberships ----------
  await expectErr('stranger cannot create membership', () => as(U.A,
    `select upsert_membership(null, $1, null, 'ahmed', null, null, 'membership', 'شهري', app_today(), app_today()+30, 300, null)`, [gym.id]), /not_allowed/);
  await expectErr('reception cannot create membership', () => as(U.C,
    `select upsert_membership(null, $1, null, 'ahmed', null, null, 'membership', 'شهري', app_today(), app_today()+30, 300, null)`, [gym.id]), /not_allowed/);
  const m1 = (await as(U.D, `select * from upsert_membership(null, $1, null, 'ahmed', null, null, 'membership', 'شهري', app_today(), app_today()+29, 300, null)`, [gym.id]))[0];
  check('manager creates membership for user', m1.user_id === U.A && m1.claim_code === null);
  const mine = await as(U.A, `select * from my_memberships()`);
  check('member sees own membership active with 30 days', mine.length === 1 && mine[0].state === 'active' && mine[0].days_left === 30, JSON.stringify(mine[0]));
  check('stranger cannot read memberships', (await as(U.B, `select * from memberships`)).length === 0);
  check('reception can read gym memberships', (await as(U.C, `select * from memberships`)).length === 1);
  await as(U.C, `update memberships set price_sar = 1 where id = $1`, [m1.id]);
  check('reception cannot edit price', Number((await q(`select price_sar from memberships where id=$1`, [m1.id]))[0].price_sar) === 300);
  check('member got a notice', (await q(`select count(*)::int n from notifications where user_id=$1 and kind='notice'`, [U.A]))[0].n === 1);

  // pending (no account) → claim code
  const m2 = (await as(U.D, `select * from upsert_membership(null, $1, null, null, 'سارة', '0500000000', 'membership', 'ربع سنوي', app_today(), app_today()+90, 800, null)`, [gym.id]))[0];
  check('pending membership has claim code', /^[A-Z0-9]{8}$/.test(m2.claim_code));
  await expectErr('wrong claim code', () => as(U.B, `select claim_membership('ZZZZZZZZ')`), /code_not_found/);
  await as(U.B, `select claim_membership($1)`, [m2.claim_code.toLowerCase()]);
  check('claim links membership', (await q(`select user_id, claim_code from memberships where id=$1`, [m2.id]))[0].user_id === U.B);
  await expectErr('claim code single use', () => as(U.C, `select claim_membership($1)`, [m2.claim_code]), /code_not_found/);

  // import
  const imp = await as(U.D, `select * from import_memberships($1, null, $2::jsonb)`, [gym.id, JSON.stringify([
    { name: 'فهد', contact: '0555', plan: 'سنوي', start: today, end: '2027-12-31', price: '2000' },
    { name: 'خطأ', plan: 'x', start: 'bad-date', end: '2027-01-01' },
  ])]);
  check('import: good row gets code, bad row gets error', imp.length === 2 && imp[0].claim_code && !imp[0].error && imp[1].error && !imp[1].claim_code, JSON.stringify(imp));

  // ---------- QR entry ----------
  const tok = (await as(U.A, `select * from entry_token()`))[0];
  check('token + 6-digit code issued', tok.token.length >= 32 && /^\d{6}$/.test(tok.code));
  check('tokens not readable directly', (await as(U.A, `select * from entry_tokens`)).length === 0);
  await expectErr('stranger cannot verify', () => as(U.B, `select * from verify_entry($1, $2)`, [tok.token, gym.id]), /not_allowed/);
  const v1 = (await as(U.C, `select * from verify_entry($1, $2)`, ['arq://entry/' + tok.token, gym.id]))[0];
  check('reception verifies active member (deep link form)', v1.allowed === true && v1.reason === 'ok' && v1.days_left === 30 && v1.member_name === 'Ahmed', JSON.stringify(v1));
  const ci = (await q(`select * from check_ins where id=$1`, [v1.check_in_id]))[0];
  check('QR check-in recorded with points', ci.method === 'qr' && ci.points_awarded === 10, JSON.stringify(ci));
  const v2 = (await as(U.C, `select * from verify_entry($1, $2)`, [tok.token, gym.id]))[0];
  check('token single use', v2.allowed === false && v2.reason === 'code_used');
  const tok2 = (await as(U.A, `select * from entry_token()`))[0];
  const v3 = (await as(U.C, `select * from verify_entry($1, $2)`, [tok2.code, gym.id]))[0];
  check('6-digit code works, already inside keeps one visit', v3.allowed === true && v3.already_in === true && v3.check_in_id === v1.check_in_id);
  await q(`update entry_tokens set expires_at = now() - interval '1 second' where used_at is null`);
  const tok3 = (await as(U.A, `select * from entry_token()`))[0];
  await q(`update entry_tokens set expires_at = now() - interval '1 second' where code = $1`, [tok3.code]);
  check('expired code rejected', (await as(U.C, `select * from verify_entry($1, $2)`, [tok3.token, gym.id]))[0].reason === 'code_expired');
  // wrong gym
  await q(`insert into gym_managers (gym_id, user_id) values ($1, $2)`, [other.id, U.D]);
  const tok4 = (await as(U.A, `select * from entry_token()`))[0];
  const v4 = (await as(U.D, `select * from verify_entry($1, $2)`, [tok4.token, other.id]))[0];
  check('membership at another gym → wrong_gym', v4.allowed === false && v4.reason === 'wrong_gym', JSON.stringify(v4));
  // no membership
  const tokE = (await as(U.E, `select * from entry_token()`))[0];
  check('no membership → rejected', (await as(U.C, `select * from verify_entry($1, $2)`, [tokE.token, gym.id]))[0].reason === 'no_membership');
  // expired membership
  await q(`update memberships set starts_on = app_today()-60, ends_on = app_today()-1 where id=$1`, [m2.id]);
  const tokB = (await as(U.B, `select * from entry_token()`))[0];
  const vB = (await as(U.C, `select * from verify_entry($1, $2)`, [tokB.token, gym.id]))[0];
  check('expired membership rejected', vB.allowed === false && vB.reason === 'expired' && vB.days_left === 0);
  check('entry log readable by staff', (await as(U.C, `select * from entry_log`)).length >= 5);

  // ---------- gate ----------
  await expectErr('stranger cannot create gate', () => as(U.A, `select * from create_gate($1, 'بوابة 1')`, [gym.id]), /not_allowed/);
  const gate = (await as(U.D, `select * from create_gate($1, 'بوابة 1')`, [gym.id]))[0];
  check('gate key shown once', gate.api_key.startsWith('arqg_') && (await q(`select key_hash from gym_gates where id=$1`, [gate.gate_id]))[0].key_hash !== gate.api_key);
  const bad = (await as(null, `select * from gate_verify('arqg_wrong', 'x')`))[0];
  check('gate rejects bad key (anon)', bad.allowed === false && bad.reason === 'invalid_gate');
  await q(`update check_ins set checked_out_at = now() where user_id = $1`, [U.A]);
  const tok5 = (await as(U.A, `select * from entry_token()`))[0];
  const g1 = (await as(null, `select * from gate_verify($1, $2)`, [gate.api_key, tok5.token]))[0];
  check('gate allows member, first name only', g1.allowed === true && g1.first_name === 'Ahmed' && g1.days_left === 30, JSON.stringify(g1));
  check('gate visit recorded', (await q(`select count(*)::int n from check_ins where user_id=$1 and method='gate'`, [U.A]))[0].n === 1);

  // ---------- freeze / transfer ----------
  await expectErr('cannot request on others membership', () => as(U.B, `select request_membership_change($1, 'freeze', 10, null, null, 'سفر')`, [m1.id]), /membership_not_found/);
  const rq = (await as(U.A, `select request_membership_change($1, 'freeze', 10, null, null, 'سفر') as id`, [m1.id]))[0].id;
  await expectErr('one pending request', () => as(U.A, `select request_membership_change($1, 'freeze', 5, null, null, null)`, [m1.id]), /request_pending/);
  await expectErr('reception cannot decide', () => as(U.C, `select decide_membership_request($1, true, null)`, [rq]), /not_allowed/);
  await as(U.D, `select decide_membership_request($1, true, 'تمام، سفر موفق')`, [rq]);
  const mf = (await as(U.A, `select * from my_memberships()`)).find((m) => m.id === m1.id);
  check('approved freeze extends end and freezes now', mf.state === 'frozen' && mf.days_left === 40, JSON.stringify(mf));
  const tok6 = (await as(U.A, `select * from entry_token()`))[0];
  check('frozen membership rejected at door', (await as(U.C, `select * from verify_entry($1, $2)`, [tok6.token, gym.id]))[0].reason === 'frozen');
  await expectErr('transfer only inside same chain', () => as(U.A, `select request_membership_change($1, 'transfer', null, null, $2, null)`, [m1.id, other.id]), /transfer_same_chain_only/);

  // ---------- feedback ----------
  await as(U.A, `insert into gym_feedback (gym_id, category, body) values ($1, 'complaint', 'المكيف خربان في صالة الحديد')`, [gym.id]);
  await expectErr('cannot insert feedback with reply', () => as(U.A, `insert into gym_feedback (gym_id, category, body, reply) values ($1, 'praise', 'ممتاز', 'x')`, [gym.id]), /row-level security/);
  const fb = (await as(U.C, `select * from gym_feedback`))[0];
  await as(U.C, `select reply_gym_feedback($1, 'resolved', 'انصلح اليوم، شكراً لك')`, [fb.id]);
  const fbA = (await as(U.A, `select * from gym_feedback`))[0];
  check('member sees reply + status', fbA.status === 'resolved' && fbA.reply.startsWith('انصلح'));
  check('other members cannot see feedback', (await as(U.B, `select * from gym_feedback`)).length === 0);

  // ---------- referrals ----------
  const code = (await as(U.A, `select my_referral_code($1) c`, [gym.id]))[0].c;
  check('referral code stable', code === (await as(U.A, `select my_referral_code($1) c`, [gym.id]))[0].c && /^[A-Z0-9]{6}$/.test(code));
  await as(U.D, `insert into gym_settings (gym_id, referral_reward) values ($1, 'أسبوع مجاني لك ولصاحبك')`, [gym.id]);
  await as(U.D, `select * from upsert_membership(null, $1, null, 'admin1', null, null, 'membership', 'شهري', app_today(), app_today()+29, 300, null, $2)`, [gym.id, code]);
  const ref = (await as(U.A, `select * from my_referrals($1)`, [gym.id]))[0];
  check('referral counted with reward text', ref.joined === 1 && ref.reward.startsWith('أسبوع'));

  // ---------- broadcast + win-back ----------
  await expectErr('stranger cannot broadcast', () => as(U.A, `select send_gym_broadcast($1, null, 'صيانة', 'المسبح مقفل بكرة')`, [gym.id]), /not_allowed/);
  const n1 = (await as(U.D, `select send_gym_broadcast($1, null, 'صيانة', 'المسبح مقفل بكرة للصيانة') n`, [gym.id]))[0].n;
  check('broadcast reaches active members', n1 >= 2, `n=${n1}`);
  await as(U.D, `select send_gym_broadcast($1, null, 'تذكير', 'تغيير أوقات الجمعة')`, [gym.id]);
  await expectErr('broadcast rate limited (2/day)', () => as(U.D, `select send_gym_broadcast($1, null, 'ثالث', 'رسالة ثالثة اليوم')`, [gym.id]), /rate_limited/);
  const inactive = await as(U.D, `select * from gym_members($1, 'inactive')`, [gym.id]);
  check('inactive list has members without recent visits', inactive.some((r) => r.user_id === U.E), JSON.stringify(inactive.map((r) => r.username)));
  const nw = (await as(U.D, `select nudge_inactive_members($1) n`, [gym.id]))[0].n;
  check('win-back nudges sent', nw >= 1);
  await expectErr('win-back once a day', () => as(U.D, `select nudge_inactive_members($1)`, [gym.id]), /rate_limited/);
  check('reception cannot see members of other gym', (await as(U.C, `select * from gym_members($1, 'all')`, [other.id])).length === 0);

  // ---------- classes ----------
  const dow = (await q(`select extract(dow from app_today() + 1)::int d`))[0].d;
  const cls = (await as(U.D, `insert into gym_classes (gym_id, name, weekday, start_time, capacity) values ($1, 'سبينينق', $2, '20:00', 1) returning id`, [gym.id, dow]))[0];
  const sched = await as(U.A, `select * from class_schedule($1, 7)`, [gym.id]);
  check('schedule shows next occurrence', sched.length === 1 && sched[0].booked === 0);
  const date = sched[0].class_date;
  await q(`update memberships set status='active', frozen_from=null, frozen_until=null where id=$1`, [m1.id]);
  check('member books', (await as(U.A, `select book_class($1, $2) s`, [cls.id, date]))[0].s === 'booked');
  await expectErr('non-member blocked from members-only class', () => as(U.C, `select book_class($1, $2)`, [cls.id, date]), /members_only/);
  check('second member waitlisted (capacity 1)', (await as(U.E, `select book_class($1, $2) s`, [cls.id, date]))[0].s === 'waitlist');
  await expectErr('cannot double book', () => as(U.A, `select book_class($1, $2)`, [cls.id, date]), /already_booked/);
  const bk = (await as(U.A, `select id from class_bookings where user_id = $1`, [U.A]))[0];
  await as(U.A, `select cancel_class_booking($1)`, [bk.id]);
  check('waitlist promoted on cancel', (await q(`select status from class_bookings where user_id=$1`, [U.E]))[0].status === 'booked');
  check('promotion notice sent', (await q(`select count(*)::int n from notifications where user_id=$1 and data->>'key' like 'cls_up:%'`, [U.E]))[0].n === 1);

  // ---------- reminders ----------
  await q(`update memberships set ends_on = app_today() + 7 where id = $1`, [m1.id]);
  const noon = (await q(`select (app_today() + time '12:00') at time zone 'Asia/Riyadh' t`))[0].t;
  const sent = (await q(`select run_gym_reminders($1) n`, [noon]))[0].n;
  const again = (await q(`select run_gym_reminders($1) n`, [noon]))[0].n;
  check('renewal reminder sent once', sent >= 1 && again === 0, `sent=${sent} again=${again}`);
  const night = (await q(`select (app_today() + time '03:00') at time zone 'Asia/Riyadh' t`))[0].t;
  await q(`delete from notifications where data->>'key' like 'renew%'`);
  check('no renewal reminders at night', (await q(`select run_gym_reminders($1) n`, [night]))[0].n === 0);
})();
