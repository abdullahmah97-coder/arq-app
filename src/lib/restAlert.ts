// تنبيه نهاية الراحة: إشعار محلي يوصل للجوال وللساعة (لما يكون الجوال مقفل في جيبك) أول ما تخلص الراحة
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

let current: string | null = null;

/** يلغي التنبيه الحالي (تخطي، تمرين انتهى، أو راحة جديدة) ويشيله من مركز الإشعارات */
export async function cancelRestAlert() {
  const id = current;
  current = null;
  if (!id || Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  await Notifications.dismissNotificationAsync(id).catch(() => {});
}

/** يجدول التنبيه بعد seconds. بدون إذن الإشعارات ما يسوي شي (المؤقت داخل التطبيق يكفي) */
export async function scheduleRestAlert(seconds: number, title: string, body: string) {
  await cancelRestAlert();
  if (Platform.OS === 'web' || seconds < 5) return;
  try {
    const p = await Notifications.getPermissionsAsync();
    if (!p.granted && p.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL) return;
    current = await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: 'default', data: { kind: 'rest' }, interruptionLevel: 'active' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.round(seconds), channelId: 'default' },
    });
  } catch { current = null; }
}
