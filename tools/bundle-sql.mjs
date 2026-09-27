// يجمع كل ملفات supabase/migrations في ملف واحد يُلصق في SQL Editor (للإعداد الأول بدون أدوات)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('../supabase/migrations/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const head = `-- ARQ — إعداد قاعدة البيانات كاملة (مرة وحدة)
-- الصق هذا الملف كله في Supabase > SQL Editor > New query ثم Run.
-- مولّد تلقائياً من supabase/migrations (${files.length} ملف) — لا تعدّله يدوياً: npm run db:bundle
`;
const body = files.map((f) => `\n-- ===================== ${f} =====================\n${readFileSync(new URL(f, dir), 'utf8')}`).join('\n');
writeFileSync(new URL('../supabase/setup_all.sql', import.meta.url), head + body);
console.log(`supabase/setup_all.sql ← ${files.length} migrations`);
