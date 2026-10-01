// بديل supabase-js لاختبار دالة generate-plan: الخطط (صفوف حقيقية بالذاكرة)، تقارير InBody، وصورة الجسم،
// وحجز محاولة الذكاء الاصطناعي (ai_take) — takeError يحاكي رد القاعدة (rate_limited / bad_status / عطل)
export const plan = (globalThis.__sbPlan ??= {
  aiCount: 0, countError: null, countFilters: [], updates: [], inserts: [], rows: [],
  failInsert: 0, commitThenFail: 0, failActivate: 0, inbody: new Set(), photo: null, nextId: 1,
  rpcCalls: [], takeError: null,
});

const field = (row, col) => (col === 'data->>request_id' ? row.data?.request_id : row[col]);
function matches(row, filters) {
  return filters.every(([op, c, v]) => {
    const x = field(row, c);
    if (op === 'eq') return x === v;
    if (op === 'neq') return x !== v;
    if (op === 'gt') return String(x) > String(v);
    if (op === 'gte') return String(x) >= String(v);
    if (op === 'is') return true;
    return false;
  });
}

export function createClient(url, key, opts = {}) {
  const auth = opts.global?.headers?.Authorization ?? '';
  const user = auth === 'Bearer good' ? { id: 'u1' } : null;
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    rpc: async (fn, args) => {
      plan.rpcCalls.push({ fn, args, seq: (globalThis.__seq = (globalThis.__seq ?? 0) + 1) });
      return plan.takeError ? { data: null, error: { message: plan.takeError } } : { data: 7, error: null };
    },
    storage: { from: () => ({ download: async (p) => ({ data: plan.photo && p === 'u1/body.jpg' ? plan.photo : null, error: null }) }) },
    from: (table) => {
      const q = { table, op: 'select', filters: [], row: null, opts: null, limit: null, single: false };
      const chain = {
        select: (_c, o) => { if (q.op !== 'insert') { q.op = o?.head ? 'count' : 'select'; } q.opts = o; return chain; },
        update: (row) => { q.op = 'update'; q.row = row; return chain; },
        insert: (row) => { q.op = 'insert'; q.row = row; return chain; },
        eq: (c, v) => { q.filters.push(['eq', c, v]); return chain; },
        neq: (c, v) => { q.filters.push(['neq', c, v]); return chain; },
        gt: (c, v) => { q.filters.push(['gt', c, v]); return chain; },
        gte: (c, v) => { q.filters.push(['gte', c, v]); return chain; },
        is: (c, v) => { q.filters.push(['is', c, v]); return chain; },
        limit: (n) => { q.limit = n; return chain; },
        single: async () => { q.single = true; return run(); },
        maybeSingle: async () => { q.single = true; return run(); },
        then: (res, rej) => Promise.resolve(run()).then(res, rej),
      };
      function run() {
        if (table === 'plans' && q.op === 'count') {
          plan.countFilters.push(q.filters);
          return plan.countError ? { count: null, data: null, error: { message: plan.countError } } : { count: plan.aiCount, data: null, error: null };
        }
        if (table === 'plans' && q.op === 'update') {
          plan.updates.push({ row: q.row, filters: q.filters, at: plan.inserts.length });
          if (q.row.active === true && plan.failActivate > 0) { plan.failActivate--; return { data: null, error: { message: 'activate failed' } }; }
          for (const r of plan.rows) if (matches(r, q.filters)) Object.assign(r, q.row);
          return { data: null, error: null };
        }
        if (table === 'plans' && q.op === 'insert') {
          if (plan.failInsert > 0) { plan.failInsert--; return { data: null, error: { message: 'duplicate key value violates unique constraint "plans_one_active"' } }; }
          const row = { id: `plan-${plan.nextId++}`, created_at: new Date().toISOString(), ...q.row };
          plan.inserts.push(q.row); plan.rows.push(row);
          if (plan.commitThenFail > 0) { plan.commitThenFail--; return { data: null, error: { message: 'connection reset (row was saved)' } }; }
          return { data: { id: row.id }, error: null };
        }
        if (table === 'plans' && q.op === 'select') {
          const found = plan.rows.filter((r) => matches(r, q.filters)).slice(0, q.limit ?? undefined).map((r) => ({ id: r.id }));
          return { data: q.single ? found[0] ?? null : found, error: null };
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
