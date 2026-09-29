// طرق إنشاء الخطة:
//   ١) بالذكاء الاصطناعي: الدالة تبني الخطة وتحفظها بنفسها (تكمّل حتى لو طلعت من التطبيق)، والتطبيق يلقاها بـ request_id
//   ٢) القياسية (فورية، بدون إنترنت للحساب)
//   ٣) خطتك الخاصة: أنت تختار الأيام والتمارين، والسعرات والوجبات من خطتك الحالية أو القياسية
import { supabase } from '../supabase';
import type { HealthProfile } from '../types';
import { calcTargets, generateRulesPlan, validateInput } from './rules';
import type { PlanDay, PlanInput, WeeklyPlan } from './types';
import { buildCustomPlan } from './custom';
import { isWeeklyPlan } from './validate';

export { buildCustomPlan, planKind } from './custom';

export interface GeneratedPlan {
  plan: WeeklyPlan;
  source: 'ai' | 'rules';
  aiError?: string;
}

export type PlanErrorCode = 'rate_limited' | 'not_configured' | 'network' | 'failed' | 'incomplete';
export class PlanError extends Error {
  code: PlanErrorCode;
  constructor(code: PlanErrorCode) { super(code); this.code = code; }
}

export interface AiPlanOptions {
  photoPath?: string | null;
  inbodyReportId?: string | null;
  /** ملاحظاتك للمدرب الذكي (إصابة، عضلة تبي تركز عليها، أكل ما تحبه…) */
  notes?: string;
  place?: 'gym' | 'home';
}

/** معرّف عشوائي للطلب (نلقى فيه الخطة لو انقطع الاتصال) */
export const newRequestId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0;
  return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

