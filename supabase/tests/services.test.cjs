// اختبارات خدمات النادي: صلاحيات التعديل، افتراضي السلسلة، أصوات الزوار، وفلترة الدليل
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, as, check, expectErr, U, gym, visit } = await setup();
  const chain = (await q(`select id from gym_chains where slug = 'puregym'`))[0];
  await q(`update gyms set chain_id = $1 where id = $2`, [chain.id, gym.id]);

  // chain default from public info shows on the branch
  let s = await as(U.A, `select * from gym_services($1)`, [gym.id]);
  const h24 = s.find((r) => r.key === 'open_24h');
  check('chain default visible on branch', h24.available === true && h24.source === 'public_info', JSON.stringify(h24));
  check('unknown amenity is null', s.find((r) => r.key === 'pool').available === null);

  // strangers can't edit, gym manager can
  await expectErr('stranger cannot set amenity', () => as(U.A, `insert into gym_amenities (gym_id, amenity, available) values ($1, 'pool', true)`, [gym.id]), /row-level security/);
  await as(U.D, `insert into gym_amenities (gym_id, amenity, available, note) values ($1, 'pool', true, 'للرجال فقط')`, [gym.id]);
  await as(U.D, `insert into gym_amenities (gym_id, amenity, available) values ($1, 'open_24h', false)`, [gym.id]);
  s = await as(U.B, `select * from gym_services($1)`, [gym.id]);
  check('manager value shows with note', s.find((r) => r.key === 'pool').available === true && s.find((r) => r.key === 'pool').note === 'للرجال فقط');
  check('branch overrides chain default', s.find((r) => r.key === 'open_24h').available === false && s.find((r) => r.key === 'open_24h').source === 'gym');
  const by = (await q(`select updated_by from gym_amenities where gym_id=$1 and amenity='pool'`, [gym.id]))[0];
  check('updated_by recorded', by.updated_by === U.D);
  await expectErr('manager cannot edit chain defaults', () => as(U.D, `insert into chain_amenities (chain_id, amenity, available) values ($1, 'sauna', true)`, [chain.id]), /row-level security/);
  await as(U.E, `insert into chain_amenities (chain_id, amenity, available) values ($1, 'sauna', true)`, [chain.id]);
  check('admin edits chain defaults', (await as(U.A, `select * from gym_services($1)`, [gym.id])).find((r) => r.key === 'sauna').available === true);

  // chain manager can edit branches of their chain
  await q(`insert into chain_managers (chain_id, user_id) values ($1, $2)`, [chain.id, U.C]);
  await as(U.C, `insert into gym_amenities (gym_id, amenity, available) values ($1, 'parking', true)`, [gym.id]);
  check('chain manager edits branch', (await q(`select count(*)::int n from gym_amenities where gym_id=$1 and amenity='parking'`, [gym.id]))[0].n === 1);

  // votes: one per user, verified only with a visit
  await visit(U.A, gym.id);
  await as(U.A, `insert into amenity_votes (gym_id, amenity, vote) values ($1, 'pool', true)`, [gym.id]);
  await as(U.B, `insert into amenity_votes (gym_id, amenity, vote) values ($1, 'pool', false)`, [gym.id]);
  await expectErr('one vote per user per amenity', () => as(U.A, `insert into amenity_votes (gym_id, amenity, vote) values ($1, 'pool', false)`, [gym.id]), /duplicate key/);
  await as(U.A, `update amenity_votes set vote = true where gym_id = $1 and amenity = 'pool'`, [gym.id]);
  await expectErr('cannot vote as someone else', () => as(U.A, `insert into amenity_votes (gym_id, amenity, vote, user_id) values ($1, 'sauna', true, $2)`, [gym.id, U.B]), /row-level security/);
  const pool = (await as(U.A, `select * from gym_services($1)`, [gym.id])).find((r) => r.key === 'pool');
  check('vote counts + verified', pool.yes_votes === 1 && pool.no_votes === 1 && pool.yes_verified === 1 && pool.no_verified === 0 && pool.my_vote === true, JSON.stringify(pool));
  check('others cannot read raw votes', (await as(U.B, `select * from amenity_votes`)).length === 1);

  // chain summary + directory filters
  const cs = await as(U.A, `select * from chain_services($1)`, [chain.id]);
  const csPool = cs.find((r) => r.key === 'pool');
  check('chain summary counts branches', csPool.branches_yes === 1 && csPool.branches >= 1, JSON.stringify(csPool));
  const withPool = await as(U.A, `select * from gyms_with_services(array['pool','parking'])`);
  check('filter gyms by services', withPool.length === 1 && withPool[0].gyms_with_services === gym.id);
  const withNone = await as(U.A, `select * from gyms_with_services(array['kids_area'])`);
  check('filter excludes unknown', withNone.length === 0);
  const chains = (await as(U.A, `select * from chains_with_services(array['pool'])`)).map((r) => r.chains_with_services);
  check('chains filter uses branch values', chains.includes(chain.id));
  await expectErr('anon cannot call services', () => as(null, `select * from gym_services($1)`, [gym.id]), /permission denied/);
})();
