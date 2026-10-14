// بديل supabase-js لاختبار دالة league-sync: مفتاح القاعدة، الإعداد، ونداءات league_ingest
export const db = (globalThis.__leagueState ??= {
  key: 'league-secret',
  keyError: null,
  settings: { enabled: true, league_id: 307, remind_minutes: 60, live_every_min: 5, full_every_hours: 3, tickets_url: 'https://webook.com/ar/spl' },
  ingestError: null,
  calls: [],
});

export function createClient(_url, key) {
  const service = key === 'service';
  return {
    rpc: async (fn, args) => {
      db.calls.push({ fn, args });
      if (!service) return { data: null, error: { message: 'permission denied' } };
      if (fn === 'league_key_ok') {
        if (db.keyError) return { data: null, error: { message: db.keyError } };
        return { data: args.p_key === db.key, error: null };
      }
      if (fn === 'league_ingest') {
        if (db.ingestError) return { data: null, error: { message: db.ingestError } };
        if (args.p_error) return { data: { ok: false }, error: null };
        return { data: { ok: true, teams: args.p_teams.length, matches: args.p_matches.length, finished: 0 }, error: null };
      }
      return { data: null, error: { message: 'unknown function ' + fn } };
    },
    from: (table) => {
      if (table !== 'app_settings') throw new Error('unexpected table ' + table);
      const f = {};
      const b = {
        select: () => b,
        eq: (c, v) => { f[c] = v; return b; },
        maybeSingle: async () => {
          db.calls.push({ fn: 'settings', args: f });
          return { data: f.key === 'league' && db.settings ? { value: db.settings } : null, error: null };
        },
      };
      return b;
    },
  };
}
