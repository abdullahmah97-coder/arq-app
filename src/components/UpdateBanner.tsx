// تحديث فوري نزل بالخلفية: شريط صغير «حدّث الحين» فوق شريط التبويبات،
// بدل ما ينتظر المستخدم يقفل التطبيق ويفتحه مرتين عشان يوصله التحديث
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '@/components/ui';
import { brand } from '@/theme';

export function UpdateBanner() {
  // في وضع التطوير أو بدون التحديثات الفورية ما فيه شي نعرضه (ثابتة طول عمر التطبيق)
  if (!Updates.isEnabled || __DEV__) return null;
  return <PendingUpdate />;
}

function PendingUpdate() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { isUpdatePending } = Updates.useUpdates();
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!isUpdatePending || hidden) return null;

  const restart = () => {
    if (busy) return;
    setBusy(true);
    Updates.reloadAsync().catch(() => setBusy(false));
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 10) + 76 }]}>
      <View style={styles.pill}>
        <Ionicons name="sparkles" size={16} color={brand.amber} />
        <T size="sm" semibold color={brand.cream} style={{ flex: 1 }} numberOfLines={1}>{t('beta.updateReady')}</T>
        <Pressable onPress={restart} disabled={busy} style={[styles.btn, busy && { opacity: 0.6 }]} accessibilityRole="button">
          <T size="xs" bold color="#fff">{t('beta.updateNow')}</T>
        </Pressable>
        <Pressable onPress={() => setHidden(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
          <Ionicons name="close" size={16} color={brand.cream} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 14, right: 14 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: brand.deepGreen, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  btn: { backgroundColor: brand.orange, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
});
