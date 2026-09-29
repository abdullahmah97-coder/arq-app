// لوحة إدارة التطبيق ← حدود الذكاء الاصطناعي: كم مرة باليوم يقدر كل مستخدم يبحث عن باركود أو يحلل صورة وجبة
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { Button, Card, Empty, Loading, Row, Screen, T } from '@/components/ui';
import { AI_LIMIT_MAX, DEFAULT_AI_LIMITS, loadAiLimits, saveAiLimits, type AiLimits } from '@/lib/aiLimits';
import { useLocalized } from '@/lib/i18n';
import { isAdmin } from '@/lib/owner';
import { brand, colors, radius, space } from '@/theme';

export default function OwnerAiLimits() {
  const { t } = useTranslation();
  const { num } = useLocalized();
  const [ok, setOk] = useState<boolean | null>(null);
  const [v, setV] = useState<AiLimits | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isAdmin().then((a) => {
      setOk(a);
      if (a) loadAiLimits().then(setV).catch(() => setV(DEFAULT_AI_LIMITS));
    });
  }, []);

  if (ok === null || (ok && !v)) return <Loading />;
  if (!ok || !v) return <Screen><Empty icon="lock-closed-outline" text={t('owner.noAccess')} /></Screen>;

  const step = (k: keyof AiLimits, d: number) => setV({ ...v, [k]: Math.max(0, Math.min(AI_LIMIT_MAX[k], v[k] + d)) });

  const save = async () => {
    setBusy(true);
    try { await saveAiLimits(v); router.back(); } catch { Alert.alert(t('errors.generic')); } finally { setBusy(false); }
  };

  const rowFor = (k: keyof AiLimits, icon: keyof typeof Ionicons.glyphMap, big: number) => (
    <Card style={{ gap: space.sm }}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: brand.deepGreen, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={20} color={brand.amber} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T semibold>{t(`aiLimits.${k}`)}</T>
          <T size="xs" muted style={{ lineHeight: 19 }}>{t(`aiLimits.${k}_hint`)}</T>
        </View>
      </Row>
      <Row style={{ justifyContent: 'space-between' }}>
        <T size="sm" muted>{v[k] === 0 ? t('aiLimits.off') : t('aiLimits.perDay', { n: num(v[k]) })}</T>
        <Row gap={space.sm}>
          <StepBtn icon="remove" label={t('aiLimits.less')} onPress={() => step(k, -1)} onLongPress={() => step(k, -big)} />
          <T bold size="lg" style={{ minWidth: 44, textAlign: 'center' }}>{num(v[k])}</T>
          <StepBtn icon="add" label={t('aiLimits.more')} onPress={() => step(k, 1)} onLongPress={() => step(k, big)} />
        </Row>
      </Row>
    </Card>
  );

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('aiLimits.title') }} />
      <View style={{ backgroundColor: brand.deepGreen, borderRadius: radius.lg, padding: space.lg, gap: 6 }}>
        <Row gap={8}>
          <Ionicons name="sparkles" size={18} color={brand.amber} />
          <T size="xs" semibold color={brand.amber}>{t('events.adminEyebrow')}</T>
        </Row>
        <T size="lg" bold color={brand.cream}>{t('aiLimits.title')}</T>
        <T size="sm" color={brand.sand} style={{ lineHeight: 22 }}>{t('aiLimits.intro')}</T>
      </View>
      {rowFor('barcode_per_day', 'barcode-outline', 5)}
      {rowFor('meal_photos_per_day', 'camera-outline', 5)}
      <T size="xs" muted style={{ lineHeight: 19 }}>{t('aiLimits.note')}</T>
      <Button icon="checkmark" title={t('common.save')} loading={busy} onPress={save} />
      <Button variant="ghost" icon="refresh" title={t('aiLimits.reset')} onPress={() => setV(DEFAULT_AI_LIMITS)} />
    </Screen>
  );
}

function StepBtn({ icon, label, onPress, onLongPress }: { icon: 'add' | 'remove'; label: string; onPress: () => void; onLongPress: () => void }) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt, opacity: pressed ? 0.8 : 1 })}>
      <Ionicons name={icon} size={18} color={colors.text} />
    </Pressable>
  );
}
