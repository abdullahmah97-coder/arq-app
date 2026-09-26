// برامج جاهزة: تصفح البرنامج، اختر أيامك، واعتمده كخطتك الأسبوعية (مع الاحتفاظ بوجباتك)
import { Ionicons } from '@expo/vector-icons';
import { ImageBackground } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { showRir } from '@/components/rir';
import { Button, Card, Row, Screen, T } from '@/components/ui';
import { applyProgram, PROGRAMS, RIR_INFO, type Program } from '@/content/programs';
import { useUser } from '@/lib/auth';
import { useLocalized } from '@/lib/i18n';
import { savePlan } from '@/lib/plan';
import { errorKey } from '@/lib/supabase';
import { getExercise } from '@/three/catalog';
import { brand, colors, radius, space } from '@/theme';


export default function Programs() {
  const { t } = useTranslation();
  const { L, lng } = useLocalized();
  const { userId, plan, refreshPlan } = useUser();
  const weekdays = t('weekdaysShort', { returnObjects: true }) as string[];
  const [open, setOpen] = useState<string | null>(PROGRAMS[0]?.id ?? null);
  const [schedule, setSchedule] = useState<Record<string, number[]>>(Object.fromEntries(PROGRAMS.map((p) => [p.id, p.schedule])));
  const [busy, setBusy] = useState(false);

  const toggleDay = (p: Program, d: number) => setSchedule((s) => {
    const cur = s[p.id];
    if (cur.includes(d)) return { ...s, [p.id]: cur.filter((x) => x !== d) };
    if (cur.length >= p.daysPerWeek) return s;
    return { ...s, [p.id]: [...cur, d].sort((a, b) => a - b) };
  });

  const adopt = async (p: Program) => {
    if (!plan) {
      Alert.alert(t('programs.needPlan'));
      return router.push('/(tabs)/plan');
    }
    const sch = schedule[p.id];
    if (sch.length !== p.daysPerWeek) return Alert.alert(t('programs.pickDays', { n: p.daysPerWeek }));
    setBusy(true);
    try {
      await savePlan(userId, { plan: applyProgram(p, plan.data, sch), source: plan.source });
      await refreshPlan();
      Alert.alert(t('programs.adopted'));
      router.replace('/(tabs)/plan');
    } catch (e) {
      Alert.alert(t(errorKey(e)));
    } finally { setBusy(false); }
  };

  return (
    <Screen edges={['bottom']}>
      <T muted style={{ lineHeight: 24 }}>{t('programs.intro')}</T>
      {PROGRAMS.map((p) => {
        const active = plan?.data.program?.id === p.id;
        const expanded = open === p.id;
        return (
          <View key={p.id} style={{ gap: space.md }}>
            <Pressable onPress={() => setOpen(expanded ? null : p.id)}>
              <ImageBackground source={require('../../assets/imagery/run-sand.jpg')} style={styles.hero} imageStyle={{ borderRadius: 20 }} contentFit="cover">
                <LinearGradient colors={['rgba(10,51,45,0.2)', 'rgba(10,51,45,0.95)']} style={[StyleSheet.absoluteFill, { borderRadius: 20 }]} />
                <View style={{ flex: 1, justifyContent: 'flex-end', padding: space.lg, gap: 6 }}>
                  <Row gap={6} style={{ flexWrap: 'wrap' }}>
                    <Tag text={t('programs.days', { n: p.daysPerWeek })} />
                    <Tag text={t(`onboarding.level_${p.level}`)} />
                    {p.audience !== 'all' ? <Tag text={t(`programs.for_${p.audience}`)} /> : null}
                    {active ? <Tag text={t('programs.active')} strong /> : null}
                  </Row>
                  <T size="xl" bold color={brand.cream}>{L(p.name)}</T>
                  <T size="sm" color={brand.sand} style={{ lineHeight: 22 }}>{L(p.summary)}</T>
                  {p.credit ? <T size="xs" color={brand.amber}>{t('programs.source')}: {p.credit}</T> : null}
                </View>
              </ImageBackground>
            </Pressable>

            {expanded ? (
              <>
                <Pressable onPress={() => showRir(lng)}>
                  <Row style={styles.rirBox}>
                    <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
                    <T size="sm" style={{ flex: 1 }}>{L(RIR_INFO.title)}</T>
                    <Ionicons name={lng === 'ar' ? 'chevron-back' : 'chevron-forward'} size={16} color={colors.muted} />
                  </Row>
                </Pressable>

                {p.days.map((d, k) => (
                  <Card key={k} style={{ gap: space.sm }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <T bold color={colors.primary}>{L(d.title)}</T>
                      <T size="xs" muted>{weekdays[schedule[p.id][k]] ?? '—'}</T>
                    </Row>
                    {d.exercises.map((e, i) => {
                      const g = getExercise(e.exercise_id);
                      return (
                        <Pressable key={i} onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: e.exercise_id } })} style={styles.exRow}>
                          <View style={{ flex: 1, gap: 2 }}>
                            <T size="sm" semibold numberOfLines={1}>{g ? L(g.name) : e.original}</T>
                            <T size="xs" muted numberOfLines={1}>{L(e.target)} · {t('programs.rest', { a: e.rest[0], b: e.rest[1] })}</T>
                          </View>
                          <View style={{ alignItems: 'flex-end', gap: 2 }}>
                            <T size="sm" bold color={colors.primary}>{e.sets} × {e.reps}</T>
                            <T size="xs" muted>RIR {e.rir}</T>
                          </View>
                          <Ionicons name="cube-outline" size={16} color={colors.muted} />
                        </Pressable>
                      );
                    })}
                  </Card>
                ))}

                <Card style={{ gap: space.sm }}>
                  <T bold>{t('programs.schedule')}</T>
                  <T size="xs" muted>{p.note ? L(p.note) : ''}</T>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {weekdays.map((w, d) => {
                      const on = schedule[p.id].includes(d);
                      return (
                        <Pressable key={d} onPress={() => toggleDay(p, d)} style={[styles.day, on && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                          <T size="xs" bold color={on ? brand.cream : colors.text}>{w}</T>
                          {on ? <T size="xs" color={brand.cream}>{schedule[p.id].indexOf(d) + 1}</T> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                  <T size="xs" muted>{t('programs.picked', { n: schedule[p.id].length, total: p.daysPerWeek })}</T>
                </Card>

                <Button title={active ? t('programs.reapply') : t('programs.adopt')} icon="checkmark-circle-outline" onPress={() => adopt(p)} loading={busy} />
                <T size="xs" muted center>{t('programs.keepsMeals')}</T>
              </>
            ) : null}
          </View>
        );
      })}
    </Screen>
  );
}

function Tag({ text, strong }: { text: string; strong?: boolean }) {
  return (
    <View style={{ backgroundColor: strong ? brand.orange : 'rgba(248,237,218,0.18)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
      <T size="xs" semibold color={brand.cream}>{text}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { minHeight: 260, borderRadius: 20, overflow: 'hidden' },
  rirBox: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: space.md },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  day: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 2 },
});
