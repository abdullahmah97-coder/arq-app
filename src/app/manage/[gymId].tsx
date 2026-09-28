// إدارة النادي: أرقام اليوم، وكل أدوات الفرع في مكان واحد (للمدير والاستقبال)
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Num } from '@/components/pulse/widgets';
import { Empty, Loading, Screen, T } from '@/components/ui';
import { gymStats, loadStaffGyms, type StaffGym } from '@/lib/gymops';
import { useLocalized } from '@/lib/i18n';
import { brand, colors, radius, space } from '@/theme';

type Tool = { key: string; icon: keyof typeof Ionicons.glyphMap; href: string; managerOnly?: boolean; badge?: number };

export default function ManageGym() {
  const { gymId } = useLocalSearchParams<{ gymId: string }>();
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [me, setMe] = useState<StaffGym | null | undefined>(undefined);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof gymStats>> | null>(null);

  useFocusEffect(useCallback(() => {
    loadStaffGyms().then((gs) => setMe(gs.find((g) => g.gym_id === gymId) ?? null)).catch(() => setMe(null));
    gymStats(String(gymId)).then(setStats).catch(() => {});
  }, [gymId]));

  if (me === undefined) return <Loading />;
  if (!me) return <Screen><Empty icon="lock-closed-outline" text={t('gymops.staffOnly')} /></Screen>;
  const manager = me.role === 'manager';
  const q = `?gym=${gymId}`;
  const tools: Tool[] = [
    { key: 'verify', icon: 'qr-code-outline', href: `/entry/code${q}` },
    { key: 'members', icon: 'people-outline', href: `/manage/members${q}` },
    { key: 'addMember', icon: 'person-add-outline', href: `/manage/membership${q}`, managerOnly: true },
    { key: 'requests', icon: 'swap-horizontal-outline', href: `/manage/requests${q}` },
    { key: 'feedbackIn', icon: 'chatbox-ellipses-outline', href: `/manage/feedback${q}` },
    { key: 'classesAdmin', icon: 'calendar-outline', href: `/manage/classes${q}`, managerOnly: true },
    { key: 'broadcast', icon: 'megaphone-outline', href: `/manage/broadcast${q}`, managerOnly: true },
    { key: 'import', icon: 'cloud-upload-outline', href: `/manage/import${q}`, managerOnly: true },
    { key: 'staff', icon: 'id-card-outline', href: `/manage/staff${q}`, managerOnly: true },
    { key: 'coaches', icon: 'barbell-outline', href: `/manage/coaches${q}`, managerOnly: true },
    { key: 'gates', icon: 'git-network-outline', href: `/manage/gates${q}`, managerOnly: true },
    { key: 'services', icon: 'water-outline', href: `/clubs/services${q}`, managerOnly: true },
    { key: 'offers', icon: 'pricetags-outline', href: `/clubs/offer${q}`, managerOnly: true },
    { key: 'settings', icon: 'settings-outline', href: `/manage/settings${q}`, managerOnly: true },
  ].filter((x) => manager || !x.managerOnly) as Tool[];

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: lng === 'en' && me.name_en ? me.name_en : me.name }} />
      <T size="sm" muted>{t(`gymops.role_${me.role}`)}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        <Stat label={t('gymops.st_active')} value={stats?.active} />
        <Stat label={t('gymops.st_today')} value={stats?.entriesToday} />
        <Stat label={t('gymops.st_expiring')} value={stats?.expiring} warn onPress={() => router.push(`/manage/members${q}&filter=expiring` as any)} />
        <Stat label={t('gymops.st_inactive')} value={stats?.inactive} warn onPress={() => router.push(`/manage/members${q}&filter=inactive` as any)} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {tools.map((x) => (
          <Pressable key={x.key} onPress={() => router.push(x.href as any)} accessibilityRole="button"
            style={({ pressed }) => ({ width: '48.5%', padding: space.md, gap: 6, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 })}>
            <Ionicons name={x.icon} size={22} color={brand.orange} />
            <T semibold>{t(`gymops.tool_${x.key}`)}</T>
            <T size="xs" muted numberOfLines={2}>{t(`gymops.toolHint_${x.key}`)}</T>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

function Stat({ label, value, warn, onPress }: { label: string; value?: number; warn?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ width: '48.5%', padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, gap: 2 }}>
      <Num size={28} color={warn && value ? brand.orange : colors.text}>{value == null ? '—' : String(value)}</Num>
      <T size="xs" muted>{label}</T>
    </Pressable>
  );
}
