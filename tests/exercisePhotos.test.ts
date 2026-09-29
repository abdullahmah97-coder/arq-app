// صور مكتبة التمارين: كل تمارين أرك الأساسية لها صور، إلا اللي تعتمد على المجسّم فقط
import { ALL_EXERCISES } from '../src/three/catalog';

let failed = 0;
const check = (label: string, cond: boolean, extra = '') => { console.log(cond ? 'ok  ' : 'FAIL', label, extra); if (!cond) { failed++; process.exitCode = 1; } };

// بدون صورة مطابقة في المصدر: تظهر بالمجسّم ثلاثي الأبعاد
const MOTION_ONLY = new Set(['wall_sit', 'knee_push_up', 'jumping_jack', 'high_knees', 'burpee']);
const core = ALL_EXERCISES.filter((e) => !e.library);
const missing = core.filter((e) => !e.photos?.length && !MOTION_ONLY.has(e.id)).map((e) => e.id);
check('every core exercise has photos (or a 3D motion)', missing.length === 0, missing.join(','));
check('motion-only exercises still have a 3D motion', core.filter((e) => MOTION_ONLY.has(e.id)).every((e) => e.motion && e.motion !== 'muscle_map'));

const paths = ALL_EXERCISES.flatMap((e) => e.photos ?? []);
const bad = paths.filter((p) => !/^[A-Za-z0-9_-]+\/[01]\.jpg$/.test(p));
check('photo paths are plain <folder>/<0|1>.jpg', bad.length === 0, bad.slice(0, 5).join(','));
check('no duplicate photos inside one exercise', ALL_EXERCISES.every((e) => new Set(e.photos ?? []).size === (e.photos ?? []).length));

if (!failed) console.log('all exercise photo checks passed');
