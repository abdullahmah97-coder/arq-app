// بطاقة «سعرات اليوم» في الرئيسية: كم أكلت مقابل هدفك + زر «صوّر وجبتك» بالذكاء الاصطناعي
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { ChevronBar } from '@/components/pulse/Rings';
import { NCard, NT, Num } from '@/components/pulse/widgets';
import { useUser } from '@/lib/auth';
import { LONG_PRESS_MS, useHomeLongPress } from '@/lib/homeLayout';
import { useLocalized } from '@/lib/i18n';
import { loadFoodDay, totals, type FoodEntry } from '@/lib/nutrition';
import { brand, night, pulse } from '@/theme';

export function HomeNutrition() {
  const { t } = useTranslation();
  const { num } = useLocalized();
  const { userId, plan } = useUser();
  const longPress = useHomeLongPress();
  const [food, setFood] = useState<FoodEntry[]>([]);
  useFocusEffect(useCallback(() => { loadFoodDay(userId).then(setFood).catch(() => {}); }, [userId]));

  const sum = totals(food);
  const tg = plan?.data.targets ?? null;
  const goal = tg?.calories ?? null;
  const left = goal != null ? goal - sum.kcal : null;
  const macros = [
    { l: t('plan.protein'), v: sum.protein_g, g: tg?.protein_g, c: brand.cream },
    { l: t('plan.carbs'), v: sum.carbs_g, g: tg?.carbs_g, c: brand.amber },
    { l: t('plan.fat'), v: sum.fat_g, g: tg?.fat_g, c: pulse.sleep },
  ];

  return (
    <NCard onPress={() => router.push('/(tabs)/plan')}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View>
          <NT size={12} muted>{t('food.today')}</NT>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
            <Num size={38}>{num(sum.kcal)}</Num>
            <NT size={12} faint style={{ marginBottom: 6 }}>{goal != null ? `/ ${num(goal)} ${t('common.kcal')}` : t('common.kcal')}</NT>
          </View>
        </View>
        {left != null ? (
          <View style={{ alignItems: 'flex-end' }}>
            <NT size={11} muted>{left >= 0 ? t('food.remaining') : t('food.over')}</NT>
            <Num size={20} color={left >= 0 ? night.text : brand.orange}>{num(Math.abs(left))}</Num>
          </View>
        ) : null}
      </View>
      {goal ? <ChevronBar value={sum.kcal / goal} color={sum.kcal > goal * 1.05 ? brand.orange : brand.amber} /> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {macros.map((m) => (
          <View key={m.l} style={{ flex: 1, gap: 4 }}>
            <NT size={11} muted>{m.l}</NT>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: night.line, overflow: 'hidden' }}>
              <View style={{ width: `${Math.min(1, m.g ? m.v / m.g : 0) * 100}%`, height: '100%', backgroundColor: m.c, borderRadius: 3 }} />
            </View>
            <NT size={11} semibold>{num(Math.round(m.v))}{m.g ? ` / ${num(m.g)}` : ''} {t('common.g')}</NT>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable onPress={() => router.push({ pathname: '/food/photo', params: { auto: 'camera' } })} onLongPress={longPress} delayLongPress={LONG_PRESS_MS}
          accessibilityRole="button" style={({ pressed }) => ({
            flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 999,
            backgroundColor: brand.orange, opacity: pressed ? 0.85 : 1,
          })}>
          <Ionicons name="camera" size={17} color={brand.cream} />
          <NT size={13} bold color={brand.cream}>{t('meal.snap')}</NT>
        </Pressable>
        <Pressable onPress={() => router.push('/food/add')} onLongPress={longPress} delayLongPress={LONG_PRESS_MS}
          accessibilityRole="button" accessibilityLabel={t('food.add')} style={({ pressed }) => ({
            width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
            backgroundColor: night.cardStrong, borderWidth: 1, borderColor: night.line, opacity: pressed ? 0.85 : 1,
          })}>
          <Ionicons name="add" size={20} color={night.text} />
        </Pressable>
      </View>
    </NCard>
  );
}
