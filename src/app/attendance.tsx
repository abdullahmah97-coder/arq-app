// نسبة حضوري: هدف أيام بالأسبوع، كم رحت هالشهر مقابل المخطط، تقويم الشهر، ومقارنة بالشهر اللي قبل — خاصة فيك
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Num } from '@/components/pulse/widgets';
import { Card, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { loadAttendance, setAttendanceGoal, type Attendance } from '@/lib/trust';
import { brand, colors, radius, space } from '@/theme';

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

export default function AttendanceScreen() {
  const { t } = useTranslation();
  const { userId } = useUser();
  const [a, setA] = useState<Attendance | null | undefined>(undefined);

  const load = useCallback(() => { loadAttendance().then(setA).catch(() => setA(null)); }, []);
  useFocusEffect(load);

  if (a === undefined) return <Loading />;
  const title = <Stack.Screen options={{ title: t('trust.attendanceTitle') }} />;
  if (!a) return <Screen edges={['bottom']}>{title}<T muted center>{t('errors.generic')}</T></Screen>;

  const rate = pct(a.visits, a.planned_to_date);
  const last = pct(a.last_month_visits, a.last_month_planned);
  const color = rate >= 90 ? brand.green : rate >= 60 ? brand.amber : brand.orange;
  const visited = new Set(a.visit_days.map((d) => Number(d.slice(8, 10))));
  const firstDow = new Date(`${a.month_start}T12:00:00`).getDay();
  const days = t('weekdaysShort', { returnObjects: true }) as string[];
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: a.days_in_month }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const changeGoal = async (d: number) => {
    setA({ ...a, days_per_week: d });
    await setAttendanceGoal(userId, d).catch(() => {});
    load();
  };

  return (
    <Screen edges={['bottom']}>
      {title}
      <Card style={{ alignItems: 'center', gap: 6, paddingVertical: space.xl }}>
        <T size="sm" muted>{t('trust.thisMonthRate')}</T>
        <Num size={52} color={color}>{`${Math.min(rate, 999)}%`}</Num>
        <T size="sm">{t('trust.visitsOfPlanned', { visits: a.visits, planned: a.planned_to_date })}</T>
        <View style={{ width: '100%', height: 8, borderRadius: 4, backgroundColor: colors.cardAlt, overflow: 'hidden', marginTop: 6 }}>
          <View style={{ width: `${Math.min(100, pct(a.visits, a.planned_month))}%`, height: '100%', backgroundColor: color }} />
        </View>
        <T size="xs" muted>{t('trust.monthGoal', { visits: a.visits, planned: a.planned_month })}</T>
        {a.last_month_planned > 0 ? <T size="xs" muted>{t('trust.lastMonthRate', { pct: last })}</T> : null}
        {rate >= 100 ? <T size="sm" semibold color={brand.green}>{t('trust.aboveGoal')}</T> : null}
      </Card>

      <Card style={{ gap: space.sm }}>
        <T semibold>{t('trust.goalQ')}</T>
        <Segmented<number> wrap value={a.days_per_week} onChange={changeGoal} options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: d, label: String(d) }))} />
        <T size="xs" muted>{t('trust.goalHint')}</T>
      </Card>

      <Card style={{ gap: 6 }}>
        <Row>{days.map((d) => <T key={d} size="xs" muted center style={{ flex: 1 }}>{d}</T>)}</Row>
        {Array.from({ length: cells.length / 7 }, (_, w) => (
          <Row key={w} gap={0}>
            {cells.slice(w * 7, w * 7 + 7).map((d, i) => {
              const on = d != null && visited.has(d);
              const today = d === a.day_of_month;
              return (
                <View key={i} style={{ flex: 1, alignItems: 'center', paddingVertical: 3 }}>
                  {d != null ? (
                    <View style={{ width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: on ? brand.deepGreen : 'transparent', borderWidth: today ? 1.5 : 0, borderColor: brand.orange }}>
                      <T size="xs" semibold={on} color={on ? brand.cream : d > a.day_of_month ? colors.muted : colors.text}>{d}</T>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </Row>
        ))}
      </Card>
      <T size="xs" muted center>{t('trust.attendancePrivate')}</T>
    </Screen>
  );
}
