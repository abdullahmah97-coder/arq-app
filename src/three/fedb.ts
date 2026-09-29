// المكتبة الموسّعة: ٧٢٥ تمرين من Free Exercise DB (ملكية عامة) مترجمة للعربي، مع صورتين لكل تمرين (بداية ونهاية الحركة)
// الصور مرفوعة في حاوية exercises بمسار <المعرف>/<رقم>.jpg، وتمارين أرك الأصلية المطابقة تاخذ صورها من نفس المصدر
import type { I18nText } from '../lib/types';
import raw from './fedb.json';
import type { Muscle } from './rig';

export type LibCategory = 'strength' | 'stretching' | 'plyometrics' | 'powerlifting' | 'olympic' | 'strongman' | 'cardio';
export type LibEquipment = 'barbell' | 'dumbbell' | 'cable' | 'machine' | 'kettlebell' | 'bands' | 'medicine_ball' | 'exercise_ball'
  | 'foam_roll' | 'ez_bar' | 'bodyweight' | 'other';
export const LIB_CATEGORIES: LibCategory[] = ['strength', 'stretching', 'cardio', 'plyometrics', 'powerlifting', 'olympic', 'strongman'];
export const LIB_EQUIPMENT: LibEquipment[] = ['bodyweight', 'dumbbell', 'barbell', 'machine', 'cable', 'kettlebell', 'bands', 'ez_bar',
  'medicine_ball', 'exercise_ball', 'foam_roll', 'other'];
export const LIB_LEVELS = ['beginner', 'intermediate', 'expert'] as const;
export type LibLevel = (typeof LIB_LEVELS)[number];

interface RawItem {
  i: string; n: [string, string]; p: string[]; s: string[]; e: string; c: string; l: number; f: string; g: number; st: [string, string][];
}
const data = raw as unknown as { items: RawItem[]; curatedPhotos: Record<string, [string, number]> };

const t = (ar: string, en: string): I18nText => ({ ar, en });
const BREATH: Record<string, I18nText> = {
  push: t('أخرج النفس وأنت تدفع، وخذ نفس وأنت ترجع ببطء.', 'Exhale as you push, inhale as you return slowly.'),
  pull: t('أخرج النفس وأنت تسحب، وخذ نفس وأنت ترجع ببطء.', 'Exhale as you pull, inhale as you return slowly.'),
  static: t('شد البطن وتنفس بهدوء بدون ما تحبس نفسك.', 'Brace your core and breathe steadily without holding your breath.'),
  stretch: t('تنفس بهدوء وعمق، ومع كل زفير خل العضلة ترتخي أكثر.', 'Breathe slowly and deeply; relax a little further with each exhale.'),
  rhythm: t('تنفس بإيقاع منتظم مع الحركة.', 'Keep a steady breathing rhythm with the movement.'),
};

const photoPaths = (id: string, n: number) => Array.from({ length: Math.min(n, 2) }, (_, k) => `${id}/${k}.jpg`);

/** شكل موحّد يطابق ExerciseGuide (بدون استيراد دائري) */
export interface LibExercise {
  id: string; motion: 'muscle_map'; name: I18nText; aliases: string[]; steps: I18nText[]; mistakes: I18nText[]; breathing: I18nText;
  library: true; primary: Muscle[]; secondary: Muscle[]; equipment: string;
  source: 'fedb'; photos: string[]; category: LibCategory; equip: LibEquipment; level: LibLevel;
}

export const FEDB_EXERCISES: LibExercise[] = data.items.map((r) => ({
  id: `x_${r.i}`,
  motion: 'muscle_map',
  name: t(r.n[0], r.n[1]),
  aliases: [r.n[1]],
  steps: r.st.map(([ar, en]) => t(ar, en || ar)),
  mistakes: [],
  breathing: r.c === 'stretching' ? BREATH.stretch : r.c === 'cardio' || r.c === 'plyometrics' ? BREATH.rhythm : BREATH[r.f] ?? BREATH.static,
  library: true,
  primary: r.p as Muscle[],
  secondary: r.s as Muscle[],
  equipment: r.e === 'bodyweight' ? 'bodyweight' : r.e.replace('_', ' '),
  source: 'fedb',
  photos: photoPaths(r.i, r.g),
  category: r.c as LibCategory,
  equip: r.e as LibEquipment,
  level: LIB_LEVELS[r.l] ?? 'beginner',
}));

/** صور تمارين أرك الأصلية من نفس المصدر: المعرف ← مسارات الصور */
export const CURATED_PHOTOS: Record<string, string[]> = Object.fromEntries(
  Object.entries(data.curatedPhotos).map(([id, [fid, n]]) => [id, photoPaths(fid, n)]),
);

/** تمارين أرك الأساسية اللي ما تطابق اسمها تلقائياً مع المصدر: نربطها يدوياً بصور نفس الحركة
 * (كل مجلد في الحاوية فيه صورتين). اللي ما لها صورة مطابقة (مثل البيربي وجلسة الحائط) تبقى بالمجسّم */
const MANUAL_PHOTOS: Record<string, string> = {
  split_squat: 'Split_Squats',
  walking_lunge: 'Dumbbell_Lunges',
  bulgarian_split_squat: 'Split_Squat_with_Dumbbells',
  reverse_lunge: 'Dumbbell_Rear_Lunge',
  rdl_db: 'Stiff-Legged_Dumbbell_Deadlift',
  single_leg_rdl: 'Kettlebell_One-Legged_Deadlift',
  hip_thrust_db: 'Barbell_Hip_Thrust',
  kb_swing: 'One-Arm_Kettlebell_Swings',
  pec_deck: 'Butterfly',
  reverse_pec_deck: 'Reverse_Machine_Flyes',
  db_pullover: 'Bent-Arm_Dumbbell_Pullover',
  lateral_raise_cable: 'Standing_Low-Pulley_Deltoid_Raise',
  rear_delt_raise: 'Seated_Bent-Over_Rear_Delt_Raise',
  front_raise: 'Front_Dumbbell_Raise',
  barbell_shrug: 'Barbell_Shrug',
  cable_curl: 'Standing_Biceps_Cable_Curl',
  preacher_curl: 'Preacher_Curl',
  hanging_knee_raise: 'Hanging_Leg_Raise',
  lying_leg_raise: 'Flat_Bench_Lying_Leg_Raise',
};
for (const [id, fid] of Object.entries(MANUAL_PHOTOS)) CURATED_PHOTOS[id] ??= photoPaths(fid, 2);
