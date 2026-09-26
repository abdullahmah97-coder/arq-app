// اختبار مولد الخطة: node --experimental-strip-types tests/plan.test.ts
import { calcBmi, calcBmr, calcTargets, generateRulesPlan } from '../src/lib/plan/rules.ts';
import { isWeeklyPlan } from '../src/lib/plan/validate.ts';

let fail = 0;
const ok = (c: boolean, m: string) => { if (!c) { fail++; console.log('FAIL', m); } };

ok(calcBmi(80, 180) === 24.7, 'bmi');
ok(calcBmr({ gender: 'male', weight_kg: 80, height_cm: 180, age: 30 }) === 1780, 'bmr male');
ok(calcBmr({ gender: 'female', weight_kg: 60, height_cm: 165, age: 25 }) === 1345, 'bmr female');

let n = 0;
for (const gender of ['male', 'female'] as const)
  for (const goal of ['lose', 'gain', 'maintain', 'fit'] as const)
    for (const level of ['beginner', 'intermediate', 'advanced'] as const)
      for (const days of [2, 3, 4, 5, 6])
        for (const [w, h] of [[55, 160], [85, 178], [130, 175]]) {
          const input = { gender, goal, level, days_per_week: days, weight_kg: w, height_cm: h, age: 28 };
          const p = generateRulesPlan(input);
          const tag = JSON.stringify(input);
          ok(isWeeklyPlan(p), 'valid ' + tag);
          ok(p.days.filter(d => !d.rest).length === days, 'train days ' + tag);
          if (days < 6) ok(p.days[5].rest, 'friday rest ' + tag);
          const kcal = p.meals.map(d => d.meals.reduce((s, m) => s + m.kcal, 0));
          ok(kcal.every(k => Math.abs(k - p.targets.calories) / p.targets.calories < 0.2), `kcal ${kcal} vs ${p.targets.calories} ${tag}`);
          ok(p.targets.protein_g > 60 && p.targets.protein_g < 260, 'protein ' + tag);
          n++;
        }
const sample = generateRulesPlan({ gender: 'male', goal: 'lose', level: 'beginner', days_per_week: 4, weight_kg: 95, height_cm: 175, age: 30 });
console.log(sample.summary.ar);
console.log(JSON.stringify(sample.targets));
console.log(sample.days.map(d => `${d.day}:${d.focus.ar}(${d.exercises.length})`).join(' | '));
console.log(sample.meals[0].meals.map(m => `${m.name.ar} ${m.kcal}kcal [${m.portions.map(p => p.name.ar + ' ' + p.amount).join('، ')}]`).join('\n'));
console.log(`\n${n} combinations, ${fail} failures`);
process.exit(fail ? 1 : 0);
