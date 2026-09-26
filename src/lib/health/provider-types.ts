import type { DailyHealth, HealthSource } from './types';

export interface HealthProvider {
  id: HealthSource;
  /** هل المنصة تدعم هذا المصدر (مثلاً Health Connect مثبت) */
  isAvailable(): Promise<boolean>;
  /** يطلب صلاحيات القراءة؛ يُرجع true إن مُنحت (أو لا يمكن معرفتها كما في Apple Health) */
  requestAccess(): Promise<boolean>;
  /** يقرأ آخر n أيام (الأقدم أولاً). age لحساب مناطق النبض. */
  readDays(n: number, age: number): Promise<DailyHealth[]>;
  /** فتح إعدادات المصدر لإدارة الصلاحيات */
  openSettings?(): void;
}
