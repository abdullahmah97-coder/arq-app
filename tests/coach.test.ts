// اختبار المدرب المحلي: node (عبر esbuild) — يتأكد أن كل الطلبات الشائعة تعطي رداً صحيحاً
import { localCoach } from '../src/lib/coach/local';
import { getExercise } from '../src/three/catalog';
import { MOTIONS } from '../src/three/motions';
import type { CoachContext } from '../src/lib/coach/types';

let fail = 0;
const ok = (c: boolean, m: string) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const ar: CoachContext = { lang: 'ar', goal: 'lose', level: 'intermediate', zone: 'green', protein_g: 172, calories: 2250 };
const en: CoachContext = { ...ar, lang: 'en' };
const valid = (ids: string[]) => ids.every((id) => !!getExercise(id));

const chest = localCoach('عطني تمرين صدر ٣٠ دقيقة', ar);
ok(!!chest.workout && chest.workout.minutes === 30 && valid(chest.workout.exercises.map((e) => e.exercise_id)), 'chest 30 min (arabic digits)');
ok(!!chest.workout && MOTIONS[chest.workout.exercises[0].exercise_id as keyof typeof MOTIONS].primary.includes('chest'), 'chest workout starts with a chest exercise');
ok(chest.workout!.exercises.length >= 3 && chest.workout!.exercises.length <= 5, `count fits time (${chest.workout!.exercises.length})`);

const home = localCoach('تمرين بالبيت بدون أدوات', ar);
const HOME = new Set(['split_squat', 'glute_bridge', 'plank', 'walking_lunge', 'bulgarian_split_squat', 'calf_raise',
  'push_up', 'knee_push_up', 'air_squat', 'reverse_lunge', 'donkey_kick', 'superman', 'crunch', 'lying_leg_raise', 'mountain_climber', 'dead_bug',
  'jumping_jack', 'high_knees', 'burpee', 'wall_sit']);
ok(!!home.workout && home.workout.exercises.every((e) => HOME.has(e.exercise_id)), 'home = no-equipment only');

const legsEn = localCoach('45 min legs and glutes with dumbbells', en);
ok(!!legsEn.workout && legsEn.workout.minutes === 45 && legsEn.workout.exercises.every((e) => MOTIONS[e.exercise_id as keyof typeof MOTIONS].props.every((p) => ['dumbbells', 'goblet', 'hammerDumbbells', 'dumbbellR', 'mat', 'bench', 'benchBehind', 'benchSideRow', 'inclineBench', 'seatBack'].includes(p.kind))), 'english legs+glutes with dumbbells');
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

console.log(fail ? `\n${fail} FAILED` : '\nALL COACH TESTS PASSED');
if (fail) process.exit(1);
