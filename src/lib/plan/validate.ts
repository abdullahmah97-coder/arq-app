// تحقق من شكل الخطة القادمة من الذكاء الاصطناعي قبل حفظها
import type { WeeklyPlan } from './types';

const isText = (x: unknown): boolean =>
  !!x && typeof x === 'object' && typeof (x as any).ar === 'string' && typeof (x as any).en === 'string';

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export function isWeeklyPlan(x: unknown): x is WeeklyPlan {
  if (!x || typeof x !== 'object') return false;
  const p = x as any;
  if (!isText(p.summary)) return false;
  const tg = p.targets;
  if (!tg || !['bmi', 'bmr', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'water_l'].every((k) => isNum(tg[k]))) return false;
  if (tg.calories < 1000 || tg.calories > 6000) return false;

  if (!Array.isArray(p.days) || p.days.length !== 7) return false;
  for (const d of p.days) {
    if (!isNum(d.day) || d.day < 0 || d.day > 6 || typeof d.rest !== 'boolean' || !isText(d.focus)) return false;
    if (!Array.isArray(d.exercises)) return false;
    if (!d.rest && d.exercises.length === 0) return false;
    for (const e of d.exercises) {
      if (!isText(e.name) || !isNum(e.sets) || typeof e.reps !== 'string' || !isNum(e.rest_sec)) return false;
    }
  }
  if (!Array.isArray(p.meals) || p.meals.length !== 7) return false;
  for (const md of p.meals) {
    if (!isNum(md.day) || !Array.isArray(md.meals) || md.meals.length === 0) return false;
    for (const m of md.meals) {
      if (!['breakfast', 'lunch', 'snack', 'dinner'].includes(m.slot) || !isText(m.name)) return false;
      if (!isNum(m.kcal) || !isNum(m.protein_g) || !Array.isArray(m.portions)) return false;
    }
  }
  if (!Array.isArray(p.tips) || !p.tips.every(isText)) return false;
  if (p.photo_notes !== undefined && !isText(p.photo_notes)) return false;
  return true;
}
