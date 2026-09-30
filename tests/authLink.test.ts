// رابط تأكيد الإيميل: نقرأ الجلسة أو الخطأ من الرابط اللي يفتح التطبيق
import assert from 'node:assert/strict';
import { parseAuthLink } from '../src/lib/authLink.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log('ok -', name); };

test('confirmation link with the session in the fragment', () => {
  const r = parseAuthLink('arq://#access_token=eyJhb.c.d&expires_at=1790000000&expires_in=3600&refresh_token=abc123&token_type=bearer&type=signup');
  assert.deepEqual(r, { kind: 'session', access_token: 'eyJhb.c.d', refresh_token: 'abc123', type: 'signup' });
});

test('session in the query string also works (and encoded values are decoded)', () => {
  const r = parseAuthLink('arq:///?access_token=a%2Eb&refresh_token=r%2B1');
  assert.deepEqual(r, { kind: 'session', access_token: 'a.b', refresh_token: 'r+1', type: null });
});

test('expired or used link → error with its description', () => {
  const r = parseAuthLink('arq://#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  assert.deepEqual(r, { kind: 'error', code: 'otp_expired', description: 'Email link is invalid or has expired' });
});

test('ordinary app links and empty values are ignored', () => {
  assert.equal(parseAuthLink('arq://user/123'), null);
  assert.equal(parseAuthLink('arq://plan?tab=meals'), null);
  assert.equal(parseAuthLink(null), null);
  assert.equal(parseAuthLink(''), null);
  assert.equal(parseAuthLink('arq://#access_token=only'), null, 'needs both tokens');
  assert.equal(parseAuthLink('arq://#%E0%A4%A=x&access_token=a&refresh_token=b')?.kind, 'session', 'a malformed part does not break the rest');
});

console.log(`\n${passed} auth link tests passed`);
