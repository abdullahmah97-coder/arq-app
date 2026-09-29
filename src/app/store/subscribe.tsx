// اشترك وشارك جدولي: موافقة صريحة على مشاركة الأهداف الغذائية فقط مع المطعم، واختيار الوجبات والملاحظات
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { BrandLogo } from '@/components/store/parts';
import { Button, Card, Input, Loading, Row, Screen, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { loadBrand, type Brand } from '@/lib/brands';
import { useLocalized } from '@/lib/i18n';
import { requestSubscription, SLOT_ORDER, SLOT_SHARE } from '@/lib/mealSubs';
import type { MealSlot } from '@/lib/nutrition';
import { errorKey } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

export default function Subscribe() {
  const { brand: brandId } = useLocalSearchParams<{ brand: string }>();
  const { t } = useTranslation();
  const { num } = useLocalized();
  const { plan } = useUser();
  const [b, setB] = useState<Brand | null | undefined>(undefined);
  const [slots, setSlots] = useState<MealSlot[]>(['lunch', 'dinner']);
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { loadBrand(String(brandId)).then(setB).catch(() => setB(null)); }, [brandId]);
  if (b === undefined) return <Loading />;
  if (!b) return <Screen><T>{t('store.notFound')}</T></Screen>;

  const tg = plan?.data.targets ?? null;
  const toggle = (s: MealSlot) => setSlots((x) => (x.includes(s) ? (x.length > 1 ? x.filter((y) => y !== s) : x) : SLOT_ORDER.filter((y) => y === s || x.includes(y))));
  const submit = async () => {
    if (!tg) return Alert.alert(t('subs.needPlan'));
    if (!consent) return Alert.alert(t('subs.needConsent'));
    setBusy(true);
    try {
      await requestSubscription(b.id, slots, notes, true);
      Alert.alert(t('subs.sent'), t('subs.sentBody', { name: b.name }));
      router.back();
    } catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('subs.title') }} />
      <Row gap={space.md}>
        <BrandLogo b={b} size={56} />
        <View style={{ flex: 1 }}>
          <T bold size="lg">{b.name}</T>
          <T size="xs" muted>{[t('store.cat_restaurant'), b.city].filter(Boolean).join(' · ')}</T>
        </View>
      </Row>
      <T muted style={{ lineHeight: 24 }}>{t('subs.intro', { name: b.name })}</T>

      {/* وش بيشوف المطعم بالضبط */}
      <Card style={{ gap: space.sm }}>
        <T semibold>{t('subs.sharedTitle', { name: b.name })}</T>
        {tg ? (
          <Row gap={space.sm}>
            {[
              { l: t('common.kcal'), v: tg.calories },
              { l: t('plan.protein'), v: tg.protein_g },
              { l: t('plan.carbs'), v: tg.carbs_g },
              { l: t('plan.fat'), v: tg.fat_g },
            ].map((x) => (
              <View key={x.l} style={{ flex: 1, backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: 8, gap: 2 }}>
                <T size="xs" muted>{x.l}</T>
                <T bold>{num(Math.round(x.v))}</T>
              </View>
            ))}
          </Row>
        ) : <T size="sm" color={colors.danger}>{t('subs.needPlan')}</T>}
        <Row gap={6}><Ionicons name="checkmark" size={15} color={colors.success} /><T size="sm" style={{ flex: 1 }}>{t('subs.shareYes')}</T></Row>
        <Row gap={6} style={{ alignItems: 'flex-start' }}><Ionicons name="close" size={15} color={colors.danger} style={{ marginTop: 3 }} /><T size="sm" style={{ flex: 1 }}>{t('subs.shareNo')}</T></Row>
      </Card>

      <View style={{ gap: 6 }}>
        <T semibold>{t('subs.slots')}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {SLOT_ORDER.map((s) => {
            const on = slots.includes(s);
            return (
              <Pressable key={s} onPress={() => toggle(s)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, backgroundColor: on ? brand.deepGreen : colors.card, borderColor: on ? brand.deepGreen : colors.border }}>
                <T size="sm" color={on ? brand.cream : colors.text}>
                  {t(`plan.slot_${s}`)}{tg ? ` · ~${num(Math.round(tg.calories * SLOT_SHARE[s]))}` : ''}
                </T>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Input label={t('subs.notes')} value={notes} onChangeText={setNotes} maxLength={300} multiline style={{ minHeight: 70, textAlignVertical: 'top' }} placeholder={t('subs.notesPh')} />

      <Pressable onPress={() => setConsent(!consent)} accessibilityRole="checkbox" accessibilityState={{ checked: consent }}>
        <Row style={{ alignItems: 'flex-start', backgroundColor: colors.card, borderRadius: radius.md, padding: space.sm, borderWidth: 1, borderColor: consent ? brand.orange : colors.border }}>
          <Ionicons name={consent ? 'checkbox' : 'square-outline'} size={22} color={consent ? brand.orange : colors.muted} />
          <T size="sm" style={{ flex: 1, lineHeight: 22 }}>{t('subs.consent', { name: b.name })}</T>
        </Row>
      </Pressable>
      <Button title={t('subs.send')} icon="paper-plane-outline" loading={busy} disabled={!consent || !tg} onPress={submit} />
      <T size="xs" muted center>{t('subs.payNote')}</T>
    </Screen>
  );
}
