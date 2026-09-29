// اختبار حساب السعرات وقاعدة الأطعمة
import { FOODS } from '../src/lib/nutrition/foods.ts';
import { alertTexts, caloriesLeftAlert, DEFAULT_KCAL_ALERT, fillAlertText, parseAlertConfig } from '../src/lib/nutrition/calorieAlert.ts';
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

// تنبيه «باقي لك ٢٠٠ سعرة»: مرة وحدة باليوم، وبس لما يكون المتبقي بين ١ و٢٠٠
const day = '2026-09-29';
ok(caloriesLeftAlert(2050, 2250, null, day) === 200, '200 left → alert');
ok(caloriesLeftAlert(2200, 2250, null, day) === 50, '50 left → alert');
ok(caloriesLeftAlert(2000, 2250, null, day) === null, '250 left → not yet');
ok(caloriesLeftAlert(2250, 2250, null, day) === null && caloriesLeftAlert(2400, 2250, null, day) === null, 'target reached or passed → no "left" alert');
ok(caloriesLeftAlert(2100, 2250, day, day) === null, 'already alerted today');
ok(caloriesLeftAlert(2100, 2250, '2026-09-28', day) === 150, 'alerted yesterday → alert again today');
ok(caloriesLeftAlert(2100, null, null, day) === null && caloriesLeftAlert(2100, 0, null, day) === null, 'no target → no alert');
ok(caloriesLeftAlert(1950, 2250, null, day, 300) === 300 && caloriesLeftAlert(1950, 2250, null, day, 200) === null, 'admin threshold is used');
ok(fillAlertText('باقي لك {n} سعرة من {goal} (أكلت {eaten})', { n: 200, eaten: 2050.4, goal: 2250 }) === 'باقي لك 200 سعرة من 2250 (أكلت 2050)', 'placeholders filled');
const t1 = alertTexts(DEFAULT_KCAL_ALERT, 'ar', { n: 180, eaten: 2070, goal: 2250 });
ok(t1.title === 'باقي لك 180 سعرة وتكمّل احتياجك' && t1.body.includes('2070') && t1.body.includes('2250'), 'Arabic alert text');
ok(alertTexts({ ...DEFAULT_KCAL_ALERT, title_en: null, body_en: null }, 'en', { n: 100, eaten: 1, goal: 2 }).title.startsWith('باقي لك 100'), 'English falls back to Arabic when empty');
const pc = parseAlertConfig({ enabled: false, threshold: 9999, title_ar: '  ', body_ar: 'نص' });
ok(pc.enabled === false && pc.threshold === 200 && pc.title_ar === DEFAULT_KCAL_ALERT.title_ar && pc.body_ar === 'نص', 'bad admin values fall back to defaults');
ok(parseAlertConfig(null).threshold === 200 && parseAlertConfig(null).enabled, 'missing config → defaults');

console.log(fail ? `\n${fail} FAILED` : '\nALL NUTRITION TESTS PASSED');
if (fail) process.exit(1);
