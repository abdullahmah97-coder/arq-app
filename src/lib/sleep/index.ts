// النوم على الجهاز: حفظ الإعدادات لكل حساب، وجدولة منبّه الصحيان وتذكير وقت النوم.
// الصحيان: منبّه نظام حقيقي (AlarmKit) على iOS 26+، وإلا إشعار بصوت في نفس الوقت.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { alarmAuthorization, alarmSupported, cancelAlarm, requestAlarmAuthorization, scheduleAlarm } from '../../../modules/arq-alarm';
import { bedtimeReminders, DEFAULT_SLEEP, fmtHm, parseHm, sanitizeSleep, type SleepSettings } from './core';

export * from './core';

const key = (userId: string) => `arq.sleep.v1:${userId}`;
const SIG_KEY = (userId: string) => `arq.sleep.applied.v1:${userId}`;
/** معرّف ثابت لمنبّه الصحيان: الجدولة من جديد تستبدله */
export const WAKE_ALARM_ID = 'a2c0a1a4-7a11-4e5a-9d0c-0000000000a1';
const wakeNid = (d: number) => `arq-wake-${d}`;
const bedNid = (d: number) => `arq-bed-${d}`;

export function useSleepSettings(userId: string) {
  const [settings, setSettings] = useState<SleepSettings>(DEFAULT_SLEEP);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(key(userId))
      .then((raw) => { if (alive && raw) setSettings(sanitizeSleep(JSON.parse(raw))); })
      .catch(() => {})
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [userId]);
  const save = useCallback((next: SleepSettings) => {
    const clean = sanitizeSleep(next);
    setSettings(clean);
    AsyncStorage.setItem(key(userId), JSON.stringify(clean)).catch(() => {});
    return clean;
  }, [userId]);
  return { settings, save, ready };
}

export interface SleepTexts {
  wakeTitle: string; wakeBody: string; bedTitle: string; bedBody: string; stop: string; open: string;
}
/** alarmkit = منبّه حقيقي، notification = إشعار بصوت، denied = الإشعارات/المنبّهات مقفلة، off = مطفي */
export type WakeMode = 'alarmkit' | 'notification' | 'denied' | 'off';
export interface ApplyResult { wake: WakeMode; remind: 'on' | 'off' | 'denied'; alarmDenied?: boolean }

async function notificationsAllowed(ask: boolean) {
  if (Platform.OS === 'web') return false;
  try {
    let p = await Notifications.getPermissionsAsync();
    if (!p.granted && ask && p.canAskAgain) p = await Notifications.requestPermissionsAsync();
    return p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  } catch { return false; }
}

async function cancelAll() {
  cancelAlarm(WAKE_ALARM_ID);
  if (Platform.OS === 'web') return;
  await Promise.all([0, 1, 2, 3, 4, 5, 6].flatMap((d) => [
    Notifications.cancelScheduledNotificationAsync(wakeNid(d)).catch(() => {}),
    Notifications.cancelScheduledNotificationAsync(bedNid(d)).catch(() => {}),
  ]));
}

/**
 * يطبّق الإعدادات: يلغي القديم ويجدول الجديد.
 * interactive = المستخدم ضغط «احفظ» (نقدر نطلب الأذونات). من غيرها ما نطلب شي ونكتفي باللي مسموح.
 */
export async function applySleepSchedule(s: SleepSettings, needMin: number, text: SleepTexts, interactive: boolean): Promise<ApplyResult> {
  await cancelAll();
  const wakeMin = parseHm(s.wake) ?? 420;
  const hour = Math.floor(wakeMin / 60);
  const minute = wakeMin % 60;
  const result: ApplyResult = { wake: 'off', remind: 'off' };

  if (s.alarm) {
    let auth = alarmAuthorization();
    if (auth === 'notDetermined' && interactive) auth = await requestAlarmAuthorization();
    if (alarmSupported() && auth === 'authorized') {
      const ok = await scheduleAlarm({
        id: WAKE_ALARM_ID, hour, minute, weekdays: s.days.map((d) => d + 1),
        title: text.wakeTitle, stopLabel: text.stop, openLabel: text.open, tint: '#F1551D',
      });
      if (ok) result.wake = 'alarmkit';
    }
    if (alarmSupported() && auth === 'denied') result.alarmDenied = true;
    if (result.wake === 'off') {
      // بديل المنبّه: إشعار بصوت في وقت الصحيان كل يوم مختار
      if (await notificationsAllowed(interactive)) {
        for (const d of s.days) {
          await Notifications.scheduleNotificationAsync({
            identifier: wakeNid(d),
            content: { title: text.wakeTitle, body: text.wakeBody, sound: 'default', interruptionLevel: 'active', data: { kind: 'wake', url: '/' } },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: d + 1, hour, minute, channelId: 'default' },
          }).catch(() => {});
        }
        result.wake = 'notification';
      } else {
        result.wake = 'denied';
      }
    }
  }

  if (s.remind) {
    if (await notificationsAllowed(interactive)) {
      for (const [d, at] of bedtimeReminders(wakeMin, needMin, s.days, s.remindBefore)) {
        await Notifications.scheduleNotificationAsync({
          identifier: bedNid(d),
          content: { title: text.bedTitle, body: text.bedBody, sound: 'default', interruptionLevel: 'active', data: { kind: 'bedtime', url: '/' } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: d + 1, hour: Math.floor(at / 60), minute: at % 60, channelId: 'default' },
        }).catch(() => {});
      }
      result.remind = 'on';
    } else {
      result.remind = 'denied';
    }
  }
  return result;
}

