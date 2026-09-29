// الشركاء: نوع الحساب، بوابة الشركاء، طلبات انضمام الأندية، ولوحة تحكم المالك بكل الشركاء (مفروضة في القاعدة)
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadMyVenue, type Venue } from './bookings';
import { loadMyBrand, type Brand } from './brands';
import { loadMyCoachProfile, type CoachProfile } from './coaching';
import { loadStaffGyms, type StaffGym } from './gymops';
import { loadMyCenter, type RecoveryCenter } from './recovery';
import { supabase } from './supabase';

export type PartnerKind = 'club' | 'store' | 'coach' | 'center' | 'venue';
export const PARTNER_KINDS: PartnerKind[] = ['club', 'store', 'coach', 'center', 'venue'];
export type AccountType = 'trainee' | 'club' | 'coach' | 'store' | 'restaurant' | 'center' | 'venue';
export const ACCOUNT_TYPES: AccountType[] = ['trainee', 'club', 'coach', 'restaurant', 'store', 'center', 'venue'];
export const ACCOUNT_ICON: Record<AccountType, string> = {
  trainee: 'barbell-outline', club: 'business-outline', coach: 'person-outline', restaurant: 'restaurant-outline', store: 'storefront-outline', center: 'medkit-outline', venue: 'tennisball-outline',
};
export const KIND_ICON: Record<PartnerKind, string> = { club: 'business-outline', store: 'storefront-outline', coach: 'person-outline', center: 'medkit-outline', venue: 'tennisball-outline' };

/** فئة الشريك من نوع الحساب (المطعم متجر) */
export const kindOf = (a: AccountType | null | undefined): PartnerKind | null =>
  !a || a === 'trainee' ? null : a === 'restaurant' ? 'store' : a;

export async function setAccountType(me: string, type: AccountType) {
  const { error } = await supabase.from('profiles').update({ account_type: type }).eq('id', me);
  if (error) throw error;
}

// ---------- وضع الرئيسية للشريك: لوحة التحكم أو وضع المتدرب ----------
const MODE_KEY = (me: string) => `arq.homeMode.v1:${me}`;
export type HomeMode = 'partner' | 'trainee';
export const loadHomeMode = async (me: string): Promise<HomeMode> =>
  ((await AsyncStorage.getItem(MODE_KEY(me)).catch(() => null)) as HomeMode | null) ?? 'partner';
export const saveHomeMode = (me: string, m: HomeMode) => AsyncStorage.setItem(MODE_KEY(me), m).catch(() => {});

// ---------- طلبات انضمام الأندية ----------
export type ClubRole = 'owner' | 'manager' | 'marketing' | 'other';
export const CLUB_ROLES: ClubRole[] = ['owner', 'manager', 'marketing', 'other'];
export interface ClubRequest {
  id: string; user_id: string; chain_id: string | null; gym_id: string | null; club_name: string; role: ClubRole; cr_number: string | null;
  phone: string; email: string | null; city: string | null; branches: number | null; note: string | null;
  status: 'pending' | 'approved' | 'rejected'; review_note: string | null; created_at: string;
}
export interface ClubRequestInput {
  chainId: string | null; name: string; role: ClubRole; cr: string; phone: string; email: string; city: string; branches: string; note: string;
}

export async function requestClubPartner(i: ClubRequestInput): Promise<string> {
  const branches = parseInt(i.branches, 10);
  const { data, error } = await supabase.rpc('request_club_partner', {
    p_chain: i.chainId, p_gym: null, p_name: i.name.trim(), p_role: i.role, p_cr: i.cr.trim() || null, p_phone: i.phone,
    p_email: i.email.trim() || null, p_city: i.city.trim() || null, p_branches: Number.isFinite(branches) && branches > 0 ? branches : null, p_note: i.note.trim() || null,
  });
  if (error) throw error;
  return data as string;
}

export async function myClubRequest(me: string): Promise<ClubRequest | null> {
  const { data } = await supabase.from('club_requests').select('*').eq('user_id', me).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return (data as ClubRequest) ?? null;
}

export interface ClubQueueItem extends Omit<ClubRequest, 'status' | 'review_note'> {
  username: string; full_name: string | null; chain_name: string | null; gym_name: string | null;
}
export async function clubRequestQueue(): Promise<ClubQueueItem[]> {
  const { data } = await supabase.rpc('club_request_queue');
  return (data ?? []) as ClubQueueItem[];
}
export async function reviewClubRequest(id: string, decision: 'approved' | 'rejected', note?: string, chainId?: string | null) {
  const { error } = await supabase.rpc('review_club_request', { p_id: id, p_decision: decision, p_note: note?.trim() || null, p_chain: chainId ?? null });
  if (error) throw error;
}

