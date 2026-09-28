// دالة مؤقتة (Supabase Edge Function) استُخدمت مرة وحدة لنسخ صور Free Exercise DB (ملكية عامة) لحاوية exercises ثم حُذفت.
// تُنشر من لوحة Supabase باسم exercise-media-sync (بدون التحقق من JWT)، وتُستدعى على دفعات: ?offset=0 ثم قيمة next لين ترجع null.
// مفتاح الخدمة يُقرأ من متغيرات بيئة Supabase التلقائية داخل الدالة فقط.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SHA = 'f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5';
const RAW = `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${SHA}`;

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const offset = Math.max(0, Math.floor(Number(u.searchParams.get('offset')) || 0));
  const limit = Math.min(300, Math.max(1, Math.floor(Number(u.searchParams.get('limit')) || 250)));
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const list: { id: string; images: string[] }[] = await (await fetch(`${RAW}/dist/exercises.json`)).json();
  const paths = list.flatMap((e) => e.images.slice(0, 2)).filter((p) => /^[A-Za-z0-9_-]+\/[01]\.jpg$/.test(p));
  const batch = paths.slice(offset, offset + limit);

  let ok = 0, skipped = 0, i = 0;
  const failed: string[] = [];
  const worker = async () => {
    while (i < batch.length) {
      const p = batch[i++];
      try {
        const r = await fetch(`${RAW}/exercises/${p}`);
        if (!r.ok) throw new Error(`fetch ${r.status}`);
        const body = new Uint8Array(await r.arrayBuffer());
        const { error } = await sb.storage.from('exercises').upload(p, body, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
        if (!error) ok++;
        else if (/exists|duplicate/i.test(error.message)) skipped++;
        else failed.push(`${p}: ${error.message}`);
      } catch (e) {
        failed.push(`${p}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  const next = offset + limit < paths.length ? offset + limit : null;
  return Response.json({ total: paths.length, offset, ok, skipped, failed, next });
});
