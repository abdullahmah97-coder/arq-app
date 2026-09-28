// مولّد الخطة بالقواعد — يعمل بدون إنترنت وبدون ذكاء اصطناعي،
// ويُستخدم أيضاً كمرجع للأرقام (السعرات والماكروز) التي تُرسل للذكاء الاصطناعي.
import type { Goal, I18nText, Level } from '../types';
import type {
  MealSlot, PlanDay, PlanExercise, PlanInput, PlanMeal, PlanMealDay, PlanTargets, WeeklyPlan,
} from './types';

const t = (ar: string, en: string): I18nText => ({ ar, en });

// ---------------------------------------------------------------------------
// الحسابات
// ---------------------------------------------------------------------------

export function calcBmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export function bmiCategory(bmi: number): 'under' | 'normal' | 'over' | 'obese' {
  if (bmi < 18.5) return 'under';
  if (bmi < 25) return 'normal';
  if (bmi < 30) return 'over';
  return 'obese';
}

/** معادلة Mifflin-St Jeor */
export function calcBmr(i: Pick<PlanInput, 'gender' | 'weight_kg' | 'height_cm' | 'age'>): number {
  const base = 10 * i.weight_kg + 6.25 * i.height_cm - 5 * i.age;
  return Math.round(i.gender === 'male' ? base + 5 : base - 161);
}

export function calcTargets(i: PlanInput): PlanTargets {
  const bmi = calcBmi(i.weight_kg, i.height_cm);
  const ib = i.inbody;
  // مع InBody نستخدم معدل الأيض الأساسي المقاس بدل المعادلة
  const bmr = ib?.bmr ?? calcBmr(i);
  const activity = 1.2 + 0.075 * i.days_per_week; // 2 أيام ≈ 1.35 ، 6 أيام ≈ 1.65
  const tdee = bmr * activity;
  const floor = i.gender === 'male' ? 1500 : 1200;

  let adjust: number;
  if (ib?.weekly_rate_kg != null && (i.goal === 'lose' || i.goal === 'gain')) {
    // 1 كجم دهون ≈ 7700 سعرة → المعدل الأسبوعي × 1100 سعرة يومياً
    adjust = (i.goal === 'lose' ? -1 : 1) * Math.round(ib.weekly_rate_kg * 1100);
  } else {
    adjust = ({ lose: -500, gain: 300, maintain: 0, fit: -150 } as Record<Goal, number>)[i.goal];
  }
  // لا ننزل تحت معدل الأيض الأساسي عند توفره من InBody (يحافظ على العضل والهرمونات)
  const minCalories = ib?.bmr ? Math.max(floor, ib.bmr) : floor;
  const calories = Math.max(minCalories, Math.round((tdee + adjust) / 10) * 10);

  let protein_g: number;
  if (ib?.ffm) {
    // البروتين على الكتلة الخالية من الدهون أدق من الوزن الكلي
    const perFfm: Record<Goal, number> = { lose: 2.3, gain: 2.2, maintain: 2.0, fit: 2.2 };
    protein_g = Math.round(ib.ffm * perFfm[i.goal]);
  } else {
    const proteinPerKg: Record<Goal, number> = { lose: 2.0, gain: 1.8, maintain: 1.6, fit: 1.8 };
    // عند السمنة نحسب البروتين على وزن تقريبي "مُعدّل" حتى لا يكون مبالغاً فيه
    const refWeight = bmi >= 30 ? 25 * Math.pow(i.height_cm / 100, 2) : i.weight_kg;
    protein_g = Math.round(refWeight * proteinPerKg[i.goal]);
  }
  const fat_g = Math.round((calories * 0.27) / 9);
  const carbs_g = Math.max(50, Math.round((calories - protein_g * 4 - fat_g * 9) / 4));
  const water_l = Math.round((i.weight_kg * 0.035 + i.days_per_week * 0.1) * 10) / 10;

  return { bmi, bmr, calories, protein_g, carbs_g, fat_g, water_l };
}

// ---------------------------------------------------------------------------
// مكتبة التمارين
// ---------------------------------------------------------------------------

type Pattern =
  | 'squat' | 'hinge' | 'lunge' | 'hpush' | 'vpush' | 'hpull' | 'vpull'
  | 'chest_iso' | 'shoulder_iso' | 'biceps' | 'triceps' | 'calves' | 'core' | 'glutes' | 'hamstring_iso' | 'quad_iso';

