// حسابات السعرات (دوال صافية قابلة للاختبار)
import type { Food } from './foods';

export type MealSlot = 'breakfast' | 'lunch' | 'snack' | 'dinner';

export interface Macros { kcal: number; protein_g: number; carbs_g: number; fat_g: number }

const r1 = (n: number) => Math.round(n * 10) / 10;

/** قيم الأكل لعدد حصص (0.5، 1، 2…) */
export function scaleFood(f: Pick<Food, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'>, servings: number): Macros {
  const s = Math.max(0, servings);
  return { kcal: Math.round(f.kcal * s), protein_g: r1(f.protein_g * s), carbs_g: r1(f.carbs_g * s), fat_g: r1(f.fat_g * s) };
}

/** عدد الحصص من وزن بالجرام */
export function servingsFromGrams(f: Pick<Food, 'grams'>, grams: number): number {
  if (!f.grams || grams <= 0) return 0;
  return Math.round((grams / f.grams) * 100) / 100;
}

export function totals(rows: Partial<Macros>[]): Macros {
  const t = rows.reduce<Macros>((a, x) => ({
    kcal: a.kcal + Number(x.kcal ?? 0),
    protein_g: a.protein_g + Number(x.protein_g ?? 0),
    carbs_g: a.carbs_g + Number(x.carbs_g ?? 0),
    fat_g: a.fat_g + Number(x.fat_g ?? 0),
  }), { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  return { kcal: Math.round(t.kcal), protein_g: r1(t.protein_g), carbs_g: r1(t.carbs_g), fat_g: r1(t.fat_g) };
}

/** الوجبة المتوقعة حسب الساعة */
export function slotForHour(h: number): MealSlot {
  if (h >= 4 && h < 11) return 'breakfast';
  if (h >= 11 && h < 16) return 'lunch';
  if (h >= 16 && h < 19) return 'snack';
  return 'dinner';
}

/** السعرات من الماكروز (٤/٤/٩) — للتحقق من الأكل المخصص */
export function kcalFromMacros(p: number, c: number, f: number): number {
  return Math.round(p * 4 + c * 4 + f * 9);
}

/** توحيد الحروف العربية للبحث: الهمزات، التاء المربوطة، الألف المقصورة، التشكيل */
export function normalizeSearch(s: string): string {
  return s.toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

export function searchFoods(q: string, foods: Food[]): Food[] {
  const n = normalizeSearch(q);
  if (!n) return foods;
  const words = n.split(' ');
  return foods
    .map((f) => {
      const hay = normalizeSearch(`${f.name.ar} ${f.name.en}`);
      if (!words.every((w) => hay.includes(w))) return null;
      const starts = normalizeSearch(f.name.ar).startsWith(n) || normalizeSearch(f.name.en).startsWith(n) ? 0 : 1;
      return { f, score: starts };
    })
    .filter((x): x is { f: Food; score: number } => !!x)
    .sort((a, b) => a.score - b.score)
    .map((x) => x.f);
}

/** نسبة التقدم نحو الهدف (0..1+) */
export function progress(eaten: number, target: number | null | undefined): number | null {
  if (!target || target <= 0) return null;
  return eaten / target;
}

/** وجبة من الخطة فيها سعرات وبروتين فقط: نوزّع الباقي على الكربوهيدرات والدهون بنسبة أهدافك */
export function estimateCarbsFat(kcal: number, protein_g: number, targets: { carbs_g: number; fat_g: number } | null): { carbs_g: number; fat_g: number } {
  const rest = Math.max(0, kcal - protein_g * 4);
  const cK = (targets?.carbs_g ?? 1) * 4;
  const fK = (targets?.fat_g ?? 0.45) * 9;
  const share = cK + fK > 0 ? cK / (cK + fK) : 0.5;
  return { carbs_g: r1((rest * share) / 4), fat_g: r1((rest * (1 - share)) / 9) };
}
