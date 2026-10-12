// بديل supabase-js لاختبار دالة moderate-post: منشورات في الذاكرة، الحد اليومي، التخزين، والتحديث بصلاحية الخادم
export const db = (globalThis.__modState ??= {
  posts: new Map(),     // id → { id, user_id, image_path, caption, screen, hidden_at, hidden_reason }
  files: new Map(),     // path → { bytes: Uint8Array, type }
  quota: 40,
  takeError: null,
  rpcCalls: [],
  updates: [],
});

export function createClient(_url, key, opts = {}) {
  const auth = opts.global?.headers?.Authorization ?? '';
  const user = auth === 'Bearer good' ? { id: 'u1' } : auth === 'Bearer other' ? { id: 'u2' } : null;
  const service = key === 'service';
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    rpc: async (fn, args) => {
      db.rpcCalls.push({ fn, args });
      if (db.takeError) return { data: null, error: { message: db.takeError } };
      if (db.quota <= 0) return { data: null, error: { message: 'rate_limited' } };
      db.quota--; return { data: db.quota, error: null };
    },
    storage: {
      from: (bucket) => ({
        download: async (path) => {
          const f = bucket === 'posts' && service ? db.files.get(path) : null;
          if (!f) return { data: null, error: { message: 'not found' } };
          return { data: new Blob([f.bytes], { type: f.type }), error: null };
        },
      }),
    },
    from: (table) => {
      if (table !== 'posts') throw new Error('unexpected table ' + table);
      const filters = [];
      let patch = null;
      const rows = () => [...db.posts.values()].filter((r) => filters.every(([c, v]) => r[c] === v));
      const b = {
        select: () => b,
        eq: (c, v) => { filters.push([c, v]); return patch ? run() : b; },
        maybeSingle: async () => {
          // بصلاحية المستخدم: يشوف منشوره، ومنشورات غيره بس لو ظاهرة
          const r = rows()[0];
          const visible = r && (service || r.user_id === user?.id || r.screen === 'ok');
          return { data: visible ? { ...r } : null, error: null };
        },
        update: (p) => { patch = p; return b; },
      };
      // update(...).eq(id).eq(screen) — ينفّذ بعد الشرط الثاني
      let pending = 0;
      const run = () => {
        pending++;
        if (pending < 2) return b;
        if (!service) return Promise.resolve({ error: { message: 'permission denied' } });
        for (const r of rows()) { Object.assign(r, patch); db.updates.push({ id: r.id, ...patch }); }
        return Promise.resolve({ error: null });
      };
      return b;
    },
  };
}
