// اختبار وكلاء مكتب أرك أب (المنطق البحت): قراءة اقتراحات الوكلاء المحفوظة، قواعد نص التنبيه وحدود الذكاء،
// التحقق من موافقتك قبل التنفيذ، نتيجة التشغيل ورموز الأخطاء، وكل نص تستخدمه شاشة المكتب وورقة المهمة بالعربي والإنجليزي
// يشتغل مع اختبار النوادي (npm run test:clubs) أو لحاله: node --experimental-strip-types tests/officeAgents.test.ts
import { readFileSync } from 'node:fs';
import {
  AGENT_DESKS, AGENT_FAIL_REASONS, AGENT_KINDS, AGENT_STALE_MS, agentStale, approveSteps, asAgentRow, clampLimits, CONFIDENCES, draftFrom, failReason, hasAgent,
  isOpenAgent, isWorking, limitsChanged, mergeAgentRows, NUDGE_PLACEHOLDERS, OFFICE_ERRORS, officeErrorCode, parseBi, parseBrief, parseLimits, parseNudge,
  parsePartner, parseProposal, parseRunResult, parseTriage, prepareFinal, RECORD_RETRY_MS, REPORT_FINAL_STATUSES, runErrorCode, runLine, SEVERITIES,
  validNudgeText, type ApproveSteps, type Prepared,
} from '../src/lib/officeAgentsCore.ts';
import { DESKS } from '../src/lib/officeCore.ts';

let fail = 0;
const ok = (c: boolean, m: string) => { if (!c) { fail++; process.exitCode = 1; console.log('FAIL', m); } else console.log('ok  ', m); };

// ---------- المكاتب ----------
ok(AGENT_DESKS.length === 8 && !AGENT_DESKS.includes('users') && DESKS.every((d) => hasAgent(d.id) === (d.id !== 'users')), 'every desk except trainees has an agent');
ok(isOpenAgent('waiting_approval') && isOpenAgent('in_progress') && isOpenAgent('scheduled') && !isOpenAgent('done') && !isOpenAgent('failed'), 'open statuses');
ok(isWorking('in_progress') && isWorking('scheduled') && !isWorking('waiting_approval'), 'working statuses');

// ---------- صفوف office_tasks ----------
const row = asAgentRow({
  id: 'a1', desk: 'reports', kind: 'triage_report', target_kind: 'report', target_id: 'r1', title: '  Crash  ', status: 'waiting_approval',
  input: { locale: 'en' }, output: { x: 1 }, error: null, model: 'claude-opus-5-5', decision: null, decision_note: '', final: null,
  created_at: '2026-10-07T10:00:00Z', updated_at: null, finished_at: '2026-10-07T10:01:00Z', decided_at: null,
});
ok(!!row && row.title === 'Crash' && row.updated_at === row.created_at && row.decision_note === null && row.input.locale === 'en', 'a stored row is read with safe defaults');
ok(asAgentRow({ ...row, kind: 'write_ad' }) === null && asAgentRow({ ...row, desk: 'finance' }) === null && asAgentRow({ ...row, status: 'paused' }) === null && asAgentRow(null) === null,
  'rows of unknown kind, desk or status are dropped');
const odd = asAgentRow({ ...row, input: 'x', output: [1], target_kind: 'planet' });
ok(!!odd && Object.keys(odd.input).length === 0 && odd.output === null && odd.target_kind === null, 'bad input/output/target shapes become empty');