const LIB: Record<Pattern, Record<Level, I18nText>> = {
  squat: {
    beginner: t('سكوات بالكرسي (Goblet Squat)', 'Goblet Squat'),
    intermediate: t('سكوات بالبار', 'Barbell Back Squat'),
    advanced: t('سكوات بالبار', 'Barbell Back Squat'),
  },
  hinge: {
    beginner: t('ديدلفت روماني بالدمبل', 'Dumbbell Romanian Deadlift'),
    intermediate: t('ديدلفت روماني بالبار', 'Barbell Romanian Deadlift'),
    advanced: t('ديدلفت تقليدي', 'Conventional Deadlift'),
  },
  lunge: {
    beginner: t('طعنات ثابتة', 'Split Squat'),
    intermediate: t('طعنات مشي بالدمبل', 'Dumbbell Walking Lunge'),
    advanced: t('بلغاري سبليت سكوات', 'Bulgarian Split Squat'),
  },
  hpush: {
    beginner: t('ضغط صدر بالجهاز', 'Machine Chest Press'),
    intermediate: t('بنش برس بالدمبل', 'Dumbbell Bench Press'),
    advanced: t('بنش برس بالبار', 'Barbell Bench Press'),
  },
  vpush: {
    beginner: t('ضغط أكتاف بالجهاز', 'Machine Shoulder Press'),
    intermediate: t('ضغط أكتاف بالدمبل جالس', 'Seated Dumbbell Shoulder Press'),
    advanced: t('ضغط أكتاف بالبار واقف', 'Standing Overhead Press'),
  },
  hpull: {
    beginner: t('سحب أرضي بالكيبل', 'Seated Cable Row'),
    intermediate: t('تجديف بالدمبل', 'One-Arm Dumbbell Row'),
    advanced: t('تجديف بالبار', 'Barbell Row'),
  },
  vpull: {
    beginner: t('سحب عالي (Lat Pulldown)', 'Lat Pulldown'),
    intermediate: t('سحب عالي قبضة ضيقة', 'Close-Grip Lat Pulldown'),
    advanced: t('عقلة (Pull-ups)', 'Pull-ups'),
  },
  chest_iso: {
    beginner: t('تفتيح صدر بالجهاز', 'Pec Deck Fly'),
    intermediate: t('تفتيح بالكيبل', 'Cable Fly'),
    advanced: t('ضغط صدر مائل بالدمبل', 'Incline Dumbbell Press'),
  },
  shoulder_iso: {
    beginner: t('رفرفة جانبية بالدمبل', 'Dumbbell Lateral Raise'),
    intermediate: t('رفرفة جانبية بالكيبل', 'Cable Lateral Raise'),
    advanced: t('رفرفة جانبية + خلفي', 'Lateral + Rear Delt Raise'),
  },
  biceps: {
    beginner: t('باي بالدمبل', 'Dumbbell Curl'),
    intermediate: t('باي هامر', 'Hammer Curl'),
    advanced: t('باي بالبار', 'Barbell Curl'),
  },
  triceps: {
    beginner: t('تراي بالكيبل (Pushdown)', 'Cable Pushdown'),
    intermediate: t('تراي فرنسي بالدمبل', 'Overhead Dumbbell Extension'),
    advanced: t('متوازي (Dips)', 'Dips'),
  },
  calves: {
    beginner: t('سمانة واقف', 'Standing Calf Raise'),
    intermediate: t('سمانة واقف', 'Standing Calf Raise'),
    advanced: t('سمانة جالس + واقف', 'Seated + Standing Calf Raise'),
  },
  core: {
    beginner: t('بلانك', 'Plank'),
    intermediate: t('رفع أرجل معلّق', 'Hanging Knee Raise'),
    advanced: t('عجلة البطن', 'Ab Wheel Rollout'),
  },
  glutes: {
    beginner: t('جسر الأرداف', 'Glute Bridge'),
    intermediate: t('هيب ثرست بالدمبل', 'Dumbbell Hip Thrust'),
    advanced: t('هيب ثرست بالبار', 'Barbell Hip Thrust'),
  },
  hamstring_iso: {
    beginner: t('ثني أرجل بالجهاز', 'Lying Leg Curl'),
    intermediate: t('ثني أرجل بالجهاز', 'Lying Leg Curl'),
    advanced: t('ثني أرجل جالس', 'Seated Leg Curl'),
  },
  quad_iso: {
    beginner: t('رفرفة أرجل بالجهاز', 'Leg Extension'),
    intermediate: t('ليق برس', 'Leg Press'),
    advanced: t('هاك سكوات', 'Hack Squat'),
  },
};

