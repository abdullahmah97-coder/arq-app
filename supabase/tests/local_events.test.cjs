// البطولات والفعاليات: القراءة للجميع (الفعّال فقط)، والإضافة والتعديل والحذف لإدارة التطبيق فقط، مع السجل
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U } = await setup();

  // أول القائمة موجودة وتظهر للمستخدم
  const seen = await as(U.A, `select id, category, title, starts_on, ends_on, date_note from local_events order by starts_on nulls last`);
  check('seeded events visible to users', seen.length === 11, String(seen.length));
  const cats = new Set(seen.map((r) => r.category));
  check('the five requested kinds are there', ['running', 'horse_racing', 'hiking', 'shooting', 'boxing'].every((c) => cats.has(c)), [...cats].join(','));
  const cup = (await as(U.A, `select starts_on::text s, ends_on::text e from local_events where title = 'كأس السعودية 2027'`))[0];
  check('saudi cup dates from the official programme', cup?.s === '2027-02-05' && cup?.e === '2027-02-06', JSON.stringify(cup));
  check('unconfirmed dates carry a note', seen.find((r) => r.title === 'ماراثون الرياض 2027')?.date_note?.includes('يُعلن'));

  // المستخدم العادي ما يقدر يضيف أو يعدّل أو يحذف
  await expectErr('users cannot add events', () => as(U.A, `insert into local_events (title, category) values ('فعالية مزيفة', 'running')`), /row-level security|permission denied/);
  const upd = await as(U.A, `update local_events set title = 'تعديل' where id = 'e0e0e0e0-0000-4000-8000-000000000001' returning 1`);
  check('users cannot edit events', upd.length === 0);
  const del = await as(U.A, `delete from local_events where id = 'e0e0e0e0-0000-4000-8000-000000000001' returning 1`);
  check('users cannot delete events', del.length === 0);

  // إدارة التطبيق: إضافة، إخفاء، تعديل، حذف، وكلها في السجل
  const [{ id }] = await as(U.E, `insert into local_events (title, category, city, starts_on, ends_on, url) values ('بطولة بادل الرياض', 'other', 'الرياض', '2026-11-05', '2026-11-07', 'https://example.com') returning id`);
  check('admin can add an event', !!id);
  check('new event visible to users', (await as(U.A, `select 1 from local_events where id = $1`, [id])).length === 1);
  await as(U.E, `update local_events set active = false where id = $1`, [id]);
  check('hidden event disappears for users', (await as(U.A, `select 1 from local_events where id = $1`, [id])).length === 0);
  check('hidden event still visible to admin', (await as(U.E, `select 1 from local_events where id = $1`, [id])).length === 1);
  await as(U.E, `update local_events set title = 'بطولة بادل الرياض المفتوحة', active = true where id = $1`, [id]);
  await as(U.E, `delete from local_events where id = $1`, [id]);
  const log = (await q(`select action from admin_log where kind = 'event' and target = $1 order by id`, [id])).map((r) => r.action);
  check('every change is logged', JSON.stringify(log) === JSON.stringify(['create', 'hide', 'show', 'delete']), JSON.stringify(log));

  // قيود البيانات
  await expectErr('links must be https', () => as(U.E, `insert into local_events (title, url) values ('رابط', 'http://example.com')`), /check constraint/);
  await expectErr('end date cannot be before start', () => as(U.E, `insert into local_events (title, starts_on, ends_on) values ('تواريخ', '2026-12-10', '2026-12-01')`), /check constraint/);
  await expectErr('unknown category rejected', () => as(U.E, `insert into local_events (title, category) values ('فئة', 'chess')`), /check constraint/);

  // صور الفعاليات: الرفع لإدارة التطبيق فقط
  const pol = (await q(`select policyname from pg_policies where tablename = 'objects' and policyname like '%events'`)).map((r) => r.policyname).sort();
  check('image bucket has admin-only write policies', pol.length === 4, pol.join(','));
})();
