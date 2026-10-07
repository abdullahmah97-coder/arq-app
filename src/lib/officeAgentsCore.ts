// مكتب أرك أب — موظفين الذكاء الاصطناعي: أنواع مهامهم، قراءة اقتراحاتهم المحفوظة بأمان، وقواعد التحقق قبل التنفيذ.
// منطق بحت (بدون React Native ولا supabase) عشان ينختبر لحاله. نفس قواعد دالة الخادم office-agent:
// الوكيل يجهّز الاقتراح ويحفظه في office_tasks، وأنت تعدّله لو تبي وتوافق (التطبيق ينفّذه بجلستك) أو ترفضه.
import { DESKS, type DeskId } from './officeCore.ts';

export type AgentKind = 'triage_report' | 'review_partner' | 'draft_nudge' | 'review_ai_limits' | 'daily_brief';
export type AgentStatus = 'scheduled' | 'in_progress' | 'waiting_approval' | 'done' | 'failed';
export type AgentTarget = 'report' | 'club' | 'store' | 'coach' | 'center' | 'venue';
export type Lang = 'ar' | 'en';
/** نص بلغتين (كل مخرجات الوكيل اللي تنعرض في المكتب) */
export interface Bi { ar: string; en: string }

/** صف من office_tasks كما يقراه التطبيق */
export interface AgentTaskRow {
  id: string;
  desk: DeskId;
  kind: AgentKind;
  target_kind: AgentTarget | null;
  target_id: string | null;
  title: string | null;
  status: AgentStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  model: string | null;
  decision: 'approved' | 'rejected' | null;
  decision_note: string | null;
  final: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  decided_at: string | null;
}

/** المكاتب اللي عندها وكيل (المتدربين للحين ما عندهم: الدالة ترجع agent_unavailable) */
export const AGENT_DESKS: DeskId[] = ['lead', 'clubs', 'stores', 'coaches', 'care', 'reports', 'marketing', 'ai'];
export const hasAgent = (d: DeskId): boolean => AGENT_DESKS.includes(d);

export const AGENT_KINDS: AgentKind[] = ['triage_report', 'review_partner', 'draft_nudge', 'review_ai_limits', 'daily_brief'];
export const AGENT_STATUSES: AgentStatus[] = ['scheduled', 'in_progress', 'waiting_approval', 'done', 'failed'];
export const AGENT_TARGETS: AgentTarget[] = ['report', 'club', 'store', 'coach', 'center', 'venue'];
const DESK_IDS: DeskId[] = DESKS.map((d) => d.id);

/** مهمة مفتوحة = الوكيل يشتغل عليها أو تنتظر قرارك (مهمة وحدة بس لكل عنصر بالقاعدة) */
export const isOpenAgent = (s: AgentStatus): boolean => s === 'scheduled' || s === 'in_progress' || s === 'waiting_approval';
/** الوكيل لسا يشتغل عليها */
export const isWorking = (s: AgentStatus): boolean => s === 'scheduled' || s === 'in_progress';

// ---------------------------------------------------------------------------
// قراءة آمنة: اللي محفوظ بالقاعدة ممكن يكون من نسخة أقدم أو أحدث من التطبيق، فما نثق بشكله
// ---------------------------------------------------------------------------
const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown, max: number): string | null => (typeof v === 'string' ? v.trim().slice(0, max).trim() : null);
const oneOf = <T extends string>(v: unknown, ok: readonly T[]): T | null => ((ok as readonly unknown[]).includes(v) ? (v as T) : null);
const notNull = <T,>(x: T | null): x is T => x !== null;
const ts = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** {ar, en}: لو وحدة فاضية ناخذ الثانية، ولو الثنتين فاضيات = null */
export function parseBi(v: unknown, max = 300): Bi | null {
  const o = rec(v);
  if (!o) return null;
  const ar = str(o.ar, max) ?? '';
  const en = str(o.en, max) ?? '';
  if (!ar && !en) return null;
  return { ar: ar || en, en: en || ar };
}