const COMPOUND: Pattern[] = ['squat', 'hinge', 'lunge', 'hpush', 'vpush', 'hpull', 'vpull'];

// ---------------------------------------------------------------------------
// تقسيمات الأسبوع
// ---------------------------------------------------------------------------

type Session = { focus: I18nText; patterns: Pattern[] };

const S = {
  fullA: { focus: t('جسم كامل (أ)', 'Full Body A'), patterns: ['squat', 'hpush', 'hpull', 'glutes', 'shoulder_iso', 'core'] },
  fullB: { focus: t('جسم كامل (ب)', 'Full Body B'), patterns: ['hinge', 'vpush', 'vpull', 'lunge', 'biceps', 'triceps'] },
  fullC: { focus: t('جسم كامل (ج)', 'Full Body C'), patterns: ['quad_iso', 'chest_iso', 'hpull', 'hamstring_iso', 'shoulder_iso', 'core'] },
  upper: { focus: t('الجزء العلوي', 'Upper Body'), patterns: ['hpush', 'hpull', 'vpush', 'vpull', 'biceps', 'triceps'] },
  lower: { focus: t('الجزء السفلي', 'Lower Body'), patterns: ['squat', 'hinge', 'lunge', 'hamstring_iso', 'calves', 'core'] },
  upper2: { focus: t('الجزء العلوي (2)', 'Upper Body 2'), patterns: ['vpull', 'chest_iso', 'hpull', 'shoulder_iso', 'triceps', 'biceps'] },
  lower2: { focus: t('الجزء السفلي (2)', 'Lower Body 2'), patterns: ['quad_iso', 'glutes', 'lunge', 'hamstring_iso', 'calves', 'core'] },
  push: { focus: t('دفع: صدر وأكتاف وتراي', 'Push: Chest, Shoulders, Triceps'), patterns: ['hpush', 'vpush', 'chest_iso', 'shoulder_iso', 'triceps'] },
  pull: { focus: t('سحب: ظهر وباي', 'Pull: Back & Biceps'), patterns: ['vpull', 'hpull', 'hinge', 'biceps', 'core'] },
  legs: { focus: t('أرجل وأرداف', 'Legs & Glutes'), patterns: ['squat', 'lunge', 'hamstring_iso', 'glutes', 'calves'] },
} satisfies Record<string, { focus: I18nText; patterns: Pattern[] }>;

/** أيام التمرين في الأسبوع (0 = الأحد) — الجمعة راحة قدر الإمكان */
const TRAINING_DAYS: Record<number, number[]> = {
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4],
  6: [6, 0, 1, 2, 3, 4],
};

function splitFor(days: number): Session[] {
  switch (days) {
    case 2: return [S.fullA, S.fullB];
    case 3: return [S.fullA, S.fullB, S.fullC];
    case 4: return [S.upper, S.lower, S.upper2, S.lower2];
    case 5: return [S.push, S.pull, S.legs, S.upper2, S.lower2];
    default: return [S.push, S.pull, S.legs, S.push, S.pull, S.legs];
  }
}

function prescription(p: Pattern, level: Level, goal: Goal): Omit<PlanExercise, 'name'> {
  const compound = COMPOUND.includes(p);
  const sets = level === 'beginner' ? 3 : compound ? 4 : 3;
  if (p === 'core') {
    return { sets: 3, reps: level === 'beginner' ? '30-45s' : '10-15', rest_sec: 45 };
  }
  let reps: string;
  let rest: number;
  if (goal === 'gain') { reps = compound ? '6-10' : '10-12'; rest = compound ? 120 : 75; }
  else if (goal === 'lose') { reps = compound ? '10-12' : '12-15'; rest = compound ? 75 : 45; }
  else { reps = compound ? '8-12' : '12-15'; rest = compound ? 90 : 60; }
  return { sets, reps, rest_sec: rest };
}

