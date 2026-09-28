// إعدادات التنبيهات: وش يوصلك على الجوال (التنبيهات كلها تبقى في الجرس داخل التطبيق)
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, Switch, View } from 'react-native';
import { Row, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { DEFAULT_PREFS, loadNotifyPrefs, NOTIFY_CATEGORIES, saveNotifyPrefs, type NotifyCategory, type NotifyPrefs } from '@/lib/notifications';
import { brand, colors, space } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;
const ICON: Record<NotifyCategory, IconName> = {
  messages: 'chatbubbles-outline',
  social: 'people-outline',
  activity: 'heart-outline',
  progress: 'trophy-outline',
  offers: 'pricetag-outline',
};

export default function NotificationSettings() {
  const { t } = useTranslation();
  const { userId } = useUser();
  const [prefs, setPrefs] = useState<NotifyPrefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadNotifyPrefs(userId).then((p) => { setPrefs(p); setReady(true); }).catch(() => setReady(true));
  }, [userId]);

  const toggle = async (k: NotifyCategory, v: boolean) => {
    const prev = prefs;
    const next = { ...prefs, [k]: v };
    setPrefs(next);
    try { await saveNotifyPrefs(userId, next); }
    catch { setPrefs(prev); Alert.alert(t('errors.generic')); }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg, gap: space.md }}>
      <T size="sm" muted style={{ lineHeight: 22 }}>{t('notif.prefsIntro')}</T>
      <View style={{ backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
        {NOTIFY_CATEGORIES.map((k, i) => (
          <Row key={k} gap={space.md} style={{
            padding: space.md, alignItems: 'center',
            borderTopWidth: i ? 1 : 0, borderTopColor: colors.border,
          }}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={ICON[k]} size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <T semibold>{t(`notif.cat_${k}`)}</T>
              <T size="xs" muted style={{ lineHeight: 18 }}>{t(`notif.cat_${k}Hint`)}</T>
            </View>
            <Switch
              value={prefs[k]}
              disabled={!ready}
              onValueChange={(v) => toggle(k, v)}
              trackColor={{ true: brand.orange }}
              accessibilityLabel={t(`notif.cat_${k}`)}
            />
          </Row>
        ))}
      </View>
    </ScrollView>
  );
}
