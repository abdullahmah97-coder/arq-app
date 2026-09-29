// حجز الملاعب والحصص: انضمام الملعب بموافقة الإدارة، الحجز بالوقت بدون تعارض، الحصص بالسعة،
// التنبيهات (للمستخدم والملعب)، التذكير قبل ساعة، الإلغاء، والصلاحيات
const { setup } = require('./_harness.cjs');

// يوم الرياض بعد n يوم بصيغة YYYY-MM-DD
const riyadhDay = (n) => new Date(Date.now() + 3 * 3600_000 + n * 86_400_000).toISOString().slice(0, 10);
const at = (day, hhmm) => `${day}T${hhmm}:00+03:00`;

(async () => {
  const { q, as, check, expectErr, U } = await setup();
  const d1 = riyadhDay(1); const d2 = riyadhDay(2); const d3 = riyadhDay(3);
  const notes = async (uid, key) => q(`select data->>'title_ar' t, data->>'body_ar' b, data->>'url' u from notifications where user_id = $1 and kind = 'notice' and data->>'key' like $2 order by id`, [uid, key]);

  // ---------- الدليل الأولي ----------
  const seeds = await as(U.B, `select name, sports, listed_by, booking_url from venues order by name`);
  check('seeded venues visible', seeds.length === 22, String(seeds.length));
  const bySport = (s) => seeds.filter((v) => v.sports.includes(s)).length;
  check('every requested sport has venues', ['football', 'padel', 'tennis', 'yoga', 'pilates'].every((s) => bySport(s) >= 2),
    ['football', 'padel', 'tennis', 'yoga', 'pilates'].map((s) => `${s}:${bySport(s)}`).join(' '));
  check('seeded venues are directory entries with an official link', seeds.every((v) => v.listed_by === 'arq'));

  // ---------- انضمام ملعب بادل ----------
  const [{ id: V }] = await as(U.A, `insert into venues (sports, name, city, status, open_hour, close_hour, slot_min, price_sar)
                                      values ('{padel}', 'نادي بادل التجربة', 'الرياض', 'approved', 16, 26, 60, 200) returning id`);
  const v0 = (await q(`select status, owner, listed_by from venues where id = $1`, [V]))[0];
  check('new venue waits for approval (status forced)', v0.status === 'pending' && v0.owner === U.A && v0.listed_by === 'owner', JSON.stringify(v0));
  check('admins told about the request', (await notes(U.E, 'vn:%')).length === 1);
  check('pending venue hidden from others', (await as(U.B, `select 1 from venues where id = $1`, [V])).length === 0);
  await expectErr('owner cannot approve himself', () => as(U.A, `update venues set status = 'approved' where id = $1`, [V]), /status_locked/);
  await expectErr('one venue per account', () => as(U.A, `insert into venues (sports, name, city) values ('{tennis}', 'ثاني', 'جدة')`), /duplicate key|unique/);

  await as(U.E, `select admin_partner_action('venue', $1, 'approve')`, [V]);
  check('approved venue visible to users', (await as(U.B, `select 1 from venues where id = $1 and status = 'approved'`, [V])).length === 1);
  check('owner told about the approval', (await notes(U.A, 'vnr:%'))[0]?.t === 'انعتمد مكانك ✓');

  // الملاعب
  const [{ id: C1 }] = await as(U.A, `insert into venue_courts (venue_id, sport, name) values ($1, 'padel', 'ملعب 1') returning id`, [V]);
  const [{ id: C2 }] = await as(U.A, `insert into venue_courts (venue_id, sport, name) values ($1, 'padel', 'ملعب 2') returning id`, [V]);
  await expectErr('court sport must be one of the venue sports', () => as(U.A, `insert into venue_courts (venue_id, sport, name) values ($1, 'football', 'كورة')`, [V]), /bad_sport/);
  await expectErr('others cannot add courts', () => as(U.B, `insert into venue_courts (venue_id, sport, name) values ($1, 'padel', 'ملعب 9')`, [V]), /row-level security/);

  // ---------- الحجز ----------
  const r1 = (await as(U.B, `select book_court($1, $2, 'نبي كور') r`, [C1, at(d1, '18:00')]))[0].r;
  check('booking created and waits for the venue', r1.status === 'pending', JSON.stringify(r1));
  check('user told the request arrived (with the time)', ((await notes(U.B, 'vb_req:%'))[0]?.b ?? '').includes('18:00'));
  check('venue told about the new request', (await notes(U.A, 'vb_new:%'))[0]?.t === 'طلب حجز جديد');
  const b1 = (await q(`select price_sar::float p, ends_at - starts_at dur from venue_bookings where id = $1`, [r1.id]))[0];
  check('price and length from the venue', b1.p === 200 && (b1.dur.hours === 1 || String(b1.dur).includes('01:00')), JSON.stringify(b1));

  await expectErr('same court and time cannot be booked twice', () => as(U.C, `select book_court($1, $2)`, [C1, at(d1, '18:00')]), /slot_taken/);
  const r2 = (await as(U.C, `select book_court($1, $2) r`, [C2, at(d1, '18:00')]))[0].r;
  check('another court at the same time is fine', !!r2.id);
  await expectErr('off-grid time rejected', () => as(U.C, `select book_court($1, $2)`, [C1, at(d1, '18:30')]), /bad_slot/);
  await expectErr('before opening rejected', () => as(U.C, `select book_court($1, $2)`, [C1, at(d1, '15:00')]), /bad_slot/);
  const late = (await as(U.C, `select book_court($1, $2) r`, [C1, at(d2, '01:00')]))[0].r;
  check('after-midnight slot (closing at 2am) is bookable', !!late.id);
  await expectErr('after closing rejected', () => as(U.C, `select book_court($1, $2)`, [C1, at(d2, '02:00')]), /bad_slot/);
  await expectErr('past time rejected', () => as(U.C, `select book_court($1, now() - interval '1 hour')`, [C1]), /too_late|bad_slot/);
  await expectErr('more than 3 weeks ahead rejected', () => as(U.C, `select book_court($1, $2)`, [C1, at(riyadhDay(40), '18:00')]), /too_far_ahead/);
  await expectErr('no direct inserts into bookings', () => as(U.C, `insert into venue_bookings (venue_id, user_id, court_id, sport, starts_at, ends_at) values ($1, $2, $3, 'padel', now() + interval '2 days', now() + interval '2 days 1 hour')`, [V, U.C, C1]), /row-level security|permission denied/);

  // الأوقات المحجوزة: بدون أسماء
  const taken = await as(U.C, `select * from venue_taken($1, $2, $3)`, [V, at(d1, '00:00'), at(d2, '06:00')]);
  check('taken slots listed without who booked', taken.length === 3 && !('user_id' in taken[0]), JSON.stringify(taken.map((t) => t.mine)));
  check('user sees which one is his', taken.filter((t) => t.mine).length === 2);

  // الملعب يأكد
  await expectErr('user cannot confirm his own booking', () => as(U.B, `select respond_venue_booking($1, 'confirm')`, [r1.id]), /not_allowed/);
  await as(U.A, `select respond_venue_booking($1, 'confirm')`, [r1.id]);
  check('user told the booking is confirmed', ((await notes(U.B, 'vb_confirm:%'))[0]?.t) === 'تأكد حجزك ✓');
  await expectErr('cannot mark attended before the time', () => as(U.A, `select respond_venue_booking($1, 'done')`, [r1.id]), /too_early/);
  await expectErr('venue must give a reason to cancel', () => as(U.A, `select respond_venue_booking($1, 'cancel')`, [r1.id]), /note_required/);
  await as(U.A, `select respond_venue_booking($1, 'decline', 'الملعب صيانة')`, [r2.id]);
  check('declined booking frees the slot and tells the user why', (await notes(U.C, 'vb_decline:%'))[0]?.b === 'الملعب صيانة');

  // القوائم
  const mine = await as(U.B, `select * from my_venue_bookings()`);
  check('my bookings list shows venue and label', mine.length === 1 && mine[0].venue_name === 'نادي بادل التجربة' && mine[0].label === 'بادل · ملعب 1', JSON.stringify(mine[0]?.label));
  const list = await as(U.A, `select * from venue_booking_list($1)`, [V]);
  check('venue sees its bookings with names', list.length === 3 && list.some((x) => x.username === 'sara'), String(list.length));
  await expectErr('others cannot see the venue list', () => as(U.C, `select * from venue_booking_list($1)`, [V]), /not_allowed/);
  check('users only see their own bookings', (await as(U.C, `select 1 from venue_bookings where user_id = $1`, [U.B])).length === 0);

  // التذكير قبل ساعة
  const n1 = (await q(`select run_venue_reminders($1::timestamptz - interval '1 hour') n`, [at(d1, '18:00')]))[0].n;
  const n2 = (await q(`select run_venue_reminders($1::timestamptz - interval '55 minutes') n`, [at(d1, '18:00')]))[0].n;
  check('reminder an hour before, once', n1 === 1 && n2 === 0, `${n1}/${n2}`);
  check('reminder text has the time', ((await notes(U.B, 'vb_rem:%'))[0]?.b ?? '').includes('18:00'));

  // إلغاء المستخدم يرجّع الوقت متاح
  await as(U.B, `select cancel_venue_booking($1)`, [r1.id]);
  check('venue told about the cancellation', (await notes(U.A, 'vb_cx:%')).length === 1);
  const again = (await as(U.C, `select book_court($1, $2) r`, [C1, at(d1, '18:00')]))[0].r;
  check('cancelled slot can be booked again', !!again.id);
  await expectErr('cannot cancel twice', () => as(U.B, `select cancel_venue_booking($1)`, [r1.id]), /bad_status/);

  // حد الحجوزات القادمة
  // خالد عنده حجزين قادمة، يكمّل ٦ وبعدها يوقف
  for (const h of ['16:00', '17:00', '19:00', '20:00']) await as(U.C, `select book_court($1, $2)`, [C2, at(d3, h)]);
  await expectErr('max 6 upcoming bookings per person', () => as(U.C, `select book_court($1, $2)`, [C2, at(d3, '21:00')]), /too_many_bookings/);

  // تأكيد تلقائي
  await as(U.A, `update venues set auto_confirm = true where id = $1`, [V]);
  const auto = (await as(U.B, `select book_court($1, $2) r`, [C2, at(d1, '20:00')]))[0].r;
  check('auto-confirm venues confirm right away', auto.status === 'confirmed');
  check('user gets the confirmation with the time', ((await notes(U.B, 'vb_ok:%'))[0]?.b ?? '').includes('20:00'));

  // ---------- استوديو يوقا وبيلاتس ----------
  const [{ id: S }] = await as(U.D, `insert into venues (sports, name, city, audience) values ('{yoga,pilates}', 'استوديو التوازن', 'جدة', 'women') returning id`);
  await as(U.E, `select review_venue($1, 'approved')`, [S]);
  const dow = new Date(`${d1}T12:00:00Z`).getUTCDay();
  const [{ id: K }] = await as(U.D, `insert into venue_classes (venue_id, sport, title, weekday, start_time, duration_min, capacity, price_sar)
                                      values ($1, 'yoga', 'يوقا الصباح', $2, '07:00', 60, 2, 60) returning id`, [S, dow]);
  const sched = await as(U.B, `select * from venue_class_schedule($1, 14)`, [S]);
  check('class schedule shows the coming sessions', sched.length === 2 && sched[0].booked === 0 && sched[0].capacity === 2, String(sched.length));
  const k1 = (await as(U.B, `select book_venue_class($1, $2) r`, [K, at(d1, '07:00')]))[0].r;
  check('class seat confirmed right away', k1.status === 'confirmed');
  await expectErr('same person cannot take two seats', () => as(U.B, `select book_venue_class($1, $2)`, [K, at(d1, '07:00')]), /already_booked/);
  await as(U.A, `select book_venue_class($1, $2)`, [K, at(d1, '07:00')]);
  await expectErr('full class rejected', () => as(U.E, `select book_venue_class($1, $2)`, [K, at(d1, '07:00')]), /class_full/);
  await expectErr('wrong class time rejected', () => as(U.C, `select book_venue_class($1, $2)`, [K, at(d1, '08:00')]), /bad_slot/);
  check('schedule shows the class as full and my seat', (await as(U.B, `select booked, my_status from venue_class_schedule($1, 3)`, [S]))[0]?.booked === 2);
  check('studio told about the class booking', (await notes(U.D, 'vb_new:%')).length === 2);
  await expectErr('studio cannot add a court for a sport it does not have', () => as(U.D, `insert into venue_courts (venue_id, sport, name) values ($1, 'tennis', 'ت')`, [S]), /bad_sport/);

  // ---------- الدليل: الحجز من موقعهم فقط ----------
  const seed = (await q(`select id from venues where name_en = 'Hala Padel'`))[0].id;
  const [{ id: SC }] = await as(U.E, `insert into venue_courts (venue_id, sport, name) values ($1, 'padel', 'ملعب') returning id`, [seed]);
  await expectErr('directory venues are booked on their own site', () => as(U.B, `select book_court($1, $2)`, [SC, at(d1, '20:00')]), /venue_unavailable/);

  // ---------- لوحة الإدارة ----------
  const ov = (await as(U.E, `select * from partner_overview() where kind = 'venue'`))[0];
  check('owner panel counts venues', ov?.total === 24 && ov.partners === 2, JSON.stringify(ov));
  const rows = await as(U.E, `select * from admin_partner_list('venue', 'بادل')`);
  check('owner panel lists venues with courts and bookings', rows.length === 1 && rows[0].meta.courts === 2, JSON.stringify(rows[0]?.meta));
  await as(U.E, `select admin_assign_partner('venue', $1, 'khalid')`, [seed]);
  const linked = (await q(`select v.owner, v.listed_by, p.account_type from venues v join profiles p on p.id = v.owner where v.id = $1`, [seed]))[0];
  check('directory venue linked to its owner becomes a partner', linked?.owner === U.C && linked.listed_by === 'owner' && linked.account_type === 'venue', JSON.stringify(linked));
  await as(U.E, `select admin_partner_action('venue', $1, 'hide', 'تحديث بيانات')`, [V]);
  check('hidden venue disappears', (await as(U.B, `select 1 from venues where id = $1`, [V])).length === 0);
  await expectErr('bookings stop while hidden', () => as(U.B, `select book_court($1, $2)`, [C1, at(d2, '19:00')]), /venue_unavailable/);
  const log = (await q(`select action from admin_log where kind = 'venue' order by id`)).map((r) => r.action);
  check('admin actions logged', JSON.stringify(log) === JSON.stringify(['approve', 'assign', 'hide']), JSON.stringify(log));
})().catch((e) => { console.error(e); process.exit(1); });
