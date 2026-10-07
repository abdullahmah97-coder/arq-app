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
    } catch (e) { bad(`inline script #${i + 1} (sample JSON) parses`, e.message); }
    return;
  }
  const f = path.join(tmp, `inline-${i + 1}.js`);
  fs.writeFileSync(f, body);
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); pass(`node --check inline script #${i + 1} (${(body.length / 1024).toFixed(0)} KB)`); }
  catch (e) { bad(`node --check inline script #${i + 1}`, String(e.stderr || e.message).slice(0, 400)); }
});
console.log(`\n${ok} ok, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
