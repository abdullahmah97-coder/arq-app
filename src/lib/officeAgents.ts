// مكتب أرك أب — وكلاء الذكاء الاصطناعي من جهة التطبيق: تشغيل وكيل مكتب، قراءة مهامهم، والموافقة أو الرفض.
// الوكيل نفسه ما يغيّر أي شي: لما توافق، التطبيق ينفّذ الاقتراح بجلستك أنت (نفس دوال الأقسام بالضبط)،
// وبعدها يسجّل القرار بـ office_decide (ينكتب في سجل إجراءات المالك). الرفض يسجّل القرار بس.
import { parseAiLimits, saveAiLimits, type AiLimits } from './aiLimits';
import { saveNudge } from './nudges';
import {
  approveSteps, limitsChanged, mergeAgentRows, parseRunResult, runErrorCode,
  type AgentTarget, type AgentTaskRow, type OfficeError, type Prepared, type RunResult,
} from './officeAgentsCore';
import type { DeskId } from './officeCore';
import { updateReport } from './owner';
import { partnerAction, reviewClubRequest } from './partners';
import { supabase } from './supabase';

/** المفتوحة كلها (حد الخادم الافتراضي ١٠٠٠)، ومن المنتهية آخر ١٥٠ بس (المكتب يعرض آخر كم وحدة لكل نوع) */
const OPEN_MAX = 1000;
const CLOSED_MAX = 150;

/**
 * مهام الوكلاء (الأحدث أول): كل المفتوحة (تشتغل أو تنتظرك — مهما قدمت، عشان ما تختفي وهي تنتظر قرارك)
 * + آخر المنتهية. ترمي الخطأ — للتحديث وهم يشتغلون: خطأ شبكة ما يمسح اللي قدامك
 */
export async function fetchAgentTasks(): Promise<AgentTaskRow[]> {
  const [open, closed] = await Promise.all([
    supabase.from('office_tasks').select('*').in('status', ['scheduled', 'in_progress', 'waiting_approval'])
      .order('created_at', { ascending: false }).limit(OPEN_MAX),
    supabase.from('office_tasks').select('*').in('status', ['done', 'failed'])
      .order('created_at', { ascending: false }).limit(CLOSED_MAX),
  ]);
  if (open.error) throw open.error;
  if (closed.error) throw closed.error;
  return mergeAgentRows((open.data ?? []) as unknown[], (closed.data ?? []) as unknown[]);
}

/** مهام الوكلاء. لو ما قدرنا نقراها (أو الجدول للحين ما انضاف) = ولا مهمة */
export const loadAgentTasks = (): Promise<AgentTaskRow[]> => fetchAgentTasks().catch(() => []);

/** رقم طلب فريد (الدالة تحفظه مع المهام) */
const newRequestId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0;
  return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

/**
 * رد الدالة بخطأ → رمز. انقطاع الاتصال أو مهلة البوابة (504/546) = running:
 * الدالة تكمّل شغلها بالخلفية (waitUntil) والمهام تطلع في المكتب بعد شوي
 */
async function functionError(error: unknown): Promise<OfficeError> {
  const e = error as { name?: string; context?: Response };
  if (e?.name !== 'FunctionsHttpError' || !e.context) return 'running';
  const status = e.context.status;
  if (status === 504 || status === 546) return 'running';
  let code = '';
  try { code = String(((await e.context.json()) as { error?: string })?.error ?? ''); } catch { /* رد مو JSON */ }
  if (!code && status === 429) return 'rate_limited';
  return runErrorCode(code);
}

export type RunOutcome = RunResult | { error: OfficeError };

/** يشغّل وكيل المكتب (brief = ملاحظتك الاختيارية لوكيل التسويق). يرجع كم مهمة جهّز، أو رمز خطأ له نص office.err_* */
export async function runDeskAgent(desk: DeskId, brief?: string): Promise<RunOutcome> {
  try {
    const { data, error } = await supabase.functions.invoke('office-agent', {
      body: { desk, brief: brief?.trim() || undefined, request_id: newRequestId() },
    });
    if (error) return { error: await functionError(error) };
    const r = parseRunResult(data);
    if (r) return r;
    return { error: runErrorCode((data as { error?: unknown } | null)?.error) };
  } catch {
    return { error: 'running' };
  }
}

/** حالة العنصر اللي تنتظره المهمة بجدوله (البلاغ جديد، والطلبات معلّقة). المدرب رقمه رقم حسابه */
const TARGET: Record<AgentTarget, { table: string; col: string; want: string }> = {
  report: { table: 'beta_feedback', col: 'id', want: 'new' },
  club: { table: 'club_requests', col: 'id', want: 'pending' },
  store: { table: 'brands', col: 'id', want: 'pending' },
  coach: { table: 'coach_profiles', col: 'user_id', want: 'pending' },
  center: { table: 'recovery_centers', col: 'id', want: 'pending' },
  venue: { table: 'venues', col: 'id', want: 'pending' },
};

