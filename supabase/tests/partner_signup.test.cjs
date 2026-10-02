// التسجيل كشريك: اختيار «نادي» ما يخلّيك نادي (يبقى متدرب لين يوافق المالك)، وطلب النادي يحتاج السجل التجاري والرخصة وصورهم
const fs = require('fs');
const path = require('path');
const { setup } = require('./_harness.cjs');

(async () => {
  const { db, q, as, check, expectErr, U } = await setup();
  const prof = async (uid) => (await q(`select account_type, partner_intent from profiles where id = $1`, [uid]))[0];
  const adminNotes = async () => (await q(`select data from notifications where user_id = $1 and data->>'url' = '/owner' order by id`, [U.E])).map((r) => r.data);

  // ---------- اختيار نوع الحساب ----------
  await as(U.A, `update profiles set account_type = 'club', onboarded = true where id = $1`, [U.A]);
  let p = await prof(U.A);
  check('picking «club» keeps the account a trainee', p.account_type === 'trainee' && p.partner_intent === 'club', JSON.stringify(p));
  check('…but onboarding still finishes', (await q(`select onboarded from profiles where id = $1`, [U.A]))[0].onboarded === true);
  let n = await adminNotes();
  check('the owner is told someone wants to be a club', n.length === 1 && /اختار «نادي رياضي»/.test(n[0].body_ar) && /Ahmed/.test(n[0].body_ar) && /gym/.test(n[0].body_en), JSON.stringify(n[0]));
  await as(U.A, `update profiles set account_type = 'club' where id = $1`, [U.A]);
  check('picking it again doesn’t notify twice', (await adminNotes()).length === 1);
  await as(U.A, `update profiles set account_type = 'restaurant' where id = $1`, [U.A]);
  p = await prof(U.A);
  check('a restaurant is a store wish', p.account_type === 'trainee' && p.partner_intent === 'store' && (await adminNotes()).length === 2);
  await as(U.A, `update profiles set account_type = 'trainee' where id = $1`, [U.A]);
  p = await prof(U.A);
  check('going back to trainee clears the wish', p.account_type === 'trainee' && p.partner_intent === null);
  await expectErr('unknown types still rejected', () => as(U.A, `update profiles set account_type = 'boss' where id = $1`, [U.A]), /check constraint/);
  await expectErr('nobody can write the wish directly', () => as(U.A, `update profiles set partner_intent = 'club' where id = $1`, [U.A]), /permission denied/);
  await as(U.E, `update profiles set account_type = 'coach' where id = $1`, [U.E]);
  check('the owner can change account types himself', (await prof(U.E)).account_type === 'coach');
  await q(`update profiles set account_type = 'trainee' where id = $1`, [U.E]);

  // ---------- طلب انضمام النادي: السجل التجاري والرخصة وصورهم ----------
  await as(U.B, `update profiles set account_type = 'club' where id = $1`, [U.B]);
  const up = (uid, name) => q(`insert into storage.objects (bucket_id, name, owner) values ('partner_docs', $1, $2)`, [`${uid}/${name}`, uid]);
  await up(U.B, 'cr.jpg'); await up(U.B, 'license.jpg'); await up(U.C, 'mine.jpg');
  const ask = (args, params = []) => as(U.B, `select request_club_partner(null, null, 'نادي سارة', 'owner', ${args})`, params);
  const cr = `${U.B}/cr.jpg`, lic = `${U.B}/license.jpg`;
  await expectErr('old app (no documents) → documents required', () => ask(`'1010123456', '0551234567'`), /docs_required/);
  await expectErr('no license number', () => ask(`'1010123456', '0551234567', null, null, null, null, null, $1, $2`, [cr, lic]), /docs_required/);
  await expectErr('commercial registration must be 10 digits', () => ask(`'101012345', '0551234567', null, null, null, null, 'LIC-1', $1, $2`, [cr, lic]), /docs_required/);
  await expectErr('license photo missing', () => ask(`'1010123456', '0551234567', null, null, null, null, 'LIC-1', $1, null`, [cr]), /docs_required/);
  await expectErr('same photo for both', () => ask(`'1010123456', '0551234567', null, null, null, null, 'LIC-1', $1, $1`, [cr]), /docs_required/);
  await expectErr('someone else’s photo', () => ask(`'1010123456', '0551234567', null, null, null, null, 'LIC-1', $1, $2`, [cr, `${U.C}/mine.jpg`]), /docs_required/);
  await expectErr('a photo that was never uploaded', () => ask(`'1010123456', '0551234567', null, null, null, null, 'LIC-1', $1, $2`, [cr, `${U.B}/ghost.jpg`]), /docs_required/);
  const [{ request_club_partner: rid }] = await ask(`'1010-123-456', '0551234567', null, 'الرياض', 2, null, ' MS-2024-118 ', $1, $2`, [cr, lic]);
  const row = (await q(`select cr_number, license_number, cr_doc_path, license_doc_path, status from club_requests where id = $1`, [rid]))[0];
  check('complete request saved with the numbers and photos', row.cr_number === '1010123456' && row.license_number === 'MS-2024-118'
    && row.cr_doc_path === cr && row.license_doc_path === lic && row.status === 'pending', JSON.stringify(row));
  n = await adminNotes();
  check('the owner is notified about the request (with the documents)', /السجل التجاري ورخصة النادي/.test(n.at(-1).body_ar) && /لوحة إدارة التطبيق/.test(n.at(-1).body_ar));
  const queue = (await as(U.E, `select license_number, cr_doc_path, license_doc_path from club_request_queue() where id = $1`, [rid]))[0];
  check('owner’s queue shows the license and both photos', queue?.license_number === 'MS-2024-118' && queue.cr_doc_path === cr && queue.license_doc_path === lic);
  check('still a trainee while the request waits', (await prof(U.B)).account_type === 'trainee');
  await as(U.E, `select review_club_request($1, 'approved')`, [rid]);
  p = await prof(U.B);
  check('approved → becomes a club (and the wish is cleared)', p.account_type === 'club' && p.partner_intent === null, JSON.stringify(p));

  // ---------- قائمة المستخدمين للمالك تبيّن «يبي يصير شريك» ----------
  await as(U.C, `update profiles set account_type = 'center' where id = $1`, [U.C]);
  const listed = (await as(U.E, `select partner_intent, account_type from admin_user_list(null, 'trainee', 50, 0) where id = $1`, [U.C]))[0];
  check('owner’s user list shows the wish next to «trainee»', listed?.partner_intent === 'center' && listed.account_type === 'trainee', JSON.stringify(listed));

  // ---------- صور المستندات خاصة ----------
  await db.exec(`alter table storage.objects enable row level security; grant select, insert, delete on storage.objects to authenticated;`);
  check('I can upload into my own folder', (await as(U.C, `insert into storage.objects (bucket_id, name, owner) values ('partner_docs', $1, $2) returning 1`, [`${U.C}/cr2.jpg`, U.C])).length === 1);
  await expectErr('…not into someone else’s', () => as(U.C, `insert into storage.objects (bucket_id, name, owner) values ('partner_docs', $1, $2)`, [`${U.B}/x.jpg`, U.C]), /row-level security/);
  check('others can’t see my documents', (await as(U.A, `select 1 from storage.objects where bucket_id = 'partner_docs' and name = $1`, [cr])).length === 0);
  check('I can see mine', (await as(U.B, `select 1 from storage.objects where bucket_id = 'partner_docs' and name = $1`, [cr])).length === 1);
  check('the owner can see them', (await as(U.E, `select 1 from storage.objects where bucket_id = 'partner_docs' and name = $1`, [cr])).length === 1);
  await db.exec(`alter table storage.objects disable row level security;`);

  // ---------- الترحيل: اللي صار «نادي» بنفسه بدون أي شي يرجع متدرب، والشريك الحقيقي يبقى ----------
  await q(`update profiles set account_type = 'club', partner_intent = null where id = $1`, [U.D]); // مدير نادي (gym_managers)
  await q(`update profiles set account_type = 'club', partner_intent = null where id = $1`, [U.A]); // بدون أي طلب
  await db.exec(fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261002000860_partner_signup.sql'), 'utf8'));
  const a = await prof(U.A), d = await prof(U.D), b = await prof(U.B);
  check('self-made «club» with nothing behind it → trainee with the wish kept', a.account_type === 'trainee' && a.partner_intent === 'club', JSON.stringify(a));
  check('real partners keep their type', d.account_type === 'club' && b.account_type === 'club', JSON.stringify({ d, b }));
})();
