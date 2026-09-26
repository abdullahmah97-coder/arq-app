// اختبار المقارنة مع آخر جلسة مماثلة
import { compareSession, e1rm, findLastSimilar, similarity, suggestNext, summarize, type SessionData } from '../src/lib/training/stats';

let fail = 0;
const ok = (c: boolean, m: string) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const S = (id: string, day: number, sets: [string, number, number][], mins = 60): SessionData => ({
  id, started_at: `2026-09-${String(day).padStart(2, '0')}T18:00:00Z`, finished_at: `2026-09-${String(day).padStart(2, '0')}T${18 + Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}:00Z`,
  sets: sets.map(([exercise_id, weight_kg, reps], i) => ({ exercise_id, weight_kg, reps, set_index: i + 1 })),
});

ok(e1rm(100, 1) === 100 && e1rm(100, 10) === 133.3 && e1rm(0, 15) === 15, 'e1RM (Epley) + bodyweight');
const sum = summarize('row_bb', [{ exercise_id: 'row_bb', set_index: 1, reps: 10, weight_kg: 60 }, { exercise_id: 'row_bb', set_index: 2, reps: 8, weight_kg: 62.5 }]);
ok(sum.volume === 1100 && sum.top!.weight_kg === 62.5 && sum.sets === 2, 'summary volume/top set');

const back1 = S('b1', 10, [['row_bb', 60, 10], ['row_bb', 60, 9], ['lat_pulldown', 50, 12], ['upright_row', 30, 12]]);
const legs = S('l1', 12, [['back_squat', 80, 8], ['leg_press', 150, 12]]);
const back2 = S('b2', 17, [['row_bb', 62.5, 10], ['row_bb', 62.5, 10], ['lat_pulldown', 50, 12], ['upright_row', 32.5, 12]], 55);
ok(similarity(['row_bb', 'lat_pulldown'], ['row_bb']) > 0.6 && similarity(['row_bb'], ['back_squat']) === 0, 'similarity by muscles');
ok(findLastSimilar(back2, [back1, legs])?.id === 'b1', 'finds last BACK session, skipping legs');
ok(findLastSimilar(legs, [back1]) === null, 'no similar → null');

const c = compareSession(back2, [back1, legs, back2]);
ok(c.previous?.id === 'b1' && c.rows.length === 3, 'compare rows');
const row = c.rows.find((r) => r.exercise_id === 'row_bb')!;
ok(row.prev!.volume === 1140 && row.now.volume === 1250 && row.volumeDelta === 10, `row volume delta +10% (${row.volumeDelta})`);
ok(row.pr && c.prs >= 2, 'PR detected (heavier row & upright row)');
ok(c.rows.find((r) => r.exercise_id === 'lat_pulldown')!.pr === false, 'equal performance ≠ PR');
ok(c.totals.prev!.minutes === 60 && c.totals.now.minutes === 55, 'durations');
ok(compareSession(back1, [back1]).previous === null && compareSession(back1, [back1]).rows[0].prev === null, 'first session: nothing to compare');

// الاقتراح: كمّلت 10/10 على 8-10 → زِد 2.5؛ ما كمّلت → نفس الوزن
ok(JSON.stringify(suggestNext('row_bb', back2.sets, '8-10')) === JSON.stringify({ weight: 65, reps: 8, increase: true }), 'suggest +2.5 kg');
ok(suggestNext('row_bb', back1.sets, '8-12')!.weight === 60 && !suggestNext('row_bb', back1.sets, '8-12')!.increase, 'suggest same weight');
ok(suggestNext('back_squat', [{ exercise_id: 'back_squat', set_index: 1, reps: 12, weight_kg: 80 }, { exercise_id: 'back_squat', set_index: 2, reps: 12, weight_kg: 80 }], '8-12')!.weight === 85, 'lower body +5 kg');
ok(suggestNext('plank', [], '30') === null, 'no history → null');

console.log(fail ? `\n${fail} FAILED` : '\nALL TRAINING TESTS PASSED');
if (fail) process.exit(1);
