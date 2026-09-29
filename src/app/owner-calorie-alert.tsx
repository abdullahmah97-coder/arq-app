// لوحة إدارة التطبيق ← تنبيه السعرات: الرقم اللي ينبّه عنده (٢٠٠ افتراضياً) ونص التنبيه بالعربي والإنجليزي، مع معاينة
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Switch, View } from 'react-native';
import { Button, Card, Empty, Input, Loading, Row, Screen, T } from '@/components/ui';
import { alertTexts, DEFAULT_KCAL_ALERT, loadCalorieAlertConfig, saveCalorieAlertConfig, type CalorieAlertConfig } from '@/lib/nutrition';
import { isAdmin } from '@/lib/owner';
import { brand, colors, radius, space } from '@/theme';

const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

export default function OwnerCalorieAlert() {
  const { t } = useTranslation();
  const [ok, setOk] = useState<boolean | null>(null);
  const [c, setC] = useState<CalorieAlertConfig | null>(null);
  const [threshold, setThreshold] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isAdmin().then((a) => {
      setOk(a);
      if (a) loadCalorieAlertConfig(true).then((x) => { setC(x); setThreshold(String(x.threshold)); }).catch(() => { setC(DEFAULT_KCAL_ALERT); setThreshold('200'); });
    });
  }, []);

  if (ok === null || (ok && !c)) return <Loading />;
  if (!ok || !c) return <Screen><Empty icon="lock-closed-outline" text={t('owner.noAccess')} /></Screen>;

  const set = (k: keyof CalorieAlertConfig) => (v: string) => setC({ ...c, [k]: v });
  const n = parseInt(toLatin(threshold), 10);
  const sample = { n: Number.isFinite(n) ? n : c.threshold, goal: 2250, eaten: 2250 - (Number.isFinite(n) ? n : c.threshold) };
  const ar = alertTexts(c, 'ar', sample);
  const en = alertTexts(c, 'en', sample);

  const save = async () => {
    if (!Number.isFinite(n) || n < 50 || n > 500) return Alert.alert(t('kcalAlert.err_threshold'));
    if (c.title_ar.trim().length < 2 || c.body_ar.trim().length < 2) return Alert.alert(t('kcalAlert.err_text'));
    setBusy(true);
    try {
      await saveCalorieAlertConfig({ ...c, threshold: n, title_ar: c.title_ar.trim(), body_ar: c.body_ar.trim(), title_en: c.title_en?.trim() || null, body_en: c.body_en?.trim() || null });
      router.back();
    } catch { Alert.alert(t('errors.generic')); } finally { setBusy(false); }
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('kcalAlert.title') }} />
      <View style={{ backgroundColor: brand.deepGreen, borderRadius: radius.lg, padding: space.lg, gap: 6 }}>
        <Row gap={8}>
          <Ionicons name="nutrition" size={18} color={brand.amber} />
          <T size="xs" semibold color={brand.amber}>{t('events.adminEyebrow')}</T>
        </Row>
        <T size="lg" bold color={brand.cream}>{t('kcalAlert.title')}</T>
        <T size="sm" color={brand.sand} style={{ lineHeight: 22 }}>{t('kcalAlert.intro')}</T>
      </View>

      <Card style={{ gap: space.md }}>
        <Row>
          <View style={{ flex: 1 }}><T semibold>{t('kcalAlert.enabled')}</T><T size="xs" muted>{t('kcalAlert.enabledHint')}</T></View>
          <Switch value={c.enabled} onValueChange={(v) => setC({ ...c, enabled: v })} trackColor={{ true: brand.orange }} />
        </Row>
        <Input label={t('kcalAlert.threshold')} hint={t('kcalAlert.thresholdHint')} value={threshold} onChangeText={setThreshold} keyboardType="number-pad" maxLength={3} />
      </Card>

      <Card style={{ gap: space.sm }}>
        <T semibold>{t('kcalAlert.textAr')}</T>
        <Input label={t('kcalAlert.titleLabel')} value={c.title_ar} onChangeText={set('title_ar')} maxLength={80} />
        <Input label={t('kcalAlert.bodyLabel')} value={c.body_ar} onChangeText={set('body_ar')} maxLength={200} multiline />
        <T semibold style={{ marginTop: space.sm }}>{t('kcalAlert.textEn')}</T>
        <Input label={t('kcalAlert.titleLabel')} value={c.title_en ?? ''} onChangeText={set('title_en')} maxLength={80} autoCapitalize="sentences" />
        <Input label={t('kcalAlert.bodyLabel')} value={c.body_en ?? ''} onChangeText={set('body_en')} maxLength={200} multiline />
        <T size="xs" muted style={{ lineHeight: 19 }}>{t('kcalAlert.placeholders')}</T>
      </Card>

      {/* المعاينة: زي ما يطلع على الجوال */}
      <T size="sm" muted>{t('kcalAlert.preview', { goal: sample.goal, eaten: sample.eaten })}</T>
      {[ar, en].map((x, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10, backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: brand.deepGreen, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="nutrition" size={18} color={brand.amber} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T size="sm" bold>{x.title}</T>
            <T size="xs" style={{ lineHeight: 19 }}>{x.body}</T>
          </View>
        </View>
      ))}

      <Button icon="checkmark" title={t('common.save')} loading={busy} onPress={save} />
      <Button variant="ghost" icon="refresh" title={t('kcalAlert.reset')} onPress={() => { setC({ ...DEFAULT_KCAL_ALERT, enabled: c.enabled }); setThreshold(String(DEFAULT_KCAL_ALERT.threshold)); }} />
    </Screen>
  );
}
