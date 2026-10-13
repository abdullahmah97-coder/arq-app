// يولّد مكتبة التمارين اللي يبني منها المدرب الذكي (دالة coach) تمارينه، من دليل التمارين 3D في التطبيق.
// قبل كانت المكتبة تجي من الجوال وتنقص عند ٨٠٠٠ حرف (آخر ٢٦ تمرين ما يشوفها النموذج)؛ الحين الخادم عنده نسخته.
// التشغيل (من جذر المشروع):
//   npx esbuild@0.25 scripts/gen-coach-library.ts --bundle --platform=node --log-level=error --outfile=node_modules/.cache/gen-coach-library.js
//   node node_modules/.cache/gen-coach-library.js --write     ← يحدّث supabase/functions/coach/library.ts
//   node node_modules/.cache/gen-coach-library.js             ← يطبع الناتج بس
// اختبار tests/coach.test.ts (npm test) يتأكد إن الملف مطابق للدليل.
import { writeFileSync } from 'node:fs';
import { EXERCISES, exerciseEquipment, exerciseMuscles } from '../src/three/catalog';

/** نفس سطر التطبيق (src/lib/coach/index.ts): المعرّف | الاسم | العضلات الأساسية | الأدوات */
export function coachLibraryLines(): string[] {
  return EXERCISES.map((e) => `${e.id} | ${e.name.en} | ${exerciseMuscles(e).primary.join(',')} | ${exerciseEquipment(e)}`);
}

export const COACH_LIBRARY_FILE = 'supabase/functions/coach/library.ts';

export function coachLibrarySource(): string {
  return [
    '// مكتبة التمارين للمدرب الذكي (دالة coach): المعرّف | الاسم | العضلات الأساسية | الأدوات — من دليل التمارين في التطبيق.',
    '// ملف مولَّد، لا تعدّله بيدك: scripts/gen-coach-library.ts (واختبار tests/coach.test.ts يتأكد إنه مطابق للدليل).',
    'export const COACH_LIBRARY: readonly string[] = [',
    ...coachLibraryLines().map((l) => `  ${JSON.stringify(l)},`),
    '];',
    '',
  ].join('\n');
}

if (process.argv[1]?.includes('gen-coach-library')) {
  const src = coachLibrarySource();
  if (process.argv.includes('--write')) {
    writeFileSync(COACH_LIBRARY_FILE, src);
    console.log(`wrote ${coachLibraryLines().length} exercises to ${COACH_LIBRARY_FILE}`);
  } else {
    console.log(src);
  }
}
