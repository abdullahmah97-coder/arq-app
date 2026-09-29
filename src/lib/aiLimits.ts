// حدود الذكاء الاصطناعي اليومية لكل مستخدم (من لوحة التحكم): بحث الباركود وتحليل صور الوجبات
import { supabase } from './supabase';

export interface AiLimits { barcode_per_day: number; meal_photos_per_day: number }
export const DEFAULT_AI_LIMITS: AiLimits = { barcode_per_day: 2, meal_photos_per_day: 25 };
export const AI_LIMIT_MAX: AiLimits = { barcode_per_day: 100, meal_photos_per_day: 200 };

const int = (v: unknown, d: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : d);

export function parseAiLimits(v: unknown): AiLimits {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    barcode_per_day: int(o.barcode_per_day, DEFAULT_AI_LIMITS.barcode_per_day),
    meal_photos_per_day: int(o.meal_photos_per_day, DEFAULT_AI_LIMITS.meal_photos_per_day),
  };
}

export async function loadAiLimits(): Promise<AiLimits> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'ai_limits').maybeSingle();
  return parseAiLimits((data as { value?: unknown } | null)?.value);
}

export async function saveAiLimits(v: AiLimits): Promise<void> {
  const { error } = await supabase.from('app_settings').upsert({ key: 'ai_limits', value: v });
  if (error) throw error;
}
