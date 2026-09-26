// اختبارات الرتب والتحقق من البرامج (تطابق rank_level/can_publish في القاعدة)
import { canPublish, rankLevel, rankProgress, RANKS, validateProgram } from '../src/lib/ranks.ts';

let fail = 0;
const check = (label: string, cond: boolean, extra = '') => { console.log(cond ? 'ok  ' : 'FAIL', label, extra); if (!cond) fail++; };

check('levels match SQL thresholds', [0, 149, 150, 499, 500, 1199, 1200, 2499, 2500, 99999].map(rankLevel).join() === '0,0,1,1,2,2,3,3,4,4');
check('ranks ordered', RANKS.every((r, i) => r.level === i && (i === 0 || r.min > RANKS[i - 1].min)));
const p = rankProgress(300);
check('progress to next', p.cur.id === 'committed' && p.next?.id === 'advanced' && p.remaining === 200 && Math.abs(p.pct - 150 / 350) < 1e-9);
check('max rank progress', rankProgress(5000).next === null && rankProgress(5000).pct === 1);
check('tip gate', !canPublish('tip', { points: 499 }) && canPublish('tip', { points: 500 }));
check('program gate', !canPublish('program', { points: 1199 }) && canPublish('program', { points: 1200 }));
check('coach bypass', canPublish('program', { points: 0, is_coach: true }));
const ex = { exercise_id: 'bench_bb', sets: 3, reps: '8-12', rest_sec: 90 };
check('valid program', validateProgram({ title: 'علوي سفلي', days: [{ title: 'اليوم 1', exercises: [ex] }] }) === null);
check('short title', validateProgram({ title: 'ab', days: [{ title: 'd', exercises: [ex] }] }) === 'title');
check('empty day', validateProgram({ title: 'abc', days: [{ title: 'd', exercises: [] }] }) === 'dayEmpty');
check('bad reps', validateProgram({ title: 'abc', days: [{ title: 'd', exercises: [{ ...ex, reps: 'كثير' }] }] }) === 'reps');
check('8 days rejected', validateProgram({ title: 'abc', days: Array(8).fill({ title: 'd', exercises: [ex] }) }) === 'days');
console.log(fail ? `\n${fail} FAILED` : '\nALL RANK TESTS PASSED');
if (fail) process.exit(1);
