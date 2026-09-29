// صور الرسائل: الأصدقاء يرسلون صور، الحاوية خاصة بالطرفين، والصندوق يكتب «📷»
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U } = await setup();
  const friends = async (a, b) => {
    await as(a, `insert into friendships (requester, addressee) values ($1, $2)`, [a, b]);
    await as(b, `update friendships set status = 'accepted' where requester = $1 and addressee = $2`, [a, b]);
  };
  await friends(U.A, U.B);
  // C يتابع A والعكس، بس مو أصدقاء
  await as(U.A, `insert into follows (follower, followee) values ($1, $2)`, [U.A, U.C]);
  await as(U.C, `insert into follows (follower, followee) values ($1, $2)`, [U.C, U.A]);

  const sendImg = (from, to, path, body = '') => as(from,
    `insert into messages (sender, recipient, body, media_path, media_type, media_w, media_h) values ($1, $2, $3, $4, 'image', 1080, 1350) returning id, body`,
    [from, to, body, path]);

  // الرسالة
  const m1 = (await sendImg(U.A, U.B, `${U.A}/${U.B}/p1.jpg`))[0];
  check('a friend can send a photo without text', !!m1?.id && m1.body === '');
  const m2 = (await sendImg(U.A, U.B, `${U.A}/${U.B}/p2.jpg`, 'شوف الحديد الجديد 💪'))[0];
  check('photo with a caption', !!m2?.id);
  await expectErr('photo path must be in the sender folder for this friend', () => sendImg(U.A, U.B, `${U.B}/${U.A}/x.jpg`), /row-level security/);
  await expectErr('photo path for another person is refused', () => sendImg(U.A, U.B, `${U.A}/${U.C}/x.jpg`), /row-level security/);
  await expectErr('no photos to people you only follow', () => sendImg(U.A, U.C, `${U.A}/${U.C}/x.jpg`), /row-level security/);
  await expectErr('empty text without a photo is refused', () => as(U.A, `insert into messages (sender, recipient, body) values ($1, $2, '  ')`, [U.A, U.B]), /check constraint/);
  await expectErr('a photo needs its type', () => as(U.A, `insert into messages (sender, recipient, body, media_path) values ($1, $2, '', $3)`, [U.A, U.B, `${U.A}/${U.B}/p3.jpg`]), /check constraint/);
  await expectErr('no ../ in photo paths', () => sendImg(U.A, U.B, `${U.A}/${U.B}/../../x.jpg`), /check constraint|row-level security/);
  check('text messages still work', (await as(U.B, `insert into messages (sender, recipient, body) values ($1, $2, 'حلو!') returning id`, [U.B, U.A])).length === 1);
  await expectErr('recipient cannot swap the photo', () => as(U.B, `update messages set media_path = $2 where id = $1`, [m1.id, `${U.A}/${U.B}/other.jpg`]), /read_only_message/);
  check('recipient can still mark read', (await as(U.B, `update messages set read_at = now() where id = $1 returning id`, [m1.id])).length === 1);

  // الصندوق: آخر رسالة صورة بدون نص = 📷
  await sendImg(U.A, U.B, `${U.A}/${U.B}/p4.jpg`);
  const ib = await as(U.B, `select other_id, last_body, can_message from inbox()`);
  check('inbox shows 📷 for a photo', ib.length === 1 && ib[0].last_body === '📷' && ib[0].can_message === true, JSON.stringify(ib));
  const ibC = await as(U.C, `select other_id from inbox()`);
  check('people who only follow have no chat', ibC.length === 0);

  // الحاوية
  check('chat bucket is private', (await q(`select public from storage.buckets where id = 'chat'`))[0]?.public === false);
  await q(`alter table storage.objects enable row level security`);
  await q(`grant select, insert, update, delete on storage.objects to authenticated`);
  const up = (uid, name) => as(uid, `insert into storage.objects (bucket_id, name, owner) values ('chat', $1, $2) returning name`, [name, uid]);
  check('upload to my folder for a friend', (await up(U.A, `${U.A}/${U.B}/p1.jpg`)).length === 1);
  await expectErr('no upload into someone else folder', () => up(U.A, `${U.B}/${U.A}/x.jpg`), /row-level security/);
  await expectErr('no upload for someone I only follow', () => up(U.A, `${U.A}/${U.C}/x.jpg`), /row-level security/);
  await expectErr('no upload with a junk folder name', () => up(U.A, `${U.A}/not-a-user/x.jpg`), /row-level security/);
  check('the friend can open the photo', (await as(U.B, `select name from storage.objects where bucket_id = 'chat'`)).length === 1);
  check('others cannot see it', (await as(U.C, `select name from storage.objects where bucket_id = 'chat'`)).length === 0);
  check('the friend cannot delete my photo', (await as(U.B, `delete from storage.objects where bucket_id = 'chat' returning name`)).length === 0);
  check('I can delete my photo', (await as(U.A, `delete from storage.objects where bucket_id = 'chat' returning name`)).length === 1);

  // بعد إلغاء الصداقة: ما ينرفع جديد
  await as(U.B, `delete from friendships where requester = $1 and addressee = $2`, [U.A, U.B]);
  await expectErr('after unfriending no new photos', () => up(U.A, `${U.A}/${U.B}/p9.jpg`), /row-level security/);
})().catch((e) => { console.error(e); process.exit(1); });
