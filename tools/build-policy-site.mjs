// يبني صفحات أرك العامة (GitHub Pages من مجلد docs/) من نفس نصوص التطبيق في src/locales:
//   docs/index.html      الصفحة الرئيسية (رابط التسويق في المتجر)
//   docs/privacy.html    سياسة الخصوصية (رابط إلزامي في App Store و Google Play)
//   docs/community.html  إرشادات المجتمع
//   docs/support.html    الدعم وحذف الحساب (رابط الدعم في App Store، ورابط حذف الحساب في Google Play)
// التشغيل: SUPPORT_EMAIL=you@example.com node tools/build-policy-site.mjs
// (بدون SUPPORT_EMAIL ما يطلع إيميل في الصفحات: التواصل يكون من داخل التطبيق بس)
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const ar = read('src/locales/ar.json');
const en = read('src/locales/en.json');
const email = (process.env.SUPPORT_EMAIL || '').trim();
const out = new URL('docs/', root);
mkdirSync(out, { recursive: true });
copyFileSync(new URL('assets/icon.png', root), new URL('icon.png', out));

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// النص فيه نقاط «•» وأسطر: نحوله لفقرات وقوائم
function body(text) {
  const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
  let html = '';
  let list = [];
  const flush = () => { if (list.length) { html += `<ul>${list.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`; list = []; } };
  for (const l of lines) {
    if (l.startsWith('•')) list.push(l.replace(/^•\s*/, ''));
    else { flush(); html += `<p>${esc(l)}</p>`; }
  }
  flush();
  return html;
}

const CSS = `
:root{--bg:#F8EDDA;--card:#fffaf1;--text:#0A332D;--muted:#4f6b62;--line:#ead9bd;--accent:#F1551D;--deep:#0A332D;}
@media (prefers-color-scheme:dark){:root{--bg:#06201c;--card:#0d2c27;--text:#f8edda;--muted:#b9c8bf;--line:#1f4a42;--accent:#FEA94F;--deep:#F8EDDA;}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.75 "Noto Kufi Arabic",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 64px}
header{display:flex;align-items:center;gap:12px;margin:8px 0 20px}
header img{width:48px;height:48px;border-radius:12px}
header a{color:inherit;text-decoration:none;font-weight:700;font-size:20px}
nav{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 24px}
nav a{color:var(--text);text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:4px 14px;font-size:14px;background:var(--card)}
nav a[aria-current]{background:var(--deep);color:var(--bg);border-color:var(--deep)}
h1{font-size:28px;line-height:1.35;margin:0 0 8px}h2{font-size:19px;margin:0 0 6px}
.meta{color:var(--muted);font-size:14px;margin:0 0 20px}
section.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px;margin:0 0 12px}
section.card p{margin:0 0 8px}section.card ul{margin:0;padding-inline-start:20px}
.lang{margin-top:40px;padding-top:24px;border-top:2px solid var(--line)}
.btn{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;border-radius:12px;padding:10px 18px;font-weight:700}
footer{color:var(--muted);font-size:13px;margin-top:40px}
a{color:var(--accent)}`;

const NAV = [
  ['index.html', 'الرئيسية', 'Home'],
  ['privacy.html', ar.privacyPolicy.title, en.privacyPolicy.title],
  ['community.html', ar.communityGuidelines.title, en.communityGuidelines.title],
  ['support.html', 'الدعم', 'Support'],
];

function page(file, titleAr, titleEn, arHtml, enHtml) {
  const nav = NAV.map(([f, a]) => `<a href="${f}"${f === file ? ' aria-current="page"' : ''}>${esc(a)}</a>`).join('');
  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titleAr)} · ARQ أرك</title>
<meta name="description" content="${esc(titleEn)} — ARQ">
<link rel="icon" href="icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@400;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<main>
<header><img src="icon.png" alt=""><a href="index.html">ARQ أرك</a></header>
<nav>${nav}</nav>
${arHtml}
<div class="lang" lang="en" dir="ltr" id="en">
${enHtml}
</div>
<footer>© ${new Date().getFullYear()} ARQ</footer>
</main>
</body>
</html>
`;
  writeFileSync(new URL(file, out), html);
}

function policy(ns, l) {
  const p = l[ns];
  return `<h1>${esc(p.title)}</h1><p class="meta">${esc(p.version)}</p><p>${esc(p.intro)}</p>