function cardioFor(goal: Goal, level: Level): I18nText | undefined {
  if (goal === 'lose') {
    return level === 'beginner'
      ? t('مشي سريع على السير بميل 20 دقيقة بعد التمرين', '20 min incline treadmill walk after training')
      : t('كارديو متقطع 15 دقيقة (30ث سريع / 60ث هادئ)', '15 min intervals (30s hard / 60s easy)');
  }
  if (goal === 'fit') return t('10–15 دقيقة دراجة أو إليبتكال بإيقاع متوسط', '10–15 min bike or elliptical, moderate pace');
  return undefined;
}

const UPPER: Pattern[] = ['hpush', 'vpush', 'hpull', 'vpull', 'chest_iso', 'shoulder_iso', 'biceps', 'triceps'];
const LOWER: Pattern[] = ['squat', 'hinge', 'lunge', 'glutes', 'hamstring_iso', 'quad_iso', 'calves'];
const INBODY_NOTE = t('تركيز إضافي حسب تقرير InBody', 'Extra focus from your InBody report');

/** تعديل تمارين الجلسة حسب تحليل InBody: عضلات ضعيفة، عدم توازن، وجزء علوي/سفلي */
function applyInBody(patterns: Pattern[], i: PlanInput): { patterns: Pattern[]; emphasized: Set<Pattern> } {
  const ib = i.inbody;
  const out = [...patterns];
  const emphasized = new Set<Pattern>();
  if (!ib) return { patterns: out, emphasized };
  const hasUpper = out.some((p) => UPPER.includes(p));
  const hasLower = out.some((p) => LOWER.includes(p));
  const add = (p: Pattern) => {
    if (out.length >= 8) return;
    if (!out.includes(p)) out.push(p);
    emphasized.add(p);
  };
  const weak = new Set(ib.weak_segments);
  if (hasUpper && (weak.has('right_arm') || weak.has('left_arm'))) { add('biceps'); add('triceps'); }
  if (hasLower && (weak.has('right_leg') || weak.has('left_leg'))) { add('quad_iso'); add('hamstring_iso'); }
  if (weak.has('trunk')) add('core');
  if (ib.imbalance.upper_lower === 'upper' && hasUpper) add('shoulder_iso');
  if (ib.imbalance.upper_lower === 'lower' && hasLower) add('lunge');
  return { patterns: out, emphasized };
}

function imbalanceNote(p: Pattern, i: PlanInput): I18nText | undefined {
  const ib = i.inbody;
  if (!ib) return undefined;
  if ((ib.imbalance.arms ?? 0) > 5 && (p === 'hpush' || p === 'hpull' || p === 'biceps' || p === 'triceps')) {
    return t('نفّذها بالدمبل (يد واحدة) وابدأ بالجهة الأضعف لتعديل عدم التوازن', 'Use dumbbells one side at a time and start with the weaker side to fix the imbalance');
  }
  if ((ib.imbalance.legs ?? 0) > 5 && (p === 'lunge' || p === 'quad_iso' || p === 'hamstring_iso')) {
    return t('رجل واحدة في كل مرة، وابدأ بالرجل الأضعف', 'One leg at a time, starting with the weaker leg');
  }
  return undefined;
}

export function buildWorkoutDays(i: PlanInput): PlanDay[] {
  const daysPerWeek = Math.min(6, Math.max(2, Math.round(i.days_per_week)));
  const trainingDays = TRAINING_DAYS[daysPerWeek];
  const sessions = splitFor(daysPerWeek);
  const out: PlanDay[] = [];
  for (let d = 0; d < 7; d++) {
    const idx = trainingDays.indexOf(d);
    if (idx === -1) {
      out.push({
        day: d,
        rest: true,
        focus: t('راحة واستشفاء', 'Rest & Recovery'),
        exercises: [],
        cardio: i.inbody?.extra_cardio
          ? t('مشي سريع 40 دقيقة (مهم لتقليل الدهون الحشوية) + إطالات', '40 min brisk walk (key for visceral fat) + stretching')
          : t('مشي خفيف 30 دقيقة + إطالات', '30 min easy walk + stretching'),
      });
      continue;
    }
    const session = sessions[idx];
    const { patterns, emphasized } = applyInBody(session.patterns, i);
    const exercises: PlanExercise[] = patterns.map((p) => ({
      name: LIB[p][i.level],
      ...prescription(p, i.level, i.goal),
      notes: imbalanceNote(p, i)
        ?? (emphasized.has(p) ? INBODY_NOTE : undefined)
        ?? (COMPOUND.includes(p) && i.level === 'beginner'
          ? t('ركّز على الأداء الصحيح بوزن خفيف', 'Focus on form with a light weight')
          : undefined),
    }));
    let cardio = cardioFor(i.goal, i.level);
    if (i.inbody?.extra_cardio && !cardio) {
      cardio = t('20 دقيقة كارديو متوسط بعد التمرين لتقليل الدهون الحشوية', '20 min moderate cardio after training to reduce visceral fat');
    }
    out.push({ day: d, rest: false, focus: session.focus, exercises, cardio });
  }
  return out;
}

