// بديل supabase-js لاختبار دوال الخادم: ذاكرة barcode_products، الحد اليومي، والمستخدم من التوكن
// وتسجيل التوكنات (ai_usage_note → notes)
export const state = (globalThis.__sbState ??= { cache: new Map(), quota: 30, rpcCalls: 0, upserts: [], notes: [] });
// who: مين نادى (user = بتوكن المستخدم، service = مفتاح الخدمة). ai_take و ai_usage_note يعتمدون auth.uid():
// بمفتاح الخدمة auth.uid() فاضي فالقاعدة ترفض ai_take، و ai_usage_note ما يسوي شي بصمت (notes تسجّل who عشان الاختبار يكشفه)
export function createClient(url, key, opts = {}) {
  const auth = opts.global?.headers?.Authorization ?? '';
  const who = auth === 'Bearer good' ? 'user' : key === 'srv' ? 'service' : 'anon';
  return {
    auth: { getUser: async () => ({ data: { user: auth === 'Bearer good' ? { id: 'u1' } : null } }) },
    rpc: async (fn, args) => {
      state.rpcCalls++;
      if (fn === 'ai_usage_note') { state.notes.push(args); state.noteWho = [...(state.noteWho ?? []), who]; return { data: null, error: null }; }
      if (who !== 'user') return { data: null, error: { message: 'not_authenticated' } };
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