/** حالة الأذونات (الإشعارات + المنبّه): لو فتحها المستخدم من الإعدادات نعيد الجدولة */
async function permissionState(): Promise<string> {
  let notif = 'n';
  if (Platform.OS !== 'web') {
    try {
      const p = await Notifications.getPermissionsAsync();
      notif = p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ? 'y' : 'n';
    } catch { notif = '?'; }
  }
  return `${notif}:${alarmAuthorization()}`;
}

/** توقيع الجدولة الحالية: نعيد الجدولة بس لما يتغير شي (الإعدادات، احتياج النوم مع الساعة، اللغة، أو الأذونات) */
export const scheduleSignature = (s: SleepSettings, needMin: number, lng: string, perm: string) =>
  s.alarm || s.remind
    ? JSON.stringify([s.wake, s.days, s.alarm, s.remind, s.remindBefore, s.remind ? Math.round(needMin / 5) * 5 : 0, lng, perm])
    : 'off';

async function syncNow(userId: string, s: SleepSettings, needMin: number, text: SleepTexts, lng: string) {
  const sig = scheduleSignature(s, needMin, lng, await permissionState());
  const last = await AsyncStorage.getItem(SIG_KEY(userId)).catch(() => null);
  if (last === sig) return;
  // مطفي: نلغي أي منبّه أو تذكير باقي (مثلاً من حساب ثاني على نفس الجوال)
  if (sig === 'off') await cancelAll();
  else await applySleepSchedule(s, needMin, text, false);
  await AsyncStorage.setItem(SIG_KEY(userId), sig).catch(() => {});
}

let syncing: Promise<void> | null = null;
let queued: (() => Promise<void>) | null = null;

/**
 * يعيد الجدولة بهدوء لو تغيّر شي من آخر مرة (بدون طلب أذونات).
 * الطلبات تمشي وحدة وحدة، ولو جا أكثر من طلب وهي شغّالة ننفّذ الأحدث بس.
 */
export function syncSleepSchedule(userId: string, s: SleepSettings, needMin: number, text: SleepTexts, lng: string): Promise<void> {
  queued = () => syncNow(userId, s, needMin, text, lng);
  if (!syncing) {
    syncing = (async () => {
      while (queued) {
        const job = queued;
        queued = null;
        await job().catch(() => {});
      }
      syncing = null;
    })();
  }
  return syncing;
}

/** بعد «احفظ»: نسجّل اللي انجدول مع حالة الأذونات وقتها (لو رفض ورجع فتحها من الإعدادات، المزامنة تجدول من جديد) */
export async function markApplied(userId: string, s: SleepSettings, needMin: number, lng: string) {
  await AsyncStorage.setItem(SIG_KEY(userId), scheduleSignature(s, needMin, lng, await permissionState())).catch(() => {});
}

/** تسجيل الخروج أو حذف الحساب: نلغي المنبّه والتذكيرات (ولو رجع دخل، المزامنة ترجّعها) */
export async function clearSleepSchedule(userId: string | null | undefined) {
  await cancelAll().catch(() => {});
  if (userId) await AsyncStorage.removeItem(SIG_KEY(userId)).catch(() => {});
}

/** وقت على الساعة للعرض: ١٠:٤٥ م / 10:45 PM */
export function clockLabel(minutes: number, lng: string) {
  const [h, m] = fmtHm(minutes).split(':').map(Number);
  const d = new Date(2026, 0, 1, h, m);
  try {
    return d.toLocaleTimeString(lng === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return fmtHm(minutes);
  }
}
