// حفظ حالة جولة التعريف في الجهاز لكل حساب. تنحفظ «تنتظر» لما يخلص التسجيل، و«انتهت» لما تنقفل الجولة.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseTourState, tourKey } from './tourCore';

export async function markTourPending(uid: string): Promise<void> {
  await AsyncStorage.setItem(tourKey(uid), 'pending').catch(() => {});
}

export async function markTourDone(uid: string): Promise<void> {
  await AsyncStorage.setItem(tourKey(uid), 'done').catch(() => {});
}

/** حساب جديد للحين ما شاف الجولة؟ */
export async function isTourPending(uid: string): Promise<boolean> {
  const raw = await AsyncStorage.getItem(tourKey(uid)).catch(() => null);
  return parseTourState(raw) === 'pending';
}
