// تصوير الوجبة: نلتقط صورة مضغوطة ونرسلها لدالة analyze-meal، وترجع الأصناف بالسعرات والماكروز للمراجعة
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../supabase';
import type { I18nText } from '../types';

export interface MealItem {
  name_ar: string; name_en: string; grams: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number;
}
export interface MealAnalysis { items: MealItem[]; confidence: 'high' | 'medium' | 'low'; note: I18nText; remaining?: number }
export interface MealPhoto { uri: string; base64: string }

/** صورة مضغوطة (تكفي للتحليل وتبقى أقل من حد الحجم) */
export async function pickMealPhoto(source: 'camera' | 'library'): Promise<MealPhoto | null> {
  const perm = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('permission_denied');
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.3, base64: true, exif: false };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  const a = res.canceled ? null : res.assets?.[0];
  if (!a?.base64) return null;
  return { uri: a.uri, base64: a.base64 };
}

/** يرجع التحليل، أو رمز خطأ: ai_not_configured | rate_limited | not_food | file_too_large | ai_failed */
export async function analyzeMeal(photo: MealPhoto, hint?: string): Promise<{ result?: MealAnalysis; error?: string }> {
  const { data, error } = await supabase.functions.invoke('analyze-meal', {
    body: { image: photo.base64, media_type: 'image/jpeg', hint: hint?.trim() || undefined },
  });
  if (error || !data?.items) {
    let code = data?.error as string | undefined;
    try { code = code ?? (await (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context?.json?.())?.error; } catch { /* ignore */ }
    if (!code && error && /Failed to send|fetch|network/i.test(String((error as Error).message))) code = 'network';
    return { error: code ?? 'ai_failed' };
  }
  return { result: data as MealAnalysis };
}

/** مجموع الأصناف بعد تعديل الكمية (نسبة من التقدير) */
export function scaleItem(it: MealItem, factor: number): MealItem {
  const r1 = (n: number) => Math.round(n * factor * 10) / 10;
  return { ...it, grams: Math.round(it.grams * factor), kcal: Math.round(it.kcal * factor), protein_g: r1(it.protein_g), carbs_g: r1(it.carbs_g), fat_g: r1(it.fat_g) };
}