/** بيانات الخطة من ملفك الصحي + آخر وزن + آخر تقرير InBody معتمد + آخر صورة جسم */
export async function loadPlanInput(userId: string, health: HealthProfile | null): Promise<{ input: PlanInput; inbodyReportId: string | null; photoPath: string | null } | null> {
  if (!health?.height_cm || !health.birth_year || !health.gender || !health.goal || !health.level || !health.days_per_week) return null;
  const { latestAppliedAnalysis } = await import('../inbody');
  const [ib, last, lastPhoto] = await Promise.all([
    latestAppliedAnalysis(userId).catch(() => null),
    supabase.from('body_logs').select('weight_kg').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('body_logs').select('photo_path').eq('user_id', userId).not('photo_path', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const input: PlanInput = {
    gender: health.gender,
    age: new Date().getFullYear() - health.birth_year,
    height_cm: Number(health.height_cm),
    weight_kg: Number(last.data?.weight_kg ?? health.weight_kg),
    goal: health.goal,
    level: health.level,
    days_per_week: health.days_per_week,
    inbody: ib?.analysis ?? null,
  };
  if (validateInput(input)) return null;
  return { input, inbodyReportId: ib?.id ?? null, photoPath: lastPhoto.data?.photo_path ?? null };
}

/** رد الخادم بخطأ → رمز واضح. null = مشكلة اتصال (الخطة ممكن انحفظت) */
async function serverError(error: unknown): Promise<PlanErrorCode | null> {
  const e = error as { name?: string; context?: Response };
  if (e?.name !== 'FunctionsHttpError' || !e.context) return null;
  const status = e.context.status;
  let code = '';
  try { code = String(((await e.context.json()) as { error?: string })?.error ?? ''); } catch { /* رد مو JSON */ }
  if (status === 429 || code === 'rate_limited') return 'rate_limited';
  if (code === 'ai_not_configured') return 'not_configured';
  // مهلة البوابة: الدالة ممكن تكمّل وتحفظ، فندوّر عليها
  if (status === 504 || status === 546) return null;
  return 'failed';
}

/** يدوّر على الخطة اللي حفظتها الدالة لهذا الطلب (كل ٣ ثواني لين المهلة) */
async function waitForSavedPlan(userId: string, requestId: string, timeoutMs: number, onWait?: () => void) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const { data } = await supabase.from('plans').select('id, data').eq('user_id', userId).eq('data->>request_id', requestId).maybeSingle();
    if (data?.id && isWeeklyPlan(data.data)) return { planId: data.id as string, plan: data.data as WeeklyPlan };
    onWait?.();
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

/**
 * خطة بالذكاء الاصطناعي. الدالة تحفظها كخطتك الفعّالة وترجع رقمها.
 * لو انقطع الاتصال (طلعت من التطبيق مثلاً) ندوّر على الخطة المحفوظة قبل ما نقول إنها فشلت.
 */
export async function createAiPlan(userId: string, input: PlanInput, opts: AiPlanOptions = {}, onWait?: () => void): Promise<{ planId: string; plan: WeeklyPlan }> {
  const requestId = newRequestId();
  const body = {
    input, targets: calcTargets(input), photo_path: opts.photoPath ?? undefined, inbody_report_id: opts.inbodyReportId ?? undefined,
    notes: opts.notes?.trim() || undefined, place: opts.place ?? 'gym', save: true, request_id: requestId,
  };
  let lostConnection = false;
  try {
    const { data, error } = await supabase.functions.invoke('generate-plan', { body });
    if (error) {
      const code = await serverError(error);
      if (code) throw new PlanError(code);
      lostConnection = true;
    } else if (data?.plan_id && isWeeklyPlan(data.plan)) {
      return { planId: data.plan_id as string, plan: data.plan as WeeklyPlan };
    } else if (data?.plan && isWeeklyPlan(data.plan)) {
      // الدالة القديمة ما تحفظ: نحفظ هنا
      const planId = await savePlan(userId, { plan: data.plan, source: 'ai' }, opts.inbodyReportId ?? null);
      return { planId, plan: data.plan };
    } else {
      throw new PlanError('failed');
    }
  } catch (e) {
    if (e instanceof PlanError) throw e;
    lostConnection = true;
  }
  if (lostConnection) {
    const found = await waitForSavedPlan(userId, requestId, 100_000, onWait);
    if (found) return found;
    throw new PlanError('network');
  }
  throw new PlanError('failed');
}

/** الخطة القياسية: فورية */
export async function createRulesPlan(userId: string, input: PlanInput, inbodyReportId?: string | null) {
  const plan = generateRulesPlan(input);
  const planId = await savePlan(userId, { plan, source: 'rules' }, inbodyReportId ?? null);
  return { planId, plan };
}

/** خطة بالذكاء الاصطناعي، ولو ما زبطت خطة قياسية (للتسجيل الأول وتقرير InBody) */
export async function createPlanWithFallback(userId: string, input: PlanInput, opts: AiPlanOptions = {}) {
  try {
    const r = await createAiPlan(userId, input, opts);
    return { ...r, source: 'ai' as const };
  } catch (e) {
    const r = await createRulesPlan(userId, input, opts.inbodyReportId);
    return { ...r, source: 'rules' as const, aiError: e instanceof PlanError ? e.code : String(e) };
  }
}

/**
 * خطتك الخاصة: أيامك وتمارينك، والسعرات والوجبات والنصائح من خطتك الحالية (أو القياسية لو ما عندك خطة).
 * تنحفظ «قياسية» في القاعدة مع علامة custom (ما تنحسب من حد الذكاء الاصطناعي).
 */
export async function createCustomPlan(userId: string, days: PlanDay[], base: WeeklyPlan | null, input: PlanInput | null) {
  const baseline = base ?? (input ? generateRulesPlan(input) : null);
  if (!baseline) throw new PlanError('incomplete');
  const plan = buildCustomPlan(days, baseline);
  if (!isWeeklyPlan(plan)) throw new PlanError('failed');
  const planId = await savePlan(userId, { plan, source: 'rules' });
  return { planId, plan };
}

/** يحفظ الخطة كخطة فعّالة ويُلغي تفعيل السابقة */
export async function savePlan(userId: string, g: GeneratedPlan, inbodyReportId?: string | null) {
  await supabase.from('plans').update({ active: false }).eq('user_id', userId).eq('active', true);
  const { data, error } = await supabase
    .from('plans')
    .insert({ user_id: userId, source: g.source, data: g.plan, active: true, inbody_report_id: inbodyReportId ?? null })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}
