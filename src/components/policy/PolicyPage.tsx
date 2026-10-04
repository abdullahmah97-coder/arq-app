// صفحة سياسة (تسجيل الشركاء أو الخصوصية): مقدمة ورقم النسخة، بطاقة لكل بند، وزر «راسلنا»
// النصوص من ملفات اللغة (partnerPolicy / privacyPolicy)، ونفسها اللي في الصفحة العامة اللي نرسلها للشركاء.
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, Card, Row, Screen, T } from '@/components/ui';
import { brand, space } from '@/theme';

type Section = { icon: keyof typeof Ionicons.glyphMap; title: string; body: string };
export type PolicyNs = 'partnerPolicy' | 'privacyPolicy';

export function PolicyPage({ ns, footer }: { ns: PolicyNs; footer?: ReactNode }) {
  const { t } = useTranslation();
  const sections = t(`${ns}.sections`, { returnObjects: true }) as Section[];
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t(`${ns}.title`) }} />
      <T style={{ lineHeight: 26 }}>{t(`${ns}.intro`)}</T>
      <T size="xs" muted>{t(`${ns}.version`)}</T>
      {Array.isArray(sections) ? sections.map((s) => (
        <Card key={s.title} style={{ gap: 6 }}>
          <Row gap={space.sm}>
            <Ionicons name={s.icon} size={20} color={brand.deepGreen} />
            <T semibold style={{ flex: 1 }}>{s.title}</T>
          </Row>
          <T size="sm" style={{ lineHeight: 23 }}>{s.body}</T>
        </Card>
      )) : null}
      {footer}
      <View style={{ gap: space.sm, paddingVertical: space.sm }}>
        <T size="xs" muted center style={{ lineHeight: 19 }}>{t(`${ns}.contact`)}</T>
        <Button small variant="secondary" icon="chatbubble-ellipses-outline" title={t('partnerPolicy.contactBtn')}
          onPress={() => router.push({ pathname: '/feedback', params: { from: `policy:${ns}`, cat: 'other' } })} />
      </View>
    </Screen>
  );
}
