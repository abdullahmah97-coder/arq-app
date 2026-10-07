// بديل supabase-js لاختبار دالة office-agent: جداول بالذاكرة + فلاتر PostgREST اللي تستخدمها الدالة.
// الحالة على globalThis لأن esbuild يدمج نسخة ثانية من هذا الملف داخل الحزمة.
// التوكن: 'Bearer good' = المالك u1 (إدارة)، 'Bearer user' = مستخدم عادي u2، غيرها = بدون دخول.
// مفتاح 'srv' = عميل الخدمة؛ أي مفتاح ثاني = عميل المستخدم (كل استعلام ينسجّل مع نوع العميل، وكل عميل ينسجّل بـ clients).
// المكتب على الويب: officeKey = سر office_agent_key بالـ vault (null = ما انحفظ)، و office_agent_key_ok تجاوب
// لعميل الخدمة بس (مثل القاعدة)؛ keyError = الدالة ترجع خطأ (مثلاً الترحيل ما انطبق).
export const office = (globalThis.__sbOffice ??= {
  tables: {}, files: {}, queries: [], rpcCalls: [], clients: [],
  admins: ['u1'], takeLeft: Infinity, takeError: null, userStats: null, officeKey: null, keyError: null,
  /** { table: { op: 'select'|'insert'|'update', message, code } } → الاستعلام يرجع خطأ */
  fail: {},
  /** كم مرة يرجع الإدخال تعارض الفهرس 23505 كأن تشغيلة ثانية سبقت (للاختبار) */
  conflictOnce: 0,
  nextId: 1,
});

const USERS = { 'Bearer good': { id: 'u1' }, 'Bearer user': { id: 'u2' } };
const OPEN = ['scheduled', 'in_progress', 'waiting_approval'];

/** يرجّع الحالة لبداية نظيفة (بين الاختبارات) */
export function reset(tables = {}) {
  Object.assign(office, {
    tables: structuredClone(tables), files: {}, queries: [], rpcCalls: [], clients: [],
    admins: ['u1'], takeLeft: Infinity, takeError: null, userStats: null, officeKey: null, keyError: null, fail: {}, conflictOnce: 0,
  });
}

const cmp = (a, b) => (a === b ? 0 : a === null || a === undefined ? -1 : b === null || b === undefined ? 1 : a < b ? -1 : 1);
function matches(row, filters) {
  return filters.every(([op, c, v]) => {
    const x = row[c];
    switch (op) {
      case 'eq': return x === v;
      case 'neq': return x !== v;
      case 'in': return v.includes(x);
      case 'is': return (x ?? null) === v;
      case 'lt': return x !== null && x !== undefined && cmp(x, v) < 0;
      case 'lte': return x !== null && x !== undefined && cmp(x, v) <= 0;
      case 'gt': return x !== null && x !== undefined && cmp(x, v) > 0;
      case 'gte': return x !== null && x !== undefined && cmp(x, v) >= 0;
      default: throw new Error('unsupported filter ' + op);
    }
  });
}

