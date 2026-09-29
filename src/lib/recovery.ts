// الاستشفاء: دليل مراكز العلاج الطبيعي والاستشفاء + «أضف مركزك» + روتين إطالة حسب تمرين اليوم
import { Linking } from 'react-native';
import type { Muscle } from '../three/rig';
import { getExercise, type ExerciseGuide } from '../three/catalog';
import { supabase } from './supabase';

export type CenterKind = 'physio' | 'recovery' | 'sports_medicine' | 'hospital';
export const CENTER_KINDS: CenterKind[] = ['physio', 'recovery', 'sports_medicine', 'hospital'];
export const CENTER_SERVICES = [
  'sports_injury', 'manual_therapy', 'post_op', 'dry_needling', 'massage', 'cupping', 'cryotherapy', 'hydrotherapy',
  'sauna', 'compression', 'hbot', 'home_visits', 'women_health', 'performance',
] as const;
export type CenterService = (typeof CENTER_SERVICES)[number];
export const CENTER_CITIES = ['الرياض', 'جدة', 'مكة', 'المدينة', 'الدمام', 'الخبر', 'الظهران', 'الأحساء', 'الجبيل', 'القصيم', 'أبها', 'خميس مشيط', 'الطائف', 'تبوك', 'حائل', 'جازان', 'نجران', 'ينبع', 'الباحة', 'الجوف'];

export interface RecoveryCenter {
  id: string;
  owner: string | null;
  listed_by: 'owner' | 'arq';
  name: string;
  name_en: string | null;
  kind: CenterKind;
  cities: string[];
  services: CenterService[];
  description: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  instagram: string | null;
  logo_path: string | null;
  license_no: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  /** عرض لمستخدمي أرك (اختياري) */
  offer_text?: string | null;
  offer_code?: string | null;
  offer_ends?: string | null;
  review_note: string | null;
  created_at: string;
}

/** شريك أرك = المركز سجّل بنفسه وانعتمد. غيره مدرج من موقعه الرسمي */
export const isPartner = (c: RecoveryCenter) => c.listed_by === 'owner' && c.status === 'approved';

export async function loadCenters(): Promise<RecoveryCenter[]> {
  const { data, error } = await supabase.from('recovery_centers').select('*').eq('status', 'approved')
    .order('listed_by', { ascending: false }).order('created_at', { ascending: true }).limit(300);
  if (error) throw error;
  // الشركاء أولاً
  return ((data ?? []) as RecoveryCenter[]).sort((a, b) => Number(isPartner(b)) - Number(isPartner(a)));
}

export async function loadMyCenter(me: string): Promise<RecoveryCenter | null> {
  const { data } = await supabase.from('recovery_centers').select('*').eq('owner', me).maybeSingle();
  return (data as RecoveryCenter) ?? null;
}

export async function loadCenter(id: string): Promise<RecoveryCenter | null> {
  const { data } = await supabase.from('recovery_centers').select('*').eq('id', id).maybeSingle();
  return (data as RecoveryCenter) ?? null;
}

export async function loadCenterRequests(): Promise<RecoveryCenter[]> {
  const { data } = await supabase.from('recovery_centers').select('*').eq('listed_by', 'owner').eq('status', 'pending')
    .order('created_at', { ascending: true }).limit(50);
  return (data ?? []) as RecoveryCenter[];
}

export async function reviewCenter(id: string, decision: 'approved' | 'rejected', note?: string) {
  const { error } = await supabase.rpc('review_center', { p_id: id, p_decision: decision, p_note: note?.trim() || null });
  if (error) throw error;
}

export type CenterInput = Pick<RecoveryCenter, 'name' | 'name_en' | 'kind' | 'cities' | 'services' | 'description' | 'phone' | 'whatsapp' | 'website' | 'instagram' | 'logo_path' | 'license_no' | 'offer_text' | 'offer_code' | 'offer_ends'>;

