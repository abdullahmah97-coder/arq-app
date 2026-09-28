import * as Location from 'expo-location';

export interface Position {
  lat: number;
  lng: number;
  accuracy: number;
}

export type LocateResult = { pos: Position } | { error: 'denied' | 'off' | 'timeout' };

const toPos = (p: Location.LocationObject): Position => ({
  lat: p.coords.latitude,
  lng: p.coords.longitude,
  accuracy: p.coords.accuracy ?? 0,
});

/**
 * يحدد موقعك بدقة عالية مع مهلة (داخل المباني الـ GPS يتأخر):
 * لو ما وصل خلال المهلة نستخدم آخر موقع معروف حديث، وإلا نرجع السبب (إذن مرفوض / الخدمة مطفية / انتهت المهلة).
 */
export async function locate(timeoutMs = 12000): Promise<LocateResult> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return { error: 'denied' };
  if (!(await Location.hasServicesEnabledAsync().catch(() => true))) return { error: 'off' };
  const fresh = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).then(toPos).catch(() => null);
  const timer = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs));
  const pos = await Promise.race([fresh, timer]);
  if (pos) return { pos };
  const last = await Location.getLastKnownPositionAsync({ maxAge: 3 * 60_000, requiredAccuracy: 300 }).catch(() => null);
  return last ? { pos: toPos(last) } : { error: 'timeout' };
}

/** يطلب الإذن ويرجع الموقع الحالي، أو null إذا ما قدرنا */
export async function getCurrentPosition(): Promise<Position | null> {
  const r = await locate();
  return 'pos' in r ? r.pos : null;
}
