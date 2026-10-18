// بديل supabase-js لاختبار دالة league-sync: مفتاح القاعدة، الإعداد، مباريات تنتظر المتابعة، ونداءات league_ingest
export const db = (globalThis.__leagueState ??= {
  key: 'league-secret',
  keyError: null,
  settings: { enabled: true, league_id: 307, remind_minutes: 60, live_every_min: 5, full_every_hours: 3, tickets_url: 'https://webook.com/ar/spl' },
  ingestError: null,
  // صفوف league_matches اللي ترجع للدالة (id, kickoff, status, source_ref)، والفلترة بالوقت تصير هنا مثل القاعدة
  matches: [],
  matchesError: null,
  calls: [],
});

function matchesQuery() {
  const f = { gte: null, lte: null, notNullRef: false, limit: 1000 };
  const b = {
    select: () => b,
    gte: (c, v) => { if (c === 'kickoff') f.gte = v; return b; },
    lte: (c, v) => { if (c === 'kickoff') f.lte = v; return b; },
    not: (c, op, v) => { if (c === 'source_ref' && op === 'is' && v === null) f.notNullRef = true; return b; },
    order: () => b,
    limit: (n) => { f.limit = n; return b; },
    then: (resolve, reject) => {
      db.calls.push({ fn: 'league_matches', args: { ...f } });
      if (db.matchesError) return Promise.resolve({ data: null, error: { message: db.matchesError } }).then(resolve, reject);
      const rows = db.matches
        .filter((m) => (!f.gte || m.kickoff >= f.gte) && (!f.lte || m.kickoff <= f.lte) && (!f.notNullRef || m.source_ref != null))
        .sort((a, z) => a.kickoff.localeCompare(z.kickoff))
        .slice(0, f.limit);
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    },
  };
  return b;
}

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
      if (table === 'league_matches') return matchesQuery();
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
