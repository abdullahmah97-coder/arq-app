// سجل التمارين التحليلي: مقارنة الفترات، أعمدة الحجم الأسبوعي، المجموعات لكل عضلة، تقدم أهم الرفعات، ثم قائمة الجلسات
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Num } from '@/components/pulse/widgets';
import { Card, Empty, Row, Screen, Segmented, T } from '@/components/ui';
import { useLocalized } from '@/lib/i18n';
import {
  compareSession, exercisesOf, fmtSet, liftProgress, loadHistory, muscleSets, MUSCLE_GROUPS, pctDelta, weeklySeries, weekStart, type SessionData,
} from '@/lib/training';
import { musclesOf } from '@/lib/training/stats';
import { getExercise, MUSCLE_NAMES } from '@/three/catalog';
import { brand, colors, radius, space } from '@/theme';

type Period = 'week' | 'month';
const DAY = 86400000;
const nf = (n: number) => Math.round(n).toLocaleString('en-US');

export default function WorkoutHistory() {
  const { t } = useTranslation();
  const { L, lng } = useLocalized();
  const [list, setList] = useState<SessionData[] | null>(null);
  const [period, setPeriod] = useState<Period>('week');
  useFocusEffect(useCallback(() => { loadHistory(150).then(setList); }, []));

  const done = useMemo(() => (list ?? []).filter((s) => s.sets.length), [list]);
  const now = Date.now();
  const weeks = useMemo(() => weeklySeries(done, 8, now), [done]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = period === 'week' ? 7 : 28;
  const muscles = useMemo(() => muscleSets(done, 28, now), [done]); // eslint-disable-line react-hooks/exhaustive-deps
  const lifts = useMemo(() => liftProgress(done, 6, now), [done]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!list) return <Screen><T muted>…</T></Screen>;
  if (!done.length) return <Screen edges={['bottom']}><Empty text={t('workout.historyEmpty')} icon="barbell-outline" /></Screen>;

  // مقارنة الفترة: هذا الأسبوع مقابل الأسبوع الماضي، أو آخر ٢٨ يوم مقابل الـ٢٨ قبلها
  const start = period === 'week' ? weekStart(now) : now - days * DAY;
  const prevStart = start - days * DAY;
  const inRange = (a: number, b: number) => done.filter((s) => { const x = Date.parse(s.started_at); return x >= a && x < b; });
  const cur = inRange(start, now + DAY), prev = inRange(prevStart, start);
  const agg = (ss: SessionData[]) => {
    const mins = ss.map((s) => (s.finished_at ? (Date.parse(s.finished_at) - Date.parse(s.started_at)) / 60000 : 0)).filter((m) => m > 0);
    return {
      sessions: ss.length,
      volume: ss.reduce((a, s) => a + s.sets.reduce((b, x) => b + x.weight_kg * x.reps, 0), 0),
      sets: ss.reduce((a, s) => a + s.sets.length, 0),
      minutes: mins.length ? mins.reduce((a, m) => a + m, 0) / mins.length : 0,
    };
  };
  const A = agg(cur), B = agg(prev);

  const maxVol = Math.max(1, ...weeks.map((w) => w.volume));
  const avgVol = weeks.slice(0, -1).filter((w) => w.volume).reduce((a, w, _, arr) => a + w.volume / arr.length, 0);
  const maxSets = Math.max(1, ...MUSCLE_GROUPS.map((g) => Math.max(muscles[g].now, muscles[g].prev)));
  const dateFmt = (ms: number) => new Date(ms).toLocaleDateString(lng === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { day: 'numeric', month: 'numeric' });

  // الجلسات مجمّعة بالأسبوع
  const byWeek = new Map<number, SessionData[]>();
  for (const s of done) { const k = weekStart(Date.parse(s.started_at)); byWeek.set(k, [...(byWeek.get(k) ?? []), s]); }

  return (
    <Screen edges={['bottom']}>
      <Segmented<Period> value={period} onChange={setPeriod} options={[{ value: 'week', label: t('workout.thisWeek') }, { value: 'month', label: t('workout.last28') }]} />
      <T size="xs" muted>{period === 'week' ? t('workout.vsLastWeek') : t('workout.vsPrev28')}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        <Tile icon="barbell" label={t('workout.sessions')} value={String(A.sessions)} delta={A.sessions - B.sessions} abs />
        <Tile icon="layers" label={t('workout.volume')} value={nf(A.volume)} unit={t('workout.kg')} delta={pctDelta(A.volume, B.volume)} />
        <Tile icon="list" label={t('workout.sets')} value={String(A.sets)} delta={A.sets - B.sets} abs />
        <Tile icon="time" label={t('workout.avgDuration')} value={A.minutes ? String(Math.round(A.minutes)) : '—'} unit={t('coach.min')} delta={A.minutes && B.minutes ? Math.round(A.minutes - B.minutes) : null} abs />
      </View>

      {/* أعمدة الحجم الأسبوعي */}
      <Card style={{ gap: space.md }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T bold>{t('workout.weeklyVolume')}</T>
          <T size="xs" muted>{t('workout.avgLine', { v: nf(avgVol) })}</T>
        </Row>
        <View style={{ height: 150, flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
          {avgVol > 0 ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 18 + (avgVol / maxVol) * 110, borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.muted }} /> : null}
          {weeks.map((w, i) => {
            const last = i === weeks.length - 1;
            const h = w.volume ? Math.max(4, (w.volume / maxVol) * 110) : 2;
            return (
              <View key={w.start} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                {w.volume ? <T size="xs" muted style={{ fontSize: 9 }}>{w.volume >= 1000 ? `${(w.volume / 1000).toFixed(1)}k` : w.volume}</T> : null}
                <View style={{ width: '100%', height: h, borderRadius: 6, backgroundColor: last ? brand.orange : w.volume ? brand.amber : colors.cardAlt, opacity: last ? 1 : 0.75 }} />
                <T size="xs" muted style={{ fontSize: 9 }}>{last ? t('workout.now') : dateFmt(w.start)}</T>
              </View>
            );
          })}
        </View>
        <Row gap={space.lg}>
          <Legend color={brand.orange} text={t('workout.thisWeek')} />
          <Legend color={brand.amber} text={t('workout.prevWeeks')} />
          <Legend dashed text={t('workout.avg')} />
        </Row>
      </Card>

      {/* المجموعات لكل عضلة: آخر ٤ أسابيع مقابل الـ٤ قبلها */}
      <Card style={{ gap: space.md }}>
        <View style={{ gap: 2 }}>
          <T bold>{t('workout.setsPerMuscle')}</T>
          <T size="xs" muted>{t('workout.setsPerMuscleHint')}</T>
        </View>
        {MUSCLE_GROUPS.map((g) => {
          const m = muscles[g];
          const perWeek = m.now / 4;
          const low = perWeek > 0 && perWeek < 10;
          return (
            <View key={g} style={{ gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row gap={6}>
                  <T size="sm" semibold>{t(`workout.mg_${g}`)}</T>
                  {low ? <View style={{ backgroundColor: 'rgba(241,85,29,0.14)', borderRadius: 999, paddingHorizontal: 8 }}><T size="xs" color={brand.orange}>{t('workout.low')}</T></View> : null}
                  {!m.now ? <T size="xs" muted>{t('workout.notTrained')}</T> : null}
                </Row>
                <Row gap={6}>
                  <T size="xs" muted>{t('workout.perWeek', { n: perWeek.toFixed(perWeek % 1 ? 1 : 0) })}</T>
                  <DeltaTxt v={pctDelta(m.now, m.prev)} />
                </Row>
              </Row>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.cardAlt, overflow: 'hidden' }}>
                <View style={{ width: `${(m.now / maxSets) * 100}%`, height: '100%', backgroundColor: brand.deepGreen, borderRadius: 4 }} />
              </View>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: 'transparent', overflow: 'hidden' }}>
                <View style={{ width: `${(m.prev / maxSets) * 100}%`, height: '100%', backgroundColor: colors.muted, opacity: 0.45, borderRadius: 2 }} />
              </View>
            </View>
          );
        })}
        <Row gap={space.lg}>
          <Legend color={brand.deepGreen} text={t('workout.last4w')} />
          <Legend color={colors.muted} text={t('workout.prev4w')} />
        </Row>
      </Card>

      {/* تقدم أهم الرفعات */}
      {lifts.length ? (
        <Card style={{ gap: space.sm }}>
          <View style={{ gap: 2 }}>
            <T bold>{t('workout.topLifts')}</T>
            <T size="xs" muted>{t('workout.topLiftsHint')}</T>
          </View>
          {lifts.map((x) => {
            const g = getExercise(x.exercise_id);
            const mx = Math.max(...x.series), mn = Math.min(...x.series);
            return (
              <View key={x.exercise_id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Pressable style={{ flex: 1, gap: 2 }} onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: x.exercise_id } })}>
                  <T size="sm" semibold numberOfLines={1}>{g ? L(g.name) : x.exercise_id}</T>
                  <T size="xs" muted>{x.top ? `${t('workout.best')}: ${fmtSet(x.top)}` : ''} · {t('workout.sessionsN', { n: x.sessions })}</T>
                </Pressable>
                <View style={{ width: 70, height: 30, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
                  {x.series.map((v, i) => (
                    <View key={i} style={{ flex: 1, height: 6 + (mx > mn ? ((v - mn) / (mx - mn)) * 24 : 12), borderRadius: 2, backgroundColor: i === x.series.length - 1 ? brand.orange : brand.amber, opacity: i === x.series.length - 1 ? 1 : 0.6 }} />
                  ))}
                </View>
                <View style={{ width: 56, alignItems: 'flex-end' }}><DeltaTxt v={x.delta} big /></View>
              </View>
            );
          })}
        </Card>
      ) : null}

      {/* الجلسات مجمّعة بالأسبوع */}
      <T size="lg" bold>{t('workout.sessionsList')}</T>
      {[...byWeek.entries()].sort((a, b) => b[0] - a[0]).map(([wk, ss]) => {
        const vol = ss.reduce((a, s) => a + s.sets.reduce((b, x) => b + x.weight_kg * x.reps, 0), 0);
        return (
          <View key={wk} style={{ gap: space.sm }}>
            <Row style={{ justifyContent: 'space-between', paddingHorizontal: 4 }}>
              <T size="xs" semibold color={colors.primary}>{wk === weekStart(now) ? t('workout.thisWeek') : t('workout.weekOf', { d: dateFmt(wk) })}</T>
              <T size="xs" muted>{t('workout.weekTotals', { n: ss.length, v: nf(vol) })}</T>
            </Row>
            {ss.map((s) => {
              const c = compareSession(s, list);
              const ms = [...musclesOf(exercisesOf(s))].slice(0, 4).map((m) => L(MUSCLE_NAMES[m])).join('، ');
              return (
                <Card key={s.id} onPress={() => router.push({ pathname: '/workout/[id]', params: { id: s.id } })} style={{ gap: space.xs }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <T bold style={{ flex: 1 }} numberOfLines={1}>{s.title || t('workout.title')}{c.prs ? ' 🏆' : ''}</T>
                    <T size="xs" muted>{new Date(s.started_at).toLocaleDateString(lng === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</T>
                  </Row>
                  <T size="xs" muted>{ms}</T>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Row gap={4}><Num size={18} color={colors.text}>{nf(c.totals.now.volume)}</Num><T size="xs" muted>{t('workout.kg')} · {c.totals.now.sets} {t('workout.sets')}{c.totals.now.minutes ? ` · ${c.totals.now.minutes} ${t('coach.min')}` : ''}</T></Row>
                    {c.volumeDelta != null ? <DeltaTxt v={c.volumeDelta} big /> : <T size="xs" muted>{t('workout.firstOfKind')}</T>}
                  </Row>
                </Card>
              );
            })}
          </View>
        );
      })}
      <T size="xs" muted center>{t('workout.historyHint')}</T>
    </Screen>
  );
}

function Tile({ icon, label, value, unit, delta, abs }: { icon: 'barbell' | 'layers' | 'list' | 'time'; label: string; value: string; unit?: string; delta: number | null; abs?: boolean }) {
  return (
    <View style={{ width: '48.5%', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: 4 }}>
      <Row gap={6}><Ionicons name={icon} size={15} color={colors.primary} /><T size="xs" muted>{label}</T></Row>
      <Row gap={4} style={{ alignItems: 'flex-end' }}>
        <Num size={26} color={colors.text}>{value}</Num>
        {unit ? <T size="xs" muted style={{ marginBottom: 3 }}>{unit}</T> : null}
      </Row>
      <DeltaTxt v={delta} unit={abs ? '' : '%'} />
    </View>
  );
}

function DeltaTxt({ v, unit = '%', big }: { v: number | null; unit?: string; big?: boolean }) {
  if (v == null) return <T size="xs" muted>—</T>;
  const up = v > 0, same = v === 0;
  const c = same ? colors.muted : up ? colors.success : brand.orange;
  return (
    <Row gap={2}>
      {!same ? <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={big ? 13 : 11} color={c} /> : null}
      <T size={big ? 'sm' : 'xs'} bold color={c}>{`⁦${up ? '+' : ''}${v}${unit}⁩`}</T>
    </Row>
  );
}

function Legend({ color, text, dashed }: { color?: string; text: string; dashed?: boolean }) {
  return (
    <Row gap={6}>
      {dashed ? <View style={{ width: 14, borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.muted }} />
        : <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />}
      <T size="xs" muted>{text}</T>
    </Row>
  );
}
