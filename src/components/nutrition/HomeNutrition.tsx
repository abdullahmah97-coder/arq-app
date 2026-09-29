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
import { kcalAlertOn, loadCalorieAlertConfig, loadFoodDay, setKcalAlertOn, totals, type CalorieAlertConfig, type FoodEntry } from '@/lib/nutrition';
import { brand, night, pulse } from '@/theme';

export function HomeNutrition() {
  const { t } = useTranslation();
  const { num } = useLocalized();
  const { userId, plan } = useUser();
  const longPress = useHomeLongPress();
  const [food, setFood] = useState<FoodEntry[]>([]);
  // زر تنبيه «باقي لك ٢٠٠ سعرة» (الرقم والنص من لوحة إدارة التطبيق)
  const [cfg, setCfg] = useState<CalorieAlertConfig | null>(null);
  const [alertOn, setAlertOn] = useState(true);
  useFocusEffect(useCallback(() => {
    loadFoodDay(userId).then(setFood).catch(() => {});
    loadCalorieAlertConfig().then(setCfg).catch(() => {});
    kcalAlertOn().then(setAlertOn);
  }, [userId]));
  const toggleAlert = () => { const v = !alertOn; setAlertOn(v); setKcalAlertOn(v); };

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
      {cfg?.enabled && goal ? (
        <Pressable onPress={toggleAlert} onLongPress={longPress} delayLongPress={LONG_PRESS_MS}
          accessibilityRole="switch" accessibilityState={{ checked: alertOn }} accessibilityLabel={t('food.kcalAlertA11y')}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
            borderWidth: 1, borderColor: alertOn ? brand.amber : night.line, backgroundColor: alertOn ? 'rgba(254,169,79,0.12)' : 'transparent', opacity: pressed ? 0.8 : 1,
          })}>
          <Ionicons name={alertOn ? 'notifications' : 'notifications-off-outline'} size={15} color={alertOn ? brand.amber : night.muted} />
          <NT size={12} semibold color={alertOn ? brand.amber : night.muted}>{alertOn ? t('food.kcalAlertOn', { n: num(cfg.threshold) }) : t('food.kcalAlertOff')}</NT>
        </Pressable>
      ) : null}
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
