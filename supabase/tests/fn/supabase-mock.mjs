// بديل supabase-js لاختبار دوال الخادم: ذاكرة barcode_products، الحد اليومي، والمستخدم من التوكن
export const state = (globalThis.__sbState ??= { cache: new Map(), quota: 30, rpcCalls: 0, upserts: [] });
export function createClient(url, key, opts = {}) {
  const auth = opts.global?.headers?.Authorization ?? '';
  return {
    auth: { getUser: async () => ({ data: { user: auth === 'Bearer good' ? { id: 'u1' } : null } }) },
    rpc: async (fn, args) => {
      state.rpcCalls++;
      if (fn !== 'ai_take' || args.p_kind !== 'barcode') return { data: null, error: { message: 'bad_status' } };
      if (state.quota <= 0) return { data: null, error: { message: 'rate_limited' } };
      state.quota--; return { data: state.quota, error: null };
    },
    from: (table) => {
      if (table !== 'barcode_products') throw new Error('unexpected table ' + table);
      let code = null;
      const b = {
        select: () => b,
        eq: (_c, v) => { code = v; return b; },
        maybeSingle: async () => ({ data: state.cache.get(code) ?? null, error: null }),
        upsert: async (row) => { state.upserts.push(row); state.cache.set(row.code, row); return { error: null }; },
      };
      return b;
    },
  };
}
