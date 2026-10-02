// تشغيل النادي: الاشتراكات، بطاقة الدخول (QR)، الاستقبال، البوابات، الطلبات، الملاحظات، الدعوات، الإعلانات، والحصص
import AsyncStorage from '@react-native-async-storage/async-storage';
import { todayIso } from './dates';
import { supabase } from './supabase';

export type MemState = 'active' | 'upcoming' | 'frozen' | 'expired' | 'cancelled';
export const STATE_COLOR: Record<MemState, string> = { active: '#2E9E6A', upcoming: '#5B8DEF', frozen: '#5B8DEF', expired: '#C23A12', cancelled: '#8A8A8A' };
export interface MyMembership {
  id: string; gym_id: string | null; chain_id: string | null; target_name: string; target_name_en: string | null; kind: 'membership' | 'pass';
  plan_name: string; starts_on: string; ends_on: string; state: MemState; days_left: number; frozen_until: string | null; notes: string | null;
}
export interface StaffGym { gym_id: string; name: string; name_en: string | null; chain_id: string | null; role: 'manager' | 'reception' }
export interface EntryResult {
  allowed: boolean; reason: string; member_id: string | null; member_name: string | null; username: string | null; avatar_url: string | null;
  plan_name: string | null; ends_on: string | null; days_left: number | null; membership_id: string | null; check_in_id: string | null; already_in: boolean;
}
export interface GymMember {
  membership_id: string; user_id: string | null; member_name: string | null; username: string | null; avatar_url: string | null; member_contact: string | null;
  claim_code: string | null; kind: 'membership' | 'pass'; plan_name: string; starts_on: string; ends_on: string; state: MemState; days_left: number;
  price_sar: number | null; last_visit: string | null; days_since_visit: number | null; chain_wide: boolean;
}
export type MemberFilter = 'all' | 'expiring' | 'expired' | 'inactive' | 'pending';

const ok = <T>(r: { data: T | null; error: any }): T => { if (r.error) throw r.error; return r.data as T; };

/** «باقي ٥ أيام» أو «آخر يوم»، وللمنتهي «انتهى قبل ٢٠ يوم» بدل «باقي -20 يوم» */
export const daysLeftText = (t: (key: string, opts?: Record<string, unknown>) => string, n: number) =>
  n < 0 ? t('gymops.endedAgo', { count: -n }) : t('gymops.daysLeft', { count: n });

// ---------- العضو ----------
export async function loadMyMemberships(): Promise<MyMembership[]> {
  const { data, error } = await supabase.rpc('my_memberships');
  if (error) return [];
  return ((data ?? []) as any[]).map((m) => ({ ...m, days_left: Number(m.days_left) }));
}
export async function newEntryToken(): Promise<{ token: string; code: string; expires_at: string }> {
  const rows = ok(await supabase.rpc('entry_token')) as any[];
  return rows[0];
}
export const entryLink = (token: string) => `arq://entry/${token}`;
export async function claimMembership(code: string) { ok(await supabase.rpc('claim_membership', { p_code: code.trim() })); }
export async function requestChange(membershipId: string, kind: 'freeze' | 'transfer', opts: { days?: number; from?: string | null; toGym?: string | null; reason?: string }) {
  ok(await supabase.rpc('request_membership_change', {
    p_membership: membershipId, p_kind: kind, p_days: opts.days ?? null, p_from: opts.from ?? null, p_to_gym: opts.toGym ?? null, p_reason: opts.reason ?? null,
  }));
}
export async function loadMyRequests(): Promise<any[]> {
  const { data } = await supabase.from('membership_requests').select('*').order('created_at', { ascending: false }).limit(20);
  return data ?? [];
}
export async function sendGymFeedback(me: string, gymId: string, category: 'complaint' | 'suggestion' | 'praise', body: string) {
  ok(await supabase.from('gym_feedback').insert({ gym_id: gymId, user_id: me, category, body: body.trim() }));
}
export async function loadMyFeedback(me: string): Promise<any[]> {
  const { data } = await supabase.from('gym_feedback').select('*').eq('user_id', me).order('created_at', { ascending: false }).limit(20);
  return data ?? [];
}
export async function myReferral(gymId: string): Promise<{ code: string; reward: string | null; joined: number } | null> {
  await supabase.rpc('my_referral_code', { p_gym: gymId });
  const { data } = await supabase.rpc('my_referrals', { p_gym: gymId });
  const r = ((data ?? []) as any[])[0];
  return r ? { code: r.code, reward: r.reward, joined: Number(r.joined) } : null;
}

