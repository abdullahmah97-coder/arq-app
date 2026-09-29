// إشعارات الساعة: تجميع حسب المحادثة/الفئة، زر الرد للرسائل، والإعجابات هادئة
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, check, U } = await setup();
  const x = async (kind, actor) => (await q(`select _push_extras($1, $2) e`, [kind, actor]))[0].e;
  const m = await x('message', U.A);
  check('messages grouped per chat with a reply button', m.threadId === `chat-${U.A}` && m.categoryId === 'message' && !m.interruptionLevel, JSON.stringify(m));
  const l = await x('post_like', U.B);
  check('likes are passive and grouped by category', l.interruptionLevel === 'passive' && l.threadId === 'activity' && !l.categoryId, JSON.stringify(l));
  const o = await x('gym_offer', null);
  check('offers grouped, normal alert level', o.threadId === 'offers' && !o.interruptionLevel && !o.categoryId, JSON.stringify(o));
  const src = (await q(`select prosrc from pg_proc where proname = '_push'`))[0].prosrc;
  check('_push uses the shared extras', /_push_extras\(p_kind, p_actor\)/.test(src));
  let err = null;
  try { await q(`select _push($1, 'message', $2, '{}'::jsonb, '/chat/x')`, [U.B, U.A]); } catch (e) { err = e; }
  check('_push still runs without pg_net (no error)', !err, err?.message ?? '');
})();
