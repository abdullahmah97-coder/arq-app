// حماية من انهيار التطبيق بسبب الرسم ثلاثي الأبعاد:
// قبل ما نفتح المشهد نكتب علامة "محاولة جارية". لو اشتغل المشهد نمسحها.
// لو انقفل التطبيق والعلامة موجودة = المشهد هو اللي طيّحه، فنعرض الرسم ثنائي الأبعاد بعدها بدل ما ينهار مرة ثانية.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logEvent } from '@/lib/events';

const PENDING = 'arq:3d_pending';
const OFF = 'arq:3d_off';

export type Mode3D = '3d' | '2d';

/** وش نعرض: 3D أو 2D (لو المحاولة السابقة طيّحت التطبيق أو فشلت) */
export async function initial3DMode(): Promise<Mode3D> {
  try {
    const [[, pending], [, off]] = await AsyncStorage.multiGet([PENDING, OFF]);
    if (pending) {
      await AsyncStorage.multiSet([[OFF, pending]]);
      await AsyncStorage.removeItem(PENDING);
      let info: Record<string, unknown> = {};
      try { info = JSON.parse(pending); } catch { /* تجاهل */ }
      logEvent('3d_crashed_before', info);
      return '2d';
    }
    return off ? '2d' : '3d';
  } catch {
    return '3d';
  }
}

/** نكتبها وننتظرها قبل فتح المشهد عشان تكون محفوظة لو انهار التطبيق فوراً */
export async function mark3DStart(info: Record<string, unknown>): Promise<void> {
  try { await AsyncStorage.setItem(PENDING, JSON.stringify({ ...info, at: Date.now() })); } catch { /* تجاهل */ }
}

/** المشهد اشتغل (أو خرج المستخدم من الصفحة بدون مشاكل) */
export function mark3DDone(): void {
  AsyncStorage.removeItem(PENDING).catch(() => {});
}

/** فشل المشهد بخطأ التقطناه: نعرض 2D في المرات الجاية */
export function mark3DFailed(reason: Record<string, unknown>): void {
  AsyncStorage.multiRemove([PENDING]).catch(() => {});
  AsyncStorage.setItem(OFF, JSON.stringify({ ...reason, at: Date.now() })).catch(() => {});
}

/** زر "جرّب 3D": نمسح الحظر */
export async function reset3D(): Promise<void> {
  try { await AsyncStorage.multiRemove([PENDING, OFF]); } catch { /* تجاهل */ }
}
