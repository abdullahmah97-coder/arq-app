// خدمات النادي لكل فرع (مسبح، سونا، جاكوزي…): القيمة الفعلية، مصدرها، وتأكيد الزوار
import { supabase } from './supabase';

export type ServiceGroup = 'wellness' | 'services' | 'facilities';
export type ServiceSource = 'gym' | 'manager' | 'admin' | 'public_info' | null;

export interface GymService {
  key: string; grp: ServiceGroup; sort_order: number; icon: string; name_ar: string; name_en: string;
  available: boolean | null; note: string | null; hours: string | null; source: ServiceSource;
  yes_votes: number; no_votes: number; yes_verified: number; no_verified: number; my_vote: boolean | null;
}
export interface ChainService {
  key: string; grp: ServiceGroup; sort_order: number; icon: string; name_ar: string; name_en: string;
  chain_default: boolean | null; note: string | null; branches_yes: number; branches_known: number; branches: number;
}

/** الخدمات اللي تظهر كفلاتر سريعة في دليل النوادي */
export const FILTER_KEYS = ['pool', 'sauna', 'jacuzzi_hot', 'jacuzzi_cold', 'steam', 'open_24h', 'women_section', 'parking', 'towels', 'group_classes'] as const;

const n = (v: unknown) => Number(v ?? 0);

export const serviceName = (s: { name_ar: string; name_en: string }, lng: string) => (lng === 'en' ? s.name_en : s.name_ar);

export async function loadGymServices(gymId: string): Promise<GymService[]> {
  const { data, error } = await supabase.rpc('gym_services', { p_gym: gymId });
  if (error) return [];
  return ((data ?? []) as any[]).map((r) => ({
    ...r, sort_order: n(r.sort_order), yes_votes: n(r.yes_votes), no_votes: n(r.no_votes), yes_verified: n(r.yes_verified), no_verified: n(r.no_verified),
  }));
}

export async function loadChainServices(chainId: string): Promise<ChainService[]> {
  const { data, error } = await supabase.rpc('chain_services', { p_chain: chainId });
  if (error) return [];
  return ((data ?? []) as any[]).map((r) => ({ ...r, sort_order: n(r.sort_order), branches_yes: n(r.branches_yes), branches_known: n(r.branches_known), branches: n(r.branches) }));
}

/** حفظ خدمة لفرع: available=null يعني «ما أعرف» (يرجع لافتراضي السلسلة) */
export async function saveGymService(gymId: string, key: string, available: boolean | null, note?: string | null, hours?: string | null) {
  if (available === null) {
    const { error } = await supabase.from('gym_amenities').delete().eq('gym_id', gymId).eq('amenity', key);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('gym_amenities').upsert(
    { gym_id: gymId, amenity: key, available, note: note?.trim() || null, hours: hours?.trim() || null },
    { onConflict: 'gym_id,amenity' });
  if (error) throw error;
}

export async function saveChainService(chainId: string, key: string, available: boolean | null, note?: string | null) {
  if (available === null) {
    const { error } = await supabase.from('chain_amenities').delete().eq('chain_id', chainId).eq('amenity', key);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('chain_amenities').upsert(
    { chain_id: chainId, amenity: key, available, note: note?.trim() || null, source: 'manager' },
    { onConflict: 'chain_id,amenity' });
  if (error) throw error;
}

/** صوت الزائر: موجودة / مو موجودة، أو null لسحب الصوت */
export async function voteService(me: string, gymId: string, key: string, vote: boolean | null) {
  if (vote === null) {
    const { error } = await supabase.from('amenity_votes').delete().eq('gym_id', gymId).eq('amenity', key).eq('user_id', me);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('amenity_votes').upsert({ gym_id: gymId, amenity: key, user_id: me, vote }, { onConflict: 'gym_id,amenity,user_id' });
  if (error) throw error;
}

export async function gymsWithServices(keys: string[]): Promise<Set<string> | null> {
  if (!keys.length) return null;
  const { data, error } = await supabase.rpc('gyms_with_services', { p_keys: keys });
  if (error) return null;
  return new Set(((data ?? []) as any[]).map((r) => (typeof r === 'string' ? r : r.gyms_with_services)));
}

export async function chainsWithServices(keys: string[]): Promise<Set<string> | null> {
  if (!keys.length) return null;
  const { data, error } = await supabase.rpc('chains_with_services', { p_keys: keys });
  if (error) return null;
  return new Set(((data ?? []) as any[]).map((r) => (typeof r === 'string' ? r : r.chains_with_services)));
}

export async function canManageGymOrChain(gymId: string) {
  const { data } = await supabase.rpc('can_manage_gym_or_chain', { p_gym: gymId });
  return data === true;
}

export interface ServiceDef { key: string; grp: ServiceGroup; sort_order: number; icon: string; name_ar: string; name_en: string }
let catalog: ServiceDef[] | null = null;
/** كتالوج الخدمات (يتخزن بالذاكرة) */
export async function loadServiceCatalog(): Promise<ServiceDef[]> {
  if (catalog) return catalog;
  const { data, error } = await supabase.from('amenities').select('key, grp, sort_order, icon, name_ar, name_en').eq('active', true).order('sort_order');
  if (error) return [];
  catalog = (data ?? []) as ServiceDef[];
  return catalog;
}
