// عروض النوادي وتقييماتها: دليل النوادي، العروض، والتعليقات (مع علامة «زار النادي»)
import { monthly } from './clubsMath';
import { supabase } from './supabase';

export * from './clubsMath';

export type Audience = 'men' | 'women' | 'mixed';
export interface Club {
  id: string; name: string; name_en: string | null; chain: string | null; city: string | null; district: string | null;
  audience: Audience; logo_path: string | null; website: string | null; lat: number; lng: number; verified: boolean;
  rating: number | null; reviews: number; offers: number; best_monthly: number | null; distance_m: number | null;
}
export interface Offer {
  id: string; gym_id: string; title: string; details: string | null; price_sar: number; old_price_sar: number | null;
  months: number; ends_on: string | null; url: string | null; promo_code: string | null; active: boolean; created_at: string;
  gyms?: Pick<Club, 'id' | 'name' | 'name_en' | 'chain' | 'city' | 'district' | 'audience' | 'logo_path'> | null;
}
export interface Review {
  user_id: string; username: string; full_name: string | null; avatar_url: string | null; points: number;
  rating: number; body: string | null; updated_at: string; visited: boolean; is_me: boolean;
}

const num = (v: unknown) => (v == null ? null : Number(v));

export async function loadClubs(pos?: { lat: number; lng: number } | null): Promise<Club[]> {
  const { data } = await supabase.rpc('gyms_directory', { p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null, p_city: null });
  return ((data ?? []) as any[]).map((g) => ({
    ...g, rating: num(g.rating), reviews: Number(g.reviews), offers: Number(g.offers), best_monthly: num(g.best_monthly), distance_m: num(g.distance_m),
  }));
}

const OSEL = 'id, gym_id, title, details, price_sar, old_price_sar, months, ends_on, url, promo_code, active, created_at, gyms(id, name, name_en, chain, city, district, audience, logo_path)';
const toOffer = (o: any): Offer => ({ ...o, price_sar: Number(o.price_sar), old_price_sar: num(o.old_price_sar) });

/** العروض الفعّالة مرتبة بالسعر الشهري المكافئ */
export async function loadOffers(gymId?: string): Promise<Offer[]> {
  let q = supabase.from('gym_offers').select(OSEL).order('created_at', { ascending: false }).limit(100);
  if (gymId) q = q.eq('gym_id', gymId);
  const { data } = await q;
  return ((data ?? []) as any[]).map(toOffer).sort((a, b) => monthly(a) - monthly(b));
}

export async function loadReviews(gymId: string): Promise<Review[]> {
  const { data } = await supabase.rpc('gym_reviews_list', { p_gym: gymId });
  return ((data ?? []) as any[]).map((r) => ({ ...r, rating: Number(r.rating) }));
}

export async function saveReview(me: string, gymId: string, rating: number, body: string) {
  const { error } = await supabase.from('gym_reviews').upsert({ gym_id: gymId, user_id: me, rating, body: body.trim() || null }, { onConflict: 'gym_id,user_id' });
  if (error) throw error;
}
export const deleteReview = (me: string, gymId: string) => supabase.from('gym_reviews').delete().eq('gym_id', gymId).eq('user_id', me);

export async function canManageGym(gymId: string) {
  const { data } = await supabase.rpc('can_manage_gym', { p_gym: gymId });
  return data === true;
}

export type OfferInput = Pick<Offer, 'gym_id' | 'title' | 'details' | 'price_sar' | 'old_price_sar' | 'months' | 'ends_on' | 'url' | 'promo_code' | 'active'>;
export async function saveOffer(o: OfferInput, id?: string) {
  const url = (o.url ?? '').trim();
  const row = { ...o, title: o.title.trim(), details: o.details?.trim() || null, promo_code: o.promo_code?.trim() || null,
    url: url ? (/^https:\/\//i.test(url) ? url : `https://${url.replace(/^http:\/\//i, '')}`) : null };
  const { error } = id ? await supabase.from('gym_offers').update(row).eq('id', id) : await supabase.from('gym_offers').insert(row);
  if (error) throw error;
}
export const deleteOffer = (id: string) => supabase.from('gym_offers').delete().eq('id', id);

