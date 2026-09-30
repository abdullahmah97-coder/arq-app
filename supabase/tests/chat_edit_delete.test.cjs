// المحادثات مثل الواتساب: تعديل الرسالة، حذفها لي أو للجميع، وحذف المحادثة من صندوقي
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U } = await setup();
  await as(U.A, `insert into friendships (requester, addressee) values ($1, $2)`, [U.A, U.B]);
  await as(U.B, `update friendships set status = 'accepted' where requester = $1 and addressee = $2`, [U.A, U.B]);
  const send = async (from, to, body, media) => (await as(from,
    `insert into messages (sender, recipient, body, media_path, media_type) values ($1, $2, $3, $4, $5) returning *`,
    [from, to, body, media ?? null, media ? 'image' : null]))[0];
  const seen = async (uid) => (await as(uid, `select id, body, edited_at, deleted_at, media_path, read_at from messages order by created_at`));

  // ---------- التعديل ----------
  const m1 = await send(U.A, U.B, 'هلا');
  const e1 = (await as(U.A, `select * from edit_message($1, $2)`, [m1.id, '  هلا والله  ']))[0];
  check('sender edits a fresh message (trimmed) and it is marked edited', e1.body === 'هلا والله' && !!e1.edited_at, JSON.stringify(e1));
  const bSees = (await seen(U.B)).find((m) => m.id === m1.id);
  check('the other side sees the edited text', bSees?.body === 'هلا والله' && !!bSees.edited_at);
  await expectErr('the recipient cannot edit it', () => as(U.B, `select edit_message($1, 'x')`, [m1.id]), /not_allowed/);
  await expectErr('a stranger cannot edit it', () => as(U.C, `select edit_message($1, 'x')`, [m1.id]), /not_allowed/);
  await expectErr('a text message cannot be edited to empty', () => as(U.A, `select edit_message($1, '   ')`, [m1.id]), /empty_message/);
  await expectErr('too long edits are refused', () => as(U.A, `select edit_message($1, $2)`, [m1.id, 'x'.repeat(1001)]), /message_too_long/);
  await q(`update messages set created_at = now() - interval '16 minutes' where id = $1`, [m1.id]);
  await expectErr('no edits after 15 minutes', () => as(U.A, `select edit_message($1, 'late')`, [m1.id]), /edit_window_passed/);
  await expectErr('the recipient cannot set edited/deleted directly', () =>
    as(U.B, `update messages set deleted_at = now(), read_at = now() where id = $1`, [m1.id]), /read_only_message/);
  await expectErr('a new message cannot arrive pre-marked as edited', () =>
    as(U.A, `insert into messages (sender, recipient, body, edited_at) values ($1, $2, 'fake', now())`, [U.A, U.B]), /row-level security/);

  // ---------- الحذف للجميع ----------
  const m2 = await send(U.A, U.B, 'رسالة غلط');
  await expectErr('the recipient cannot delete it for everyone', () => as(U.B, `select delete_message($1, true)`, [m2.id]), /not_allowed/);
  const r2 = (await as(U.A, `select delete_message($1, true) as path`, [m2.id]))[0];
  check('sender deletes for everyone (no file to remove)', r2.path === null);
  const d2 = (await seen(U.B)).find((m) => m.id === m2.id);
  check('both sides keep a deleted placeholder with no text', !!d2 && d2.body === '' && !!d2.deleted_at);
  await expectErr('a deleted message cannot be edited', () => as(U.A, `select edit_message($1, 'back')`, [m2.id]), /message_deleted/);
  const ibA = await as(U.A, `select last_body, last_deleted, last_from_me from inbox()`);
  check('inbox shows 🚫 for a message deleted for everyone', ibA[0]?.last_body === '🚫' && ibA[0]?.last_deleted === true, JSON.stringify(ibA));
  const pic = await send(U.A, U.B, '', `${U.A}/${U.B}/p1.jpg`);
  const rp = (await as(U.A, `select delete_message($1, true) as path`, [pic.id]))[0];
  check('deleting a photo for everyone returns its file path (the app removes it)', rp.path === `${U.A}/${U.B}/p1.jpg`);
  const dp = (await seen(U.B)).find((m) => m.id === pic.id);
  check('the photo is gone from the message', dp && dp.media_path === null && !!dp.deleted_at);
  const direct = await send(U.A, U.B, 'حذف مباشر؟');
  const gone = await as(U.A, `delete from messages where id = $1 returning id`, [direct.id]);
  check('the sender cannot hard-delete a message directly (only through delete_message)', gone.length === 0 && (await seen(U.B)).some((m) => m.id === direct.id));
  const old = await send(U.A, U.B, 'قديمة');
  await q(`update messages set created_at = now() - interval '3 days' where id = $1`, [old.id]);
  await expectErr('no deleting for everyone after 2 days', () => as(U.A, `select delete_message($1, true)`, [old.id]), /delete_window_passed/);

  // ---------- الحذف لي ----------
  const m3 = await send(U.A, U.B, 'تشوفها أنت بس');
  const unreadB = async () => Number((await as(U.B, `select unread from inbox()`))[0]?.unread ?? 0);
  const u0 = await unreadB();
  await as(U.B, `select delete_message($1, false)`, [m3.id]);
  check('a message deleted by the recipient leaves the unread count', (await unreadB()) === u0 - 1, `${u0} -> ${await unreadB()}`);
  check('deleted for me: gone for the recipient', !(await seen(U.B)).some((m) => m.id === m3.id));
  check('deleted for me: the sender still has it', (await seen(U.A)).some((m) => m.id === m3.id));
  const m3a = (await as(U.A, `select read_at from messages where id = $1`, [m3.id]))[0];
  check('a message the recipient deleted does not stay unread', !!m3a?.read_at);
  await expectErr('a stranger cannot hide other people’s messages', () => as(U.C, `select delete_message($1, false)`, [m1.id]), /not_allowed/);
  check('nobody can write hides directly', await as(U.B, `insert into message_hides (user_id, message_id) values ($1, $2)`, [U.B, m1.id]).then(() => false, () => true));

  // ---------- حذف المحادثة من عندي ----------
  const before = (await seen(U.B)).length;
  await as(U.B, `select clear_chat($1)`, [U.A]);
  check('after deleting the chat the recipient sees no old messages', (await seen(U.B)).length === 0, `before=${before}`);
  check('the chat is gone from the recipient’s inbox', (await as(U.B, `select other_id from inbox()`)).length === 0);
  check('the sender still has the whole chat', (await seen(U.A)).length >= 5);
  check('and still sees it in the inbox', (await as(U.A, `select other_id from inbox()`)).length === 1);
  await new Promise((r) => setTimeout(r, 20));
  const m4 = await send(U.A, U.B, 'رجعنا');
  const after = await seen(U.B);
  check('a new message brings the chat back with only the new message', after.length === 1 && after[0].id === m4.id, JSON.stringify(after));
  const ibB = await as(U.B, `select other_id, unread, last_body from inbox()`);
  check('inbox shows it again with 1 unread', ibB.length === 1 && Number(ibB[0].unread) === 1 && ibB[0].last_body === 'رجعنا', JSON.stringify(ibB));
  await expectErr('you cannot delete a chat with yourself', () => as(U.A, `select clear_chat($1)`, [U.A]), /not_allowed/);
  await expectErr('signed-out visitors cannot delete chats', () => as(null, `select clear_chat($1)`, [U.A]), /permission denied|not_allowed/);
  check('nobody can write chat clears directly', await as(U.A, `insert into chat_clears (user_id, other_id) values ($1, $2)`, [U.A, U.B]).then(() => false, () => true));

  // الرسائل العادية ما تأثرت
  check('the recipient can still mark messages read', (await as(U.B, `update messages set read_at = now() where id = $1 returning id`, [m4.id])).length === 1);
})().catch((e) => { console.error(e); process.exit(1); });
