// وجبات اشتراك المطاعم ليوم معيّن في «خطتي»: «من {{المطعم}}» مع «أكلتها» اللي يسجلها في سعرات اليوم
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { AteButton } from '@/components/nutrition/CalorieCard';
import { Card, Row, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { useLocalized } from '@/lib/i18n';
import { mealsOn, mySubscriptions, SLOT_ORDER, type MealSub, type SubMeal } from '@/lib/mealSubs';
import { logFood, type FoodEntry } from '@/lib/nutrition';
import { errorKey } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

export function SubscriptionMeals({ date, today, food, onLogged }: { date: Date; today: boolean; food: FoodEntry[]; onLogged: () => void }) {
  const { t } = useTranslation();
  const { num } = useLocalized();
  const { userId } = useUser();
  const [subs, setSubs] = useState<MealSub[]>([]);
  const [meals, setMeals] = useState<(SubMeal & { brand?: string })[]>([]);
  const key = date.toDateString();
  useFocusEffect(useCallback(() => {
    mySubscriptions().then(setSubs).catch(() => {});
    mealsOn(new Date(key)).then(setMeals).catch(() => {});
  }, [key]));

  const active = subs.filter((s) => s.status === 'active');
  const pending = subs.filter((s) => s.status === 'requested');
  if (!subs.length && !meals.length) return null;
  const loggedNames = new Set(food.filter((f) => f.source === 'store').map((f) => f.name));
  const label = (m: SubMeal & { brand?: string }) => `${m.name}${m.brand ? ` · ${m.brand}` : ''}`;
  const ate = async (m: SubMeal & { brand?: string }) => {
    try {
      await logFood(userId, { slot: m.slot, name: label(m), source: 'store', kcal: m.kcal, protein_g: m.protein_g, carbs_g: m.carbs_g, fat_g: m.fat_g });
      onLogged();
    } catch (e) { Alert.alert(t(errorKey(e))); }
  };
  const sorted = [...meals].sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));

  return (
    <View style={{ gap: space.sm }}>
      <Row gap={8}>
        <Ionicons name="restaurant" size={18} color={brand.orange} />
        <T bold style={{ flex: 1 }}>{active.length === 1 ? t('subs.fromOne', { name: active[0].brands?.name ?? '' }) : t('subs.fromMany')}</T>
      </Row>
      {sorted.length ? sorted.map((m) => (
        <Card key={m.id} style={{ gap: 6, borderColor: brand.orange }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T size="xs" bold color={colors.primary}>{t(`plan.slot_${m.slot}`)}{m.brand ? ` · ${m.brand}` : ''}</T>
            <T size="xs" muted>{num(m.kcal)} {t('common.kcal')} · {num(Math.round(m.protein_g))}{t('common.g')}</T>
          </Row>
          <T bold>{m.name}</T>
          <T size="xs" muted>{t('plan.carbs')} {num(Math.round(m.carbs_g))} · {t('plan.fat')} {num(Math.round(m.fat_g))} {t('common.g')}</T>
          {today ? <AteButton logged={loggedNames.has(label(m))} onPress={() => ate(m)} /> : null}
        </Card>
      )) : active.length ? (
        <T size="sm" muted>{t('subs.noMealsDay')}</T>
      ) : null}
      {pending.map((s) => (
        <Pressable key={s.id} onPress={() => router.push({ pathname: '/store/[id]', params: { id: s.brand_id } })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: radius.md, padding: space.sm, borderWidth: 1, borderColor: colors.border }}>
          <Ionicons name="time-outline" size={16} color={brand.amber} />
          <T size="sm" style={{ flex: 1 }}>{t('subs.pendingWith', { name: s.brands?.name ?? '' })}</T>
        </Pressable>
      ))}
    </View>
  );
}
