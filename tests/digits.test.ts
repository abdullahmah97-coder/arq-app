// اختبار قراءة الأرقام من خانات المستخدم: العربية والفارسية والإنجليزية والفاصلة العشرية
// التشغيل: node --experimental-strip-types --no-warnings tests/digits.test.ts
import { onlyDigits, parseDecimal, toLatinDigits, toNumber } from '../src/lib/digits.ts';
let fail = 0;
const ok = (c: boolean, m: string, extra = '') => { if (!c) { fail++; console.log('FAIL', m, extra); } else console.log('ok  ', m); };

ok(parseDecimal('٢٥٠') === 250, 'Arabic digits: ٢٥٠ → 250');
ok(parseDecimal('۲۵۰') === 250, 'Persian digits: ۲۵۰ → 250');
ok(parseDecimal('250') === 250, 'English digits');
ok(parseDecimal('٧٥٫٥') === 75.5 && parseDecimal('75,5') === 75.5 && parseDecimal('75.5') === 75.5 && parseDecimal('٧٥،٥') === 75.5, 'decimal separators ٫ , . ،');
ok(parseDecimal(' ١٢ ') === 12 && parseDecimal('‏١٢٠') === 120, 'spaces and direction marks ignored');
ok(parseDecimal('١٬٢٠٠') === 1200, 'Arabic thousands separator');
ok(parseDecimal('12.') === 12 && parseDecimal('.5') === 0.5, 'half-typed decimals');
ok(parseDecimal('٠') === 0, 'zero is a number');
ok(parseDecimal('') === null && parseDecimal('   ') === null && parseDecimal(null) === null && parseDecimal(undefined) === null, 'empty → null');
ok(parseDecimal('abc') === null && parseDecimal('1.2.3') === null && parseDecimal('-5') === null && parseDecimal('١٢ك') === null, 'junk and negatives → null');
ok(parseDecimal(80) === 80 && parseDecimal(NaN) === null && parseDecimal(-1) === null, 'numbers pass through');
ok(toNumber('٨٠') === 80 && Number.isNaN(toNumber('')) && Number.isNaN(toNumber('x')), 'toNumber: bad input is NaN (validation rejects it)');
ok(toLatinDigits('٠١٢٣٤٥٦٧٨٩') === '0123456789' && onlyDigits('٠٥٥ ١٢٣-٤٥٦٧') === '0551234567', 'existing helpers unchanged');

if (fail) process.exit(1);
console.log('ALL DIGIT TESTS PASSED');
