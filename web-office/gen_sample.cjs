// يبني sample.json: نتيجة office_overview تجريبية (٧ أيام و٣٠ يوم) + صفوف office_tasks تجريبية.
// كل الأسماء والأرقام وهمية (أسماء فيها «تجريبي» / Demo / Sample). الشكل لازم يطابق overview.sample.json (نتيجة حقيقية
// من اختبار القاعدة) مفتاح بمفتاح — السكربت يتأكد من هذا ويطيح لو فيه فرق.
// التشغيل: node gen_sample.cjs
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const NOW = Date.parse('2026-10-07T06:12:00.000Z'); // 09:12 بتوقيت الرياض
const TODAY = '2026-10-07';
const ADMIN = '00000000-0000-4000-8000-00000000a001';

const iso = (ms) => new Date(ms).toISOString().replace('Z', '+00:00');
const ago = (min) => iso(NOW - min * 60_000);
const ahead = (min) => iso(NOW + min * 60_000);
const day = (d, off) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + off); return t.toISOString().slice(0, 10); };
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const uid = (n) => `5a3e0000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** سلسلة يومية مجموعها total، اليوم الأخير (اليوم) ناقص لأنه لسا ما خلص */
function series(days, total, todayN) {
  if (days === 1) return [{ day: TODAY, n: total }];
  const w = [];
  for (let i = 0; i < days - 1; i++) {
    const dow = new Date(`${day(TODAY, -(days - 1) + i)}T00:00:00Z`).getUTCDay();
    w.push((dow === 5 ? 0.7 : dow === 6 ? 0.85 : 1) * (0.8 + rnd() * 0.45));
  }
  const rest = total - todayN;
  const sum = w.reduce((a, b) => a + b, 0);
  const out = w.map((x) => Math.floor((x / sum) * rest));
  let left = rest - out.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0; i = (i + 1) % out.length, left--) out[i]++;
  out.push(todayN);
  return out.map((n, i) => ({ day: day(TODAY, -(days - 1) + i), n }));
}

function overview(D, tasks) {
  // قيم الفترة: الرقم المكتوب لأسبوع، ولـ٣٠ يوم نكبّره تقريباً
  const w = (v7) => (D === 7 ? v7 : Math.round(v7 * (30 / 7) * (0.94 + rnd() * 0.1)));
  const signupsCur = w(96), checkinsCur = w(1046), chatsCur = w(2210);
  const posts = series(D, w(164), 23), comments = series(D, w(309), 41), reactions = series(D, w(1204), 156);
  const active = series(D, w(611), 214).map((x, i, a) => ({ day: x.day, n: i === a.length - 1 ? 214 : 160 + Math.round(rnd() * 90) }));
  const byStatus = { pending: w(5), confirmed: w(9), declined: w(2), cancelled: w(4), done: w(19), no_show: w(2) };
  const vbCur = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const nudgeCats = { gym: w(402), friend: w(188), streak: w(231), workout: w(127), meal: w(64) };
  const office = officeCounts(tasks);
  return {
    meta: {
      generated_at: iso(NOW), days: D, today: TODAY, cur_from: day(TODAY, -(D - 1)), prev_from: day(TODAY, -(2 * D - 1)),
      prev_to: day(TODAY, -D), timezone: 'Asia/Riyadh',
    },
    activity: {
      users: { total: 1284, trainees: 1236, partners: 48, by_account_type: { trainee: 1236, club: 14, coach: 11, store: 9, restaurant: 5, center: 4, venue: 5 } },
      signups: { today: 9, cur: signupsCur, prev: w(71), daily: series(D, signupsCur, 9) },
      active_users: { today: 214, cur: w(611) > 1284 ? 1104 : w(611), prev: w(574) > 1284 ? 1062 : w(574), daily: active },
      checkins: { today: 132, cur: checkinsCur, prev: w(988), users_cur: D === 7 ? 402 : 688, present_now: 37, daily: series(D, checkinsCur, 132) },
      top_gyms: [
        { id: uid(101), name: 'نادي تجريبي - العليا', name_en: 'Demo Gym - Olaya', n: w(214), users: w(88) },
        { id: uid(102), name: 'نادي تجريبي - الخبر', name_en: 'Demo Gym - Khobar', n: w(187), users: w(71) },
        { id: uid(103), name: 'نادي تجريبي - النرجس', name_en: 'Demo Gym - Narjis', n: w(163), users: w(64) },
        { id: uid(104), name: 'صالة اللياقة التجريبية', name_en: null, n: w(121), users: w(49) },
        { id: uid(105), name: 'نادي تجريبي - الكورنيش', name_en: 'Demo Gym - Corniche', n: w(96), users: w(40) },
        { id: uid(106), name: 'نادي تجريبي - الصحافة', name_en: 'Demo Gym - Sahafa', n: w(58), users: w(26) },
      ],
      workouts: { today: 88, cur: w(742), prev: w(701), users_cur: D === 7 ? 318 : 571, finished_cur: w(655), plan_days_cur: w(214), plan_days_prev: w(196) },
      errors: {
        today: 4, cur: w(23), prev: w(31), users_cur: D === 7 ? 14 : 37,
        top: [
          { kind: 'screen_error', n: w(9), users: w(6) }, { kind: 'js_fatal', n: w(5), users: w(4) }, { kind: 'js_fatal_prev', n: w(5), users: w(4) },
          { kind: 'checkin_locate_fail', n: w(3), users: w(3) }, { kind: 'office3d_error', n: 1, users: 1 },
        ],
      },
      partner_intent: { total: 6, no_submission: 4, by_kind: { club: 2, store: 1, coach: 2, center: 0, venue: 1 } },
    },
    bookings: {
      venue_bookings: {
        created: { today: 6, cur: vbCur, prev: w(33) }, courts_cur: Math.round(vbCur * 0.7), classes_cur: vbCur - Math.round(vbCur * 0.7),
        by_status_cur: byStatus, today: { total: 7, pending: 2 }, upcoming_7d: 14, awaiting_venue: 4,
        cancelled: { cur: byStatus.cancelled, prev: w(6) }, declined_cur: byStatus.declined, value_sar: { cur: w(3150), prev: w(2640) },
        stale_pending: 1, unclosed: 2, venues: { in_app: 5, directory: 22, pending: 1, hidden: 1 },
      },
      gym_classes: {
        created: { today: 12, cur: w(86), prev: w(74) }, today: { booked: 18, waitlist: 3 }, upcoming_7d: { booked: 64, waitlist: 7 },
        cancelled: { cur: w(9), prev: w(11) }, active_classes: 26,
      },
      memberships: {
        live: 412, active: 398, frozen: 14, upcoming: 9, new: { today: 3, cur: w(27), prev: w(22) }, expiring_7d: 18,
        expired: { cur: w(15), prev: w(12) }, requests_pending: 3, requests_over_48h: 1,
      },
      coaching: {
        coaches_approved: 11, clients_active: 37, link_requests: { pending: 4, pending_over_72h: 1, cur: w(6), prev: w(5) },
        sessions: { today: 5, upcoming_7d: 23, done: { cur: w(31), prev: w(28) }, cancelled_cur: w(3), no_show_cur: w(1), stale_booked: 2 },
      },
      recovery: {
        requests: { today: 2, cur: w(13), prev: w(9) }, open_requests: 3, requests_over_24h: 1, today: 2, upcoming_7d: 6,
        done_cur: w(8), declined_cur: w(1), cancelled: { cur: w(1), prev: w(2) }, unclosed: 0,
      },
      meal_subscriptions: {
        active: 21, subscribers: 19, restaurants: 3, requests: { today: 1, cur: w(7), prev: w(5) }, open_requests: 2, requests_over_48h: 1,
        ended: { cur: w(2), prev: w(3) }, declined_cur: 0, meals_today: 34, active_without_meals_3d: 1,
      },
      attention: [
        { priority: 1, kind: 'venue_unanswered_bookings', target: 'venue', id: uid(201), name: 'Demo Padel Arena', n: 2, since: ago(60 * 14) },
        { priority: 1, kind: 'center_requests_waiting', target: 'center', id: uid(202), name: 'مركز الاستشفاء التجريبي', n: 1, since: ago(60 * 30) },
        { priority: 1, kind: 'restaurant_requests_waiting', target: 'store', id: uid(203), name: 'Sample Green Bowl', n: 1, since: ago(60 * 52) },
        { priority: 1, kind: 'gym_requests_waiting', target: 'gym', id: uid(101), name: 'نادي تجريبي - العليا', n: 1, since: ago(60 * 61) },
        { priority: 2, kind: 'coach_requests_waiting', target: 'coach', id: uid(204), name: 'Demo Coach Dana', n: 1, since: ago(60 * 80) },
        { priority: 2, kind: 'venue_expired_requests', target: 'venue', id: uid(205), name: 'Demo Court Club', n: 1, since: ago(60 * 26) },
        { priority: 2, kind: 'restaurant_no_meals_planned', target: 'store', id: uid(203), name: 'Sample Green Bowl', n: 1, since: ago(60 * 20) },
        { priority: 3, kind: 'coach_sessions_unclosed', target: 'coach', id: uid(204), name: 'Demo Coach Dana', n: 2, since: ago(60 * 40) },
      ],
    },
    store: {
      orders_enabled: false, redemption_enabled: false,
      brands: { live: 14, live_partner: 9, live_unclaimed: 5, live_restaurants: 5, pending: 2, rejected: 1, suspended: 0, new: { today: 0, cur: w(3), prev: w(2) } },
      products: {
        live: 186, new: { cur: w(12), prev: w(9) }, sold_out: 4, low_stock: 7, stock_untracked: 41, no_price: 3, avg_price_sar: 89.5,
        low_stock_items: [
          ['Sample Fit Wear', 'تيشيرت تدريب أسود', 0], ['Sample Fit Wear', 'Training Shorts', 0], ['متجر المكملات التجريبي', 'واي بروتين 2 كجم', 0],
          ['Demo Gear', 'Lifting Straps', 0], ['متجر المكملات التجريبي', 'كرياتين 300 جم', 1], ['Demo Gear', 'Resistance Bands Set', 2],
          ['Sample Fit Wear', 'Hoodie — M', 3], ['Demo Gear', 'Jump Rope Pro', 4], ['متجر المكملات التجريبي', 'Electrolyte Mix', 5], ['Sample Fit Wear', 'Socks 3-pack', 5],
        ].map(([brand, product, stock], i) => ({ product_id: uid(300 + i), product, brand_id: uid(400 + (brand.length % 3)), brand, stock })),
      },
      offers: {
        live: 11, ending_3d: 2, expired_still_active: 1, views: { today: 64, cur: w(518), prev: w(446) }, reveals: { cur: w(87), prev: w(71) },
        visits: { cur: w(42), prev: w(39) }, people: { cur: w(233), prev: w(207) },
      },
      followers: { total: 642, new: { cur: w(58), prev: w(47) } },
      top_brands: [
        { id: uid(400), name: 'Sample Fit Wear', category: 'apparel', city: 'جدة', engagement: w(96), followers: 211, followers_new: w(21), offer_views: w(160), code_reveals: w(31), site_visits: w(14), active_subs: 0, live_products: 48 },
        { id: uid(401), name: 'متجر المكملات التجريبي', category: 'supplements', city: 'الرياض', engagement: w(74), followers: 158, followers_new: w(15), offer_views: w(122), code_reveals: w(22), site_visits: w(11), active_subs: 0, live_products: 61 },
        { id: uid(203), name: 'Sample Green Bowl', category: 'restaurant', city: 'الرياض', engagement: w(39), followers: 87, followers_new: w(9), offer_views: w(54), code_reveals: w(9), site_visits: w(4), active_subs: 12, live_products: 18 },
        { id: uid(402), name: 'Demo Gear', category: 'equipment', city: null, engagement: w(27), followers: 64, followers_new: w(6), offer_views: w(41), code_reveals: w(7), site_visits: w(5), active_subs: 0, live_products: 33 },
        { id: uid(403), name: 'مطبخ تجريبي', category: 'restaurant', city: 'الخبر', engagement: w(18), followers: 40, followers_new: w(4), offer_views: w(22), code_reveals: w(3), site_visits: w(2), active_subs: 7, live_products: 14 },
      ],
      top_products: [
        { product_id: uid(501), product: 'سلطة دجاج مشوي', brand_id: uid(203), brand: 'Sample Green Bowl', price_sar: 32, meals: w(41) },
        { product_id: uid(502), product: 'Salmon Rice Bowl', brand_id: uid(203), brand: 'Sample Green Bowl', price_sar: 45, meals: w(33) },
        { product_id: uid(503), product: 'شوفان بالتوت', brand_id: uid(403), brand: 'مطبخ تجريبي', price_sar: 18.5, meals: w(27) },
        { product_id: uid(504), product: 'Beef Burrito Bowl', brand_id: uid(403), brand: 'مطبخ تجريبي', price_sar: 39, meals: w(19) },
        { product_id: uid(505), product: 'Protein Pancakes', brand_id: uid(203), brand: 'Sample Green Bowl', price_sar: null, meals: w(12) },
      ],
      rewards: { points: { today: 1840, cur: w(13260), prev: w(12110) }, earners_cur: D === 7 ? 288 : 517, outstanding: 48210, holders: 731 },
    },
    community: {
      posts: { today: 23, cur: posts.reduce((a, x) => a + x.n, 0), prev: w(151), posters_cur: w(97) > 1100 ? 640 : w(97), with_photo_cur: w(118), public_cur: w(131), wake_cur: w(61) },
      comments: { today: 41, cur: comments.reduce((a, x) => a + x.n, 0), prev: w(287) },
      reactions: { today: 156, cur: reactions.reduce((a, x) => a + x.n, 0), prev: w(1133) },
      follows: { cur: w(88), prev: w(76) },
      friend_requests: { cur: w(54), prev: w(49), pending: 17, pending_over_7d: 6 },
      challenges: { created_cur: w(4), created_prev: w(3), running: 6, ended_unsettled: 1, joins_cur: w(73) },
      tips: { cur: w(5), prev: w(4), total: 63 },
      programs: { cur: w(2), prev: w(1), total: 19, adopts_cur: w(34), adopts_prev: w(29) },
      daily: posts.map((p, i) => ({ day: p.day, posts: p.n, comments: comments[i].n, reactions: reactions[i].n })),
      moderation: {
        reports_supported: ['gym_review'], user_report_block: false, reported: { open: 2, cur: w(3), prev: w(1) }, kept: 5, removed: 2,
        latest: [
          { id: uid(601), kind: 'gym_review', target_id: uid(102), target_name: 'نادي تجريبي - الخبر', author_username: 'demo_user17', reason: 'fake', status: 'new', created_at: ago(95) },
          { id: uid(602), kind: 'gym_review', target_id: uid(101), target_name: 'نادي تجريبي - العليا', author_username: 'demo_user42', reason: 'offensive', status: 'new', created_at: ago(60 * 20) },
          { id: uid(603), kind: 'gym_review', target_id: uid(104), target_name: 'صالة اللياقة التجريبية', author_username: 'demo_user08', reason: 'spam', status: 'removed', created_at: ago(60 * 70) },
          { id: uid(604), kind: 'gym_review', target_id: uid(101), target_name: 'نادي تجريبي - العليا', author_username: 'demo_user23', reason: 'other', status: 'kept', created_at: ago(60 * 130) },
        ],
      },
      chats: {
        messages: { today: 312, cur: chatsCur, prev: w(1987) }, senders: { cur: w(274) > 1200 ? 702 : w(274), prev: w(251) > 1200 ? 671 : w(251) },
        conversations: { cur: w(389), prev: w(352) }, media: { cur: w(241), prev: w(198) }, media_pct_cur: 11, unread_over_24h: 37,
        daily: series(D, chatsCur, 312),
      },
    },
    partners: {
      pending: { club: 2, store: 2, coach: 1, center: 1, venue: 1 }, pending_total: 7,
      // كل الطلبات المعلّقة ظاهرة بالقائمة هنا، فالمغطّى بوكيل نعدّه منها (القاعدة تعدّه على كل الطلبات)
      pending_covered: Object.fromEntries(['club', 'store', 'coach', 'center', 'venue'].map((k) => [k, PARTNER_ITEMS.filter((p) => p.kind === k && agentOf(tasks, k, p.id)).length])),
      items: PARTNER_ITEMS.map((p) => ({ ...p, agent_task: agentOf(tasks, p.kind, p.id) })),
    },
    reports: {
      by_status: { new: 4, seen: 7, fixed: 23, wontfix: 3 }, received: { today: 2, cur: w(9), prev: w(6) },
      new_covered: REPORTS.filter((r) => agentOf(tasks, 'report', r.id)).length,
      latest_new: REPORTS.map((r) => ({ ...r, agent_task: agentOf(tasks, 'report', r.id) })),
    },
    marketing: {
      live_ad: { id: uid(701), title: 'عرض الويكند (تجريبي)', kind: 'ad', starts_at: ago(60 * 26), ends_at: ahead(60 * 46) },
      ads: { live: 1, scheduled: 1, ended: 4, off: 1, live_marketing: 1 },
      ad_stats: { cur: { views: w(1840), reach: w(912), clicks: w(143), closes: w(655) }, prev: { views: w(1610), reach: w(844), clicks: w(121), closes: w(590) } },
      events: { active: 12, past_still_active: 1, upcoming: EVENTS },
      nudges: { today: 146, cur: Object.values(nudgeCats).reduce((a, b) => a + b, 0), prev: w(938), by_category_cur: nudgeCats, templates_active: 36, templates_paused: 2 },
    },
    ai: {
      limits: { barcode_per_day: 2, meal_photos_per_day: 25 }, fixed_caps: { plan: 8, office: 80 },
      usage: {
        meal_photo: { uses_today: 96, uses_cur: w(702), uses_prev: w(655), users_cur: D === 7 ? 211 : 402 },
        barcode: { uses_today: 31, uses_cur: w(214), uses_prev: w(230), users_cur: D === 7 ? 118 : 251 },
        plan: { uses_today: 7, uses_cur: w(49), uses_prev: w(44), users_cur: D === 7 ? 41 : 133 },
        office: { uses_today: 13, uses_cur: w(61), uses_prev: w(48), users_cur: 1 },
      },
      office_tasks_today: tasks.filter((t) => t.created_at.slice(0, 10) === TODAY).length,
    },
    office,
  };
}

const PARTNER_ITEMS = [
  { kind: 'venue', id: uid(205), name: 'Demo Court Club', created_at: ago(60 * 24 * 6 + 40), city: 'جدة', username: 'demo_khalid' },
  { kind: 'center', id: uid(206), name: 'مركز الاستشفاء التجريبي - الملقا', created_at: ago(60 * 24 * 5 + 15), city: 'الرياض', username: 'demo_ahmed' },
  { kind: 'club', id: uid(207), name: 'نادي تجريبي - النرجس', created_at: ago(60 * 24 * 4 + 90), city: 'الرياض', username: 'demo_faisal' },
  { kind: 'store', id: uid(208), name: 'Sample Fit Wear Outlet', created_at: ago(60 * 24 * 3 + 30), city: 'جدة', username: 'demo_manager' },
  { kind: 'coach', id: uid(209), name: 'Demo Coach Sara', created_at: ago(60 * 24 * 2 + 200), city: 'الدمام', username: 'demo_sara' },
  { kind: 'club', id: uid(210), name: 'Demo Gym - Corniche', created_at: ago(60 * 26), city: 'الخبر', username: 'demo_omar' },
  { kind: 'store', id: uid(211), name: 'مطعم تجريبي صحي', created_at: ago(60 * 7), city: 'الرياض', username: 'demo_rest' },
];

const REPORTS = [
  { id: uid(801), category: 'bug', message: 'التطبيق يقفل لما أفتح شاشة الوجبات بعد التمرين وأمرر بسرعة — بلاغ تجريبي للمعاينة', created_at: ago(40), username: 'demo_ahmed' },
  { id: uid(802), category: 'idea', message: 'ودي يكون فيه وضع ليلي لشاشة التمرين عشان أتمرن بالليل بدون إزعاج (تجريبي)', created_at: ago(60 * 3), username: 'demo_noura' },
  { id: uid(803), category: 'design', message: 'Sample: the check-in button is hard to reach on small phones', created_at: ago(60 * 9), username: 'demo_lee' },
  { id: uid(804), category: 'other', message: 'Sample report: can I export my workout history?', created_at: ago(60 * 26), username: null },
];

const EVENTS = [
  ['معرض الصقور والصيد السعودي الدولي 2026', 'Saudi Falcons & Hunting Exhibition 2026', '2026-10-01', '2026-10-10', 'الرياض', 'shooting'],
  ['سباق الرياض', 'Riyadh Run', '2026-10-12', null, 'الرياض', 'running'],
  ['موسم سباقات الرياض', 'Riyadh Racing Season', '2026-10-16', '2027-04-17', 'الرياض', 'horse_racing'],
  ['نزالات موسم الرياض 2026', 'Riyadh Season 2026 fight nights', '2026-10-21', null, 'الرياض', 'boxing'],
  ['دورة الألعاب الآسيوية للصالات والفنون القتالية', 'Asian Indoor & Martial Arts Games', '2026-12-13', '2026-12-21', 'الرياض', 'boxing'],
  ['رالي داكار السعودية 2027', 'Dakar Rally Saudi Arabia 2027', '2027-01-01', '2027-01-15', 'رابغ', 'motorsport'],
  ['سباق العلا للمسارات 2027', 'AlUla Trail Race 2027', '2027-01-22', null, 'العلا', 'hiking'],
  ['ماراثون الرياض 2027', 'Riyadh Marathon 2027', '2027-01-31', null, 'الرياض', 'running'],
].map(([title, title_en, starts_on, ends_on, city, category], i) => ({ id: uid(900 + i), title, title_en, starts_on, ends_on, city, category }));

const bi = (ar, en) => ({ ar, en });
function task(n, o) {
  const created = o.created_at;
  const finished = o.status === 'waiting_approval' || o.status === 'done' || o.status === 'failed' ? o.finished_at ?? iso(Date.parse(created) + 40_000) : null;
  return {
    id: `7a5c0000-0000-4000-8000-${String(n).padStart(12, '0')}`, desk: o.desk, kind: o.kind, target_kind: o.target_kind ?? null, target_id: o.target_id ?? null,
    title: o.title ?? null, status: o.status, input: o.input ?? { locale: 'ar' }, output: o.output ?? null, error: o.error ?? null,
    model: o.status === 'scheduled' || o.status === 'in_progress' ? null : 'sample-model', request_id: `sample-run-${n}`,
    decision: o.decision ?? null, decision_note: o.decision_note ?? null, final: o.final ?? null,
    decided_by: o.decision ? ADMIN : null, created_by: ADMIN, decided_at: o.decided_at ?? null,
    created_at: created, updated_at: o.decided_at ?? finished ?? created, finished_at: finished,
  };
}

const TASKS = [
  task(1, {
    desk: 'lead', kind: 'daily_brief', status: 'done', created_at: ago(60 * 3 + 10), input: {},
    output: {
      headline: bi('8 أشياء تنتظر قرارك، أهمها بلاغ تعطّل الوجبات', '8 things await your decision — start with the meals crash report'),
      points: [
        bi('التسجيلات أعلى من الأسبوع اللي قبل بـ35% (96 مقابل 71).', 'Sign-ups are up 35% on last week (96 vs 71).'),
        bi('أعطال التطبيق نزلت من 31 إلى 23، بس js_fatal للحين موجود.', 'App errors fell from 31 to 23, but js_fatal is still there.'),
        bi('طلب نادي ينتظر من 4 أيام — أقدم طلب شريك عندك.', 'A gym request has waited 4 days — your oldest partner request.'),
        bi('ملعب Demo Padel Arena ما ردّ على حجزين من 14 ساعة.', 'Demo Padel Arena has not answered 2 bookings for 14 hours.'),
      ],
      priorities: [
        { desk: 'reports', text: bi('اعتمد فرز بلاغ تعطّل الوجبات وأرسل الرد للمختبر.', 'Approve the meals-crash triage and send the reply.') },
        { desk: 'clubs', text: bi('قرّر طلب نادي تجريبي - النرجس.', 'Decide the Demo Gym - Narjis request.') },
        { desk: 'ai', text: bi('راجع اقتراح رفع حد الباركود إلى 4.', 'Review the proposal to raise the barcode limit to 4.') },
      ],
    },
  }),
  task(2, {
    desk: 'clubs', kind: 'review_partner', target_kind: 'club', target_id: uid(207), title: 'نادي تجريبي - النرجس', status: 'waiting_approval', created_at: ago(60 * 2 + 5),
    output: {
      summary: bi('طلب نادي في الرياض ببيانات كاملة: السجل التجاري والرخصة والموقع موجودين.', 'A Riyadh gym request with complete details: CR, license and location are all there.'),
      checks: [
        { label: bi('السجل التجاري مرفق', 'Commercial registration attached'), ok: true },
        { label: bi('رخصة البلدية سارية', 'Municipal license valid'), ok: true },
        { label: bi('الموقع على الخريطة داخل المدينة', 'Map location is inside the city'), ok: true },
        { label: bi('صور النادي', 'Gym photos'), ok: false },
      ],
      missing: [bi('صور من داخل النادي (اختياري)', 'Photos from inside the gym (optional)')],
      recommendation: 'approve', note: '', note_locale: 'ar', confidence: 'high',
    },
  }),
  task(3, {
    desk: 'stores', kind: 'review_partner', target_kind: 'store', target_id: uid(208), title: 'Sample Fit Wear Outlet', status: 'waiting_approval', created_at: ago(60 * 2 + 4), input: { locale: 'en' },
    output: {
      summary: bi('متجر ملابس رياضية بدون شعار وبدون منتجات للحين.', 'A sportswear store with no logo and no products yet.'),
      checks: [
        { label: bi('اسم المتجر والوصف', 'Store name and description'), ok: true },
        { label: bi('الشعار', 'Logo'), ok: false },
        { label: bi('منتج واحد على الأقل', 'At least one product'), ok: false },
      ],
      missing: [bi('شعار المتجر', 'Store logo'), bi('منتجات بأسعار', 'Products with prices')],
      recommendation: 'reject', note: 'Please add your store logo and at least one product with a price, then submit again.', note_locale: 'en', confidence: 'medium',
    },
  }),
  task(4, {
    desk: 'coaches', kind: 'review_partner', target_kind: 'coach', target_id: uid(209), title: 'Demo Coach Sara', status: 'waiting_approval', created_at: ago(60 * 2 + 3),
    output: {
      summary: bi('مدربة بشهادة معتمدة وخبرة 5 سنوات، والشهادة واضحة.', 'A coach with an accredited certificate and 5 years of experience; the certificate is clear.'),
      checks: [{ label: bi('الشهادة واضحة ومعتمدة', 'Certificate clear and accredited'), ok: true }, { label: bi('سنوات الخبرة', 'Years of experience'), ok: true }],
      missing: [], recommendation: 'approve', note: '', note_locale: 'ar', confidence: 'high',
    },
  }),
  task(5, {
    desk: 'care', kind: 'review_partner', target_kind: 'center', target_id: uid(206), title: 'مركز الاستشفاء التجريبي - الملقا', status: 'waiting_approval', created_at: ago(60 * 2 + 2),
    output: {
      summary: bi('مركز استشفاء بخدمات واضحة، بس رقم الترخيص الصحي ناقص.', 'A recovery center with clear services, but the health license number is missing.'),
      checks: [{ label: bi('الخدمات والأسعار', 'Services and prices'), ok: true }, { label: bi('الترخيص الصحي', 'Health license'), ok: false }],
      missing: [bi('رقم الترخيص الصحي', 'Health license number')],
      recommendation: 'reject', note: 'نحتاج رقم الترخيص الصحي للمركز عشان نكمل المراجعة.', note_locale: 'ar', confidence: 'medium',
    },
  }),
  task(6, { desk: 'stores', kind: 'review_partner', target_kind: 'store', target_id: uid(211), title: 'مطعم تجريبي صحي', status: 'in_progress', created_at: ago(3) }),
  task(7, {
    desk: 'reports', kind: 'triage_report', target_kind: 'report', target_id: uid(801), title: 'التطبيق يقفل لما أفتح شاشة الوجبات بعد التمرين وأمرر بسرعة', status: 'waiting_approval', created_at: ago(30),
    output: {
      summary: bi('تعطّل كامل في شاشة الوجبات بعد التمرين — يأثر على تسجيل الأكل.', 'A full crash on the meals screen after a workout — it blocks food logging.'),
      severity: 'critical', category_guess: 'bug', status: 'seen',
      reply: 'شكراً على البلاغ! وصلنا وقاعدين نصلّحه، وبنبلغك أول ما يكون التحديث جاهز.', reply_locale: 'ar',
    },
  }),
  task(8, { desk: 'reports', kind: 'triage_report', target_kind: 'report', target_id: uid(802), title: 'ودي يكون فيه وضع ليلي لشاشة التمرين', status: 'in_progress', created_at: ago(1) }),
  task(9, {
    desk: 'reports', kind: 'triage_report', target_kind: 'report', target_id: uid(803), title: 'Sample: the check-in button is hard to reach on small phones', status: 'waiting_approval', created_at: ago(60 * 2 + 1), input: { locale: 'en' },
    output: {
      summary: bi('ملاحظة تصميم بسيطة على مكان زر الحضور في الشاشات الصغيرة.', 'A small design note about the check-in button placement on small screens.'),
      severity: 'low', category_guess: 'design', status: 'seen',
      reply: 'Thanks! We will look at moving the check-in button lower on small phones.', reply_locale: 'en',
    },
  }),
  task(10, {
    desk: 'marketing', kind: 'draft_nudge', title: 'الويكند', status: 'waiting_approval', created_at: ago(60 * 5), input: { brief: 'الويكند' },
    output: {
      why: bi('الحضور ينزل يوم الجمعة 30%، فتنبيه خفيف قبل الويكند يرجّع الناس للنادي.', 'Check-ins drop 30% on Fridays, so a light nudge before the weekend brings people back.'),
      template: { category: 'gym', gender: 'all', locale: 'ar', title: 'ويكندك يبدأ من {gym} 💪', body: 'هلا {name}! ساعة وحدة في {gym} اليوم تفرق معك طول الأسبوع.' },
    },
  }),
  task(11, {
    desk: 'ai', kind: 'review_ai_limits', status: 'waiting_approval', created_at: ago(60 * 4),
    input: { current: { barcode_per_day: 2, meal_photos_per_day: 25 }, usage: { barcode: { uses_7d: 214, users_7d: 118, at_cap_users: 37 } } },
    output: {
      why: bi('37 مستخدم وصلوا حد الباركود هالأسبوع، وصور الوجبات بعيدة عن الحد.', '37 users hit the barcode cap this week; meal photos are far from their cap.'),
      barcode_per_day: 4, meal_photos_per_day: 25,
    },
  }),
  task(12, {
    desk: 'reports', kind: 'triage_report', target_kind: 'report', target_id: uid(811), title: 'الإشعارات توصل مرتين', status: 'done', created_at: ago(60 * 27), decided_at: ago(60 * 25),
    output: { summary: bi('إشعار مكرر.', 'Duplicate notification.'), severity: 'medium', category_guess: 'bug', status: 'seen', reply: 'شكراً، نشيّك عليه.', reply_locale: 'ar' },
    decision: 'approved', final: { status: 'fixed', reply: 'تم الإصلاح في التحديث الأخير، شكراً لك!' },
  }),
  task(13, {
    desk: 'care', kind: 'review_partner', target_kind: 'venue', target_id: uid(212), title: 'Demo Padel Arena', status: 'done', created_at: ago(60 * 50), decided_at: ago(60 * 49),
    output: { summary: bi('ملعب بادل ببيانات كاملة.', 'A padel venue with complete details.'), checks: [], missing: [], recommendation: 'approve', note: '', note_locale: 'en', confidence: 'high' },
    decision: 'approved', final: { decision: 'approve', note: '' },
  }),
  task(14, {
    desk: 'marketing', kind: 'draft_nudge', status: 'done', created_at: ago(60 * 74), decided_at: ago(60 * 72), input: { brief: null },
    output: { why: bi('تنبيه للسلسلة.', 'A streak nudge.'), template: { category: 'streak', gender: 'all', locale: 'ar', title: 'سلسلتك {streak} يوم!', body: 'لا توقفها اليوم يا {name}.' } },
    decision: 'rejected', decision_note: 'نفس تنبيه الأسبوع اللي فات تقريباً',
  }),
  task(15, { desk: 'coaches', kind: 'review_partner', target_kind: 'coach', target_id: uid(213), title: 'Demo Coach Hamad', status: 'failed', created_at: ago(60 * 48), error: 'ai_failed' }),
];

function agentOf(tasks, kind, id) {
  const t = tasks.find((x) => x.target_kind === kind && x.target_id === id && ['scheduled', 'in_progress', 'waiting_approval'].includes(x.status));
  return t ? { id: t.id, status: t.status } : null;
}

function officeCounts(tasks) {
  const zero = () => ({ scheduled: 0, in_progress: 0, waiting_approval: 0, done: 0, failed: 0 });
  const by_status = zero();
  const by_desk = Object.fromEntries(['lead', 'clubs', 'stores', 'coaches', 'care', 'reports', 'marketing', 'users', 'ai'].map((d) => [d, zero()]));
  for (const t of tasks) { by_status[t.status]++; by_desk[t.desk][t.status]++; }
  const waiting = tasks.filter((t) => t.status === 'waiting_approval').map((t) => t.created_at).sort();
  return { by_status, by_desk, waiting_total: by_status.waiting_approval, working_total: by_status.scheduled + by_status.in_progress, oldest_waiting_at: waiting[0] ?? null };
}

// --- التحقق من الشكل: كل مسار مفاتيح في النتيجة الحقيقية لازم يكون هنا والعكس ---
function paths(v, pre = '', out = new Set()) {
  if (Array.isArray(v)) { for (const x of v) paths(x, `${pre}[]`, out); if (!v.length) out.add(`${pre}[]?`); return out; }
  if (v && typeof v === 'object') { for (const [k, x] of Object.entries(v)) { out.add(`${pre}.${k}`); paths(x, `${pre}.${k}`, out); } return out; }
  return out;
}
const real = JSON.parse(fs.readFileSync(path.join(DIR, 'overview.sample.json'), 'utf8'));
const o7 = overview(7, TASKS);
const o30 = overview(30, TASKS);
const want = [...paths(real)].filter((p) => !p.endsWith('[]?'));
for (const [name, o] of [['7', o7], ['30', o30]]) {
  const got = paths(o);
  const missing = want.filter((p) => !got.has(p));
  const emptyIn = new Set([...paths(real)].filter((p) => p.endsWith('[]?')).map((p) => p.slice(0, -3)));
  const extra = [...got].filter((p) => !p.endsWith('[]?') && !want.includes(p) && ![...emptyIn].some((e) => p.startsWith(`${e}[]`)));
  if (missing.length || extra.length) { console.error(`shape mismatch (${name} days)`, { missing, extra }); process.exit(1); }
  for (const s of [o.activity.signups.daily, o.activity.checkins.daily, o.community.chats.daily]) {
    if (s.length !== o.meta.days) { console.error('daily length', name); process.exit(1); }
  }
  if (o.activity.signups.daily.reduce((a, x) => a + x.n, 0) !== o.activity.signups.cur) { console.error('series sum', name); process.exit(1); }
}
// top_products فاضية بالنتيجة الحقيقية: نتأكد من مفاتيحها من docs/office-web.md
const tp = Object.keys(o7.store.top_products[0]).sort().join(',');
if (tp !== 'brand,brand_id,meals,price_sar,product,product_id') { console.error('top_products keys', tp); process.exit(1); }

const out = { _note: 'Sample data for the ARQ web office preview — every name and number is fake.', overview: o7, overview_30: o30, tasks: TASKS };
fs.writeFileSync(path.join(DIR, 'sample.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(`sample.json ok: ${want.length} key paths match, ${TASKS.length} tasks, waiting ${o7.office.waiting_total}`);
