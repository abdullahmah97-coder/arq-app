// المدربين: الدليل، ملف المدرب، الربط بالمتدرب بصلاحيات يختارها المتدرب، السجل الكامل، البرنامج، الحصص، الباقات، التقييمات
import { supabase } from './supabase';

export const SPECIALTIES = ['fat_loss', 'muscle', 'strength', 'fitness', 'rehab', 'women', 'seniors', 'kids', 'sports', 'nutrition',
  'boxing', 'crossfit', 'yoga', 'running', 'bodybuilding'] as const;
export type Specialty = (typeof SPECIALTIES)[number];
/** أنواع البيانات اللي يقدر المتدرب يسمح لمدربه يشوفها (كل وحدة لحالها، وتنسحب متى ما بغى) */
export const SCOPES = ['workouts', 'visits', 'inbody', 'health', 'food'] as const;
export type Scope = (typeof SCOPES)[number];
export const LANGS = ['ar', 'en', 'ur', 'hi', 'tl', 'fr', 'es'] as const;

const n = (v: unknown) => (v == null ? null : Number(v));
const rows = <T>(data: unknown) => ((data ?? []) as T[]);
async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return rows<T>(data);
}

export interface CoachCard {
  user_id: string; username: string; full_name: string | null; avatar_url: string | null; verified: boolean; headline: string | null;
  specialties: Specialty[]; years_exp: number | null; city: string | null; trains: 'any' | 'men' | 'women'; online: boolean; in_person: boolean;
  price_from_sar: number | null; accepting: boolean; rating: number | null; reviews: number; clients: number; gyms: string[];
}
export async function loadDirectory(opts: { q?: string; specialty?: string | null; city?: string | null; gym?: string | null } = {}): Promise<CoachCard[]> {
  const r = await rpc<CoachCard>('coaches_directory', { p_q: opts.q || null, p_specialty: opts.specialty || null, p_city: opts.city || null, p_gym: opts.gym || null });
  return r.map((c) => ({ ...c, rating: n(c.rating), price_from_sar: n(c.price_from_sar), gyms: c.gyms ?? [], specialties: c.specialties ?? [] }));
}

export interface CoachDetail extends Omit<CoachCard, 'gyms'> {
  bio: string | null; certifications: string | null; languages: string[]; instagram: string | null;
  gyms: { id: string; name: string; name_en: string | null }[];
  my_link_id: string | null; my_link_status: 'pending' | 'active' | null; my_link_by: 'coach' | 'client' | null; my_scopes: Scope[] | null;
  can_review: boolean; is_me: boolean;
  /** حالة المراجعة، وسبب الرفض/الإيقاف (يظهر للمدرب نفسه والمالك فقط) */
  status: CoachStatus; review_note: string | null;
}
export async function loadCoach(id: string): Promise<CoachDetail | null> {
  const r = (await rpc<CoachDetail>('coach_detail', { p_coach: id }))[0];
  return r ? { ...r, rating: n(r.rating), price_from_sar: n(r.price_from_sar), gyms: r.gyms ?? [], specialties: r.specialties ?? [] } : null;
}
export interface CoachReview { user_id: string; username: string; full_name: string | null; avatar_url: string | null; rating: number; body: string | null; updated_at: string; is_me: boolean }
export const loadCoachReviews = (id: string) => rpc<CoachReview>('coach_reviews_list', { p_coach: id });
export async function rateCoach(me: string, coachId: string, rating: number, body: string) {
  const { error } = await supabase.from('coach_reviews').upsert({ coach_id: coachId, user_id: me, rating, body: body.trim() || null }, { onConflict: 'coach_id,user_id' });
  if (error) throw error;
}

// ---------- ملفي كمدرب ----------
/** الملف ينرسل للوحة المالك تلقائياً، وما يظهر للناس إلا بعد الاعتماد */
export type CoachStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export interface CoachProfile {
  user_id: string; headline: string | null; bio: string | null; specialties: Specialty[]; years_exp: number | null; certifications: string | null;
  languages: string[]; trains: 'any' | 'men' | 'women'; city: string | null; online: boolean; in_person: boolean; price_from_sar: number | null;
  accepting: boolean; instagram: string | null;
  status: CoachStatus; submitted_at: string; review_note: string | null;
}
export async function loadMyCoachProfile(me: string): Promise<CoachProfile | null> {
  const { data } = await supabase.from('coach_profiles').select('*').eq('user_id', me).maybeSingle();
  return data ? ({ ...data, price_from_sar: n(data.price_from_sar) } as CoachProfile) : null;
}
export async function saveCoachProfile(me: string, p: Omit<CoachProfile, 'user_id' | 'status' | 'submitted_at' | 'review_note'>) {
  const { error } = await supabase.from('coach_profiles').upsert({ ...p, user_id: me }, { onConflict: 'user_id' });
  if (error) throw error;
}
export interface MyCoachGym { gym_id: string; status: 'pending' | 'approved'; gyms: { name: string; name_en: string | null } | null }
export async function loadMyCoachGyms(me: string): Promise<MyCoachGym[]> {
  const { data } = await supabase.from('coach_gyms').select('gym_id, status, gyms(name, name_en)').eq('coach_id', me);
  return rows<MyCoachGym>(data);
}
export async function addCoachGym(me: string, gymId: string) {
  const { error } = await supabase.from('coach_gyms').insert({ coach_id: me, gym_id: gymId });
  if (error && !String(error.message).includes('duplicate')) throw error;
}
export async function removeCoachGym(coachId: string, gymId: string) {
  const { error } = await supabase.from('coach_gyms').delete().eq('coach_id', coachId).eq('gym_id', gymId);
  if (error) throw error;
}
export async function approveCoachGym(coachId: string, gymId: string) {
  const { error } = await supabase.from('coach_gyms').update({ status: 'approved' }).eq('coach_id', coachId).eq('gym_id', gymId);
  if (error) throw error;
}
export interface GymCoach { user_id: string; username: string; full_name: string | null; avatar_url: string | null; verified: boolean; headline: string | null; specialties: Specialty[]; rating: number | null; reviews: number; status: 'pending' | 'approved' }
export async function loadGymCoaches(gymId: string): Promise<GymCoach[]> {
  const r = await rpc<GymCoach>('gym_coaches', { p_gym: gymId }).catch(() => [] as GymCoach[]);
  return r.map((c) => ({ ...c, rating: n(c.rating), specialties: c.specialties ?? [] }));
}

