// محرك تحليل InBody: يحوّل الأرقام إلى تشخيص وهدف ومعدل تغيير وتعديلات على الخطة
// حتمي تماماً (بدون ذكاء اصطناعي) حتى تكون النتيجة ثابتة وقابلة للاختبار
import type { InBodyAnalysis, InBodyMetrics, Insight, Segment } from './types';

const r1 = (n: number) => Math.round(n * 10) / 10;

/** المعدلات الطبيعية لنسبة الدهون (ACE/InBody) */
function pbfNormal(m: InBodyMetrics): [number, number] {
  if (m.ranges?.pbf) return m.ranges.pbf;
  return m.gender === 'female' ? [18, 28] : [10, 20];
}

function fatStatus(m: InBodyMetrics): InBodyAnalysis['fat_status'] {
  const pbf = m.pbf_pct;
  if (pbf == null) return 'normal';
  const [lo, hi] = pbfNormal(m);
  if (pbf < lo) return 'low';
  if (pbf <= hi) return 'normal';
  return pbf <= hi + 7 ? 'high' : 'very_high';
}

function muscleStatus(m: InBodyMetrics): InBodyAnalysis['muscle_status'] {
  if (m.smm_kg == null || m.weight_kg == null) return 'normal';
  if (m.ranges?.smm) {
    const [lo, hi] = m.ranges.smm;
    // المدى في التقرير مبني على الوزن المثالي؛ نعتبر "عالي" فقط إذا تجاوز الحد الأعلى بوضوح
    if (m.smm_kg < lo) return 'low';
    if (m.smm_kg > hi * 1.05) return 'high';
    return 'normal';
  }
  const pct = (m.smm_kg / m.weight_kg) * 100;
  const [lo, hi] = m.gender === 'female' ? [30, 40] : [38, 48];
  if (pct < lo) return 'low';
  if (pct > hi) return 'high';
  return 'normal';
}

function visceralStatus(m: InBodyMetrics): InBodyAnalysis['visceral_status'] {
  if (m.visceral_fat_level != null) return m.visceral_fat_level >= 10 ? 'high' : 'normal';
  if (m.visceral_fat_area_cm2 != null) return m.visceral_fat_area_cm2 >= 100 ? 'high' : 'normal';
  return 'unknown';
}

function diffPct(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null || Math.max(a, b) === 0) return null;
  return r1((Math.abs(a - b) / Math.max(a, b)) * 100);
}