// ---------- الاستقبال ----------
export async function loadStaffGyms(): Promise<StaffGym[]> {
  const { data, error } = await supabase.rpc('my_staff_gyms');
  if (error) return [];
  return (data ?? []) as StaffGym[];
}
const ENTRY_GYM_KEY = 'arq.entryGym';
export const rememberEntryGym = (id: string) => AsyncStorage.setItem(ENTRY_GYM_KEY, id).catch(() => {});
export const savedEntryGym = () => AsyncStorage.getItem(ENTRY_GYM_KEY).catch(() => null);

export async function verifyEntry(token: string, gymId: string): Promise<EntryResult> {
  const rows = ok(await supabase.rpc('verify_entry', { p_token: token.trim(), p_gym: gymId })) as any[];
  const r = rows[0];
  return { ...r, days_left: r.days_left == null ? null : Number(r.days_left) };
}

// ---------- الإدارة ----------
export async function isGymStaff(gymId: string) {
  const { data } = await supabase.rpc('is_gym_staff', { p_gym: gymId });
  return data === true;
}
export async function loadGymMembers(gymId: string, filter: MemberFilter): Promise<GymMember[]> {
  const rows = ok(await supabase.rpc('gym_members', { p_gym: gymId, p_filter: filter })) as any[];
  return (rows ?? []).map((m) => ({ ...m, days_left: Number(m.days_left), price_sar: m.price_sar == null ? null : Number(m.price_sar), days_since_visit: m.days_since_visit == null ? null : Number(m.days_since_visit) }));
}
export interface MembershipInput {
  id?: string | null; gymId: string | null; chainId: string | null; username?: string; memberName?: string; memberContact?: string;
  kind: 'membership' | 'pass'; plan: string; starts: string; ends: string; price?: number | null; notes?: string; referral?: string;
}
export async function saveMembership(m: MembershipInput) {
  const rows = ok(await supabase.rpc('upsert_membership', {
    p_id: m.id ?? null, p_gym: m.gymId, p_chain: m.chainId, p_username: m.username ?? null, p_member_name: m.memberName ?? null,
    p_member_contact: m.memberContact ?? null, p_kind: m.kind, p_plan: m.plan, p_starts: m.starts, p_ends: m.ends,
    p_price: m.price ?? null, p_notes: m.notes ?? null, p_referral: m.referral ?? null,
  })) as any;
  return (Array.isArray(rows) ? rows[0] : rows) as { id: string; claim_code: string | null; user_id: string | null };
}
export async function loadMembership(id: string) {
  const { data } = await supabase.from('memberships').select('*, profiles!memberships_user_id_fkey(username, full_name)').eq('id', id).maybeSingle();
  return data as any;
}
export async function deleteMembership(id: string) { ok(await supabase.from('memberships').delete().eq('id', id)); }

