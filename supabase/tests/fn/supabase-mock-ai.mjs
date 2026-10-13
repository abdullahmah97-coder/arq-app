// بديل supabase-js لاختبار دالتي coach و analyze-inbody: المستخدم من التوكن، الحد اليومي (ai_take لكل نوع)،
// تسجيل التوكنات (ai_usage_note)، ملفات حاوية inbody، والحد القديم قبل الترحيل (عدّ inbody_reports و coach_log)
export const ai = (globalThis.__sbAi ??= {});
export function reset() {
  Object.assign(ai, {
    rpcCalls: [], quota: { coach: 40, inbody: 10 }, takeError: null, noteError: null, noteThrows: false,
    files: new Map(), counts: { inbody_reports: 0, coach_log: 0 }, inserts: [], queries: [],
  });
}
reset();

export function createClient(url, key, opts = {}) {
  const auth = opts.global?.headers?.Authorization ?? '';
  const user = auth === 'Bearer good' ? { id: 'u1' } : null;
  // who: مين نادى (user = بتوكن المستخدم). القاعدة تعتمد auth.uid(): بدون مستخدم ai_take يرفض و ai_usage_note ما يسوي شي
  const who = user ? 'user' : opts.global ? 'anon' : 'service';
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    rpc: async (fn, args) => {
      ai.rpcCalls.push({ fn, args, who, seq: (globalThis.__seq = (globalThis.__seq ?? 0) + 1) });
      if ((fn === 'ai_take' || fn === 'ai_usage_note') && who !== 'user') return { data: null, error: fn === 'ai_take' ? { message: 'not_authenticated' } : null };
      if (fn === 'ai_usage_note') {
        if (ai.noteThrows) throw new Error('network down');
        return ai.noteError ? { data: null, error: { message: ai.noteError } } : { data: null, error: null };
      }
      if (fn !== 'ai_take') return { data: null, error: { message: 'unknown rpc' } };
      if (ai.takeError) return { data: null, error: { message: ai.takeError } };
      const left = ai.quota[args.p_kind];
      if (left === undefined) return { data: null, error: { message: 'bad_status' } };
      if (left <= 0) return { data: null, error: { message: 'rate_limited' } };
      ai.quota[args.p_kind] = left - 1;
      return { data: left - 1, error: null };
    },
    storage: {
      from: (bucket) => ({
        download: async (path) => {
          const f = ai.files.get(`${bucket}/${path}`);
          return f ? { data: f, error: null } : { data: null, error: { message: 'Object not found' } };
        },
      }),
    },
    from: (table) => {
      const q = { table, op: 'select', filters: [], row: null };
      ai.queries.push(q);
      const chain = {
        select: (_c, o) => { q.op = o?.head ? 'count' : 'select'; return chain; },
        insert: (row) => { q.op = 'insert'; q.row = row; ai.inserts.push({ table, row }); ai.counts[table] = (ai.counts[table] ?? 0) + 1; return chain; },
        eq: (c, v) => { q.filters.push(['eq', c, v]); return chain; },
        gte: (c, v) => { q.filters.push(['gte', c, v]); return chain; },
        then: (res, rej) => Promise.resolve(q.op === 'count' ? { count: ai.counts[table] ?? 0, data: null, error: null } : { data: null, error: null }).then(res, rej),
      };
      return chain;
    },
  };
}
