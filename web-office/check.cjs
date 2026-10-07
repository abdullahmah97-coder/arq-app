// فحص index.html: يطلّع السكربتات المضمّنة ويشغّل node --check على كل سكربت JS، ويتأكد إن JSON التجريبي ينقرا
// وإن الصفحة تبدأ بـ <title> وما فيها وسوم doctype/html/head/body، وإن السكربت الخارجي الوحيد هو three.js المثبّت.
// التشغيل: node check.cjs
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
let ok = 0, fail = 0;
const pass = (label) => { ok++; console.log(`ok   ${label}`); };
const bad = (label, why) => { fail++; console.log(`FAIL ${label}${why ? ` — ${why}` : ''}`); };
const expect = (cond, label, why) => (cond ? pass(label) : bad(label, why));

expect(html.startsWith('<title>مكتب أرك أب</title>'), 'page starts with the title');
expect(html.indexOf('<style>') > html.indexOf('</title>') && html.indexOf('<style>') < 200, 'style comes right after the title');
expect(!/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(html), 'no doctype/html/head/body tags');
const ext = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
expect(ext.length === 1 && ext[0] === 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js', 'only external script is pinned three@0.158.0 from jsdelivr', ext.join(', '));
const links = [...html.matchAll(/url\("?(https?:[^")]+)/g)].map((m) => m[1]);
expect(links.every((u) => u.startsWith('https://fonts.googleapis.com/')), 'only stylesheet import is Google Fonts', links.join(', '));
expect(!/\balert\(|\bconfirm\(|\bprompt\(/.test(html.replace(/role="alert"|'alert'|"alert"|alert:/g, '')), 'no alert/confirm/prompt');
expect(!/\.innerHTML\s*=|insertAdjacentHTML|outerHTML\s*=/.test(html), 'no innerHTML writes');

const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'office-check-'));
scripts.forEach((m, i) => {
  const attrs = m[1];
  const body = m[2];
  if (/application\/json/.test(attrs)) {
    try {
      const v = JSON.parse(body);
      expect(v && v.overview && v.overview_30 && Array.isArray(v.tasks), `inline script #${i + 1} (sample JSON) parses with overview/overview_30/tasks`);
      const a = v && v.app;
      expect(a && Array.isArray(a.requests) && a.content && Array.isArray(a.content.ads) && Array.isArray(a.content.events) && Array.isArray(a.content.nudges)
        && a.content.settings && a.partners && Array.isArray(a.users), `inline script #${i + 1} (sample JSON) has the App tab sample (requests, content, partners, users)`);
      expect(a && a.users.every((u) => !('email' in u) && !('last_sign_in_at' in u)), 'sample users carry no email / last_sign_in_at');
    } catch (e) { bad(`inline script #${i + 1} (sample JSON) parses`, e.message); }
    return;
  }
  const f = path.join(tmp, `inline-${i + 1}.js`);
  fs.writeFileSync(f, body);
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); pass(`node --check inline script #${i + 1} (${(body.length / 1024).toFixed(0)} KB)`); }
  catch (e) { bad(`node --check inline script #${i + 1}`, String(e.stderr || e.message).slice(0, 400)); }
});
// النصوص: كل مفتاح له عربي وإنجليزي، ونفس المتغيرات {…} بالاثنين، وكل t('…') بالكود له نص
{
  const vm = require('vm');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(['src/1-i18n.js', 'src/1b-i18n-app.js'].map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n') + '\nthis.I18N = I18N;', ctx);
  const { ar, en } = ctx.I18N;
  const onlyAr = Object.keys(ar).filter((k) => !(k in en)), onlyEn = Object.keys(en).filter((k) => !(k in ar));
  expect(!onlyAr.length && !onlyEn.length, 'i18n: every key exists in Arabic and English', `ar only: ${onlyAr.join(', ')} · en only: ${onlyEn.join(', ')}`);
  const vars = (x) => (String(x).match(/\{\w+\}/g) || []).sort().join(',');
  const mism = Object.keys(ar).filter((k) => k in en && vars(ar[k]) !== vars(en[k]));
  expect(!mism.length, 'i18n: same {placeholders} in both languages', mism.join(', '));
  const code = ['src/2-core.js', 'src/3-ui.js', 'src/4-scene.js', 'src/5-app.js', 'src/6-main.js'].map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');
  const missing = new Set();
  for (const m of code.matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'/g)) if (!(m[1] in ar)) missing.add(m[1]);
  for (const m of code.matchAll(/\b(?:label|hint|yes|msg):\s*'([a-z][A-Za-z0-9_]+)'/g)) if (/^(f|v|cf|pa|ad|ev|nd|req|set)_/.test(m[1]) && !(m[1] in ar)) missing.add(m[1]);
  expect(!missing.size, 'i18n: every literal t(\'key\') / field label in the code has a string', [...missing].join(', '));
}
console.log(`\n${ok} ok, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
