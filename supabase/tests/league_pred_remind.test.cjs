// تذكير التوقعات: قبل مباريات فريقك بثلاث ساعات لو ما توقعت (مرة لكل موعد، ويقدر يطفيه)،
// وسطر التوقع في تذكير البداية (توقعك، أو الحق توقّع)
// التشغيل: node supabase/tests/league_pred_remind.test.cjs
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, U } = await setup();
  const iso = (mins) => new Date(Date.now() + mins * 60e3).toISOString();
  const teams = [{ id: 2932, name: 'Al-Hilal Saudi FC' }, { id: 2939, name: 'Al-Nassr' }, { id: 2938, name: 'Al-Ittihad FC' }];
  const ingest = (matches) => q(`select league_ingest('full', 2026, $1::jsonb, $2::jsonb, '[]'::jsonb, null, null)`, [JSON.stringify(teams), JSON.stringify(matches)]);
  const M = {
    m1: { id: 6001, league: 307, season: 2026, kickoff: iso(150), status: 'NS', home: 2932, away: 2939, venue: 'Kingdom Arena' }, // وقت تذكير التوقع
    m2: { id: 6002, league: 307, season: 2026, kickoff: iso(40), status: 'NS', home: 2938, away: 2932 },  // وقت تذكير البداية
    m3: { id: 6003, league: 307, season: 2026, kickoff: iso(300), status: 'NS', home: 2939, away: 2938 }, // بعيدة
    m4: { id: 6004, league: 307, season: 2026, kickoff: iso(120), status: 'TBD', home: 2938, away: 2939 }, // وقتها غير مؤكد
  };
  await ingest(Object.values(M));
  const predRemind = async () => (await q(`select _league_pred_remind() as n`))[0].n;
  const remind = async () => (await q(`select _league_remind() as n`))[0].n;
  const predict = (uid, m, h, a) => as(uid, `select league_predict($1, $2, $3)`, [m, h, a]);
  const notices = async (uid, like) => (await q(`select data from notifications where user_id = $1 and data->>'key' like $2 order by id`, [uid, like])).map((r) => r.data);

  // أ وم يشجعون الهلال، ب النصر، ج الاتحاد. هـ يشجع الهلال وحسابه موقوف
  const fan = (uid, team) => q(`insert into league_fans (user_id, team_id) values ($1, $2) on conflict (user_id) do update set team_id = $2`, [uid, team]);
  await fan(U.A, 2932); await fan(U.B, 2939); await fan(U.C, 2938); await fan(U.D, 2932); await fan(U.E, 2932);
  await q(`insert into suspensions (user_id, until) values ($1, now() + interval '1 day')`, [U.E]);
  // أ صديق ب ود. ج غريب
  await q(`insert into friendships (requester, addressee, status) values ($1, $2, 'accepted'), ($1, $3, 'accepted')`, [U.A, U.B, U.D]);

  // ---------- الإعداد من التطبيق ----------
  check('prediction reminders are on by default', (await as(U.A, `select pred_remind from league_fans`))[0].pred_remind === true);
  await as(U.D, `update league_fans set pred_remind = false where user_id = $1`, [U.D]);
  check('a fan turns them off', (await q(`select pred_remind from league_fans where user_id = $1`, [U.D]))[0].pred_remind === false);
  await as(U.A, `update league_fans set pred_remind = false where user_id = $1`, [U.B]).catch(() => {});
  check('…but never for someone else', (await q(`select pred_remind from league_fans where user_id = $1`, [U.B]))[0].pred_remind === true);

  // ---------- تذكير التوقع ----------
  await predict(U.B, 6001, 1, 2);   // ب توقّع (صديق أ)
  await predict(U.C, 6001, 0, 0);   // ج غريب
  await predict(U.D, 6001, 2, 2);   // د صديق أ بس محظور
  await q(`insert into user_blocks (blocker, blocked) values ($1, $2)`, [U.A, U.D]);
  const n1 = await predRemind();
  check('only fans who have not predicted get it (not B who did, D who turned it off, suspended E, or C)', n1 === 1, String(n1));
  const a1 = await notices(U.A, 'league-pred:6001:%');
  check('text: teams, Riyadh time and the match link', a1.length === 1 && a1[0].title_ar === 'وش توقعك؟ الهلال × النصر ⚽'
    && /الساعة \d{1,2}:\d{2} [صم]/.test(a1[0].body_ar) && a1[0].url === '/league/6001' && a1[0].title_en.startsWith('Your prediction? Al-Hilal'), JSON.stringify(a1[0]));
  check('…and how many friends predicted (not strangers, not blocked)', a1[0].body_ar.startsWith('واحد من أصدقائك توقّع، وأنت؟')
    && a1[0].body_en.startsWith('1 friend has predicted. Your turn?') && !a1[0].body_ar.includes('1 - 2'), a1[0].body_ar);
  const none = async (uid) => (await notices(uid, 'league-pred:%')).length === 0;
  check('nobody else got one', await none(U.B) && await none(U.C) && await none(U.D) && await none(U.E));
  check('a second run sends nothing again', await predRemind() === 0);
  check('a match inside the kick-off reminder window gets no separate prediction reminder', (await notices(U.A, 'league-pred:6002:%')).length === 0
    && (await notices(U.C, 'league-pred:6002:%')).length === 0);
  check('a far match and a TBD time are not reminded', (await notices(U.B, 'league-pred:6003:%')).length === 0 && (await notices(U.C, 'league-pred:6004:%')).length === 0);

  // تأجيل: موعد جديد ← تذكير جديد، إلا لو توقّع
  await ingest([{ ...M.m1, kickoff: iso(170) }]);
  check('a new kick-off time reminds again', await predRemind() === 1 && (await notices(U.A, 'league-pred:6001:%')).length === 2);
  await predict(U.A, 6001, 3, 1);
  await ingest([{ ...M.m1, kickoff: iso(160) }]);
  check('…but not once they predicted', await predRemind() === 0 && (await notices(U.A, 'league-pred:6001:%')).length === 2);

  // ---------- تذكير البداية فيه سطر التوقع (ومعه تذكير التوقع للمباريات الجاية) ----------
  await as(U.B, `insert into league_reminders (match_id) values (6002)`);   // ب طلب «ذكّرني» على مباراة مو لفريقه
  await predict(U.C, 6002, 1, 0);
  await ingest([{ id: 6005, league: 307, season: 2026, kickoff: iso(120), status: 'NS', home: 2939, away: 2938 }]);
  const n2 = await remind();
  check('kick-off reminders (B asked, C, A, D, E fans) plus prediction reminders for 6005 (B, C)', n2 === 7, String(n2));
  const k = async (uid) => (await notices(uid, 'league-remind:6002:%'))[0];
  const kc = await k(U.C);
  check('it shows my pick', kc.body_ar.endsWith('توقعك 1 - 0، لا تفوتها!') && kc.body_en.endsWith('Your pick: 1-0.') && /^تبدأ الساعة \d{1,2}:\d{2} [صم]\. /.test(kc.body_ar), JSON.stringify(kc));
  check('or nudges me to predict', (await k(U.A)).body_ar.endsWith('الحق سجّل توقعك قبل البداية ⚽') && (await k(U.A)).body_en.includes('still time')
    && (await k(U.B)).body_ar.endsWith('الحق سجّل توقعك قبل البداية ⚽'));
  check('no nudge when turned off or suspended (the old text)', (await k(U.D)).body_ar.endsWith('. لا تفوتها!') && (await k(U.E)).body_ar.endsWith('. لا تفوتها!')
    && (await k(U.D)).body_en.endsWith('(Riyadh).'), JSON.stringify(await k(U.D)));
  const p5 = await notices(U.B, 'league-pred:6005:%');
  check('with no friend predictions the reminder gives the points', p5.length === 1 && p5[0].body_ar.startsWith('تبدأ الساعة ') && p5[0].body_ar.includes('+٣')
    && p5[0].title_ar === 'وش توقعك؟ النصر × الاتحاد ⚽' && (await notices(U.C, 'league-pred:6005:%')).length === 1, JSON.stringify(p5));
  check('everything once', await remind() === 0);

  // ---------- وقت تذكير البداية ٣ ساعات أو أكثر: يكفي (فيه سطر التوقع) ----------
  await ingest([{ id: 6006, league: 307, season: 2026, kickoff: iso(170), status: 'NS', home: 2932, away: 2938 }]);
  await q(`update app_settings set value = jsonb_set(value, '{remind_minutes}', '200') where key = 'league'`);
  check('no separate prediction reminder when the kick-off one is that early', await predRemind() === 0);
  await q(`update app_settings set value = jsonb_set(value, '{remind_minutes}', '60') where key = 'league'`);
  check('back to an hour: the prediction reminder goes out (A and C)', await predRemind() === 2 && (await notices(U.A, 'league-pred:6006:%')).length === 1
    && (await notices(U.C, 'league-pred:6006:%')).length === 1);

  // بدون فريق: ما فيه تذكير توقع
  await as(U.A, `delete from league_fans where user_id = $1`, [U.A]);
  await ingest([{ id: 6007, league: 307, season: 2026, kickoff: iso(150), status: 'NS', home: 2932, away: 2939 }]);
  check('dropping the team stops prediction reminders', await predRemind() === 1 && (await notices(U.A, 'league-pred:6007:%')).length === 0
    && (await notices(U.B, 'league-pred:6007:%')).length === 1);
})().catch((e) => { console.error(e); process.exit(1); });
