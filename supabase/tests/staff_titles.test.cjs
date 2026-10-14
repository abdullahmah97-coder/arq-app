// ألقاب فريق الإدارة (staff_title): يقرأها الكل، ومحد يحطها لنفسه، والمالك يحددها من القاعدة
// التشغيل: node supabase/tests/staff_titles.test.cjs
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U } = await setup();

  check('no title by default', (await q(`select staff_title from profiles where id = $1`, [U.B]))[0].staff_title === null);
  await q(`update profiles set staff_title = 'XO' where id = $1`, [U.B]);
  check('the database (owner via SQL) can set a title', (await q(`select staff_title from profiles where id = $1`, [U.B]))[0].staff_title === 'XO');
  check('everyone can read it (badge next to the name)', (await as(U.A, `select staff_title from profiles where id = $1`, [U.B]))[0]?.staff_title === 'XO');
  await expectErr('a user cannot give themselves a title', () => as(U.A, `update profiles set staff_title = 'CEO' where id = $1`, [U.A]), /permission denied|not_allowed/);
  await expectErr('…even with table-level update rights (guard)', async () => {
    await q(`grant update (staff_title) on public.profiles to authenticated`);
    try { await as(U.A, `update profiles set staff_title = 'CEO' where id = $1`, [U.A]); }
    finally { await q(`revoke update (staff_title) on public.profiles from authenticated`); }
  }, /not_allowed/);
  await expectErr('a user cannot remove a title either', async () => {
    await q(`grant update (staff_title) on public.profiles to authenticated`);
    try { await as(U.B, `update profiles set staff_title = null where id = $1`, [U.B]); }
    finally { await q(`revoke update (staff_title) on public.profiles from authenticated`); }
  }, /not_allowed/);
  check('a normal profile edit still works with a title set', (await as(U.B, `update profiles set bio = 'هلا' where id = $1 returning bio`, [U.B]))[0]?.bio === 'هلا');
  await expectErr('titles are short (16 max)', () => q(`update profiles set staff_title = $2 where id = $1`, [U.B, 'x'.repeat(17)]), /check constraint/);
  await expectErr('no padding spaces', () => q(`update profiles set staff_title = ' XO' where id = $1`, [U.B]), /check constraint/);
  await expectErr('not empty', () => q(`update profiles set staff_title = '' where id = $1`, [U.B]), /check constraint/);
  await q(`update profiles set staff_title = null where id = $1`, [U.B]);
  check('the database can remove it', (await q(`select staff_title from profiles where id = $1`, [U.B]))[0].staff_title === null);
})().catch((e) => { console.error(e); process.exit(1); });
