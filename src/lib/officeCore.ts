// مكتب أرك أب: منطق بحت (المكاتب، مهام كل مكتب، العدّادات) بدون أي استيراد من React Native عشان ينختبر لحاله.
// كل قسم في لوحة الإدارة = مكتب عليه موظف. المهام تنبني من بيانات الأقسام الموجودة (agent: 'manual')،
// ومن شغل وكلاء الذكاء الاصطناعي (office_tasks، agent: 'claude') اللي يمر على موافقتك.
import type { AgentKind, AgentTaskRow } from './officeAgentsCore.ts';

export type DeskId = 'lead' | 'clubs' | 'stores' | 'coaches' | 'care' | 'reports' | 'marketing' | 'users' | 'ai';
/** scheduled محجوزة لمهام الوكلاء المجدولة (المرحلة الجاية) */
export type TaskStatus = 'scheduled' | 'in_progress' | 'waiting' | 'done';
export type TaskKind =
  | 'club_request' | 'store_request' | 'coach_request' | 'center_request' | 'venue_request' | 'more_requests'
  | 'report_new' | 'report_seen' | 'report_done'
  | 'ad_none' | 'ad_live' | 'ad_scheduled' | 'ad_ended'
  | 'event_none' | 'event_upcoming' | 'event_past'
  | 'kcal_off' | 'users_new'
  // شغل الوكلاء: فرز بلاغ، مراجعة طلب شريك، مسودة تنبيه، اقتراح حدود، ملخص اليوم، ومهمة ما كمّلت
  | 'agent_report' | 'agent_partner' | 'agent_nudge' | 'agent_limits' | 'agent_brief' | 'agent_failed';

export interface OfficeRoute { pathname: string; params?: Record<string, string> }

export interface OfficeTask {
  id: string;
  desk: DeskId;
  kind: TaskKind;
  status: TaskStatus;
  /** اسم العنصر كما هو في البيانات (اسم النادي، نص التقرير...) — العنوان نفسه يجي من الترجمة حسب kind */
  name: string | null;
  /** رقم يُعرض في العنوان (مثل عدد الطلبات الزايدة أو المسجلين الجدد) */
  n?: number;
  at: string | null;
  route: OfficeRoute;
  agent: 'manual' | 'claude';
  /** رقم صف office_tasks (لمهام الوكلاء بس) — الضغط عليها يفتح ورقة الموافقة بدل القسم */
  agentTaskId?: string;
}

export interface DeskLink { key: string; route: OfficeRoute }
export interface DeskDef {
  id: DeskId;
  /** اسم Ionicons */
  icon: string;
  /** مكانه على أرضية المكتب (شبكة 3×3، المدير في النص) */
  col: -1 | 0 | 1;
  row: -1 | 0 | 1;
  /** لون قميص الموظف */
  shirt: string;
  links: DeskLink[];
}

export interface DeskState { id: DeskId; waiting: number; inProgress: number; done: number; alert: boolean }

const r = (pathname: string, params?: Record<string, string>): OfficeRoute => (params ? { pathname, params } : { pathname });

// row -1 = آخر المكتب (فوق في الشاشة)، row 1 = أقرب للكاميرا
export const DESKS: DeskDef[] = [
  { id: 'clubs', icon: 'business', col: -1, row: -1, shirt: '#F1551D', links: [{ key: 'approvals', route: r('/owner') }, { key: 'manage', route: r('/owner-partners', { kind: 'club' }) }] },
  { id: 'stores', icon: 'storefront', col: 0, row: -1, shirt: '#5B8DEF', links: [{ key: 'review', route: r('/owner-partners', { kind: 'store' }) }] },
  { id: 'coaches', icon: 'person', col: 1, row: -1, shirt: '#2E9E6A', links: [{ key: 'review', route: r('/owner-partners', { kind: 'coach' }) }, { key: 'verify', route: r('/owner-verify') }] },
  { id: 'care', icon: 'medkit', col: -1, row: 0, shirt: '#3FA7A0', links: [{ key: 'centers', route: r('/owner-partners', { kind: 'center' }) }, { key: 'venues', route: r('/owner-partners', { kind: 'venue' }) }] },
  { id: 'lead', icon: 'briefcase', col: 0, row: 0, shirt: '#0A332D', links: [{ key: 'panel', route: r('/owner') }] },
  { id: 'reports', icon: 'bug', col: 1, row: 0, shirt: '#E06C75', links: [{ key: 'reports', route: r('/owner') }] },
  { id: 'marketing', icon: 'megaphone', col: -1, row: 1, shirt: '#FEA94F', links: [{ key: 'ads', route: r('/owner-ads') }, { key: 'events', route: r('/owner-events') }, { key: 'nudges', route: r('/owner-nudges') }] },
  { id: 'users', icon: 'people', col: 0, row: 1, shirt: '#8E6CC8', links: [{ key: 'users', route: r('/owner-users') }, { key: 'verify', route: r('/owner-verify') }] },
  { id: 'ai', icon: 'sparkles', col: 1, row: 1, shirt: '#2F4B3C', links: [{ key: 'aiLimits', route: r('/owner-ai-limits') }, { key: 'kcal', route: r('/owner-calorie-alert') }] },
];
export const deskDef = (id: DeskId): DeskDef => DESKS.find((d) => d.id === id)!;

