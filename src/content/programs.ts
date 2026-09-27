// برامج تمارين جاهزة يختارها المستخدم ويعتمدها كخطته الأسبوعية
// برنامج «فل بدي ٤ أيام» مبني على جدول زوّدنا به صاحب التطبيق، ومكيّف على مكتبة تمارين ARQ ثلاثية الأبعاد.
import type { I18nText } from '../lib/types';
import type { PlanDay, PlanExercise, WeeklyPlan } from '../lib/plan/types';
import { getExercise, MUSCLE_NAMES } from '../three/catalog';
import { MOTIONS } from '../three/motions';

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

const REST_STRENGTH: [number, number] = [3, 5];
const REST_BEGIN: [number, number] = [1.5, 2];
const REST_CIRCUIT: [number, number] = [0.5, 1];

/** تمرين من المكتبة: الاسم والعضلة المستهدفة تُؤخذ من دليل التمارين تلقائياً */
function x(id: string, sets: number, reps: string, rest: [number, number], rir: string): ProgramExercise {
  const g = getExercise(id);
  if (!g) throw new Error(`unknown exercise ${id}`);
  const m = MOTIONS[g.motion];
  return { exercise_id: id, original: g.name.en, target: MUSCLE_NAMES[m.primary[0]], sets, reps, rest, rir };
}
const day = (ar: string, en: string, exercises: ProgramExercise[]) => ({ title: t(ar, en), exercises });

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
  {
    id: 'arq_beginner_fullbody_3d',
    name: t('مبتدئ: فل بدي ٣ أيام', 'Beginner Full Body — 3 Days'),
    summary: t('أفضل بداية للنادي: ثلاث جلسات تغطي كل الجسم بتمارين سهلة التعلّم وأوزان متوسطة. زِد الوزن شوي كل ما صارت العدّات سهلة.', 'The best gym start: three full-body sessions with easy-to-learn exercises and moderate weights. Add a little weight whenever the reps feel easy.'),
    level: 'beginner', audience: 'all', daysPerWeek: 3, schedule: [0, 2, 4],
    note: t('خل يوم راحة بين كل جلسة.', 'Leave a rest day between sessions.'),
    days: [
      day('جلسة أ', 'Session A', [x('goblet_squat', 3, '10-12', REST_BEGIN, '2-3'), x('chest_press_machine', 3, '10-12', REST_BEGIN, '2-3'), x('lat_pulldown', 3, '10-12', REST_BEGIN, '2-3'), x('leg_curl_seated', 2, '12', REST_SHORT, '2'), x('lateral_raise', 2, '12-15', REST_SHORT, '2'), x('plank', 3, '30s', REST_SHORT, '—')]),
      day('جلسة ب', 'Session B', [x('leg_press', 3, '10-12', REST_BEGIN, '2-3'), x('bench_db', 3, '10', REST_BEGIN, '2-3'), x('row_cable_seated', 3, '10-12', REST_BEGIN, '2-3'), x('glute_bridge', 3, '12', REST_SHORT, '2'), x('curl_db', 2, '12', REST_SHORT, '2'), x('triceps_pushdown', 2, '12', REST_SHORT, '2')]),
      day('جلسة ج', 'Session C', [x('rdl_db', 3, '10', REST_BEGIN, '2-3'), x('incline_db_press', 3, '10', REST_BEGIN, '2-3'), x('lat_pulldown_close', 3, '10-12', REST_BEGIN, '2-3'), x('walking_lunge', 2, '10+10', REST_SHORT, '2'), x('face_pull', 2, '15', REST_SHORT, '2'), x('dead_bug', 3, '10', REST_SHORT, '—')]),
    ],
  },
  {
    id: 'arq_machines_2d',
    name: t('أول مرة بالنادي: أجهزة يومين', 'First Time in the Gym — Machines, 2 Days'),
    summary: t('برنامج خفيف للأسابيع الأولى على الأجهزة فقط: آمن وسهل، يعوّدك على الحركات قبل الأوزان الحرة.', 'A light program for your first weeks using machines only: safe and simple, building the habit before free weights.'),
    level: 'beginner', audience: 'all', daysPerWeek: 2, schedule: [0, 3],
    days: [
      day('يوم ١', 'Day 1', [x('leg_press', 2, '12', REST_BEGIN, '3'), x('chest_press_machine', 2, '12', REST_BEGIN, '3'), x('lat_pulldown', 2, '12', REST_BEGIN, '3'), x('leg_curl_seated', 2, '12', REST_BEGIN, '3'), x('shoulder_press_machine', 2, '12', REST_BEGIN, '3'), x('plank', 2, '20s', REST_SHORT, '—')]),
      day('يوم ٢', 'Day 2', [x('leg_extension', 2, '12', REST_BEGIN, '3'), x('pec_deck', 2, '12', REST_BEGIN, '3'), x('row_cable_seated', 2, '12', REST_BEGIN, '3'), x('hip_abduction', 2, '15', REST_BEGIN, '3'), x('triceps_pushdown', 2, '12', REST_SHORT, '3'), x('cable_curl', 2, '12', REST_SHORT, '3')]),
    ],
  },
  {
    id: 'arq_upper_lower_4d',
    name: t('علوي / سفلي ٤ أيام', 'Upper / Lower — 4 Days'),
    summary: t('تقسيم متوازن: يومين للجزء العلوي ويومين للسفلي. اليوم الأول من كل نوع للقوة (عدّات أقل)، والثاني للضخامة (عدّات أكثر).', 'A balanced split: two upper and two lower days. The first of each is for strength (fewer reps), the second for size (more reps).'),
    level: 'intermediate', audience: 'all', daysPerWeek: 4, schedule: [0, 1, 3, 4],
    days: [
      day('علوي — قوة', 'Upper — Strength', [x('bench_bb', 4, '6-8', REST_LONG, '1-2'), x('row_bb', 4, '6-8', REST_LONG, '1-2'), x('ohp_standing', 3, '8', REST_LONG, '1-2'), x('lat_pulldown', 3, '10', REST_SHORT, '1'), x('curl_bb', 2, '10', REST_SHORT, '0-1'), x('triceps_pushdown', 2, '10-12', REST_SHORT, '0-1')]),
      day('سفلي — قوة', 'Lower — Strength', [x('back_squat', 4, '6-8', REST_LONG, '1-2'), x('rdl_bb', 3, '8', REST_LONG, '1-2'), x('leg_press', 3, '10-12', REST_SHORT, '1'), x('leg_curl_lying', 3, '10-12', REST_SHORT, '0-1'), x('calf_raise', 4, '10-15', REST_SHORT, '0-1'), x('hanging_knee_raise', 3, '12', REST_SHORT, '—')]),
      day('علوي — ضخامة', 'Upper — Hypertrophy', [x('incline_db_press', 4, '8-10', REST_LONG, '1'), x('pullup', 4, '6-10', REST_LONG, '1'), x('shoulder_press_db_seated', 3, '10', REST_SHORT, '1'), x('row_cable_seated', 3, '10-12', REST_SHORT, '0-1'), x('lateral_raise', 3, '12-15', REST_SHORT, '0-1'), x('curl_hammer', 2, '12', REST_SHORT, '0-1'), x('triceps_overhead_db', 2, '12', REST_SHORT, '0-1')]),
      day('سفلي — ضخامة', 'Lower — Hypertrophy', [x('deadlift', 3, '5', REST_STRENGTH, '1-2'), x('bulgarian_split_squat', 3, '8-10', REST_SHORT, '1'), x('hip_thrust_bb', 3, '10', REST_SHORT, '1'), x('leg_extension', 3, '12-15', REST_SHORT, '0-1'), x('seated_calf_raise', 3, '12-15', REST_SHORT, '0-1'), x('cable_crunch', 3, '12', REST_SHORT, '—')]),
    ],
  },
  {
    id: 'arq_ppl_3d',
    name: t('دفع / سحب / أرجل ٣ أيام', 'Push / Pull / Legs — 3 Days'),
    summary: t('التقسيم المشهور بنسخة مختصرة: يوم للصدر والكتف والتراي، يوم للظهر والباي، ويوم للأرجل.', 'The classic split, compact version: one day for chest, shoulders and triceps, one for back and biceps, one for legs.'),
    level: 'intermediate', audience: 'all', daysPerWeek: 3, schedule: [0, 2, 4],
    days: [
      day('دفع', 'Push', [x('bench_bb', 4, '6-8', REST_LONG, '1-2'), x('shoulder_press_db_seated', 3, '8-10', REST_LONG, '1'), x('incline_db_press', 3, '8-10', REST_SHORT, '1'), x('lateral_raise', 3, '12-15', REST_SHORT, '0-1'), x('triceps_pushdown', 3, '10-12', REST_SHORT, '0-1')]),
      day('سحب', 'Pull', [x('pullup', 3, '6-10', REST_LONG, '1'), x('row_bb', 3, '8-10', REST_LONG, '1'), x('lat_pulldown', 3, '10-12', REST_SHORT, '1'), x('face_pull', 3, '15', REST_SHORT, '0-1'), x('curl_bb', 3, '10', REST_SHORT, '0-1')]),
      day('أرجل', 'Legs', [x('back_squat', 4, '6-8', REST_LONG, '1-2'), x('rdl_bb', 3, '8-10', REST_LONG, '1-2'), x('leg_press', 3, '10-12', REST_SHORT, '1'), x('leg_curl_seated', 3, '10-12', REST_SHORT, '0-1'), x('calf_raise', 4, '12', REST_SHORT, '0-1')]),
    ],
  },
  {
    id: 'arq_ppl_6d',
    name: t('دفع / سحب / أرجل ٦ أيام', 'Push / Pull / Legs — 6 Days'),
    summary: t('للمتقدمين: كل عضلة مرتين بالأسبوع بنسختين مختلفتين من كل يوم. يحتاج نوم وأكل كويس عشان تتعافى.', 'For advanced lifters: every muscle twice a week with two versions of each day. Needs good sleep and nutrition to recover.'),
    level: 'advanced', audience: 'all', daysPerWeek: 6, schedule: [0, 1, 2, 3, 4, 5],
    days: [
      day('دفع أ', 'Push A', [x('bench_bb', 4, '6-8', REST_LONG, '1-2'), x('shoulder_press_db_seated', 3, '8-10', REST_LONG, '1'), x('incline_db_press', 3, '8-10', REST_SHORT, '1'), x('lateral_raise', 3, '12-15', REST_SHORT, '0-1'), x('triceps_pushdown', 3, '10-12', REST_SHORT, '0-1'), x('skull_crusher', 2, '10-12', REST_SHORT, '0-1')]),
      day('سحب أ', 'Pull A', [x('deadlift', 3, '5', REST_STRENGTH, '1-2'), x('pullup', 3, '6-10', REST_LONG, '1'), x('row_bb', 3, '8-10', REST_LONG, '1'), x('face_pull', 3, '15', REST_SHORT, '0-1'), x('curl_bb', 3, '10', REST_SHORT, '0-1'), x('curl_hammer', 2, '12', REST_SHORT, '0-1')]),
      day('أرجل أ', 'Legs A', [x('back_squat', 4, '6-8', REST_LONG, '1-2'), x('rdl_bb', 3, '8-10', REST_LONG, '1-2'), x('leg_press', 3, '10-12', REST_SHORT, '1'), x('leg_curl_seated', 3, '10-12', REST_SHORT, '0-1'), x('calf_raise', 4, '12', REST_SHORT, '0-1'), x('hanging_knee_raise', 3, '12', REST_SHORT, '—')]),
      day('دفع ب', 'Push B', [x('incline_bench_bb', 4, '8', REST_LONG, '1-2'), x('ohp_standing', 3, '8', REST_LONG, '1'), x('db_fly', 3, '12', REST_SHORT, '0-1'), x('lateral_raise_cable', 3, '15', REST_SHORT, '0-1'), x('dips', 3, '8-12', REST_SHORT, '1'), x('triceps_overhead_db', 2, '12', REST_SHORT, '0-1')]),
      day('سحب ب', 'Pull B', [x('lat_pulldown', 4, '8-10', REST_LONG, '1'), x('row_cable_seated', 3, '10', REST_SHORT, '1'), x('t_bar_row', 3, '8-10', REST_SHORT, '1'), x('reverse_pec_deck', 3, '15', REST_SHORT, '0-1'), x('incline_db_curl', 3, '10-12', REST_SHORT, '0-1'), x('cable_curl', 2, '12', REST_SHORT, '0-1')]),
      day('أرجل ب', 'Legs B', [x('front_squat', 3, '8', REST_LONG, '1-2'), x('hip_thrust_bb', 3, '10', REST_SHORT, '1'), x('bulgarian_split_squat', 3, '10', REST_SHORT, '1'), x('leg_extension', 3, '15', REST_SHORT, '0-1'), x('seated_calf_raise', 3, '15', REST_SHORT, '0-1'), x('cable_crunch', 3, '15', REST_SHORT, '—')]),
    ],
  },
  {
    id: 'arq_bro_split_5d',
    name: t('عضلة لكل يوم ٥ أيام', 'Body-Part Split — 5 Days'),
    summary: t('التقسيم الكلاسيكي بالنوادي: صدر، ظهر، أكتاف، أرجل، ذراعين — حجم تمرين عالي لكل عضلة مرة بالأسبوع.', 'The classic gym split: chest, back, shoulders, legs, arms — high volume for each muscle once a week.'),
    level: 'intermediate', audience: 'male', daysPerWeek: 5, schedule: [0, 1, 2, 3, 4],
    days: [
      day('صدر', 'Chest', [x('bench_bb', 4, '8', REST_LONG, '1'), x('incline_db_press', 3, '10', REST_SHORT, '1'), x('chest_press_machine', 3, '10-12', REST_SHORT, '0-1'), x('cable_fly', 3, '12-15', REST_SHORT, '0-1'), x('dips', 2, '10-12', REST_SHORT, '0-1')]),
      day('ظهر', 'Back', [x('pullup', 3, '8', REST_LONG, '1'), x('row_bb', 4, '8', REST_LONG, '1'), x('lat_pulldown', 3, '10', REST_SHORT, '1'), x('row_db_one_arm', 3, '10', REST_SHORT, '0-1'), x('straight_arm_pulldown', 2, '12-15', REST_SHORT, '0-1')]),
      day('أكتاف', 'Shoulders', [x('ohp_standing', 4, '8', REST_LONG, '1'), x('lateral_raise', 4, '12-15', REST_SHORT, '0-1'), x('arnold_press', 3, '10', REST_SHORT, '1'), x('reverse_pec_deck', 3, '15', REST_SHORT, '0-1'), x('upright_row', 2, '12', REST_SHORT, '0-1')]),
      day('أرجل', 'Legs', [x('back_squat', 4, '8', REST_LONG, '1'), x('leg_press', 3, '10-12', REST_SHORT, '1'), x('rdl_bb', 3, '10', REST_LONG, '1'), x('leg_extension', 3, '15', REST_SHORT, '0-1'), x('leg_curl_lying', 3, '12', REST_SHORT, '0-1'), x('calf_raise', 4, '15', REST_SHORT, '0-1')]),
      day('ذراعين', 'Arms', [x('curl_bb', 3, '10', REST_SHORT, '0-1'), x('close_grip_bench', 3, '8-10', REST_LONG, '1'), x('curl_hammer', 3, '12', REST_SHORT, '0-1'), x('skull_crusher', 3, '10-12', REST_SHORT, '0-1'), x('concentration_curl', 2, '12', REST_SHORT, '0'), x('triceps_pushdown', 2, '15', REST_SHORT, '0')]),
    ],
  },
  {
    id: 'arq_arnold_6d',
    name: t('تقسيم أرنولد ٦ أيام', 'Arnold Split — 6 Days'),
    summary: t('صدر وظهر مع بعض، أكتاف وذراعين، ثم أرجل — ويتكرر مرتين بالأسبوع. للمتقدمين فقط.', 'Chest with back, shoulders with arms, then legs — twice a week. Advanced lifters only.'),
    level: 'advanced', audience: 'male', daysPerWeek: 6, schedule: [0, 1, 2, 3, 4, 5],
    days: [
      day('صدر وظهر', 'Chest & Back', [x('bench_bb', 4, '8', REST_LONG, '1'), x('pullup', 4, '8', REST_LONG, '1'), x('incline_db_press', 3, '10', REST_SHORT, '1'), x('row_bb', 3, '10', REST_SHORT, '1'), x('db_fly', 3, '12', REST_SHORT, '0-1'), x('db_pullover', 3, '12', REST_SHORT, '0-1')]),
      day('أكتاف وذراعين', 'Shoulders & Arms', [x('ohp_standing', 4, '8', REST_LONG, '1'), x('curl_bb', 3, '10', REST_SHORT, '0-1'), x('close_grip_bench', 3, '10', REST_SHORT, '1'), x('lateral_raise', 3, '15', REST_SHORT, '0-1'), x('incline_db_curl', 3, '12', REST_SHORT, '0-1'), x('skull_crusher', 3, '12', REST_SHORT, '0-1')]),
      day('أرجل', 'Legs', [x('back_squat', 4, '8', REST_LONG, '1'), x('rdl_bb', 3, '10', REST_LONG, '1'), x('leg_press', 3, '12', REST_SHORT, '1'), x('leg_curl_lying', 3, '12', REST_SHORT, '0-1'), x('calf_raise', 4, '15', REST_SHORT, '0-1'), x('cable_crunch', 3, '15', REST_SHORT, '—')]),
      day('صدر وظهر ٢', 'Chest & Back 2', [x('incline_bench_bb', 4, '8', REST_LONG, '1'), x('t_bar_row', 4, '8-10', REST_LONG, '1'), x('chest_press_machine', 3, '10-12', REST_SHORT, '1'), x('lat_pulldown', 3, '10-12', REST_SHORT, '1'), x('cable_fly', 3, '15', REST_SHORT, '0-1'), x('straight_arm_pulldown', 3, '15', REST_SHORT, '0-1')]),
      day('أكتاف وذراعين ٢', 'Shoulders & Arms 2', [x('arnold_press', 4, '10', REST_LONG, '1'), x('cable_curl', 3, '12', REST_SHORT, '0-1'), x('dips', 3, '10', REST_SHORT, '1'), x('reverse_pec_deck', 3, '15', REST_SHORT, '0-1'), x('curl_hammer', 3, '12', REST_SHORT, '0-1'), x('triceps_kickback', 3, '15', REST_SHORT, '0')]),
      day('أرجل ٢', 'Legs 2', [x('front_squat', 4, '8', REST_LONG, '1'), x('hip_thrust_bb', 3, '10', REST_SHORT, '1'), x('walking_lunge', 3, '12', REST_SHORT, '1'), x('leg_extension', 3, '15', REST_SHORT, '0-1'), x('seated_calf_raise', 4, '15', REST_SHORT, '0-1'), x('hanging_knee_raise', 3, '12', REST_SHORT, '—')]),
    ],
  },
  {
    id: 'arq_strength_5x5',
    name: t('قوة ٥×٥ (٣ أيام)', 'Strength 5×5 — 3 Days'),
    summary: t('برنامج قوة بسيط وفعّال: تمارين مركّبة ثقيلة ٥ مجموعات × ٥ عدّات، وتزيد الوزن شوي كل جلسة. تبدّل بين اليوم أ واليوم ب.', 'A simple, effective strength program: heavy compounds, 5 sets × 5 reps, adding a little weight each session. Alternate between workout A and B.'),
    level: 'beginner', audience: 'all', daysPerWeek: 3, schedule: [0, 2, 4],
    note: t('ابدأ بأوزان أخف مما تتوقع — الفكرة إنك تزيد ٢٫٥ كجم تقريباً كل مرة.', 'Start lighter than you think — the idea is to add about 2.5 kg every session.'),
    days: [
      day('تمرين أ', 'Workout A', [x('back_squat', 5, '5', REST_STRENGTH, '1-2'), x('bench_bb', 5, '5', REST_STRENGTH, '1-2'), x('row_bb', 5, '5', REST_STRENGTH, '1-2')]),
      day('تمرين ب', 'Workout B', [x('back_squat', 5, '5', REST_STRENGTH, '1-2'), x('ohp_standing', 5, '5', REST_STRENGTH, '1-2'), x('deadlift', 1, '5', REST_STRENGTH, '1-2')]),
      day('تمرين أ', 'Workout A', [x('back_squat', 5, '5', REST_STRENGTH, '1-2'), x('bench_bb', 5, '5', REST_STRENGTH, '1-2'), x('row_bb', 5, '5', REST_STRENGTH, '1-2')]),
    ],
  },
  {
    id: 'arq_women_glutes_4d',
    name: t('أرداف وأرجل للنساء ٤ أيام', 'Glutes & Legs for Women — 4 Days'),
    summary: t('تركيز على الأرداف والأرجل ٣ أيام، ويوم للجزء العلوي عشان توازن الجسم. مناسب للمبتدئات والمتوسطات.', 'Three days focused on glutes and legs, plus one upper-body day for balance. Suits beginners and intermediates.'),
    level: 'intermediate', audience: 'female', daysPerWeek: 4, schedule: [0, 1, 3, 4],
    days: [
      day('أرداف وخلفي', 'Glutes & Hamstrings', [x('hip_thrust_bb', 4, '8-12', REST_LONG, '1'), x('rdl_db', 3, '10', REST_LONG, '1'), x('bulgarian_split_squat', 3, '10', REST_SHORT, '1'), x('leg_curl_seated', 3, '12', REST_SHORT, '0-1'), x('hip_abduction', 3, '15-20', REST_SHORT, '0-1'), x('donkey_kick', 2, '15', REST_SHORT, '0')]),
      day('علوي', 'Upper Body', [x('chest_press_machine', 3, '10-12', REST_SHORT, '1'), x('lat_pulldown', 3, '10-12', REST_SHORT, '1'), x('shoulder_press_db_seated', 3, '10', REST_SHORT, '1'), x('row_cable_seated', 3, '12', REST_SHORT, '1'), x('lateral_raise', 2, '15', REST_SHORT, '0-1'), x('triceps_pushdown', 2, '12', REST_SHORT, '0-1')]),
      day('أمامي وأرداف', 'Quads & Glutes', [x('goblet_squat', 4, '10', REST_LONG, '1'), x('leg_press', 3, '12', REST_SHORT, '1'), x('step_up', 3, '10', REST_SHORT, '1'), x('walking_lunge', 2, '12', REST_SHORT, '1'), x('leg_extension', 3, '15', REST_SHORT, '0-1'), x('calf_raise', 3, '15', REST_SHORT, '0-1')]),
      day('أرداف وبطن', 'Glutes & Core', [x('sumo_deadlift', 3, '8', REST_LONG, '1-2'), x('glute_bridge', 3, '15', REST_SHORT, '0-1'), x('single_leg_rdl', 3, '10', REST_SHORT, '1'), x('hip_abduction', 3, '20', REST_SHORT, '0'), x('dead_bug', 3, '10', REST_SHORT, '—'), x('plank', 3, '40s', REST_SHORT, '—')]),
    ],
  },
  {
    id: 'arq_home_3d',
    name: t('البيت: دمبل ووزن الجسم ٣ أيام', 'Home — Dumbbells & Bodyweight, 3 Days'),
    summary: t('ما تقدر تروح النادي؟ جوز دمبل وكرسي يكفون. ثلاث جلسات لكل الجسم.', "Can't make it to the gym? A pair of dumbbells and a chair are enough. Three full-body sessions."),
    level: 'beginner', audience: 'all', daysPerWeek: 3, schedule: [0, 2, 4],
    days: [
      day('بيت أ', 'Home A', [x('goblet_squat', 3, '12', REST_SHORT, '2'), x('push_up', 3, '8-12', REST_SHORT, '1-2'), x('row_db_one_arm', 3, '10-12', REST_SHORT, '1-2'), x('rdl_db', 3, '12', REST_SHORT, '2'), x('shoulder_press_db_seated', 3, '10', REST_SHORT, '1-2'), x('plank', 3, '30-45s', REST_SHORT, '—')]),
      day('بيت ب', 'Home B', [x('step_up', 3, '10', REST_SHORT, '2'), x('knee_push_up', 3, '12-15', REST_SHORT, '1'), x('glute_bridge', 3, '15', REST_SHORT, '1'), x('lateral_raise', 3, '12-15', REST_SHORT, '1'), x('curl_db', 3, '12', REST_SHORT, '1'), x('crunch', 3, '15', REST_SHORT, '—')]),
      day('بيت ج', 'Home C', [x('sumo_squat', 3, '12', REST_SHORT, '2'), x('push_up', 3, '8-12', REST_SHORT, '1-2'), x('single_leg_rdl', 3, '10', REST_SHORT, '2'), x('front_raise', 2, '12', REST_SHORT, '1'), x('triceps_kickback', 3, '12', REST_SHORT, '1'), x('mountain_climber', 3, '30s', REST_SHORT, '—')]),
    ],
  },
  {
    id: 'arq_fat_loss_3d',
    name: t('حرق دهون: دوائر ٣ أيام', 'Fat Loss Circuits — 3 Days'),
    summary: t('سوّ التمارين ورا بعض بدون راحة (دائرة)، وارتاح ١–٢ دقيقة بعد كل دورة. ٣–٤ دورات. يرفع النبض ويحافظ على العضل.', 'Do the exercises back to back (a circuit), resting 1–2 minutes after each round. 3–4 rounds. Raises your heart rate while keeping muscle.'),
    level: 'beginner', audience: 'all', daysPerWeek: 3, schedule: [0, 2, 4],
    note: t('مع أكل بعجز سعرات بسيط (شف حساب السعرات بالوجبات).', 'Pair with a small calorie deficit (see calorie tracking in meals).'),
    days: [
      day('دائرة أ', 'Circuit A', [x('kb_swing', 4, '15', REST_CIRCUIT, '2'), x('goblet_squat', 4, '12', REST_CIRCUIT, '2'), x('push_up', 4, '10', REST_CIRCUIT, '2'), x('row_db_one_arm', 4, '12', REST_CIRCUIT, '2'), x('mountain_climber', 4, '30s', REST_CIRCUIT, '—'), x('jumping_jack', 4, '40s', REST_CIRCUIT, '—')]),
      day('دائرة ب', 'Circuit B', [x('burpee', 4, '10', REST_CIRCUIT, '—'), x('walking_lunge', 4, '12', REST_CIRCUIT, '2'), x('chest_press_machine', 4, '12', REST_CIRCUIT, '2'), x('lat_pulldown', 4, '12', REST_CIRCUIT, '2'), x('high_knees', 4, '30s', REST_CIRCUIT, '—'), x('plank', 4, '40s', REST_CIRCUIT, '—')]),
      day('دائرة ج', 'Circuit C', [x('step_up', 4, '12', REST_CIRCUIT, '2'), x('rdl_db', 4, '12', REST_CIRCUIT, '2'), x('shoulder_press_db_seated', 4, '12', REST_CIRCUIT, '2'), x('row_cable_seated', 4, '12', REST_CIRCUIT, '2'), x('jumping_jack', 4, '45s', REST_CIRCUIT, '—'), x('dead_bug', 4, '12', REST_CIRCUIT, '—')]),
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
