// لوحة المطعم لمشترك: أهدافه اليومية وتوزيعها على الوجبات، وجدولة أطباقه يوم بيوم من المنيو (أو طبق مخصص)
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Button, Card, Empty, Input, Loading, Row, Screen, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { isoDate } from '@/lib/dates';
import { hasMacros, loadMyBrand, type Brand, type Product } from '@/lib/brands';
import { useLocalized } from '@/lib/i18n';
import { addSubMeal, deleteSubMeal, endSubscription, loadSubscribers, mealsOn, SLOT_ORDER, SLOT_SHARE, type SubMeal, type Subscriber } from '@/lib/mealSubs';
import { totals, type MealSlot } from '@/lib/nutrition';
import { errorKey } from '@/lib/supabase';
import { goBackOrHome } from '@/lib/nav';
import { brand, colors, radius, space } from '@/theme';

const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export default function SubscriberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { num, lng } = useLocalized();
  const { userId } = useUser();
  const [b, setB] = useState<Brand | null>(null);
  const [s, setS] = useState<Subscriber | null | undefined>(undefined);
  const [dayIdx, setDayIdx] = useState(0);
  const [meals, setMeals] = useState<SubMeal[]>([]);
  const [adding, setAdding] = useState<MealSlot | null>(null);
  const [custom, setCustom] = useState({ name: '', kcal: '', p: '', c: '', f: '' });
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(new Date(), i)), []);
  const day = days[dayIdx];

  const loadMeals = useCallback(() => { mealsOn(day, String(id)).then(setMeals).catch(() => {}); }, [day, id]);
  useFocusEffect(useCallback(() => {
    loadMyBrand(userId).then((x) => {
      setB(x);
      if (x) loadSubscribers(x.id).then((l) => setS(l.find((y) => y.id === id) ?? null)).catch(() => setS(null));
      else setS(null);
    });
  }, [userId, id]));
  useFocusEffect(loadMeals);

  if (s === undefined) return <Loading />;
  if (!s || !b) return <Screen><Empty text={t('subs.notFound')} /></Screen>;
  const menu = (b.brand_products ?? []).filter((p) => p.active && hasMacros(p));
  const sum = totals(meals);
  const target = s.calories ?? null;

  const add = async (slot: MealSlot, p?: Product) => {
    const n = (v: string) => { const x = parseFloat(v.replace(',', '.')); return Number.isFinite(x) ? x : 0; };
    const m = p
      ? { name: p.name, product_id: p.id, kcal: p.kcal ?? 0, protein_g: +(p.protein_g ?? 0), carbs_g: +(p.carbs_g ?? 0), fat_g: +(p.fat_g ?? 0) }
      : { name: custom.name, product_id: null, kcal: Math.round(n(custom.kcal) || n(custom.p) * 4 + n(custom.c) * 4 + n(custom.f) * 9), protein_g: n(custom.p), carbs_g: n(custom.c), fat_g: n(custom.f) };
    if (m.name.trim().length < 2 || m.kcal <= 0) return Alert.alert(t('food.customNeed'));
    try {
      await addSubMeal({ subscription_id: s.id, day: isoDate(day), slot, ...m });
      setAdding(null); setCustom({ name: '', kcal: '', p: '', c: '', f: '' }); loadMeals();
    } catch (e) { Alert.alert(t(errorKey(e))); }
  };
  const remove = (m: SubMeal) => Alert.alert(m.name, '', [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.delete'), style: 'destructive', onPress: async () => { await deleteSubMeal(m.id).catch(() => {}); loadMeals(); } },
  ]);
  const end = () => Alert.alert(t('subs.endTitle'), t('subs.endKitchen', { name: s.name }), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('subs.end'), style: 'destructive', onPress: async () => { try { await endSubscription(s.id); goBackOrHome(); } catch (e) { Alert.alert(t(errorKey(e))); } } },
  ]);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: s.name }} />
      <Card style={{ gap: space.sm }}>
        <T semibold>{t('subs.targetsTitle')}</T>
        {target != null ? (
          <T size="sm">{t('subs.targetsLine', { kcal: num(target), p: num(s.protein_g ?? 0), c: num(s.carbs_g ?? 0), f: num(s.fat_g ?? 0) })}</T>
        ) : <T size="sm" muted>{t('subs.noPlanYet')}</T>}
        {s.notes ? <Row gap={6} style={{ alignItems: 'flex-start' }}><Ionicons name="alert-circle-outline" size={16} color={brand.orange} style={{ marginTop: 3 }} /><T size="sm" style={{ flex: 1 }}>{s.notes}</T></Row> : null}
        <T size="xs" muted>{t('subs.privacyKitchen')}</T>
      </Card>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {days.map((d, i) => {
          const on = i === dayIdx;
          return (
            <Pressable key={i} onPress={() => setDayIdx(i)} style={{ alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1,
              backgroundColor: on ? brand.deepGreen : colors.card, borderColor: on ? brand.deepGreen : colors.border }}>
              <T size="xs" color={on ? brand.sand : colors.muted}>{d.toLocaleDateString(lng === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { weekday: 'short' })}</T>
              <T bold color={on ? brand.cream : colors.text}>{d.getDate()}</T>
            </Pressable>
          );
        })}
      </ScrollView>

      <Card style={{ gap: 6 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T semibold>{t('subs.dayTotal')}</T>
          <T bold color={target != null && sum.kcal > target * 1.05 ? colors.danger : colors.primary}>{num(sum.kcal)}{target != null ? ` / ${num(target)}` : ''} {t('common.kcal')}</T>
        </Row>
        <T size="xs" muted>{t('plan.protein')} {num(Math.round(sum.protein_g))} · {t('plan.carbs')} {num(Math.round(sum.carbs_g))} · {t('plan.fat')} {num(Math.round(sum.fat_g))} {t('common.g')}</T>
      </Card>

      {SLOT_ORDER.filter((x) => s.slots.includes(x)).map((slot) => {
        const list = meals.filter((m) => m.slot === slot);
        const goal = target != null ? Math.round(target * SLOT_SHARE[slot]) : null;
        return (
          <Card key={slot} style={{ gap: space.sm }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T bold color={colors.primary}>{t(`plan.slot_${slot}`)}</T>
              <T size="xs" muted>{num(totals(list).kcal)}{goal != null ? ` / ~${num(goal)}` : ''} {t('common.kcal')}</T>
            </Row>
            {list.map((m) => (
              <Pressable key={m.id} onLongPress={() => remove(m)} onPress={() => remove(m)}>
                <Row>
                  <T size="sm" style={{ flex: 1 }}>{m.name}</T>
                  <T size="sm" muted>{num(m.kcal)}</T>
                  <Ionicons name="close-circle-outline" size={16} color={colors.muted} />
                </Row>
              </Pressable>
            ))}
            {adding === slot ? (
              <View style={{ gap: space.sm }}>
                {menu.length ? <T size="xs" muted>{t('subs.pickFromMenu')}</T> : null}
                {menu.map((p) => (
                  <Pressable key={p.id} onPress={() => add(slot, p)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: radius.md, backgroundColor: colors.cardAlt }}>
                    <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                    <T size="sm" style={{ flex: 1 }}>{p.name}</T>
                    <T size="xs" muted>{num(p.kcal ?? 0)} · P {num(+(p.protein_g ?? 0))}</T>
                  </Pressable>
                ))}
                <T size="xs" muted>{t('subs.customDish')}</T>
                <Input value={custom.name} onChangeText={(v) => setCustom({ ...custom, name: v })} placeholder={t('food.customName')} maxLength={80} />
                <Row gap={6}>
                  {(['kcal', 'p', 'c', 'f'] as const).map((k) => (
                    <View key={k} style={{ flex: 1 }}>
                      <Input value={custom[k]} onChangeText={(v) => setCustom({ ...custom, [k]: v })} keyboardType="decimal-pad"
                        placeholder={k === 'kcal' ? t('common.kcal') : k === 'p' ? t('plan.protein') : k === 'c' ? t('plan.carbs') : t('plan.fat')} />
                    </View>
                  ))}
                </Row>
                <Row gap={space.sm}>
                  <Button small style={{ flex: 1 }} icon="checkmark" title={t('subs.addDish')} onPress={() => add(slot)} />
                  <Button small variant="ghost" title={t('common.cancel')} onPress={() => setAdding(null)} />
                </Row>
              </View>
            ) : (
              <Button small variant="secondary" icon="add" title={t('subs.addToSlot')} onPress={() => setAdding(slot)} />
            )}
          </Card>
        );
      })}
      <Button variant="ghost" small title={t('subs.end')} onPress={end} />
    </Screen>
  );
}