/** ينظف المدخلات: الروابط https، الجوال أرقام، الواتساب بصيغة دولية بدون + */
export function normalizeCenter(c: CenterInput): CenterInput {
  const clean = (s: string | null) => (s ?? '').trim() || null;
  const url = (u: string | null) => {
    const v = clean(u);
    return v ? (/^https:\/\//i.test(v) ? v : `https://${v.replace(/^http:\/\//i, '')}`) : null;
  };
  const digits = (s: string | null) => (s ?? '').replace(/[^\d+]/g, '');
  const wa = (s: string | null) => {
    let d = digits(s).replace(/^\+/, '').replace(/^00/, '');
    if (!d) return null;
    if (d.startsWith('05')) d = `966${d.slice(1)}`;
    else if (d.startsWith('5') && d.length === 9) d = `966${d}`;
    return d;
  };
  return {
    ...c,
    name: c.name.trim(),
    name_en: clean(c.name_en),
    description: clean(c.description),
    phone: digits(c.phone) || null,
    whatsapp: wa(c.whatsapp),
    website: url(c.website),
    instagram: clean(c.instagram)?.replace(/^@/, '') ?? null,
    license_no: clean(c.license_no),
    offer_text: clean(c.offer_text ?? null),
    offer_code: clean(c.offer_code ?? null)?.toUpperCase().replace(/[^A-Z0-9_-]/g, '') || null,
    offer_ends: clean(c.offer_ends ?? null),
  };
}

/** asListing: المالك يضيف مركز من موقعه الرسمي بدون صاحب (يظهر مباشرة) */
export async function saveCenter(me: string, input: CenterInput, id?: string, asListing = false) {
  const c = normalizeCenter(input);
  const q = id ? supabase.from('recovery_centers').update(c).eq('id', id)
    : supabase.from('recovery_centers').insert(asListing ? { ...c, owner: null, listed_by: 'arq', status: 'approved' } : { ...c, owner: me });
  const { data, error } = await q.select('id').single();
  if (error) throw error;
  return data.id as string;
}

export const callCenter = (c: RecoveryCenter) => c.phone && Linking.openURL(`tel:${c.phone.replace(/\s/g, '')}`);
export const whatsappCenter = (c: RecoveryCenter, text: string) =>
  c.whatsapp && Linking.openURL(`https://wa.me/${c.whatsapp}?text=${encodeURIComponent(text)}`);
export const openCenterSite = (c: RecoveryCenter) => c.website && Linking.openURL(c.website);
export const openCenterInstagram = (c: RecoveryCenter) => c.instagram && Linking.openURL(`https://instagram.com/${c.instagram}`);

// ---------------------------------------------------------------------
// روتين الإطالة بعد التمرين: من تمارين الإطالة في المكتبة (بالصور)، حسب العضلات اللي اشتغلت
// ---------------------------------------------------------------------
const STRETCH: Record<Muscle, string[]> = {
  chest: ['Chest_And_Front_Of_Shoulder_Stretch', 'Behind_Head_Chest_Stretch'],
  shoulders: ['Shoulder_Stretch', 'Seated_Front_Deltoid'],
  rearDelts: ['Shoulder_Stretch'],
  triceps: ['Triceps_Stretch', 'Overhead_Triceps'],
  biceps: ['Standing_Biceps_Stretch', 'Seated_Biceps'],
  forearms: ['Kneeling_Forearm_Stretch'],
  lats: ['Overhead_Lat', 'One_Arm_Against_Wall'],
  upperBack: ['Upper_Back_Stretch', 'Middle_Back_Stretch'],
  lowerBack: ['Childs_Pose', 'Cat_Stretch', 'Hug_Knees_To_Chest'],
  abs: ['Standing_Lateral_Stretch', 'Overhead_Stretch'],
  quads: ['All_Fours_Quad_Stretch', 'Kneeling_Hip_Flexor'],
  hamstrings: ['Hamstring_Stretch', 'Lying_Hamstring'],
  glutes: ['Lying_Glute', 'Seated_Glute'],
  calves: ['Standing_Gastrocnemius_Calf_Stretch', 'Calf_Stretch_Hands_Against_Wall'],
};
/** فوم رولر لنفس العضلات (اختياري) */
const ROLL: Partial<Record<Muscle, string>> = {
  quads: 'Quadriceps-SMR', hamstrings: 'Hamstring-SMR', calves: 'Calves-SMR', glutes: 'Piriformis-SMR',
  lats: 'Latissimus_Dorsi-SMR', upperBack: 'Rhomboids-SMR',
};
const FULL_BODY: Muscle[] = ['hamstrings', 'quads', 'glutes', 'chest', 'lats', 'lowerBack', 'calves'];
const ORDER: Muscle[] = ['chest', 'shoulders', 'rearDelts', 'triceps', 'biceps', 'forearms', 'lats', 'upperBack', 'abs', 'quads', 'hamstrings', 'glutes', 'calves', 'lowerBack'];

export interface RoutineItem { ex: ExerciseGuide; muscle: Muscle; roll: boolean }

/** روتين ٦–٨ حركات: إطالة لكل عضلة اشتغلت (والأسفل ظهر آخر شي)، وفوم رولر للأرجل والظهر إذا تبي */
export function stretchRoutine(worked: Muscle[], opts: { roll?: boolean; max?: number } = {}): RoutineItem[] {
  const max = opts.max ?? 8;
  const set = new Set<Muscle>(worked.length ? worked : FULL_BODY);
  if (set.has('lowerBack') || set.has('hamstrings') || set.has('glutes')) set.add('lowerBack');
  const out: RoutineItem[] = [];
  const seen = new Set<string>();
  const add = (id: string | undefined, muscle: Muscle, roll: boolean) => {
    if (!id || seen.has(id) || out.length >= max) return;
    const ex = getExercise(`x_${id}`);
    if (!ex) return;
    seen.add(id);
    out.push({ ex, muscle, roll });
  };
  const muscles = ORDER.filter((m) => set.has(m));
  if (opts.roll) for (const m of muscles) add(ROLL[m], m, true);
  for (const m of muscles) add(STRETCH[m][0], m, false);
  // لو باقي مكان: الإطالة الثانية للعضلات الكبيرة
  for (const m of muscles) if (['quads', 'hamstrings', 'glutes', 'chest', 'lats'].includes(m)) add(STRETCH[m][1], m, false);
  return out;
}

export const ALL_ROUTINE_IDS = [...new Set([...Object.values(STRETCH).flat(), ...Object.values(ROLL)])] as string[];

// ---------- مواعيد المراكز (الرابط الوحيد اللي يسمح للمركز يرسل تنبيه) ----------
export type ApptStatus = 'requested' | 'confirmed' | 'declined' | 'cancelled' | 'done';
export interface Appointment {
  id: string; center_id: string; user_id: string; status: ApptStatus; preferred: string | null; note: string | null;
  starts_at: string | null; center_note: string | null; created_at: string;
  recovery_centers?: Pick<RecoveryCenter, 'id' | 'name' | 'name_en' | 'phone' | 'whatsapp' | 'logo_path' | 'kind'> | null;
}
export interface CenterAppointment extends Omit<Appointment, 'center_id' | 'recovery_centers'> { name: string; username: string; avatar_url: string | null }

export async function requestAppointment(centerId: string, preferred: string, note: string) {
  const { error } = await supabase.rpc('request_center_appointment', { p_center: centerId, p_preferred: preferred.trim() || null, p_note: note.trim() || null });
  if (error) throw error;
}
export async function myAppointments(me: string): Promise<Appointment[]> {
  const { data } = await supabase.from('center_appointments')
    .select('*, recovery_centers(id, name, name_en, phone, whatsapp, logo_path, kind)').eq('user_id', me)
    .order('created_at', { ascending: false }).limit(50);
  return (data ?? []) as Appointment[];
}
export async function centerAppointments(centerId: string): Promise<CenterAppointment[]> {
  const { data } = await supabase.rpc('center_appointment_list', { p_center: centerId });
  return (data ?? []) as CenterAppointment[];
}
export async function respondAppointment(id: string, accept: boolean, startsAt?: Date | null, note?: string) {
  const { error } = await supabase.rpc('respond_center_appointment', {
    p_id: id, p_accept: accept, p_starts_at: startsAt ? startsAt.toISOString() : null, p_note: note?.trim() || null,
  });
  if (error) throw error;
}
export async function closeAppointment(id: string, status: 'cancelled' | 'done') {
  const { error } = await supabase.rpc('close_center_appointment', { p_id: id, p_status: status });
  if (error) throw error;
}
export async function sendCenterNotice(centerId: string, title: string, body: string): Promise<number> {
  const { data, error } = await supabase.rpc('send_center_notice', { p_center: centerId, p_title: title.trim(), p_body: body.trim() });
  if (error) throw error;
  return Number(data ?? 0);
}
/** يقبل الموعد إذا المركز شريك (له صاحب ومعتمد) */
export const takesAppointments = (c: RecoveryCenter) => !!c.owner && c.status === 'approved';
