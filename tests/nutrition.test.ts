// اختبار حساب السعرات وقاعدة الأطعمة
import { FOODS } from '../src/lib/nutrition/foods.ts';
import { estimateCarbsFat, kcalFromMacros, normalizeSearch, scaleFood, searchFoods, servingsFromGrams, slotForHour, totals } from '../src/lib/nutrition/math.ts';

let fail = 0;
const ok = (c: boolean, m: string) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };

// جودة البيانات: السعرات تطابق الماكروز تقريباً (٤/٤/٩) والمعرفات فريدة
const ids = new Set<string>();
const bad: string[] = [];
for (const f of FOODS) {
  if (ids.has(f.id)) bad.push(`dup ${f.id}`);
  ids.add(f.id);
  if (!f.name.ar || !f.name.en || !f.serving.ar || !f.serving.en || f.grams <= 0) bad.push(`missing ${f.id}`);
  const calc = kcalFromMacros(f.protein_g, f.carbs_g, f.fat_g);
  if (f.kcal >= 40 && Math.abs(calc - f.kcal) / f.kcal > 0.2) bad.push(`${f.id}: ${f.kcal} vs ${calc}`);
  if (f.kcal / f.grams > 9.1) bad.push(`${f.id}: too dense`);
}
ok(bad.length === 0, `food table sane (${FOODS.length} foods) ${bad.join(', ')}`);
ok(FOODS.length >= 100, 'at least 100 foods');

const kabsa = FOODS.find((f) => f.id === 'kabsa_chicken')!;
const s = scaleFood(kabsa, 1.5);
ok(s.kcal === 1125 && s.protein_g === 60, 'scale 1.5 servings');
ok(servingsFromGrams({ grams: 100 }, 150) === 1.5 && servingsFromGrams({ grams: 0 }, 50) === 0, 'servings from grams');
const t = totals([{ kcal: 100, protein_g: 10.25, carbs_g: 5, fat_g: 1 }, { kcal: 250.4, protein_g: 5, carbs_g: 30, fat_g: 10 }]);
ok(t.kcal === 350 && t.protein_g === 15.3 && t.carbs_g === 35 && t.fat_g === 11, 'day totals');
ok(slotForHour(7) === 'breakfast' && slotForHour(13) === 'lunch' && slotForHour(17) === 'snack' && slotForHour(21) === 'dinner' && slotForHour(2) === 'dinner', 'meal slot by hour');
ok(normalizeSearch('الكَبْسة') === 'الكبسه' && normalizeSearch('أرز') === 'ارز', 'arabic search normalization');
ok(searchFoods('كبسه', FOODS)[0]?.id.startsWith('kabsa'), 'search finds kabsa with ه');
ok(searchFoods('shawarma', FOODS).length >= 2 && searchFoods('شاورما دجاج', FOODS)[0]?.id === 'shawarma_chicken', 'search english + multi-word arabic');
ok(searchFoods('تمر', FOODS).some((f) => f.id === 'dates'), 'search dates');
const cf = estimateCarbsFat(600, 40, { carbs_g: 250, fat_g: 70 });
ok(Math.abs(kcalFromMacros(40, cf.carbs_g, cf.fat_g) - 600) <= 2, 'plan meal carbs/fat fill the calories');

console.log(fail ? `\n${fail} FAILED` : '\nALL NUTRITION TESTS PASSED');
if (fail) process.exit(1);
