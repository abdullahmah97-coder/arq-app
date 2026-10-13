// بديل supabase-js لاختبار دالة moderate: طابور في الذاكرة ونداءات rpc مسجّلة
export const db = (globalThis.__automodState ??= {
  key: 'secret-key',
  keyError: null,
  batches: [],        // كل نداء moderation_claim ياخذ أول دفعة
  claimError: null,
  settleError: null,
  calls: [],          // { fn, args }
});

export function createClient(_url, key) {
  const service = key === 'service';
  return {
    rpc: async (fn, args) => {
      db.calls.push({ fn, args });
      if (!service) return { data: null, error: { message: 'permission denied' } };
      if (fn === 'moderation_key_ok') {
        if (db.keyError) return { data: null, error: { message: db.keyError } };
        return { data: args.p_key === db.key, error: null };
      }
      if (fn === 'moderation_claim') {
        if (db.claimError) return { data: null, error: { message: db.claimError } };
        return { data: (db.batches.shift() ?? []).slice(0, args.p_limit), error: null };
      }
      if (fn === 'moderation_settle') {
        if (db.settleError) return { data: null, error: { message: db.settleError } };
        return { data: { flagged: args.p_result === 'unsafe' || args.p_result === 'controversial' }, error: null };
      }
      if (fn === 'moderation_retry') return { data: null, error: null };
      return { data: null, error: { message: `unknown rpc ${fn}` } };
    },
  };
}