/** صف office_tasks → نوع التطبيق (null لو ناقص أو من نوع ما نعرفه) */
export function asAgentRow(v: unknown): AgentTaskRow | null {
  const o = rec(v);
  if (!o || typeof o.id !== 'string' || !o.id) return null;
  const desk = oneOf(o.desk, DESK_IDS);
  const kind = oneOf(o.kind, AGENT_KINDS);
  const status = oneOf(o.status, AGENT_STATUSES);
  const created = ts(o.created_at);
  if (!desk || !kind || !status || !created) return null;
  return {
    id: o.id, desk, kind,
    target_kind: oneOf(o.target_kind, AGENT_TARGETS),
    target_id: typeof o.target_id === 'string' && o.target_id ? o.target_id : null,
    title: typeof o.title === 'string' && o.title.trim() ? o.title.trim() : null,
    status,
    input: rec(o.input) ?? {},
    output: rec(o.output),
    error: typeof o.error === 'string' && o.error ? o.error : null,
    model: typeof o.model === 'string' && o.model ? o.model : null,
    decision: oneOf(o.decision, ['approved', 'rejected'] as const),
    decision_note: typeof o.decision_note === 'string' && o.decision_note.trim() ? o.decision_note.trim() : null,
    final: rec(o.final),
    created_at: created,
    updated_at: ts(o.updated_at) ?? created,
    finished_at: ts(o.finished_at),
    decided_at: ts(o.decided_at),
  };
}

// ---------------------------------------------------------------------------
// اقتراحات الوكلاء (office_tasks.output) — نفس أسماء الحقول اللي تحفظها الدالة
// ---------------------------------------------------------------------------
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];
export type ReportCategory = 'bug' | 'idea' | 'design' | 'other';
export const REPORT_CATEGORIES: ReportCategory[] = ['bug', 'idea', 'design', 'other'];
export type Confidence = 'high' | 'medium' | 'low';
export const CONFIDENCES: Confidence[] = ['high', 'medium', 'low'];
const LANGS: Lang[] = ['ar', 'en'];

export interface TriageOutput {
  summary: Bi; severity: Severity; category_guess: ReportCategory;
  /** حالة البلاغ المقترحة */
  status: 'seen' | 'wontfix';
  /** الرد اللي يشوفه المختبر (بلغته) */
  reply: string; reply_locale: Lang;
}
export interface PartnerOutput {
  summary: Bi; checks: { label: Bi; ok: boolean }[]; missing: Bi[];
  recommendation: 'approve' | 'reject';
  /** رسالة للشريك بلغته (لازمة مع الرفض: وش يصلّح بالضبط) */
  note: string; note_locale: Lang; confidence: Confidence;
}
export type NudgeCat = 'gym' | 'friend' | 'streak' | 'workout' | 'meal';
export type NudgeWho = 'all' | 'male' | 'female';
export const NUDGE_CATS: NudgeCat[] = ['gym', 'friend', 'streak', 'workout', 'meal'];
export const NUDGE_WHO: NudgeWho[] = ['all', 'male', 'female'];
export interface NudgeProposal { category: NudgeCat; gender: NudgeWho; locale: Lang; title: string; body: string }
export interface NudgeOutput { why: Bi; template: NudgeProposal }
export interface AiLimitsLite { barcode_per_day: number; meal_photos_per_day: number }
export interface LimitsOutput extends AiLimitsLite { why: Bi }
export interface BriefOutput { headline: Bi; points: Bi[]; priorities: { desk: DeskId; text: Bi }[] }

export function parseTriage(v: unknown): TriageOutput | null {
  const o = rec(v);
  if (!o) return null;
  const summary = parseBi(o.summary, 200);
  const severity = oneOf(o.severity, SEVERITIES);
  const category_guess = oneOf(o.category_guess, REPORT_CATEGORIES);
  const status = oneOf(o.status, ['seen', 'wontfix'] as const);
  const reply = str(o.reply, 600);
  const reply_locale = oneOf(o.reply_locale, LANGS);
  if (!summary || !severity || !category_guess || !status || reply === null || reply.length < 2 || !reply_locale) return null;
  return { summary, severity, category_guess, status, reply, reply_locale };
}

export function parsePartner(v: unknown): PartnerOutput | null {
  const o = rec(v);
  if (!o || !Array.isArray(o.checks) || !Array.isArray(o.missing)) return null;
  const summary = parseBi(o.summary, 240);
  const recommendation = oneOf(o.recommendation, ['approve', 'reject'] as const);
  const note = str(o.note, 300);
  const note_locale = oneOf(o.note_locale, LANGS);
  const confidence = oneOf(o.confidence, CONFIDENCES);
  if (!summary || !recommendation || note === null || !note_locale || !confidence) return null;
  // نفس قاعدة الخادم: الرفض بدون سبب واضح ما ينقبل
  if (recommendation === 'reject' && note.length < 3) return null;
  const checks = o.checks.map((c) => {
    const r = rec(c);
    const label = r ? parseBi(r.label, 80) : null;
    return r && label && typeof r.ok === 'boolean' ? { label, ok: r.ok } : null;
  }).filter(notNull).slice(0, 8);
  const missing = o.missing.map((m) => parseBi(m, 120)).filter(notNull).slice(0, 6);
  return { summary, checks, missing, recommendation, note, note_locale, confidence };
}

