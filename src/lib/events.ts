// أحداث وأخطاء التطبيق للنسخة التجريبية (يقرأها المالك فقط) — ما توقف التطبيق أبداً لو فشلت
import AsyncStorage from '@react-native-async-storage/async-storage';
import { appMeta } from './appInfo';
import { supabase } from './supabase';

const sent = new Set<string>();
const FATAL_KEY = 'arq:last_fatal';

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

type Guard = (e: unknown) => boolean;
let guard: Guard | null = null;
/**
 * أثناء عمل جزء حساس (مثل الرسم ثلاثي الأبعاد) نسجّل "حارس": لو صار خطأ قاتل يعطيه الحارس فرصة
 * يتعامل معه (يرجع true) بدل ما ينقفل التطبيق. يرجع دالة لإلغاء الحارس.
 */
export function setFatalGuard(fn: Guard): () => void {
  guard = fn;
  return () => { if (guard === fn) guard = null; };
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
    const detail = errorDetail(e);
    if (fatal && guard) {
      try {
        if (guard(e)) { logEvent('js_fatal_caught', detail); return; }
      } catch { /* نكمل للمعالج الأصلي */ }
    }
    logEvent(fatal ? 'js_fatal' : 'js_error', detail);
    if (!fatal) { prev(e, fatal); return; }
    // نحفظ الخطأ وننتظر ثانية قبل الإغلاق عشان يوصل التقرير (ولو ما وصل نرسله بالتشغيل الجاي)
    AsyncStorage.setItem(FATAL_KEY, JSON.stringify({ ...detail, at: Date.now() })).catch(() => {});
    setTimeout(() => prev(e, fatal), 1200);
  });
}

/** يرسل آخر خطأ قاتل محفوظ (من تشغيل سابق انقفل فيه التطبيق) */
export async function flushLastFatal(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(FATAL_KEY);
    if (!raw) return;
    await AsyncStorage.removeItem(FATAL_KEY);
    logEvent('js_fatal_prev', JSON.parse(raw));
  } catch {
    // تجاهل
  }
}