export type PartnerKindLite = 'club' | 'store' | 'coach' | 'center' | 'venue';
export type ReportStatusLite = 'new' | 'seen' | 'fixed' | 'wontfix';
export type AdStateLite = 'live' | 'scheduled' | 'ended' | 'off';
export type EventStateLite = 'now' | 'soon' | 'open' | 'past' | 'hidden';

/** اللي يحتاجه المكتب من مهمة الوكيل (صف office_tasks) */
export type AgentTaskLite = Pick<AgentTaskRow,
  'id' | 'desk' | 'kind' | 'target_kind' | 'target_id' | 'title' | 'status' | 'output' | 'created_at' | 'finished_at' | 'decided_at'>;

/** كل اللي يحتاجه المكتب من قاعدة البيانات، بأنواع بسيطة (تنبني في office.ts) */
export interface OfficeSnapshot {
  /** عدد الطلبات المعلّقة لكل نوع شريك (partner_overview: المصدر الأدق للعدد) */
  pending: Partial<Record<PartnerKindLite, number>>;
  /** الطلبات نفسها (ممكن تكون أقل من العدد لأن كل قائمة لها حد) */
  requests: { kind: PartnerKindLite; id: string; name: string; at: string | null }[];
  reports: { id: string; status: ReportStatusLite; message: string; at: string; updated_at: string | null }[];
  /** null = ما قدرنا نحمّلها (ما نقول "ما فيه إعلان" وهي بس ما وصلت) */
  ads: { id: string; title: string; state: AdStateLite; at: string | null }[] | null;
  events: { id: string; title: string; title_en: string | null; state: EventStateLite; starts_on: string | null; at: string | null }[] | null;
  users: { trainees: number; new7d: number } | null;
  kcalEnabled: boolean | null;
  /** مهام الوكلاء (الأحدث أول). null = ما انحمّلت */
  agentTasks: AgentTaskLite[] | null;
}

/** ولا شي محمّل */
export const EMPTY_SNAPSHOT: OfficeSnapshot = { pending: {}, requests: [], reports: [], ads: null, events: null, users: null, kcalEnabled: null, agentTasks: null };

const REQUEST_DESK: Record<PartnerKindLite, DeskId> = { club: 'clubs', store: 'stores', coach: 'coaches', center: 'care', venue: 'care' };
const REQUEST_ROUTE: Record<PartnerKindLite, OfficeRoute> = {
  // طلبات الأندية توافق عليها من لوحة الإدارة بس (قائمة النوادي في owner-partners ما فيها الطلبات)
  club: r('/owner'),
  store: r('/owner-partners', { kind: 'store' }),
  coach: r('/owner-partners', { kind: 'coach' }),
  center: r('/owner-partners', { kind: 'center' }),
  venue: r('/owner-partners', { kind: 'venue' }),
};
const PARTNER_KINDS_LITE: PartnerKindLite[] = ['club', 'store', 'coach', 'center', 'venue'];

/** كم مهمة منتهية نعرض لكل نوع (الباقي تاريخ قديم ما يهم المكتب) */
export const DONE_LIMIT = 8;

const byNewest = (a: string | null, b: string | null) => (b ?? '').localeCompare(a ?? '');
const clip = (s: string, n = 90) => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};

/** نوع المهمة في المكتب لكل نوع شغل وكيل */
const AGENT_TASK_KIND: Record<AgentKind, TaskKind> = {
  triage_report: 'agent_report', review_partner: 'agent_partner', draft_nudge: 'agent_nudge', review_ai_limits: 'agent_limits', daily_brief: 'agent_brief',
};
const DESK_IDS = new Set<string>(DESKS.map((d) => d.id));
/** مهمة الوكيل مفتوحة (يشتغل عليها أو تنتظرك) = هي اللي تمثّل العنصر بدل مهمته اليدوية */
const agentOpen = (a: AgentTaskLite) => a.status === 'scheduled' || a.status === 'in_progress' || a.status === 'waiting_approval';
/** رقم العنصر نفسه في المهام اليدوية (report:<id> أو <نوع الشريك>:<id>) */
const itemKey = (a: Pick<AgentTaskLite, 'target_kind' | 'target_id'>) => (a.target_kind && a.target_id ? `${a.target_kind}:${a.target_id}` : null);