// ---------- تحميل المهام: كل المفتوحة + آخر المنتهية (طلبين يندمجون) ----------
const raw = (id: string, status: string, created: string, updated = created) => ({ ...row, id, status, created_at: created, updated_at: updated });
// مهمة تنتظرك من شهر (أقدم من آخر ١٥٠ منتهية) لازم تبقى
const openRows = [raw('w-old', 'waiting_approval', '2026-09-01T00:00:00Z'), raw('run', 'in_progress', '2026-10-07T09:00:00Z'), raw('dup', 'waiting_approval', '2026-10-06T00:00:00Z', '2026-10-06T00:01:00Z')];
const closedRows = [
  ...Array.from({ length: 150 }, (_, i) => raw(`c${i}`, 'done', `2026-10-05T${String(i % 24).padStart(2, '0')}:${String(Math.floor(i / 24)).padStart(2, '0')}:00Z`)),
  // نفس المهمة انقرّرت بين الطلبين: ناخذ الأحدث تعديلاً
  raw('dup', 'done', '2026-10-06T00:00:00Z', '2026-10-06T00:05:00Z'),
  { id: 'junk', status: 'paused' },
];
const merged = mergeAgentRows(openRows, closedRows);
ok(merged.length === 153 && merged.some((r) => r.id === 'w-old' && r.status === 'waiting_approval'), 'an old proposal awaiting you is loaded even behind 150 newer finished tasks');
ok(merged.filter((r) => r.id === 'dup').length === 1 && merged.find((r) => r.id === 'dup')?.status === 'done', 'a task in both lists appears once, with its latest state');
ok(merged[0].id === 'run' && merged[merged.length - 1].id === 'w-old' && merged.every((r, i) => i === 0 || Date.parse(merged[i - 1].created_at) >= Date.parse(r.created_at)),
  'merged tasks are newest first');
ok(!merged.some((r) => r.id === 'junk') && mergeAgentRows([], []).length === 0, 'unreadable rows are dropped');

// ---------- المهمة الشغّالة اللي وقفت (نفس قاعدة المكتب) ----------
ok(AGENT_STALE_MS === 15 * 60_000 && agentStale({ status: 'in_progress', created_at: '2026-10-07T10:00:00Z' }, Date.parse('2026-10-07T10:16:00Z'))
  && !agentStale({ status: 'in_progress', created_at: '2026-10-07T10:00:00Z' }, Date.parse('2026-10-07T10:10:00Z')), 'the stale rule is shared with the agent screens');

// ---------- نص بلغتين ----------
ok(parseBi({ ar: ' مرحبا ', en: '' })?.en === 'مرحبا' && parseBi({ ar: '', en: 'Hi' })?.ar === 'Hi', 'a missing language falls back to the other');
ok(parseBi({ ar: '', en: '  ' }) === null && parseBi('hi') === null && parseBi({ ar: 'x'.repeat(500), en: 'y' }, 200)?.ar.length === 200, 'empty texts are null and long ones are cut');

// ---------- فرز البلاغ ----------
const triage = { summary: { ar: 'يطيح التطبيق', en: 'App crashes' }, severity: 'high', category_guess: 'bug', status: 'seen', reply: 'Thanks! We are on it.', reply_locale: 'en' };
ok(parseTriage(triage)?.severity === 'high' && parseTriage(triage)?.reply_locale === 'en', 'triage proposal parses');
ok(parseTriage({ ...triage, severity: 'urgent' }) === null && parseTriage({ ...triage, status: 'fixed' }) === null && parseTriage({ ...triage, reply: 'x' }) === null
  && parseTriage({ ...triage, reply_locale: 'fr' }) === null && parseTriage({ ...triage, summary: null }) === null, 'triage with a wrong enum, short reply or missing summary is unreadable');
ok(SEVERITIES.length === 4 && parseTriage({ ...triage, reply: 'r'.repeat(900) })?.reply.length === 600, 'reply is capped at 600');

// ---------- مراجعة طلب شريك ----------
const partner = {
  summary: { ar: 'نادي واضح', en: 'Clear gym' }, recommendation: 'reject', note: 'ارفع صورة الرخصة واضحة', note_locale: 'ar', confidence: 'medium',
  checks: [{ label: { ar: 'السجل', en: 'CR' }, ok: true }, { label: { ar: 'الرخصة', en: 'License' }, ok: false }, { label: { ar: 'x', en: 'x' }, ok: 'yes' }, ...Array.from({ length: 9 }, () => ({ label: { ar: 'ك', en: 'c' }, ok: true }))],
  missing: [{ ar: 'صورة الرخصة', en: 'License photo' }, 'bad', ...Array.from({ length: 8 }, () => ({ ar: 'م', en: 'm' }))],
};
const pp = parsePartner(partner);
ok(!!pp && pp.checks.length === 8 && pp.checks[1].ok === false && pp.missing.length === 6 && pp.missing[0].en === 'License photo', 'partner review parses, drops bad checks and caps the lists');
ok(parsePartner({ ...partner, note: 'no' }) === null, 'a reject without a real reason is unreadable (same rule as the server)');
ok(parsePartner({ ...partner, recommendation: 'approve', note: '' })?.note === '', 'approve may come without a note');
// رسالة الشريك توصل مع الرفض بس: اقتراح القبول تبدأ مسودته بدون رسالة (لو قلبته رفض تكتب السبب بنفسك)
const approveDraft = draftFrom(parseProposal('review_partner', { ...partner, recommendation: 'approve', note: 'Welcome to ARQ!' })!) as { decision: string; note: string };
ok(approveDraft.decision === 'approve' && approveDraft.note === '', 'an approve proposal starts without a partner message (it would never reach them)');
ok(parsePartner({ ...partner, recommendation: 'maybe' }) === null && parsePartner({ ...partner, confidence: 'sure' }) === null && parsePartner({ ...partner, checks: null }) === null,
  'partner review with a wrong enum or missing list is unreadable');
