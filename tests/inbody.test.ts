/// <reference types="node" />
// اختبار محرك InBody على التقرير المرفق: node --experimental-strip-types tests/inbody.test.ts
import { readFileSync } from 'node:fs';
import { analyzeInBody } from '../src/lib/inbody/analyze.ts';
import { hasEssentials, normalizeMetrics } from '../src/lib/inbody/normalize.ts';
import { calcTargets, generateRulesPlan } from '../src/lib/plan/rules.ts';
import { isWeeklyPlan } from '../src/lib/plan/validate.ts';

let fail = 0;
const ok = (c: boolean, m: string, extra: unknown = '') => { console.log(c ? 'ok  ' : 'FAIL', m, extra); if (!c) fail++; };

const raw = JSON.parse(readFileSync(new URL('./fixtures/inbody770-sample.json', import.meta.url), 'utf8'));
const m = normalizeMetrics(raw);
ok(hasEssentials(m), 'essentials present');
ok(m.ranges?.smm === null, 'invalid range dropped');
ok(m.fat_control_kg === -3.7, 'negative control kept');

const a = analyzeInBody(m);
console.log('analysis:', JSON.stringify({ goal: a.recommended_goal, body: a.body_type, fat: a.fat_status, muscle: a.muscle_status, visceral: a.visceral_status, weak: a.weak_segments, imb: a.imbalance, rate: a.weekly_rate_kg, weeks: a.weeks_to_target, bmr: a.bmr }));
ok(a.fat_status === 'normal', 'PBF 27.2% female is within 18–28');
ok(a.visceral_status === 'normal', 'VFA 71.2 < 100');
ok(a.recommended_goal === 'lose', 'report asks to lose 3.7 kg fat → lose');
ok(a.weekly_rate_kg! > 0.2 && a.weekly_rate_kg! <= 0.5, 'gentle rate for small fat loss', a.weekly_rate_kg);
ok(a.weeks_to_target! >= 8 && a.weeks_to_target! <= 16, 'weeks to target', a.weeks_to_target);
ok((a.imbalance.arms ?? 0) > 5, 'arm imbalance detected (2.56 vs 2.35)', a.imbalance.arms);
ok((a.imbalance.legs ?? 0) < 5, 'legs balanced (7.79 vs 7.59)', a.imbalance.legs);
ok(a.weak_segments.length === 0, 'no weak segments');
ok(!a.caution_ecw, 'ECW 0.380 normal');

const input = { gender: 'female' as const, age: 41, height_cm: 163, weight_kg: 66.4, goal: a.recommended_goal, level: 'intermediate' as const, days_per_week: 4 };
const plain = calcTargets(input);
const withIb = calcTargets({ ...input, inbody: a });
console.log('targets without InBody:', JSON.stringify(plain));
console.log('targets with InBody   :', JSON.stringify(withIb));
ok(withIb.bmr === 1413, 'uses measured BMR');
ok(withIb.calories >= 1413, 'never below BMR');
ok(withIb.protein_g === Math.round(48.3 * 2.3), 'protein from fat-free mass');

const plan = generateRulesPlan({ ...input, inbody: a });
ok(isWeeklyPlan(plan) && plan.based_on_inbody === true, 'valid InBody plan');
const noted = plan.days.flatMap(d => d.exercises).filter(e => e.notes?.en.includes('weaker side'));
ok(noted.length > 0, 'unilateral notes for arm imbalance', noted.length);
ok(plan.tips.some(x => x.en.includes('62.7')), 'target weight tip');

// حالات أخرى: دهون حشوية عالية + عضل ضعيف + ECW
const b = analyzeInBody(normalizeMetrics({ gender: 'male', weight_kg: 95, smm_kg: 30, pbf_pct: 34, visceral_fat_level: 14, ecw_ratio: 0.395,
  segmental_lean: { right_arm: { kg: 3, pct: 85 }, left_arm: { kg: 3, pct: 86 }, trunk: { kg: 25, pct: 95 }, right_leg: { kg: 9, pct: 92 }, left_leg: { kg: 8, pct: 88 } } }));
