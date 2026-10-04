// جولة التعريف للحساب الجديد: خطواتها وحالتها. بدون أي استيراد من React Native عشان تنختبر لحالها.
export type TourVariant = 'trainee' | 'partner';
/** عناصر شريط التبويبات اللي نوضحها في الرسمة الصغيرة (ai = زر المدرب الذكي اللي بالنص) */
export type TourTab = 'index' | 'plan' | 'ai' | 'community' | 'compete';

export interface TourStep {
  /** مفتاح النصوص: tour.<variant>.<id>.title / body */
  id: string;
  /** اسم أيقونة Ionicons، أو logo لشعار أرك */
  icon: string;
  /** التبويبات اللي نبرزها في رسمة الشريط */
  tabs?: TourTab[];
  /** الخطوة تشرح أجزاء يقدر المالك يخفيها عن الكل: لو انخفت كلها نشيل الخطوة */
  needs?: string[];
}

export const TOUR_STEPS: Record<TourVariant, TourStep[]> = {
  trainee: [
    { id: 'welcome', icon: 'logo' },
    { id: 'home', icon: 'pulse', tabs: ['index'] },
    { id: 'plan', icon: 'calendar', tabs: ['plan'], needs: ['tab.plan'] },
    { id: 'coach', icon: 'sparkles', tabs: ['ai'], needs: ['tab.ai'] },
    { id: 'social', icon: 'people', tabs: ['community', 'compete'], needs: ['tab.community', 'tab.compete'] },
    { id: 'more', icon: 'person-circle', tabs: ['index'] },
  ],
  partner: [
    { id: 'welcome', icon: 'briefcase' },
    { id: 'join', icon: 'document-text', tabs: ['index'] },
    { id: 'review', icon: 'shield-checkmark' },
    { id: 'trial', icon: 'gift' },
    { id: 'switch', icon: 'swap-horizontal', tabs: ['index'] },
  ],
};

/** خطوات الجولة بعد ما نشيل اللي يشرح أجزاء أخفاها المالك (الرئيسية ما تنخفي) */
export function tourSteps(variant: TourVariant, hidden: ReadonlySet<string>): TourStep[] {
  const shown = (tab: TourTab) => tab === 'index' || !hidden.has(`tab.${tab}`);
  return TOUR_STEPS[variant]
    .filter((s) => !s.needs || s.needs.some((k) => !hidden.has(k)))
    .map((s) => (s.tabs ? { ...s, tabs: s.tabs.filter(shown) } : s));
}

/** حالة الجولة لكل حساب على الجهاز: تنتظر (حساب جديد) أو انتهت */
export type TourState = 'pending' | 'done';
export const tourKey = (uid: string) => `arq.tour.v1:${uid}`;
export const parseTourState = (raw: string | null | undefined): TourState | null =>
  raw === 'pending' || raw === 'done' ? raw : null;

/**
 * السحب بين الخطوات: ١ للتالي و-١ للسابق و٠ لو السحبة قصيرة.
 * بالعربي الخطوة التالية تجي من اليسار، فالسحب لليمين يودّيك للتالي.
 */
export function swipeStep(dx: number, rtl: boolean, threshold = 48): -1 | 0 | 1 {
  if (!Number.isFinite(dx) || Math.abs(dx) < threshold) return 0;
  return (rtl ? dx > 0 : dx < 0) ? 1 : -1;
}
