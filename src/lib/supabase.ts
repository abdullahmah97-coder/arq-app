import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

// قاعدة بيانات ARQ الفعلية — احتياط إذا ما وصلت المتغيرات للبناء أو التحديث الفوري
// (مفتاح anon عام بطبيعته ومحمي بصلاحيات RLS)
const PROD_URL = 'https://hfplqbnbuskiaeblxpfo.supabase.co';
const PROD_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmcGxxYm5idXNraWFlYmx4cGZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1MDQxOTUsImV4cCI6MjEwNjA4MDE5NX0.ptXrGAqJz-ii3AU0HEnrx5bTnQNLLS2wm5tH3p10drI';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL || PROD_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || PROD_ANON_KEY;

if (!url || !anonKey) {
  console.warn('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — copy .env.example to .env');
}

export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing', {
  auth: {
    storage: Platform.OS === 'web' && typeof window === 'undefined' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// تحديث التوكن فقط والتطبيق في الواجهة
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** رابط عام لملف في حاوية عامة (avatars / posts) */
export function publicUrl(bucket: 'avatars' | 'posts' | 'brands', path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** رابط مؤقت لصورة خاصة (حاوية body) */
export async function signedBodyUrl(path: string): Promise<string | undefined> {
  const { data } = await supabase.storage.from('body').createSignedUrl(path, 60 * 30);
  return data?.signedUrl;
}

/** رفع صورة من uri محلي — يرجع المسار داخل الحاوية */
export async function uploadImage(
  bucket: 'avatars' | 'posts' | 'body' | 'inbody' | 'brands',
  userId: string,
  uri: string,
  mimeType = 'image/jpeg',
): Promise<string> {
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const body = await (await fetch(uri)).arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType: mimeType, upsert: false });
  if (error) throw error;
  return path;
}

/** يحوّل رسائل أخطاء الخادم إلى مفاتيح ترجمة */
export function errorKey(e: unknown): string {
  const msg = String((e as any)?.message ?? e ?? '');
  if (msg.includes('too_far')) return 'errors.tooFar';
  if (msg.includes('already_checked_in')) return 'errors.alreadyCheckedIn';
  if (msg.includes('Invalid login credentials')) return 'errors.invalidLogin';
  if (msg.includes('User already registered')) return 'errors.emailTaken';
  if (msg.includes('duplicate key') && msg.includes('username')) return 'errors.usernameTaken';
  if (msg.includes('duplicate key')) return 'errors.duplicate';
  if (msg.includes('Network request failed') || msg.includes('Failed to fetch')) return 'errors.network';
  return 'errors.generic';
}

/** المسافة التقريبية من رسالة too_far:123 */
export function tooFarMeters(e: unknown): number | undefined {
  const m = String((e as any)?.message ?? '').match(/too_far:(\d+)/);
  return m ? Number(m[1]) : undefined;
}
