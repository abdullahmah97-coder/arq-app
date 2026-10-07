// حماية من انهيار التطبيق بسبب الرسم ثلاثي الأبعاد:
// قبل ما نفتح المشهد نكتب علامة "محاولة جارية". لو اشتغل المشهد نمسحها.
// لو انقفل التطبيق والعلامة موجودة = المشهد هو اللي طيّحه، فنعرض الرسم ثنائي الأبعاد بعدها بدل ما ينهار مرة ثانية.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logEvent } from '@/lib/events';

// كل مشهد له مفاتيحه (scope): انهيار مكتب أرك ما يطفّي 3D التمارين والعكس. الافتراضي '3d' = مفاتيح التمارين القديمة
const PENDING = (scope: string) => `arq:${scope}_pending`;
const OFF = (scope: string) => `arq:${scope}_off`;

export type Mode3D = '3d' | '2d';

/** وش نعرض: 3D أو 2D (لو المحاولة السابقة طيّحت التطبيق أو فشلت) */
export async function initial3DMode(scope = '3d'): Promise<Mode3D> {
  try {
    const [[, pending], [, off]] = await AsyncStorage.multiGet([PENDING(scope), OFF(scope)]);
    if (pending) {
      await AsyncStorage.multiSet([[OFF(scope), pending]]);
      await AsyncStorage.removeItem(PENDING(scope));
      let info: Record<string, unknown> = {};
      try { info = JSON.parse(pending); } catch { /* تجاهل */ }
      logEvent(`${scope}_crashed_before`, info);
      return '2d';
    }
    return off ? '2d' : '3d';
  } catch {
    return '3d';
  }
}

/** نكتبها وننتظرها قبل فتح المشهد عشان تكون محفوظة لو انهار التطبيق فوراً */
export async function mark3DStart(info: Record<string, unknown>, scope = '3d'): Promise<void> {
  try { await AsyncStorage.setItem(PENDING(scope), JSON.stringify({ ...info, at: Date.now() })); } catch { /* تجاهل */ }
}

/** المشهد اشتغل (أو خرج المستخدم من الصفحة بدون مشاكل) */
export function mark3DDone(scope = '3d'): void {
  AsyncStorage.removeItem(PENDING(scope)).catch(() => {});
}

/** فشل المشهد بخطأ التقطناه: نعرض 2D في المرات الجاية */
export function mark3DFailed(reason: Record<string, unknown>, scope = '3d'): void {
  AsyncStorage.multiRemove([PENDING(scope)]).catch(() => {});
  AsyncStorage.setItem(OFF(scope), JSON.stringify({ ...reason, at: Date.now() })).catch(() => {});
}

/** زر "جرّب 3D": نمسح الحظر */
export async function reset3D(scope = '3d'): Promise<void> {
  try { await AsyncStorage.multiRemove([PENDING(scope), OFF(scope)]); } catch { /* تجاهل */ }
}