/** هل العنصر للحين بانتظار قرار؟ (لو قرّرته يدوياً من القسم، الاقتراح صار قديم وما ننفّذه) */
export async function stillPending(task: Pick<AgentTaskRow, 'target_kind' | 'target_id'>): Promise<boolean> {
  if (!task.target_kind || !task.target_id) return true;
  const t = TARGET[task.target_kind];
  const { data, error } = await supabase.from(t.table).select('status').eq(t.col, task.target_id).maybeSingle();
  if (error) throw error;
  return (data as { status?: string } | null)?.status === t.want;
}

/** حدود الذكاء اللي بالإعدادات الحين (ترمي الخطأ: ما نقارن بالقيم الافتراضية وهي بس ما وصلت) */
export async function currentAiLimits(): Promise<AiLimits> {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'ai_limits').maybeSingle();
  if (error) throw error;
  return parseAiLimits((data as { value?: unknown } | null)?.value);
}

/** الاقتراح للحين له معنى؟ العنصر ينتظر قرار، ولاقتراح الحدود: الحدود نفسها ما تغيّرت من وقت ما انبنى عليها */
async function stillCurrent(task: AgentTaskRow): Promise<boolean> {
  if (task.kind === 'review_ai_limits') return !limitsChanged(task.input.current, await currentAiLimits());
  return stillPending(task);
}

async function decide(id: string, decision: 'approved' | 'rejected', final: Record<string, unknown> | null, note?: string) {
  const args: Record<string, unknown> = { p_id: id, p_decision: decision, p_final: final };
  if (note?.trim()) args.p_note = note.trim();
  const { error } = await supabase.rpc('office_decide', args);
  if (error) throw error;
}

/** ينفّذ اقتراحك بنفس دوال الأقسام */
async function applyProposal(task: AgentTaskRow, ready: Prepared): Promise<void> {
  switch (ready.kind) {
    case 'triage_report':
      if (!task.target_id) throw new Error('bad_input');
      await updateReport(task.target_id, { status: ready.final.status, admin_note: ready.final.reply || null });
      break;
    case 'review_partner': {
      const { decision, note } = ready.final;
      if (!task.target_id || !task.target_kind || task.target_kind === 'report') throw new Error('bad_input');
      // الرسالة توصل للشريك مع الرفض بس (نفس لوحة الإدارة): مع القبول ما نمرّرها
      const reason = decision === 'reject' ? note || undefined : undefined;
      // طلب النادي: نفس قرار لوحة الإدارة (ما نمرّر سلسلة أبداً — الخادم يربطه بسلسلته أو ينشئ وحدة)
      if (task.target_kind === 'club') await reviewClubRequest(task.target_id, decision === 'approve' ? 'approved' : 'rejected', reason);
      else await partnerAction(task.target_kind, task.target_id, decision === 'approve' ? 'approve' : 'reject', reason);
      break;
    }
    case 'draft_nudge':
      // ينحفظ موقوف: تفعّله أو ترسله بنفسك من شاشة تنبيهات التحفيز
      await saveNudge({ ...ready.final.template, friend_gender: 'all', active: false });
      break;
    case 'review_ai_limits':
      await saveAiLimits(ready.final);
      break;
  }
}

/**
 * موافقات انطبقت بهالجلسة بس قرارها ما انسجّل (not_recorded): رقم المهمة → final اللي انطبق.
 * تعيش طول ما التطبيق مفتوح (حتى لو قفلت الورقة وفتحتها): «اعتمد» مرة ثانية يسجّل القرار بس وما ينفّذ مرة ثانية
 */
const appliedPending = new Map<string, Record<string, unknown>>();

/**
 * توافق على اقتراح الوكيل (بعد تعديلك): نتأكد إن المهمة والعنصر للحين ينتظرون، ننفّذ بنفس دوال الأقسام، ونسجّل القرار.
 * أخطاء: not_waiting (انقرّرت أو الوكيل لسا يشتغل)، already_decided (العنصر انقرّر يدوياً أو الحدود تغيّرت)،
 * not_recorded (انطبق بس ما قدرنا نسجّل القرار: اعتمد مرة ثانية يسجّله بس)، bad_input (المسودة ناقصة)، وأخطاء الأقسام نفسها
 */
export async function approveTask(task: AgentTaskRow, final: unknown): Promise<void> {
  await approveSteps(task, final, {
    // المهمة للحين تنتظرك؟ (ممكن انقرّرت من جهاز ثاني)
    status: async () => {
      const cur = await supabase.from('office_tasks').select('status').eq('id', task.id).maybeSingle();
      if (cur.error) throw cur.error;
      return (cur.data as { status?: string } | null)?.status ?? null;
    },
    current: () => stillCurrent(task),
    apply: (ready) => applyProposal(task, ready),
    record: (fin) => decide(task.id, 'approved', fin),
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
  }, appliedPending);
}

/** ترفض الاقتراح: يتسجّل القرار بس وما يتغيّر شي بالتطبيق */
export async function rejectTask(task: Pick<AgentTaskRow, 'id'>, note?: string): Promise<void> {
  // اقتراح انطبق بس قراره ما انسجّل: ما نسجّله «مرفوض» وهو منفّذ — اعتمد يسجّله
  if (appliedPending.has(task.id)) throw new Error('not_recorded');
  await decide(task.id, 'rejected', null, note);
}