export function createClient(url, key, opts = {}) {
  const auth = opts.global?.headers?.Authorization ?? '';
  const client = key === 'srv' ? 'service' : 'user';
  const user = client === 'user' ? USERS[auth] ?? null : null;
  office.clients.push({ client, auth });
  return {
    auth: { getUser: async () => ({ data: { user }, error: user ? null : { message: 'invalid token' } }) },
    rpc: async (fn, args) => {
      office.rpcCalls.push({ fn, args, client, user: user?.id ?? null });
      const admin = !!user && office.admins.includes(user.id);
      if (fn === 'is_admin') return { data: admin, error: null };
      if (fn === 'ai_take') {
        if (!user) return { data: null, error: { message: 'not_authenticated' } };
        if (args?.p_kind !== 'office') return { data: null, error: { message: 'bad_status' } };
        if (office.takeError) return { data: null, error: { message: office.takeError } };
        if (office.takeLeft <= 0) return { data: null, error: { message: 'rate_limited' } };
        office.takeLeft--;
        return { data: Number.isFinite(office.takeLeft) ? office.takeLeft : 79, error: null };
      }
      if (fn === 'office_agent_key_ok') {
        if (office.keyError) return { data: null, error: { message: office.keyError } };
        return { data: client === 'service' && office.officeKey !== null && args?.p_key === office.officeKey, error: null };
      }
      if (fn === 'admin_user_stats') {
        if (!admin) return { data: null, error: { message: 'not_allowed' } };
        return { data: office.userStats ? [office.userStats] : [], error: null };
      }
      return { data: null, error: { message: 'unknown rpc ' + fn } };
    },
    storage: {
      from: (bucket) => ({
        download: async (path) => {
          office.queries.push({ table: `storage:${bucket}`, op: 'download', path, client });
          const f = office.files[`${bucket}/${path}`];
          return f ? { data: f, error: null } : { data: null, error: { message: 'Object not found' } };
        },
      }),
    },
    from: (table) => {
      const q = { table, client, op: 'select', cols: null, filters: [], order: [], limit: null, range: null, count: null, head: false, row: null, returning: false, single: false };
      const chain = {
        select: (cols, o) => { if (q.op === 'select') { q.cols = cols; q.count = o?.count ?? null; q.head = !!o?.head; } else q.returning = true; return chain; },
        insert: (row) => { q.op = 'insert'; q.row = row; return chain; },
        update: (row) => { q.op = 'update'; q.row = row; return chain; },
        eq: (c, v) => { q.filters.push(['eq', c, v]); return chain; },
        neq: (c, v) => { q.filters.push(['neq', c, v]); return chain; },
        in: (c, v) => { q.filters.push(['in', c, v]); return chain; },
        is: (c, v) => { q.filters.push(['is', c, v]); return chain; },
        lt: (c, v) => { q.filters.push(['lt', c, v]); return chain; },
        lte: (c, v) => { q.filters.push(['lte', c, v]); return chain; },
        gt: (c, v) => { q.filters.push(['gt', c, v]); return chain; },
        gte: (c, v) => { q.filters.push(['gte', c, v]); return chain; },
        order: (c, o) => { q.order.push([c, o?.ascending !== false]); return chain; },
        limit: (n) => { q.limit = n; return chain; },
        range: (a, b) => { q.range = [a, b]; return chain; },
        single: async () => { q.single = true; return run(); },
        maybeSingle: async () => { q.single = true; return run(); },
        then: (res, rej) => Promise.resolve().then(run).then(res, rej),
      };
      function run() {
        office.queries.push(structuredClone(q));
        const f = office.fail[table];
        if (f && (!f.op || f.op === q.op)) return { data: null, count: null, error: { message: f.message ?? 'db down', code: f.code } };
        const rows = (office.tables[table] ??= []);
        if (q.op === 'insert') {
          const list = Array.isArray(q.row) ? q.row : [q.row];
          for (const r of list) {
            const conflict = table === 'office_tasks' && r.target_id !== null &&
              rows.some((x) => x.kind === r.kind && x.target_kind === r.target_kind && x.target_id === r.target_id && OPEN.includes(x.status));
            if (conflict || office.conflictOnce > 0) {
              if (!conflict) office.conflictOnce--;
              return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "office_tasks_open_target"' } };
            }
          }
          const added = list.map((r) => ({ id: `task-${office.nextId++}`, created_at: new Date().toISOString(), finished_at: null, output: null, error: null, ...structuredClone(r) }));
          rows.push(...added);
          const data = q.returning ? added.map((r) => ({ id: r.id })) : null;
          return { data: q.single ? data?.[0] ?? null : data, error: null };
        }
        if (q.op === 'update') {
          const hit = rows.filter((r) => matches(r, q.filters));
          for (const r of hit) {
            // نفس حارس القاعدة: المهمة اللي خلصت ما تتعدّل
            if (table === 'office_tasks' && ['done', 'failed'].includes(r.status)) return { data: null, error: { message: 'task_locked' } };
          }
          for (const r of hit) {
            Object.assign(r, structuredClone(q.row));
            if (table === 'office_tasks' && ['waiting_approval', 'done', 'failed'].includes(r.status)) r.finished_at ??= new Date().toISOString();
          }
          return { data: null, error: null };
        }
        let found = rows.filter((r) => matches(r, q.filters));
        if (q.head) return { data: null, count: found.length, error: null };
        for (const [c, asc] of [...q.order].reverse()) found = [...found].sort((a, b) => (asc ? 1 : -1) * cmp(a[c], b[c]));
        if (q.range) found = found.slice(q.range[0], q.range[1] + 1);
        if (q.limit !== null) found = found.slice(0, q.limit);
        found = structuredClone(found);
        return { data: q.single ? found[0] ?? null : found, count: q.count ? found.length : null, error: null };
      }
      return chain;
    },
  };
}
