// هدف السعرات اليومي: من الخطة، أو الهدف اللي حطّه المستخدم بنفسه (health_profiles.kcal_goal — خاص فيه)
// لو غيّر الهدف: البروتين يبقى (يعتمد على وزنه)، والكارب والدهون تتعدّل بنفس النسبة عشان يطابق المجموع
export interface GoalTargets { calories: number; protein_g: number | null; carbs_g: number | null; fat_g: number | null }
export const KCAL_GOAL_MIN = 800;
export const KCAL_GOAL_MAX = 6000;

type WithGoal = { kcal_goal?: number | null } | null | undefined;

/**
 * هدفي الشخصي: من health_profiles (ما يشوفه غيري). قبل ترحيل القاعدة كان في profiles،
 * فلو الجدول الخاص ما فيه العمود بعد (undefined) نقرأ القديم.
 */
export function myKcalGoal(health: WithGoal, profile: WithGoal): number | null {
  if (health && health.kcal_goal !== undefined) return health.kcal_goal ?? null;
  return profile?.kcal_goal ?? null;
}

type Base = { calories?: number | null; protein_g?: number | null; carbs_g?: number | null; fat_g?: number | null } | null | undefined;

export function effectiveTargets(base: Base, custom: number | null | undefined): (GoalTargets & { custom: boolean; planCalories: number | null }) | null {
  const planCalories = base?.calories && base.calories > 0 ? Math.round(base.calories) : null;
  const k = custom && custom >= KCAL_GOAL_MIN && custom <= KCAL_GOAL_MAX ? Math.round(custom) : null;
  if (!k) {
    if (!planCalories) return null;
    return { calories: planCalories, protein_g: base?.protein_g ?? null, carbs_g: base?.carbs_g ?? null, fat_g: base?.fat_g ?? null, custom: false, planCalories };
  }
  if (!planCalories || base?.carbs_g == null || base?.fat_g == null) {
    return { calories: k, protein_g: base?.protein_g ?? null, carbs_g: null, fat_g: null, custom: true, planCalories };
  }
  const protein = base.protein_g ?? 0;
  const rest = planCalories - protein * 4;
  const f = rest > 0 ? Math.max(0, k - protein * 4) / rest : k / planCalories;
  return {
    calories: k, protein_g: base.protein_g ?? null,
    carbs_g: Math.round(base.carbs_g * f), fat_g: Math.round(base.fat_g * f),
    custom: true, planCalories,
  };
}

/** يقرأ رقم من نص (يقبل الأرقام العربية) */
export function parseKcal(s: string): number | null {
  const n = parseInt(s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}
