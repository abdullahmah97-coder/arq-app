// بديل supabase-js لاختبار دالة generate-plan: الخطط، تقارير InBody، وصورة الجسم
export const plan = (globalThis.__sbPlan ??= {
  aiCount: 0, countFilters: [], updates: [], inserts: [], failInsert: 0, inbody: new Set(), photo: null, nextId: 1,
});
export function createClient(url, key, opts = {}) {
  const auth = opts.global?.headers?.Authorization ?? '';
  const user = auth === 'Bearer good' ? { id: 'u1' } : null;
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    storage: { from: () => ({ download: async (p) => ({ data: plan.photo && p === 'u1/body.jpg' ? plan.photo : null, error: null }) }) },
    from: (table) => {
      const q = { table, op: 'select', filters: [], row: null, opts: null };
      const chain = {
        select: (_c, o) => { if (q.op !== 'insert') { q.op = o?.head ? 'count' : 'select'; } q.opts = o; return chain; },
        update: (row) => { q.op = 'update'; q.row = row; return chain; },
        insert: (row) => { q.op = 'insert'; q.row = row; return chain; },
        eq: (c, v) => { q.filters.push(['eq', c, v]); return chain; },
        gte: (c, v) => { q.filters.push(['gte', c, v]); return chain; },
        is: (c, v) => { q.filters.push(['is', c, v]); return chain; },
        single: async () => run(),
        maybeSingle: async () => run(),
        then: (res, rej) => Promise.resolve(run()).then(res, rej),
      };
      function run() {
        if (table === 'plans' && q.op === 'count') { plan.countFilters.push(q.filters); return { count: plan.aiCount, data: null, error: null }; }
        if (table === 'plans' && q.op === 'update') { plan.updates.push({ row: q.row, filters: q.filters, at: plan.inserts.length }); return { data: null, error: null }; }
        if (table === 'plans' && q.op === 'insert') {
          if (plan.failInsert > 0) { plan.failInsert--; return { data: null, error: { message: 'duplicate key value violates unique constraint "plans_one_active"' } }; }
          plan.inserts.push(q.row); return { data: { id: `plan-${plan.nextId++}` }, error: null };
        }
        if (table === 'inbody_reports') {
          const id = q.filters.find((f) => f[1] === 'id')?.[2];
          const uid = q.filters.find((f) => f[1] === 'user_id')?.[2];
          return { data: plan.inbody.has(id) && uid === 'u1' ? { id } : null, error: null };
        }
        throw new Error('unexpected ' + table + ' ' + q.op);
      }
      return chain;
    },
  };
}