// ---------- الربط ----------
export const inviteClient = (username: string, message?: string) => rpc('coach_invite', { p_username: username, p_message: message || null });
export const requestCoach = (coachId: string, scopes: Scope[], message?: string) => rpc('coach_request', { p_coach: coachId, p_scopes: scopes, p_message: message || null });
export const respondLink = (id: string, accept: boolean, scopes?: Scope[]) => rpc('coach_link_respond', { p_link: id, p_accept: accept, p_scopes: scopes ?? null });
export const setScopes = (id: string, scopes: Scope[]) => rpc('coach_link_scopes', { p_link: id, p_scopes: scopes });
export const endLink = (id: string) => rpc('coach_link_end', { p_link: id });

export interface CoachClient {
  link_id: string; client_id: string; username: string; full_name: string | null; avatar_url: string | null; status: 'pending' | 'active';
  requested_by: 'coach' | 'client'; scopes: Scope[]; message: string | null; created_at: string; accepted_at: string | null;
  last_workout_at: string | null; last_visit_at: string | null; program: string | null; adherence: number | null; next_session_at: string | null; sessions_done: number;
}
export const loadCoachClients = () => rpc<CoachClient>('coach_clients');

export interface MyCoach {
  link_id: string; coach_id: string; username: string; full_name: string | null; avatar_url: string | null; verified: boolean; headline: string | null;
  status: 'pending' | 'active'; requested_by: 'coach' | 'client'; scopes: Scope[]; message: string | null; created_at: string; accepted_at: string | null;
  program: string | null; program_days: number | null; program_notes: string | null; next_session_at: string | null; last_access_at: string | null;
}
export const loadMyCoaches = () => rpc<MyCoach>('my_coaches');

export interface AccessRow { coach_id: string; what: string; at: string }
export async function loadAccessLog(): Promise<AccessRow[]> {
  const { data } = await supabase.from('coach_access_log').select('coach_id, what, at').order('at', { ascending: false }).limit(50);
  return rows<AccessRow>(data);
}

// ---------- السجل الكامل + التقرير الشهري ----------
export type TimelineKind = 'workout' | 'visit' | 'inbody' | 'health' | 'food' | 'session' | 'program' | 'note';
export interface TimelineItem { at: string; kind: TimelineKind; title: string; detail: Record<string, any> }
export async function loadTimeline(clientId: string, from?: string, to?: string): Promise<TimelineItem[]> {
  const r = await rpc<TimelineItem>('client_timeline', { p_client: clientId, p_from: from ?? null, p_to: to ?? null });
  return r.sort((a, b) => b.at.localeCompare(a.at));
}
export interface MonthReport {
  month: string; workouts: number | null; workout_days: number | null; volume_kg: number | null; top_exercises: string[] | null; visits: number | null;
  sessions_done: number | null; sessions_missed: number | null; adherence: number | null; weight_start: number | null; weight_end: number | null;
  pbf_start: number | null; pbf_end: number | null; avg_steps: number | null; avg_sleep_min: number | null; avg_kcal: number | null; avg_protein: number | null;
}
export async function loadMonthReport(clientId: string, month?: string): Promise<MonthReport | null> {
  const r = (await rpc<MonthReport>('client_month_report', { p_client: clientId, p_month: month ?? null }))[0];
  if (!r) return null;
  const out: any = { ...r };
  for (const k of ['volume_kg', 'weight_start', 'weight_end', 'pbf_start', 'pbf_end']) out[k] = n(out[k]);
  return out as MonthReport;
}

