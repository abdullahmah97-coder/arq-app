// اختبار حاسبة كتلة الجسم: الرقم، التصنيف، الوزن الصحي، والزيادة أو النقص
import { bmiClass, bmiOf, parseNum, scalePos } from '../src/lib/bmi.ts';
let fail = 0;
const ok = (c: boolean, m: string, extra = '') => { if (!c) { fail++; console.log('FAIL', m, extra); } else console.log('ok  ', m); };

const r = bmiOf(95, 175)!;
ok(r.bmi === 31, '95 kg, 175 cm → BMI 31.0', String(r.bmi));
ok(r.cls === 'obese1', '31 is obese class I');
ok(r.healthyMin === 56.7 && r.healthyMax === 76.3, 'healthy weight for 175 cm is 56.7–76.3 kg', `${r.healthyMin}–${r.healthyMax}`);
ok(r.excessKg === 18.7 && r.shortKg === 0, '95 kg is 18.7 kg over the healthy maximum', String(r.excessKg));

const n = bmiOf(70, 175)!;
ok(n.cls === 'normal' && n.excessKg === 0 && n.shortKg === 0, 'normal weight: nothing extra or missing');
const u = bmiOf(50, 175)!;
ok(u.cls === 'under' && u.shortKg === 6.7 && u.excessKg === 0, 'underweight: 6.7 kg short of the healthy minimum', String(u.shortKg));
ok(bmiOf(80, 175)!.cls === 'over', '26.1 is overweight');

ok(bmiClass(18.4) === 'under' && bmiClass(18.5) === 'normal', '18.5 starts normal');
ok(bmiClass(24.9) === 'normal' && bmiClass(25) === 'over', '25 starts overweight');
ok(bmiClass(29.9) === 'over' && bmiClass(30) === 'obese1', '30 starts obesity');
ok(bmiClass(35) === 'obese2' && bmiClass(40) === 'obese3', '35 and 40 are classes II and III');

ok(bmiOf(null, 175) === null && bmiOf(80, null) === null, 'missing input → no result');
ok(bmiOf(80, 99) === null && bmiOf(80, 251) === null, 'height outside 100–250 cm → no result');
ok(bmiOf(19, 175) === null && bmiOf(351, 175) === null, 'weight outside 20–350 kg → no result');
ok(bmiOf(80, 1.75) === null, 'height in metres is not mistaken for centimetres');

ok(parseNum('٩٥') === 95 && parseNum('٧٥٫٥') === 75.5 && parseNum('75,5') === 75.5 && parseNum(' 80 ') === 80, 'Arabic digits and decimal commas');
ok(parseNum('') === null && parseNum('abc') === null && parseNum('1.2.3') === null && parseNum('-5') === null, 'junk input is null');

ok(scalePos(15) === 0 && scalePos(40) === 1 && scalePos(27.5) === 0.5, 'scale position');
ok(scalePos(10) === 0 && scalePos(60) === 1, 'scale is clamped');

if (fail) process.exit(1);
console.log('ALL BMI TESTS PASSED');
