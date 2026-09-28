// سياسة النزاهة: كيف نضمن إن التقييمات والأرقام اللي تشوفها في أرك حقيقية
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card, Row, Screen, T } from '@/components/ui';
import { brand, space } from '@/theme';

type Item = { icon: keyof typeof Ionicons.glyphMap; title: string; body: string };

export default function IntegrityPolicy() {
  const { t } = useTranslation();
  const items = t('trust.policy', { returnObjects: true }) as Item[];
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('trust.integrityTitle') }} />
      <T style={{ lineHeight: 26 }}>{t('trust.integrityIntro')}</T>
      {Array.isArray(items) ? items.map((it) => (
        <Card key={it.title} style={{ gap: 6 }}>
          <Row gap={space.sm}>
            <Ionicons name={it.icon} size={20} color={brand.deepGreen} />
            <T semibold style={{ flex: 1 }}>{it.title}</T>
          </Row>
          <T size="sm" style={{ lineHeight: 23 }}>{it.body}</T>
        </Card>
      )) : null}
      <View style={{ paddingVertical: space.sm }}>
        <T size="xs" muted center>{t('trust.integrityContact')}</T>
      </View>
    </Screen>
  );
}
