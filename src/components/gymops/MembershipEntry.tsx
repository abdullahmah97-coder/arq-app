// بطاقة «اشتراكي» في الملف الشخصي: أقرب اشتراك وأيامه، وزر بطاقة الدخول
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { T } from '@/components/ui';
import { loadMyMemberships, loadStaffGyms, type MyMembership, type StaffGym, daysLeftText } from '@/lib/gymops';
import { useLocalized } from '@/lib/i18n';
import { brand, colors, radius, space } from '@/theme';

export function MembershipEntry() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [m, setM] = useState<MyMembership | null>(null);
  const [staff, setStaff] = useState<StaffGym[]>([]);
  useFocusEffect(useCallback(() => {
    loadMyMemberships().then((ms) => setM(ms.find((x) => x.state === 'active' || x.state === 'frozen' || x.state === 'upcoming') ?? null)).catch(() => {});
    loadStaffGyms().then(setStaff).catch(() => {});
  }, []));
  const name = m ? (lng === 'en' && m.target_name_en ? m.target_name_en : m.target_name) : null;
  return (
    <View style={{ gap: space.sm }}>
      <Pressable onPress={() => router.push('/membership')} accessibilityRole="button"
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: brand.deepGreen, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="card" size={20} color={brand.amber} />
        </View>
        <View style={{ flex: 1 }}>
          <T semibold>{t('gymops.myMembership')}</T>
          <T size="xs" muted numberOfLines={1}>{m ? `${name} · ${daysLeftText(t, m.days_left)}` : t('gymops.entryHint')}</T>
        </View>
        {m ? (
          <Pressable onPress={() => router.push('/membership/card')} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('gymops.showCard')}
            style={{ backgroundColor: brand.orange, borderRadius: 999, padding: 8 }}>
            <Ionicons name="qr-code" size={18} color={brand.cream} />
          </Pressable>
        ) : <Ionicons name="chevron-forward" size={18} color={colors.muted} style={{ transform: [{ scaleX: lng === 'ar' ? -1 : 1 }] }} />}
      </Pressable>
      {staff.map((g) => (
        <Pressable key={g.gym_id} onPress={() => router.push({ pathname: '/manage/[gymId]', params: { gymId: g.gym_id } })} accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: brand.amber }}>
          <Ionicons name="business" size={20} color={brand.orange} />
          <View style={{ flex: 1 }}>
            <T semibold numberOfLines={1}>{lng === 'en' && g.name_en ? g.name_en : g.name}</T>
            <T size="xs" muted>{t('gymops.manageGym')} · {t(`gymops.role_${g.role}`)}</T>
          </View>
        </Pressable>
      ))}
    </View>
  );
}
