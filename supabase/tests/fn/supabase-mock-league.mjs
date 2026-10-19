// بديل supabase-js لاختبار دالة league-sync: مفتاح القاعدة، الإعداد، مباريات تنتظر المتابعة، ونداءات league_ingest
export const db = (globalThis.__leagueState ??= {
  key: 'league-secret',
  keyError: null,
  settings: { enabled: true, league_id: 307, remind_minutes: 60, live_every_min: 5, full_every_hours: 3, tickets_url: 'https://webook.com/ar/spl' },
  ingestError: null,
  // صفوف league_matches اللي ترجع للدالة (id, kickoff, status, source_ref)، والفلترة بالوقت تصير هنا مثل القاعدة
  matches: [],
  matchesError: null,
  detailsError: null,
  // أسماء تنتظر اسم عربي (league_names_todo)
  namesTodo: [],
  calls: [],
});

function matchesQuery() {
  const f = { gte: null, lte: null, notNullRef: false, limit: 1000, eq: {}, in: {}, isNull: [], asc: true };
  const b = {
    select: () => b,
    gte: (c, v) => { if (c === 'kickoff') f.gte = v; return b; },
    lte: (c, v) => { if (c === 'kickoff') f.lte = v; return b; },
    eq: (c, v) => { f.eq[c] = v; return b; },
    in: (c, v) => { f.in[c] = v; return b; },
    is: (c, v) => { if (v === null) f.isNull.push(c); return b; },
    not: (c, op, v) => { if (c === 'source_ref' && op === 'is' && v === null) f.notNullRef = true; return b; },
    order: (_c, o) => { f.asc = o?.ascending !== false; return b; },
    limit: (n) => { f.limit = n; return b; },
    then: (resolve, reject) => {
      db.calls.push({ fn: 'league_matches', args: { ...f } });
      if (db.matchesError) return Promise.resolve({ data: null, error: { message: db.matchesError } }).then(resolve, reject);
      const rows = db.matches
        .filter((m) => (!f.gte || m.kickoff >= f.gte) && (!f.lte || m.kickoff <= f.lte) && (!f.notNullRef || m.source_ref != null)
          && Object.entries(f.eq).every(([c, v]) => m[c] === v) && Object.entries(f.in).every(([c, v]) => v.includes(m[c]))
          && f.isNull.every((c) => m[c] == null))
        .sort((a, z) => (f.asc ? 1 : -1) * a.kickoff.localeCompare(z.kickoff))
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
      if (fn === 'league_ingest_details') {
        if (db.detailsError) return { data: null, error: { message: db.detailsError } };
        return { data: { ok: true, details: args.p_details.length, scorers: !!args.p_scorers }, error: null };
      }
      if (fn === 'league_names_todo') return { data: db.namesTodo.slice(0, args.p_limit), error: null };
      if (fn === 'league_names_save') return { data: args.p_names.length, error: null };
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
