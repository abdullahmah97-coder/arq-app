// النوادي: نحدّثها من مزود الخرائط (دالة gyms-nearby: Google Places أو OpenStreetMap) ثم نقرأها من القاعدة
import type { Position } from './location';
import { supabase } from './supabase';
import type { Gym } from './types';

/**
 * يطلب من الخادم إضافة نوادي المنطقة من الخريطة — لا يوقف التطبيق لو تأخر أو فشل.
 * precise: مسح دقيق حولك (~٤٠٠ م) وقت تسجيل الحضور، عشان يطلع النادي اللي أنت فيه حتى في المناطق المزدحمة.
 */
export async function refreshNearbyGyms(pos: Pick<Position, 'lat' | 'lng'>, opts: { precise?: boolean; timeoutMs?: number } = {}): Promise<void> {
  try {
    await Promise.race([
      supabase.functions.invoke('gyms-nearby', { body: { lat: pos.lat, lng: pos.lng, precise: !!opts.precise } }),
      new Promise((resolve) => setTimeout(resolve, opts.timeoutMs ?? 9000)),
    ]);
  } catch {
    // الخريطة اختيارية: نكمل بالنوادي الموجودة في القاعدة
  }
}

export async function nearbyGyms(pos: Pick<Position, 'lat' | 'lng'>, km: number): Promise<Gym[]> {
  const { data, error } = await supabase.rpc('nearby_gyms', { p_lat: pos.lat, p_lng: pos.lng, p_km: km });
  if (error) throw error;
  return (data ?? []) as Gym[];
}

export class GymSearchError extends Error {}

/** بحث عن نادي بالاسم في الخريطة (والنتائج تنضاف للقاعدة كنوادي حقيقية) */
export async function searchGymsOnMap(q: string, pos?: Pick<Position, 'lat' | 'lng'> | null): Promise<Gym[]> {
  const { data, error } = await supabase.functions.invoke('gyms-nearby', {
    body: { q, ...(pos ? { lat: pos.lat, lng: pos.lng } : {}) },
  });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    throw new GymSearchError(status === 429 ? 'rate_limited' : 'map_unavailable');
  }
  return ((data as { gyms?: Gym[] })?.gyms ?? []) as Gym[];
}

/** بحث في النوادي المحفوظة عندنا (سريع، بدون خريطة) */
export async function searchGymsSaved(q: string): Promise<Gym[]> {
  const s = q.trim().replace(/[%_,()]/g, '');
  if (s.length < 2) return [];
  const { data } = await supabase.from('gyms').select('*')
    .or(`name.ilike.%${s}%,name_en.ilike.%${s}%,city.ilike.%${s}%,address.ilike.%${s}%`).limit(20);
  return (data ?? []) as Gym[];
}

/** رابط يفتح موقع النادي في الخرائط (للتأكد من مكانه) */
export function mapsUrl(g: Pick<Gym, 'lat' | 'lng' | 'name'>, ios: boolean) {
  const label = encodeURIComponent(g.name);
  return ios ? `http://maps.apple.com/?ll=${g.lat},${g.lng}&q=${label}` : `https://www.google.com/maps/search/?api=1&query=${g.lat},${g.lng}`;
}

export { gymsInRange } from './clubsMath';
