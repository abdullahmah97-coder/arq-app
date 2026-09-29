import { adState, isoToRiyadhDate, markSeen, parseTarget, targetLink, riyadhDateToIso, riyadhDay, shouldShowAd, validAdLink } from '../src/lib/launchAdsCore.ts';

let failed = 0;
const ok = (c: boolean, label: string) => { console.log(c ? 'ok  ' : 'FAIL', label); if (!c) { failed++; process.exitCode = 1; } };

const today = '2026-09-23';
ok(shouldShowAd('daily', 'a', 'v1', {}, today), 'never seen → show');
ok(!shouldShowAd('daily', 'a', 'v1', { a: { day: today, version: 'v1' } }, today), 'daily: once per day');
ok(shouldShowAd('daily', 'a', 'v1', { a: { day: '2026-09-22', version: 'v1' } }, today), 'daily: next day shows again');
ok(shouldShowAd('every_open', 'a', 'v1', { a: { day: today, version: 'v1' } }, today), 'every open always shows');
ok(!shouldShowAd('once', 'a', 'v1', { a: { day: '2026-01-01', version: 'v1' } }, today), 'once: never again');
ok(shouldShowAd('once', 'a', 'v2', { a: { day: today, version: 'v1' } }, today), 'once: edited ad shows again');

let seen = {};
for (let i = 0; i < 25; i++) seen = markSeen(seen, `ad${i}`, 'v', `2026-09-${String(i + 1).padStart(2, '0')}`);
ok(Object.keys(seen).length === 20 && !('ad0' in seen) && 'ad24' in seen, 'keeps the 20 most recent');

ok(riyadhDay(new Date('2026-09-22T21:30:00Z')) === '2026-09-23', 'Riyadh day rolls over at 21:00 UTC');
ok(riyadhDateToIso('2026-09-23') === '2026-09-22T21:00:00.000Z', 'start of Riyadh day');
ok(riyadhDateToIso('٢٠٢٦-٠٩-٢٣', true) === '2026-09-23T21:00:00.000Z', 'end of day with Arabic digits');
ok(riyadhDateToIso('') === null && riyadhDateToIso('23/09/2026') === undefined && riyadhDateToIso('2026-13-01') === undefined, 'empty and bad dates');
ok(isoToRiyadhDate('2026-09-23T21:00:00.000Z', true) === '2026-09-23' && isoToRiyadhDate('2026-09-22T21:00:00.000Z') === '2026-09-23', 'round trip for the form');

const now = Date.parse('2026-09-23T12:00:00Z');
ok(adState({ active: false, starts_at: null, ends_at: null }, now) === 'off', 'off');
ok(adState({ active: true, starts_at: '2026-09-24T00:00:00Z', ends_at: null }, now) === 'scheduled', 'scheduled');
ok(adState({ active: true, starts_at: null, ends_at: '2026-09-23T11:00:00Z' }, now) === 'ended', 'ended');
ok(adState({ active: true, starts_at: '2026-09-20T00:00:00Z', ends_at: '2026-09-30T00:00:00Z' }, now) === 'live', 'live');

ok(validAdLink('/store') && validAdLink('/clubs/chain/abc?x=1') && validAdLink('https://arq.app/x') && validAdLink(''), 'good links');
ok(!validAdLink('javascript:alert(1)') && !validAdLink('http://x.com') && !validAdLink('store'), 'bad links');

const id = '3f1c2a9e-8b7d-4c21-9a0e-1234567890ab';
for (const k of ['store', 'club', 'coach', 'center'] as const) {
  const l = targetLink(k, id);
  const back = parseTarget(l);
  ok(back.target === k && back.id === id && validAdLink(l), `button link round trip: ${k} → ${l}`);
}
ok(parseTarget('/clubs').target === 'page' && parseTarget('https://x.com/a').target === 'url' && parseTarget('').target === 'none' && parseTarget('/store/not-an-id').target === 'page', 'other button kinds');
if (!failed) console.log('all launch ad checks passed');
