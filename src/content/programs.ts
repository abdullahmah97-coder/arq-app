// برامج تمارين جاهزة يختارها المستخدم ويعتمدها كخطته الأسبوعية
// برنامج «فل بدي ٤ أيام» مبني على جدول زوّدنا به صاحب التطبيق، ومكيّف على مكتبة تمارين ARQ ثلاثية الأبعاد.
import type { I18nText } from '../lib/types';
import type { PlanDay, PlanExercise, WeeklyPlan } from '../lib/plan/types';
import { getExercise } from '../three/catalog';

const t = (ar: string, en: string): I18nText => ({ ar, en });

export interface ProgramExercise {
  exercise_id: string;           // من مكتبة التمارين 3D
  original: string;              // الاسم كما في المصدر
  target: I18nText;              // العضلة المستهدفة كما في المصدر
  sets: number;
  reps: string;
  rest: [number, number];        // دقائق
  rir: string;
}

export interface Program {
  id: string;
  name: I18nText;
  summary: I18nText;
  level: 'beginner' | 'intermediate' | 'advanced';
  audience: 'male' | 'female' | 'all';
  daysPerWeek: number;
  credit?: string;
  /** أيام الأسبوع المقترحة (0 = الأحد) */
  schedule: number[];
  note?: I18nText;
  days: { title: I18nText; exercises: ProgramExercise[] }[];
}

const REST_LONG: [number, number] = [2, 3];
const REST_SHORT: [number, number] = [1, 2];

export const PROGRAMS: Program[] = [
  {
    id: 'arq_fullbody_4d',
    name: t('فل بدي ٤ أيام في النادي', 'Full Body — 4 Days (Gym)'),
    summary: t(
      'أربع جلسات «شامل» تغطي كل الجسم في كل مرة: تمارين مركّبة ثقيلة أولاً (راحة ٢–٣ دقائق، RIR ١–٢) ثم تمارين عزل أقرب للفشل (راحة ١–٢ دقيقة، RIR ٠–١).',
      'Four full-body sessions: heavy compound lifts first (2–3 min rest, RIR 1–2), then isolation work closer to failure (1–2 min rest, RIR 0–1).',
    ),
    level: 'intermediate',
    audience: 'male',
    daysPerWeek: 4,
    schedule: [0, 1, 3, 4], // الأحد، الإثنين، الأربعاء، الخميس
    note: t('تقدر تسوي الأيام متتالية أو متفرقة حسب وقتك — المهم الالتزام.', 'You can train on consecutive or spread-out days — consistency is what matters.'),
    days: [
      {
        title: t('شامل ١', 'Full Body 1'),
        exercises: [
          { exercise_id: 'leg_press', original: 'Leg Press', target: t('الفخذ الأمامي', 'Quads'), sets: 2, reps: '8-10', rest: REST_LONG, rir: '1-2' },
          { exercise_id: 'bench_db', original: 'Flat Dumbbell Press', target: t('الصدر - مستوي', 'Chest - flat'), sets: 2, reps: '8-10', rest: REST_LONG, rir: '1-2' },
          { exercise_id: 'shoulder_press_db_seated', original: 'Dumbbell Shoulder Press', target: t('الكتف - أمامي', 'Front delts'), sets: 2, reps: '8-10', rest: REST_LONG, rir: '1-2' },
          { exercise_id: 'chest_press_machine', original: 'Cable Chest Press', target: t('الصدر - مستوي', 'Chest - flat'), sets: 2, reps: '8-10', rest: REST_SHORT, rir: '0-1' },
          { exercise_id: 'bulgarian_split_squat', original: 'Dumbbell Bulgarian Squat', target: t('الفخذ الأمامي', 'Quads'), sets: 2, reps: '8-10', rest: REST_SHORT, rir: '0-1' },
          { exercise_id: 'lateral_raise_cable', original: 'One Arm Cable Side Raises', target: t('الكتف - جانبي', 'Side delts'), sets: 2, reps: '8-12', rest: REST_SHORT, rir: '0-1' },
          { exercise_id: 'triceps_pushdown', original: 'Cable Triceps Push-Down', target: t('ترايسبس', 'Triceps'), sets: 3, reps: '8-12', rest: REST_SHORT, rir: '0-1' },
        ],
      },
      {
        title: t('شامل ٢', 'Full Body 2'),
        exercises: [
          { exercise_id: 'lat_pulldown', original: 'Machine Pulldown', target: t('الظهر - علوي', 'Upper back'), sets: 2, reps: '8-10', rest: REST_LONG, rir: '1-2' },
          { exercise_id: 'row_cable_seated', original: 'Seated Hammer Row', target: t('الظهر - علوي', 'Upper back'), sets: 2, reps: '8-10', rest: REST_LONG, rir: '1-2' },
          { exercise_id: 'leg_curl_seated', original: 'Seated Leg Curl', target: t('الفخذ الخلفي', 'Hamstrings'), sets: 2, reps: '8-12', rest: REST_SHORT, rir: '0-1' },
          { exercise_id: 'rear_delt_raise', original: 'Cross Cable Fly (rear delt)', target: t('الكتف الخلفي', 'Rear delts'), sets: 2, reps: '8-12', rest: REST_SHORT, rir: '0-1' },
          { exercise_id: 'calf_raise', original: 'Leg Press Calf Raises', target: t('البطات', 'Calves'), sets: 3, reps: '8-12', rest: REST_SHORT, rir: '0-1' },
          { exercise_id: 'curl_db', original: 'Behind Back Cable Curl', target: t('بايسبس', 'Biceps'), sets: 3, reps: '8-12', rest: REST_SHORT, rir: '0-1' },
        ],
      },
      {
        title: t('شامل ٣', 'Full Body 3'),
        exercises: [
          { exercise_id: 'hack_squat', original: 'Hack Squat', target: t('الفخذ الأمامي', 'Quads'), sets: 2, reps: '6-10', rest: REST_LONG, rir: '1-2' },
          { exercise_id: 'incline_db_press', original: 'Incline Dumbbell Press', target: t('الصدر - علوي', 'Upper chest'), sets: 2, reps: '8-10', rest: REST_LONG, rir: '1-2' },
          { exercise_id: 'leg_extension', original: 'Leg Extension', target: t('الفخذ الأمامي', 'Quads'), sets: 2, reps: '8-12', rest: REST_SHORT, rir: '0-1' },
          { exercise_id: 'cable_fly', original: 'Incline Cable Fly', target: t('الصدر - علوي', 'Upper chest'), sets: 2, reps: '8-10', rest: REST_SHORT, rir: '0-1' },
          { exercise_id: 'lateral_raise', original: 'Machine Lateral Raises', target: t('الكتف - جانبي', 'Side delts'), sets: 2, reps: '8-12', rest: REST_SHORT, rir: '0-1' },
          { exercise_id: 'triceps_overhead_db', original: 'Overhead Triceps Extension', target: t('ترايسبس', 'Triceps'), sets: 3, reps: '8-12', rest: REST_SHORT, rir: '0-1' },
        ],
      },
      {
        title: t('شامل ٤', 'Full Body 4'),
        exercises: [
          { exercise_id: 'rdl_bb', original: 'Barbell RDL', target: t('الفخذ الخلفي', 'Hamstrings'), sets: 2, reps: '6-10', rest: REST_LONG, rir: '1-2' },
          { exercise_id: 'lat_pulldown_close', original: 'U-Grip Lat Pulldown', target: t('الظهر - لاتس', 'Lats'), sets: 2, reps: '8-10', rest: REST_LONG, rir: '1-2' },
          { exercise_id: 'row_db_one_arm', original: 'One Arm Lat Row', target: t('الظهر - لاتس', 'Lats'), sets: 2, reps: '8-10', rest: REST_SHORT, rir: '0-1' },
          { exercise_id: 'leg_curl_lying', original: 'Lying Leg Curl', target: t('الفخذ الخلفي', 'Hamstrings'), sets: 2, reps: '8-12', rest: REST_SHORT, rir: '0-1' },
          { exercise_id: 'curl_db', original: 'Supinated Dumbbell Curl', target: t('بايسبس', 'Biceps'), sets: 3, reps: '8-12', rest: REST_SHORT, rir: '0-1' },
          { exercise_id: 'calf_raise', original: 'Leg Press Calf Raises', target: t('البطات', 'Calves'), sets: 3, reps: '8-12', rest: REST_SHORT, rir: '0-1' },
        ],
      },
    ],
  },
];

