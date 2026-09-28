// إشعارات الجوال (Expo Push): تسجيل الجهاز، فتح المكان المناسب لما تضغط الإشعار، ورقم أيقونة التطبيق
// الإرسال نفسه من الخادم (قاعدة البيانات ← خدمة Expo) — هنا بس نربط الجهاز بالحساب.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { unreadCount } from './messages';
import { onUnreadBadge, refreshUnreadBadge, unreadNotifications } from './notifications';
import { supabase } from './supabase';

const TOKEN_KEY = 'push.token';
const ASKED_KEY = 'push.askedAt';
const ASK_AGAIN_MS = 3 * 86_400_000;

// والتطبيق مفتوح: نعرض الإشعار كشريط علوي ونحدّث الرقم
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
});

export type PushStatus = 'on' | 'off' | 'ask' | 'unsupported';

const projectId = (): string | undefined =>
  (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId;

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'ARQ',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 120, 200],
    lightColor: '#F1551D',
  });
}

/** حالة الإذن: مفعّل / مرفوض (من الإعدادات) / ما انسأل بعد / غير مدعوم */
export async function pushStatus(): Promise<PushStatus> {
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'on';
    return p.canAskAgain ? 'ask' : 'off';
  } catch {
    return 'unsupported';
  }
}

/** يربط الجهاز بالحساب لو الإذن موجود. ask=true يطلب الإذن من النظام (بعد ما المستخدم يضغط «فعّل») */
export async function enablePush(ask = false): Promise<PushStatus> {
  let st = await pushStatus();
  if (st === 'unsupported') return st;
  try {
    await ensureChannel();
    if (st === 'ask' && ask) {
      await AsyncStorage.setItem(ASKED_KEY, String(Date.now()));
      const r = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
      st = r.granted || r.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ? 'on' : r.canAskAgain ? 'ask' : 'off';
    }
  } catch {
    return 'unsupported';
  }
  if (st !== 'on') return st;
  try {
    const pid = projectId();
    if (!pid) return st;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: pid })).data;
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS === 'ios' ? 'ios' : 'android' });
    if (!error) await AsyncStorage.setItem(TOKEN_KEY, token);
  } catch {
    // بدون إنترنت أو محاكي: نعيد المحاولة في التشغيل الجاي
  }
  return st;
}

/** قبل تسجيل الخروج: نفصل الجهاز عن الحساب عشان ما توصله إشعاراته */
export async function unregisterPush() {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) await supabase.rpc('unregister_push_token', { p_token: token });
    await AsyncStorage.removeItem(TOKEN_KEY);
    await Notifications.setBadgeCountAsync(0);
  } catch { /* نكمل الخروج حتى لو ما وصلنا الخادم */ }
}

/** نعرض بطاقة «تبي توصلك التنبيهات؟» لو ما انسأل، أو قال «لاحقاً» قبل ٣ أيام */
export async function shouldOfferPush(): Promise<boolean> {
  if ((await pushStatus()) !== 'ask') return false;
  const at = Number(await AsyncStorage.getItem(ASKED_KEY).catch(() => null)) || 0;
  return Date.now() - at > ASK_AGAIN_MS;
}
export async function snoozePushOffer() {
  await AsyncStorage.setItem(ASKED_KEY, String(Date.now())).catch(() => {});
}

/** رقم أيقونة التطبيق = التنبيهات غير المقروءة + الرسائل غير المقروءة */
async function syncAppBadge() {
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return;
    const [a, b] = await Promise.all([unreadNotifications(), unreadCount(uid)]);
    await Notifications.setBadgeCountAsync(a + b);
  } catch { /* غير مهم */ }
}

/** يشتغل مرة وحدة بعد تسجيل الدخول: يحدّث تسجيل الجهاز، يفتح الصفحة لما تضغط إشعار، ويزامن الأرقام */
export function usePushSetup(signedIn: boolean) {
  const last = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!signedIn || !last) return;
    const id = last.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const url = (last.notification.request.content.data as { url?: unknown } | undefined)?.url;
    if (typeof url === 'string' && url.startsWith('/')) {
      setTimeout(() => { try { router.push(url as any); } catch { /* صفحة غير معروفة */ } }, 60);
    }
    Notifications.clearLastNotificationResponseAsync().catch(() => {});
  }, [signedIn, last]);

  useEffect(() => {
    if (!signedIn) return;
    enablePush(false);
    syncAppBadge();
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') { refreshUnreadBadge(); syncAppBadge(); }
    });
    const received = Notifications.addNotificationReceivedListener(() => refreshUnreadBadge());
    const off = onUnreadBadge(() => { syncAppBadge(); });
    return () => { app.remove(); received.remove(); off(); };
  }, [signedIn]);
}
