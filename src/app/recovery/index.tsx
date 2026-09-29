// الاستشفاء: نصيحة اليوم حسب جاهزيتك، روتين إطالة حسب تمرينك، «وين يعورك؟»، مراكز العلاج الطبيعي، وثقافة الاستشفاء
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { I18nManager, Pressable, Switch, View } from 'react-native';
import { BrandGradient, SaduPattern } from '@/brand/Brand';
import { RoutineList, useRoutine } from '@/components/recovery/parts';
import { Card, Row, Screen, T } from '@/components/ui';
import { RECOVERY_TOPICS } from '@/content/recovery';
import { useHealth } from '@/lib/health';
import { useLocalized } from '@/lib/i18n';
import { MUSCLE_NAMES } from '@/three/catalog';
import { brand, colors, radius, space } from '@/theme';

export default function RecoveryHub() {
  const { t } = useTranslation();
  const { L, lng } = useLocalized();
  const h = useHealth();
  const [roll, setRoll] = useState(false);
  const r = useRoutine(roll);
  const zone = h.status === 'connected' ? h.scores?.zone ?? null : null;
  const chev = I18nManager.isRTL ? 'chevron-back' : 'chevron-forward';

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('recovery.title') }} />

      <BrandGradient name="ember" style={{ borderRadius: 22, padding: space.lg, gap: 6, overflow: 'hidden' }}>
        <SaduPattern variant="peaks" opacity={0.1} />
        <Row gap={8}>
          <Ionicons name="leaf" size={20} color={brand.amber} />
          <T size="xs" semibold color={brand.amber}>{t('recovery.eyebrow')}</T>
        </Row>
        <T size="xl" bold color={brand.cream}>{t(`recovery.zoneTitle_${zone ?? 'none'}`)}</T>
        <T size="sm" color={brand.sand} style={{ lineHeight: 22 }}>{t(`recovery.zoneBody_${zone ?? 'none'}`)}</T>
      </BrandGradient>

      {/* روتين اليوم */}
      <Card style={{ gap: space.sm }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T bold>{t('recovery.routineTitle', { n: r.items.length })}</T>
            <T size="xs" muted>
              {r.source === 'none' ? t('recovery.routineGeneral')
                : t(r.source === 'logged' ? 'recovery.routineLogged' : 'recovery.routinePlan', {
                  muscles: r.muscles.slice(0, 4).map((m) => MUSCLE_NAMES[m][lng]).join(lng === 'ar' ? '، ' : ', '),
                })}
            </T>
          </View>
        </Row>
        <Row style={{ justifyContent: 'space-between', backgroundColor: colors.cardAlt, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 6 }}>
          <T size="sm">{t('recovery.withRoller')}</T>
          <Switch value={roll} onValueChange={setRoll} trackColor={{ true: brand.orange, false: colors.border }} />
        </Row>
        <RoutineList items={r.items} />
        <T size="xs" muted>{t('recovery.routineHint')}</T>
      </Card>

      {/* وين يعورك + المراكز */}
      <Row gap={space.sm} style={{ alignItems: 'stretch' }}>
        <Tile icon="bandage-outline" title={t('recovery.painTitle')} body={t('recovery.painShort')} onPress={() => router.push('/recovery/pain')} />
        <Tile icon="medkit-outline" title={t('recovery.centersTitle')} body={t('recovery.centersShort')} onPress={() => router.push('/recovery/centers')} />
      </Row>

      {/* ثقافة الاستشفاء */}
      <T bold>{t('recovery.learnTitle')}</T>
      {RECOVERY_TOPICS.map((x) => (
        <Pressable key={x.id} onPress={() => router.push({ pathname: '/recovery/learn/[id]', params: { id: x.id } })}
          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
          <Row style={{ backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md }} gap={space.md}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={x.icon as keyof typeof Ionicons.glyphMap} size={19} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T semibold>{L(x.title)}</T>
              <T size="xs" muted numberOfLines={2}>{L(x.summary)}</T>
            </View>
            <Ionicons name={chev} size={16} color={colors.muted} />
          </Row>
        </Pressable>
      ))}
      <T size="xs" muted center>{t('recovery.disclaimer')}</T>
    </Screen>
  );
}

function Tile({ icon, title, body, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({
      flex: 1, gap: 6, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, opacity: pressed ? 0.8 : 1,
    })}>
      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={19} color={brand.cream} />
      </View>
      <T semibold>{title}</T>
      <T size="xs" muted>{body}</T>
    </Pressable>
  );
}
