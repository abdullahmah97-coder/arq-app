// موضوع من «ثقافة الاستشفاء»: ملخص ونقاط عملية وتنبيه، مع روابط للخطوة الجاية
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';
import { Button, Card, Empty, Row, Screen, T } from '@/components/ui';
import { recoveryTopic } from '@/content/recovery';
import { useLocalized } from '@/lib/i18n';
import { colors, space } from '@/theme';

export default function RecoveryTopic() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { L } = useLocalized();
  const x = recoveryTopic(String(id));
  if (!x) return <Screen><Empty text={t('errors.notFoundTitle')} /></Screen>;
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: L(x.title) }} />
      <Row gap={space.md}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={x.icon as keyof typeof Ionicons.glyphMap} size={24} color={colors.primary} />
        </View>
        <T bold size="lg" style={{ flex: 1 }}>{L(x.title)}</T>
      </Row>
      <T style={{ lineHeight: 26 }}>{L(x.summary)}</T>
      <Card style={{ gap: space.md }}>
        {x.points.map((p, i) => (
          <Row key={i} gap={space.md} style={{ alignItems: 'flex-start' }}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} style={{ marginTop: 4 }} />
            <T style={{ flex: 1, lineHeight: 25 }}>{L(p)}</T>
          </Row>
        ))}
      </Card>
      {x.caution ? (
        <Card style={{ gap: space.sm, borderColor: colors.danger }}>
          <Row gap={8}><Ionicons name="warning-outline" size={18} color={colors.danger} /><T semibold style={{ flex: 1 }}>{L(x.caution)}</T></Row>
          {x.id === 'doms' ? <Button small variant="secondary" icon="call-outline" title={t('recovery.call997')} onPress={() => Linking.openURL('tel:997')} /> : null}
        </Card>
      ) : null}
      {x.id === 'doms' ? (
        <>
          <Button title={t('recovery.painTitle')} icon="bandage-outline" variant="secondary" onPress={() => router.push('/recovery/pain')} />
          <Button title={t('recovery.centersTitle')} icon="medkit-outline" variant="ghost" onPress={() => router.push('/recovery/centers')} />
        </>
      ) : x.id === 'stretch' || x.id === 'foam' ? (
        <Button title={t('recovery.openRoutine')} icon="body-outline" variant="secondary" onPress={() => router.push('/recovery')} />
      ) : x.id === 'refuel' ? (
        <Button title={t('meal.snap')} icon="camera" variant="secondary" onPress={() => router.push('/food/photo')} />
      ) : null}
      <T size="xs" muted center>{t('recovery.disclaimer')}</T>
    </Screen>
  );
}
