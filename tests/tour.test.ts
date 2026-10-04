// اختبار جولة التعريف: الخطوات حسب الأجزاء المخفية، حالة الجولة، اتجاه السحب، واكتمال النصوص بالعربي والإنجليزي
import ar from '../src/locales/ar.json';
import en from '../src/locales/en.json';
import { parseTourState, swipeStep, TOUR_STEPS, tourKey, tourSteps, type TourVariant } from '../src/lib/tourCore.ts';
let fail = 0;
const ok = (c: boolean, m: string) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const ids = (v: TourVariant, hidden: string[] = []) => tourSteps(v, new Set(hidden)).map((s) => s.id).join(',');

ok(ids('trainee') === 'welcome,home,plan,coach,social,more', 'trainee tour has six steps in order');
ok(ids('partner') === 'welcome,join,review,trial,switch', 'partner tour has five steps in order');
ok(ids('trainee', ['tab.plan']) === 'welcome,home,coach,social,more', 'hidden plan tab drops the plan step');
ok(ids('trainee', ['tab.ai']) === 'welcome,home,plan,social,more', 'hidden AI button drops the coach step');
ok(ids('trainee', ['tab.community', 'tab.compete']) === 'welcome,home,plan,coach,more', 'both social tabs hidden drops the social step');
const social = tourSteps('trainee', new Set(['tab.compete'])).find((s) => s.id === 'social');
ok(!!social && social.tabs?.join() === 'community', 'one social tab hidden keeps the step but only highlights the visible tab');
ok(tourSteps('trainee', new Set(['tab.index'])).find((s) => s.id === 'home')?.tabs?.join() === 'index', 'home is never hidden');
ok(TOUR_STEPS.trainee.length === 6 && tourSteps('trainee', new Set()) !== TOUR_STEPS.trainee, 'filtering returns a new list and keeps the source intact');

ok(tourKey('u1') === 'arq.tour.v1:u1', 'state is stored per account');
ok(parseTourState('pending') === 'pending' && parseTourState('done') === 'done', 'known states parse');
ok(parseTourState(null) === null && parseTourState('yes') === null && parseTourState(undefined) === null, 'unknown or missing state is ignored');

ok(swipeStep(-60, false) === 1 && swipeStep(60, false) === -1, 'English: swipe left goes forward');
ok(swipeStep(60, true) === 1 && swipeStep(-60, true) === -1, 'Arabic: swipe right goes forward');
ok(swipeStep(20, true) === 0 && swipeStep(-47, false) === 0 && swipeStep(Number.NaN, true) === 0, 'short or broken swipes do nothing');

type Dict = Record<string, unknown>;
const get = (d: Dict, path: string): unknown => path.split('.').reduce<unknown>((x, k) => (x && typeof x === 'object' ? (x as Dict)[k] : undefined), d);
for (const [name, loc] of [['ar', ar], ['en', en]] as const) {
  const missing: string[] = [];
  const tooLong: string[] = [];
  for (const v of ['trainee', 'partner'] as const) {
    for (const s of TOUR_STEPS[v]) {
      for (const k of ['title', 'body']) {
        const val = get(loc as Dict, `tour.${v}.${s.id}.${k}`);
        if (typeof val !== 'string' || !val.trim()) missing.push(`${v}.${s.id}.${k}`);
        else if (val.length > (k === 'title' ? 40 : 200)) tooLong.push(`${v}.${s.id}.${k} (${val.length})`);
      }
    }
  }
  for (const k of ['tour.replay', 'tour.start', 'tour.hint', 'tour.traineeTour', 'onboarding.stepOf', 'ads.skip', 'common.next', 'common.back']) {
    if (typeof get(loc as Dict, k) !== 'string') missing.push(k);
  }
  ok(!missing.length, `${name}: every tour text exists${missing.length ? ` (missing ${missing.join(', ')})` : ''}`);
  ok(!tooLong.length, `${name}: tour texts fit a small phone${tooLong.length ? ` (${tooLong.join(', ')})` : ''}`);
}
if (fail) process.exit(1);