// ---------- ملاحظات، برنامج، حصص، باقات ----------
export interface CoachNote { id: string; body: string; created_at: string }
export async function loadNotes(clientId: string): Promise<CoachNote[]> {
  const { data } = await supabase.from('coach_notes').select('id, body, created_at').eq('client_id', clientId).order('created_at', { ascending: false }).limit(100);
  return rows<CoachNote>(data);
}
export async function addNote(clientId: string, body: string) {
  const { error } = await supabase.from('coach_notes').insert({ client_id: clientId, body: body.trim() });
  if (error) throw error;
}
export async function deleteNote(id: string) { await supabase.from('coach_notes').delete().eq('id', id); }

export interface MyProgram { id: string; title: string; level: string; days: unknown[] }
export async function loadMyPrograms(me: string): Promise<MyProgram[]> {
  const { data } = await supabase.from('user_programs').select('id, title, level, days').eq('author', me).order('created_at', { ascending: false }).limit(50);
  return rows<MyProgram>(data);
}
export async function assignProgram(clientId: string, a: { title: string; program_id?: string | null; days_per_week: number; weeks: number; notes?: string }) {
  const { error } = await supabase.from('coach_assignments').insert({ client_id: clientId, title: a.title.trim(), program_id: a.program_id ?? null,
    days_per_week: a.days_per_week, weeks: a.weeks, notes: a.notes?.trim() || null });
  if (error) throw error;
}

export interface CoachSession { id: string; coach_id: string; client_id: string; starts_at: string; duration_min: number; place: string | null; status: 'booked' | 'done' | 'cancelled' | 'no_show'; notes: string | null }
export async function loadSessions(opts: { clientId?: string; coachId?: string; upcoming?: boolean } = {}): Promise<CoachSession[]> {
  let q = supabase.from('coach_sessions').select('*').order('starts_at', { ascending: !!opts.upcoming }).limit(100);
  if (opts.clientId) q = q.eq('client_id', opts.clientId);
  if (opts.coachId) q = q.eq('coach_id', opts.coachId);
  if (opts.upcoming) q = q.gte('starts_at', new Date(Date.now() - 3 * 3600_000).toISOString());
  const { data } = await q;
  return rows<CoachSession>(data);
}
export async function bookSession(clientId: string, startsAt: Date, durationMin: number, place?: string) {
  const { error } = await supabase.from('coach_sessions').insert({ client_id: clientId, starts_at: startsAt.toISOString(), duration_min: durationMin, place: place?.trim() || null });
  if (error) throw error;
}
export async function setSessionStatus(id: string, status: CoachSession['status']) {
  const { error } = await supabase.from('coach_sessions').update({ status }).eq('id', id);
  if (error) throw error;
}
export const cancelMySession = (id: string) => rpc('cancel_coach_session', { p_id: id });

export interface CoachPackage { id: string; coach_id: string; title: string; sessions: number; price_sar: number; valid_days: number; description: string | null; online: boolean; active: boolean }
export async function loadPackages(coachId: string): Promise<CoachPackage[]> {
  const { data } = await supabase.from('coach_packages').select('*').eq('coach_id', coachId).order('price_sar');
  return rows<CoachPackage>(data).map((p) => ({ ...p, price_sar: Number(p.price_sar) }));
}
export async function savePackage(p: Omit<CoachPackage, 'id' | 'coach_id'>, id?: string) {
  const { error } = id ? await supabase.from('coach_packages').update(p).eq('id', id) : await supabase.from('coach_packages').insert(p);
  if (error) throw error;
}
export async function deletePackage(id: string) { await supabase.from('coach_packages').delete().eq('id', id); }

// ---------- لوحة المالك: ملفات المدربين للمراجعة ----------
export interface VerifyReq {
  user_id: string; username: string; full_name: string | null; avatar_url: string | null; headline: string | null; bio: string | null;
  specialties: Specialty[]; years_exp: number | null; certifications: string | null; languages: string[]; trains: 'any' | 'men' | 'women';
  city: string | null; online: boolean; in_person: boolean; price_from_sar: number | null; instagram: string | null; submitted_at: string; gyms: string[];
}
export async function loadVerificationQueue(): Promise<VerifyReq[]> {
  try {
    const r = await rpc<VerifyReq>('coach_verification_queue');
    return r.map((x) => ({ ...x, price_from_sar: n(x.price_from_sar), specialties: x.specialties ?? [], languages: x.languages ?? [], gyms: x.gyms ?? [] }));
  } catch { return []; }
}
/** قرار المالك: اعتماد (يوثّق ويُظهر) أو رفض بسبب أو إيقاف */
export const reviewCoach = (userId: string, decision: 'approved' | 'rejected' | 'suspended', note?: string) =>
  rpc('review_coach', { p_user: userId, p_decision: decision, p_note: note?.trim() || null });

/** «YYYY-MM-DD HH:MM» بتوقيت الرياض → Date */
export function parseRiyadh(s: string): Date | null {
  const m = s.trim().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 3, +m[5]));
  return Number.isNaN(d.getTime()) ? null : d;
}
export function fmtRiyadh(iso: string, lng: string) {
  return new Date(iso).toLocaleString(lng === 'en' ? 'en-GB' : 'ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
