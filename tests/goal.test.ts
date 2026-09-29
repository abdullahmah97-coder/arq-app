import { effectiveTargets, parseKcal } from '../src/lib/nutrition/goal.ts';

let failed = 0;
const ok = (c: boolean, label: string, extra = '') => { console.log(c ? 'ok  ' : 'FAIL', label, extra); if (!c) { failed++; process.exitCode = 1; } };

const plan = { calories: 2250, protein_g: 150, carbs_g: 250, fat_g: 70 };
const a = effectiveTargets(plan, null)!;
ok(a.calories === 2250 && a.custom === false && a.carbs_g === 250 && a.planCalories === 2250, 'no custom goal → plan targets');
const b = effectiveTargets(plan, 1900)!;
ok(b.calories === 1900 && b.custom && b.protein_g === 150 && b.carbs_g === 197 && b.fat_g === 55 && b.planCalories === 2250, 'custom goal keeps protein, scales carbs and fat', JSON.stringify(b));
const c = effectiveTargets(plan, 2800)!;
ok(c.carbs_g! > 250 && c.fat_g! > 70 && c.protein_g === 150, 'higher goal raises carbs and fat');
ok(effectiveTargets(plan, 300)!.calories === 2250, 'out-of-range custom goal is ignored');
const d = effectiveTargets(null, 1800)!;
ok(d.calories === 1800 && d.carbs_g === null && d.planCalories === null && d.custom, 'custom goal without a plan');
ok(effectiveTargets(null, null) === null && effectiveTargets(undefined, undefined) === null, 'no plan, no goal → nothing');
ok(parseKcal('١٩٠٠') === 1900 && parseKcal('2,100') === 2100 && parseKcal('') === null, 'reads Arabic digits and commas');
console.log(failed ? `${failed} FAILED` : 'all goal checks passed');
