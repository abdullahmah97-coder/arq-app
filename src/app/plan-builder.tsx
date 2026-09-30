// ابنِ جدولك بنفسك: تختار أيام التمرين، ولكل يوم تمارينه من المكتبة والمجموعات والعدّات والراحة.
// يبدأ من خطتك الحالية (تعدّل عليها) أو من الصفر. السعرات والوجبات تبقى من خطتك الحالية (أو القياسية لو ما عندك خطة).
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, Pressable, TextInput, View } from 'react-native';
import { ExercisePicker } from '@/components/ExercisePicker';
import { Button, Card, Row, Screen, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { useLocalized } from '@/lib/i18n';
import { builderDaysFromPlan, cleanReps, createCustomPlan, loadPlanInput, planDaysFromBuilder, PlanError, validReps, type BuilderDay as BDay } from '@/lib/plan';
import type { PlanDay, PlanExercise } from '@/lib/plan/types';
import { errorKey } from '@/lib/supabase';
import type { I18nText } from '@/lib/types';
import { findExercise, getExercise } from '@/three/catalog';
import { brand, colors, fonts, radius, space } from '@/theme';

const RESTS = [45, 60, 90, 120, 180];
const RIRS = ['', '0-1', '1-2', '2-3'];
/** أيام التمرين المقترحة لعدد الأيام (٠ = الأحد) — الجمعة راحة قدر الإمكان */
const DEFAULT_DAYS: Record<number, number[]> = { 1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [6, 0, 1, 2, 3, 4], 7: [0, 1, 2, 3, 4, 5, 6] };

/** يربط التمرين بدليل التمارين (الاسم والرقم الموحّد) */
const resolveExercise = (e: PlanExercise): PlanExercise | null => {
  const g = findExercise(e.exercise_id ?? e.name.en);
  return g ? { ...e, exercise_id: g.id, name: g.name } : null;
};

/** يبدأ من الخطة الحالية (نفس الأيام والتمارين والعناوين) أو من الصفر */
function initialDays(plan: { data: { days: PlanDay[] } } | null, perWeek: number, L: (x: I18nText) => string): BDay[] {
  if (plan) {
    const out = builderDaysFromPlan(plan.data.days, L, resolveExercise);
    if (out.some((d) => d.on)) return out;
  }
  const out: BDay[] = Array.from({ length: 7 }, () => ({ on: false, title: '', exercises: [] }));
  for (const d of DEFAULT_DAYS[perWeek] ?? DEFAULT_DAYS[3]) out[d].on = true;
  return out;
}

export default function PlanBuilder() {
  const { t } = useTranslation();
  const { L } = useLocalized();
  const { userId, plan, health, refreshPlan } = useUser();
  const weekdays = t('weekdays', { returnObjects: true }) as string[];
  const short = t('weekdaysShort', { returnObjects: true }) as string[];
  const [days, setDays] = useState<BDay[]>(() => initialDays(plan, health?.days_per_week ?? 3, L));
  const [pickFor, setPickFor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const setDay = (i: number, f: (d: BDay) => BDay) => setDays((ds) => ds.map((d, k) => (k === i ? f(d) : d)));
  const setEx = (i: number, j: number, patch: Partial<PlanExercise>) =>
    setDay(i, (d) => ({ ...d, exercises: d.exercises.map((e, k) => (k === j ? { ...e, ...patch } : e)) }));
  const move = (i: number, j: number, dir: -1 | 1) => setDay(i, (d) => {
    const k = j + dir;
    if (k < 0 || k >= d.exercises.length) return d;
    const ex = [...d.exercises];
    [ex[j], ex[k]] = [ex[k], ex[j]];
    return { ...d, exercises: ex };
  });
  const training = days.filter((d) => d.on).length;

  const clearAll = () => Alert.alert(t('builder.clearTitle'), t('builder.clearBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('builder.clear'), style: 'destructive', onPress: () => setDays(Array.from({ length: 7 }, (_, d) => ({ on: (DEFAULT_DAYS[health?.days_per_week ?? 3] ?? []).includes(d), title: '', exercises: [] }))) },
  ]);

  const save = async () => {
    if (!training) return Alert.alert(t('builder.errNoDays'));
    const empty = days.findIndex((d) => d.on && !d.exercises.length);
    if (empty >= 0) return Alert.alert(t('builder.errEmptyDay', { day: weekdays[empty] }));
    const badReps = days.some((d) => d.on && d.exercises.some((e) => !validReps(e.reps)));
    if (badReps) return Alert.alert(t('builder.errReps'));
    setBusy(true);
    try {
      // اسم اليوم الافتراضي باللغتين (مو بلغة التطبيق بس)
      const dayTitle = (i: number): I18nText => {
        const [ar, en] = (['ar', 'en'] as const).map((lng) =>
          t('builder.dayN', { lng, day: (t('weekdays', { lng, returnObjects: true }) as string[])[i] }));
        return { ar, en };
      };
      const planDays = planDaysFromBuilder(days, L, dayTitle);
      const base = plan ? null : await loadPlanInput(userId, health);
      if (!plan && !base) throw new PlanError('incomplete');
      await createCustomPlan(userId, planDays, plan?.data ?? null, base?.input ?? null);
      await refreshPlan();
      if (router.canGoBack()) router.dismissTo('/(tabs)/plan'); else router.replace('/(tabs)/plan');
      setTimeout(() => Alert.alert(t('builder.saved')), 350);
    } catch (e) {
      Alert.alert(e instanceof PlanError && e.code === 'incomplete' ? t('planNew.incomplete') : t(errorKey(e)));
    } finally { setBusy(false); }
  };

  return (
    <Screen edges={['bottom']}>
      <T muted style={{ lineHeight: 24 }}>{t(plan ? 'builder.introEdit' : 'builder.intro')}</T>

      {/* أيام التمرين */}
      <Card style={{ gap: space.sm }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T bold>{t('builder.days')}</T>
          <T size="xs" muted>{t('builder.daysCount', { n: training })}</T>
        </Row>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {weekdays.map((w, d) => {
            const on = days[d].on;
            return (
              <Pressable key={d} onPress={() => setDay(d, (x) => ({ ...x, on: !x.on }))} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={w}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : colors.card }}>
                <T size="xs" bold fit color={on ? brand.cream : colors.text}>{short[d]}</T>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {days.map((d, i) => d.on ? (
        <Card key={i} style={{ gap: space.md }}>
          <Row>
            <View style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: brand.deepGreen, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '45deg' }] }}>
              <T size="xs" bold color={brand.amber} style={{ transform: [{ rotate: '-45deg' }] }}>{i + 1}</T>
            </View>
            <View style={{ flex: 1 }}>
              <T size="xs" muted>{weekdays[i]}</T>
              <TextInput value={d.title} onChangeText={(v) => setDay(i, (x) => ({ ...x, title: v.slice(0, 40) }))} maxLength={40}
                placeholder={t('builder.titlePh')} placeholderTextColor={colors.muted}
                style={{ fontFamily: fonts.title, fontSize: 17, color: colors.text, paddingVertical: 2, textAlign: 'auto' }} />
            </View>
            <T size="xs" muted>{t('builder.exCount', { n: d.exercises.length })}</T>
          </Row>

          {d.exercises.map((e, j) => {
            const g = getExercise(e.exercise_id ?? '');
            return (
              <View key={`${e.exercise_id}-${j}`} style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm }}>
                <Row>
                  <T semibold style={{ flex: 1 }} numberOfLines={1}>{j + 1}. {g ? L(g.name) : L(e.name)}</T>
                  <Pressable hitSlop={8} onPress={() => move(i, j, -1)} accessibilityLabel={t('homeLayout.moveUp')} disabled={j === 0}>
                    <Ionicons name="chevron-up" size={18} color={j === 0 ? colors.border : colors.muted} />
                  </Pressable>
                  <Pressable hitSlop={8} onPress={() => move(i, j, 1)} accessibilityLabel={t('homeLayout.moveDown')} disabled={j === d.exercises.length - 1}>
                    <Ionicons name="chevron-down" size={18} color={j === d.exercises.length - 1 ? colors.border : colors.muted} />
                  </Pressable>
                  <Pressable hitSlop={10} onPress={() => setDay(i, (x) => ({ ...x, exercises: x.exercises.filter((_, k) => k !== j) }))} accessibilityLabel={t('common.delete')}>
                    <Ionicons name="trash-outline" size={18} color={colors.muted} />
                  </Pressable>
                </Row>
                <Row gap={space.md}>
                  <Stepper label={t('social.sets')} value={e.sets} onChange={(v) => setEx(i, j, { sets: v })} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <T size="xs" muted>{t('social.reps')}</T>
                    <TextInput value={e.reps} onChangeText={(v) => setEx(i, j, { reps: cleanReps(v) })} keyboardType="numbers-and-punctuation"
                      style={{ height: 38, borderRadius: 10, backgroundColor: colors.cardAlt, color: colors.text, textAlign: 'center', fontFamily: fonts.semibold, fontSize: 16 }} />
                  </View>
                </Row>
                <Row gap={6} style={{ flexWrap: 'wrap' }}>
                  <T size="xs" muted>{t('social.rest')}</T>
                  {RESTS.map((r) => <Chip key={r} on={e.rest_sec === r} text={r >= 120 ? `${r / 60}${t('social.minShort')}` : `${r}${t('social.secShort')}`} onPress={() => setEx(i, j, { rest_sec: r })} />)}
                </Row>
                <Row gap={6} style={{ flexWrap: 'wrap' }}>
                  <T size="xs" muted>RIR</T>
                  {RIRS.map((r) => <Chip key={r || 'none'} on={(e.rir ?? '') === r} text={r || '—'} onPress={() => setEx(i, j, { rir: r || undefined })} />)}
                </Row>
              </View>
            );
          })}

          <Pressable onPress={() => setPickFor(i)} accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12 }}>
            <Ionicons name="add" size={18} color={colors.primary} />
            <T semibold color={colors.primary}>{t('workout.addExercise')}</T>
          </Pressable>
        </Card>
      ) : null)}

      <Button title={t('builder.save')} icon="checkmark-circle-outline" loading={busy} onPress={save} />
      <T size="xs" muted center>{t('programs.keepsMeals')}</T>
      <Button title={t('builder.clear')} icon="trash-outline" variant="ghost" small onPress={clearAll} />

      <Modal visible={pickFor !== null} animationType="slide" transparent onRequestClose={() => setPickFor(null)}>
        <ExercisePicker onClose={() => setPickFor(null)} onPick={(id) => {
          const g = getExercise(id);
          if (pickFor !== null && g) {
            setDay(pickFor, (d) => ({ ...d, exercises: [...d.exercises, { exercise_id: g.id, name: g.name, sets: 3, reps: '8-12', rest_sec: 90, rir: '1-2' }].slice(0, 12) }));
          }
          setPickFor(null);
        }} />
      </Modal>
    </Screen>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const btn = (icon: 'remove' | 'add', v: number) => (
    <Pressable onPress={() => onChange(Math.max(1, Math.min(10, v)))} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${label} ${icon === 'add' ? '+' : '−'}`}
      style={{ width: 34, height: 38, borderRadius: 10, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={16} color={colors.text} />
    </Pressable>
  );
  return (
    <View style={{ gap: 2 }}>
      <T size="xs" muted>{label}</T>
      <Row gap={6}>
        {btn('remove', value - 1)}
        <T bold style={{ minWidth: 20, textAlign: 'center' }}>{value}</T>
        {btn('add', value + 1)}
      </Row>
    </View>
  );
}

function Chip({ text, on, onPress }: { text: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: on ? brand.deepGreen : colors.cardAlt, borderWidth: 1, borderColor: on ? brand.deepGreen : colors.border }}>
      <T size="xs" semibold color={on ? brand.cream : colors.text}>{text}</T>
    </Pressable>
  );
}