// ---------------------------------------------------------------------------
// الوجبات — قوالب محلية تُضبط كمياتها حسب السعرات المستهدفة
// ---------------------------------------------------------------------------

interface MealTemplate {
  slot: MealSlot;
  name: I18nText;
  kcal: number;      // للحصة الأساسية
  protein_g: number; // للحصة الأساسية
  portions: { name: I18nText; qty: number; unit: 'g' | 'ml' | 'pc' }[];
}

const P = (ar: string, en: string, qty: number, unit: 'g' | 'ml' | 'pc' = 'g') => ({ name: t(ar, en), qty, unit });

const MEALS: MealTemplate[] = [
  // فطور
  { slot: 'breakfast', name: t('شوفان بالحليب والموز', 'Oats with milk & banana'), kcal: 450, protein_g: 22,
    portions: [P('شوفان', 'Oats', 60), P('حليب قليل الدسم', 'Low-fat milk', 250, 'ml'), P('موز', 'Banana', 1, 'pc'), P('زبدة فول سوداني', 'Peanut butter', 10)] },
  { slot: 'breakfast', name: t('بيض وخبز بر وخضار', 'Eggs, wholewheat bread & veggies'), kcal: 430, protein_g: 26,
    portions: [P('بيض', 'Eggs', 3, 'pc'), P('خبز بر', 'Wholewheat bread', 60), P('طماطم وخيار', 'Tomato & cucumber', 150)] },
  { slot: 'breakfast', name: t('فول بزيت الزيتون مع بيض', 'Ful medames with olive oil & eggs'), kcal: 470, protein_g: 27,
    portions: [P('فول مدمس', 'Fava beans', 200), P('بيض مسلوق', 'Boiled eggs', 2, 'pc'), P('زيت زيتون', 'Olive oil', 7, 'ml'), P('خبز بر', 'Wholewheat bread', 40)] },
  { slot: 'breakfast', name: t('زبادي يوناني بالتوت والشوفان', 'Greek yogurt, berries & oats'), kcal: 400, protein_g: 30,
    portions: [P('زبادي يوناني', 'Greek yogurt', 250), P('توت', 'Berries', 100), P('شوفان', 'Oats', 30), P('عسل', 'Honey', 10)] },
  // غداء
  { slot: 'lunch', name: t('كبسة دجاج صحية', 'Healthy chicken kabsa'), kcal: 650, protein_g: 48,
    portions: [P('صدر دجاج', 'Chicken breast', 180), P('رز بسمتي مطبوخ', 'Cooked basmati rice', 200), P('سلطة خضراء', 'Green salad', 150)] },
  { slot: 'lunch', name: t('سمك هامور مشوي مع رز وخضار', 'Grilled hammour, rice & veggies'), kcal: 600, protein_g: 45,
    portions: [P('سمك مشوي', 'Grilled fish', 200), P('رز مطبوخ', 'Cooked rice', 180), P('خضار سوتيه', 'Sautéed vegetables', 150)] },
  { slot: 'lunch', name: t('لحم قليل الدهن مع برغل وسلطة', 'Lean beef, bulgur & salad'), kcal: 640, protein_g: 44,
    portions: [P('لحم قليل الدهن', 'Lean beef', 160), P('برغل مطبوخ', 'Cooked bulgur', 180), P('سلطة', 'Salad', 150), P('زيت زيتون', 'Olive oil', 7, 'ml')] },
  { slot: 'lunch', name: t('صدر دجاج مع بطاطا مشوية', 'Chicken breast & roasted potato'), kcal: 580, protein_g: 46,
    portions: [P('صدر دجاج', 'Chicken breast', 180), P('بطاطا مشوية', 'Roasted potato', 250), P('بروكلي', 'Broccoli', 120)] },
  // سناك
  { slot: 'snack', name: t('تمر ولبن', 'Dates & laban'), kcal: 250, protein_g: 9,
    portions: [P('تمر', 'Dates', 3, 'pc'), P('لبن قليل الدسم', 'Low-fat laban', 250, 'ml')] },
  { slot: 'snack', name: t('تفاحة ومكسرات', 'Apple & nuts'), kcal: 240, protein_g: 6,
    portions: [P('تفاحة', 'Apple', 1, 'pc'), P('لوز', 'Almonds', 20)] },
  { slot: 'snack', name: t('شيك بروتين وموز', 'Protein shake & banana'), kcal: 260, protein_g: 27,
    portions: [P('واي بروتين', 'Whey protein', 30), P('ماء أو حليب', 'Water or milk', 250, 'ml'), P('موز', 'Banana', 1, 'pc')] },
  // عشاء
  { slot: 'dinner', name: t('سلطة تونة وخبز بر', 'Tuna salad & wholewheat bread'), kcal: 420, protein_g: 35,
    portions: [P('تونة بالماء', 'Tuna in water', 120), P('خضار مشكلة', 'Mixed vegetables', 200), P('خبز بر', 'Wholewheat bread', 40), P('زيت زيتون', 'Olive oil', 5, 'ml')] },
  { slot: 'dinner', name: t('شكشوكة بالبيض', 'Egg shakshuka'), kcal: 400, protein_g: 24,
    portions: [P('بيض', 'Eggs', 3, 'pc'), P('طماطم وفلفل', 'Tomato & peppers', 200), P('خبز بر', 'Wholewheat bread', 40)] },
  { slot: 'dinner', name: t('شاورما دجاج صحية بالصاج', 'Healthy chicken shawarma wrap'), kcal: 480, protein_g: 38,
    portions: [P('دجاج متبّل مشوي', 'Grilled marinated chicken', 140), P('خبز صاج', 'Saj bread', 1, 'pc'), P('خضار', 'Veggies', 100), P('صوص زبادي', 'Yogurt sauce', 40)] },
  { slot: 'dinner', name: t('زبادي يوناني مع جبن قريش وخضار', 'Greek yogurt, cottage cheese & veggies'), kcal: 380, protein_g: 36,
    portions: [P('جبن قريش', 'Cottage cheese', 150), P('زبادي يوناني', 'Greek yogurt', 150), P('خيار', 'Cucumber', 150), P('خبز بر', 'Wholewheat bread', 30)] },
];

