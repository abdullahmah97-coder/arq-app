// يولّد مكتبة التمارين اللي يختار منها الذكاء الاصطناعي في دالة generate-plan (من دليل التمارين 3D في التطبيق)
// التشغيل (من جذر المشروع):
//   npx esbuild@0.25 scripts/gen-plan-library.ts --bundle --platform=node --log-level=error --outfile=node_modules/.cache/gen-plan-library.js
//   node node_modules/.cache/gen-plan-library.js --write     ← يحدّث الدالة
//   node node_modules/.cache/gen-plan-library.js             ← يطبع الناتج بس
// اختبار tests/planLibrary.test.ts يتأكد إن الدالة مطابقة للدليل.
import { readFileSync, writeFileSync } from 'node:fs';
import { EXERCISES, categoryOf, equipOf, exerciseMuscles } from '../src/three/catalog';
import { GROUP_OF } from '../src/lib/training/analytics';

/** أدوات مختصرة للذكاء الاصطناعي. البيت: body/db/kb/band/bar/rope بس */
const EQUIP_OVERRIDE: Record<string, string> = {
  hack_squat: 'machine', reverse_pec_deck: 'machine', hyperextension: 'machine', glute_ham_raise: 'machine', assisted_pullup: 'machine',
  dips: 'dip', pullup: 'bar', chin_up: 'bar', hanging_knee_raise: 'bar', hanging_leg_raise: 'bar', box_jump: 'box',
  jump_rope: 'rope', battle_ropes: 'ropes', rowing_machine: 'machine', treadmill_run: 'machine', stationary_bike: 'machine', stair_climber: 'machine',
};
const EQUIP_SHORT: Record<string, string> = {
  bodyweight: 'body', dumbbell: 'db', barbell: 'bb', ez_bar: 'bb', kettlebell: 'kb', cable: 'cable', machine: 'machine',
  bands: 'band', medicine_ball: 'ball', other: 'other',
};

export function planLibraryRows(): [string, string, string, string, string][] {
  return EXERCISES.map((e) => {
    const cat = categoryOf(e);
    const prim = exerciseMuscles(e).primary;
    const group = cat === 'cardio' || cat === 'plyometrics' ? 'cardio' : GROUP_OF[prim[0]] ?? 'core';
    const equip = EQUIP_OVERRIDE[e.id] ?? EQUIP_SHORT[equipOf(e)] ?? 'other';
    return [e.id, group, equip, e.name.ar, e.name.en];
  });
}

export function planLibrarySource(): string {
  return planLibraryRows().map((r) => `  ${JSON.stringify(r)},`).join('\n');
}

const FILE = 'supabase/functions/generate-plan/index.ts';
const BEGIN = '  // BEGIN LIBRARY (scripts/gen-plan-library.ts)';
const END = '  // END LIBRARY';

if (process.argv[1]?.includes('gen-plan-library')) {
  const src = planLibrarySource();
  if (process.argv.includes('--write')) {
    const f = readFileSync(FILE, 'utf8');
    const a = f.indexOf(BEGIN); const b = f.indexOf(END);
    if (a < 0 || b < a) throw new Error('markers not found in ' + FILE);
    writeFileSync(FILE, f.slice(0, a + BEGIN.length) + '\n' + src + '\n' + f.slice(b));
    console.log(`wrote ${planLibraryRows().length} exercises to ${FILE}`);
  } else {
    console.log(src);
  }
}
