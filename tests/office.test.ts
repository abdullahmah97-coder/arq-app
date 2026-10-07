// اختبار منطق مكتب أرك أب: المهام من بيانات الأقسام ومن شغل الوكلاء، عدّادات المكاتب، الفلترة، وترجمة كل النصوص بالعربي والإنجليزي
// يشتغل مع اختبار النوادي (npm run test:clubs) أو لحاله: node --experimental-strip-types tests/office.test.ts
import { readFileSync } from 'node:fs';
import {
  agentRoute, buildTasks, DESKS, deskSpot, deskStates, DONE_LIMIT, EMPTY_SNAPSHOT, filterCounts, filterTasks, paintOrder, waitingTotal,
  type AgentTaskLite, type OfficeSnapshot, type TaskKind,
} from '../src/lib/officeCore.ts';

let fail = 0;
const ok = (c: boolean, m: string) => { if (!c) { fail++; process.exitCode = 1; console.log('FAIL', m); } else console.log('ok  ', m); };

const snap: OfficeSnapshot = {
  pending: { club: 3, store: 1, coach: 1, venue: 1 },
  requests: [
    { kind: 'club', id: 'c1', name: 'Fitness Time', at: '2026-10-01T10:00:00Z' },
    { kind: 'store', id: 's1', name: 'Protein Shop', at: '2026-10-02T10:00:00Z' },
    { kind: 'coach', id: 'u1', name: 'Coach Sara', at: '2026-10-03T10:00:00Z' },
    { kind: 'venue', id: 'v1', name: 'Padel Club', at: '2026-10-04T10:00:00Z' },
  ],
  reports: [
    { id: 'r1', status: 'new', message: 'App   crashes\nwhen saving', at: '2026-10-05T10:00:00Z', updated_at: null },
    { id: 'r2', status: 'seen', message: 'Slow chat', at: '2026-10-01T10:00:00Z', updated_at: '2026-10-02T10:00:00Z' },
    ...Array.from({ length: 12 }, (_, i) => ({ id: `d${i}`, status: 'fixed' as const, message: `fixed ${i}`, at: '2026-09-01T00:00:00Z', updated_at: `2026-09-${String(10 + i).padStart(2, '0')}T00:00:00Z` })),
  ],
  ads: [{ id: 'a1', title: 'Old ad', state: 'ended', at: '2026-09-01T00:00:00Z' }, { id: 'a2', title: 'Next ad', state: 'scheduled', at: '2026-10-01T00:00:00Z' }],
  events: [
    { id: 'e1', title: 'ماراثون الرياض', title_en: 'Riyadh Marathon', state: 'soon', starts_on: '2026-11-01', at: null },
    { id: 'e2', title: 'سباق قديم', title_en: null, state: 'past', starts_on: '2026-08-01', at: null },
    { id: 'e3', title: 'مخفية', title_en: null, state: 'hidden', starts_on: null, at: null },
  ],
  users: { trainees: 120, new7d: 9 },
  kcalEnabled: false,
  agentTasks: null,
};

const tasks = buildTasks(snap, 'en');
const byId = (id: string) => tasks.find((t) => t.id === id);

ok(byId('club:c1')?.status === 'waiting' && byId('club:c1')?.desk === 'clubs' && byId('club:c1')?.route.pathname === '/owner', 'club request waits on the gyms desk and opens the approvals panel');
ok(byId('club:more')?.kind === 'more_requests' && byId('club:more')?.n === 2, 'club count above the list adds a "2 more" task');
ok(!byId('store:more') && !byId('coach:more'), 'no "more" task when the list has them all');
ok(byId('venue:v1')?.desk === 'care' && byId('venue:v1')?.route.params?.kind === 'venue', 'court requests go to the care desk');
ok(byId('report:r1')?.name === 'App crashes when saving', 'report text is squashed to one line');
ok(byId('report:r2')?.status === 'in_progress' && byId('report:r2')?.at === '2026-10-02T10:00:00Z', 'seen report is in progress, dated by its update');
ok(tasks.filter((t) => t.kind === 'report_done').length === DONE_LIMIT, `only the ${DONE_LIMIT} latest closed reports`);
ok(byId('report:d11')?.status === 'done' && !byId('report:d0'), 'closed reports keep the newest ones');
ok(byId('ad:none')?.status === 'waiting', 'no live ad → marketing waits on you');
ok(byId('ad:a2')?.status === 'in_progress' && byId('ad:a1')?.status === 'done', 'scheduled ad in progress, ended ad done');
ok(byId('event:e1')?.name === 'Riyadh Marathon' && !byId('event:none'), 'upcoming event uses the English title in English');
ok(buildTasks(snap, 'ar').find((t) => t.id === 'event:e1')?.name === 'ماراثون الرياض', 'Arabic title in Arabic');
ok(byId('event:e2')?.status === 'done' && !byId('event:e3'), 'past event done, hidden event left out');
ok(byId('kcal:off')?.desk === 'ai' && byId('users:new7d')?.n === 9, 'calorie alert off waits on the AI desk; new trainees counted');
ok(tasks.every((t) => t.agent === 'manual' && !t.agentTaskId), 'without agent tasks every task comes from the app');
ok(new Set(tasks.map((t) => t.id)).size === tasks.length, 'task ids are unique');

