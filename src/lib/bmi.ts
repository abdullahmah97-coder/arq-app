// حاسبة كتلة الجسم (BMI): الوزن ÷ مربع الطول بالمتر، وتصنيف منظمة الصحة العالمية للبالغين.
// وفوقها: الوزن الصحي لطولك (BMI من 18.5 إلى 24.9)، وكم كيلو زيادة عن حده الأعلى أو ناقص عن حده الأدنى.
// منطق بحت بدون React، عشان يتختبر (tests/bmi.test.ts).

export const BMI_HEALTHY_MIN = 18.5;
export const BMI_HEALTHY_MAX = 24.9;
export const HEIGHT_RANGE = { min: 100, max: 250 } as const; // سم
export const WEIGHT_RANGE = { min: 20, max: 350 } as const;  // كجم

export type BmiClass = 'under' | 'normal' | 'over' | 'obese1' | 'obese2' | 'obese3';

export interface BmiResult {
  bmi: number;
  cls: BmiClass;
  /** الوزن الصحي لطولك (كجم، رقم عشري واحد) */
  healthyMin: number;
  healthyMax: number;
  /** كم كيلو فوق الحد الأعلى للوزن الصحي (0 لو داخله أو تحته) */
  excessKg: number;
  /** كم كيلو تحت الحد الأدنى للوزن الصحي (0 لو داخله أو فوقه) */
  shortKg: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** الأرقام العربية والفاصلة العربية ← رقم. فاضي أو غلط = null */
export function parseNum(v: string): number | null {
  const s = v.trim()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[٫,]/g, '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function bmiClass(bmi: number): BmiClass {
  if (bmi < BMI_HEALTHY_MIN) return 'under';
  if (bmi < 25) return 'normal';
  if (bmi < 30) return 'over';
  if (bmi < 35) return 'obese1';
  if (bmi < 40) return 'obese2';
  return 'obese3';
}

/** الحساب كامل. الطول أو الوزن برا المعقول = null (ما نطلع رقم غلط) */
export function bmiOf(weightKg: number | null, heightCm: number | null): BmiResult | null {
  if (weightKg == null || heightCm == null) return null;
  if (heightCm < HEIGHT_RANGE.min || heightCm > HEIGHT_RANGE.max) return null;
  if (weightKg < WEIGHT_RANGE.min || weightKg > WEIGHT_RANGE.max) return null;
  const m2 = (heightCm / 100) ** 2;
  const bmi = round1(weightKg / m2);
  const healthyMin = round1(BMI_HEALTHY_MIN * m2);
  const healthyMax = round1(BMI_HEALTHY_MAX * m2);
  return {
    bmi,
    cls: bmiClass(bmi),
    healthyMin,
    healthyMax,
    excessKg: Math.max(0, round1(weightKg - healthyMax)),
    shortKg: Math.max(0, round1(healthyMin - weightKg)),
  };
}

/** مكان المؤشر على شريط من 15 إلى 40 (0..1) */
export function scalePos(bmi: number, lo = 15, hi = 40): number {
  return Math.min(1, Math.max(0, (bmi - lo) / (hi - lo)));
}
