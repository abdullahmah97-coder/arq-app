// تنظيف أرقام التقرير (من الذكاء الاصطناعي أو الإدخال اليدوي) واستنتاج القيم الناقصة بأمان
import type { InBodyMetrics, Range, Segment, SegmentValue } from './types';

const SEGMENTS: Segment[] = ['right_arm', 'left_arm', 'trunk', 'right_leg', 'left_leg'];

const num = (v: unknown, min: number, max: number, decimals = 2): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(/[^\d.\-]/g, '')) : typeof v === 'number' ? v : NaN;
  const f = 10 ** decimals;
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * f) / f : null;
};

const range = (v: unknown, min: number, max: number): Range => {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const a = num(v[0], min, max);
  const b = num(v[1], min, max);
  return a != null && b != null && a <= b ? [a, b] : null;
};

const segments = (v: unknown, kgMax: number): Record<Segment, SegmentValue> | null => {
  if (!v || typeof v !== 'object') return null;
  const out = {} as Record<Segment, SegmentValue>;
  let any = false;
  for (const s of SEGMENTS) {
    const x = (v as any)[s] ?? {};
    out[s] = { kg: num(x.kg, 0, kgMax), pct: num(x.pct, 10, 400) };
    if (out[s].kg != null || out[s].pct != null) any = true;
  }
  return any ? out : null;
};

export function emptyMetrics(): InBodyMetrics {
  return normalizeMetrics({});
}

export function normalizeMetrics(raw: any): InBodyMetrics {
  const r = raw ?? {};
  const m: InBodyMetrics = {
    device_model: typeof r.device_model === 'string' ? r.device_model.slice(0, 40) : null,
    test_date: typeof r.test_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.test_date) ? r.test_date : null,
    gender: r.gender === 'male' || r.gender === 'female' ? r.gender : null,
    age: num(r.age, 10, 100),
    height_cm: num(r.height_cm, 100, 250),
    weight_kg: num(r.weight_kg, 25, 300),
    smm_kg: num(r.smm_kg, 5, 80),
    body_fat_mass_kg: num(r.body_fat_mass_kg, 1, 200),
    pbf_pct: num(r.pbf_pct, 2, 70),
    bmi: num(r.bmi, 10, 80),
    ffm_kg: num(r.ffm_kg, 15, 150),
    total_body_water_l: num(r.total_body_water_l, 10, 100),
    protein_kg: num(r.protein_kg, 2, 30),
    minerals_kg: num(r.minerals_kg, 0.5, 10),
    bmr_kcal: num(r.bmr_kcal, 700, 4000),
    ecw_ratio: num(r.ecw_ratio, 0.3, 0.5, 3), // الخانة الثالثة مهمة (0.398 ≠ 0.40)
    visceral_fat_level: num(r.visceral_fat_level, 1, 30),
    visceral_fat_area_cm2: num(r.visceral_fat_area_cm2, 5, 400),
    inbody_score: num(r.inbody_score, 20, 120),
    waist_hip_ratio: num(r.waist_hip_ratio, 0.5, 1.5),
    phase_angle: num(r.phase_angle, 1, 15),
    target_weight_kg: num(r.target_weight_kg, 25, 300),
    weight_control_kg: num(r.weight_control_kg, -150, 60),
    fat_control_kg: num(r.fat_control_kg, -150, 60),
    muscle_control_kg: num(r.muscle_control_kg, -20, 40),
    segmental_lean: segments(r.segmental_lean, 60),
    segmental_fat: segments(r.segmental_fat, 60),
    ranges: r.ranges && typeof r.ranges === 'object' ? {
      weight: range(r.ranges.weight, 20, 300),
      smm: range(r.ranges.smm, 5, 80),
      body_fat_mass: range(r.ranges.body_fat_mass, 1, 200),
      pbf: range(r.ranges.pbf, 2, 70),
      bmi: range(r.ranges.bmi, 10, 80),
    } : null,
  };

  // استنتاجات آمنة من أرقام موجودة فقط
  if (m.weight_kg != null) {
    if (m.pbf_pct == null && m.body_fat_mass_kg != null) m.pbf_pct = Math.round((m.body_fat_mass_kg / m.weight_kg) * 1000) / 10;
    if (m.body_fat_mass_kg == null && m.pbf_pct != null) m.body_fat_mass_kg = Math.round(m.weight_kg * m.pbf_pct) / 100;
    if (m.ffm_kg == null && m.body_fat_mass_kg != null) m.ffm_kg = Math.round((m.weight_kg - m.body_fat_mass_kg) * 10) / 10;
    if (m.bmi == null && m.height_cm != null) m.bmi = Math.round((m.weight_kg / (m.height_cm / 100) ** 2) * 10) / 10;
  }
  return m;
}

/** الحد الأدنى المطلوب للتحليل */
export function hasEssentials(m: InBodyMetrics): boolean {
  return m.weight_kg != null && (m.pbf_pct != null || m.body_fat_mass_kg != null) && m.smm_kg != null;
}
