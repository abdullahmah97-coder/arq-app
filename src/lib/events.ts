// أحداث وأخطاء التطبيق للنسخة التجريبية (يقرأها المالك فقط) — ما توقف التطبيق أبداً لو فشلت
import { appMeta } from './appInfo';
import { supabase } from './supabase';

const sent = new Set<string>();

/** يسجّل حدث. once=true يسجّله مرة وحدة بكل تشغيل للتطبيق */
export function logEvent(kind: string, detail: Record<string, unknown> = {}, opts: { once?: boolean } = {}): void {
  try {
    const key = `${kind}:${JSON.stringify(detail).slice(0, 200)}`;
    if (opts.once && sent.has(key)) return;
    sent.add(key);
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return;
      supabase.from('app_events').insert({ user_id: data.session.user.id, kind, detail, app: appMeta() }).then(() => {}, () => {});
    }, () => {});
  } catch {
    // تجاهل
  }
}

export function errorDetail(e: unknown): Record<string, unknown> {
  const err = e as { name?: string; message?: string; stack?: string };
  return { name: err?.name ?? null, message: String(err?.message ?? e).slice(0, 500), stack: String(err?.stack ?? '').slice(0, 1500) };
}

let installed = false;
/** يلتقط أي خطأ JavaScript غير متوقع ويسجّله (مع الإبقاء على المعالج الأصلي) */
export function installGlobalErrorLogger(): void {
  if (installed) return;
  installed = true;
  const EU = (globalThis as { ErrorUtils?: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(h: (e: unknown, fatal?: boolean) => void): void } }).ErrorUtils;
  if (!EU) return;
  const prev = EU.getGlobalHandler();
  EU.setGlobalHandler((e, fatal) => {
    logEvent(fatal ? 'js_fatal' : 'js_error', errorDetail(e));
    prev(e, fatal);
  });
}