export async function importMemberships(gymId: string, rows: ImportRow[]) {
  return ok(await supabase.rpc('import_memberships', { p_gym: gymId, p_chain: null, p_rows: rows })) as { row_no: number; member_name: string | null; claim_code: string | null; error: string | null }[];
}
export async function loadGymRequests(gymId: string): Promise<any[]> {
  const { data } = await supabase.from('membership_requests')
    .select('*, memberships!inner(gym_id, chain_id, plan_name, ends_on), profiles!membership_requests_user_id_fkey(username, full_name)')
    .eq('status', 'pending').order('created_at').limit(100);
  return ((data ?? []) as any[]).filter((r) => r.memberships?.gym_id === gymId || r.memberships?.chain_id);
}
export async function decideRequest(id: string, approve: boolean, reply: string) {
  ok(await supabase.rpc('decide_membership_request', { p_id: id, p_approve: approve, p_reply: reply || null }));
}
export async function loadGymFeedback(gymId: string): Promise<any[]> {
  const { data } = await supabase.from('gym_feedback').select('*, profiles!gym_feedback_user_id_fkey(username, full_name)')
    .eq('gym_id', gymId).order('created_at', { ascending: false }).limit(100);
  return data ?? [];
}
export async function replyFeedback(id: string, status: 'new' | 'in_progress' | 'resolved', reply: string) {
  ok(await supabase.rpc('reply_gym_feedback', { p_id: id, p_status: status, p_reply: reply || null }));
}
export async function sendBroadcast(gymId: string, title: string, body: string): Promise<number> {
  return Number(ok(await supabase.rpc('send_gym_broadcast', { p_gym: gymId, p_chain: null, p_title: title.trim(), p_body: body.trim() })));
}
export async function loadBroadcasts(gymId: string): Promise<any[]> {
  const { data } = await supabase.from('gym_broadcasts').select('*').eq('gym_id', gymId).neq('title', '__winback__').order('created_at', { ascending: false }).limit(20);
  return data ?? [];
}
export async function nudgeInactive(gymId: string): Promise<number> {
  return Number(ok(await supabase.rpc('nudge_inactive_members', { p_gym: gymId })));
}
export async function loadStaff(gymId: string): Promise<any[]> {
  const { data } = await supabase.from('gym_staff').select('user_id, role, created_at, profiles!gym_staff_user_id_fkey(username, full_name, avatar_url)').eq('gym_id', gymId);
  return data ?? [];
}
export async function addStaff(gymId: string, username: string) { ok(await supabase.rpc('add_gym_staff', { p_gym: gymId, p_username: username })); }
export async function removeStaff(gymId: string, userId: string) { ok(await supabase.from('gym_staff').delete().eq('gym_id', gymId).eq('user_id', userId)); }
export async function loadGates(gymId: string): Promise<any[]> {
  const { data } = await supabase.from('gym_gates').select('id, name, key_hint, active, created_at, last_used_at').eq('gym_id', gymId).order('created_at');
  return data ?? [];
}
export async function createGate(gymId: string, name: string): Promise<{ gate_id: string; api_key: string }> {
  return (ok(await supabase.rpc('create_gate', { p_gym: gymId, p_name: name.trim() })) as any[])[0];
}
export async function setGateActive(id: string, active: boolean) { ok(await supabase.from('gym_gates').update({ active }).eq('id', id)); }
export async function loadGymSettings(gymId: string) {
  const { data } = await supabase.from('gym_settings').select('*').eq('gym_id', gymId).maybeSingle();
  return data as { referral_reward: string | null; class_cutoff_min: number } | null;
}
export async function saveGymSettings(gymId: string, s: { referral_reward?: string | null; class_cutoff_min?: number }) {
  ok(await supabase.from('gym_settings').upsert({ gym_id: gymId, ...s, updated_at: new Date().toISOString() }, { onConflict: 'gym_id' }));
}
export async function gymStats(gymId: string) {
  const [all, exp, ina, pend] = await Promise.all([
    loadGymMembers(gymId, 'all').catch(() => []), loadGymMembers(gymId, 'expiring').catch(() => []),
    loadGymMembers(gymId, 'inactive').catch(() => []), loadGymMembers(gymId, 'pending').catch(() => []),
  ]);
  const since = new Date(); since.setHours(0, 0, 0, 0);
  const { count } = await supabase.from('entry_log').select('id', { count: 'exact', head: true }).eq('gym_id', gymId).eq('allowed', true).gte('created_at', since.toISOString());
  return { active: all.filter((m) => m.state === 'active' || m.state === 'frozen').length, expiring: exp.length, inactive: ina.length, pending: pend.length, entriesToday: count ?? 0 };
}

