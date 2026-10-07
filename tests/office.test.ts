// اختبار منطق مكتب أرك أب: المهام من بيانات الأقسام، عدّادات المكاتب، الفلترة، وترجمة كل النصوص بالعربي والإنجليزي
// يشتغل مع اختبار النوادي (npm run test:clubs) أو لحاله: node --experimental-strip-types tests/office.test.ts
import { readFileSync } from 'node:fs';
import {
  buildTasks, DESKS, deskSpot, deskStates, DONE_LIMIT, EMPTY_SNAPSHOT, filterCounts, filterTasks, paintOrder,
  type OfficeSnapshot, type TaskKind,
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
ok(tasks.every((t) => t.agent === 'manual'), 'phase one: every task comes from the app (no AI agent yet)');
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

const waiting = filterTasks(tasks, null, 'waiting');
ok(waiting.length > 0 && waiting.every((t) => t.status === 'waiting'), 'waiting filter');
ok(!waiting[0].at && waiting.findIndex((t) => t.at) > waiting.findLastIndex((t) => !t.at), 'undated alerts come first');
const dated = waiting.filter((t) => t.at);
ok(dated.every((t, i) => i === 0 || dated[i - 1].at! >= t.at!), 'then newest first');
ok(filterTasks(tasks, 'reports', 'all').every((t) => t.desk === 'reports'), 'desk filter');
ok(filterTasks(tasks, 'lead', 'all').length === tasks.length, 'the lead desk shows every task');
const c = filterCounts(tasks, null);
ok(c.waiting === st('lead').waiting && c.all === c.waiting + c.in_progress + c.done, 'filter counts match the desks (with "more" weighted)');

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
const kinds: TaskKind[] = ['club_request', 'store_request', 'coach_request', 'center_request', 'venue_request', 'more_requests', 'report_new', 'report_seen', 'report_done', 'ad_none', 'ad_live', 'ad_scheduled', 'ad_ended', 'event_none', 'event_upcoming', 'event_past', 'kcal_off', 'users_new'];
const keys = [
  'title', 'entrySub', 'entrySubWaiting', 'intro', 'a11yDesk', 'try3d', 'allDesks', 'agentTitle', 'empty', 'emptyWaiting',
  ...['waiting', 'in_progress', 'done'].map((f) => `stat_${f}`),
  ...['waiting', 'in_progress', 'done', 'all'].map((f) => `filter_${f}`),
  ...['waiting', 'scheduled', 'in_progress', 'done'].map((s) => `st_${s}`),
  ...DESKS.flatMap((d) => [`sign_${d.id}`, `desk_${d.id}`, `role_${d.id}`, `agent_${d.id}`, ...d.links.map((l) => `link_${l.key}`)]),
  ...kinds.map((k) => `kind_${k}`),
];
const missing = keys.filter((k) => !ar?.[k] || !en?.[k]);
ok(!missing.length, `every office text exists in Arabic and English${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`);
ok(Object.keys(ar).sort().join() === Object.keys(en).sort().join(), 'Arabic and English have the same keys');
ok(DESKS.every((d) => ar[`sign_${d.id}`].length <= 10 && en[`sign_${d.id}`].length <= 10), 'desk signs are short enough to fit over the desks');
ok(ar.title === 'مكتب أرك أب' && en.title === 'ARQ App Office', 'the office name');

if (fail) console.log(`\n${fail} office test(s) failed`);