export function parseNudge(v: unknown): NudgeOutput | null {
  const o = rec(v);
  const t = rec(o?.template);
  if (!o || !t) return null;
  const why = parseBi(o.why, 200);
  const category = oneOf(t.category, NUDGE_CATS);
  const gender = oneOf(t.gender, NUDGE_WHO);
  const locale = oneOf(t.locale, LANGS);
  const title = str(t.title, 80);
  const body = str(t.body, 240);
  if (!why || !category || !gender || !locale || title === null || body === null || !validNudgeText(category, title, body)) return null;
  return { why, template: { category, gender, locale, title, body } };
}

export function parseLimits(v: unknown): LimitsOutput | null {
  const o = rec(v);
  if (!o) return null;
  const why = parseBi(o.why, 300);
  const b = num(o.barcode_per_day);
  const m = num(o.meal_photos_per_day);
  if (!why || b === null || m === null) return null;
  return { why, ...clampLimits({ barcode_per_day: b, meal_photos_per_day: m }) };
}

export function parseBrief(v: unknown): BriefOutput | null {
  const o = rec(v);
  if (!o || !Array.isArray(o.points) || !Array.isArray(o.priorities)) return null;
  const headline = parseBi(o.headline, 120);
  if (!headline) return null;
  const points = o.points.map((p) => parseBi(p, 200)).filter(notNull).slice(0, 6);
  const priorities = o.priorities.map((p) => {
    const r = rec(p);
    const desk = r ? oneOf(r.desk, DESK_IDS) : null;
    const text = r ? parseBi(r.text, 160) : null;
    return desk && text ? { desk, text } : null;
  }).filter(notNull).slice(0, 4);
  return { headline, points, priorities };
}

/** اقتراح الوكيل مقروء حسب نوع المهمة (null = المحفوظ ما يطابق الشكل) */
export type AgentProposal =
  | { kind: 'triage_report'; out: TriageOutput }
  | { kind: 'review_partner'; out: PartnerOutput }
  | { kind: 'draft_nudge'; out: NudgeOutput }
  | { kind: 'review_ai_limits'; out: LimitsOutput }
  | { kind: 'daily_brief'; out: BriefOutput };

