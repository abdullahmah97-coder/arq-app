// منبّه الصحيان الحقيقي (AlarmKit، iOS 26+). على الأجهزة الأقدم وأندرويد والويب الوحدة غير موجودة،
// والدوال ترجع «غير متوفر» عشان التطبيق يستخدم إشعار بصوت بدالها.
import { requireOptionalNativeModule } from 'expo';

export type AlarmAuth = 'authorized' | 'denied' | 'notDetermined' | 'unavailable';

export interface AlarmOptions {
  /** UUID ثابت للمنبّه: الجدولة من جديد تستبدل القديم */
  id: string;
  hour?: number;
  minute?: number;
  /** ١ = الأحد … ٧ = السبت */
  weekdays?: number[];
  /** منبّه مرة وحدة (بالمللي ثانية) بدل التكرار */
  fireAtMs?: number;
  title: string;
  stopLabel: string;
  snoozeLabel: string;
  snoozeMinutes?: number;
  tint?: string;
}

interface Native {
  isAvailable(): boolean;
  authorizationStatus(): string;
  requestAuthorization(): Promise<string>;
  schedule(options: AlarmOptions): Promise<boolean>;
  cancel(id: string): void;
  scheduledIds(): string[];
}

const native = requireOptionalNativeModule<Native>('ArqAlarm');

const asAuth = (s: string | null | undefined): AlarmAuth =>
  s === 'authorized' || s === 'denied' || s === 'notDetermined' ? s : 'unavailable';

/** هل الجهاز يدعم المنبّه الحقيقي */
export function alarmSupported(): boolean {
  try { return !!native?.isAvailable(); } catch { return false; }
}

export function alarmAuthorization(): AlarmAuth {
  try { return native ? asAuth(native.authorizationStatus()) : 'unavailable'; } catch { return 'unavailable'; }
}

export async function requestAlarmAuthorization(): Promise<AlarmAuth> {
  if (!native || !alarmSupported()) return 'unavailable';
  try { return asAuth(await native.requestAuthorization()); } catch { return 'denied'; }
}

/** يجدول المنبّه. false = ما انجدول (الجهاز ما يدعمه أو صار خطأ) */
export async function scheduleAlarm(options: AlarmOptions): Promise<boolean> {
  if (!native || !alarmSupported()) return false;
  try { return await native.schedule(options); } catch { return false; }
}

export function cancelAlarm(id: string) {
  try { native?.cancel(id); } catch { /* ما فيه منبّه */ }
}

export function scheduledAlarmIds(): string[] {
  try { return native?.scheduledIds() ?? []; } catch { return []; }
}
