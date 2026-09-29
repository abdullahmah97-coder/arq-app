// المراسلة للأصدقاء بس: بعد قبول طلب الصداقة تنفتح المحادثة (والمدرب ومتدربه) — المتابعة ما تفتحها
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U } = await setup();
  const can = async (a, b) => (await q(`select mutual_follow($1, $2) as ok`, [a, b]))[0].ok;
  const send = (from, to, body) => as(from, `insert into messages (sender, recipient, body) values ($1, $2, $3) returning id`, [from, to, body]);

  check('strangers cannot message', (await can(U.A, U.B)) === false);
  await expectErr('sending to a stranger is refused', () => send(U.A, U.B, 'هلا'), /row-level security/);

  // طلب صداقة: ما يفتح المحادثة لين ينقبل
  await as(U.A, `insert into friendships (requester, addressee) values ($1, $2)`, [U.A, U.B]);
  check('pending request keeps chat closed', (await can(U.A, U.B)) === false);
  await as(U.B, `update friendships set status = 'accepted' where requester = $1 and addressee = $2`, [U.A, U.B]);
  check('accepted friends can message (both ways)', (await can(U.A, U.B)) === true && (await can(U.B, U.A)) === true);
  const m1 = await send(U.A, U.B, 'هلا أحمد');
  const m2 = await send(U.B, U.A, 'هلا والله');
  check('friends send and reply', m1.length === 1 && m2.length === 1);

  // المتابعة ما تفتح المحادثة، حتى لو من الطرفين
  await as(U.A, `insert into follows (follower, followee) values ($1, $2)`, [U.A, U.C]);
  check('one-way follow is not enough', (await can(U.A, U.C)) === false);
  await as(U.C, `insert into follows (follower, followee) values ($1, $2)`, [U.C, U.A]);
  check('following each other is not enough either', (await can(U.A, U.C)) === false);
  await expectErr('sending to someone you only follow is refused', () => send(U.A, U.C, 'هلا خالد'), /row-level security/);

  // المدرب ومتدربه
  await q(`insert into coach_links (coach_id, client_id, status, requested_by) values ($1, $2, 'active', 'coach')`, [U.D, U.A]);
  check('active coach link opens chat', (await can(U.A, U.D)) === true);

  // قائمة «رسالة جديدة»
  const contacts = await as(U.A, `select id, relation from message_contacts()`);
  const rel = Object.fromEntries(contacts.map((c) => [c.id, c.relation]));
  check('contacts: friends and coach only (not people you just follow)', rel[U.B] === 'friend' && rel[U.D] === 'coach' && !rel[U.C] && contacts.length === 2, JSON.stringify(rel));
  await as(U.A, `insert into friendships (requester, addressee) values ($1, $2)`, [U.A, U.C]);
  check('a pending request does not open the chat', (await can(U.A, U.C)) === false);
  await as(U.C, `update friendships set status = 'accepted' where requester = $1 and addressee = $2`, [U.A, U.C]);
  check('once accepted, the chat opens', (await can(U.A, U.C)) === true);
  const rel2 = Object.fromEntries((await as(U.A, `select id, relation from message_contacts()`)).map((c) => [c.id, c.relation]));
  check('the new friend shows up once (no duplicates)', rel2[U.C] === 'friend' && Object.keys(rel2).length === 3, JSON.stringify(rel2));
  const old = await as(U.A, `select id from mutual_followers()`);
  check('old app list includes friends too', old.length === 3 && old.some((r) => r.id === U.B));
  const none = await as(U.E, `select id from message_contacts()`);
  check('someone with no friends sees nobody', none.length === 0);

  // صندوق الرسائل
  const inbox = await as(U.A, `select other_id, can_message, unread from inbox()`);
  const b = inbox.find((r) => r.other_id === U.B);
  check('inbox shows the friend chat as open with 1 unread', b && b.can_message === true && Number(b.unread) === 1, JSON.stringify(inbox));

  // إلغاء الصداقة يقفل الجديد ويخلي القديم
  await as(U.B, `delete from friendships where (requester = $1 and addressee = $2)`, [U.A, U.B]);
  check('after unfriending the chat closes', (await can(U.A, U.B)) === false);
  await expectErr('new messages refused after unfriending', () => send(U.A, U.B, 'باقي؟'), /row-level security/);
  const kept = await as(U.A, `select count(*)::int n from messages where $1 in (sender, recipient) and $2 in (sender, recipient)`, [U.A, U.B]);
  check('old messages stay readable', kept[0].n === 2);
})().catch((e) => { console.error(e); process.exit(1); });