export function parseProposal(kind: AgentKind, output: unknown): AgentProposal | null {
  switch (kind) {
    case 'triage_report': { const out = parseTriage(output); return out && { kind, out }; }
    case 'review_partner': { const out = parsePartner(output); return out && { kind, out }; }
    case 'draft_nudge': { const out = parseNudge(output); return out && { kind, out }; }
    case 'review_ai_limits': { const out = parseLimits(output); return out && { kind, out }; }
    case 'daily_brief': { const out = parseBrief(output); return out && { kind, out }; }
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// نص التنبيه وحدود الذكاء الاصطناعي (نفس قواعد القاعدة والدالة)
// ---------------------------------------------------------------------------
/** المتغيرات المسموحة لكل نوع تنبيه (بقوس واحد: {name}) — نفس NUDGE_VARS في nudges.ts و _nudge_fill بالخادم */
export const NUDGE_PLACEHOLDERS: Record<NudgeCat, string[]> = {
  gym: ['name', 'gym'],
  friend: ['name', 'friend', 'gym'],
  streak: ['name', 'streak', 'gym'],
  workout: ['name', 'workout'],
  meal: ['name'],
};

/** العنوان ١..٨٠ والنص ٣..٢٤٠ (بعد القص)، وكل {...} لازم يكون متغير مسموح لنوعه (أي قوس ثاني يخرّب القالب) */
export function validNudgeText(category: NudgeCat, title: string, body: string): boolean {
  const allowed = NUDGE_PLACEHOLDERS[category];
  if (!allowed || typeof title !== 'string' || typeof body !== 'string') return false;
  for (const s of [title, body]) {
    const rest = s.replace(/\{([^{}]*)\}/g, (_, k: string) => (allowed.includes(k) ? '' : '\u0000'));
    if (/[{}\u0000]/.test(rest)) return false;
  }
  const t = title.trim();
  const b = body.trim();
  return t.length >= 1 && t.length <= 80 && b.length >= 3 && b.length <= 240;
}

/** نفس AI_LIMIT_MAX و DEFAULT_AI_LIMITS في aiLimits.ts (وحارس app_settings بالقاعدة) */
export const AGENT_LIMIT_MAX: AiLimitsLite = { barcode_per_day: 100, meal_photos_per_day: 200 };
export const AGENT_LIMIT_DEFAULT: AiLimitsLite = { barcode_per_day: 2, meal_photos_per_day: 25 };

/** رقم من رقم أو نص (يقبل الأرقام العربية) — null لو مو رقم */
function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** أعداد صحيحة ضمن الحدود (٠..١٠٠ للباركود، ٠..٢٠٠ للصور). اللي مو رقم ياخذ القيمة الاحتياطية */
export function clampLimits(v: { barcode_per_day?: unknown; meal_photos_per_day?: unknown } | null | undefined, fallback: AiLimitsLite = AGENT_LIMIT_DEFAULT): AiLimitsLite {
  const one = (x: unknown, d: number, hi: number) => {
    const n = num(x);
    return n === null ? Math.max(0, Math.min(hi, Math.round(d))) : Math.max(0, Math.min(hi, Math.round(n)));
  };
  return {
    barcode_per_day: one(v?.barcode_per_day, fallback.barcode_per_day, AGENT_LIMIT_MAX.barcode_per_day),
    meal_photos_per_day: one(v?.meal_photos_per_day, fallback.meal_photos_per_day, AGENT_LIMIT_MAX.meal_photos_per_day),
  };
}

// ---------------------------------------------------------------------------
// موافقتك: المسودة اللي تعدّلها في الورقة، والتحقق منها قبل التنفيذ (final يتسجّل مع القرار)
// ---------------------------------------------------------------------------
export type ReportStatusFinal = 'seen' | 'fixed' | 'wontfix';
export const REPORT_FINAL_STATUSES: ReportStatusFinal[] = ['seen', 'fixed', 'wontfix'];
export interface TriageFinal { status: ReportStatusFinal; reply: string }
export interface PartnerFinal { decision: 'approve' | 'reject'; note: string }
export interface NudgeFinal { template: NudgeProposal }

export type Prepared =
  | { kind: 'triage_report'; final: TriageFinal }
  | { kind: 'review_partner'; final: PartnerFinal }
  | { kind: 'draft_nudge'; final: NudgeFinal }
  | { kind: 'review_ai_limits'; final: AiLimitsLite };
/** reply: الرد طويل، note: الرفض بدون سبب (٣ أحرف)، nudge: نص التنبيه ما يمشي، bad: شي ثاني ناقص */
export type FinalError = 'reply' | 'note' | 'nudge' | 'bad';

/** أقصى طول لرد المختبر (admin_note بالقاعدة ≤ ١٠٠٠) */
export const REPLY_MAX = 1000;
/** أقصى طول لرسالة الشريك (القاعدة تقص على ٣٠٠) */
export const NOTE_MAX = 300;

/** المسودة الأولى من اقتراح الوكيل (اللي تعدّل عليه قبل ما توافق) */
export function draftFrom(p: AgentProposal): Prepared['final'] | null {
  switch (p.kind) {
    case 'triage_report': return { status: p.out.status, reply: p.out.reply };
    case 'review_partner': return { decision: p.out.recommendation, note: p.out.note };
    case 'draft_nudge': return { template: { ...p.out.template } };
    case 'review_ai_limits': return { barcode_per_day: p.out.barcode_per_day, meal_photos_per_day: p.out.meal_photos_per_day };
    default: return null;
  }
}

/** يتحقق من مسودتك وينظفها قبل التنفيذ (ملخص اليوم للعلم بس: ما فيه شي ينفَّذ) */
export function prepareFinal(kind: AgentKind, draft: unknown): Prepared | { error: FinalError } {
  const d = rec(draft);
  if (!d) return { error: 'bad' };
  switch (kind) {
    case 'triage_report': {
      const status = oneOf(d.status, REPORT_FINAL_STATUSES);
      if (!status || typeof d.reply !== 'string') return { error: 'bad' };
      const reply = d.reply.trim();
      if (reply.length > REPLY_MAX) return { error: 'reply' };
      return { kind, final: { status, reply } };
    }
    case 'review_partner': {
      const decision = oneOf(d.decision, ['approve', 'reject'] as const);
      if (!decision || typeof d.note !== 'string') return { error: 'bad' };
      const note = d.note.trim().slice(0, NOTE_MAX).trim();
      if (decision === 'reject' && note.length < 3) return { error: 'note' };
      return { kind, final: { decision, note } };
    }
    case 'draft_nudge': {
      const t = rec(d.template);
      const category = oneOf(t?.category, NUDGE_CATS);
      const gender = oneOf(t?.gender, NUDGE_WHO);
      const locale = oneOf(t?.locale, LANGS);
      if (!t || !category || !gender || !locale || typeof t.title !== 'string' || typeof t.body !== 'string') return { error: 'bad' };
      if (!validNudgeText(category, t.title, t.body)) return { error: 'nudge' };
      return { kind, final: { template: { category, gender, locale, title: t.title.trim(), body: t.body.trim() } } };
    }
    case 'review_ai_limits':
      if (num(d.barcode_per_day) === null || num(d.meal_photos_per_day) === null) return { error: 'bad' };
      return { kind, final: clampLimits(d) };
    default:
      return { error: 'bad' };
  }
}

// ---------------------------------------------------------------------------
// تشغيل وكيل مكتب: نتيجة الدالة ورموز الأخطاء اللي لها نص في office.err_*
// ---------------------------------------------------------------------------
export interface RunResult { ran: number; waiting: number; done: number; failed: number; skipped: number }

export function parseRunResult(v: unknown): RunResult | null {
  const o = rec(v);
  if (!o) return null;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.round(x) : null);
  const r = { ran: n(o.ran), waiting: n(o.waiting), done: n(o.done), failed: n(o.failed), skipped: n(o.skipped) };
  if (r.ran === null) return null;
  return { ran: r.ran, waiting: r.waiting ?? 0, done: r.done ?? 0, failed: r.failed ?? 0, skipped: r.skipped ?? 0 };
}

/** سطر النتيجة تحت زر الوكيل: كل رقم مو صفر بمفتاح ترجمته (فاضي = ما فيه شي جديد) */
export function runLine(r: RunResult): { key: 'run_waiting' | 'run_done' | 'run_failed' | 'run_skipped'; n: number }[] {
  const parts = [
    { key: 'run_waiting' as const, n: r.waiting },
    { key: 'run_done' as const, n: r.done },
    { key: 'run_failed' as const, n: r.failed },
    { key: 'run_skipped' as const, n: r.skipped },
  ];
  return parts.filter((p) => p.n > 0);
}

/** أخطاء المكتب اللي لها نص خاص (office.err_<code>) */
export const OFFICE_ERRORS = [
  'not_waiting', 'already_decided', 'not_recorded', 'running', 'agent_unavailable', 'rate_limited', 'ai_not_configured', 'not_allowed', 'busy', 'network',
] as const;
export type OfficeError = (typeof OFFICE_ERRORS)[number] | 'generic';

/** رمز خطأ من الدالة → رمز له نص (غيره = generic) */
export function runErrorCode(code: unknown): OfficeError {
  return (OFFICE_ERRORS as readonly unknown[]).includes(code) ? (code as OfficeError) : 'generic';
}

/** خطأ انرمى (من القاعدة أو من approveTask) → رمز المكتب لو فيه، وإلا null (يتحول بـ errorKey العام) */
export function officeErrorCode(e: unknown): OfficeError | null {
  const msg = typeof e === 'string' ? e : String((e as { message?: unknown })?.message ?? '');
  // بس الرموز اللي فيها _ (كلمات مثل running أو network ممكن تجي بأي رسالة)
  return OFFICE_ERRORS.filter((c) => c.includes('_')).find((c) => new RegExp(`\\b${c}\\b`).test(msg)) ?? null;
}

/** سبب فشل مهمة الوكيل (office_tasks.error) → مفتاح نصه */
export const AGENT_FAIL_REASONS = ['ai_failed', 'ai_bad_output', 'ai_refused', 'timeout', 'stale'] as const;
export const failReason = (error: string | null): string => ((AGENT_FAIL_REASONS as readonly (string | null)[]).includes(error) ? error! : 'other');