const states = deskStates(tasks);
const st = (id: string) => states.find((s) => s.id === id)!;
ok(st('clubs').waiting === 3 && st('clubs').alert, 'gyms desk waits on 3 (1 listed + 2 more)');
ok(st('reports').waiting === 1 && st('reports').inProgress === 1 && st('reports').done === DONE_LIMIT, 'reports desk counts');
ok(st('marketing').waiting === 1 && st('marketing').inProgress === 2 && st('marketing').done === 2, 'marketing desk counts');
ok(!st('users').alert && st('users').inProgress === 1, 'users desk has no alert');
const others = states.filter((s) => s.id !== 'lead');
ok(st('lead').waiting === others.reduce((n, s) => n + s.waiting, 0) && st('lead').waiting === 3 + 1 + 1 + 1 + 1 + 1 + 1, 'the lead desk sums everything awaiting you');

const quiet = deskStates(buildTasks({ ...EMPTY_SNAPSHOT, ads: [{ id: 'a', title: 'x', state: 'live', at: null }], events: [{ id: 'e', title: 'x', title_en: null, state: 'open', starts_on: null, at: null }] }));
ok(quiet.every((s) => !s.alert), 'nothing pending → no desk raises a hand');

// ما قدرنا نحمّل الإعلانات/الفعاليات (خطأ شبكة): لا نقول "ما فيه إعلان" وهي بس ما وصلت
const offline = buildTasks({ ...snap, ads: null, events: null });
ok(!offline.some((t) => t.id === 'ad:none' || t.id === 'event:none' || t.desk === 'marketing'), 'unloaded ads/events raise no marketing alert');
ok(waitingTotal(snap) === st('lead').waiting, 'the admin panel link uses the same waiting total as the office');
ok(waitingTotal(EMPTY_SNAPSHOT) === 0, 'nothing loaded → nothing waiting');

const waiting = filterTasks(tasks, null, 'waiting');
ok(waiting.length > 0 && waiting.every((t) => t.status === 'waiting'), 'waiting filter');
ok(!waiting[0].at && waiting.findIndex((t) => t.at) > waiting.findLastIndex((t) => !t.at), 'undated alerts come first');
const dated = waiting.filter((t) => t.at);
ok(dated.every((t, i) => i === 0 || dated[i - 1].at! >= t.at!), 'then newest first');
ok(filterTasks(tasks, 'reports', 'all').every((t) => t.desk === 'reports'), 'desk filter');
ok(filterTasks(tasks, 'lead', 'all').length === tasks.length, 'the lead desk shows every task');
const c = filterCounts(tasks, null);
ok(c.waiting === st('lead').waiting && c.all === c.waiting + c.in_progress + c.done, 'filter counts match the desks (with "more" weighted)');

