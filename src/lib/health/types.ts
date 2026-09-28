// بيانات الصحة اليومية الموحّدة — تأتي من Apple Health (آيفون + Apple Watch) أو Health Connect
// (أندرويد + Pixel/Galaxy/Fitbit/Garmin/WHOOP عبر المزامنة) أو من حساس الخطوات في الجوال.

export type HealthSource = 'apple_health' | 'health_connect' | 'pedometer' | 'demo';

export interface SleepStages {
  /** دقائق لكل مرحلة */
  deep: number;
  rem: number;
  light: number;
  awake: number;
}

export interface SleepNight {
  /** بداية ونهاية الفترة في السرير (ISO) */
  start: string;
  end: string;
  in_bed_min: number;
  asleep_min: number;
  stages?: SleepStages | null;
}

export interface DailyHealth {
  /** اليوم المحلي YYYY-MM-DD (النوم يُنسب لصباح هذا اليوم) */
  day: string;
  steps: number | null;
  active_kcal: number | null;
  distance_m?: number | null;
  resting_hr: number | null;
  /** HRV بالملّي ثانية (Apple = SDNN، Health Connect = RMSSD) */
  hrv_ms: number | null;
  avg_hr?: number | null;
  /** دقائق في مناطق النبض 1..5 (إن توفرت عينات النبض) */
  hr_zone_min?: number[] | null;
  /** معدل التنفس أثناء النوم (نفَس/دقيقة) */
  resp_rate?: number | null;
  /** تشبّع الأكسجين أثناء النوم (%) */
  spo2?: number | null;
  /** حرارة المعصم أثناء النوم (°م) — نقارنها بمعدلك الشخصي */
  skin_temp?: number | null;
  /** أحدث قياس VO₂ Max (مل/كغ/دقيقة) */
  vo2max?: number | null;
  /** عينات النبض لليوم الحالي فقط (لرسم التوتر) */
  hr_series?: { t: number; bpm: number }[] | null;
  sleep: SleepNight | null;
  source: HealthSource;
}

export type RecoveryZone = 'green' | 'yellow' | 'red';

export interface DayScores {
  /** الجاهزية 0..100 (مثل WHOOP Recovery) */
  recovery: number | null;
  zone: RecoveryZone | null;
  /** الإجهاد 0..21 */
  strain: number;
  /** أداء النوم 0..100 = النوم الفعلي ÷ الاحتياج */
  sleep_performance: number | null;
  /** الاحتياج من النوم الليلة القادمة (دقائق) */
  sleep_need_min: number;
  sleep_efficiency: number | null;
  /** نطاق الإجهاد المستهدف اليوم حسب الجاهزية */
  strain_target: [number, number];
  /** مكوّنات الجاهزية لشرحها للمستخدم */
  components: { hrv: number | null; rhr: number | null; sleep: number | null };
  baseline: { hrv_ms: number | null; resting_hr: number | null };
}
