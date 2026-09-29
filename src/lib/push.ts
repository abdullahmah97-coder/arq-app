// إشعارات الجوال (Expo Push): تسجيل الجهاز، فتح المكان المناسب لما تضغط الإشعار، ورقم أيقونة التطبيق
// الإرسال نفسه من الخادم (قاعدة البيانات ← خدمة Expo) — هنا بس نربط الجهاز بالحساب.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import i18n from './i18n';
import { sendMessage, unreadCount } from './messages';
import { openHref } from './nav';
import { onUnreadBadge, refreshUnreadBadge, unreadNotifications } from './notifications';
import { supabase } from './supabase';

const TOKEN_KEY = 'push.token';
const ASKED_KEY = 'push.askedAt';
const ASK_AGAIN_MS = 3 * 86_400_000;

// المحادثة المفتوحة الحين: رسائلها تظهر في الشاشة نفسها، فما نعرض لها شريط إشعار
let openChat: string | null = null;
export function setOpenChat(other: string | null) { openChat = other; }

// والتطبيق مفتوح: نعرض الإشعار كشريط علوي ونحدّث الرقم.
// نهاية الراحة: المؤقت ظاهر داخل التطبيق، فنكتفي بالصوت بدون شريط
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const data = n.request.content.data as { kind?: unknown; url?: unknown } | undefined;
    const rest = data?.kind === 'rest';
    const sameChat = !!openChat && data?.url === `/chat/${openChat}`;
    const quiet = rest || sameChat;
    return { shouldShowBanner: !quiet, shouldShowList: !quiet, shouldPlaySound: !sameChat, shouldSetBadge: !quiet };
  },
});

// ---------- الرد السريع على الرسائل (من الجوال أو من الساعة) ----------
const REPLIED_KEY = 'push.replied.v1';
const PENDING_KEY = 'push.pendingReplies.v1';
const handledReplies = new Set<string>();

/** نوع إشعار الرسائل: زر «رد» بكتابة نص بدون فتح التطبيق (على الساعة: إملاء أو ردود جاهزة) */
async function registerCategories() {
  if (Platform.OS === 'web') return;
  await Notifications.setNotificationCategoryAsync('message', [{
    identifier: 'reply',
    buttonTitle: i18n.t('watch.reply'),
    textInput: { submitButtonTitle: i18n.t('watch.send'), placeholder: i18n.t('watch.replyPh') },
    options: { opensAppToForeground: false },
  }]).catch(() => {});
}

const chatPeer = (url: unknown) => (typeof url === 'string' ? url.match(/^\/chat\/([0-9a-f-]{36})$/i)?.[1] ?? null : null);

async function sendReply(to: string, text: string) {
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  if (!me) throw new Error('not_authenticated');
  await sendMessage(me, to, text.slice(0, 1000));
}

/** يرسل الرد مرة وحدة. لو ما وصل (بدون نت أو التطبيق انقفل) ينحفظ ويرسل أول ما يفتح التطبيق */
async function handleReply(r: Notifications.NotificationResponse): Promise<boolean> {
  if (r.actionIdentifier !== 'reply') return false;
  const id = r.notification.request.identifier;
  const text = r.userText?.trim();
  const to = chatPeer((r.notification.request.content.data as { url?: unknown } | undefined)?.url);
  if (!text || !to || handledReplies.has(id)) return true;
  handledReplies.add(id);
  const done: string[] = JSON.parse((await AsyncStorage.getItem(REPLIED_KEY).catch(() => null)) ?? '[]');
  if (done.includes(id)) return true;
  await AsyncStorage.setItem(REPLIED_KEY, JSON.stringify([id, ...done].slice(0, 50))).catch(() => {});
  try { await sendReply(to, text); } catch {
    const pending: { to: string; text: string }[] = JSON.parse((await AsyncStorage.getItem(PENDING_KEY).catch(() => null)) ?? '[]');
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify([...pending, { to, text }].slice(-10))).catch(() => {});
  }
  return true;
}

async function flushPendingReplies() {
  const pending: { to: string; text: string }[] = JSON.parse((await AsyncStorage.getItem(PENDING_KEY).catch(() => null)) ?? '[]');
  if (!pending.length) return;
  await AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
  const left: typeof pending = [];
  for (const p of pending) { try { await sendReply(p.to, p.text); } catch { left.push(p); } }
  if (left.length) await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(left)).catch(() => {});
}

// يتسجل أول ما ينحمّل الملف: لو النظام شغّل التطبيق بالخلفية عشان الرد، يوصلنا هنا بدون ما تنفتح الواجهة
if (Platform.OS !== 'web') {
  Notifications.addNotificationResponseReceivedListener((r) => { handleReply(r).catch(() => {}); });
}

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

/**
 * لما تفتح محادثة: نشيل إشعاراتها من شاشة الجوال (مثل واتساب) ونحدّث رقم الأيقونة.
 * إشعار الرسالة رابطه /chat/<المرسل>.
 */
export async function clearChatNotifications(other: string) {
  if (Platform.OS === 'web') return;
  try {
    const shown = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(shown
      .filter((n) => (n.request.content.data as { url?: unknown } | undefined)?.url === `/chat/${other}`)
      .map((n) => Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {})));
  } catch { /* غير مهم */ }
  syncAppBadge();
}

/** يشيل إشعارات الجوال (غير الرسائل) من شاشة القفل ومركز الإشعارات بعد ما قريتها في التطبيق */
export async function clearFeedNotifications() {
  if (Platform.OS === 'web') return;
  try {
    const shown = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(shown
      .filter((n) => !String((n.request.content.data as { url?: unknown } | undefined)?.url ?? '').startsWith('/chat/'))
      .map((n) => Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {})));
  } catch { /* غير مهم */ }
  syncAppBadge();
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
export function usePushSetup(signedIn: boolean, navReady = true) {
  const last = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    // ننتظر لين يجهز التنقّل (فتح التطبيق من إشعار وهو مقفول) عشان ما يضيع الضغط أو يقفل التطبيق
    if (!signedIn || !navReady || !last) return;
    const id = last.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    // زر «رد»: نرسل الرد بدون ما ننقل المستخدم للمحادثة
    if (last.actionIdentifier === 'reply') {
      handleReply(last).catch(() => {});
      Notifications.clearLastNotificationResponseAsync().catch(() => {});
      return;
    }
    const url = (last.notification.request.content.data as { url?: unknown } | undefined)?.url;
    if (typeof url === 'string' && url.startsWith('/')) {
      setTimeout(() => { try { openHref(url); } catch { /* صفحة غير معروفة */ } }, 60);
    }
    Notifications.clearLastNotificationResponseAsync().catch(() => {});
  }, [signedIn, navReady, last]);

  useEffect(() => {
    if (!signedIn) return;
    enablePush(false);
    registerCategories();
    flushPendingReplies().catch(() => {});
    syncAppBadge();
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') { refreshUnreadBadge(); syncAppBadge(); }
    });
    const received = Notifications.addNotificationReceivedListener(() => refreshUnreadBadge());
    const off = onUnreadBadge(() => { syncAppBadge(); });
    return () => { app.remove(); received.remove(); off(); };
  }, [signedIn]);
}