// ---------- الحصص ----------
export interface ClassSlot {
  class_id: string; class_date: string; name: string; coach_name: string | null; start_time: string; duration_min: number; capacity: number;
  audience: 'men' | 'women' | 'mixed'; booked: number; waitlist: number; my_status: 'booked' | 'waitlist' | 'attended' | null; my_booking: string | null; starts_at: string;
}
export async function loadSchedule(gymId: string, days = 7): Promise<ClassSlot[]> {
  const { data, error } = await supabase.rpc('class_schedule', { p_gym: gymId, p_days: days });
  if (error) return [];
  return ((data ?? []) as any[]).map((c) => ({ ...c, booked: Number(c.booked), waitlist: Number(c.waitlist), capacity: Number(c.capacity), duration_min: Number(c.duration_min) }));
}
export async function bookClass(classId: string, date: string): Promise<'booked' | 'waitlist'> {
  return ok(await supabase.rpc('book_class', { p_class: classId, p_date: date })) as any;
}
export async function cancelBooking(id: string) { ok(await supabase.rpc('cancel_class_booking', { p_booking: id })); }
export async function loadClasses(gymId: string): Promise<any[]> {
  const { data } = await supabase.from('gym_classes').select('*').eq('gym_id', gymId).order('weekday').order('start_time');
  return data ?? [];
}
export async function saveClass(c: { id?: string; gym_id: string; name: string; coach_name?: string | null; weekday: number; start_time: string; duration_min: number; capacity: number; audience: string; members_only: boolean; active: boolean }) {
  const { id, ...row } = c;
  ok(id ? await supabase.from('gym_classes').update(row).eq('id', id) : await supabase.from('gym_classes').insert(row));
}
export async function deleteClass(id: string) { ok(await supabase.from('gym_classes').delete().eq('id', id)); }

// ---------- استيراد CSV ----------
export interface ImportRow { name: string; contact: string; plan: string; start: string; end: string; price: string; notes?: string }
export interface ParsedImport { rows: ImportRow[]; errors: { line: number; msg: string }[] }

const DIGITS: Record<string, string> = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
const latin = (s: string) => s.replace(/[٠-٩]/g, (d) => DIGITS[d] ?? d);
/** تاريخ من 2026-09-30 أو 30/09/2026 → YYYY-MM-DD */
export function normDate(s: string): string | null {
  const v = latin(s.trim());
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}
const HEAD: Record<string, keyof ImportRow> = {
  name: 'name', 'الاسم': 'name', 'اسم': 'name', contact: 'contact', phone: 'contact', email: 'contact', 'الجوال': 'contact', 'الإيميل': 'contact', 'رقم الجوال': 'contact',
  plan: 'plan', 'الاشتراك': 'plan', 'الباقة': 'plan', start: 'start', 'البداية': 'start', 'تاريخ البداية': 'start',
  end: 'end', 'النهاية': 'end', 'تاريخ النهاية': 'end', price: 'price', 'السعر': 'price', notes: 'notes', 'ملاحظات': 'notes',
};
/** يقرأ ملف CSV (فاصلة أو فاصلة منقوطة) بعناوين عربية أو إنجليزية */
export function parseMembersCsv(text: string): ParsedImport {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], errors: [{ line: 0, msg: 'empty' }] };
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const head = splitCsvLine(lines[0], sep).map((h) => HEAD[h.toLowerCase()] ?? HEAD[h] ?? null);
  const rows: ImportRow[] = []; const errors: { line: number; msg: string }[] = [];
  if (!head.includes('name') || !head.includes('end')) return { rows, errors: [{ line: 1, msg: 'missing_columns' }] };
  lines.slice(1).forEach((l, i) => {
    const cells = splitCsvLine(l, sep);
    const r: any = { name: '', contact: '', plan: '', start: '', end: '', price: '' };
    head.forEach((h, j) => { if (h) r[h] = cells[j] ?? ''; });
    const start = r.start ? normDate(r.start) : todayIso();
    const end = normDate(r.end);
    if (!r.name) errors.push({ line: i + 2, msg: 'no_name' });
    else if (!end || !start) errors.push({ line: i + 2, msg: 'bad_date' });
    else if (end < start) errors.push({ line: i + 2, msg: 'end_before_start' });
    else rows.push({ name: r.name, contact: r.contact, plan: r.plan || 'اشتراك', start, end, price: latin(r.price).replace(/[^\d.]/g, ''), notes: r.notes });
  });
  return { rows, errors };
}
