import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, I18nManager, Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { BrandGradient, SaduPattern } from '@/brand/Brand';
import { AteButton, CalorieCard } from '@/components/nutrition/CalorieCard';
import { Button, Card, Empty, H, Row, Screen, SectionTitle, Segmented, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { todayIndex } from '@/lib/dates';
import { adaptWorkout, useHealth } from '@/lib/health';
import { findExercise } from '@/three/catalog';
import { startWorkout } from '@/lib/training';
import { showRir } from '@/components/rir';
import { useLocalized } from '@/lib/i18n';
import { latestAppliedAnalysis } from '@/lib/inbody';
import { deleteFood, estimateCarbsFat, loadFoodDay, logFood, type FoodEntry } from '@/lib/nutrition';
import { generatePlan, savePlan } from '@/lib/plan';
import type { PlanDay, PlanMeal, PlanMealDay, PlanTargets } from '@/lib/plan/types';
import { errorKey, supabase } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

export default function PlanScreen() {
  const { t } = useTranslation();
  const { L } = useLocalized();
  const { userId, plan, health, refreshPlan, refreshProfile } = useUser();
  const zone = useHealth().scores?.zone ?? null;
  const [tab, setTab] = useState<'workouts' | 'meals'>('workouts');
  const [day, setDay] = useState(todayIndex());
  const [busy, setBusy] = useState(false);
  const weekdays = t('weekdaysShort', { returnObjects: true }) as string[];
  const [food, setFood] = useState<FoodEntry[]>([]);

  // سجل أكل اليوم: يتحدث كل ما رجعت للصفحة (بعد إضافة أكل)
  const loadFood = useCallback(() => { loadFoodDay(userId).then(setFood).catch(() => {}); }, [userId]);
  useFocusEffect(loadFood);
  const removeFood = async (e: FoodEntry) => {
    try { await deleteFood(e.id); loadFood(); } catch (err) { Alert.alert(t(errorKey(err))); }
  };
  const ateMeal = async (m: PlanMeal, targets: PlanTargets) => {
    try {
      await logFood(userId, { slot: m.slot, name: L(m.name), source: 'plan', kcal: m.kcal, protein_g: m.protein_g, ...estimateCarbsFat(m.kcal, m.protein_g, targets) });
      loadFood();
    } catch (err) { Alert.alert(t(errorKey(err))); }
  };

  const regenerate = async () => {
    if (!health?.height_cm || !health.birth_year || !health.gender || !health.goal || !health.level || !health.days_per_week) {
      return Alert.alert(t('errors.required'));
    }
    setBusy(true);
    try {
      const ib = await latestAppliedAnalysis(userId);
      const { data: last } = await supabase.from('body_logs').select('weight_kg, photo_path')
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      const lastPhoto = await supabase.from('body_logs').select('photo_path')
        .eq('user_id', userId).not('photo_path', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
      const g = await generatePlan({
        gender: health.gender,
        age: new Date().getFullYear() - health.birth_year,
        height_cm: Number(health.height_cm),
        weight_kg: Number(last?.weight_kg ?? health.weight_kg),
        goal: health.goal,
        level: health.level,
        days_per_week: health.days_per_week,
        inbody: ib?.analysis ?? null,
      }, lastPhoto.data?.photo_path ?? null);
      await savePlan(userId, g, ib?.id ?? null);
      await refreshPlan();
      if (g.source === 'rules') Alert.alert(t('plan.aiFallback'));
    } catch (e) {
      Alert.alert(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const confirmRegenerate = () =>
    Alert.alert(t('plan.regenerate'), t('plan.regenerateConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.ok'), onPress: regenerate },
    ]);

  const completeToday = async () => {
    if (!plan) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('complete_workout', { p_plan: plan.id, p_day: todayIndex() });
    setBusy(false);
    if (error) return Alert.alert(t(errorKey(error)));
    Alert.alert(data > 0 ? t('plan.completed') : t('plan.alreadyCompleted'));
    refreshProfile();
  };

  if (!plan) {
    return (
      <Screen>
        <H>{t('plan.title')}</H>
        <Empty text={t('home.noPlan')} icon="calendar-outline" />
        <Button title={t('home.makePlan')} onPress={regenerate} loading={busy} />
        <CalorieCard entries={food} targets={null} onDelete={removeFood} />
      </Screen>
    );
  }

  const p = plan.data;
  const rawWorkout = p.days.find((d) => d.day === day);
  // تمرين اليوم يتكيّف مع جاهزيتك من الساعة (أحمر = أخف، أصفر = حجم أقل)
  const adapted = rawWorkout && day === todayIndex() ? adaptWorkout(rawWorkout, zone) : null;
  const workout = adapted?.day ?? rawWorkout;
  const meals = p.meals.find((d) => d.day === day);

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <H>{t('plan.title')}</H>
          <Row gap={space.xs}>
            <Ionicons name={plan.source === 'ai' ? 'sparkles' : 'document-text-outline'} size={14} color={colors.primary} />
            <T size="xs" muted>{plan.source === 'ai' ? t('plan.aiPlan') : t('plan.rulesPlan')}</T>
          </Row>
        </View>
        <Button small title={t('plan.regenerate')} icon="refresh" variant="secondary" onPress={confirmRegenerate} loading={busy} />
      </Row>

      <T muted>{L(p.summary)}</T>
      {p.program?.credit ? <T size="xs" muted>{t('programs.source')}: {p.program.credit}</T> : null}
      <Pressable onPress={() => router.push('/programs')}>
        <Row style={{ backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md }}>
          <Ionicons name="albums-outline" size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <T semibold>{t('programs.browse')}</T>
            <T size="xs" muted numberOfLines={1}>{p.program ? L(p.program.name) : t('programs.intro')}</T>
          </View>
          <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.muted} />
        </Row>
      </Pressable>

      {p.based_on_inbody ? (
        <Pressable onPress={() => router.push('/inbody')}>
          <Row gap={6}>
            <Ionicons name="analytics" size={16} color={colors.accent} />
            <T size="sm" semibold color={colors.accent}>{t('inbody.planBased')}</T>
          </Row>
        </Pressable>
      ) : (
        <Pressable onPress={() => router.push('/inbody')} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
          <BrandGradient name="ember" style={{ borderRadius: radius.lg, padding: space.lg, overflow: 'hidden' }}>
            <SaduPattern variant="arrows" opacity={0.12} />
            <Row>
              <Ionicons name="analytics" size={26} color={brand.amber} />
              <View style={{ flex: 1 }}>
                <T semibold color={brand.cream}>{t('inbody.improvePlan')}</T>
                <T size="xs" color={brand.sand}>{t('inbody.improvePlanHint')}</T>
              </View>
              <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={20} color={brand.cream} />
            </Row>
          </BrandGradient>
        </Pressable>
      )}

      <Card style={{ gap: space.md }}>
        <T bold>{t('plan.targets')}</T>
        <Row style={{ justifyContent: 'space-between' }} gap={space.xs}>
          <Macro label={t('plan.calories')} value={`${p.targets.calories}`} unit={t('common.kcal')} color={colors.primary} />
          <Macro label={t('plan.protein')} value={`${p.targets.protein_g}`} unit={t('common.g')} color={colors.text} />
          <Macro label={t('plan.carbs')} value={`${p.targets.carbs_g}`} unit={t('common.g')} color={colors.accent} />
          <Macro label={t('plan.fat')} value={`${p.targets.fat_g}`} unit={t('common.g')} color={colors.muted} />
          <Macro label={t('plan.water')} value={`${p.targets.water_l}`} unit={t('plan.liters')} color={colors.accent} />
        </Row>
      </Card>

      <Segmented value={tab} onChange={setTab}
        options={[{ value: 'workouts', label: t('plan.workouts') }, { value: 'meals', label: t('plan.meals') }]} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {p.days.map((d) => {
          const active = d.day === day;
          const isToday = d.day === todayIndex();
          return (
            <Pressable key={d.day} onPress={() => setDay(d.day)} style={{
              paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.md, minWidth: 58, alignItems: 'center', gap: 2,
              backgroundColor: active ? colors.primary : colors.card, borderWidth: 1, borderColor: isToday ? colors.primary : colors.border,
            }}>
              <T size="sm" bold style={{ color: active ? colors.onPrimary : colors.text }}>{weekdays[d.day]}</T>
              <Ionicons name={d.rest ? 'bed-outline' : 'barbell-outline'} size={14} color={active ? colors.onPrimary : colors.muted} />
            </Pressable>
          );
        })}
      </ScrollView>

      {tab === 'workouts' && adapted?.reason ? (
        <Pressable onPress={() => router.push('/health')}>
          <Row style={{ backgroundColor: brand.deepGreen, borderRadius: radius.lg, padding: space.md }}>
            <Ionicons name="pulse" size={20} color={adapted.day === rawWorkout ? brand.amber : brand.orange} />
            <T size="sm" color={brand.cream} style={{ flex: 1 }}>{t(adapted.reason)}</T>
          </Row>
        </Pressable>
      ) : null}
      {tab === 'workouts' && workout ? (
        <WorkoutDay d={workout} canComplete={day === todayIndex() && !workout.rest} onComplete={completeToday} busy={busy}
          onStart={() => startWorkout(userId, {
            title: L(workout.focus), source: 'plan', plan_id: plan.id, plan_day: day === todayIndex() ? day : null,
            exercises: workout.exercises.flatMap((e) => {
              const g = findExercise(e.exercise_id ?? e.name.en);
              return g ? [{ exercise_id: g.id, sets: e.sets, reps: e.reps, rest_sec: e.rest_sec, rir: e.rir }] : [];
            }),
          }).catch((e) => Alert.alert(t(errorKey(e))))} />
      ) : null}
      {tab === 'meals' && day === todayIndex() ? (
        <CalorieCard entries={food} targets={{ calories: p.targets.calories, protein_g: p.targets.protein_g, carbs_g: p.targets.carbs_g, fat_g: p.targets.fat_g }} onDelete={removeFood} />
      ) : null}
      {tab === 'meals' && meals ? (
        <MealsDay d={meals} today={day === todayIndex()} logged={new Set(food.filter((f) => f.source === 'plan').map((f) => f.name))}
          onAte={(m) => ateMeal(m, p.targets)} />
      ) : null}

      {p.photo_notes ? (
        <Card style={{ gap: space.sm }}>
          <Row><Ionicons name="scan-outline" size={18} color={colors.primary} /><T bold>{t('plan.photoNotes')}</T></Row>
          <T muted>{L(p.photo_notes)}</T>
        </Card>
      ) : null}

      <SectionTitle title={t('plan.tips')} />
      <Card style={{ gap: space.sm }}>
        {p.tips.map((tip, i) => (
          <Row key={i} style={{ alignItems: 'flex-start' }}>
            <Ionicons name="checkmark-circle" size={18} color={colors.primary} style={{ marginTop: 2 }} />
            <T style={{ flex: 1 }}>{L(tip)}</T>
          </Row>
        ))}
      </Card>
      <T size="xs" muted center>{t('plan.disclaimer')}</T>
    </Screen>
  );
}

function Macro({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <T bold size="md" style={{ color }}>{value}</T>
      <T size="xs" muted>{unit}</T>
      <T size="xs" muted>{label}</T>
    </View>
  );
}

function WorkoutDay({ d, canComplete, onComplete, busy, onStart }: { d: PlanDay; canComplete: boolean; onComplete: () => void; busy: boolean; onStart: () => void }) {
  const { t } = useTranslation();
  const { L, lng } = useLocalized();
  return (
    <View style={{ gap: space.md }}>
      <T size="lg" bold style={{ color: colors.primary }}>{L(d.focus)}</T>
      {d.exercises.map((e, i) => {
        const guide = findExercise(e.exercise_id ?? e.name.en);
        return (
        <Card key={i} style={{ gap: space.xs }} onPress={guide ? () => router.push({ pathname: '/exercise/[id]', params: { id: guide.id } }) : undefined}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T bold style={{ flex: 1 }}>{i + 1}. {L(e.name)}</T>
            <T bold style={{ color: colors.primary }}>{t('plan.sets', { sets: e.sets, reps: e.reps })}</T>
          </Row>
          <Row gap={6}>
            <T size="sm" muted>{t('plan.rest', { sec: e.rest_sec })}</T>
            {e.rir ? (
              <Pressable onPress={() => showRir(lng)} hitSlop={6} style={{ backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                <T size="xs" semibold>RIR {e.rir} ⓘ</T>
              </Pressable>
            ) : null}
          </Row>
          {e.notes ? <T size="sm" muted>💡 {L(e.notes)}</T> : null}
          {guide ? (
            <Row gap={6} style={{ alignSelf: 'flex-start', backgroundColor: brand.deepGreen, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginTop: 2 }}>
              <Ionicons name="cube-outline" size={13} color={brand.amber} />
              <T size="xs" semibold color={brand.cream}>{t('exercise.watch3d')}</T>
            </Row>
          ) : null}
        </Card>
        );
      })}
      {d.cardio ? (
        <Card style={{ gap: space.xs }}>
          <Row><Ionicons name="heart-outline" size={18} color={colors.danger} /><T bold>{t('plan.cardio')}</T></Row>
          <T muted>{L(d.cardio)}</T>
        </Card>
      ) : null}
      {!d.rest ? <Button title={t('workout.start')} icon="barbell-outline" onPress={onStart} /> : null}
      {canComplete ? <Button title={t('plan.completeToday')} variant="secondary" onPress={onComplete} loading={busy} small /> : null}
    </View>
  );
}

function MealsDay({ d, today, logged, onAte }: { d: PlanMealDay; today: boolean; logged: Set<string>; onAte: (m: PlanMeal) => void }) {
  const { t } = useTranslation();
  const { L, lng } = useLocalized();
  const unit = (a: string) => (lng === 'ar' ? a.replace(/\s?ml\b/, ' مل').replace(/\s?g\b/, ' جم') : a);
  const total = d.meals.reduce((s, m) => s + m.kcal, 0);
  const protein = d.meals.reduce((s, m) => s + m.protein_g, 0);
  return (
    <View style={{ gap: space.md }}>
      <T muted>{total} {t('common.kcal')} · {protein}{t('common.g')} {t('plan.protein')}</T>
      {d.meals.map((m, i) => (
        <Card key={i} style={{ gap: space.sm }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T size="xs" bold style={{ color: colors.primary }}>{t(`plan.slot_${m.slot}`)}</T>
            <T size="xs" muted>{m.kcal} {t('common.kcal')} · {m.protein_g}{t('common.g')}</T>
          </Row>
          <T bold>{L(m.name)}</T>
          {today ? <AteButton logged={logged.has(L(m.name))} onPress={() => onAte(m)} /> : null}
          {m.portions.map((p, k) => (
            <Row key={k} style={{ justifyContent: 'space-between' }}>
              <T size="sm" muted style={{ flex: 1 }}>• {L(p.name)}</T>
              <T size="sm">{unit(p.amount)}</T>
            </Row>
          ))}
        </Card>
      ))}
    </View>
  );
}
