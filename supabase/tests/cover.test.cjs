// اختبارات خلفية الحساب: اللون من القائمة فقط، الصورة من مجلد صاحب الحساب فقط، وما أحد يغيّر خلفية غيره
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U } = await setup();

  check('default follows the app theme', (await q(`select cover, cover_url from profiles where id = $1`, [U.A]))[0].cover === 'auto');
  await as(U.A, `update profiles set cover = 'lavender' where id = $1`, [U.A]);
  check('user picks a colour', (await q(`select cover from profiles where id = $1`, [U.A]))[0].cover === 'lavender');
  await expectErr('unknown colour rejected', () => as(U.A, `update profiles set cover = 'pink' where id = $1`, [U.A]), /check constraint/);

  await as(U.A, `update profiles set cover_url = $2 where id = $1`, [U.A, `${U.A}/1700000000-abc.jpg`]);
  check('photo from own folder saved', (await as(U.B, `select cover_url from profiles where id = $1`, [U.A]))[0].cover_url === `${U.A}/1700000000-abc.jpg`);
  await expectErr('photo from someone else\'s folder rejected', () => as(U.A, `update profiles set cover_url = $2 where id = $1`, [U.A, `${U.B}/x.jpg`]), /check constraint/);
  await expectErr('path tricks rejected', () => as(U.A, `update profiles set cover_url = $2 where id = $1`, [U.A, `${U.A}/../${U.B}/x.jpg`]), /check constraint/);

  const r = await as(U.B, `update profiles set cover = 'night' where id = $1 returning 1`, [U.A]);
  check('cannot change another user\'s cover', r.length === 0 && (await q(`select cover from profiles where id = $1`, [U.A]))[0].cover === 'lavender');
  await expectErr('points still locked', () => as(U.A, `update profiles set points = 9999 where id = $1`, [U.A]), /permission denied/);
})();
