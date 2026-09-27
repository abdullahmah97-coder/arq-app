// اختبار المقارنة مع آخر جلسة مماثلة
import { applyProgram, PROGRAMS } from '../src/content/programs';
import { generateRulesPlan } from '../src/lib/plan/rules';
import { isWeeklyPlan } from '../src/lib/plan/validate';
import { getExercise } from '../src/three/catalog';
import { liftProgress, muscleSets, pctDelta, weeklySeries, weekStart } from '../src/lib/training/analytics';
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

// البرامج الجاهزة (فل بدي ٤ أيام)
for (const pr of PROGRAMS) {
  ok(pr.days.length === pr.daysPerWeek && pr.schedule.length === pr.daysPerWeek, `${pr.id}: days/schedule`);
  ok(pr.days.every((d) => d.exercises.every((e) => !!getExercise(e.exercise_id))), `${pr.id}: every exercise has a 3D demo`);
  const base = generateRulesPlan({ gender: 'male', goal: 'gain', level: 'intermediate', days_per_week: 3, weight_kg: 80, height_cm: 178, age: 28 });
  const plan = applyProgram(pr, base);
  ok(isWeeklyPlan(plan), `${pr.id}: produces a valid weekly plan`);
  const first = plan.days.find((d) => d.day === pr.schedule[0])!;
  ok(plan.days.filter((d) => !d.rest).length === pr.daysPerWeek && first.exercises.length === pr.days[0].exercises.length && first.exercises[0].rir === pr.days[0].exercises[0].rir,
    `${pr.id}: ${pr.daysPerWeek} training days, first day keeps its exercises and RIR`);
  ok(plan.meals === base.meals && plan.targets === base.targets, `${pr.id}: keeps meals & targets`);
  ok(first.exercises.every((e, i) => { const r = pr.days[0].exercises[i].rest; return e.rest_sec === Math.round(((r[0] + r[1]) / 2) * 60); }), `${pr.id}: rest ranges → seconds`);
}
const total = PROGRAMS[0].days.reduce((a, d) => a + d.exercises.length, 0);
ok(total === 25, `program has 25 exercise slots (${total})`);
ok(PROGRAMS.length >= 12 && new Set(PROGRAMS.map((p) => p.id)).size === PROGRAMS.length, `${PROGRAMS.length} programs with unique ids`);

// --- تحليلات السجل ---
{
  const NOW = Date.parse('2026-09-27T12:00:00Z');
  const at = (daysAgo: number, id: string, sets: [string, number, number][]): SessionData => {
    const st = new Date(NOW - daysAgo * 86400000);
    return { id, started_at: st.toISOString(), finished_at: new Date(st.getTime() + 3600000).toISOString(), sets: sets.map(([exercise_id, weight_kg, reps], i) => ({ exercise_id, weight_kg, reps, set_index: i + 1 })) };
  };
  const H = [
    at(0, 'a', [['row_bb', 70, 8], ['row_bb', 70, 8], ['bench_bb', 80, 6]]),
    at(3, 'b', [['back_squat', 100, 5]]),
    at(8, 'c', [['row_bb', 65, 8], ['bench_bb', 75, 6]]),
    at(40, 'd', [['row_bb', 60, 8], ['bench_bb', 70, 6], ['dips', 0, 12]]),
  ];
  const w = weeklySeries(H, 8, NOW);
  ok(w.length === 8 && w[7].start === weekStart(NOW), 'weekly series ends at current week');
  ok(w.reduce((a, x) => a + x.sessions, 0) === 4 && w[7].sessions + w[6].sessions >= 2, `sessions bucketed (${w.map((x) => x.sessions).join(',')})`);
  ok(w[7].volume + w[6].volume + w[5].volume >= 70 * 16, 'weekly volume summed');
  const m = muscleSets(H, 28, NOW);
  ok(m.back.now === 3 && m.back.prev === 1 && m.chest.now === 2 && m.legs.now === 1, `muscle sets now vs prev (${JSON.stringify(m.back)})`);
  const lp = liftProgress(H, 6, NOW);
  const row = lp.find((x) => x.exercise_id === 'row_bb')!;
  ok(row.sessions === 3 && row.series.length === 3 && row.prevBest! < row.best && row.delta! > 0, `lift progress row (${row.delta}%)`);
  ok(lp[0].sessions >= lp[lp.length - 1].sessions, 'lifts sorted by frequency');
  ok(pctDelta(110, 100) === 10 && pctDelta(5, 0) === null, 'pct delta');
}

console.log(fail ? `\n${fail} FAILED` : '\nALL TRAINING TESTS PASSED');
if (fail) process.exit(1);