/** وين يفتح «افتح القسم» لمهمة الوكيل */
export function agentRoute(a: Pick<AgentTaskLite, 'desk' | 'kind' | 'target_kind'>): OfficeRoute {
  if (a.target_kind === 'report') return r('/owner');
  if (a.target_kind) return REQUEST_ROUTE[a.target_kind];
  if (a.kind === 'draft_nudge') return r('/owner-nudges');
  if (a.kind === 'review_ai_limits') return r('/owner-ai-limits');
  return DESK_IDS.has(a.desk) ? deskDef(a.desk).links[0].route : r('/owner');
}

/** اسم مهمة الوكيل: عنوانها، أو اسم العنصر نفسه، أو عنوان التنبيه المقترح، أو عنوان ملخص اليوم بلغتك */
function agentName(a: AgentTaskLite, lng: 'ar' | 'en', items: Map<string, string>): string | null {
  if (a.title) return clip(a.title);
  const item = itemKey(a);
  if (item && items.get(item)) return items.get(item)!;
  const o = a.output as Record<string, any> | null;
  const nudge = o?.template?.title;
  if (a.kind === 'draft_nudge' && typeof nudge === 'string' && nudge.trim()) return clip(nudge);
  const h = o?.headline;
  const head = h && typeof h === 'object' ? (typeof h[lng] === 'string' && h[lng].trim() ? h[lng] : h.ar ?? h.en) : null;
  if (a.kind === 'daily_brief' && typeof head === 'string' && head.trim()) return clip(head);
  return null;
}

/** نوع مهمة الوكيل في المكتب (اللي ما كمّلت لها نوعها) */
export const agentTaskKind = (a: Pick<AgentTaskLite, 'kind' | 'status'>): TaskKind => (a.status === 'failed' ? 'agent_failed' : AGENT_TASK_KIND[a.kind]);

/** مهام الوكلاء: تشتغل/مجدولة = شغّالة، تنتظر موافقتك = تنتظرك، خلصت/فشلت = منتهية (آخر DONE_LIMIT لكل نوع بكل مكتب) */
function agentTasksOf(list: AgentTaskLite[], lng: 'ar' | 'en', items: Map<string, string>): OfficeTask[] {
  const out: OfficeTask[] = [];
  const closed: { t: OfficeTask; group: string }[] = [];
  for (const a of list) {
    if (!DESK_IDS.has(a.desk) || !AGENT_TASK_KIND[a.kind]) continue; // نوع من نسخة أحدث ما نعرفه
    const failed = a.status === 'failed';
    const kind = agentTaskKind(a);
    const base = { id: `agent:${a.id}`, desk: a.desk, kind, name: agentName(a, lng, items), route: agentRoute(a), agent: 'claude' as const, agentTaskId: a.id };
    if (a.status === 'waiting_approval') out.push({ ...base, status: 'waiting', at: a.finished_at ?? a.created_at });
    else if (a.status === 'in_progress' || a.status === 'scheduled') out.push({ ...base, status: 'in_progress', at: a.created_at });
    else if (a.status === 'done' || failed) closed.push({ t: { ...base, status: 'done', at: a.decided_at ?? a.finished_at ?? a.created_at }, group: `${a.desk}:${kind}` });
  }
  const groups = new Map<string, OfficeTask[]>();
  for (const c of closed) groups.set(c.group, [...(groups.get(c.group) ?? []), c.t]);
  for (const g of groups.values()) out.push(...g.sort((a, b) => byNewest(a.at, b.at)).slice(0, DONE_LIMIT));
  return out;
}

