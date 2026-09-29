// خطتك الخاصة ونوع الخطة (منطق بحت عشان يتختبر)
import type { I18nText } from '../types';
import type { PlanDay, WeeklyPlan } from './types';

const t = (ar: string, en: string): I18nText => ({ ar, en });

/** يركّب خطتك الخاصة: أيامك وتمارينك مكان تمارين الخطة، والباقي (السعرات والوجبات والنصائح) يبقى */
export function buildCustomPlan(days: PlanDay[], baseline: WeeklyPlan, now: Date = new Date()): WeeklyPlan {
  const sorted = [...days].sort((a, b) => a.day - b.day);
  const training = sorted.filter((d) => !d.rest).length;
  const { program: _program, request_id: _req, photo_notes: _photo, ...rest } = baseline;
  return {
    ...rest,
    generated_at: now.toISOString(),
    summary: t(`خطتي الخاصة: ${training} أيام تمرين بالأسبوع، اخترت تماريني بنفسي.`, `My own plan: ${training} training days a week, exercises picked by me.`),
    days: sorted,
    custom: true,
  };
}

/** نوع الخطة للعرض: ذكاء اصطناعي، برنامج جاهز، خطتك الخاصة، أو قياسية */
export function planKind(p: { source: 'ai' | 'rules'; data: WeeklyPlan } | null): 'ai' | 'program' | 'custom' | 'rules' | null {
  if (!p) return null;
  if (p.data.program) return 'program';
  if (p.data.custom) return 'custom';
  return p.source;
}
