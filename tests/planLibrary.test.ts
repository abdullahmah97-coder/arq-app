// مكتبة التمارين داخل دالة generate-plan لازم تطابق دليل التمارين في التطبيق (الأسماء والمعرّفات)
// التشغيل: npx esbuild@0.25 tests/planLibrary.test.ts --bundle --platform=node --log-level=error --outfile=node_modules/.cache/planLibrary.test.js && node node_modules/.cache/planLibrary.test.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planLibrarySource } from '../scripts/gen-plan-library';
import { EXERCISES, findExercise } from '../src/three/catalog';

const fn = readFileSync('supabase/functions/generate-plan/index.ts', 'utf8');
const a = fn.indexOf('// BEGIN LIBRARY'); const b = fn.indexOf('// END LIBRARY');
const embedded = fn.slice(fn.indexOf('\n', a) + 1, b).trimEnd();
assert.equal(embedded, planLibrarySource(), 'run: node node_modules/.cache/gen-plan-library.js --write (see scripts/gen-plan-library.ts)');
const rows = JSON.parse(`[${embedded.replace(/,\s*$/, '')}]`) as [string, string, string, string, string][];
assert.equal(rows.length, EXERCISES.length);
for (const [id] of rows) assert.ok(findExercise(id)?.id === id, `${id} opens in the app`);
const home = rows.filter((r) => ['body', 'db', 'kb', 'band', 'bar', 'rope'].includes(r[2]));
assert.ok(home.length >= 40, `enough home exercises (${home.length})`);
for (const g of ['legs', 'chest', 'back', 'shoulders', 'arms', 'core']) assert.ok(home.some((r) => r[1] === g), `home has ${g}`);
console.log(`ok - generate-plan library matches the app (${rows.length} exercises, ${home.length} for home)`);
