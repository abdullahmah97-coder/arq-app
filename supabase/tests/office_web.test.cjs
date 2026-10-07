// مكتب أرك أب على الويب: اللقطة office_overview (مين يفتحها، شكلها، وإنها ما تطلّع أي بيانات خاصة)،
// ودوال office_admin (اعتماد/رفض اقتراح وكيل، قرار طلب شريك، حالة بلاغ، تشغيل وكيل) ومفتاح الويب office_agent_key_ok.
// PGlite ما فيه vault ولا pg_net: نسوي بدائل صغيرة لهم داخل الاختبار.
// التشغيل: node supabase/tests/office_web.test.cjs
//   (OFFICE_WEB_SAMPLE=<ملف> يحفظ لقطة حقيقية من هالتشغيلة في الملف — لصفحة الويب)
const fs = require('fs');
const path = require('path');
const { setup } = require('./_harness.cjs');

(async () => {
  const { db, q, as, check, expectErr, U, gym, failed } = await setup();
  const MIG = path.join(__dirname, '../migrations/20261008000890_office_web.sql');
  const F = '66666666-6666-6666-6666-666666666666';
  // auth.uid() مثل Supabase الحقيقي (request.jwt.claim.sub ثم request.jwt.claims->>sub)، ومعه request.jwt.sub حق أداة الاختبار
  await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.sub', true), ''),
                    nullif(current_setting('request.jwt.claim.sub', true), ''),
                    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;`);
  const ov = async (days = 7) => (await q(`select office_overview($1) as o`, [days]))[0].o;
  const one = async (sql, params) => (await q(sql, params))[0];
  /** يشغّل أكثر من أمر بنفس العملية (مثل طلب execute_sql واحد) */
  const tx = (fn) => db.transaction(fn);

  // ===================================================================
  // بيانات من كل قسم — ومعها نصوص خاصة لازم ما تطلع أبداً في اللقطة
  // ===================================================================
  const SECRETS = ['SECRET-CHAT-BODY', 'SECRET-CAPTION', 'SECRET-COMMENT', 'SECRET-CI-COMMENT', 'SECRET-FLAG-NOTE', 'SECRET-REVIEW-BODY',
    'SECRET-BOOKING-NOTE', 'SECRET-INJURY', 'SECRET-PREF', 'SECRET-DIET', 'SECRET MEMBER', 'SECRET-MEMBERSHIP-NOTE', '0559998888',
    '0551234567', 'club@example.com', 'ahmed@example.com', 'SECRET-WEIGHT-NOTE', 'SECRET-STACK', 'SECRETCODE10', 'SECRET-LINK-MSG',
    'SECRET-SESSION-NOTE', 'SECRET-PLACE', 'SECRET-CHALLENGE-TITLE', '24.123456', '46.654321', 'SECRET-WORKOUT-NOTE', 'SECRET-TIP-BODY',
    'SECRET-ANNOUNCEMENT', 'SECRET-CR-NOTE', 'x/secret-photo.jpg', 'SECRET-CHAT-MEDIA'];
  await q(`insert into auth.users (id, raw_user_meta_data) values ($1, '{"username":"fahad"}')`, [F]);
  await q(`update auth.users set email = 'ahmed@example.com', last_sign_in_at = now() where id = $1`, [U.A]);
  await q(`update profiles set created_at = now() - interval '9 days' where id = $1`, [U.B]);
  await q(`update profiles set created_at = now() - interval '2 days' where id = $1`, [U.C]);
  await q(`update profiles set partner_intent = 'club' where id = $1`, [F]);

  // النشاط: زيارات (وحدة للأدمن ما تنحسب)، تمارين، أخطاء التطبيق
  const [ciA] = await q(`insert into check_ins (user_id, gym_id, checked_in_at, checked_out_at, lat, lng, distance_m) values
    ($1, $2, now(), now() + interval '1 hour', 24.123456, 46.654321, 12) returning id`, [U.A, gym.id]);
  await q(`insert into check_ins (user_id, gym_id, checked_in_at, checked_out_at) values
    ($1, $4, now() - interval '2 days', now() - interval '2 days' + interval '1 hour'),
    ($1, $4, now() - interval '9 days', now() - interval '9 days' + interval '1 hour'),
    ($2, $4, now(), null), ($3, $4, now(), null)`, [U.B, U.C, U.E, gym.id]);
  await q(`insert into workout_sessions (user_id, source, started_at, finished_at, notes) values
    ($1, 'free', now(), now(), 'SECRET-WORKOUT-NOTE'), ($2, 'free', now() - interval '9 days', null, null), ($3, 'free', now(), null, null)`, [U.A, U.B, U.E]);
  await q(`insert into body_logs (user_id, weight_kg, note, created_at) values ($1, 88.5, 'SECRET-WEIGHT-NOTE', now() - interval '9 days')`, [U.B]);
  await q(`insert into app_events (user_id, kind, detail, app, created_at) values
    ($1, 'js_fatal', '{"message":"SECRET-STACK","stack":"SECRET-STACK"}', '{"platform":"ios"}', now()),
    ($2, 'screen_error', '{"screen":"home"}', '{}', now()),
    ($1, 'screen_error', '{"screen":"food"}', '{}', now() - interval '2 days'),
    ($3, 'checkin_scan', '{"inRange":1}', '{}', now()),
    ($2, 'js_error', '{}', '{}', now() - interval '9 days')`, [U.A, U.B, U.C]);

  // الحجوزات: ملعب شريك + حجوزاته، اشتراكات النادي، مدرب، مركز، اشتراك وجبات
  const venue = (await one(`insert into venues (owner, listed_by, sports, name, city, status, phone)
    values ($1, 'owner', '{padel}', 'Padel Hub', 'الرياض', 'approved', '0551234567') returning id`, [U.D])).id;
  const court = (await one(`insert into venue_courts (venue_id, sport, name) values ($1, 'padel', 'Court 1') returning id`, [venue])).id;
  await q(`insert into venue_bookings (venue_id, user_id, court_id, sport, starts_at, ends_at, status, price_sar, note, created_at) values
    ($1, $3, $2, 'padel', now() + interval '2 days', now() + interval '2 days 1 hour', 'pending', 150, 'SECRET-BOOKING-NOTE', now() - interval '7 hours'),
    ($1, $4, $2, 'padel', now() - interval '1 day', now() - interval '23 hours', 'done', 200, null, now() - interval '2 days'),
    ($1, $5, $2, 'padel', now() + interval '3 days', now() + interval '3 days 1 hour', 'cancelled', 150, null, now())`,
  [venue, court, U.A, U.B, U.C]);
  await q(`insert into memberships (gym_id, plan_name, starts_on, ends_on, member_name, member_contact, notes) values
    ($1, 'Monthly', app_today() - 10, app_today() + 3, 'SECRET MEMBER', '0559998888', 'SECRET-MEMBERSHIP-NOTE'),
    ($1, 'Old plan', app_today() - 40, app_today() - 2, 'SECRET MEMBER', null, null)`, [gym.id]);
  await q(`update profiles set full_name = 'Coach Dana' where id = $1`, [U.D]);
  await q(`insert into coach_profiles (user_id, status, city) values ($1, 'approved', 'الرياض')`, [U.D]);
  await q(`insert into coach_profiles (user_id, status, submitted_at, city) values ($1, 'pending', now() - interval '1 day', 'جدة')`, [U.B]);
  await q(`insert into coach_links (coach_id, client_id, status, requested_by, message, created_at) values
    ($1, $2, 'pending', 'client', 'SECRET-LINK-MSG', now() - interval '4 days')`, [U.D, U.A]);
  await q(`insert into coach_sessions (coach_id, client_id, starts_at, status, place, notes) values
    ($1, $2, now() - interval '2 days', 'booked', 'SECRET-PLACE', 'SECRET-SESSION-NOTE')`, [U.D, U.C]);
  const center = (await one(`select id from recovery_centers where listed_by = 'arq' and status = 'approved' order by name limit 1`)).id;
  await q(`insert into center_appointments (center_id, user_id, status, note, preferred, created_at) values
    ($1, $2, 'requested', 'SECRET-INJURY', 'SECRET-PREF', now() - interval '2 days')`, [center, U.C]);
  const bowl = (await one(`insert into brands (owner, listed_by, name, category, city, status) values (null, 'arq', 'Green Bowl', 'restaurant', 'الرياض', 'approved') returning id`)).id;
  await q(`insert into meal_subscriptions (user_id, brand_id, status, notes, created_at) values ($1, $3, 'requested', 'SECRET-DIET', now() - interval '3 days'),
           ($2, $3, 'active', 'SECRET-DIET', now() - interval '1 day')`, [U.C, U.A, bowl]);

  // المتجر: متجر ملابس ومنتجاته وعرض بكود ومتابعين وتفاعل
  const shop = (await one(`insert into brands (owner, name, category, status, listed_by) values ($1, 'Fit Wear', 'apparel', 'approved', 'owner') returning id`, [U.A])).id;
  await q(`insert into brand_products (brand_id, name, price_sar, stock, image_path) values ($1, 'Shirt', 99, 0, 'x/secret-photo.jpg'),
           ($1, 'Shorts', 79, 3, null), ($1, 'Socks', 20, null, null)`, [shop]);
  const offer = (await one(`insert into brand_offers (brand_id, title, code, percent, ends_on) values ($1, 'Ten off', 'SECRETCODE10', 10, app_today() + 2) returning id`, [shop])).id;
  await q(`insert into brand_offer_events (offer_id, user_id, kind, day) values ($1, $2, 'view', app_today()), ($1, $2, 'reveal', app_today()),
           ($1, $3, 'view', app_today() - 8)`, [offer, U.B, U.C]);
  await q(`insert into brand_followers (brand_id, user_id) values ($1, $2), ($1, $3)`, [shop, U.B, U.C]);
  await q(`insert into brand_announcements (brand_id, title, body, recipients) values ($1, 'Sale', 'SECRET-ANNOUNCEMENT', 2)`, [shop]);
  await q(`insert into points_ledger (user_id, amount, reason, created_at) values ($1, 10, 'checkin', now()), ($2, 5, 'steps_goal', now() - interval '9 days'),
           ($3, 100, 'checkin', now())`, [U.A, U.B, U.E]);

  // المجتمع والمحادثات (ومنشور ورسالة من الأدمن ما ينحسبون)
  const post = (await one(`insert into posts (user_id, caption, visibility, image_path) values ($1, 'SECRET-CAPTION', 'public', 'x/secret-photo.jpg') returning id`, [U.A])).id;
  await q(`insert into posts (user_id, kind, caption, created_at) values ($1, 'wake', 'SECRET-CAPTION', now()), ($2, 'post', 'SECRET-CAPTION', now() - interval '9 days'),
           ($3, 'post', 'admin post', now())`, [U.B, U.C, U.E]);
  await q(`insert into comments (post_id, user_id, body) values ($1, $2, 'SECRET-COMMENT')`, [post, U.B]);
  await q(`insert into post_likes (post_id, user_id, emoji) values ($1, $2, 'fire')`, [post, U.B]);
  await q(`insert into checkin_comments (check_in_id, user_id, body) values ($1, $2, 'SECRET-CI-COMMENT')`, [ciA.id, U.B]);
  await q(`insert into checkin_likes (check_in_id, user_id, emoji, phase) values ($1, $2, 'clap', 'in')`, [ciA.id, U.C]);
  await q(`insert into follows (follower, followee) values ($1, $2)`, [U.A, U.B]);
  await q(`insert into friendships (requester, addressee, status, created_at) values ($1, $2, 'pending', now() - interval '9 days')`, [U.A, U.C]);
  await q(`insert into messages (sender, recipient, body, created_at) values ($1, $2, 'SECRET-CHAT-BODY', now()),
           ($3, $4, 'SECRET-CHAT-BODY', now() - interval '3 days'), ($5, $1, 'from the admin', now())`, [U.A, U.B, U.C, U.D, U.E]);
  await q(`insert into messages (sender, recipient, body, media_path, media_type) values ($1, $2, '', $3, 'image')`, [U.B, U.A, `${U.B}/${U.A}/SECRET-CHAT-MEDIA.jpg`]);
  await q(`insert into gym_reviews (gym_id, user_id, rating, body) values ($1, $2, 1, 'SECRET-REVIEW-BODY')`, [gym.id, U.C]);
  await q(`insert into review_flags (gym_id, user_id, flagged_by, reason, note) values ($1, $2, $3, 'fake', 'SECRET-FLAG-NOTE')`, [gym.id, U.C, U.A]);
  await q(`insert into tips (author, body, tag) values ($1, 'SECRET-TIP-BODY drink water', 'nutrition')`, [U.B]);
  await q(`insert into challenges (creator, title, metric, starts_on, ends_on) values ($1, 'SECRET-CHALLENGE-TITLE', 'checkins', app_today() - 10, app_today() - 2)`, [U.A]);

  // الشركاء: طلب من كل نوع (أقدمهم الملعب) — فيها جوال وإيميل لازم ما يطلعون
  const club = (await one(`insert into club_requests (user_id, club_name, role, phone, email, city, note, created_at)
    values ($1, 'Club One', 'owner', '0551234567', 'club@example.com', 'الرياض', 'SECRET-CR-NOTE', now() - interval '3 days') returning id`, [U.C])).id;
  const pendingStore = (await one(`insert into brands (owner, name, category, city, status, created_at) values ($1, 'Pending Co', 'supplements', 'جدة', 'pending', now() - interval '2 days') returning id`, [U.D])).id;
  const pendingCenter = (await one(`insert into recovery_centers (owner, listed_by, name, kind, cities, phone, status, created_at)
    values ($1, 'owner', 'Recovery One', 'physio', '{الرياض}', '0551234567', 'pending', now() - interval '4 days') returning id`, [U.A])).id;
  const pendingVenue = (await one(`insert into venues (owner, listed_by, sports, name, city, status, phone, created_at)
    values ($1, 'owner', '{football}', 'Court Club', 'جدة', 'pending', '0551234567', now() - interval '5 days') returning id`, [U.C])).id;
  // اللي اختاروا نوع شريك وقت التسجيل: فهد (ما قدّم شي) وسارة (ملف مدربها ينتظر) ينحسبون،
  // وأحمد (متجره معتمد) ومدير النادي (ملعبه معتمد) لا — حتى لو بقى عندهم partner_intent
  await q(`update profiles set partner_intent = 'coach' where id = $1`, [U.B]);
  await q(`update profiles set partner_intent = 'store' where id = $1`, [U.A]);
  await q(`update profiles set partner_intent = 'venue' where id = $1`, [U.D]);

  // بلاغات المختبرين
  const longMsg = 'Tester says the meals screen freezes ' + 'when I open it after a workout and scroll fast; '.repeat(6);
  const repA = (await one(`insert into beta_feedback (user_id, category, message) values ($1, 'bug', $2) returning id`, [U.A, longMsg])).id;
  const repB = (await one(`insert into beta_feedback (user_id, category, message, created_at) values ($1, 'idea', 'Second report', now() - interval '1 hour') returning id`, [U.B])).id;
  const repC = (await one(`insert into beta_feedback (user_id, category, message, status, created_at) values ($1, 'design', 'Old report', 'seen', now() - interval '20 days') returning id`, [U.C])).id;

  // التسويق: إعلان شغّال وإعلان منتهي، أحداثهم، فعالية قادمة، تنبيهات مرسلة
  const ad = (await one(`insert into launch_ads (kind, title, media_path, media_type, starts_at, ends_at, active, priority)
    values ('ad', 'Promo', 'ads/x.jpg', 'image', now() - interval '1 day', now() + interval '2 days', true, 1) returning id`)).id;
  await q(`insert into launch_ads (kind, title, media_path, media_type, starts_at, ends_at, active) values ('awareness', 'Old', 'ads/y.jpg', 'image', now() - interval '9 days', now() - interval '8 days', true)`);
  await q(`insert into launch_ad_events (ad_id, user_id, kind, day) values ($1, $2, 'view', app_today()), ($1, $2, 'click', app_today()), ($1, $3, 'view', app_today() - 8)`, [ad, U.A, U.B]);
  await q(`insert into local_events (category, title, title_en, city, starts_on, active) values ('running', 'سباق الرياض', 'Riyadh Run', 'الرياض', app_today() + 5, true)`);
  await q(`insert into nudge_log (user_id, day, slot, category) values ($1, app_today(), 'gym', 'gym'), ($2, app_today() - 8, 'streak', 'streak')`, [U.A, U.B]);

  // الذكاء الاصطناعي
  await q(`insert into ai_usage (user_id, kind, created_at) values ($1, 'meal_photo', now()), ($1, 'barcode', now()), ($2, 'plan', now() - interval '9 days'),
           ($3, 'office', now())`, [U.A, U.B, U.E]);

  // ===================================================================
  // مين يفتح اللقطة
  // ===================================================================
  const asAdmin = (await as(U.E, `select office_overview(7) as o`))[0].o;
  check('the admin (app session) gets the overview', !!asAdmin && asAdmin.meta.days === 7);
  const o = await ov(7);
  check('a database session with no user token (Supabase connector / SQL editor) gets it', !!o && o.meta.days === 7);
  await expectErr('a signed-in non-admin is refused', () => as(U.A, `select office_overview(7)`), /not_allowed/);
  await expectErr('signed-out visitors (anon) are refused', () => as(null, `select office_overview(7)`), /permission denied|not_allowed/);
  await q(`grant execute on function office_overview(integer) to anon`);
  await expectErr('…and the guard alone keeps anon out (even with the grant)', () => as(null, `select office_overview(7)`), /not_allowed/);
  await q(`revoke execute on function office_overview(integer) from anon`);
  await expectErr('the authenticated role without a user token is refused', () => tx(async (t) => {
    await t.query(`set local role authenticated`);
    await t.query(`select office_overview(7)`);
  }), /not_allowed/);
  const svc = await tx(async (t) => { await t.query(`set local role service_role`); return (await t.query(`select office_overview(7) as o`)).rows[0].o; });
  check('the service role (server) can read it', !!svc && svc.meta.days === 7);

  // ===================================================================
  // الشكل: الأقسام العشرة بالضبط، والأرقام أرقام
  // ===================================================================
  const SECTIONS = ['meta', 'activity', 'bookings', 'store', 'community', 'partners', 'reports', 'marketing', 'ai', 'office'];
  check('exactly the ten top-level sections', JSON.stringify(Object.keys(o).sort()) === JSON.stringify([...SECTIONS].sort()), Object.keys(o).join(','));
  check('every section is an object', SECTIONS.every((k) => o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])));
  const leaves = [];
  const walk = (v, p) => {
    if (Array.isArray(v)) v.forEach((x) => walk(x, `${p}[]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${p}.${k}`);
    else leaves.push([p, v]);
  };
  walk(o, '');
  const nums = leaves.filter(([, v]) => typeof v === 'number');
  check('every number is finite', nums.every(([, v]) => Number.isFinite(v)));
  const notInt = nums.filter(([p, v]) => !/(_sar|avg_)[^.]*$/.test(p) && !Number.isInteger(v));
  check('counts are integers (only SAR amounts and averages may have decimals)', notInt.length === 0, JSON.stringify(notInt.slice(0, 3)));
  check('no unexpected value types', leaves.every(([, v]) => v === null || ['number', 'string', 'boolean'].includes(typeof v)));
  check('meta: today, windows and timezone', /^\d{4}-\d{2}-\d{2}$/.test(o.meta.today) && o.meta.timezone === 'Asia/Riyadh'
    && !Number.isNaN(Date.parse(o.meta.generated_at)) && o.meta.prev_to < o.meta.cur_from && o.meta.prev_from < o.meta.prev_to, JSON.stringify(o.meta));
  check('days are clamped to 1..90 (and null = 7)', (await ov(0)).meta.days === 1 && (await ov(500)).meta.days === 90 && (await ov(null)).meta.days === 7);
  const o30 = await ov(30);
  check('daily series have one entry per day of the window', o30.activity.signups.daily.length === 30 && o30.activity.active_users.daily.length === 30
    && o30.activity.checkins.daily.length === 30 && o30.community.daily.length === 30 && o30.community.chats.daily.length === 30
    && o.activity.signups.daily.length === 7 && o.activity.signups.daily[6].day === o.meta.today && o.activity.signups.daily[0].day === o.meta.cur_from);

  // ===================================================================
  // الخصوصية: ولا مفتاح ممنوع، ولا نص خاص من اللي زرعناه
  // ===================================================================
  const BAD_KEYS = new Set(['phone', 'email', 'lat', 'lng', 'distance_m', 'body', 'caption', 'note', 'notes', 'admin_note', 'review_note',
    'venue_note', 'center_note', 'preferred', 'reason_note', 'media_path', 'image_path', 'photo_path', 'file_path', 'token', 'claim_code', 'code',
    'member_name', 'member_contact', 'whatsapp', 'detail', 'stack', 'data', 'preview', 'steps', 'sleep_min', 'weight_kg', 'kcal', 'protein_g',
    'scopes', 'license_no', 'cr_number', 'license_number', 'cr_doc_path', 'license_doc_path', 'raw_user_meta_data', 'metrics', 'analysis',
    'secret', 'decrypted_secret', 'title_private', 'place', 'slots', 'gender', 'birth_year']);
  const keyPaths = [];
  const walkKeys = (v, p) => {
    if (Array.isArray(v)) v.forEach((x) => walkKeys(x, `${p}[]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { keyPaths.push([`${p}.${k}`, k]); walkKeys(x, `${p}.${k}`); }
  };
  for (const snap of [o, o30]) walkKeys(snap, '');
  const badKeys = keyPaths.filter(([, k]) => BAD_KEYS.has(k) || /phone|email|token|password|secret|contact|(^|_)(lat|lng)(_|$)/.test(k));
  check('no private field names anywhere (phone/email/location/body/health/codes…)', badKeys.length === 0, badKeys.slice(0, 5).map(([p]) => p).join(' '));
  const msgKeys = keyPaths.filter(([, k]) => k === 'message').filter(([p]) => p !== '.reports.latest_new[].message');
  check('the only free text is the tester report preview', msgKeys.length === 0, msgKeys.map(([p]) => p).join(' '));
  const all = JSON.stringify([o, o30, asAdmin]);
  const leaked = SECRETS.filter((s) => all.includes(s));
  check('none of the planted private texts leak (chats, captions, comments, notes, phones, emails, codes, coordinates…)', leaked.length === 0, leaked.join(', '));
  check('tester report text is cut to 140 characters', o.reports.latest_new.every((r) => r.message.length <= 140)
    && o.reports.latest_new.some((r) => r.message.startsWith('Tester says the meals screen freezes') && r.message.length === 140));

  // ===================================================================
  // الأرقام نفسها (من البيانات اللي زرعناها)
  // ===================================================================
  const a = o.activity;
  check('users: admins excluded', a.users.total === 5 && a.users.trainees === 5 && a.users.partners === 0, JSON.stringify(a.users));
  check('sign-ups today / current / previous', a.signups.today === 3 && a.signups.cur === 4 && a.signups.prev === 1, JSON.stringify(a.signups));
  check('sign-up series adds up to the current window', a.signups.daily.reduce((s, d) => s + d.n, 0) === a.signups.cur);
  check('active users (lower bound) today / current / previous', a.active_users.today === 3 && a.active_users.cur === 3 && a.active_users.prev === 2,
    JSON.stringify(a.active_users));
  check('check-ins today / current / previous, admin excluded', a.checkins.today === 2 && a.checkins.cur === 3 && a.checkins.prev === 1
    && a.checkins.users_cur === 3 && a.checkins.present_now === 1, JSON.stringify(a.checkins));
  check('check-in series adds up', a.checkins.daily.reduce((s, d) => s + d.n, 0) === 3 && a.checkins.daily[6].n === 2);
  check('top gyms by check-ins', a.top_gyms.length === 1 && a.top_gyms[0].id === gym.id && a.top_gyms[0].n === 3 && a.top_gyms[0].users === 3
    && 'name' in a.top_gyms[0] && 'name_en' in a.top_gyms[0], JSON.stringify(a.top_gyms));
  check('workouts', a.workouts.today === 1 && a.workouts.cur === 1 && a.workouts.prev === 1 && a.workouts.users_cur === 1 && a.workouts.finished_cur === 1,
    JSON.stringify(a.workouts));
  check('app errors: current, previous and top kinds', a.errors.cur === 3 && a.errors.prev === 1 && a.errors.today === 2 && a.errors.users_cur === 2
    && a.errors.top[0].kind === 'screen_error' && a.errors.top[0].n === 2 && a.errors.top.length === 2, JSON.stringify(a.errors));
  check('partner sign-ups still waiting (people with an approved store or venue are left out)', a.partner_intent.total === 2
    && a.partner_intent.no_submission === 1 && a.partner_intent.by_kind.club === 1 && a.partner_intent.by_kind.coach === 1
    && a.partner_intent.by_kind.store === 0 && a.partner_intent.by_kind.venue === 0 && a.partner_intent.by_kind.center === 0,
    JSON.stringify(a.partner_intent));

  const b = o.bookings;
  check('court bookings: made, by status, waiting on the venue, cancelled, booked value', b.venue_bookings.created.cur === 3
    && b.venue_bookings.by_status_cur.pending === 1 && b.venue_bookings.by_status_cur.done === 1 && b.venue_bookings.by_status_cur.cancelled === 1
    && b.venue_bookings.awaiting_venue === 1 && b.venue_bookings.upcoming_7d === 1 && b.venue_bookings.cancelled.cur === 1
    && b.venue_bookings.value_sar.cur === 200 && b.venue_bookings.venues.in_app === 1 && b.venue_bookings.venues.pending === 1, JSON.stringify(b.venue_bookings));
  check('gym memberships: live, expiring, expired', b.memberships.live === 1 && b.memberships.expiring_7d === 1 && b.memberships.expired.cur === 1
    && b.memberships.new.cur === 2, JSON.stringify(b.memberships));
  check('coaching: approved coaches, waiting client requests, unclosed sessions', b.coaching.coaches_approved === 1 && b.coaching.link_requests.pending === 1
    && b.coaching.link_requests.pending_over_72h === 1 && b.coaching.sessions.stale_booked === 1, JSON.stringify(b.coaching));
  check('recovery requests waiting', b.recovery.open_requests === 1 && b.recovery.requests_over_24h === 1 && b.recovery.requests.cur === 1, JSON.stringify(b.recovery));
  check('meal subscriptions', b.meal_subscriptions.active === 1 && b.meal_subscriptions.open_requests === 1 && b.meal_subscriptions.requests_over_48h === 1
    && b.meal_subscriptions.active_without_meals_3d === 1, JSON.stringify(b.meal_subscriptions));
  const kinds = b.attention.map((x) => x.kind);
  check('bookings attention lists business names only, most urgent first', ['venue_unanswered_bookings', 'center_requests_waiting', 'restaurant_requests_waiting',
    'coach_requests_waiting', 'restaurant_no_meals_planned', 'coach_sessions_unclosed'].every((k) => kinds.includes(k))
    && b.attention.every((x, i, arr) => i === 0 || arr[i - 1].priority <= x.priority)
    && b.attention.find((x) => x.kind === 'venue_unanswered_bookings').name === 'Padel Hub'
    && b.attention.find((x) => x.kind === 'coach_requests_waiting').name === 'Coach Dana', kinds.join(','));

  const s = o.store;
  check('store: no orders or redemption yet', s.orders_enabled === false && s.redemption_enabled === false);
  check('store: stores and products', s.brands.live === 2 && s.brands.pending === 1 && s.products.live === 3 && s.products.sold_out === 1
    && s.products.low_stock === 1 && s.products.stock_untracked === 1, JSON.stringify([s.brands, s.products]));
  check('store: low-stock list (≤10) has brand, product and stock', s.products.low_stock_items.length === 2 && s.products.low_stock_items[0].product === 'Shirt'
    && s.products.low_stock_items[0].stock === 0 && s.products.low_stock_items[0].brand === 'Fit Wear' && s.products.low_stock_items[1].stock === 3);
  check('store: offers and their events', s.offers.live === 1 && s.offers.views.today === 1 && s.offers.views.cur === 1 && s.offers.views.prev === 1
    && s.offers.reveals.cur === 1 && s.offers.people.cur === 1, JSON.stringify(s.offers));
  check('store: followers, top brand and points', s.followers.total === 2 && s.top_brands[0].name === 'Fit Wear' && s.top_brands[0].followers === 2
    && s.rewards.points.cur === 10 && s.rewards.points.prev === 5 && s.rewards.earners_cur === 1, JSON.stringify([s.top_brands[0], s.rewards]));

  const c = o.community;
  check('community: posts (admin excluded), comments, reactions', c.posts.cur === 1 && c.posts.prev === 1 && c.posts.posters_cur === 1
    && c.posts.with_photo_cur === 1 && c.posts.wake_cur === 1 && c.comments.cur === 2 && c.reactions.cur === 2, JSON.stringify([c.posts, c.comments, c.reactions]));
  check('community: follows, friend requests, challenges, tips', c.follows.cur === 1 && c.friend_requests.prev === 1 && c.friend_requests.pending_over_7d === 1
    && c.challenges.ended_unsettled === 1 && c.tips.cur === 1, JSON.stringify([c.follows, c.friend_requests, c.challenges]));
  check('chats: counts only (admin messages excluded)', c.chats.messages.today === 2 && c.chats.messages.cur === 3 && c.chats.conversations.cur === 2
    && c.chats.senders.cur === 3 && c.chats.media.cur === 1 && c.chats.media_pct_cur === 33
    && c.chats.daily.reduce((n, d) => n + d.n, 0) === 3, JSON.stringify(c.chats));
  check('moderation: reported review with author username, reason and no text', c.moderation.reported.open === 1 && c.moderation.latest.length === 1
    && c.moderation.latest[0].kind === 'gym_review' && c.moderation.latest[0].author_username === 'khalid' && c.moderation.latest[0].reason === 'fake'
    && c.moderation.user_report_block === false, JSON.stringify(c.moderation));

  const p = o.partners;
  check('partners: pending per kind', p.pending.club === 1 && p.pending.store === 1 && p.pending.coach === 1 && p.pending.center === 1
    && p.pending.venue === 1 && p.pending_total === 5, JSON.stringify(p.pending));
  check('partners: the desk items, oldest first, with name/city/username', p.items.map((x) => x.kind).join() === 'venue,center,club,store,coach'
    && p.items[0].name === 'Court Club' && p.items[0].city === 'جدة' && p.items[2].name === 'Club One' && p.items[2].username === 'khalid'
    && p.items[1].city === 'الرياض' && p.items[4].name === 'Sara' && p.items.every((x) => x.agent_task === null), JSON.stringify(p.items));
  check('partners: pending_covered has every kind, all 0 before any agent task', Object.keys(p.pending_covered).sort().join() === 'center,club,coach,store,venue'
    && Object.values(p.pending_covered).every((v) => v === 0), JSON.stringify(p.pending_covered));

  const r = o.reports;
  check('reports: by status, received, newest new ones', r.by_status.new === 2 && r.by_status.seen === 1 && r.received.cur === 2
    && r.latest_new.length === 2 && r.latest_new[0].id === repA && r.latest_new[0].username === 'ahmed' && r.latest_new[0].category === 'bug', JSON.stringify(r.by_status));
  check('reports: new_covered is 0 before any agent task', r.new_covered === 0, JSON.stringify(r.new_covered));

  const m = o.marketing;
  check('marketing: the live ad and ad states', m.live_ad && m.live_ad.id === ad && m.live_ad.title === 'Promo' && m.ads.live === 1
    && m.ads.live_marketing === 1 && m.ads.ended === 1, JSON.stringify([m.live_ad, m.ads]));
  check('marketing: ad numbers current vs previous', m.ad_stats.cur.views === 1 && m.ad_stats.cur.clicks === 1 && m.ad_stats.cur.reach === 1
    && m.ad_stats.prev.views === 1, JSON.stringify(m.ad_stats));
  check('marketing: upcoming events (≤10) and nudges sent', m.events.upcoming.length <= 10 && m.events.upcoming.some((e) => e.title_en === 'Riyadh Run')
    && m.nudges.today === 1 && m.nudges.cur === 1 && m.nudges.prev === 1 && m.nudges.by_category_cur.gym === 1, JSON.stringify(m.nudges));

  check('ai: limits and usage per kind', o.ai.limits.barcode_per_day === 2 && o.ai.limits.meal_photos_per_day === 25
    && o.ai.usage.meal_photo.uses_cur === 1 && o.ai.usage.meal_photo.users_cur === 1 && o.ai.usage.plan.uses_prev === 1
    && o.ai.usage.office.uses_cur === 1 && o.ai.usage.barcode.uses_today === 1, JSON.stringify(o.ai));
  check('office: zero tasks yet, every status and desk present', o.office.waiting_total === 0 && Object.keys(o.office.by_status).length === 5
    && Object.keys(o.office.by_desk).length === 9 && o.office.by_desk.reports.waiting_approval === 0);

  // ===================================================================
  // office_admin: مخفي عن التطبيق تماماً
  // ===================================================================
  await expectErr('the admin’s app session can’t reach office_admin', () => as(U.E, `select office_admin.tasks()`), /permission denied/);
  await expectErr('a user can’t reach office_admin', () => as(U.A, `select office_admin.run_agent('lead')`), /permission denied/);
  await expectErr('signed-out visitors can’t reach office_admin', () => as(null, `select office_admin.admin_id()`), /permission denied/);
  const privs = await one(`select has_schema_privilege('authenticated', 'office_admin', 'USAGE') as au, has_schema_privilege('anon', 'office_admin', 'USAGE') as an,
    has_schema_privilege('service_role', 'office_admin', 'USAGE') as sr`);
  check('no schema access for anon/authenticated (service_role only)', !privs.au && !privs.an && privs.sr);
  const fnPrivs = await q(`select p.oid::regprocedure::text as fn,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as au, has_function_privilege('anon', p.oid, 'EXECUTE') as an,
      exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x where x.grantee = 0) as pub
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'office_admin'`);
  check('no office_admin function is executable by anon, authenticated or PUBLIC', fnPrivs.length >= 11 && fnPrivs.every((f) => !f.au && !f.an && !f.pub),
    JSON.stringify(fnPrivs.filter((f) => f.au || f.an || f.pub)));

  // ---------- المالك اللي نشتغل بهويته ----------
  check('admin_id: the only admin', (await one(`select office_admin.admin_id() as id`)).id === U.E);
  await q(`insert into app_admins (user_id) values ($1)`, [U.D]);
  await expectErr('two admins → choose_admin', () => q(`select office_admin.admin_id()`), /choose_admin/);
  const picked = await tx(async (t) => {
    await t.query(`select set_config('office.admin_id', $1, true)`, [U.E]);
    return (await t.query(`select office_admin.admin_id() as id`)).rows[0].id;
  });
  check('…unless the query picks one (office.admin_id)', picked === U.E);
  await expectErr('picking a non-admin → choose_admin', () => tx(async (t) => {
    await t.query(`select set_config('office.admin_id', $1, true)`, [U.A]);
    await t.query(`select office_admin.admin_id()`);
  }), /choose_admin/);
  await q(`delete from app_admins where user_id = $1`, [U.D]);
  const ident = await tx(async (t) => {
    const id = (await t.query(`select office_admin._as_admin() as id`)).rows[0].id;
    return { id, ...(await t.query(`select auth.uid() as uid, is_admin() as adm`)).rows[0] };
  });
  check('_as_admin: the rest of the transaction runs as the admin', ident.id === U.E && ident.uid === U.E && ident.adm === true, JSON.stringify(ident));
  check('…and only that transaction', (await one(`select auth.uid() as uid`)).uid === null);
  await expectErr('_as_admin refuses a session that carries another user’s token', () => tx(async (t) => {
    await t.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: U.A, role: 'authenticated' })]);
    await t.query(`select office_admin.tasks()`);
  }), /not_allowed/);
  await expectErr('_as_admin refuses the anon/authenticated roles even with access', () => tx(async (t) => {
    await t.exec(`grant usage on schema office_admin to authenticated; grant execute on function office_admin._as_admin() to authenticated`);
    await t.query(`set local role authenticated`);
    await t.query(`select office_admin._as_admin()`);
  }), /not_allowed/);

  // ===================================================================
  // مهام الوكلاء (مثل ما تكتبها دالة الخادم)
  // ===================================================================
  const addTask = async (desk, kind, tk, tid, status, output, input = {}, created = null) =>
    (await one(`insert into office_tasks (desk, kind, target_kind, target_id, title, status, output, input, created_by, created_at)
      values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, coalesce($10::timestamptz, now())) returning id`,
    [desk, kind, tk, tid, `${kind} ${tk ?? ''}`.trim(), status, output ? JSON.stringify(output) : null, JSON.stringify(input), U.E, created])).id;
  const bi = (s) => ({ ar: s, en: s });
  const PARTNER_OUT = { summary: bi('ok'), checks: [], missing: [], recommendation: 'approve', note: '', note_locale: 'ar', confidence: 'high' };
  const tReport = await addTask('reports', 'triage_report', 'report', repA, 'waiting_approval',
    { summary: bi('freeze'), severity: 'high', category_guess: 'bug', status: 'seen', reply: 'Thanks', reply_locale: 'en' }, { locale: 'en' }, '2026-01-01');
  const tReportB = await addTask('reports', 'triage_report', 'report', repB, 'waiting_approval',
    { summary: bi('idea'), severity: 'low', category_guess: 'idea', status: 'seen', reply: 'Nice idea', reply_locale: 'ar' });
  const tClub = await addTask('clubs', 'review_partner', 'club', club, 'waiting_approval', PARTNER_OUT);
  const tStore = await addTask('stores', 'review_partner', 'store', pendingStore, 'waiting_approval', { ...PARTNER_OUT, recommendation: 'reject', note: 'Add a logo' });
  const tVenue = await addTask('care', 'review_partner', 'venue', pendingVenue, 'waiting_approval', PARTNER_OUT);
  const tCenter = await addTask('care', 'review_partner', 'center', pendingCenter, 'waiting_approval', PARTNER_OUT);
  const tCoach = await addTask('coaches', 'review_partner', 'coach', U.B, 'waiting_approval', PARTNER_OUT);
  const tOldVenue = await addTask('care', 'review_partner', 'venue', venue, 'waiting_approval', PARTNER_OUT);
  const NUDGE_OUT = { why: bi('w'), template: { category: 'gym', gender: 'all', locale: 'ar', title: 'يلا {name}', body: 'النادي {gym} ينتظرك' } };
  const tNudge = await addTask('marketing', 'draft_nudge', null, null, 'waiting_approval', NUDGE_OUT, { brief: null });
  const tNudge2 = await addTask('marketing', 'draft_nudge', null, null, 'waiting_approval', NUDGE_OUT, { brief: null });
  const LIMITS_IN = { current: { barcode_per_day: 2, meal_photos_per_day: 25 }, usage: {} };
  const tLimits = await addTask('ai', 'review_ai_limits', null, null, 'waiting_approval', { why: bi('w'), barcode_per_day: 5, meal_photos_per_day: 30 }, LIMITS_IN);
  const tLimits2 = await addTask('ai', 'review_ai_limits', null, null, 'waiting_approval', { why: bi('w'), barcode_per_day: 3, meal_photos_per_day: 30 }, LIMITS_IN);
  const tBrief = await addTask('lead', 'daily_brief', null, null, 'done', { headline: bi('h'), points: [], priorities: [] });
  const tWorking = await addTask('lead', 'daily_brief', null, null, 'in_progress', null);

  const withTasks = await ov(7);
  check('overview: office tasks by status and desk', withTasks.office.waiting_total === 12 && withTasks.office.by_status.in_progress === 1
    && withTasks.office.by_desk.care.waiting_approval === 3 && withTasks.office.by_desk.lead.done === 1 && withTasks.office.working_total === 1
    && withTasks.office.oldest_waiting_at.startsWith('2026-01-01') && withTasks.ai.office_tasks_today === 13, JSON.stringify(withTasks.office.by_status));
  check('overview: desk items point at their open agent task', withTasks.partners.items.find((x) => x.kind === 'club').agent_task.id === tClub
    && withTasks.partners.items.find((x) => x.kind === 'club').agent_task.status === 'waiting_approval'
    && withTasks.reports.latest_new.find((x) => x.id === repA).agent_task.id === tReport);
  check('overview: covered = new reports / pending items with an open agent task (the task on the approved venue doesn’t count)',
    withTasks.reports.new_covered === 2 && ['club', 'store', 'coach', 'center', 'venue'].every((k) => withTasks.partners.pending_covered[k] === 1),
    JSON.stringify([withTasks.reports.new_covered, withTasks.partners.pending_covered]));
  if (process.env.OFFICE_WEB_SAMPLE) {
    fs.mkdirSync(path.dirname(process.env.OFFICE_WEB_SAMPLE), { recursive: true });
    fs.writeFileSync(process.env.OFFICE_WEB_SAMPLE, `${JSON.stringify(withTasks, null, 2)}\n`);
    console.log(JSON.stringify(withTasks, null, 2));
  }

  const tasks = (await one(`select office_admin.tasks(150) as t`)).t;
  const COLS = (await q(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'office_tasks' order by ordinal_position`)).map((x) => x.column_name);
  check('tasks(): every task, newest first, with every column', tasks.length === 14 && COLS.every((k) => k in tasks[0])
    && tasks.every((t, i) => i === 0 || tasks[i - 1].created_at >= t.created_at) && tasks[tasks.length - 1].id === tReport, `${tasks.length}`);
  const openOnly = (await one(`select office_admin.tasks(0) as t`)).t;
  check('tasks(0): only the open ones (all of them)', openOnly.length === 13 && openOnly.every((t) => t.status !== 'done' && t.status !== 'failed'));

  // ---------- اعتماد اقتراح: كل نوع ----------
  const apply = (id, fin) => q(`select office_admin.apply($1, $2::jsonb) as r`, [id, JSON.stringify(fin)]);
  const task = (id) => one(`select * from office_tasks where id = $1`, [id]);
  await expectErr('apply: final must be an object', () => q(`select office_admin.apply($1, '[1]'::jsonb)`, [tReport]), /bad_input/);
  await expectErr('apply: report status must be seen/fixed/wontfix', () => apply(tReport, { status: 'maybe', reply: 'x' }), /bad_input/);
  await expectErr('apply: the reply is at most 1000 characters', () => apply(tReport, { status: 'fixed', reply: 'x'.repeat(1001) }), /bad_input/);
  const res = (await apply(tReport, { status: 'fixed', reply: '  Thanks, fixed in the next update  ' }))[0].r;
  let row = await task(tReport);
  const fb = await one(`select status, admin_note from beta_feedback where id = $1`, [repA]);
  check('apply triage_report: report updated, task approved with the cleaned final', res.ok === true && fb.status === 'fixed'
    && fb.admin_note === 'Thanks, fixed in the next update' && row.status === 'done' && row.decision === 'approved' && row.decided_by === U.E
    && row.final.status === 'fixed' && row.final.reply === 'Thanks, fixed in the next update', JSON.stringify([fb, row.final]));
  check('…and both actions are in the admin log as the admin', (await one(`select count(*)::int n from admin_log where kind = 'office' and target = $1 and admin_id = $2 and action = 'approved'`, [tReport, U.E])).n === 1);
  await expectErr('apply again → not_waiting', () => apply(tReport, { status: 'fixed', reply: '' }), /not_waiting/);
  await q(`update beta_feedback set status = 'seen' where id = $1`, [repB]);
  await expectErr('apply when the report was handled by hand → already_decided', () => apply(tReportB, { status: 'fixed', reply: 'x' }), /already_decided/);
  check('…and nothing changed (one transaction)', (await task(tReportB)).status === 'waiting_approval'
    && (await one(`select admin_note from beta_feedback where id = $1`, [repB])).admin_note === null);

  await apply(tClub, { decision: 'approve', note: 'not sent on approve' });
  const cr = await one(`select status, review_note, chain_id from club_requests where id = $1`, [club]);
  row = await task(tClub);
  check('apply review_partner (club approve): request approved, club partner, note dropped', cr.status === 'approved' && !!cr.chain_id
    && (await one(`select account_type from profiles where id = $1`, [U.C])).account_type === 'club' && row.decision === 'approved'
    && row.final.decision === 'approve' && row.final.note === '', JSON.stringify([cr, row.final]));
  await expectErr('apply store reject needs a note (≥3)', () => apply(tStore, { decision: 'reject', note: ' x ' }), /note_required/);
  await expectErr('apply partner decision must be approve/reject', () => apply(tStore, { decision: 'hide', note: 'whatever' }), /bad_input/);
  await apply(tStore, { decision: 'reject', note: '  Please add a logo  ' });
  const st = await one(`select status, review_note from brands where id = $1`, [pendingStore]);
  check('apply review_partner (store reject): store rejected with the note', st.status === 'rejected' && st.review_note === 'Please add a logo'
    && (await task(tStore)).final.note === 'Please add a logo', JSON.stringify(st));
  await apply(tVenue, { decision: 'approve', note: '' });
  check('apply review_partner (venue approve)', (await one(`select status from venues where id = $1`, [pendingVenue])).status === 'approved');
  await apply(tCenter, { decision: 'reject', note: 'License number missing' });
  check('apply review_partner (center reject)', (await one(`select status, review_note from recovery_centers where id = $1`, [pendingCenter])).status === 'rejected');
  await apply(tCoach, { decision: 'approve' });
  check('apply review_partner (coach approve): verified coach', (await one(`select status from coach_profiles where user_id = $1`, [U.B])).status === 'approved'
    && (await one(`select is_coach from profiles where id = $1`, [U.B])).is_coach === true);
  await expectErr('apply on an item that isn’t pending anymore → already_decided', () => apply(tOldVenue, { decision: 'approve' }), /already_decided/);

  await expectErr('apply nudge: a placeholder that isn’t allowed for the category', () =>
    apply(tNudge, { template: { ...NUDGE_OUT.template, body: 'صديقك {friend} سبقك' } }), /bad_nudge/);
  await expectErr('apply nudge: template required', () => apply(tNudge, { why: 'x' }), /bad_input/);
  await expectErr('apply nudge: unknown gender', () => apply(tNudge, { template: { ...NUDGE_OUT.template, gender: 'kids' } }), /bad_input/);
  await apply(tNudge, { template: { ...NUDGE_OUT.template, title: '  يلا {name}  ' } });
  const nt = await one(`select * from nudge_templates where title = 'يلا {name}' order by created_at desc limit 1`);
  check('apply draft_nudge: saved paused, friend_gender all, created by the admin', nt && nt.active === false && nt.friend_gender === 'all'
    && nt.category === 'gym' && nt.created_by === U.E && (await task(tNudge)).final.template.title === 'يلا {name}');

  await expectErr('apply limits: numbers required', () => apply(tLimits, { barcode_per_day: 'abc', meal_photos_per_day: 30 }), /bad_input/);
  await apply(tLimits, { barcode_per_day: '٥', meal_photos_per_day: 300.4 });
  const lim = (await one(`select value from app_settings where key = 'ai_limits'`)).value;
  check('apply review_ai_limits: saved clamped (Arabic digits ok)', lim.barcode_per_day === 5 && lim.meal_photos_per_day === 200
    && (await task(tLimits)).final.meal_photos_per_day === 200, JSON.stringify(lim));
  await expectErr('apply limits built on old limits → already_decided', () => apply(tLimits2, { barcode_per_day: 3, meal_photos_per_day: 30 }), /already_decided/);

  await expectErr('apply on a task still in progress → not_waiting', () => apply(tWorking, {}), /not_waiting/);
  await expectErr('apply on the daily brief → not_waiting', () => apply(tBrief, {}), /not_waiting/);
  await expectErr('apply on an unknown task → not_waiting', () => apply('99999999-0000-4000-8000-000000000000', {}), /not_waiting/);

  // ---------- رفض اقتراح ----------
  const rj = (await one(`select office_admin.reject($1, '  Not now  ') as r`, [tNudge2])).r;
  row = await task(tNudge2);
  check('reject: decision recorded with the note, nothing applied', rj.ok === true && row.status === 'done' && row.decision === 'rejected'
    && row.decision_note === 'Not now' && row.final === null && row.decided_by === U.E);
  await expectErr('reject again → not_waiting', () => q(`select office_admin.reject($1)`, [tNudge2]), /not_waiting/);

  // ---------- قرارك أنت على طلب شريك ----------
  const club2 = (await one(`insert into club_requests (user_id, club_name, role, phone) values ($1, 'Club Two', 'manager', '0550000000') returning id`, [F])).id;
  const store2 = (await one(`insert into brands (owner, name, category, status) values ($1, 'Second Store', 'equipment', 'pending') returning id`, [F])).id;
  await expectErr('review: reject needs a note', () => q(`select office_admin.review('club', $1, 'reject', 'no')`, [club2]), /note_required/);
  await expectErr('review: unknown kind', () => q(`select office_admin.review('gym', $1, 'approve')`, [club2]), /bad_input/);
  await expectErr('review: unknown decision', () => q(`select office_admin.review('club', $1, 'maybe')`, [club2]), /bad_status/);
  await expectErr('review: unknown item', () => q(`select office_admin.review('store', $1, 'approve')`, ['99999999-0000-4000-8000-000000000000']), /request_not_found/);
  await q(`select office_admin.review('club', $1, 'reject', 'Please attach the CR document')`, [club2]);
  const cr2 = await one(`select status, review_note, reviewed_by from club_requests where id = $1`, [club2]);
  check('review club reject: same as the app (note, reviewer = admin)', cr2.status === 'rejected' && cr2.review_note === 'Please attach the CR document' && cr2.reviewed_by === U.E);
  await expectErr('review again → already_decided', () => q(`select office_admin.review('club', $1, 'approve')`, [club2]), /already_decided/);
  await q(`select office_admin.review('store', $1, 'approve', 'ignored on approve')`, [store2]);
  const st2 = await one(`select status, review_note from brands where id = $1`, [store2]);
  check('review store approve', st2.status === 'approved' && st2.review_note === null
    && (await one(`select count(*)::int n from admin_log where kind = 'store' and target = $1 and action = 'approve' and admin_id = $2`, [store2, U.E])).n === 1);
  // اعتماد المدرب يحط is_coach بس، واعتماد المتجر يغيّر حالته بس: partner_intent يبقى، بس ما يطلعون «ينتظرون»
  const piAfter = (await ov(7)).activity.partner_intent;
  check('partner_intent: approved through the office → no longer waiting (coach Sara, store owner Fahad), though partner_intent stays',
    (await one(`select count(*)::int as n from profiles where id in ($1, $2) and partner_intent is not null`, [U.B, F])).n === 2
    && piAfter.total === 0 && piAfter.no_submission === 0 && Object.values(piAfter.by_kind).every((v) => v === 0), JSON.stringify(piAfter));

  // ---------- حالة بلاغ ----------
  await q(`select office_admin.report($1, 'fixed', '  Fixed now  ')`, [repC]);
  let rc = await one(`select status, admin_note from beta_feedback where id = $1`, [repC]);
  check('report: status and reply saved', rc.status === 'fixed' && rc.admin_note === 'Fixed now');
  await q(`select office_admin.report($1, 'wontfix')`, [repC]);
  rc = await one(`select status, admin_note from beta_feedback where id = $1`, [repC]);
  check('report: no note keeps the old reply', rc.status === 'wontfix' && rc.admin_note === 'Fixed now');
  await q(`select office_admin.report($1, 'seen', '')`, [repC]);
  check('report: empty note clears it', (await one(`select admin_note from beta_feedback where id = $1`, [repC])).admin_note === null);
  await expectErr('report: unknown status', () => q(`select office_admin.report($1, 'closed')`, [repC]), /bad_status/);
  await expectErr('report: note too long', () => q(`select office_admin.report($1, 'seen', $2)`, [repC, 'x'.repeat(1001)]), /bad_input/);
  await expectErr('report: unknown report', () => q(`select office_admin.report($1, 'seen')`, ['99999999-0000-4000-8000-000000000000']), /report_not_found/);

  // ===================================================================
  // partner_intent: كل سبب لحاله (ناس جدد) — أي شي معتمد أو موقوف بعد اعتماد يطلّعه، والمرفوض لا
  // ===================================================================
  const piBase = (await ov(7)).activity.partner_intent;
  const NU = (i) => `77777777-0000-4000-8000-00000000000${i}`;
  for (let i = 1; i <= 7; i++) await q(`insert into auth.users (id, raw_user_meta_data) values ($1, $2::jsonb)`, [NU(i), JSON.stringify({ username: `intent${i}` })]);
  await q(`update profiles set is_coach = true, partner_intent = 'coach' where id = $1`, [NU(1)]);
  await q(`update profiles set partner_intent = 'coach' where id = $1`, [NU(2)]);
  await q(`insert into coach_profiles (user_id, status) values ($1, 'suspended')`, [NU(2)]);
  await q(`update profiles set partner_intent = 'club' where id = $1`, [NU(3)]);
  await q(`insert into club_requests (user_id, club_name, role, phone, status) values ($1, 'Intent Club', 'owner', '0550000003', 'approved')`, [NU(3)]);
  await q(`update profiles set partner_intent = 'venue' where id = $1`, [NU(4)]);
  await q(`insert into venues (owner, listed_by, sports, name, city, status) values ($1, 'owner', '{padel}', 'Intent Venue', 'الرياض', 'suspended')`, [NU(4)]);
  await q(`update profiles set partner_intent = 'center' where id = $1`, [NU(5)]);
  await q(`insert into recovery_centers (owner, listed_by, name, kind, cities, status) values ($1, 'owner', 'Intent Center', 'physio', '{الرياض}', 'approved')`, [NU(5)]);
  await q(`update profiles set partner_intent = 'store' where id = $1`, [NU(6)]);
  await q(`insert into brands (owner, name, category, status, review_note) values ($1, 'Intent Store', 'apparel', 'rejected', 'No logo')`, [NU(6)]);
  await q(`update profiles set partner_intent = 'venue' where id = $1`, [NU(7)]);
  const pi = (await ov(7)).activity.partner_intent;
  const dk = (k) => pi.by_kind[k] - piBase.by_kind[k];
  check('partner_intent: verified coach, suspended coach profile, approved club request, suspended venue and approved center are left out',
    dk('coach') === 0 && dk('club') === 0 && dk('center') === 0, JSON.stringify([piBase, pi]));
  check('…a rejected store still counts (with a submission), and so does someone who sent nothing', pi.total - piBase.total === 2
    && pi.no_submission - piBase.no_submission === 1 && dk('store') === 1 && dk('venue') === 1, JSON.stringify([piBase, pi]));

  // ===================================================================
  // التغطية: كم من الجديد/المعلّق عليه مهمة وكيل مفتوحة — على الكل، مو بس القوائم المقصوصة (٢٠ بلاغ، ٢٥ طلب)
  // ===================================================================
  const cov0 = await ov(7);
  const covTasks = [];
  const covTask = async (...args) => { const id = await addTask(...args); covTasks.push(id); return id; };
  // ٢٢ بلاغ جديد (Cover 1 الأحدث): القائمة تعرض أحدث ٢٠ بس
  const covReps = (await q(`insert into beta_feedback (user_id, category, message, created_at)
    select $1, 'bug', 'Cover ' || i, now() - make_interval(mins => i) from generate_series(1, 22) i returning id, message`, [U.A]))
    .sort((x, y) => Number(x.message.slice(6)) - Number(y.message.slice(6))).map((x) => x.id);
  const TRIAGE_OUT = { summary: bi('s'), severity: 'low', category_guess: 'bug', status: 'seen', reply: '', reply_locale: 'ar' };
  await covTask('reports', 'triage_report', 'report', covReps[21], 'waiting_approval', TRIAGE_OUT); // الأقدم: برا القائمة
  await covTask('reports', 'triage_report', 'report', covReps[20], 'in_progress', null); // برا القائمة
  await covTask('reports', 'triage_report', 'report', covReps[0], 'scheduled', null); // الأحدث: بالقائمة
  await covTask('reports', 'triage_report', 'report', covReps[1], 'done', TRIAGE_OUT); // خلصت: ما تنحسب
  await covTask('reports', 'triage_report', 'report', covReps[2], 'failed', null); // فشلت: ما تنحسب
  await covTask('reports', 'triage_report', 'report', repC, 'waiting_approval', TRIAGE_OUT); // بلاغ مو جديد: ما ينحسب
  // ٢٦ متجر معلّق (الأحدث برا أول ٢٥ في items) + طلب معلّق من كل نوع ثاني
  const covStores = (await q(`insert into brands (owner, name, category, status, created_at)
    select null, 'Cover Store ' || i, 'apparel', 'pending', now() - make_interval(mins => i) from generate_series(1, 26) i returning id, name`))
    .sort((x, y) => Number(x.name.slice(12)) - Number(y.name.slice(12))).map((x) => x.id);
  const covClub = (await one(`insert into club_requests (user_id, club_name, role, phone) values ($1, 'Cover Club', 'owner', '0550000009') returning id`, [NU(6)])).id;
  await q(`insert into coach_profiles (user_id, status, submitted_at) values ($1, 'pending', now())`, [U.C]);
  const covCenter = (await one(`insert into recovery_centers (owner, listed_by, name, kind, cities, status)
    values ($1, 'owner', 'Cover Center', 'physio', '{الرياض}', 'pending') returning id`, [U.B])).id;
  const covVenue = (await one(`insert into venues (owner, listed_by, sports, name, city, status) values ($1, 'owner', '{padel}', 'Cover Venue', 'جدة', 'pending') returning id`, [NU(7)])).id;
  await covTask('stores', 'review_partner', 'store', covStores[0], 'waiting_approval', PARTNER_OUT); // الأحدث: برا items
  await covTask('stores', 'review_partner', 'store', covStores[25], 'in_progress', null); // الأقدم: داخل items
  await covTask('stores', 'review_partner', 'store', covStores[1], 'done', PARTNER_OUT); // خلصت: ما تنحسب
  await covTask('clubs', 'review_partner', 'club', covClub, 'scheduled', null);
  await covTask('coaches', 'review_partner', 'coach', U.C, 'waiting_approval', PARTNER_OUT);
  await covTask('care', 'review_partner', 'center', covCenter, 'waiting_approval', PARTNER_OUT);
  await covTask('care', 'review_partner', 'venue', covVenue, 'waiting_approval', PARTNER_OUT);
  await covTask('care', 'review_partner', 'center', pendingCenter, 'waiting_approval', PARTNER_OUT); // مركز مرفوض: ما ينحسب
  const cov = await ov(7);
  check('new_covered counts every new report with an open task, not just the 20 listed', cov.reports.by_status.new - cov0.reports.by_status.new === 22
    && cov.reports.latest_new.length === 20 && cov.reports.latest_new.filter((x) => x.agent_task).length === 1
    && cov.reports.new_covered - cov0.reports.new_covered === 3, JSON.stringify([cov0.reports.new_covered, cov.reports.new_covered]));
  const dc = (k) => cov.partners.pending_covered[k] - cov0.partners.pending_covered[k];
  check('pending_covered counts every pending item with an open task, per kind, not just the 25 listed', cov.partners.items.length === 25
    && cov.partners.items.filter((x) => x.kind === 'store' && x.agent_task).length === 1
    && dc('store') === 2 && dc('club') === 1 && dc('coach') === 1 && dc('center') === 1 && dc('venue') === 1
    && ['club', 'store', 'coach', 'center', 'venue'].every((k) => cov.partners.pending_covered[k] <= cov.partners.pending[k]),
    JSON.stringify([cov0.partners.pending_covered, cov.partners.pending_covered]));
  // ننظّف عشان ما تأثر على حد التشغيل تحت
  await q(`delete from office_tasks where id = any($1::uuid[])`, [covTasks]);
  await q(`delete from beta_feedback where id = any($1::uuid[])`, [covReps]);
  await q(`delete from brands where id = any($1::uuid[])`, [covStores]);

  // ===================================================================
  // تشغيل وكيل من الويب: vault و pg_net
  // ===================================================================
  /** office_agent_key_ok بدور معيّن (service_role مثل الخادم) و/أو claims مثل طلب الـ API */
  const keyOk = (role, key, claims = null) => tx(async (t) => {
    if (claims) await t.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    if (role) await t.query(`set local role ${role}`);
    return (await t.query(`select office_agent_key_ok($1) as ok`, [key])).rows[0].ok;
  });
  await expectErr('run_agent: no vault → agent_not_configured', () => q(`select office_admin.run_agent('lead')`), /agent_not_configured/);
  await expectErr('run_agent: trainees desk has no agent', () => q(`select office_admin.run_agent('users')`), /agent_unavailable/);
  await expectErr('run_agent: the new web desks have no agent', () => q(`select office_admin.run_agent('community')`), /agent_unavailable/);
  await expectErr('run_agent: unknown desk', () => q(`select office_admin.run_agent('nope')`), /bad_input/);
  check('office_agent_key_ok: no vault → false (as the service role)', (await keyOk('service_role', 'abc')) === false);
  // vault صغير: جدول أسرار + عرض decrypted_secrets + create_secret (نفس أسماء Supabase)
  await db.exec(`create schema vault;
    create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, description text, secret text not null,
                                created_at timestamptz not null default now());
    create view vault.decrypted_secrets as select id, name, description, secret, secret as decrypted_secret, created_at from vault.secrets;
    create function vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null)
      returns uuid language sql as $$ insert into vault.secrets (name, description, secret) values (new_name, new_description, new_secret) returning id $$;`);
  let rerun = true;
  try { await db.exec(fs.readFileSync(MIG, 'utf8')); } catch (e) { rerun = false; console.log(e.message); }
  const key1 = await q(`select secret from vault.secrets where name = 'office_agent_key'`);
  check('the migration creates the web key in vault once vault exists', rerun && key1.length === 1 && /^[0-9a-f]{64}$/.test(key1[0].secret), key1[0]?.secret);
  try { await db.exec(fs.readFileSync(MIG, 'utf8')); } catch (e) { rerun = false; console.log(e.message); }
  const key2 = await q(`select secret from vault.secrets where name = 'office_agent_key'`);
  check('re-running the migration keeps the same key (and doesn’t fail)', rerun && key2.length === 1 && key2[0].secret === key1[0].secret);
  check('…office_admin stays closed after the re-run', (await q(`select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'office_admin' and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))`)).length === 0
    && (await ov(7)).meta.days === 7);
  const KEY = key1[0].secret;

  await expectErr('run_agent: key but no URL → agent_not_configured', () => q(`select office_admin.run_agent('lead')`), /agent_not_configured/);
  await q(`select vault.create_secret('https://example.supabase.co/functions/v1/office-agent', 'office_agent_url')`);
  await expectErr('run_agent: no pg_net → agent_not_configured', () => q(`select office_admin.run_agent('lead')`), /agent_not_configured/);
  // pg_net صغير: يسجّل الطلب ويرجع رقمه
  await db.exec(`create schema net;
    create table net.calls (id bigserial primary key, url text, body jsonb, headers jsonb, timeout_milliseconds int);
    create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
                                  headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000)
      returns bigint language sql as $$ insert into net.calls (url, body, headers, timeout_milliseconds)
        values (url, body, headers, timeout_milliseconds) returning id $$;`);
  const brief = `  <b>Ramadan</b>\n\toffer ${'x'.repeat(400)}`;
  const run = (await one(`select office_admin.run_agent('marketing', $1) as r`, [brief])).r;
  const call = await one(`select * from net.calls order by id desc limit 1`);
  check('run_agent: queued with the pg_net request id', run.queued === true && run.request_id === Number(call.id), JSON.stringify(run));
  check('run_agent: posts desk, cleaned brief and admin id to the function URL', call.url === 'https://example.supabase.co/functions/v1/office-agent'
    && call.body.desk === 'marketing' && call.body.admin_id === U.E && !/[<>\n\t]/.test(call.body.brief) && call.body.brief.length === 300
    && call.body.brief.startsWith('b Ramadan /b offer x') && call.timeout_milliseconds === 1000, JSON.stringify(call.body).slice(0, 120));
  check('run_agent: the web key travels in x-office-key', call.headers['x-office-key'] === KEY && call.headers['Content-Type'] === 'application/json');
  await one(`select office_admin.run_agent('lead', '   ') as r`);
  check('run_agent: an empty brief is sent as null', (await one(`select body from net.calls order by id desc limit 1`)).body.brief === null);
  await q(`insert into office_tasks (desk, kind, status, created_by) select 'lead', 'daily_brief', 'done', $1 from generate_series(1, 80)`, [U.E]);
  await expectErr('run_agent: 80 tasks in 24h → rate_limited (same limit as the function)', () => q(`select office_admin.run_agent('lead')`), /rate_limited/);
  await q(`update office_tasks set created_at = now() - interval '25 hours' where kind = 'daily_brief' and status = 'done' and output is null`);
  check('…and it frees up after a day', (await one(`select office_admin.run_agent('lead') as r`)).r.queued === true);

  // ---------- مفتاح الويب ----------
  check('key ok: the service role with the right key', (await keyOk('service_role', KEY)) === true);
  check('key ok: a wrong key, an empty key or no key → false', (await keyOk('service_role', KEY.slice(0, -1) + 'x')) === false
    && (await keyOk('service_role', '')) === false && (await keyOk('service_role', null)) === false);
  check('key ok: service_role claims (API) with the right key', (await keyOk(null, KEY, { role: 'service_role' })) === true);
  check('key ok: a plain database session is not the service role → false', (await keyOk(null, KEY)) === false);
  await expectErr('key ok: the app (authenticated) can’t call it', () => as(U.E, `select office_agent_key_ok($1)`, [KEY]), /permission denied/);
  await expectErr('key ok: anon can’t call it', () => as(null, `select office_agent_key_ok($1)`, [KEY]), /permission denied/);
  await q(`grant execute on function office_agent_key_ok(text) to authenticated`);
  check('key ok: …and its own guard says false to the app even with access', (await as(U.E, `select office_agent_key_ok($1) as ok`, [KEY]))[0].ok === false);
  await q(`revoke execute on function office_agent_key_ok(text) from authenticated`);
  await q(`delete from vault.secrets where name = 'office_agent_key'`);
  check('key ok: no key in vault → false', (await keyOk('service_role', KEY)) === false);
  await expectErr('run_agent: no key in vault → agent_not_configured', () => q(`select office_admin.run_agent('lead')`), /agent_not_configured/);

  console.log(failed() ? `\n${failed()} FAIL` : '\nall office web checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
