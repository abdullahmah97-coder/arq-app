// أداة مشتركة لاختبارات ميزات الشركاء: تشغّل كل الترحيلات على PGlite مع بدائل Supabase
// Shared harness for partner-feature tests (same setup as db.test.cjs, which stays untouched).
const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const U = {
  A: '11111111-1111-1111-1111-111111111111',
  B: '22222222-2222-2222-2222-222222222222',
  C: '33333333-3333-3333-3333-333333333333',
  D: '44444444-4444-4444-4444-444444444444',
  E: '55555555-5555-5555-5555-555555555555',
};

const stubs = `
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid);
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name,'/') $$;
grant usage on schema public, auth, storage to authenticated, anon;
`;

async function setup() {
  const db = new PGlite();
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  const as = async (uid, sql, params) => {
    await db.exec(`reset role; select set_config('request.jwt.sub', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
    try { return await q(sql, params); } finally { await db.exec(`reset role; select set_config('request.jwt.sub', '', false);`); }
  };
  let failed = 0;
  const check = (label, cond, extra = '') => { console.log(cond ? 'ok  ' : 'FAIL', label, extra); if (!cond) { failed++; process.exitCode = 1; } };
  const expectErr = async (label, fn, pattern) => {
    try { await fn(); console.log('FAIL (no error):', label); failed++; process.exitCode = 1; }
    catch (e) { const ok = pattern.test(e.message); console.log(ok ? 'ok  ' : 'FAIL', label, '->', e.message); if (!ok) { failed++; process.exitCode = 1; } }
  };

  await db.exec(stubs);
  for (const f of fs.readdirSync(`${ROOT}/migrations`).sort()) {
    try { await db.exec(fs.readFileSync(`${ROOT}/migrations/${f}`, 'utf8')); }
    catch (e) { console.log('FAIL migration', f, '->', e.message); process.exit(1); }
  }
  await db.exec(fs.readFileSync(`${ROOT}/seed.sql`, 'utf8'));
  await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;
                 revoke update on public.profiles from authenticated;
                 grant update (username, full_name, avatar_url, bio, gym_id, locale, onboarded, presence_visibility, notify_prefs, cover, cover_url) on public.profiles to authenticated;
                 revoke insert, update on public.program_adopts from authenticated;
                 revoke insert, update, delete on public.app_admins from authenticated;`);
  await q(`insert into auth.users (id, raw_user_meta_data) values
    ($1, '{"username":"ahmed","full_name":"Ahmed","gender":"male"}'),
    ($2, '{"username":"sara","full_name":"Sara","gender":"female"}'),
    ($3, '{"username":"khalid"}'),
    ($4, '{"username":"manager1","full_name":"Gym Manager"}'),
    ($5, '{"username":"admin1"}')`, [U.A, U.B, U.C, U.D, U.E]);
  await q(`insert into app_admins (user_id) values ($1)`, [U.E]);
  const gym = (await q(`select * from gyms where verified order by name limit 1`))[0];
  await q(`insert into gym_managers (gym_id, user_id) values ($1, $2)`, [gym.id, U.D]);
  // check-in helper that skips GPS math: direct insert (tests of check_in itself live in db.test.cjs)
  const visit = (uid, gymId, when = "now() - interval '1 day'") =>
    q(`insert into check_ins (user_id, gym_id, checked_in_at, checked_out_at) values ($1, $2, ${when}, ${when} + interval '1 hour') returning id`, [uid, gymId]);
  console.log('ok   migrations + seed applied');
  return { db, q, as, check, expectErr, U, gym, visit, failed: () => failed };
}

module.exports = { setup };
