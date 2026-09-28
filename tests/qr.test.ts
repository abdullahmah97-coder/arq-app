// اختبار مولّد QR: يطابق مخرجات مكتبة qrcode المرجعية (بايثون) لنفس الإصدار والقناع
import { readFileSync } from 'node:fs';
import { encodeQr, type Ecc } from '../src/lib/qr/index.ts';

const vectors = JSON.parse(readFileSync(new URL('./fixtures/qr_vectors.json', import.meta.url), 'utf8')) as { text: string; ver: number; ecc: Ecc; mask: number; rows: string[] }[];
let fail = 0;
for (const v of vectors) {
  const q = encodeQr(v.text, v.ecc, { version: v.ver, mask: v.mask });
  const rows = q.modules.map((r) => r.map((b) => (b ? '1' : '0')).join(''));
  const ok = rows.length === v.rows.length && rows.every((r, i) => r === v.rows[i]);
  if (!ok) {
    fail++;
    const diff = rows.reduce((n, r, i) => n + [...r].filter((c, j) => c !== (v.rows[i] ?? '')[j]).length, 0);
    console.log('FAIL', `v${v.ver}-${v.ecc} mask${v.mask}`, JSON.stringify(v.text.slice(0, 20)), `diff=${diff}`);
  } else console.log('ok  ', `v${v.ver}-${v.ecc} mask${v.mask}`);
}
const auto = encodeQr('arq://entry/0123456789abcdef0123456789abcdef01234567');
console.log(auto.version === 4 ? 'ok  ' : 'FAIL', 'auto version picks 4-M', auto.version, 'mask', auto.mask);
if (auto.version !== 4) fail++;
if (fail) process.exit(1);
