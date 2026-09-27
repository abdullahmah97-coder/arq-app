// النوادي القريبة: نحدّثها من الخريطة (دالة gyms-nearby) ثم نقرأها من القاعدة
import type { Position } from './location';
import { supabase } from './supabase';
import type { Gym } from './types';

/** يطلب من الخادم إضافة نوادي المنطقة من الخريطة — لا يوقف التطبيق لو تأخر أو فشل */
export async function refreshNearbyGyms(pos: Pick<Position, 'lat' | 'lng'>, timeoutMs = 9000): Promise<void> {
  try {
    await Promise.race([
      supabase.functions.invoke('gyms-nearby', { body: { lat: pos.lat, lng: pos.lng } }),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
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

export { gymsInRange } from './clubsMath';
