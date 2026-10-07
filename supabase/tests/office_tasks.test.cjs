// مهام موظفين الذكاء الاصطناعي في مكتب أرك أب: يقرأها الأدمن بس، الكتابة من الخادم، القرار من office_decide،
// اللي خلصت مقفولة، مهمة مفتوحة وحدة لكل عنصر، وحد ٨٠ استدعاء باليوم (ai_take('office'))
const fs = require('fs');
const path = require('path');
const { setup } = require('./_harness.cjs');

(async () => {
  const { db, q, as, check, expectErr, U } = await setup();
  const R1 = 'aaaaaaaa-0000-4000-8000-000000000001';
  const R2 = 'aaaaaaaa-0000-4000-8000-000000000002';
  const BRAND = 'bbbbbbbb-0000-4000-8000-000000000001';
  const VENUE = 'cccccccc-0000-4000-8000-000000000001';
  const OUT = JSON.stringify({ summary: { ar: 'ملخص', en: 'Summary' }, severity: 'high', category_guess: 'bug', status: 'seen', reply: 'شكراً، بنصلحه', reply_locale: 'ar' });
  const count = async () => (await q(`select count(*)::int n from office_tasks`))[0].n;
  const task = async (id) => (await q(`select * from office_tasks where id = $1`, [id]))[0];
  // نفس اللي تسويه دالة الخادم (service role): تضيف المهمة «تشتغل» وبعدين تحدّثها
  const add = async (cols, vals, params = []) =>
    (await q(`insert into office_tasks (${cols}) values (${vals}) returning id`, params))[0].id;

  // ---------- كتابة الخادم: من «يشتغل» إلى «ينتظر موافقتك» ----------
  const t1 = await add(`desk, kind, target_kind, target_id, title, input, model, request_id, created_by, updated_at`,
    `'reports', 'triage_report', 'report', $1, 'التطبيق يقفل لما أفتح الوجبات', '{"locale":"ar"}', 'claude-opus-5-5', 'req-12345678', $2, '2020-01-01'`, [R1, U.E]);
  let row = await task(t1);
  check('server inserts a task as in_progress by default', row.status === 'in_progress' && row.finished_at === null && row.decision === null, row.status);
  await q(`update office_tasks set status = 'waiting_approval', output = $2::jsonb where id = $1`, [t1, OUT]);
  row = await task(t1);
  check('agent finishing stamps finished_at', row.status === 'waiting_approval' && row.finished_at !== null && row.output.severity === 'high');
  check('every update bumps updated_at', new Date(row.updated_at).getFullYear() >= 2026, String(row.updated_at));

  // ---------- مين يشوف ومين يكتب ----------
  const t2 = await add(`desk, kind, title, status, output`, `'marketing', 'draft_nudge', null, 'waiting_approval', '{"why":{"ar":"س","en":"w"}}'`);
  const t3 = await add(`desk, kind, target_kind, target_id, title`, `'stores', 'review_partner', 'store', $1, 'متجر بروتين'`, [BRAND]);
  const total = await count();
  check('non-admins see no office tasks', (await as(U.A, `select count(*)::int n from office_tasks`))[0].n === 0);
  check('the admin sees them all', (await as(U.E, `select count(*)::int n from office_tasks`))[0].n === total && total === 3, String(total));
  await expectErr('signed-out visitors can’t read office tasks', () => as(null, `select * from office_tasks`), /permission denied/);
  await expectErr('a user can’t insert tasks', () => as(U.A, `insert into office_tasks (desk, kind) values ('lead', 'daily_brief')`), /row-level security/);
  await expectErr('even the admin can’t insert tasks directly (server only)', () => as(U.E, `insert into office_tasks (desk, kind) values ('lead', 'daily_brief')`), /row-level security/);
  const before = JSON.stringify(await task(t1));
  check('a user can’t update tasks', (await as(U.A, `update office_tasks set title = 'x' returning 1`)).length === 0);
  check('the admin can’t update tasks directly (decisions go through office_decide)',
    (await as(U.E, `update office_tasks set status = 'done', decision = 'approved', decided_at = now() returning 1`)).length === 0);
  check('nobody deletes tasks', (await as(U.A, `delete from office_tasks returning 1`)).length === 0 && (await as(U.E, `delete from office_tasks returning 1`)).length === 0);
  check('…nothing changed', JSON.stringify(await task(t1)) === before && (await count()) === 3);

  // ---------- تطابق النوع والمكتب والعنصر ----------
  await expectErr('triage_report must sit on the reports desk', () => add(`desk, kind, target_kind, target_id`, `'clubs', 'triage_report', 'report', $1`, [R2]), /check constraint/);
  await expectErr('triage_report needs its report id', () => add(`desk, kind, target_kind`, `'reports', 'triage_report', 'report'`), /check constraint/);
  await expectErr('stores desk reviews stores, not clubs', () => add(`desk, kind, target_kind, target_id`, `'stores', 'review_partner', 'club', $1`, [BRAND]), /check constraint/);
  await expectErr('care desk reviews centers/venues only', () => add(`desk, kind, target_kind, target_id`, `'care', 'review_partner', 'coach', $1`, [VENUE]), /check constraint/);
  await expectErr('the users desk has no agent kind', () => add(`desk, kind`, `'users', 'daily_brief'`), /check constraint/);
  await expectErr('daily_brief has no target', () => add(`desk, kind, target_kind, target_id`, `'lead', 'daily_brief', 'report', $1`, [R2]), /check constraint/);
  await expectErr('draft_nudge belongs to marketing', () => add(`desk, kind`, `'ai', 'draft_nudge'`), /check constraint/);
  await expectErr('unknown kind rejected', () => add(`desk, kind`, `'lead', 'write_essay'`), /check constraint/);
  await expectErr('unknown status rejected', () => add(`desk, kind, status`, `'lead', 'daily_brief', 'paused'`), /check constraint/);
  await expectErr('waiting_approval needs a proposal', () => add(`desk, kind, status`, `'ai', 'review_ai_limits', 'waiting_approval'`), /check constraint/);
  await expectErr('input must be an object', () => add(`desk, kind, input`, `'lead', 'daily_brief', '[1,2]'`), /check constraint/);
  await expectErr('output must be an object', () => add(`desk, kind, status, output`, `'lead', 'daily_brief', 'done', '"hi"'`), /check constraint/);
  await expectErr('request_id must look like an id', () => add(`desk, kind, request_id`, `'lead', 'daily_brief', 'x; drop'`), /check constraint/);
  await expectErr('title capped at 120 chars', () => add(`desk, kind, title`, `'lead', 'daily_brief', repeat('a', 121)`), /check constraint/);
  await expectErr('a decision needs its time', () => add(`desk, kind, status, decision`, `'lead', 'daily_brief', 'done', 'approved'`), /check constraint/);
  await expectErr('a decided task is done', () => add(`desk, kind, status, output, decision, decided_at`, `'lead', 'daily_brief', 'waiting_approval', '{}', 'approved', now()`), /check constraint/);
  const tVenue = await add(`desk, kind, target_kind, target_id`, `'care', 'review_partner', 'venue', $1`, [VENUE]);
  check('care desk accepts a venue review', !!tVenue);

  // ---------- مهمة مفتوحة وحدة لكل عنصر ----------
  await expectErr('a second open task for the same report fails', () => add(`desk, kind, target_kind, target_id`, `'reports', 'triage_report', 'report', $1`, [R1]), /duplicate key|unique/);
  await expectErr('…also while the first is still in_progress', () => add(`desk, kind, target_kind, target_id`, `'stores', 'review_partner', 'store', $1`, [BRAND]), /duplicate key|unique/);
  await q(`update office_tasks set status = 'failed', error = 'ai_failed' where id = $1`, [t3]);
  const t3b = await add(`desk, kind, target_kind, target_id, title`, `'stores', 'review_partner', 'store', $1, 'متجر بروتين'`, [BRAND]);
  check('after the first one failed, a new task for the same item is allowed', !!t3b && (await task(t3)).finished_at !== null);
  const runs = [await add(`desk, kind`, `'lead', 'daily_brief'`), await add(`desk, kind`, `'lead', 'daily_brief'`)];
  check('run-level tasks (no target) can repeat', runs.length === 2);

  // ---------- قرار المالك: office_decide ----------
  await expectErr('non-admins can’t decide', () => as(U.A, `select office_decide($1, 'approved')`, [t1]), /not_allowed/);
  await expectErr('signed-out visitors can’t decide', () => as(null, `select office_decide($1, 'approved')`, [t1]), /permission denied|not_allowed/);
  await expectErr('unknown decision', () => as(U.E, `select office_decide($1, 'maybe')`, [t1]), /bad_status/);
  await expectErr('missing decision', () => as(U.E, `select office_decide($1, null)`, [t1]), /bad_status/);
  await expectErr('final must be an object (array)', () => as(U.E, `select office_decide($1, 'approved', '[1]'::jsonb)`, [t1]), /bad_input/);
  await expectErr('final must be an object (string)', () => as(U.E, `select office_decide($1, 'approved', '"ok"'::jsonb)`, [t1]), /bad_input/);
  await expectErr('final can’t be huge', () => as(U.E, `select office_decide($1, 'approved', jsonb_build_object('reply', repeat(md5(random()::text), 400)))`, [t1]), /bad_input/);
  await expectErr('a task the agent is still working on can’t be decided', () => as(U.E, `select office_decide($1, 'approved')`, [tVenue]), /not_waiting/);
  await expectErr('a failed task can’t be decided', () => as(U.E, `select office_decide($1, 'rejected')`, [t3]), /not_waiting/);
  await expectErr('unknown task id', () => as(U.E, `select office_decide($1, 'approved')`, [R2]), /not_waiting/);
  check('…none of that touched the task', (await task(t1)).status === 'waiting_approval' && (await q(`select count(*)::int n from admin_log where kind = 'office'`))[0].n === 0);

  const waitedAt = (await task(t1)).finished_at;
  const FINAL = { status: 'seen', reply: 'شكراً، انحلّت بالتحديث الجاي' };
  await as(U.E, `select office_decide($1, 'approved', $2::jsonb, $3)`, [t1, JSON.stringify(FINAL), '   عدّلت الرد شوي   ']);
  row = await task(t1);
  check('approve marks the task done with the decision', row.status === 'done' && row.decision === 'approved', row.status);
  check('…stores the owner’s final version', row.final?.status === FINAL.status && row.final.reply === FINAL.reply && Object.keys(row.final).length === 2, JSON.stringify(row.final));
  check('…trims the note', row.decision_note === 'عدّلت الرد شوي', row.decision_note);
  check('…records who decided and when', row.decided_by === U.E && row.decided_at !== null && Math.abs(new Date(row.decided_at) - Date.now()) < 60_000);
  check('…keeps when the agent finished', String(row.finished_at) === String(waitedAt));
  check('…keeps the agent’s proposal untouched', row.output.reply === 'شكراً، بنصلحه');
  const log = await q(`select admin_id, target, action, note from admin_log where kind = 'office'`);
  check('approval is written to the owner’s action log (with the task title)',
    log.length === 1 && log[0].admin_id === U.E && log[0].target === t1 && log[0].action === 'approved' && log[0].note === 'التطبيق يقفل لما أفتح الوجبات', JSON.stringify(log));
  await expectErr('a decided task can’t be decided again', () => as(U.E, `select office_decide($1, 'rejected')`, [t1]), /not_waiting/);

  await as(U.E, `select office_decide($1, 'rejected', null, 'ما يناسب الحين')`, [t2]);
  row = await task(t2);
  check('reject records the decision without a final version', row.status === 'done' && row.decision === 'rejected' && row.final === null && row.decision_note === 'ما يناسب الحين');
  const log2 = (await q(`select action, note from admin_log where kind = 'office' and target = $1`, [t2]))[0];
  check('rejection logged (with the note when the task has no title)', log2?.action === 'rejected' && log2.note === 'ما يناسب الحين', JSON.stringify(log2));
  const tBlank = await add(`desk, kind, status, output`, `'ai', 'review_ai_limits', 'waiting_approval', '{"barcode_per_day":3}'`);
  await as(U.E, `select office_decide($1, 'rejected', null, '    ')`, [tBlank]);
  check('a blank note is stored as no note', (await task(tBlank)).decision_note === null);

  // ---------- اللي خلصت مقفولة ----------
  await expectErr('a done task can’t be reopened', () => q(`update office_tasks set status = 'waiting_approval' where id = $1`, [t1]), /task_locked/);
  await expectErr('a done task’s proposal can’t change', () => q(`update office_tasks set output = '{}' where id = $1`, [t1]), /task_locked/);
  await expectErr('a done task’s decision can’t change', () => q(`update office_tasks set decision = 'rejected' where id = $1`, [t1]), /task_locked/);
  await expectErr('a done task’s final version can’t change', () => q(`update office_tasks set final = '{"status":"wontfix"}' where id = $1`, [t1]), /task_locked/);
  await expectErr('a done task’s note can’t change', () => q(`update office_tasks set decision_note = 'x' where id = $1`, [t1]), /task_locked/);
  await expectErr('a failed task can’t come back', () => q(`update office_tasks set status = 'waiting_approval', output = $2::jsonb where id = $1`, [t3, OUT]), /task_locked/);
  check('…the done task is exactly as decided', (await task(t1)).decision === 'approved' && (await task(t1)).status === 'done');

  // تنظيف المعلّقة: اللي صار لها أكثر من ربع ساعة «تشتغل» تصير فاشلة، ولو رجع الوكيل متأخر ما يقدر يكتب
  await q(`update office_tasks set created_at = now() - interval '20 minutes' where id = $1`, [tVenue]);
  const stale = await q(`update office_tasks set status = 'failed', error = 'stale' where status = 'in_progress' and created_at < now() - interval '15 minutes' returning id`);
  check('stale in_progress tasks are failed by housekeeping', stale.length === 1 && stale[0].id === tVenue && (await task(tVenue)).finished_at !== null);
  await expectErr('a late agent can’t write into a stale-failed task', () => q(`update office_tasks set status = 'waiting_approval', output = $2::jsonb where id = $1`, [tVenue, OUT]), /task_locked/);

  // ملخص اليوم: معلومات بس، ينحفظ «خلص» على طول وما يحتاج قرار
  await q(`update office_tasks set status = 'done', output = '{"headline":{"ar":"يومك","en":"Your day"},"points":[],"priorities":[]}' where id = $1`, [runs[0]]);
  check('daily brief goes straight to done', (await task(runs[0])).status === 'done' && (await task(runs[0])).finished_at !== null);
  await expectErr('…and isn’t waiting for a decision', () => as(U.E, `select office_decide($1, 'approved')`, [runs[0]]), /not_waiting/);

  // ---------- حد الذكاء الاصطناعي للمكتب: ٨٠ باليوم ----------
  const left = [];
  for (let i = 0; i < 80; i++) left.push((await as(U.E, `select ai_take('office') as n`))[0].n);
  check('the admin gets 80 office agent calls a day, counting down', left[0] === 79 && left[79] === 0 && left.every((n, i) => n === 79 - i), `${left[0]}…${left[79]}`);
  await expectErr('the 81st call is blocked', () => as(U.E, `select ai_take('office')`), /rate_limited/);
  check('the blocked call isn’t recorded', (await q(`select count(*)::int n from ai_usage where user_id = $1 and kind = 'office'`, [U.E]))[0].n === 80);
  check('the office quota doesn’t eat the admin’s other quotas',
    (await as(U.E, `select ai_take('meal_photo') as n`))[0].n === 24 && (await as(U.E, `select ai_take('barcode') as n`))[0].n === 1 && (await as(U.E, `select ai_take('plan') as n`))[0].n === 7);
  check('old kinds still work for everyone', (await as(U.B, `select ai_take('meal_photo') as n`))[0].n === 24 && (await as(U.B, `select ai_take('plan') as n`))[0].n === 7);
  await expectErr('unknown kind still rejected', () => as(U.E, `select ai_take('essay')`), /bad_status/);
  await expectErr('signed-out callers rejected', () => as(null, `select ai_take('office')`), /permission denied|not_authenticated/);
  await expectErr('can’t record office calls directly', () => as(U.E, `insert into ai_usage (user_id, kind) values ($1, 'office')`, [U.E]), /row-level security/);
  await q(`update ai_usage set created_at = now() - interval '25 hours' where user_id = $1 and kind = 'office'`, [U.E]);
  check('the office limit resets after a day', (await as(U.E, `select ai_take('office') as n`))[0].n === 79);

  // ---------- الترحيل ينعاد بدون مشاكل ----------
  const n = await count();
  let rerun = true;
  try { await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/20261007000880_office_agents.sql'), 'utf8')); } catch (e) { rerun = false; console.log(e.message); }
  check('the migration can be re-run safely', rerun && (await count()) === n && (await task(t1)).decision === 'approved');
  check('…and ai_take(office) still counts after it', (await as(U.E, `select ai_take('office') as n`))[0].n === 78);

  // حذف حساب صاحب المهمة أو صاحب القرار ما يتعطّل بسبب القفل (يصير فاضي بس)
  const tOld = await add(`desk, kind, status, output, decision, decided_at, decided_by, created_by`,
    `'ai', 'review_ai_limits', 'done', '{"barcode_per_day":2}', 'approved', now(), $1, $1`, [U.A]);
  await q(`delete from auth.users where id = $1`, [U.A]);
  row = await task(tOld);
  check('deleting an account keeps the decided task (who becomes empty)', row && row.decided_by === null && row.created_by === null && row.decision === 'approved');
})().catch((e) => { console.error(e); process.exit(1); });
