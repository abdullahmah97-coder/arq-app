import * as Location from 'expo-location';

export interface Position {
  lat: number;
  lng: number;
  accuracy: number;
}

/** يطلب الإذن ويرجع الموقع الحالي، أو null إذا رُفض الإذن */
export async function getCurrentPosition(): Promise<Position | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? 0,
  };
}
