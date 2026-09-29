// بوابة الشركاء: لوحات التحكم لكل فئة عندك، وحالة طلبات الانضمام، وطريق الانضمام كنادي أو متجر أو مطعم أو مدرب أو مركز
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { PartnerHub } from '@/components/partners/PartnerHub';
import { Row, Screen, T } from '@/components/ui';
import { brand, radius, space } from '@/theme';

export default function Partners() {
  const { t } = useTranslation();
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('partners.hubName') }} />
      <View style={{ backgroundColor: brand.deepGreen, borderRadius: radius.lg, padding: space.lg, gap: 6 }}>
        <Row gap={8}>
          <Ionicons name="briefcase" size={18} color={brand.amber} />
          <T size="xs" semibold color={brand.amber}>{t('partners.hubEyebrow')}</T>
        </Row>
        <T size="xl" bold color={brand.cream}>{t('partners.hubTitle')}</T>
        <T size="sm" color={brand.sand} style={{ lineHeight: 22 }}>{t('partners.hubBody')}</T>
      </View>
      <PartnerHub />
    </Screen>
  );
}
