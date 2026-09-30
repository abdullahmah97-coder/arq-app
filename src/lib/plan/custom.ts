// خطتك الخاصة ونوع الخطة (منطق بحت عشان يتختبر)
import type { I18nText } from '../types';
import type { PlanDay, PlanExercise, WeeklyPlan } from './types';

const t = (ar: string, en: string): I18nText => ({ ar, en });

/** العدّات: الأرقام العربية (٠-٩ و ۰-۹) تصير إنجليزية، ونخلي بس الأرقام والشرطة و s/ث */
export function cleanReps(v: string): string {
  return v
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/[–—−]/g, '-')
    .replace(/[^\d\-sث ]/g, '')
    .slice(0, 8);
}

/** العدّات لازم فيها رقم واحد على الأقل («-» لحالها ما تنفع) */
export const validReps = (r: string) => /\d/.test(r);

/** يوم في محرر «ابنِ جدولك بنفسك» */
export interface BuilderDay {
  on: boolean;
  /** العنوان في الخانة (بلغة التطبيق) */
  title: string;
  exercises: PlanExercise[];
  /** عنوان اليوم الأصلي بالعربي والإنجليزي: يبقى زي ما هو لو ما عدّلت العنوان */
  focus?: I18nText;
  /** كارديو اليوم الأصلي: يبقى */
  cardio?: I18nText;
}

/**
 * الخطة الحالية → أيام المحرر: نفس الأيام والتمارين والعناوين والكارديو.
 * resolve يربط التمرين بدليل التمارين؛ اللي ما ينربط يبقى زي ما هو (ما ينحذف بصمت).
 */
export function builderDaysFromPlan(days: PlanDay[], L: (x: I18nText) => string, resolve: (e: PlanExercise) => PlanExercise | null): BuilderDay[] {
  const out: BuilderDay[] = Array.from({ length: 7 }, () => ({ on: false, title: '', exercises: [] }));
  for (const d of days) {
    if (!Number.isInteger(d.day) || d.day < 0 || d.day > 6 || d.rest) continue;
    out[d.day] = {
      on: true,
      title: L(d.focus),
      focus: d.focus,
      ...(d.cardio ? { cardio: d.cardio } : {}),
      exercises: d.exercises.map((e) => resolve(e) ?? e),
    };
  }
  return out;
}

/** أيام المحرر → أيام الخطة. dayTitle(i) = عنوان افتراضي باللغتين لليوم اللي ما له اسم */
export function planDaysFromBuilder(days: BuilderDay[], L: (x: I18nText) => string, dayTitle: (i: number) => I18nText): PlanDay[] {
  return days.map((d, i) => {
    if (!d.on) {
      return { day: i, rest: true, focus: t('راحة واستشفاء', 'Rest & recovery'), exercises: [], cardio: t('مشي خفيف ٣٠ دقيقة + إطالات', '30 min easy walk + stretching') };
    }
    const title = d.title.trim();
    const focus = d.focus && title === L(d.focus).trim() ? d.focus : title ? t(title, title) : dayTitle(i);
    return { day: i, rest: false, focus, exercises: d.exercises, ...(d.cardio ? { cardio: d.cardio } : {}) };
  });
}

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
