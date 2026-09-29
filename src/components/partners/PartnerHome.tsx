// رئيسية الشريك: لوحة التحكم أول ما يفتح التطبيق، مع زر للتبديل لوضع المتدرب
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Logo } from '@/brand/Brand';
import { NotificationBell } from '@/components/NotificationBell';
import { PartnerHub } from '@/components/partners/PartnerHub';
import { Avatar, Button, Row, Screen, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { publicUrl } from '@/lib/supabase';
import { brand, colors, radius, space, TAB_BAR_SPACE } from '@/theme';

export function PartnerHome({ onTraineeMode }: { onTraineeMode: () => void }) {
  const { t } = useTranslation();
  const { profile } = useUser();
  const firstName = profile.full_name?.split(' ')[0] || profile.username;
  return (
    <Screen edges={['top']}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={10}>
          <Logo variant="mark" height={22} color={brand.orange} />
          <T bold size="lg">{t('home.hello', { name: firstName })}</T>
        </Row>
        <Row gap={14}>
          <NotificationBell color={colors.text} ring={colors.bg} />
          <Pressable onPress={() => router.push('/(tabs)/profile')} accessibilityLabel={t('profile.title')}>
            <Avatar uri={publicUrl('avatars', profile.avatar_url)} name={profile.full_name ?? profile.username} size={36} />
          </Pressable>
        </Row>
      </Row>
      <View style={{ backgroundColor: brand.deepGreen, borderRadius: radius.lg, padding: space.lg, gap: 6 }}>
        <Row gap={8}>
          <Ionicons name="briefcase" size={18} color={brand.amber} />
          <T size="xs" semibold color={brand.amber}>{t('partners.hubEyebrow')}</T>
        </Row>
        <T size="xl" bold color={brand.cream}>{t('partners.hubTitle')}</T>
        <T size="sm" color={brand.sand} style={{ lineHeight: 22 }}>{t('partners.hubBody')}</T>
      </View>
      <PartnerHub />
      <Button variant="secondary" icon="barbell-outline" title={t('partners.traineeMode')} onPress={onTraineeMode} />
      <View style={{ height: TAB_BAR_SPACE }} />
    </Screen>
  );
}