${p.sections.map((s) => `<section class="card"><h2>${esc(s.title)}</h2>${body(s.body)}</section>`).join('\n')}
<p class="meta">${esc(p.contact)}</p>`;
}

page('privacy.html', ar.privacyPolicy.title, en.privacyPolicy.title, policy('privacyPolicy', ar), policy('privacyPolicy', en));
page('community.html', ar.communityGuidelines.title, en.communityGuidelines.title, policy('communityGuidelines', ar), policy('communityGuidelines', en));

const mail = (l) => (email ? `<p><a class="btn" href="mailto:${esc(email)}">${esc(email)}</a></p>` : '');
page('support.html', 'الدعم', 'Support',
  `<h1>الدعم</h1>
<section class="card"><h2>راسلنا</h2><p>من داخل التطبيق: حسابي ← سياسة الخصوصية ← «راسلنا». ونرد عليك بأسرع وقت.</p>${mail('ar')}</section>
<section class="card"><h2>حذف الحساب</h2><ul><li>من التطبيق: حسابي ← «حذف الحساب» أسفل الصفحة، ثم «احذف نهائياً». تنحذف بياناتك وصورك نهائياً.</li><li>لو ما تقدر تفتح التطبيق: راسلنا${email ? ` على ${esc(email)}` : ''} من نفس البريد المسجّل في الحساب، وبنحذف الحساب وكل بياناته.</li></ul></section>
<section class="card"><h2>بلاغ عن محتوى أو شخص</h2><p>على أي منشور أو ملف شخصي اضغط ⋯ ثم «بلّغ» أو «حظر»، وعلى التعليق أو الرسالة اضغط مطولاً. نراجع كل بلاغ خلال ٢٤ ساعة. <a href="community.html">إرشادات المجتمع</a></p></section>`,
  `<h1>Support</h1>
<section class="card"><h2>Contact us</h2><p>In the app: Profile → Privacy policy → “Message us”. We'll get back to you as soon as we can.</p>${mail('en')}</section>
<section class="card"><h2>Delete your account</h2><ul><li>In the app: Profile → “Delete account” at the bottom, then “Delete permanently”. Your data and photos are permanently deleted.</li><li>Can't open the app? Email us${email ? ` at ${esc(email)}` : ''} from your account's email address and we'll delete the account and all its data.</li></ul></section>
<section class="card"><h2>Report content or a person</h2><p>On any post or profile tap ⋯, then Report or Block; on a comment or message, long-press it. We review every report within 24 hours. <a href="community.html#en">Community guidelines</a></p></section>`);

page('index.html', 'أرك', 'ARQ',
  `<h1>${esc(ar.app.name)}</h1><p>${esc(ar.app.about)}</p>
<section class="card"><p>تمرّن مع أصحابك، سجّل حضورك في النادي، وتابع جاهزيتك ونومك من ساعتك، مع مدرب ذكي وخطط تمرين ووجبات تناسبك.</p></section>
<p><a href="privacy.html">${esc(ar.privacyPolicy.title)}</a> · <a href="community.html">${esc(ar.communityGuidelines.title)}</a> · <a href="support.html">الدعم</a></p>`,
  `<h1>ARQ</h1><p>Train, check in and compete with your friends.</p>
<section class="card"><p>Train with friends, check in at your gym, and follow your recovery and sleep from your watch, with an AI coach and workout and meal plans made for you.</p></section>
<p><a href="privacy.html#en">${esc(en.privacyPolicy.title)}</a> · <a href="community.html#en">${esc(en.communityGuidelines.title)}</a> · <a href="support.html#en">Support</a></p>`);

writeFileSync(new URL('.nojekyll', out), '');
console.log(`docs/ ← index, privacy, community, support${email ? ` (support email: ${email})` : ' (no support email yet)'}`);
