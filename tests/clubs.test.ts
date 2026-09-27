// اختبار حسابات عروض النوادي
import { daysLeft, discountPct, gymsInRange, isStale, monthly, ratingBars } from '../src/lib/clubsMath.ts';
let fail = 0;
const ok = (c: boolean, m: string) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
ok(monthly({ price_sar: 450, months: 3 }) === 150, 'monthly price of 3-month offer');
ok(monthly({ price_sar: 30, months: 0 }) === 900, 'day pass normalized to 30 days');
ok(discountPct({ price_sar: 450, old_price_sar: 600 }) === 25 && discountPct({ price_sar: 100, old_price_sar: null }) === null, 'discount percent');
ok(daysLeft({ ends_on: '2026-09-30' }, new Date('2026-09-27T10:00:00')) === 4 && daysLeft({ ends_on: null }) === null, 'days left');
const b = ratingBars([{ rating: 5 }, { rating: 5 }, { rating: 3 }, { rating: 1 }]);
ok(b[0].stars === 5 && b[0].n === 2 && b[0].pct === 0.5 && b[4].n === 1, 'rating bars');
const N = new Date('2026-09-27T12:00:00');
ok(isStale({ seen_on: '2025-09-13', confidence: 'article' }, N) && !isStale({ seen_on: '2026-09-02', confidence: 'article' }, N) && isStale({ seen_on: null, confidence: 'uncertain' }, N) && !isStale({ seen_on: null, confidence: 'official' }, N), 'stale price detection');
const G = [{ id: 'a', radius_m: 200, distance_m: 150 }, { id: 'b', radius_m: 150, distance_m: 190 }, { id: 'c', radius_m: 150, distance_m: 260 }, { id: 'd', radius_m: 150 }];
ok(gymsInRange(G, 10).map((g) => g.id).join() === 'a', 'in-range gyms with small GPS error');
ok(gymsInRange(G, 80).map((g) => g.id).join() === 'a,b', 'GPS slack capped at 50 m (matches server)');
console.log(fail ? `\n${fail} FAILED` : '\nALL CLUB TESTS PASSED');
if (fail) process.exit(1);