// ---------- شغل الوكلاء (office_tasks) ----------
const at = (d: number) => `2026-10-0${d}T12:00:00Z`;
const ag = (id: string, p: Partial<AgentTaskLite>): AgentTaskLite => ({
  id, desk: 'reports', kind: 'triage_report', target_kind: null, target_id: null, title: null, status: 'waiting_approval',
  output: null, created_at: at(6), finished_at: null, decided_at: null, ...p,
});
const agentList: AgentTaskLite[] = [
  ag('t1', { target_kind: 'report', target_id: 'r1', title: 'App crashes when saving', finished_at: at(7) }),
  ag('t2', { desk: 'clubs', kind: 'review_partner', target_kind: 'club', target_id: 'c1', title: 'Fitness Time', status: 'in_progress' }),
  // طلب نادي معلّق بس مو في القائمة (القائمة لها حد): عليه مهمة وكيل تنتظرك
  ag('t3', { desk: 'clubs', kind: 'review_partner', target_kind: 'club', target_id: 'c9', title: 'Gym Nine' }),
  ag('t4', { desk: 'stores', kind: 'review_partner', target_kind: 'store', target_id: 's1', status: 'failed', finished_at: at(7) }),
  ag('t5', { desk: 'lead', kind: 'daily_brief', status: 'done', output: { headline: { ar: 'يومك هادي', en: 'A calm day' }, points: [], priorities: [] }, finished_at: at(8) }),
  ag('t6', { desk: 'marketing', kind: 'draft_nudge', output: { why: { ar: 'س', en: 'w' }, template: { category: 'gym', gender: 'all', locale: 'ar', title: 'يلا {name}', body: 'النادي ينتظرك' } } }),
  ag('t7', { desk: 'ai', kind: 'review_ai_limits', status: 'scheduled' }),
  ...Array.from({ length: 11 }, (_, i) => ag(`old${i}`, { target_kind: 'report', target_id: `d${i}`, status: 'done', decided_at: `2026-09-${String(10 + i).padStart(2, '0')}T00:00:00Z` })),
  // من نسخة أحدث (نوع أو مكتب ما نعرفه): ينتجاهل
  ag('t8', { kind: 'write_ad' as never }),
  ag('t9', { desk: 'finance' as never }),
];
const asnap: OfficeSnapshot = { ...snap, agentTasks: agentList };
const atasks = buildTasks(asnap, 'en');
const aById = (id: string) => atasks.find((t) => t.id === id);

ok(!aById('report:r1') && aById('agent:t1')?.status === 'waiting' && aById('agent:t1')?.kind === 'agent_report' && aById('agent:t1')?.desk === 'reports',
  'an open agent triage replaces the manual report task (no double count)');
ok(aById('agent:t1')?.agent === 'claude' && aById('agent:t1')?.agentTaskId === 't1' && aById('agent:t1')?.at === at(7), 'agent tasks are marked as Claude, keep their row id and are dated when ready');
ok(!aById('club:c1') && aById('agent:t2')?.status === 'in_progress', 'a request the agent is working on shows as in progress instead of waiting');
ok(aById('club:more')?.n === 1, 'an unlisted request with an agent task is not counted again in "more"');
ok(aById('store:s1')?.status === 'waiting' && aById('agent:t4')?.kind === 'agent_failed' && aById('agent:t4')?.status === 'done', 'a failed agent task leaves the manual request in place');
ok(aById('agent:t4')?.name === 'Protein Shop', 'an agent task without a title takes the name of its item');
ok(aById('agent:t5')?.kind === 'agent_brief' && aById('agent:t5')?.status === 'done' && aById('agent:t5')?.name === 'A calm day', 'the daily brief is done and named by its headline');
ok(buildTasks(asnap, 'ar').find((t) => t.id === 'agent:t5')?.name === 'يومك هادي', 'brief headline in Arabic');
ok(aById('agent:t6')?.name === 'يلا {name}' && aById('agent:t6')?.route.pathname === '/owner-nudges', 'a nudge draft is named by its proposed title and opens the nudges screen');
ok(aById('agent:t7')?.status === 'in_progress' && aById('agent:t7')?.kind === 'agent_limits', 'a scheduled agent task counts as in progress');
ok(atasks.filter((t) => t.kind === 'agent_report' && t.status === 'done').length === DONE_LIMIT && !!aById('agent:old10') && !aById('agent:old0'),
  `only the ${DONE_LIMIT} latest finished agent tasks per desk and kind`);
ok(!aById('agent:t8') && !aById('agent:t9'), 'unknown agent kinds or desks are left out');
ok(new Set(atasks.map((t) => t.id)).size === atasks.length, 'task ids stay unique with agent tasks');
ok(aById('report:d11')?.status === 'done' && aById('report:d10')?.status === 'done', 'a finished agent task does not hide the closed report');

const astates = deskStates(atasks);
const ast = (id: string) => astates.find((x) => x.id === id)!;
ok(ast('clubs').waiting === 2 && ast('clubs').inProgress === 1, 'gyms desk: 1 agent proposal + 1 more waiting, 1 under review (still 3 requests)');
ok(ast('reports').waiting === 1, 'reports desk still waits on 1 (the agent proposal)');
ok(ast('marketing').waiting === st('marketing').waiting + 1 && ast('ai').inProgress === 1, 'a nudge draft waits on marketing; the AI desk works');
ok(ast('lead').done === astates.filter((x) => x.id !== 'lead').reduce((n, x) => n + x.done, 0) + 1, 'the lead desk adds its own daily brief to the totals');
// قبل الوكلاء ٩ تنتظرك: طلب c1 صار شغّال (−١)، ومسودة التنبيه تنتظرك (+١)، والباقي نفس العدد (مقترح الوكيل بدل مهمة العنصر)
ok(waitingTotal(asnap) === ast('lead').waiting && waitingTotal(asnap) === st('lead').waiting - 1 + 1,
  'the admin panel link counts agent proposals the same way as the office');
