// «وين يعورك؟»: تختار مكان الألم وتطلع لك العناية الذاتية وعلامات الخطر، ومتى تروح لأخصائي علاج طبيعي
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, View } from 'react-native';
import { Button, Card, Row, Screen, T } from '@/components/ui';
import { PAIN_GUIDE, type PainArea } from '@/content/recovery';
import { useLocalized } from '@/lib/i18n';
import { brand, colors, radius, space } from '@/theme';

export default function PainGuide() {
  const { t } = useTranslation();
  const { L } = useLocalized();
  const [area, setArea] = useState<PainArea | null>(null);
  const g = PAIN_GUIDE.find((x) => x.area === area) ?? null;

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('recovery.painTitle') }} />
      <T muted>{t('recovery.painIntro')}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {PAIN_GUIDE.map((x) => {
          const on = x.area === area;
          return (
            <Pressable key={x.area} onPress={() => setArea(on ? null : x.area)} accessibilityRole="button" accessibilityState={{ selected: on }}
              style={{ width: '48%', flexDirection: 'row', alignItems: 'center', gap: 8, padding: space.md, borderRadius: radius.lg, borderWidth: 1,
                backgroundColor: on ? brand.deepGreen : colors.card, borderColor: on ? brand.deepGreen : colors.border }}>
              <Ionicons name={x.icon as keyof typeof Ionicons.glyphMap} size={18} color={on ? brand.amber : colors.primary} />
              <T size="sm" semibold color={on ? brand.cream : colors.text} style={{ flex: 1 }}>{L(x.name)}</T>
            </Pressable>
          );
        })}
      </View>

      {g ? (
        <>
          <Card style={{ gap: space.sm }}>
            <T bold>{L(g.name)}</T>
            <T muted style={{ lineHeight: 24 }}>{L(g.common)}</T>
          </Card>
          <Card style={{ gap: space.sm }}>
            <Row gap={8}><Ionicons name="leaf-outline" size={18} color={colors.success} /><T bold>{t('recovery.selfCare')}</T></Row>
            {g.selfCare.map((s, i) => <T key={i} style={{ lineHeight: 24 }}>• {L(s)}</T>)}
          </Card>
          <Card style={{ gap: space.sm, borderColor: brand.orange }}>
            <Row gap={8}><Ionicons name="alert-circle-outline" size={18} color={brand.orange} /><T bold>{t('recovery.seePro')}</T></Row>
            {g.redFlags.map((s, i) => <T key={i} style={{ lineHeight: 24 }}>• {L(s)}</T>)}
            <T size="xs" muted>{t('recovery.seeProHint')}</T>
            <Button small icon="medkit-outline" title={t('recovery.findCenter')} onPress={() => router.push('/recovery/centers')} />
          </Card>
          {g.urgent ? (
            <Card style={{ gap: space.sm, borderColor: colors.danger, borderWidth: 1.5 }}>
              <Row gap={8}><Ionicons name="warning" size={18} color={colors.danger} /><T bold color={colors.danger} style={{ flex: 1 }}>{L(g.urgent)}</T></Row>
              <Button small variant="secondary" icon="call-outline" title={t('recovery.call997')} onPress={() => Linking.openURL('tel:997')} />
            </Card>
          ) : null}
        </>
      ) : (
        <Card style={{ gap: space.sm, borderColor: colors.danger }}>
          <Row gap={8}><Ionicons name="warning-outline" size={18} color={colors.danger} /><T semibold style={{ flex: 1 }}>{t('recovery.emergency')}</T></Row>
        </Card>
      )}
      <T size="xs" muted center>{t('recovery.disclaimer')}</T>
    </Screen>
  );
}
