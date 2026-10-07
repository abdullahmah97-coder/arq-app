// يجمّع صفحة مكتب الويب في index.html (محتوى الصفحة بس: بدون doctype/html/head/body — النشر يغلّفها)
// الترتيب: <title> ثم <style> ثم العناصر ثم السكربتات (three.js من jsdelivr مثبّت على 0.158.0، ثم البيانات التجريبية، ثم كود الصفحة)
// كود الصفحة: النصوص (1، 1b للتطبيق) ← الأساس ← الواجهة ← المشهد ← تبويب «التطبيق» ← التشغيل (6-main يبدأ الصفحة، فيجي آخر)
// التشغيل: node build.cjs
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const css = read('src/style.css').trim();
const markup = read('src/markup.html').trim();
const js = ['src/1-i18n.js', 'src/1b-i18n-app.js', 'src/2-core.js', 'src/3-ui.js', 'src/4-scene.js', 'src/5-app.js', 'src/6-main.js'].map(read).join('\n');
const sample = JSON.parse(read('sample.json'));
// JSON داخل <script>: نهرب < عشان ما يقفل الوسم بالغلط
const sampleJson = JSON.stringify(sample).replace(/</g, '\\u003c');

const html = `<title>مكتب أرك أب</title>
<style>
${css}
</style>
${markup}
<script src="https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js" id="three-js" async></script>
<script type="application/json" id="office-sample">${sampleJson}</script>
<script>
(() => {
'use strict';
${js}
})();
</script>
`;
if (/<\/script/i.test(js)) throw new Error('page script contains </script');
fs.writeFileSync(path.join(DIR, 'index.html'), html);
console.log(`index.html: ${(html.length / 1024).toFixed(1)} KB (title at byte ${Buffer.from(html).indexOf('<title>')})`);