ok(filterTasks(atasks, 'clubs', 'in_progress').some((t) => t.id === 'agent:t2'), 'in-progress filter shows the working agent');
// القائمة كاملة بس فيها مهمة وكيل لطلب انقرّر يدوياً: ما تنقص "و N" تحت الصفر وتبقى تنتظرك (تقفلها)
const stale = buildTasks({ ...snap, agentTasks: [ag('s', { desk: 'stores', kind: 'review_partner', target_kind: 'store', target_id: 'gone' })] });
ok(stale.some((t) => t.id === 'store:s1') && !stale.some((t) => t.id === 'store:more') && stale.some((t) => t.id === 'agent:s' && t.status === 'waiting'),
  'an agent task for an item decided by hand stays waiting without hiding other requests');
ok(agentRoute({ desk: 'care', kind: 'review_partner', target_kind: 'venue' }).params?.kind === 'venue' && agentRoute({ desk: 'clubs', kind: 'review_partner', target_kind: 'club' }).pathname === '/owner'
  && agentRoute({ desk: 'ai', kind: 'review_ai_limits', target_kind: null }).pathname === '/owner-ai-limits', 'agent tasks open the right section');
ok(waitingTotal({ ...EMPTY_SNAPSHOT, agentTasks: [ag('x', {})] }) === 1, 'an agent proposal alone counts as waiting');

// المكاتب: ٩ أماكن مختلفة على الشبكة، والمدير في النص
ok(DESKS.length === 9 && new Set(DESKS.map((d) => `${d.col},${d.row}`)).size === 9, 'nine desks on nine distinct spots');
const lead = DESKS.find((d) => d.id === 'lead')!;
ok(deskSpot(lead)[0] === 0 && deskSpot(lead)[1] === 0, 'lead desk in the middle');
const order = paintOrder(DESKS);
ok(order[0].col + order[0].row === -2 && order[8].col + order[8].row === 2, 'painted from the back to the front');
ok(DESKS.every((d) => d.links.length > 0 && d.links.every((l) => l.route.pathname.startsWith('/owner'))), 'every desk opens an admin screen');

// كل نص يستخدمه المكتب موجود بالعربي والإنجليزي وما يطول على الجوال الصغير
const ar = JSON.parse(readFileSync(new URL('../src/locales/ar.json', import.meta.url), 'utf8')).office;
const en = JSON.parse(readFileSync(new URL('../src/locales/en.json', import.meta.url), 'utf8')).office;
const kinds: TaskKind[] = ['club_request', 'store_request', 'coach_request', 'center_request', 'venue_request', 'more_requests', 'report_new', 'report_seen', 'report_done', 'ad_none', 'ad_live', 'ad_scheduled', 'ad_ended', 'event_none', 'event_upcoming', 'event_past', 'kcal_off', 'users_new',
  'agent_report', 'agent_partner', 'agent_nudge', 'agent_limits', 'agent_brief', 'agent_failed'];
const keys = [
  'title', 'entrySub', 'entrySubWaiting', 'intro', 'a11yDesk', 'try3d', 'allDesks', 'agentTitle', 'empty', 'emptyWaiting',
  'agentLive', 'agentRun', 'agentRunning', 'agentBriefPh', 'agentBadge', 'run_nothing',
  ...['waiting', 'in_progress', 'done'].map((f) => `stat_${f}`),
  ...['waiting', 'in_progress', 'done', 'all'].map((f) => `filter_${f}`),
  ...['waiting', 'scheduled', 'in_progress', 'done', 'failed'].map((s) => `st_${s}`),
  ...DESKS.flatMap((d) => [`sign_${d.id}`, `desk_${d.id}`, `role_${d.id}`, `agent_${d.id}`, ...d.links.map((l) => `link_${l.key}`)]),
  ...kinds.map((k) => `kind_${k}`),
];
const missing = keys.filter((k) => !ar?.[k] || !en?.[k]);
ok(!missing.length, `every office text exists in Arabic and English${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`);
ok(Object.keys(ar).sort().join() === Object.keys(en).sort().join(), 'Arabic and English have the same keys');
ok(DESKS.every((d) => ar[`sign_${d.id}`].length <= 10 && en[`sign_${d.id}`].length <= 10), 'desk signs are short enough to fit over the desks');
ok(ar.title === 'مكتب أرك أب' && en.title === 'ARQ App Office', 'the office name');

if (fail) console.log(`\n${fail} office test(s) failed`);
