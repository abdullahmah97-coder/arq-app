import { hrStats, isWatch, toKcal, toMeters, toMinutes, weekSummary, workoutKind, type ExternalWorkout } from '../src/lib/health/workouts.ts';

let failed = 0;
const ok = (c: boolean, label: string) => { console.log(c ? 'ok  ' : 'FAIL', label); if (!c) { failed++; process.exitCode = 1; } };

ok(workoutKind(37) === 'running' && workoutKind(50) === 'strength' && workoutKind(63) === 'hiit' && workoutKind(9999) === 'other', 'activity types map');
ok(toKcal({ quantity: 250, unit: 'kcal' }) === 250 && toKcal({ quantity: 418.4, unit: 'kJ' }) === 100 && toKcal(null) === null, 'energy units');
ok(toMeters({ quantity: 5.2, unit: 'km' }) === 5200 && toMeters({ quantity: 1, unit: 'mi' }) === 1609 && toMeters({ quantity: 800, unit: 'm' }) === 800, 'distance units');
ok(toMinutes({ quantity: 1830, unit: 's' }, '', '') === 31 && toMinutes(null, '2026-09-23T10:00:00Z', '2026-09-23T10:45:00Z') === 45, 'duration');
ok(isWatch(undefined, 'Apple Watch') && isWatch('Watch7,3') && !isWatch('iPhone15,2', null), 'watch detection');
const now = Date.parse('2026-09-23T12:00:00Z');
const w = (start: string, minutes: number, kcal: number | null, d: number | null): ExternalWorkout => ({ id: start, kind: 'running', start, end: start, minutes, kcal, distance_m: d, source: 'Workout', from_watch: true });
const s = weekSummary([w('2026-09-22T06:00:00Z', 30, 300, 5000), w('2026-09-20T06:00:00Z', 20, null, null), w('2026-09-10T06:00:00Z', 60, 500, 9000)], now);
ok(s.count === 2 && s.minutes === 50 && s.kcal === 300 && s.distance_m === 5000, 'week summary ignores older workouts');
ok(JSON.stringify(hrStats([120, 130, 140, 0, 300])) === JSON.stringify({ avg: 130, max: 140 }) && hrStats([100]) === null, 'session heart rate');
if (!failed) console.log('all watch checks passed');
