// اختبار المدرب المحلي: node (عبر esbuild) — يتأكد أن كل الطلبات الشائعة تعطي رداً صحيحاً
import { buildWorkout, localCoach } from '../src/lib/coach/local';
import { EXERCISES, exerciseMuscles, findExercise, getExercise } from '../src/three/catalog';
import { MOTIONS } from '../src/three/motions';
import type { CoachContext } from '../src/lib/coach/types';

let fail = 0;
const ok = (c: boolean, m: string) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const ar: CoachContext = { lang: 'ar', goal: 'lose', level: 'intermediate', zone: 'green', protein_g: 172, calories: 2250 };
const en: CoachContext = { ...ar, lang: 'en' };
const valid = (ids: string[]) => ids.every((id) => !!getExercise(id));
/** حركة التمرين عبر الكتالوج (بعض التمارين تشارك حركة غيرها) */
const mo = (id: string) => MOTIONS[(getExercise(id)?.motion ?? id) as keyof typeof MOTIONS];

const chest = localCoach('عطني تمرين صدر ٣٠ دقيقة', ar);
ok(!!chest.workout && chest.workout.minutes === 30 && valid(chest.workout.exercises.map((e) => e.exercise_id)), 'chest 30 min (arabic digits)');
ok(!!chest.workout && mo(chest.workout.exercises[0].exercise_id).primary.includes('chest'), 'chest workout starts with a chest exercise');
ok(chest.workout!.exercises.length >= 3 && chest.workout!.exercises.length <= 5, `count fits time (${chest.workout!.exercises.length})`);

const home = localCoach('تمرين بالبيت بدون أدوات', ar);
const HOME = new Set(['split_squat', 'glute_bridge', 'plank', 'walking_lunge', 'bulgarian_split_squat', 'calf_raise',
  'push_up', 'knee_push_up', 'air_squat', 'reverse_lunge', 'donkey_kick', 'superman', 'crunch', 'lying_leg_raise', 'mountain_climber', 'dead_bug',
  'jumping_jack', 'high_knees', 'burpee', 'wall_sit',
  'diamond_push_up', 'wide_push_up', 'single_leg_bridge', 'side_plank', 'bicycle_crunch', 'reverse_crunch', 'sit_up', 'v_up', 'flutter_kicks', 'jump_squat']);
ok(!!home.workout && home.workout.exercises.every((e) => HOME.has(e.exercise_id)), 'home = no-equipment only');

const legsEn = localCoach('45 min legs and glutes with dumbbells', en);
ok(!!legsEn.workout && legsEn.workout.minutes === 45 && legsEn.workout.exercises.every((e) => mo(e.exercise_id).props.every((p) => ['dumbbells', 'goblet', 'hammerDumbbells', 'dumbbellR', 'mat', 'bench', 'benchBehind', 'benchSideRow', 'inclineBench', 'seatBack'].includes(p.kind))), 'english legs+glutes with dumbbells');
ok(legsEn.text.includes('Legs'), 'english reply');

const red = localCoach('تمرين ظهر', { ...ar, zone: 'red' });
ok(!!red.workout && red.workout.exercises.every((e) => e.sets === 2) && !!red.workout.note, 'red recovery → lighter');

const how = localCoach('كيف أسوي سكوات صح؟', ar);
ok(how.open?.kind === 'exercise', `how-to opens 3D exercise (${JSON.stringify(how.open)})`);
const howEn = localCoach('how to deadlift', en);
ok(howEn.open?.kind === 'exercise' && (howEn.open as any).id === 'deadlift', 'how to deadlift');

ok(localCoach('وش نومي أمس؟', ar).open?.kind === 'screen', 'sleep → health screen');
ok((localCoach('افتح تقرير InBody', ar).open as any)?.route === 'inbody', 'inbody screen');
ok((localCoach('ابي اتحدى اصدقائي', ar).open as any)?.route === 'challenge_new', 'challenge screen');
ok(localCoach('وجبة بعد التمرين', ar).text.includes('43'), 'meal uses protein target (172/4)');

const today = localCoach('وش أتمرن اليوم حسب جاهزيتي؟', { ...ar, zone: 'yellow', today: { focus: 'صدر وتراي', rest: false, exercises: [
  { name: 'Barbell Bench Press', sets: 4, reps: '8', exercise_id: 'bench_bb' }, { name: 'Dips', sets: 3, reps: '10' }, { name: 'Cable Fly', sets: 3, reps: '12' }] } });
