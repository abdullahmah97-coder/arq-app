// الشفافية: التقييمات الموثقة والمفصلة، رد النادي، البلاغات، أوقات الذروة، الموجودين الحين، نسبة الحضور، والمقارنة
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export const FACETS = ['clean', 'equipment', 'crowd', 'coaches', 'staff'] as const;
export type Facet = (typeof FACETS)[number];

export interface FullReview {
  user_id: string; username: string; full_name: string | null; avatar_url: string | null; points: number; rating: number; body: string | null;
  updated_at: string; visited: boolean; is_me: boolean; reply: string | null; reply_at: string | null; can_reply: boolean;
  facets: Partial<Record<Facet, number>>;
}
export interface Facets { clean: number | null; equipment: number | null; crowd: number | null; coaches: number | null; staff: number | null; rated: number; verified_share: number | null }

const n = (v: unknown) => (v == null ? null : Number(v));

export async function loadReviewsFull(gymId: string): Promise<FullReview[]> {
  const { data, error } = await supabase.rpc('gym_reviews_full', { p_gym: gymId });
  if (error) return [];
  return ((data ?? []) as any[]).map((r) => ({
    ...r, rating: Number(r.rating),
    facets: Object.fromEntries(FACETS.map((f) => [f, r[`f_${f}`] ?? undefined]).filter(([, v]) => v != null)),
  }));
}
export async function loadFacets(gymId: string): Promise<Facets | null> {
  const { data } = await supabase.rpc('gym_review_facets', { p_gym: gymId });
  const r = ((data ?? []) as any[])[0];
  return r ? { clean: n(r.clean), equipment: n(r.equipment), crowd: n(r.crowd), coaches: n(r.coaches), staff: n(r.staff), rated: Number(r.rated), verified_share: n(r.verified_share) } : null;
}
export async function saveFullReview(me: string, gymId: string, rating: number, body: string, facets: Partial<Record<Facet, number>>) {
  const row: Record<string, unknown> = { gym_id: gymId, user_id: me, rating, body: body.trim() || null };
  FACETS.forEach((f) => { row[`f_${f}`] = facets[f] ?? null; });
  const { error } = await supabase.from('gym_reviews').upsert(row, { onConflict: 'gym_id,user_id' });
  if (error) throw error;
}
export async function replyToReview(gymId: string, authorId: string, body: string, exists: boolean) {
  const { error } = exists
    ? await supabase.from('gym_review_replies').update({ body: body.trim() }).eq('gym_id', gymId).eq('user_id', authorId)
    : await supabase.from('gym_review_replies').insert({ gym_id: gymId, user_id: authorId, body: body.trim() });
  if (error) throw error;
}
export async function flagReview(gymId: string, authorId: string, reason: 'fake' | 'offensive' | 'spam' | 'other') {
  const { error } = await supabase.from('review_flags').insert({ gym_id: gymId, user_id: authorId, reason });
  if (error && !String(error.message).includes('duplicate')) throw error;
}

// ---------- الموجودين الحين والذروة ----------
export async function liveCount(gymId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('gym_present_count', { p_gym: gymId });
  return error ? null : Number(data ?? 0);
}
export interface PeakCell { dow: number; hour: number; avg: number }
export async function loadPeak(gymId: string): Promise<{ cells: PeakCell[]; samples: number }> {
  const { data, error } = await supabase.rpc('gym_peak_hours', { p_gym: gymId, p_weeks: 8 });
  if (error) return { cells: [], samples: 0 };
  const rows = (data ?? []) as any[];
  return { cells: rows.map((r) => ({ dow: Number(r.dow), hour: Number(r.hour), avg: Number(r.avg_present) })), samples: rows[0] ? Number(rows[0].samples) : 0 };
}
export async function myUsualHours(): Promise<{ dow: number; hour: number; visits: number }[]> {
  const { data } = await supabase.rpc('my_usual_hours');
  return ((data ?? []) as any[]).map((r) => ({ dow: Number(r.dow), hour: Number(r.hour), visits: Number(r.visits) }));
}
/** أهدى ساعة قريبة (±٢) من وقتي المعتاد في نفس اليوم */
export function quietestNear(cells: PeakCell[], dow: number, hour: number): { hour: number; avg: number } | null {
  const day = cells.filter((c) => c.dow === dow);
  if (!day.length) return null;
  const at = (h: number) => day.find((c) => c.hour === h)?.avg ?? 0;
  let best: { hour: number; avg: number } | null = null;
  for (let h = Math.max(5, hour - 2); h <= Math.min(23, hour + 2); h++) {
    const a = at(h);
    if (!best || a < best.avg) best = { hour: h, avg: a };
  }
  return best && best.hour !== hour && best.avg < at(hour) ? best : null;
}

// ---------- نسبة الحضور ----------
export interface Attendance {
  days_per_week: number; month_start: string; days_in_month: number; day_of_month: number; planned_to_date: number; planned_month: number;
  visits: number; visit_days: string[]; last_month_visits: number; last_month_planned: number;
}
export async function loadAttendance(): Promise<Attendance | null> {
  const { data, error } = await supabase.rpc('my_attendance');
  if (error) return null;
  const r = ((data ?? []) as any[])[0];
  return r ? { ...r, visit_days: (r.visit_days ?? []).map(String) } : null;
}
export async function setAttendanceGoal(me: string, days: number) {
  const { error } = await supabase.from('attendance_goals').upsert({ user_id: me, days_per_week: days, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}

// ---------- المقارنة (٣ أندية كحد أقصى، محفوظة في الجوال) ----------
const CMP_KEY = 'arq.compare';
export async function compareList(): Promise<string[]> {
  try { return JSON.parse((await AsyncStorage.getItem(CMP_KEY)) ?? '[]'); } catch { return []; }
}
export async function toggleCompare(id: string): Promise<string[]> {
  const cur = await compareList();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur.slice(-2), id];
  await AsyncStorage.setItem(CMP_KEY, JSON.stringify(next)).catch(() => {});
  return next;
}
export interface CompareRow {
  id: string; name: string; name_en: string | null; chain: string | null; chain_id: string | null; audience: 'men' | 'women' | 'mixed'; chain_logo: string | null;
  rating: number | null; reviews: number; best_monthly: number | null; present_now: number; services: string[];
  clean: number | null; equipment: number | null; crowd: number | null; coaches: number | null; staff: number | null;
}
export async function loadCompare(ids: string[]): Promise<CompareRow[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase.rpc('gym_compare', { p_ids: ids });
  if (error) return [];
  return ((data ?? []) as any[]).map((r) => ({
    ...r, rating: n(r.rating), reviews: Number(r.reviews), best_monthly: n(r.best_monthly), present_now: Number(r.present_now),
    clean: n(r.clean), equipment: n(r.equipment), crowd: n(r.crowd), coaches: n(r.coaches), staff: n(r.staff), services: r.services ?? [],
  })).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
}
