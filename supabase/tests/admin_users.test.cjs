// لوحة إدارة التطبيق ← المتدربين: الأرقام والقائمة بالإيميل للإدارة فقط، التعديل، والحذف مع حماية حسابك وحسابات الإدارة والشركاء
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U } = await setup();
  await q(`update auth.users set email = x.email, email_confirmed_at = x.conf, last_sign_in_at = x.seen
           from (values ($1::uuid, 'ahmed@example.com', now(), now() - interval '1 day'),
                        ($2::uuid, 'sara@example.com', now(), now() - interval '20 days'),
                        ($3::uuid, 'khalid@example.com', null::timestamptz, null::timestamptz),
                        ($4::uuid, 'manager@example.com', now(), now()),
                        ($5::uuid, 'admin@example.com', now(), now())) as x(id, email, conf, seen)
           where auth.users.id = x.id`, [U.A, U.B, U.C, U.D, U.E]);
  await q(`update profiles set created_at = now() - interval '30 days' where id in ($1, $2)`, [U.A, U.B]);
  await q(`update profiles set account_type = 'coach' where id = $1`, [U.D]);

  // ما يشوفها إلا الإدارة
  await expectErr('users cannot read the stats', () => as(U.A, `select * from admin_user_stats()`), /not_allowed/);
  await expectErr('users cannot list emails', () => as(U.A, `select * from admin_user_list()`), /not_allowed/);
  await expectErr('users cannot edit others', () => as(U.A, `select admin_update_user($1, 'x', 'hacked')`, [U.B]), /not_allowed/);
  await expectErr('users cannot delete others', () => as(U.A, `select admin_delete_user($1)`, [U.B]), /not_allowed/);

  const st = (await as(U.E, `select * from admin_user_stats()`))[0];
  check('stats: 5 accounts, 4 trainees, 1 partner', st.total === 5 && st.trainees === 4 && st.partners === 1, JSON.stringify(st));
  check('stats: new this week and signed in this week', st.new_7d === 3 && st.active_7d === 3, JSON.stringify(st));
  check('stats: one email not confirmed', st.unconfirmed === 1, JSON.stringify(st));

  const list = await as(U.E, `select * from admin_user_list()`);
  check('trainee list has the 4 trainees with emails', list.length === 4 && list.every((r) => r.email && r.email.endsWith('@example.com')) && Number(list[0].total) === 4,
    list.map((r) => r.username).join(','));
  check('newest first', list[list.length - 1].username === 'ahmed' || list[list.length - 1].username === 'sara');
  check('admin flag and confirmation', list.find((r) => r.id === U.E)?.is_admin === true && list.find((r) => r.id === U.C)?.email_confirmed === false);
  const partners = await as(U.E, `select * from admin_user_list(null, 'partner')`);
  check('partner tab shows the coach', partners.length === 1 && partners[0].id === U.D && partners[0].account_type === 'coach');
  const all = await as(U.E, `select * from admin_user_list(null, 'all', 2, 0)`);
  check('paging: 2 rows, total 5', all.length === 2 && Number(all[0].total) === 5);
  const byEmail = await as(U.E, `select * from admin_user_list('SARA@EXAMPLE', 'all')`);
  check('search by email (any case)', byEmail.length === 1 && byEmail[0].id === U.B);
  const byName = await as(U.E, `select * from admin_user_list('khal', 'all')`);
  check('search by username', byName.length === 1 && byName[0].id === U.C);
  const wild = await as(U.E, `select * from admin_user_list('%', 'all')`);
  check('% is searched literally', wild.length === 0);

  // التعديل
  await as(U.E, `select admin_update_user($1, '  Ahmed Ali  ', 'Ahmed.Ali')`, [U.A]);
  const a = (await q(`select full_name, username from profiles where id = $1`, [U.A]))[0];
  check('edit saves trimmed name and lowercase username', a.full_name === 'Ahmed Ali' && a.username === 'ahmed.ali', JSON.stringify(a));
  await expectErr('bad username refused', () => as(U.E, `select admin_update_user($1, 'x', 'no spaces')`, [U.A]), /bad_username/);
  await expectErr('taken username refused (any case)', () => as(U.E, `select admin_update_user($1, 'x', 'SARA')`, [U.A]), /username_taken/);
  await expectErr('long name refused', () => as(U.E, `select admin_update_user($1, repeat('ا', 61), 'ahmed.ali')`, [U.A]), /name_too_long/);
  await expectErr('unknown user', () => as(U.E, `select admin_update_user('99999999-9999-9999-9999-999999999999', 'x', 'nobody1')`), /user_not_found/);
  const logE = await q(`select action, note from admin_log where kind = 'user' and target = $1`, [U.A]);
  check('edit is logged with old and new names', logE.length === 1 && logE[0].action === 'edit' && logE[0].note.includes('ahmed') && logE[0].note.includes('ahmed.ali'), JSON.stringify(logE));

  // الحذف: حماية
  await expectErr('cannot delete yourself', () => as(U.E, `select admin_delete_user($1)`, [U.E]), /cannot_delete_self/);
  await q(`insert into app_admins (user_id) values ($1)`, [U.B]);
  await expectErr('cannot delete another admin', () => as(U.E, `select admin_delete_user($1)`, [U.B]), /cannot_delete_admin/);
  await q(`delete from app_admins where user_id = $1`, [U.B]);
  await expectErr('cannot delete a partner here', () => as(U.E, `select admin_prepare_user_delete($1)`, [U.D]), /not_trainee/);

  // الحذف: نافذة الملفات (نفعّل RLS على التخزين مثل سوبابيس)
  await q(`alter table storage.objects enable row level security`);
  await q(`grant select, insert, update, delete on storage.objects to authenticated`);
  await q(`insert into storage.objects (bucket_id, name) values ('avatars', $1 || '/me.jpg'), ('body', $1 || '/front.jpg'), ('body', $2 || '/front.jpg')`, [U.C, U.B]);
  const before = await as(U.E, `select name from storage.objects where bucket_id in ('avatars','body')`);
  check('admin cannot see private files normally', !before.some((o) => o.name.startsWith(U.C) && o.name.includes('front')) && !before.some((o) => o.name.startsWith(U.B)), JSON.stringify(before));
  await as(U.E, `select admin_prepare_user_delete($1)`, [U.C]);
  const during = await as(U.E, `select name from storage.objects where bucket_id in ('avatars','body') order by name`);
  check('during delete: admin sees only that user\'s files', during.length === 2 && during.every((o) => o.name.startsWith(U.C)), JSON.stringify(during));
  const gone = await as(U.E, `delete from storage.objects where name like $1 returning name`, [`${U.C}/%`]);
  check('during delete: admin can remove them', gone.length === 2);
  const other = await as(U.E, `delete from storage.objects where name like $1 returning name`, [`${U.B}/%`]);
  check('other users\' files stay protected', other.length === 0);
  await as(U.A, `select 1`); // مستخدم عادي ما يستفيد من نافذة الحذف
  const asUser = await as(U.A, `select name from storage.objects where name like $1`, [`${U.C}/%`]);
  check('the window is for admins only', asUser.length === 0);

  await as(U.E, `select admin_delete_user($1)`, [U.C]);
  const left = await q(`select (select count(*) from auth.users where id = $1)::int as auth_rows, (select count(*) from profiles where id = $1)::int as prof,
                               (select count(*) from admin_user_deletes where user_id = $1)::int as pending`, [U.C]);
  check('account and profile deleted, window closed', left[0].auth_rows === 0 && left[0].prof === 0 && left[0].pending === 0, JSON.stringify(left));
  const logD = await q(`select note from admin_log where kind = 'user' and action = 'delete' and target = $1`, [U.C]);
  check('delete is logged with the username', logD.length === 1 && logD[0].note.includes('khalid'));
  const st2 = (await as(U.E, `select * from admin_user_stats()`))[0];
  check('stats update after delete', st2.total === 4 && st2.trainees === 3 && st2.unconfirmed === 0, JSON.stringify(st2));
})().catch((e) => { console.error(e); process.exit(1); });