ok(!!today.workout && today.workout.exercises.length === 3 && today.workout.exercises[2].sets === 2 && today.workout.exercises[0].sets === 4, 'today from plan, adapted (yellow)');
ok(localCoach('وش أتمرن اليوم', { ...ar, today: { focus: '-', rest: true, exercises: [] } }).text.includes('راحة'), 'rest day');
ok((localCoach('مرحبا', ar).chips?.length ?? 0) >= 3, 'unknown → help + chips');

// كل أيام الشهر × كل المجموعات × كل الأدوات: ما ينهار وكل التمارين موجودة في الكتالوج
let crash = '';
for (let seed = 1; seed <= 31 && !crash; seed++) {
  for (const g of ['chest', 'back', 'legs', 'glutes', 'shoulders', 'arms', 'core'] as const) {
    for (const eq of ['gym', 'dumbbells', 'none'] as const) {
      try {
        const w = buildWorkout(ar, [g], 45, eq, seed);
        if (!valid(w.exercises.map((e) => e.exercise_id))) crash = `invalid id ${g}/${eq}/${seed}`;
      } catch (e) { crash = `${g}/${eq}/${seed}: ${(e as Error).message}`; }
    }
  }
}
ok(!crash, `workouts for every seed/group/equipment ${crash}`);

// الكتالوج: كل تمرين له حركة وعضلات وشرح بالعربي والإنجليزي
const bad = EXERCISES.filter((e) => !MOTIONS[e.motion] || !exerciseMuscles(e).primary.length || e.steps.length < 2 || !e.mistakes.length
  || ![e.name, e.breathing, ...e.steps, ...e.mistakes].every((x) => x.ar.trim() && x.en.trim())
  || (e.library ? e.motion !== 'muscle_map' : e.motion === 'muscle_map'));
ok(!bad.length, `catalog entries complete (${bad.map((e) => e.id).join(',')})`);
ok(new Set(EXERCISES.map((e) => e.id)).size === EXERCISES.length, `unique ids (${EXERCISES.length} exercises)`);

// تمارين المكتبة (خريطة عضلات فقط) ما يختارها المدرب المحلي تلقائياً
let libPicked = '';
for (let seed = 1; seed <= 31; seed++) for (const g of ['chest', 'back', 'legs', 'glutes', 'shoulders', 'arms', 'core'] as const) {
  for (const id of buildWorkout(ar, [g], 60, 'gym', seed).exercises.map((e) => e.exercise_id)) if (getExercise(id)?.library) libPicked = id;
}
ok(!libPicked, `library exercises not auto-picked ${libPicked}`);
// الأساسي يبقى أول تمرين (التمارين الإضافية ما تزاحمه)
ok(buildWorkout(ar, ['shoulders'], 30, 'gym', 1).exercises[0].exercise_id !== 'push_press', 'shoulders still start with a core lift');

// أسماء إنجليزية من خطط الذكاء الاصطناعي → التمرين الصحيح
const names: [string, string][] = [
  ['Decline Bench Press', 'decline_bench_bb'], ['Russian Twist', 'russian_twist'], ['Barbell Shrug', 'barbell_shrug'], ['Hyperextensions', 'hyperextension'],
  ['Tricep Cable Kickback', 'triceps_kickback'], ['Reverse Wrist Curl', 'reverse_wrist_curl'], ['Side Plank', 'side_plank'], ['Plank', 'plank'],
  ['Push Up', 'push_up'], ['Crunches', 'crunch'], ['Sit-Ups', 'sit_up'], ['Leg Press', 'leg_press'], ['Seated Cable Row', 'row_cable_seated'],
  ['Barbell Row', 'row_bb'], ['Squat', 'back_squat'], ['Incline Push-Ups', 'incline_push_up'], ['Box Jumps', 'box_jump'], ['Treadmill', 'treadmill_run'],
  ['Hanging Leg Raises', 'hanging_leg_raise'], ['Hanging Knee Raise', 'hanging_knee_raise'], ['Smith Machine Squat', 'smith_squat'], ['Preacher Curl', 'preacher_curl'],
  ['Superman', 'superman'], ['Lat Pulldown', 'lat_pulldown'], ['Dumbbell Bent Over Row', 'row_db_bent'], ['Face Pull', 'face_pull'], ['Glute Kickback', 'donkey_kick'],
];
for (const [n, id] of names) ok(findExercise(n)?.id === id, `name "${n}" → ${id} (got ${findExercise(n)?.id})`);

console.log(fail ? `\n${fail} FAILED` : '\nALL COACH TESTS PASSED');
if (fail) process.exit(1);