ok(b.recommended_goal === 'lose' && b.extra_cardio && b.caution_ecw, 'high fat + visceral + ecw', JSON.stringify({ g: b.recommended_goal, t: b.body_type }));
ok(b.weak_segments.includes('right_arm') && b.weak_segments.includes('left_leg'), 'weak segments detected');
const pb = generateRulesPlan({ gender: 'male', age: 35, height_cm: 178, weight_kg: 95, goal: b.recommended_goal, level: 'beginner', days_per_week: 3, inbody: b });
ok(pb.days.filter(d => !d.rest).every(d => d.exercises.some(e => e.notes?.en.includes('InBody'))), 'every training day has InBody emphasis');
ok(pb.days.filter(d => d.rest).every(d => d.cardio?.en.includes('visceral')), 'rest days get visceral-fat cardio');
ok(pb.tips[0].en.includes('ECW'), 'ECW caution first');

const c = analyzeInBody(normalizeMetrics({ gender: 'male', weight_kg: 55, height_cm: 178, smm_kg: 22, pbf_pct: 9 }));
ok(c.recommended_goal === 'gain' && c.body_type === 'underweight', 'underweight → gain', c.body_type);

const s = analyzeInBody(normalizeMetrics({ gender: 'female', weight_kg: 60, smm_kg: 17, pbf_pct: 33 }));
ok(s.body_type === 'skinny_fat' && s.recommended_goal === 'fit', 'skinny-fat → recomposition', s.body_type);

// التقرير الثاني (InBody970S): وذمة محتملة + دهون حشوية عالية + ضعف الأرجل
const raw2 = JSON.parse(readFileSync(new URL('./fixtures/inbody970s-sample.json', import.meta.url), 'utf8'));
const d = analyzeInBody(normalizeMetrics(raw2));
console.log('970S analysis:', JSON.stringify({ goal: d.recommended_goal, body: d.body_type, fat: d.fat_status, muscle: d.muscle_status, visceral: d.visceral_status, weak: d.weak_segments, ul: d.imbalance.upper_lower, rate: d.weekly_rate_kg, weeks: d.weeks_to_target }));
ok(d.caution_ecw, 'ECW 0.398 → edema caution');
ok(normalizeMetrics(raw2).ecw_ratio === 0.398, 'ECW keeps 3 decimals');
ok(d.insights[0].key === 'ecw_high', 'edema warning shown first');
ok(d.visceral_status === 'high' && d.extra_cardio, 'VFA 125.8 → visceral high + cardio');
ok(d.fat_status === 'high' || d.fat_status === 'very_high', 'PBF 36.3 female → above range', d.fat_status);
ok(d.weak_segments.includes('right_leg') && d.weak_segments.includes('left_leg'), 'legs weak (82.8%, 81.5%)');
ok(d.imbalance.upper_lower === 'lower', 'lower body weaker than upper');
ok(d.recommended_goal === 'lose' || d.recommended_goal === 'fit', 'fat loss / recomposition', d.recommended_goal);
const pd = generateRulesPlan({ gender: 'female', age: 51, height_cm: 156.9, weight_kg: 59.1, goal: d.recommended_goal, level: 'beginner', days_per_week: 3, inbody: d });
ok(pd.tips[0].en.includes('ECW'), 'plan leads with ECW caution');
ok(pd.days.filter(x => !x.rest).some(x => x.exercises.some(e => e.name.en === 'Leg Extension' || e.name.en === 'Lying Leg Curl')), 'extra leg work');
const kc = calcTargets({ gender: 'female', age: 51, height_cm: 156.9, weight_kg: 59.1, goal: d.recommended_goal, level: 'beginner', days_per_week: 3, inbody: d });
ok(kc.calories >= 1200 && kc.calories >= 1183, 'calories never below BMR 1183', kc.calories);

console.log(`\n${fail} failures`);
process.exit(fail ? 1 : 0);