ok(CONFIDENCES.join() === 'high,medium,low', 'confidence levels');

// ---------- مسودة تنبيه ----------
ok(validNudgeText('gym', 'يلا {name}', 'نادي {gym} ينتظرك 💪'), 'allowed variables pass');
ok(!validNudgeText('meal', 'Hi {name}', 'Your {streak} days'), 'a variable not allowed for the type fails');
ok(!validNudgeText('gym', 'Hi {{name}}', 'Go to the gym') && !validNudgeText('gym', 'Hi {name', 'Go to the gym') && !validNudgeText('gym', 'Hi }', 'Go now!'), 'double or broken braces fail');
ok(!validNudgeText('gym', '  ', 'Go now') && !validNudgeText('gym', 'Hi', 'ok') && !validNudgeText('gym', 'x'.repeat(81), 'Go now') && !validNudgeText('gym', 'Hi', 'x'.repeat(241)),
  'title 1..80 and text 3..240');
ok(validNudgeText('friend', '{friend} سبقك', '{name}، {friend} تمرّن اليوم في {gym}') && validNudgeText('streak', '{streak} أيام', 'كمّل يا {name}') && validNudgeText('workout', 'Today: {workout}', 'Let\'s go {name}'),
  'each type has its own variables');
ok(Object.keys(NUDGE_PLACEHOLDERS).join() === 'gym,friend,streak,workout,meal' && NUDGE_PLACEHOLDERS.meal.join() === 'name', 'placeholder lists match nudges.ts');
const nudge = { why: { ar: 'الويكند', en: 'Weekend' }, template: { category: 'gym', gender: 'all', locale: 'ar', title: 'يلا {name}', body: 'النادي ينتظرك اليوم' } };
ok(parseNudge(nudge)?.template.title === 'يلا {name}', 'nudge draft parses');
ok(parseNudge({ ...nudge, template: { ...nudge.template, body: 'Hi {friend} at the gym' } }) === null && parseNudge({ ...nudge, template: { ...nudge.template, gender: 'kids' } }) === null,
  'a nudge with a bad variable or audience is unreadable');

// ---------- حدود الذكاء الاصطناعي ----------
ok(JSON.stringify(clampLimits({ barcode_per_day: 250, meal_photos_per_day: -3 })) === '{"barcode_per_day":100,"meal_photos_per_day":0}', 'limits are clamped to 0..100 and 0..200');
ok(clampLimits({ barcode_per_day: '٥', meal_photos_per_day: '30.6' }).barcode_per_day === 5 && clampLimits({ barcode_per_day: 1, meal_photos_per_day: '30.6' }).meal_photos_per_day === 31, 'Arabic digits and decimals become whole numbers');
ok(clampLimits({ barcode_per_day: 'lots', meal_photos_per_day: null }).barcode_per_day === 2 && clampLimits(null).meal_photos_per_day === 25
  && clampLimits({ barcode_per_day: 'x' }, { barcode_per_day: 7, meal_photos_per_day: 9 }).barcode_per_day === 7, 'non-numbers fall back to the default');
ok(parseLimits({ why: { ar: 'ع', en: 'w' }, barcode_per_day: 4.4, meal_photos_per_day: 999 })?.meal_photos_per_day === 200 && parseLimits({ why: { ar: 'ع', en: 'w' }, barcode_per_day: 'x', meal_photos_per_day: 3 }) === null,
  'limits proposal parses and clamps, junk numbers are unreadable');

