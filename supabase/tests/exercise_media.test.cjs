// اختبار حاوية صور مكتبة التمارين: موجودة وعامة للقراءة، وتكرار الهجرة ما يغيّر شي
const fs = require('fs');
const path = require('path');
const { setup } = require('./_harness.cjs');

(async () => {
  const { q, check } = await setup();
  const b = await q(`select id, public from storage.buckets where id = 'exercises'`);
  check('exercises bucket exists and is public', b.length === 1 && b[0].public === true);
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/20260929000530_exercise_media.sql'), 'utf8');
  await q(sql);
  check('migration is idempotent', (await q(`select count(*)::int n from storage.buckets where id = 'exercises'`))[0].n === 1);
})();
