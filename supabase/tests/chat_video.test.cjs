// فيديو في الرسائل: النوع والمدة، الصندوق يكتب «🎥»، والمستلم ما يغيّر شي
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U } = await setup();
  await as(U.A, `insert into friendships (requester, addressee) values ($1, $2)`, [U.A, U.B]);
  await as(U.B, `update friendships set status = 'accepted' where requester = $1 and addressee = $2`, [U.A, U.B]);
  const send = (type, dur, path = `${U.A}/${U.B}/v1.mp4`) => as(U.A,
    `insert into messages (sender, recipient, body, media_path, media_type, media_w, media_h, media_dur) values ($1, $2, '', $3, $4, 720, 1280, $5) returning id`,
    [U.A, U.B, path, type, dur]);

  const v = (await send('video', 23.5))[0];
  check('a friend can send a video with its length', !!v?.id);
  await expectErr('photos have no length', () => send('image', 12, `${U.A}/${U.B}/p1.jpg`), /check constraint/);
  await expectErr('videos longer than 10 minutes are refused', () => send('video', 700, `${U.A}/${U.B}/v2.mp4`), /check constraint/);
  await expectErr('unknown media types are refused', () => send('audio', null, `${U.A}/${U.B}/a1.m4a`), /check constraint/);
  check('photos still work', (await send('image', null, `${U.A}/${U.B}/p2.jpg`)).length === 1);
  await send('video', 8, `${U.A}/${U.B}/v3.mp4`);
  const ib = await as(U.B, `select last_body from inbox()`);
  check('inbox shows 🎥 for a video', ib[0]?.last_body === '🎥', JSON.stringify(ib));
  await expectErr('recipient cannot change the video length', () => as(U.B, `update messages set media_dur = 1 where id = $1`, [v.id]), /read_only_message/);
  check('recipient can mark it read', (await as(U.B, `update messages set read_at = now() where id = $1 returning id`, [v.id])).length === 1);
  await expectErr('no videos to strangers', () => as(U.C,
    `insert into messages (sender, recipient, body, media_path, media_type, media_dur) values ($1, $2, '', $3, 'video', 5)`, [U.C, U.A, `${U.C}/${U.A}/v.mp4`]), /row-level security/);
})().catch((e) => { console.error(e); process.exit(1); });