// ---------- ملخص اليوم ----------
const brief = parseBrief({
  headline: { ar: 'عندك ٣ طلبات', en: '3 requests' },
  points: [{ ar: 'أ', en: 'a' }, null, ...Array.from({ length: 7 }, () => ({ ar: 'ن', en: 'p' }))],
  priorities: [{ desk: 'clubs', text: { ar: 'راجع', en: 'Review' } }, { desk: 'finance', text: { ar: 'x', en: 'x' } }, { desk: 'ai', text: null }],
});
ok(!!brief && brief.points.length === 6 && brief.priorities.length === 1 && brief.priorities[0].desk === 'clubs', 'brief keeps valid points and priorities with known desks');
ok(parseBrief({ headline: null, points: [], priorities: [] }) === null, 'brief without a headline is unreadable');

ok(parseProposal('triage_report', triage)?.kind === 'triage_report' && parseProposal('review_partner', triage) === null && parseProposal('daily_brief', null) === null, 'proposal parsed by its task kind');

// ---------- موافقتك: المسودة والتحقق ----------
const p1 = parseProposal('review_partner', partner)!;
const d1 = draftFrom(p1) as { decision: string; note: string };
ok(d1.decision === 'reject' && d1.note === partner.note, 'the editable draft starts from the agent proposal');
const pf = prepareFinal('review_partner', { decision: 'reject', note: '  ok  ' });
ok('error' in pf && pf.error === 'note', 'reject needs a note of 3 letters');
const pf2 = prepareFinal('review_partner', { decision: 'approve', note: '  ' });
ok(!('error' in pf2) && pf2.kind === 'review_partner' && pf2.final.note === '', 'approve without a note is fine');
const pf4 = prepareFinal('review_partner', { decision: 'approve', note: 'Please add your logo' });
ok(!('error' in pf4) && pf4.kind === 'review_partner' && pf4.final.decision === 'approve' && pf4.final.note === '', 'an approval does not record a message the partner never gets');
const pf3 = prepareFinal('review_partner', { decision: 'reject', note: 'x'.repeat(400) });
ok(!('error' in pf3) && pf3.kind === 'review_partner' && pf3.final.note.length === 300, 'partner note is cut to 300');
ok(prepareFinal('triage_report', { status: 'fixed', reply: '  Thanks  ' }).hasOwnProperty('final') && 'error' in prepareFinal('triage_report', { status: 'new', reply: 'x' })
  && (prepareFinal('triage_report', { status: 'seen', reply: 'x'.repeat(1001) }) as { error?: string }).error === 'reply', 'triage: status seen/fixed/wontfix and reply up to 1000');
ok(REPORT_FINAL_STATUSES.join() === 'seen,fixed,wontfix', 'report statuses the owner can pick');
const nf = prepareFinal('draft_nudge', { template: { ...nudge.template, title: '  Hey {name} ', locale: 'en' } });
ok(!('error' in nf) && nf.kind === 'draft_nudge' && nf.final.template.title === 'Hey {name}' && nf.final.template.locale === 'en', 'nudge draft is trimmed');
ok((prepareFinal('draft_nudge', { template: { ...nudge.template, body: 'Hi {streak}!' } }) as { error?: string }).error === 'nudge', 'nudge with a bad variable is refused before saving');
const lf = prepareFinal('review_ai_limits', { barcode_per_day: '12', meal_photos_per_day: 500 });
ok(!('error' in lf) && lf.kind === 'review_ai_limits' && lf.final.barcode_per_day === 12 && lf.final.meal_photos_per_day === 200, 'limits from the text fields are clamped');
ok((prepareFinal('review_ai_limits', { barcode_per_day: '', meal_photos_per_day: 3 }) as { error?: string }).error === 'bad', 'an empty limit is refused');
// الحدود تغيّرت بعد الاقتراح (عدّلتها بنفسك)؟ الاقتراح صار قديم
ok(!limitsChanged({ barcode_per_day: 2, meal_photos_per_day: 25 }, { barcode_per_day: 2, meal_photos_per_day: 25 })
  && limitsChanged({ barcode_per_day: 2, meal_photos_per_day: 25 }, { barcode_per_day: 10, meal_photos_per_day: 25 })
  && limitsChanged({ barcode_per_day: 2, meal_photos_per_day: 25 }, { barcode_per_day: 2, meal_photos_per_day: 60 }), 'limits changed by hand since the proposal are detected');