/** مهام المكتب كلها من لقطة البيانات */
export function buildTasks(s: OfficeSnapshot, lng: 'ar' | 'en' = 'ar'): OfficeTask[] {
  const tasks: OfficeTask[] = [];
  const agents = s.agentTasks ?? [];
  // العنصر اللي عليه مهمة وكيل مفتوحة تمثّله مهمة الوكيل (ما ننحسب مرتين)
  const taken = new Set(agents.filter(agentOpen).map(itemKey).filter((k): k is string => !!k));
  const add = (t: Omit<OfficeTask, 'agent'>) => { if (!taken.has(t.id)) tasks.push({ ...t, agent: 'manual' }); };

  // طلبات الشركاء: كل طلب مهمة تنتظر موافقتك، ولو العدد أكبر من القائمة نضيف مهمة "و N طلبات ثانية"
  for (const k of PARTNER_KINDS_LITE) {
    const items = s.requests.filter((q) => q.kind === k);
    for (const q of items) add({ id: `${k}:${q.id}`, desk: REQUEST_DESK[k], kind: `${k}_request` as TaskKind, status: 'waiting', name: q.name, at: q.at, route: REQUEST_ROUTE[k] });
    // طلبات عليها مهمة وكيل مفتوحة بس مو في القائمة (القائمة لها حد): هي من العدد، فما نحسبها مرة ثانية في "و N"
    const listed = new Set(items.map((q) => q.id));
    const agentOnly = agents.filter((a) => agentOpen(a) && a.target_kind === k && a.target_id && !listed.has(a.target_id)).length;
    const extra = Math.max(0, (s.pending[k] ?? 0) - items.length - agentOnly);
    if (extra) add({ id: `${k}:more`, desk: REQUEST_DESK[k], kind: 'more_requests', status: 'waiting', name: null, n: extra, at: null, route: REQUEST_ROUTE[k] });
  }

  // تقارير المختبرين: جديد = ينتظرك، قيد الدراسة = شغّال، تم/لن يُنفّذ = منتهي
  for (const rep of s.reports) {
    if (rep.status === 'new') add({ id: `report:${rep.id}`, desk: 'reports', kind: 'report_new', status: 'waiting', name: clip(rep.message), at: rep.at, route: r('/owner') });
    else if (rep.status === 'seen') add({ id: `report:${rep.id}`, desk: 'reports', kind: 'report_seen', status: 'in_progress', name: clip(rep.message), at: rep.updated_at ?? rep.at, route: r('/owner') });
  }
  s.reports.filter((x) => (x.status === 'fixed' || x.status === 'wontfix') && !taken.has(`report:${x.id}`))
    .sort((a, b) => byNewest(a.updated_at ?? a.at, b.updated_at ?? b.at)).slice(0, DONE_LIMIT)
    .forEach((rep) => add({ id: `report:${rep.id}`, desk: 'reports', kind: 'report_done', status: 'done', name: clip(rep.message), at: rep.updated_at ?? rep.at, route: r('/owner') }));

  // التسويق: لو ما فيه إعلان شغّال أو فعالية قادمة ينبّهك المكتب (تحتاج قرارك)
  const ads = r('/owner-ads');
  const adList = s.ads ?? [];
  if (s.ads && !adList.some((a) => a.state === 'live')) add({ id: 'ad:none', desk: 'marketing', kind: 'ad_none', status: 'waiting', name: null, at: null, route: ads });
  for (const a of adList) {
    if (a.state === 'live') add({ id: `ad:${a.id}`, desk: 'marketing', kind: 'ad_live', status: 'in_progress', name: a.title, at: a.at, route: ads });
    else if (a.state === 'scheduled') add({ id: `ad:${a.id}`, desk: 'marketing', kind: 'ad_scheduled', status: 'in_progress', name: a.title, at: a.at, route: ads });
  }
  adList.filter((a) => a.state === 'ended').sort((a, b) => byNewest(a.at, b.at)).slice(0, DONE_LIMIT)
    .forEach((a) => add({ id: `ad:${a.id}`, desk: 'marketing', kind: 'ad_ended', status: 'done', name: a.title, at: a.at, route: ads }));

  const events = r('/owner-events');
  const evList = s.events ?? [];
  const title = (e: (typeof evList)[number]) => (lng === 'en' && e.title_en ? e.title_en : e.title);
  const upcoming = evList.filter((e) => e.state === 'now' || e.state === 'soon' || e.state === 'open');
  if (s.events && !upcoming.length) add({ id: 'event:none', desk: 'marketing', kind: 'event_none', status: 'waiting', name: null, at: null, route: events });
  for (const e of upcoming) add({ id: `event:${e.id}`, desk: 'marketing', kind: 'event_upcoming', status: 'in_progress', name: title(e), at: e.starts_on, route: events });
  evList.filter((e) => e.state === 'past').sort((a, b) => byNewest(a.starts_on, b.starts_on)).slice(0, DONE_LIMIT)
    .forEach((e) => add({ id: `event:${e.id}`, desk: 'marketing', kind: 'event_past', status: 'done', name: title(e), at: e.starts_on, route: events }));

  // المتدربين الجدد هذا الأسبوع: شغل جاري (ترحيب، متابعة)
  if (s.users?.new7d) add({ id: 'users:new7d', desk: 'users', kind: 'users_new', status: 'in_progress', name: null, n: s.users.new7d, at: null, route: r('/owner-users') });

  // تنبيه السعرات موقوف = يحتاج قرارك
  if (s.kcalEnabled === false) add({ id: 'kcal:off', desk: 'ai', kind: 'kcal_off', status: 'waiting', name: null, at: null, route: r('/owner-calorie-alert') });

  // شغل الوكلاء (يشتغلون، ينتظرون موافقتك، أو خلصوا) — واسم العنصر من بياناته لو المهمة بدون عنوان
  const itemNames = new Map<string, string>([
    ...s.requests.map((q): [string, string] => [`${q.kind}:${q.id}`, q.name]),
    ...s.reports.map((x): [string, string] => [`report:${x.id}`, clip(x.message)]),
  ]);
  tasks.push(...agentTasksOf(agents, lng, itemNames));

  return tasks;
}

