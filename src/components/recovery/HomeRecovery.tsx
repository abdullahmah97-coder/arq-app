// بطاقة «الاستشفاء» في الرئيسية: نصيحة اليوم حسب الجاهزية + روتين الإطالة + وين يعورك + المراكز
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useRoutine } from '@/components/recovery/parts';
import { NCard, NT, zoneColor } from '@/components/pulse/widgets';
import { useHealth } from '@/lib/health';
import { LONG_PRESS_MS, useHomeLongPress } from '@/lib/homeLayout';
import { brand, night } from '@/theme';

export function HomeRecovery() {
  const { t } = useTranslation();
  const h = useHealth();
  const longPress = useHomeLongPress();
  const r = useRoutine(false);
  const zone = h.status === 'connected' ? h.scores?.zone ?? null : null;
  const zc = zone ? zoneColor(zone) : brand.amber;
  return (
    <NCard onPress={() => router.push('/recovery')}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(254,169,79,0.14)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="leaf" size={19} color={zc} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <NT size={12} muted>{t('recovery.title')}</NT>
          <NT size={15} bold numberOfLines={2}>{t(`recovery.zoneTitle_${zone ?? 'none'}`)}</NT>
        </View>
      </View>
      <NT size={12} muted style={{ lineHeight: 20 }}>{t(`recovery.zoneBody_${zone ?? 'none'}`)}</NT>
      <Pressable onPress={() => router.push('/recovery')} onLongPress={longPress} delayLongPress={LONG_PRESS_MS} accessibilityRole="button"
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 999,
          backgroundColor: brand.amber, opacity: pressed ? 0.85 : 1 })}>
        <Ionicons name="body" size={17} color={brand.deepGreen} />
        <NT size={13} bold color={brand.deepGreen}>{t('recovery.startRoutine', { n: r.items.length })}</NT>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <QuickLink icon="bandage-outline" label={t('recovery.painTitle')} to="/recovery/pain" longPress={longPress} />
        <QuickLink icon="medkit-outline" label={t('recovery.centersShortTitle')} to="/recovery/centers" longPress={longPress} />
      </View>
    </NCard>
  );
}

function QuickLink({ icon, label, to, longPress }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; to: '/recovery/pain' | '/recovery/centers'; longPress?: () => void;
}) {
  return (
    <Pressable onPress={() => router.push(to)} onLongPress={longPress} delayLongPress={LONG_PRESS_MS} accessibilityRole="button"
      style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, borderRadius: 999,
        backgroundColor: night.cardStrong, borderWidth: 1, borderColor: night.line, opacity: pressed ? 0.8 : 1 })}>
      <Ionicons name={icon} size={15} color={night.accent} />
      <NT size={12} semibold>{label}</NT>
    </Pressable>
  );
}