ok(!limitsChanged({ barcode_per_day: '2', meal_photos_per_day: 25.2 }, { barcode_per_day: 2, meal_photos_per_day: 25 }) && !limitsChanged(undefined, { barcode_per_day: 9, meal_photos_per_day: 9 }),
  'stored limits are compared as whole numbers; a task without stored limits has nothing to compare');
ok('error' in prepareFinal('daily_brief', {}) && 'error' in prepareFinal('triage_report', null), 'the daily brief has nothing to apply');

// ---------- خطوات الموافقة: تنفيذ مرة وحدة، وتسجيل القرار يتعاد بدون ما ينفّذ مرة ثانية ----------
type Log = { status: number; current: number; apply: Prepared[]; record: Record<string, unknown>[]; wait: number[] };
/** خطوات وهمية: record ترجع الأخطاء اللي بالقائمة بالترتيب، وبعدها تنجح */
function fakeSteps(o: { status?: string | null; current?: boolean; applyErr?: Error; recordErrs?: unknown[] } = {}): { steps: ApproveSteps; log: Log } {
  const log: Log = { status: 0, current: 0, apply: [], record: [], wait: [] };
  const errs = [...(o.recordErrs ?? [])];
  const steps: ApproveSteps = {
    status: async () => { log.status++; return o.status === undefined ? 'waiting_approval' : o.status; },
    current: async () => { log.current++; return o.current ?? true; },
    apply: async (p) => { if (o.applyErr) throw o.applyErr; log.apply.push(p); },
    record: async (fin) => { log.record.push(fin); if (errs.length) throw errs.shift(); },
    wait: async (ms) => { log.wait.push(ms); },
  };
  return { steps, log };
}
const rejects = async (p: Promise<unknown>): Promise<string | null> => { try { await p; return null; } catch (e) { return (e as Error).message; } };
const nudgeTask = { id: 'n1', kind: 'draft_nudge' as const };
const nudgeDraft = { template: { ...nudge.template } };
const netErr = new Error('Network request failed');
const notWaiting = { message: 'not_waiting', code: 'P0001' };

