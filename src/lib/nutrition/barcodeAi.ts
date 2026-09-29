// بحث الباركود بالذكاء الاصطناعي (دالة الخادم barcode-lookup: بحث ويب + ذاكرة مشتركة)
import { supabase } from '../supabase';
import { fromAiLookup, type BarcodeProduct } from './barcode';

export type AiLookupError = 'rate_limited' | 'network' | 'unavailable';

/** يرجع المنتج، أو null لو ما لقاه، أو خطأ. remaining = كم بحث باقي اليوم (لو انخصم بحث) */
export async function aiBarcodeLookup(code: string, hint?: string | null): Promise<{ product: BarcodeProduct | null; error?: AiLookupError; remaining?: number }> {
  const { data, error } = await supabase.functions.invoke('barcode-lookup', { body: { code, hint: hint?.trim() || undefined } });
  if (error || data?.error) {
    let codeStr = data?.error as string | undefined;
    try { codeStr = codeStr ?? (await (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context?.json?.())?.error; } catch { /* ignore */ }
    if (codeStr === 'rate_limited') return { product: null, error: 'rate_limited' };
    if (!codeStr && error && /Failed to send|fetch|network/i.test(String((error as Error).message))) return { product: null, error: 'network' };
    return { product: null, error: 'unavailable' };
  }
  return { product: fromAiLookup(code, data), remaining: typeof data?.remaining === 'number' ? data.remaining : undefined };
}