export const getProgram = (id: string) => PROGRAMS.find((p) => p.id === id) ?? null;

/** شرح RIR بصياغتنا */
export const RIR_INFO = {
  title: t('وش يعني RIR؟', 'What is RIR?'),
  body: t(
    'RIR = عدد العدّات اللي تقدر تسويها زيادة قبل ما توصل للفشل (ما تقدر تكمل بتكنيك صحيح).\n• RIR ٠–١: وقّف وأنت تقدر تسوي عدّة وحدة زيادة بالكثير — مجهود عالي جداً.\n• RIR ١–٢: خلّ عدّة أو عدّتين في الخزان — مناسب للتمارين المركّبة الثقيلة عشان التكنيك والأمان.\nلو خلصت المجموعة وحسيت إنك تقدر تسوي ٤ عدّات أو أكثر زيادة، الوزن خفيف: زِده المرة الجاية.',
    'RIR = how many more reps you could do before failure (when you can no longer keep good form).\n• RIR 0–1: stop when you could do at most one more rep — very high effort.\n• RIR 1–2: leave one or two reps in the tank — ideal for heavy compound lifts, for form and safety.\nIf you finish a set feeling you had 4+ reps left, the weight is too light: add some next time.',
  ),
};

const restSec = (r: [number, number]) => Math.round(((r[0] + r[1]) / 2) * 60);

/** يحوّل البرنامج إلى خطة أسبوعية، مع الاحتفاظ بالوجبات والأهداف من الخطة الحالية */
export function applyProgram(p: Program, base: WeeklyPlan, schedule = p.schedule): WeeklyPlan {
  const days: PlanDay[] = Array.from({ length: 7 }, (_, day) => {
    const k = schedule.indexOf(day);
    if (k < 0 || !p.days[k]) return { day, rest: true, focus: t('راحة واستشفاء', 'Rest & recovery'), exercises: [] };
    const exercises: PlanExercise[] = p.days[k].exercises.map((e) => ({
      name: getExercise(e.exercise_id)?.name ?? t(e.original, e.original),
      exercise_id: e.exercise_id,
      sets: e.sets,
      reps: e.reps,
      rest_sec: restSec(e.rest),
      rir: e.rir,
      notes: e.original !== getExercise(e.exercise_id)?.name.en ? t(`في البرنامج الأصلي: ${e.original}`, `Original: ${e.original}`) : undefined,
    }));
    return { day, rest: false, focus: p.days[k].title, exercises };
  });
  return {
    ...base,
    generated_at: new Date().toISOString(),
    summary: t(`${p.name.ar} — ${p.summary.ar}`, `${p.name.en} — ${p.summary.en}`),
    days,
    program: { id: p.id, name: p.name, credit: p.credit },
  };
}