const SLOT_SHARE: Record<MealSlot, number> = { breakfast: 0.25, lunch: 0.35, snack: 0.15, dinner: 0.25 };
const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];

function formatQty(qty: number, unit: 'g' | 'ml' | 'pc', factor: number): string {
  if (unit === 'pc') {
    const n = Math.max(1, Math.round(qty * factor));
    return `${n}`;
  }
  const v = Math.max(5, Math.round((qty * factor) / 5) * 5);
  return `${v} ${unit === 'g' ? 'g' : 'ml'}`;
}

function scaleMeal(m: MealTemplate, targetKcal: number): PlanMeal {
  const factor = Math.min(2, Math.max(0.6, targetKcal / m.kcal));
  return {
    slot: m.slot,
    name: m.name,
    kcal: Math.round((m.kcal * factor) / 5) * 5,
    protein_g: Math.round(m.protein_g * factor),
    portions: m.portions.map((p) => ({ name: p.name, amount: formatQty(p.qty, p.unit, factor) })),
  };
}

export function buildMealDays(targets: PlanTargets): PlanMealDay[] {
  const bySlot = (s: MealSlot) => MEALS.filter((m) => m.slot === s);
  const days: PlanMealDay[] = [];
  for (let d = 0; d < 7; d++) {
    days.push({
      day: d,
      meals: SLOTS.map((slot, k) => {
        const options = bySlot(slot);
        const pick = options[(d + k) % options.length];
        return scaleMeal(pick, targets.calories * SLOT_SHARE[slot]);
      }),
    });
  }
  return days;
}

// ---------------------------------------------------------------------------
// الخطة الكاملة
// ---------------------------------------------------------------------------