{
  const memo = new Map<string, Record<string, unknown>>();
  const a = fakeSteps();
  ok(await rejects(approveSteps(nudgeTask, nudgeDraft, a.steps, memo)) === null && a.log.apply.length === 1 && a.log.record.length === 1 && memo.size === 0,
    'approve applies once, records the decision and forgets the task');

  // التسجيل تعثّر مرتين: انطبق بس ما انسجّل
  const b = fakeSteps({ recordErrs: [netErr, netErr] });
  ok(await rejects(approveSteps(nudgeTask, nudgeDraft, b.steps, memo)) === 'not_recorded' && b.log.apply.length === 1 && b.log.record.length === 2
    && b.log.wait.join() === String(RECORD_RETRY_MS) && memo.has('n1'), 'when recording fails twice it says not_recorded and remembers what was applied');
  // «اعتمد» مرة ثانية (حتى لو عدّلت المسودة): يسجّل اللي انطبق فعلاً بس، بدون تنفيذ ولا فحوصات
  const c = fakeSteps({ recordErrs: [netErr, netErr] });
  ok(await rejects(approveSteps(nudgeTask, { template: { ...nudge.template, title: 'Changed' } }, c.steps, memo)) === 'not_recorded'
    && c.log.apply.length === 0 && c.log.status === 0 && c.log.current === 0 && memo.has('n1'), 'retrying while offline never applies again (no duplicate nudge)');
  const d = fakeSteps();
  ok(await rejects(approveSteps(nudgeTask, { template: { ...nudge.template, title: 'Changed' } }, d.steps, memo)) === null && d.log.apply.length === 0
    && (d.log.record[0]?.template as { title?: string })?.title === nudge.template.title && memo.size === 0,
  'the next Approve only records the applied proposal, then forgets it');

  // المحاولة الأولى وصلت وردّها ضاع: الثانية تقول not_waiting = انسجّل خلاص
  const e = fakeSteps({ recordErrs: [netErr, notWaiting] });
  ok(await rejects(approveSteps(nudgeTask, nudgeDraft, e.steps, memo)) === null && e.log.record.length === 2 && memo.size === 0,
    'not_waiting on the retry counts as recorded');
  memo.set('n1', { template: nudge.template });
  const f = fakeSteps({ recordErrs: [notWaiting] });
  ok(await rejects(approveSteps(nudgeTask, nudgeDraft, f.steps, memo)) === null && f.log.apply.length === 0 && memo.size === 0,
    'not_waiting when only recording an applied task counts as recorded');

  const g = fakeSteps({ status: 'done' });
  ok(await rejects(approveSteps(nudgeTask, nudgeDraft, g.steps, memo)) === 'not_waiting' && g.log.apply.length === 0 && g.log.record.length === 0, 'a task no longer waiting is not applied');
  const h = fakeSteps({ current: false });
  ok(await rejects(approveSteps({ id: 'l1', kind: 'review_ai_limits' }, { barcode_per_day: 5, meal_photos_per_day: 40 }, h.steps, memo)) === 'already_decided'
    && h.log.apply.length === 0 && memo.size === 0, 'an out-of-date proposal (item decided or limits changed by hand) is refused before applying');
  const i = fakeSteps();
  ok(await rejects(approveSteps(nudgeTask, { template: { ...nudge.template, body: 'Hi {streak}' } }, i.steps, memo)) === 'bad_input' && i.log.status === 0, 'a bad draft is refused first');
  const j = fakeSteps({ applyErr: new Error('report_locked') });
  ok(await rejects(approveSteps({ id: 'r9', kind: 'triage_report' }, { status: 'seen', reply: 'Thanks' }, j.steps, memo)) === 'report_locked' && j.log.record.length === 0 && memo.size === 0,
    'if applying fails nothing is recorded or remembered');
  const k = fakeSteps({ recordErrs: [{ message: 'not_allowed' }, { message: 'not_allowed' }] });
  ok(await rejects(approveSteps({ id: 'p1', kind: 'review_partner' }, { decision: 'approve', note: 'Hi there' }, k.steps, memo)) === 'not_recorded'
    && (memo.get('p1') as { note?: string })?.note === '', 'any other recording error keeps the applied proposal for the next Approve');
}

// ---------- التشغيل والأخطاء ----------
const rr = parseRunResult({ ran: 3, waiting: 2, done: 0, failed: 1, skipped: 1 })!;
ok(rr.ran === 3 && runLine(rr).map((p) => p.key).join() === 'run_waiting,run_failed,run_skipped', 'run result lists the non-zero counts');
ok(runLine(parseRunResult({ ran: 0 })!).length === 0 && parseRunResult({ error: 'x' }) === null && parseRunResult(null) === null, 'nothing to do and errors are told apart');
ok(runErrorCode('rate_limited') === 'rate_limited' && runErrorCode('agent_unavailable') === 'agent_unavailable' && runErrorCode('save_failed') === 'generic' && runErrorCode(undefined) === 'generic',
  'function codes map to office texts or generic');
ok(officeErrorCode(new Error('already_decided')) === 'already_decided' && officeErrorCode({ message: 'ERROR: not_waiting' }) === 'not_waiting'
  && officeErrorCode(new Error('Network request failed')) === null && officeErrorCode(new Error('report_locked')) === null, 'thrown errors map to office codes only when they are office codes');
ok(failReason('ai_refused') === 'ai_refused' && failReason('boom') === 'other' && failReason(null) === 'other', 'failure reasons');

