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

/** رابط الخادم (لتوثيق ربط البوابات) */
export const SUPABASE_URL = url;

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
export function publicUrl(bucket: 'avatars' | 'posts' | 'brands' | 'exercises' | 'ads' | 'events', path: string | null | undefined): string | undefined {
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

/** رموز أخطاء الخادم اللي لها نص مترجم في srv.* */
export const SERVER_CODES = new Set([
  'not_allowed', 'not_authenticated', 'user_not_found', 'referral_not_found', 'membership_not_found', 'code_not_found', 'too_many_requests',
  'request_pending', 'bad_days', 'transfer_same_chain_only', 'request_not_found', 'bad_status', 'rate_limited', 'class_not_found', 'bad_date',
  'too_far_ahead', 'members_only', 'already_booked', 'booking_not_found', 'too_late_to_cancel', 'too_many_rows', 'gym_not_found',
  'review_needs_visit', 'already_replied', 'not_a_client', 'not_enough_points', 'out_of_stock', 'reward_ended', 'reward_not_found', 'code_ended',
  'consent_required', 'scope_not_granted', 'link_not_found', 'already_linked', 'slot_full', 'no_sessions_left', 'package_expired',
  'payments_disabled', 'order_not_found', 'amount_mismatch', 'kind_not_available', 'not_a_coach', 'coach_pending_review', 'not_verified', 'brand_not_approved',
  'note_required', 'status_locked',
  'too_late', 'bad_slot', 'slot_taken', 'class_full', 'venue_unavailable', 'too_many_bookings', 'too_early', 'bad_sport',
  'bad_username', 'name_too_long', 'username_taken', 'cannot_delete_self', 'cannot_delete_admin', 'not_trainee',
  'quiet_hours', 'nudge_not_found',
]);

/** يحوّل رسائل أخطاء الخادم إلى مفاتيح ترجمة */
export function errorKey(e: unknown): string {
  const msg = String((e as any)?.message ?? e ?? '');
  // too_far:123 = بعيد عن النادي (تسجيل الحضور)، أما too_far_ahead فهو موعد حجز بعيد
  if (/too_far(?!_ahead)/.test(msg)) return 'errors.tooFar';
  if (msg.includes('already_checked_in')) return 'errors.alreadyCheckedIn';
  if (msg.includes('Invalid login credentials')) return 'errors.invalidLogin';
  if (msg.includes('User already registered')) return 'errors.emailTaken';
  if (msg.includes('duplicate key') && msg.includes('username')) return 'errors.usernameTaken';
  if (msg.includes('duplicate key')) return 'errors.duplicate';
  if (msg.includes('Network request failed') || msg.includes('Failed to fetch')) return 'errors.network';
  const code = msg.match(/\b([a-z]+(?:_[a-z0-9]+)+)\b/)?.[1];
  if (code && SERVER_CODES.has(code)) return `srv.${code}`;
  if (msg.includes('row-level security')) return 'srv.not_allowed';
  return 'errors.generic';
}

/** المسافة التقريبية من رسالة too_far:123 */
export function tooFarMeters(e: unknown): number | undefined {
  const m = String((e as any)?.message ?? '').match(/too_far:(\d+)/);
  return m ? Number(m[1]) : undefined;
}
