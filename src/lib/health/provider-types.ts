import type { DailyHealth, HealthSource } from './types';
import type { ExternalWorkout } from './workouts';

/** جلسة أرك لحفظها في Apple Health */
export interface WorkoutExport { id: string; title: string; start: Date; end: Date }
/** أرقام الساعة أثناء جلسة: متوسط وأعلى نبض، والسعرات النشطة */
export interface SessionWatchStats { avg_hr: number | null; max_hr: number | null; kcal: number | null }

export interface HealthProvider {
  id: HealthSource;
  /** نسخة قائمة الأنواع المقروءة — لو تغيّرت نطلب الإذن مرة ثانية للأنواع الجديدة */
  readVersion?: number;
  /** هل المنصة تدعم هذا المصدر (مثلاً Health Connect مثبت) */
  isAvailable(): Promise<boolean>;
  /** يطلب صلاحيات القراءة؛ يُرجع true إن مُنحت (أو لا يمكن معرفتها كما في Apple Health) */
  requestAccess(): Promise<boolean>;
  /** يقرأ آخر n أيام (الأقدم أولاً). age لحساب مناطق النبض. */
  readDays(n: number, age: number): Promise<DailyHealth[]>;
  /** فتح إعدادات المصدر لإدارة الصلاحيات */
  openSettings?(): void;
  /** تمارين آخر n أيام من الساعة والتطبيقات الثانية (بدون تمارين أرك نفسها) */
  readWorkouts?(days: number): Promise<ExternalWorkout[]>;
  /** نبض وسعرات الساعة بين وقتين (جلسة تمرين في أرك) */
  sessionStats?(start: Date, end: Date): Promise<SessionWatchStats | null>;
  /** يحفظ جلسة أرك كتمرين قوة في Apple Health */
  saveWorkout?(w: WorkoutExport, kcal: number | null): Promise<boolean>;
}