// ---------- النصوص: كل مفتاح تستخدمه الشاشة والورقة موجود بالعربي والإنجليزي ----------
const ar = JSON.parse(readFileSync(new URL('../src/locales/ar.json', import.meta.url), 'utf8'));
const en = JSON.parse(readFileSync(new URL('../src/locales/en.json', import.meta.url), 'utf8'));
const get = (o: Record<string, any>, k: string) => k.split('.').reduce<any>((x, p) => x?.[p], o);
const src = ['../src/app/owner-office.tsx', '../src/components/office/AgentTaskSheet.tsx'].map((f) => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
// كل نص ثابت بين '' على شكل group.key (حتى اللي داخل شرط: t(x ? 'office.a' : 'office.b'))
const literal = [...src.matchAll(/'((?:office|owner|nudge|beta|aiLimits|common)\.[a-zA-Z0-9_]+)'/g)].map((m) => m[1]);
const dynamic = [
  ...[...OFFICE_ERRORS, 'generic'].map((c) => `office.err_${c}`),
  ...['reply', 'note', 'nudge', 'bad'].map((c) => `office.err_final_${c}`),
  ...[...AGENT_FAIL_REASONS, 'other'].map((c) => `office.aerr_${c}`),
  ...SEVERITIES.map((s) => `office.sev_${s}`), ...CONFIDENCES.map((c) => `office.conf_${c}`),
  ...['run_waiting', 'run_done', 'run_failed', 'run_skipped'].map((k) => `office.${k}`),
  ...REPORT_FINAL_STATUSES.map((s) => `owner.st_${s}`), ...['bug', 'idea', 'design', 'other'].map((c) => `beta.cat_${c}`),
  ...Object.keys(NUDGE_PLACEHOLDERS).map((c) => `nudge.cat_${c}`), 'nudge.lang_ar', 'nudge.lang_en', 'nudge.aud_all', 'nudge.g_male', 'nudge.g_female',
  ...AGENT_DESKS.map((d) => `office.agent_${d}`),
];
const used = [...new Set([...literal, ...dynamic])];
const missing = used.filter((k) => typeof get(ar, k) !== 'string' || typeof get(en, k) !== 'string');
ok(literal.length > 20 && !missing.length, `every agent text exists in Arabic and English${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`);
const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join();
const officeKeys = Object.keys(en.office);
ok(officeKeys.every((k) => vars(en.office[k]) === vars(ar.office[k] ?? '')), 'Arabic and English use the same {{variables}}');
ok(AGENT_KINDS.length === 5, 'five agent kinds');

// ---------- الشاشات: إصلاحات ما تنختبر إلا من الكود نفسه ----------
const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');
const officeScreen = read('../src/app/owner-office.tsx');
const sheetSrc = read('../src/components/office/AgentTaskSheet.tsx');
const clientSrc = read('../src/lib/officeAgents.ts');
ok(!/WORKING_FRESH_MS|10 \* 60_000/.test(officeScreen) && /agentStale\(/.test(officeScreen), 'the office polls with the same stale rule as the task list');
ok(/const stale = agentStale\(task/.test(sheetSrc) && /isWorking\(task\.status\) && !stale/.test(sheetSrc) && /aerr_\$\{stale \? 'stale'/.test(sheetSrc),
  'the task sheet shows a stopped task as not finished instead of spinning');
ok(/<AgentTaskSheet key=\{sheetTask\.id\}/.test(officeScreen), 'switching tasks mounts a fresh sheet');
ok(/navigation\.isFocused\(\)\) setSheet\(\(cur\) => cur \?\? daily\.id\)/.test(officeScreen), 'the daily brief opens only on the focused office and never replaces an open sheet');
ok(/value\?\.decision === 'reject' \? \(\s*<Section title=\{t\('office\.sh_note'\)\}/.test(sheetSrc), 'the partner message shows only when rejecting');
ok(/const reason = decision === 'reject' \? note \|\| undefined : undefined;/.test(clientSrc) && (clientSrc.match(/, reason\)/g) ?? []).length === 2,
  'the partner message is sent only with a rejection');
ok(/limitsChanged\(task\.input\.current, await currentAiLimits\(\)\)/.test(clientSrc), 'approving limits first compares them with the live ones');
ok(/in\('status', \['scheduled', 'in_progress', 'waiting_approval'\]\)/.test(clientSrc) && /mergeAgentRows\(/.test(clientSrc), 'all open agent tasks are loaded, merged with the recent finished ones');
ok(/const appliedPending = new Map/.test(clientSrc) && /appliedPending\.has\(task\.id\)\) throw new Error\('not_recorded'\)/.test(clientSrc),
  'the applied-but-unrecorded memo lives for the app session and blocks rejecting an applied proposal');
ok(/Approve/.test(en.office.err_not_recorded) && /اعتمد/.test(ar.office.err_not_recorded) && !/close it/.test(en.office.err_not_recorded),
  'not_recorded tells you to tap Approve again (not to close the task)');

if (fail) console.log(`\n${fail} office agent test(s) failed`);