export function analyzeInBody(m: InBodyMetrics): InBodyAnalysis {
  const insights: Insight[] = [];
  const fat = fatStatus(m);
  const muscle = muscleStatus(m);
  const visceral = visceralStatus(m);
  const bmiLow = m.bmi != null && m.bmi < 18.5;

  // نوع الجسم والهدف
  let body_type: InBodyAnalysis['body_type'];
  let goal: InBodyAnalysis['recommended_goal'];
  if (bmiLow && fat !== 'high' && fat !== 'very_high') { body_type = 'underweight'; goal = 'gain'; }
  else if ((fat === 'high' || fat === 'very_high') && muscle === 'high') { body_type = 'muscular_overfat'; goal = 'lose'; }
  else if ((fat === 'high' || fat === 'very_high') && muscle === 'low') { body_type = fat === 'very_high' ? 'overfat' : 'skinny_fat'; goal = fat === 'very_high' ? 'lose' : 'fit'; }
  else if (fat === 'high' || fat === 'very_high') { body_type = 'overfat'; goal = 'lose'; }
  else if (muscle === 'high') { body_type = 'athletic'; goal = (m.fat_control_kg ?? 0) <= -3 ? 'lose' : 'maintain'; }
  else if (muscle === 'low') { body_type = fat === 'low' ? 'underweight' : 'skinny_fat'; goal = fat === 'low' ? 'gain' : 'fit'; }
  else {
    body_type = 'balanced';
    // داخل المعدل لكن التقرير يقترح خسارة دهون واضحة → نزول خفيف مع الحفاظ على العضل
    goal = (m.fat_control_kg ?? 0) <= -3 ? 'lose' : (m.muscle_control_kg ?? 0) >= 2 ? 'gain' : 'fit';
  }

  // معدل التغيير الأسبوعي
  let weekly_rate_kg: number | null = null;
  const fatToLose = m.fat_control_kg != null && m.fat_control_kg < 0 ? -m.fat_control_kg
    : m.target_weight_kg != null && m.weight_kg != null && m.target_weight_kg < m.weight_kg ? m.weight_kg - m.target_weight_kg : null;
  if (goal === 'lose' && m.weight_kg) {
    const pctCap = m.weight_kg * (fat === 'very_high' ? 0.01 : 0.0075);
    weekly_rate_kg = r1(Math.min(pctCap, fatToLose != null && fatToLose <= 5 ? 0.35 : fat === 'very_high' ? 0.9 : 0.6));
  } else if (goal === 'gain') {
    weekly_rate_kg = 0.25;
  } else if (goal === 'fit') {
    weekly_rate_kg = 0.15;
  }
  const target_weight = m.target_weight_kg ?? null;
  const toTarget = target_weight != null && m.weight_kg != null ? Math.abs(m.weight_kg - target_weight) : fatToLose;
  const weeks_to_target = toTarget != null && weekly_rate_kg ? Math.max(1, Math.ceil(toTarget / weekly_rate_kg)) : null;

  // التقسيم العضلي
  const seg = m.segmental_lean;
  const weak_segments: Segment[] = seg
    ? (Object.keys(seg) as Segment[]).filter((s) => seg[s].pct != null && seg[s].pct! < 90)
    : [];
  const arms = diffPct(seg?.right_arm.kg, seg?.left_arm.kg);
  const legs = diffPct(seg?.right_leg.kg, seg?.left_leg.kg);
  let upper_lower: 'upper' | 'lower' | null = null;
  if (seg) {
    const up = [seg.right_arm.pct, seg.left_arm.pct].filter((x): x is number => x != null);
    const lo = [seg.right_leg.pct, seg.left_leg.pct].filter((x): x is number => x != null);
    if (up.length && lo.length) {
      const u = up.reduce((a, b) => a + b, 0) / up.length;
      const l = lo.reduce((a, b) => a + b, 0) / lo.length;
      if (l - u > 10) upper_lower = 'upper';
      else if (u - l > 10) upper_lower = 'lower';
    }
  }

  const extra_cardio = visceral === 'high' || fat === 'very_high';
  const caution_ecw = m.ecw_ratio != null && m.ecw_ratio >= 0.39;

  // الملاحظات (مرتبة: تنبيهات ثم مراقبة ثم إيجابيات)
  if (caution_ecw) insights.push({ key: 'ecw_high', level: 'alert', params: { v: m.ecw_ratio! } });
  if (visceral === 'high') insights.push({ key: 'visceral_high', level: 'alert', params: { v: m.visceral_fat_level ?? m.visceral_fat_area_cm2 ?? '' } });

  if (fat === 'very_high') insights.push({ key: 'fat_very_high', level: 'alert', params: { v: m.pbf_pct ?? '' } });
  else if (fat === 'high') insights.push({ key: 'fat_high', level: 'watch', params: { v: m.pbf_pct ?? '' } });
  else if (fat === 'low') insights.push({ key: 'fat_low', level: 'watch', params: { v: m.pbf_pct ?? '' } });
  else if (m.pbf_pct != null) insights.push({ key: 'fat_normal', level: 'good', params: { v: m.pbf_pct } });

  if (muscle === 'low') insights.push({ key: 'muscle_low', level: 'watch', params: { v: m.smm_kg ?? '' } });
  else if (muscle === 'high') insights.push({ key: 'muscle_high', level: 'good', params: { v: m.smm_kg ?? '' } });
  else if (m.smm_kg != null) insights.push({ key: 'muscle_normal', level: 'good', params: { v: m.smm_kg } });

  if (weak_segments.length) insights.push({ key: 'weak_segments', level: 'watch', params: { list: weak_segments.join(',') } });
  if (arms != null && arms > 5) insights.push({ key: 'imbalance_arms', level: 'watch', params: { v: arms } });
  if (legs != null && legs > 5) insights.push({ key: 'imbalance_legs', level: 'watch', params: { v: legs } });
  if (upper_lower) insights.push({ key: upper_lower === 'upper' ? 'upper_weaker' : 'lower_weaker', level: 'watch' });
  if (visceral === 'normal') insights.push({ key: 'visceral_normal', level: 'good' });

  if (target_weight != null || fatToLose != null) {
    insights.push({
      key: 'target', level: 'good',
      params: {
        target: target_weight ?? '',
        fat: m.fat_control_kg ?? 0,
        muscle: m.muscle_control_kg ?? 0,
        weeks: weeks_to_target ?? '',
      },
    });
  }
  if (m.bmr_kcal != null) insights.push({ key: 'bmr', level: 'good', params: { v: m.bmr_kcal } });

  return {
    version: 1,
    recommended_goal: goal,
    body_type,
    fat_status: fat,
    muscle_status: muscle,
    visceral_status: visceral,
    weak_segments,
    imbalance: { arms, legs, upper_lower },
    extra_cardio,
    caution_ecw,
    insights,
    bmr: m.bmr_kcal ?? (m.ffm_kg != null ? Math.round(370 + 21.6 * m.ffm_kg) : null), // Katch-McArdle عند غياب BMR
    ffm: m.ffm_kg,
    target_weight,
    weekly_rate_kg,
    weeks_to_target,
  };
}
