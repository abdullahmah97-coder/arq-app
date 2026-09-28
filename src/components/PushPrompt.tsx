// بطاقة لطيفة قبل طلب إذن الإشعارات (بدل ما نفاجئ المستخدم بنافذة النظام)
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { NCard, NT } from '@/components/pulse/widgets';
import { enablePush, shouldOfferPush, snoozePushOffer } from '@/lib/push';
import { brand, night, space } from '@/theme';

export function PushPrompt() {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    // ننتظر شوي بعد فتح التطبيق عشان ما تكون أول شي يشوفه
    const id = setTimeout(() => { shouldOfferPush().then((v) => { if (alive) setShow(v); }).catch(() => {}); }, 1500);
    return () => { alive = false; clearTimeout(id); };
  }, []);

  if (!show) return null;

  const turnOn = async () => {
    setBusy(true);
    await enablePush(true);
    setBusy(false);
    setShow(false);
  };
  const later = () => { snoozePushOffer(); setShow(false); };

  return (
    <NCard strong style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
      <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(254,169,79,0.16)', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="notifications" size={22} color={night.accent} />
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <NT bold size={15}>{t('notif.askTitle')}</NT>
        <NT muted size={13} style={{ lineHeight: 21 }}>{t('notif.askBody')}</NT>
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: 4 }}>
          <Pressable onPress={turnOn} disabled={busy} accessibilityRole="button"
            style={({ pressed }) => ({ backgroundColor: brand.amber, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, opacity: pressed || busy ? 0.7 : 1 })}>
            <NT bold size={13} color={brand.deepGreen}>{t('notif.askYes')}</NT>
          </Pressable>
          <Pressable onPress={later} accessibilityRole="button" style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
            <NT muted size={13}>{t('notif.askLater')}</NT>
          </Pressable>
        </View>
      </View>
    </NCard>
  );
}