/** عدد المهام في المهمة الواحدة (مهمة "و N طلبات ثانية" تنحسب N) */
const weight = (t: OfficeTask) => (t.kind === 'more_requests' ? t.n ?? 1 : 1);

/** عدّادات كل مكتب. المدير (lead) يجمع كل اللي ينتظر موافقتك (ومعها شغل وكيله: ملخص اليوم) */
export function deskStates(tasks: OfficeTask[]): DeskState[] {
  const states = DESKS.map((d): DeskState => {
    const mine = tasks.filter((t) => t.desk === d.id);
    const sum = (st: TaskStatus) => mine.filter((t) => t.status === st).reduce((n, t) => n + weight(t), 0);
    const waiting = sum('waiting');
    return { id: d.id, waiting, inProgress: sum('in_progress') + sum('scheduled'), done: sum('done'), alert: waiting > 0 };
  });
  const lead = states.find((x) => x.id === 'lead')!;
  const others = states.filter((x) => x.id !== 'lead');
  lead.waiting += others.reduce((n, x) => n + x.waiting, 0);
  lead.inProgress += others.reduce((n, x) => n + x.inProgress, 0);
  lead.done += others.reduce((n, x) => n + x.done, 0);
  lead.alert = lead.waiting > 0;
  return states;
}

/** كل اللي ينتظر موافقتك في المكتب (رقم المدير) — نفس الرقم في رابط المكتب بلوحة الإدارة */
export const waitingTotal = (s: OfficeSnapshot): number => deskStates(buildTasks(s)).find((x) => x.id === 'lead')!.waiting;

export type TaskFilter = 'waiting' | 'in_progress' | 'done' | 'all';

/** المهام المعروضة: حسب المكتب المختار والفلتر. الأحدث أول، واللي بدون تاريخ (تنبيهات) فوق */
export function filterTasks(tasks: OfficeTask[], desk: DeskId | null, filter: TaskFilter): OfficeTask[] {
  const order: Record<TaskStatus, number> = { waiting: 0, scheduled: 1, in_progress: 1, done: 2 };
  return tasks
    .filter((t) => !desk || desk === 'lead' || t.desk === desk)
    .filter((t) => filter === 'all' || t.status === filter || (filter === 'in_progress' && t.status === 'scheduled'))
    .sort((a, b) => order[a.status] - order[b.status] || (a.at && b.at ? byNewest(a.at, b.at) : a.at ? 1 : b.at ? -1 : 0));
}

/** عدّاد كل فلتر (للأزرار) */
export function filterCounts(tasks: OfficeTask[], desk: DeskId | null): Record<TaskFilter, number> {
  const mine = tasks.filter((t) => !desk || desk === 'lead' || t.desk === desk);
  const sum = (f: (t: OfficeTask) => boolean) => mine.filter(f).reduce((n, t) => n + weight(t), 0);
  return {
    waiting: sum((t) => t.status === 'waiting'),
    in_progress: sum((t) => t.status === 'in_progress' || t.status === 'scheduled'),
    done: sum((t) => t.status === 'done'),
    all: sum(() => true),
  };
}

/** مكان المكتب على أرضية المشهد (وحدات three.js). المسافة بين المكاتب ثابتة */
export const DESK_GAP = 2.9;
export const deskSpot = (d: Pick<DeskDef, 'col' | 'row'>): [number, number] => [d.col * DESK_GAP, d.row * DESK_GAP];
/** ترتيب الرسم من الأبعد للأقرب (الكاميرا من جهة +x +z) */
export const paintOrder = (desks: DeskDef[]): DeskDef[] => [...desks].sort((a, b) => a.col + a.row - (b.col + b.row) || a.col - b.col);
