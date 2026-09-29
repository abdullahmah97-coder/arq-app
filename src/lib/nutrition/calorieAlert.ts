// تنبيه «باقي لك ٢٠٠ سعرة»: أول ما يوصل المتبقي من احتياج اليوم للرقم اللي تحدده الإدارة أو أقل، مرة وحدة باليوم
// الجزء البحت هنا (يتختبر بدون جوال)، والإرسال في nutrition/index بعد كل تسجيل أكل
// النص والرقم من لوحة إدارة التطبيق (app_settings.calorie_alert)، والمستخدم يشغّله أو يطفيه من مربع السعرات

export interface CalorieAlertConfig {
  enabled: boolean; threshold: number;
  title_ar: string; body_ar: string; title_en: string | null; body_en: string | null;
}

/** لو ما قدرنا نقرأ إعدادات الإدارة */
export const DEFAULT_KCAL_ALERT: CalorieAlertConfig = {
  enabled: true, threshold: 200,
  title_ar: 'باقي لك {n} سعرة وتكمّل احتياجك',
  body_ar: 'أكلت {eaten} من {goal} سعرة اليوم. خل آخر شي تاكله خفيف وفيه بروتين.',
  title_en: '{n} kcal left to hit your target',
  body_en: "You've had {eaten} of {goal} kcal today. Keep the last bite light and high in protein.",
};
/** للتوافق مع الاختبارات القديمة */
export const KCAL_ALERT_AT = DEFAULT_KCAL_ALERT.threshold;
/** حدود الرقم (للإدارة وللمستخدم) والخيارات اللي تطلع للمستخدم في مربع السعرات */
export const KCAL_ALERT_MIN = 50;
export const KCAL_ALERT_MAX = 500;
export const KCAL_ALERT_CHOICES = [100, 150, 200, 300, 400, 500];

/** يرجع المتبقي لو لازم ننبّه الحين، وإلا null */
export function caloriesLeftAlert(eaten: number, goal: number | null | undefined, lastAlertDay: string | null, today: string, threshold = KCAL_ALERT_AT): number | null {
  if (!goal || goal <= 0 || lastAlertDay === today) return null;
  const left = Math.round(goal - eaten);
  return left > 0 && left <= threshold ? left : null;
}

/** {n} الباقي، {eaten} اللي أكله، {goal} احتياجه */
export function fillAlertText(tpl: string, v: { n: number; eaten: number; goal: number }): string {
  return tpl.replace(/\{(n|eaten|goal)\}/g, (_, k: 'n' | 'eaten' | 'goal') => String(Math.round(v[k])));
}

/** العنوان والنص بلغة المستخدم (الإنجليزي يرجع للعربي لو فاضي) */
export function alertTexts(c: CalorieAlertConfig, lng: string, v: { n: number; eaten: number; goal: number }) {
  const en = lng === 'en';
  return {
    title: fillAlertText((en && c.title_en) || c.title_ar, v),
    body: fillAlertText((en && c.body_en) || c.body_ar, v),
  };
}

/** قيم الإدارة بعد التنظيف (أي نقص يرجع للافتراضي) */
export function parseAlertConfig(v: unknown): CalorieAlertConfig {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<CalorieAlertConfig>;
  const t = Number(o.threshold);
  return {
    enabled: typeof o.enabled === 'boolean' ? o.enabled : DEFAULT_KCAL_ALERT.enabled,
    threshold: Number.isFinite(t) && t >= 50 && t <= 500 ? Math.round(t) : DEFAULT_KCAL_ALERT.threshold,
    title_ar: o.title_ar?.trim() || DEFAULT_KCAL_ALERT.title_ar,
    body_ar: o.body_ar?.trim() || DEFAULT_KCAL_ALERT.body_ar,
    title_en: o.title_en?.trim() || null,
    body_en: o.body_en?.trim() || null,
  };
}

// هدف السعرات من الخطة الفعّالة (يحدّثه AuthProvider لما تتغير الخطة)
let goal: number | null = null;
export function setCalorieGoal(g: number | null | undefined) { goal = g && g > 0 ? Math.round(g) : null; }
export function calorieGoal() { return goal; }