export function validateInput(i: PlanInput): string | null {
  if (!(i.height_cm >= 120 && i.height_cm <= 230)) return 'height';
  if (!(i.weight_kg >= 30 && i.weight_kg <= 300)) return 'weight';
  if (!(i.age >= 13 && i.age <= 100)) return 'age';
  if (!(i.days_per_week >= 2 && i.days_per_week <= 6)) return 'days';
  return null;
}

export function generateRulesPlan(i: PlanInput, now: Date = new Date()): WeeklyPlan {
  const targets = calcTargets(i);
  const cat = bmiCategory(targets.bmi);
  const goalText: Record<Goal, I18nText> = {
    lose: t('خسارة الدهون مع الحفاظ على العضل', 'Fat loss while keeping muscle'),
    gain: t('بناء العضل وزيادة الوزن الصحية', 'Muscle gain & healthy weight gain'),
    maintain: t('الحفاظ على الوزن وتحسين الأداء', 'Maintain weight & improve performance'),
    fit: t('لياقة عامة وشد الجسم', 'General fitness & body recomposition'),
  };
  const catText: Record<typeof cat, I18nText> = {
    under: t('أقل من الطبيعي', 'underweight'),
    normal: t('طبيعي', 'normal'),
    over: t('زيادة وزن', 'overweight'),
    obese: t('سمنة', 'obese range'),
  };

  const tips: I18nText[] = [
    t('زد الأوزان تدريجياً عندما تنهي كل المجموعات بسهولة (الحمل التدريجي).', 'Add weight gradually once all sets feel easy (progressive overload).'),
    t(`اشرب حوالي ${targets.water_l} لتر ماء يومياً، وأكثر في أيام التمرين والصيف.`, `Drink about ${targets.water_l} L of water daily, more on training days and in summer.`),
    t('نم 7–9 ساعات؛ الاستشفاء جزء من التمرين.', 'Sleep 7–9 hours; recovery is part of training.'),
    t('سجّل وزنك مرة أسبوعياً بنفس الوقت (الصباح قبل الأكل).', 'Weigh in once a week at the same time (morning, before eating).'),
  ];
  if (i.goal === 'lose') tips.push(t('خطوات يومية 8–10 آلاف تسرّع حرق الدهون.', '8–10k daily steps speed up fat loss.'));
  if (i.goal === 'gain') tips.push(t('إذا لم يزد وزنك خلال أسبوعين أضف 200 سعرة يومياً.', 'If your weight has not moved in 2 weeks, add 200 kcal/day.'));
  const ib = i.inbody;
  if (ib) {
    if (ib.weeks_to_target && ib.target_weight) tips.unshift(t(`الوصول للوزن المستهدف ${ib.target_weight} كجم يحتاج تقريباً ${ib.weeks_to_target} أسبوع بمعدل ${ib.weekly_rate_kg} كجم أسبوعياً.`, `Reaching your target of ${ib.target_weight} kg takes about ${ib.weeks_to_target} weeks at ${ib.weekly_rate_kg} kg/week.`));
    if (ib.caution_ecw) tips.unshift(t('نسبة الماء خارج الخلايا مرتفعة في تقريرك؛ خفّف الشدة وراجع طبيباً للاطمئنان.', 'Your ECW ratio is elevated; keep intensity moderate and check with a doctor.'));
    tips.push(t('أعد فحص InBody كل 4–6 أسابيع بنفس الظروف (صباحاً، صائماً، قبل التمرين) لقياس التقدم بدقة.', 'Re-test InBody every 4–6 weeks under the same conditions (morning, fasted, before training).'));
  }
  if (cat === 'obese') tips.push(t('ابدأ بتمارين منخفضة التأثير على المفاصل واستشر طبيبك قبل الكارديو العنيف.', 'Start with joint-friendly exercise and check with a doctor before intense cardio.'));

  return {
    version: 1,
    generated_at: now.toISOString(),
    summary: t(
      `الهدف: ${goalText[i.goal].ar}. مؤشر كتلة الجسم ${targets.bmi} (${catText[cat].ar}). ${i.days_per_week} أيام تمرين أسبوعياً و${targets.calories} سعرة يومياً.`,
      `Goal: ${goalText[i.goal].en}. BMI ${targets.bmi} (${catText[cat].en}). ${i.days_per_week} training days/week and ${targets.calories} kcal/day.`,
    ),
    targets,
    based_on_inbody: !!ib,
    days: buildWorkoutDays(i),
    meals: buildMealDays(targets),
    tips,
  };
}