// ---------- حالة الشريك (لبوابة الشركاء ورئيسية الشريك) ----------
export interface ManagedChain { id: string; name: string; name_en: string | null; partner: boolean; active: boolean }
export interface PartnerState {
  chains: ManagedChain[];
  gyms: StaffGym[];
  clubRequest: ClubRequest | null;
  store: Brand | null;
  coach: CoachProfile | null;
  center: RecoveryCenter | null;
  venue: Venue | null;
}

export async function loadPartnerState(me: string): Promise<PartnerState> {
  const [cm, gyms, clubRequest, store, coach, center, venue] = await Promise.all([
    supabase.from('chain_managers').select('gym_chains(id, name, name_en, partner, active)').eq('user_id', me),
    loadStaffGyms().catch(() => [] as StaffGym[]),
    myClubRequest(me).catch(() => null),
    loadMyBrand(me).catch(() => null),
    loadMyCoachProfile(me).catch(() => null),
    loadMyCenter(me).catch(() => null),
    loadMyVenue(me).catch(() => null),
  ]);
  const chains = ((cm.data ?? []) as any[]).map((r) => r.gym_chains).filter(Boolean) as ManagedChain[];
  return { chains, gyms: gyms.filter((g) => g.role === 'manager'), clubRequest, store, coach, center, venue };
}

/** هل الحساب شريك فعلي (عنده صفحة أو إدارة) */
export const hasPartnerAccess = (s: PartnerState) => !!(s.chains.length || s.gyms.length || s.store || s.coach || s.center || s.venue);

// ---------- لوحة المالك ----------
export type RowStatus = 'pending' | 'approved' | 'rejected' | 'suspended' | 'listed';
export interface PartnerRow {
  id: string; name: string; subtitle: string; status: RowStatus; logo_path: string | null; avatar_url: string | null;
  owner_id: string | null; owner_username: string | null; listed_by: 'owner' | 'arq'; partner: boolean;
  meta: Record<string, any>; created_at: string;
}
export interface Overview { kind: PartnerKind; pending: number; live: number; partners: number; hidden: number; total: number }

export async function partnerOverview(): Promise<Partial<Record<PartnerKind, Overview>>> {
  const { data } = await supabase.rpc('partner_overview');
  return Object.fromEntries(((data ?? []) as Overview[]).map((r) => [r.kind, r]));
}

export async function listPartners(kind: PartnerKind, q?: string): Promise<PartnerRow[]> {
  const { data, error } = await supabase.rpc('admin_partner_list', { p_kind: kind, p_q: q?.trim() || null });
  if (error) throw error;
  return (data ?? []) as PartnerRow[];
}

export type PartnerAction = 'approve' | 'reject' | 'hide' | 'show' | 'delete' | 'partner_on' | 'partner_off';
export async function partnerAction(kind: PartnerKind, id: string, action: PartnerAction, note?: string) {
  const { error } = await supabase.rpc('admin_partner_action', { p_kind: kind, p_id: id, p_action: action, p_note: note?.trim() || null });
  if (error) throw error;
}

/** ربط صفحة بحساب صاحبها (باسم المستخدم). للمدرب: id فارغ ويصير الحساب مدرب معتمد */
export async function assignPartner(kind: PartnerKind, id: string | null, username: string) {
  const { error } = await supabase.rpc('admin_assign_partner', { p_kind: kind, p_id: id, p_username: username.trim() });
  if (error) throw error;
}

export async function chainManagers(chainId: string): Promise<{ user_id: string; username: string; full_name: string | null }[]> {
  const { data } = await supabase.rpc('admin_chain_managers', { p_chain: chainId });
  return (data ?? []) as any[];
}
export async function removeChainManager(chainId: string, userId: string) {
  const { error } = await supabase.rpc('admin_remove_chain_manager', { p_chain: chainId, p_user: userId });
  if (error) throw error;
}

export interface ChainCreate { name: string; name_en: string | null; audience: 'men' | 'women' | 'mixed'; website: string | null; instagram: string | null; description: string | null; logo_path: string | null }
export async function createChain(c: ChainCreate): Promise<string> {
  const { data, error } = await supabase.rpc('admin_create_chain', {
    p_name: c.name, p_name_en: c.name_en, p_audience: c.audience, p_website: c.website, p_instagram: c.instagram, p_description: c.description, p_logo: c.logo_path,
  });
  if (error) throw error;
  return data as string;
}

/** حالة الصف في لوحة المالك: ينتظر، ظاهر، مخفي، مرفوض */
export type StatusGroup = 'pending' | 'live' | 'hidden' | 'rejected';
export const statusGroup = (s: RowStatus): StatusGroup =>
  s === 'pending' ? 'pending' : s === 'approved' || s === 'listed' ? 'live' : s === 'suspended' ? 'hidden' : 'rejected';
