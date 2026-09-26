// الأرقام المستخرجة من تقرير InBody (كل الحقول اختيارية لأن الأجهزة تختلف: 270 / 570 / 770 / H20 ...)

export type Segment = 'right_arm' | 'left_arm' | 'trunk' | 'right_leg' | 'left_leg';
export const SEGMENTS: Segment[] = ['right_arm', 'left_arm', 'trunk', 'right_leg', 'left_leg'];

export interface SegmentValue {
  kg: number | null;
  pct: number | null; // النسبة من المعدل الطبيعي (100% = طبيعي)
}

export type Range = [number, number] | null;

export interface InBodyMetrics {
  device_model: string | null;
  test_date: string | null;        // YYYY-MM-DD
  gender: 'male' | 'female' | null;
  age: number | null;
  height_cm: number | null;

  weight_kg: number | null;
  smm_kg: number | null;           // الكتلة العضلية الهيكلية
  body_fat_mass_kg: number | null;
  pbf_pct: number | null;          // نسبة الدهون
  bmi: number | null;
  ffm_kg: number | null;           // الكتلة الخالية من الدهون
  total_body_water_l: number | null;
  protein_kg: number | null;
  minerals_kg: number | null;
  bmr_kcal: number | null;
  ecw_ratio: number | null;
  visceral_fat_level: number | null;
  visceral_fat_area_cm2: number | null;
  inbody_score: number | null;
  waist_hip_ratio: number | null;
  phase_angle: number | null;

  target_weight_kg: number | null;
  weight_control_kg: number | null;
  fat_control_kg: number | null;
  muscle_control_kg: number | null;

  segmental_lean: Record<Segment, SegmentValue> | null;
  segmental_fat: Record<Segment, SegmentValue> | null;

  ranges: {
    weight: Range;
    smm: Range;
    body_fat_mass: Range;
    pbf: Range;
    bmi: Range;
  } | null;
}

export type InsightLevel = 'good' | 'watch' | 'alert';

export interface Insight {
  key: string;             // مفتاح ترجمة
  level: InsightLevel;
  params?: Record<string, string | number>;
}

export interface InBodyAnalysis {
  version: 1;
  recommended_goal: 'lose' | 'gain' | 'maintain' | 'fit';
  body_type: 'athletic' | 'balanced' | 'skinny_fat' | 'overfat' | 'underweight' | 'muscular_overfat';
  fat_status: 'low' | 'normal' | 'high' | 'very_high';
  muscle_status: 'low' | 'normal' | 'high';
  visceral_status: 'normal' | 'high' | 'unknown';
  weak_segments: Segment[];
  imbalance: { arms: number | null; legs: number | null; upper_lower: 'upper' | 'lower' | null };
  extra_cardio: boolean;
  caution_ecw: boolean;
  insights: Insight[];
  // أرقام تُستخدم في الخطة
  bmr: number | null;
  ffm: number | null;
  target_weight: number | null;
  weekly_rate_kg: number | null;   // معدل التغيير الأسبوعي المقترح
  weeks_to_target: number | null;
}
