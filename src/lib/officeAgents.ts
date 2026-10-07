// مكتب أرك أب — وكلاء الذكاء الاصطناعي من جهة التطبيق: تشغيل وكيل مكتب، قراءة مهامهم، والموافقة أو الرفض.
// الوكيل نفسه ما يغيّر أي شي: لما توافق، التطبيق ينفّذ الاقتراح بجلستك أنت (نفس دوال الأقسام بالضبط)،
// وبعدها يسجّل القرار بـ office_decide (ينكتب في سجل إجراءات المالك). الرفض يسجّل القرار بس.
import { saveAiLimits } from './aiLimits';
import { saveNudge } from './nudges';
import {
  asAgentRow, parseRunResult, prepareFinal, runErrorCode,
  type AgentTarget, type AgentTaskRow, type OfficeError, type RunResult,
} from './officeAgentsCore';
import type { DeskId } from './officeCore';
import { updateReport } from './owner';
import { partnerAction, reviewClubRequest } from './partners';
import { supabase } from './supabase';

/** مهام الوكلاء (الأحدث أول، آخر ١٥٠). ترمي الخطأ — للتحديث وهم يشتغلون: خطأ شبكة ما يمسح اللي قدامك */
export async function fetchAgentTasks(): Promise<AgentTaskRow[]> {
  const { data, error } = await supabase.from('office_tasks').select('*').order('created_at', { ascending: false }).limit(150);
  if (error) throw error;
  return ((data ?? []) as unknown[]).map(asAgentRow).filter((x): x is AgentTaskRow => !!x);
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

async function decide(id: string, decision: 'approved' | 'rejected', final: Record<string, unknown> | null, note?: string) {
  const args: Record<string, unknown> = { p_id: id, p_decision: decision, p_final: final };
  if (note?.trim()) args.p_note = note.trim();
  const { error } = await supabase.rpc('office_decide', args);
  if (error) throw error;
}

/**
 * توافق على اقتراح الوكيل (بعد تعديلك): نتأكد إن المهمة والعنصر للحين ينتظرون، ننفّذ بنفس دوال الأقسام، ونسجّل القرار.
 * أخطاء: not_waiting (انقرّرت أو الوكيل لسا يشتغل)، already_decided (العنصر انقرّر يدوياً)،
 * not_recorded (انطبق بس ما قدرنا نقفل المهمة)، bad_input (المسودة ناقصة)، وأخطاء الأقسام نفسها
 */
export async function approveTask(task: AgentTaskRow, final: unknown): Promise<void> {
  const ready = prepareFinal(task.kind, final);
  if ('error' in ready) throw new Error('bad_input');
  // المهمة للحين تنتظرك؟ (ممكن انقرّرت من جهاز ثاني)
  const cur = await supabase.from('office_tasks').select('status').eq('id', task.id).maybeSingle();
  if (cur.error) throw cur.error;
  if ((cur.data as { status?: string } | null)?.status !== 'waiting_approval') throw new Error('not_waiting');
  if (!(await stillPending(task))) throw new Error('already_decided');

  switch (ready.kind) {
    case 'triage_report':
      if (!task.target_id) throw new Error('bad_input');
      await updateReport(task.target_id, { status: ready.final.status, admin_note: ready.final.reply || null });
      break;
    case 'review_partner': {
      const { decision, note } = ready.final;
      if (!task.target_id || !task.target_kind || task.target_kind === 'report') throw new Error('bad_input');
      // طلب النادي: نفس قرار لوحة الإدارة (ما نمرّر سلسلة أبداً — الخادم يربطه بسلسلته أو ينشئ وحدة)
      if (task.target_kind === 'club') await reviewClubRequest(task.target_id, decision === 'approve' ? 'approved' : 'rejected', note || undefined);
      else await partnerAction(task.target_kind, task.target_id, decision === 'approve' ? 'approve' : 'reject', note);
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

  // تسجيل القرار (نعيد مرة لو تعثّر الاتصال: الاقتراح انطبق خلاص)
  try {
    await decide(task.id, 'approved', ready.final as unknown as Record<string, unknown>);
  } catch {
    await new Promise((r) => setTimeout(r, 800));
    try { await decide(task.id, 'approved', ready.final as unknown as Record<string, unknown>); } catch { throw new Error('not_recorded'); }
  }
}

/** ترفض الاقتراح: يتسجّل القرار بس وما يتغيّر شي بالتطبيق */
export async function rejectTask(task: Pick<AgentTaskRow, 'id'>, note?: string): Promise<void> {
  await decide(task.id, 'rejected', null, note);
}
