// موافقة سياسة تسجيل الشركاء: الشريك يسجّل موافقته بنفسه، وصاحبها ووقتها من القاعدة، وما تنعدّل ولا تنحذف
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U } = await setup();
  const rows = async (uid) => (await q(`select user_id, kind, version, accepted_at from partner_terms where user_id = $1 order by id`, [uid]));

  // ---------- الإضافة ----------
  await as(U.A, `insert into partner_terms (kind, version) values ('store', '1.0')`);
  let r = await rows(U.A);
  check('a partner records accepting the policy', r.length === 1 && r[0].kind === 'store' && r[0].version === '1.0', JSON.stringify(r));
  check('…stamped with the time of acceptance', Math.abs(new Date(r[0].accepted_at) - Date.now()) < 60_000);

  await as(U.A, `insert into partner_terms (user_id, kind, version, accepted_at) values ($1, 'venue', '1.0', '2020-01-01')`, [U.B]);
  r = await rows(U.A);
  check('can’t record it for someone else (it becomes your own)', r.length === 2 && r[1].kind === 'venue' && (await rows(U.B)).length === 0, JSON.stringify(r));
  check('can’t backdate it', new Date(r[1].accepted_at).getFullYear() >= 2026, String(r[1].accepted_at));

  await expectErr('accepting the same version twice for the same kind is one record', () => as(U.A, `insert into partner_terms (kind, version) values ('store', '1.0')`), /duplicate key|unique/);
  await as(U.A, `insert into partner_terms (kind, version) values ('store', '1.1')`);
  check('a new policy version is a new acceptance', (await rows(U.A)).length === 3);
  await expectErr('unknown partner kind', () => as(U.A, `insert into partner_terms (kind, version) values ('coach', '1.0')`), /check constraint/);
  await expectErr('version must look like 1.0', () => as(U.A, `insert into partner_terms (kind, version) values ('club', 'latest')`), /check constraint/);
  await expectErr('signed-out visitors can’t add anything', () => as(null, `insert into partner_terms (kind, version) values ('club', '1.0')`), /permission denied|violates|null value/);

  // ---------- مين يشوفها ----------
  check('you see your own acceptances', (await as(U.A, `select count(*)::int as n from partner_terms`))[0].n === 3);
  check('other users see none of them', (await as(U.B, `select count(*)::int as n from partner_terms`))[0].n === 0);
  check('the app owner sees them all', (await as(U.E, `select count(*)::int as n from partner_terms`))[0].n === 3);

  // ---------- ما تنعدّل ولا تنحذف ----------
  const before = JSON.stringify(await rows(U.A));
  try { await as(U.A, `update partner_terms set version = '9.9' where user_id = $1`, [U.A]); } catch { /* محجوب */ }
  try { await as(U.A, `delete from partner_terms where user_id = $1`, [U.A]); } catch { /* محجوب */ }
  check('the partner can’t edit or delete an acceptance', JSON.stringify(await rows(U.A)) === before);

  // ---------- حذف الحساب يحذفها ----------
  await q(`delete from auth.users where id = $1`, [U.A]);
  check('deleting the account removes its acceptances', (await q(`select count(*)::int as n from partner_terms`))[0].n === 0);
})();
