// تفاصيل برنامج (جاهز أو من المجتمع): الأيام والتمارين، اختيار أيام الأسبوع، والاعتماد كخطة
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, I18nManager, Pressable, View, type ViewStyle } from 'react-native';
import { showRir } from '@/components/rir';
import { Button, Card, Row, T } from '@/components/ui';
import { applyProgram, RIR_INFO, type Program } from '@/content/programs';
import { useUser } from '@/lib/auth';
import { useLocalized } from '@/lib/i18n';
import { loadPlanInput, savePlan } from '@/lib/plan';
import { generateRulesPlan } from '@/lib/plan/rules';
import { errorKey } from '@/lib/supabase';
import { getExercise } from '@/three/catalog';
import { brand, colors, space } from '@/theme';
import { openHref } from '@/lib/nav';

export function ProgramBody({ p, onAdopted }: { p: Program; onAdopted?: () => Promise<unknown> | void }) {
  const { t } = useTranslation();
  const { L, lng } = useLocalized();
  const { userId, plan, health, refreshPlan } = useUser();
  const styles = S();
  const weekdays = t('weekdaysShort', { returnObjects: true }) as string[];
  const [schedule, setSchedule] = useState<number[]>(p.schedule);
  const [busy, setBusy] = useState(false);
  const active = plan?.data.program?.id === p.id;
  const hasRir = p.days.some((d) => d.exercises.some((e) => e.rir));

  const toggleDay = (d: number) => setSchedule((cur) => {
    if (cur.includes(d)) return cur.filter((x) => x !== d);
    if (cur.length >= p.daysPerWeek) return cur;
    return [...cur, d].sort((a, b) => a - b);
  });

  const adopt = async () => {
    if (schedule.length !== p.daysPerWeek) return Alert.alert(t('programs.pickDays', { n: p.daysPerWeek, count: p.daysPerWeek }));
    setBusy(true);
    try {
      // ما عندك خطة: السعرات والوجبات من الخطة القياسية (حسب ملفك)، والتمارين من البرنامج
      let base = plan?.data ?? null;
      let source: 'ai' | 'rules' = plan?.source ?? 'rules';
      if (!base) {
        const inp = await loadPlanInput(userId, health);
        if (!inp) { Alert.alert(t('planNew.incomplete')); return; }
        base = generateRulesPlan(inp.input);
        source = 'rules';
      }
      await savePlan(userId, { plan: { ...applyProgram(p, base, schedule), custom: undefined }, source });
      await onAdopted?.();
      await refreshPlan();
      Alert.alert(t('programs.adopted'));
      openHref('/(tabs)/plan');
    } catch (e) {
      Alert.alert(t(errorKey(e)));
    } finally { setBusy(false); }
  };

  return (
    <>
      {hasRir ? (
        <Pressable onPress={() => showRir(lng)}>
          <Row style={styles.rirBox}>
            <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
            <T size="sm" style={{ flex: 1 }}>{L(RIR_INFO.title)}</T>
            <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={16} color={colors.muted} />
          </Row>
        </Pressable>
      ) : null}

      {p.days.map((d, k) => (
        <Card key={k} style={{ gap: space.sm }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T bold color={colors.primary}>{L(d.title)}</T>
            <T size="xs" muted>{weekdays[schedule[k]] ?? '—'}</T>
          </Row>
          {d.exercises.map((e, i) => {
            const g = getExercise(e.exercise_id);
            const target = L(e.target);
            const rest = e.rest[0] === e.rest[1] ? t('social.restMin', { n: +e.rest[0].toFixed(1) }) : t('programs.rest', { a: e.rest[0], b: e.rest[1] });
            return (
              <Pressable key={i} onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: e.exercise_id } })} style={styles.exRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T size="sm" semibold numberOfLines={1}>{g ? L(g.name) : e.original}</T>
                  <T size="xs" muted numberOfLines={1}>{target ? `${target} · ` : ''}{rest}</T>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <T size="sm" bold color={colors.primary}>{`⁦${e.sets} × ${e.reps}⁩`}</T>
                  {e.rir ? <T size="xs" muted>RIR {e.rir}</T> : null}
                </View>
                <Ionicons name="cube-outline" size={16} color={colors.muted} />
              </Pressable>
            );
          })}
        </Card>
      ))}

      <Card style={{ gap: space.sm }}>
        <T bold>{t('programs.schedule')}</T>
        {p.note ? <T size="xs" muted>{L(p.note)}</T> : null}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {weekdays.map((w, d) => {
            const on = schedule.includes(d);
            return (
              <Pressable key={d} onPress={() => toggleDay(d)} style={[styles.day, on && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                <T size="xs" bold fit color={on ? brand.cream : colors.text}>{w}</T>
                {on ? <T size="xs" color={brand.cream}>{schedule.indexOf(d) + 1}</T> : null}
              </Pressable>
            );
          })}
        </View>
        <T size="xs" muted>{t('programs.picked', { n: schedule.length, total: p.daysPerWeek, count: p.daysPerWeek })}</T>
      </Card>

      <Button title={active ? t('programs.reapply') : t('programs.adopt')} icon="checkmark-circle-outline" onPress={adopt} loading={busy} />
      <T size="xs" muted center>{t('programs.keepsMeals')}</T>
    </>
  );
}

// تُحسب وقت الرسم حتى تتبع لون التطبيق المختار
const S = (): Record<'rirBox' | 'exRow' | 'day', ViewStyle> => ({
  rirBox: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: space.md },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  day: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 2 },
});
