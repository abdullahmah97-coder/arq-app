// شاشة "نبضك": تفاصيل الجاهزية والإجهاد والنوم والخطوات + ترتيب الخطوات بين الأصدقاء
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SaduPattern } from '@/brand/Brand';
import { DashboardList, FitnessAgeCard, HealthMonitorCard, StrainRecoveryChart, StressCard } from '@/components/pulse/Insights';
import { ChevronBar, MiniBars, Rings } from '@/components/pulse/Rings';
import { NCard, NSection, NT, Num, Pill, zoneColor } from '@/components/pulse/widgets';
import { WatchWorkoutsCard } from '@/components/pulse/WatchWorkouts';
import { Avatar } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { addDays, isoDate, startOfWeek } from '@/lib/dates';
import { fmtDuration, useHealth } from '@/lib/health';
import { useLocalized } from '@/lib/i18n';
import { publicUrl, supabase } from '@/lib/supabase';
import { brand, night, pulse, space } from '@/theme';
import { openHref } from '@/lib/nav';

interface StepRow { user_id: string; username: string; full_name: string | null; avatar_url: string | null; steps: number; rank: number }

const stagesPalette = () => [['deep', night.text], ['light', pulse.yellow], ['rem', brand.orange], ['awake', night.line]] as const;
const zonePalette = () => [pulse.sleep, pulse.yellow, pulse.yellow, brand.orange, brand.orange];

export default function HealthScreen() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId } = useUser();
  const h = useHealth();
  const [how, setHow] = useState(false);
  const [board, setBoard] = useState<StepRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const weekdays = t('weekdaysShort', { returnObjects: true }) as string[];

  const loadBoard = useCallback(async () => {
    const from = startOfWeek();
    const { data } = await supabase.rpc('steps_leaderboard', { p_from: isoDate(from), p_to: isoDate(addDays(from, 6)) });
    setBoard((data ?? []) as StepRow[]);
  }, []);
  useFocusEffect(useCallback(() => { loadBoard(); }, [loadBoard]));

  const s = h.scores;
  const d = h.today;
  const zc = zoneColor(s?.zone);
  const hist14 = h.history.slice(-14);
  const week = h.history.slice(-7);
  const lbl = (day: string) => weekdays[new Date(day + 'T12:00:00').getDay()];
  const stages = d?.sleep?.stages;
  const asleep = d?.sleep?.asleep_min ?? null;
  const zones = d?.hr_zone_min ?? null;
  const zoneMax = zones ? Math.max(1, ...zones) : 1;

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  return (
    <View style={{ flex: 1, backgroundColor: night.bg }}>
      <StatusBar style={night.statusBar} />
      <LinearGradient colors={[night.bg2, night.bg]} style={StyleSheet.absoluteFill} end={{ x: 0, y: 0.5 }} />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={styles.top}>
          <Pressable onPress={back} hitSlop={10} style={styles.iconBtn}>
            <Ionicons name={lng === 'ar' ? 'chevron-forward' : 'chevron-back'} size={22} color={night.text} />
          </Pressable>
          <NT size={17} bold>{t('health.title')}</NT>
          <Pressable onPress={() => router.push('/devices')} hitSlop={10} style={styles.iconBtn} accessibilityLabel={t('health.devices')}>
            <Ionicons name="watch-outline" size={21} color={night.accent} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} tintColor={night.accent}
            onRefresh={async () => { setRefreshing(true); await Promise.all([h.refresh(), loadBoard()]); setRefreshing(false); }} />}
        >
          {h.status !== 'connected' ? (
            <NCard strong onPress={() => router.push('/devices')}>
              <Ionicons name="watch-outline" size={28} color={brand.amber} />
              <NT size={18} bold>{t('health.connectTitle')}</NT>
              <NT muted style={{ lineHeight: 22 }}>{t('health.connectBody')}</NT>
              <View style={styles.cta}><NT semibold color={brand.deepGreen}>{t('health.connect')}</NT></View>
            </NCard>
          ) : null}

          {/* الجاهزية */}
          <View style={styles.hero}>
            <View style={styles.heroPattern}><SaduPattern variant="chevron" opacity={0.06} color={zc} /></View>
            <Rings size={200} stroke={18} rings={[{ value: (s?.recovery ?? 0) / 100, color: zc, color2: s?.zone === 'green' ? brand.amber : zc }]}>
              <View style={{ alignItems: 'center' }}>
                <View style={{ flexDirection: 'row' }}>
                  <Num size={58}>{s?.recovery ?? '—'}</Num>
                  {s?.recovery != null ? <Num size={20} color={zc} style={{ marginTop: 6 }}>%</Num> : null}
                </View>
                <NT size={12} muted>{t('health.recovery')}</NT>
              </View>
            </Rings>
            <Pill center color={zc} bg="rgba(254,169,79,0.1)">{s?.zone ? t(`health.zone_${s.zone}`) : t('health.zone_none')}</Pill>
            {s ? <NT size={12} muted>{t('health.target', { a: s.strain_target[0], b: s.strain_target[1] })}</NT> : null}
          </View>

          {/* العمر الرياضي + مراقبة الصحة + التوتر */}
          <FitnessAgeCard />
          <HealthMonitorCard />
          <StressCard />

          <NSection title={t('health.components')} action={t('health.howTitle')} onAction={() => setHow((x) => !x)} />
          {how ? <NCard><NT muted style={{ lineHeight: 23 }}>{t('health.howBody')}</NT></NCard> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Component label={t('health.hrv')} value={d?.hrv_ms != null ? String(Math.round(d.hrv_ms)) : '—'} unit={t('health.ms')}
              sub={s?.baseline.hrv_ms ? t('health.baseline', { v: Math.round(s.baseline.hrv_ms) }) : ''} score={s?.components.hrv ?? null} color={pulse.green} />
            <Component label={t('health.rhr')} value={d?.resting_hr != null ? String(Math.round(d.resting_hr)) : '—'} unit={t('health.bpm')}
              sub={s?.baseline.resting_hr ? t('health.baseline', { v: Math.round(s.baseline.resting_hr) }) : ''} score={s?.components.rhr ?? null} color={pulse.yellow} />
            <Component label={t('health.performance')} value={s?.sleep_performance != null ? String(s.sleep_performance) : '—'} unit="%"
              sub={s?.sleep_efficiency != null ? `${t('health.efficiency')} ${s.sleep_efficiency}%` : ''} score={s?.components.sleep ?? null} color={pulse.sleep} />
          </View>
          {hist14.length ? (
            <NCard>
              <NT size={12} muted>{t('health.recovery')} · 14</NT>
              <MiniBars values={hist14.map((x) => x.scores.recovery)} max={100} height={70}
                colors={hist14.map((x) => zoneColor(x.scores.zone))} labels={hist14.map((x) => lbl(x.day.day).slice(0, 1))} />
            </NCard>
          ) : null}

          {/* الإجهاد */}
          <NSection title={t('health.strain')} />
          <NCard>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
                <Num size={46} color={brand.orange}>{s ? s.strain.toFixed(1) : '—'}</Num>
                <NT faint style={{ marginBottom: 8 }}>/ 21</NT>
              </View>
              {d?.active_kcal != null ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <Num size={22}>{d.active_kcal}</Num>
                  <NT size={11} faint>{t('health.kcal')}</NT>
                </View>
              ) : null}
            </View>
            {/* مسار 0..21 مع نطاق الهدف */}
            <View style={styles.track}>
              {s ? <View style={[styles.band, { start: `${(s.strain_target[0] / 21) * 100}%`, width: `${((s.strain_target[1] - s.strain_target[0]) / 21) * 100}%` }]} /> : null}
              {s ? <View style={[styles.marker, { start: `${Math.min(100, (s.strain / 21) * 100)}%` }]} /> : null}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <NT size={10} faint>0</NT><NT size={10} faint>{t('health.strainBand')}</NT><NT size={10} faint>21</NT>
            </View>
            {zones ? (
              <View style={{ gap: 6, marginTop: 4 }}>
                {zones.map((m, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <NT size={11} faint style={{ width: 22 }}>{t('health.zoneN', { n: i + 1 })}</NT>
                    <View style={{ flex: 1 }}><ChevronBar value={m / zoneMax} color={zonePalette()[i]} height={8} /></View>
                    <Num size={13} color={night.muted} style={{ width: 40, textAlign: 'right' }}>{m}{t('social.minShort')}</Num>
                  </View>
                ))}
              </View>
            ) : null}
          </NCard>

          <StrainRecoveryChart />

          {/* تمارين الساعة (Apple Watch) */}
          {h.status === 'connected' ? <WatchWorkoutsCard /> : null}

          {/* النوم */}
          <NSection title={t('health.sleep')} />
          <NCard>
            {asleep != null ? (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <View>
                    <NT size={12} muted>{t('health.asleep')}</NT>
                    <Num size={40} color={pulse.sleep}>{fmtDuration(asleep, lng)}</Num>
                  </View>
                  {s ? (
                    <View style={{ alignItems: 'flex-end' }}>
                      <NT size={11} faint>{t('health.sleepNeed')}</NT>
                      <Num size={20}>{fmtDuration(s.sleep_need_min, lng)}</Num>
                    </View>
                  ) : null}
                </View>
                {stages ? (
                  <>
                    <View style={styles.stack}>
                      {stagesPalette().map(([k, c]) => <View key={k} style={{ flex: Math.max(1, stages[k]), backgroundColor: c }} />)}
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                      {stagesPalette().map(([k, c]) => (
                        <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: c }} />
                          <NT size={11} muted>{t(`health.${k}`)}</NT>
                          <Num size={13}>{fmtDuration(stages[k], lng)}</Num>
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}
                {week.length ? (
                  <MiniBars values={week.map((x) => (x.day.sleep ? x.day.sleep.asleep_min / 60 : null))} max={10} height={50}
                    colors={pulse.sleep} labels={week.map((x) => lbl(x.day.day))} />
                ) : null}
              </>
            ) : <NT muted>{t('health.noSleep')}</NT>}
          </NCard>

          {/* لوحتي: كل المؤشرات مقابل معدلك */}
          {h.status === 'connected' ? <NSection title={t('insight.myDashboard')} /> : null}
          <DashboardList />

          {/* الخطوات + ترتيب الأصدقاء */}
          <NSection title={t('health.leaderboard')} action={t('compete.title')} onAction={() => openHref('/(tabs)/compete')} />
          <NCard>
            {board.length === 0 ? <NT muted>—</NT> : board.slice(0, 8).map((r) => {
              const me = r.user_id === userId;
              const top = board[0]?.steps || 1;
              return (
                <View key={r.user_id} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Num size={16} color={r.rank === 1 ? night.accent : night.muted} style={{ width: 22 }}>{r.rank}</Num>
                    <Avatar uri={publicUrl('avatars', r.avatar_url)} name={r.full_name ?? r.username} size={30} />
                    <NT semibold={me} style={{ flex: 1 }} numberOfLines={1} color={me ? night.accent : night.text}>{r.full_name ?? r.username}</NT>
                    <Num size={17}>{Number(r.steps).toLocaleString('en-US')}</Num>
                  </View>
                  <View style={{ marginStart: 32 }}><ChevronBar value={Number(r.steps) / Number(top)} color={me ? brand.orange : 'rgba(254,169,79,0.45)'} height={5} /></View>
                </View>
              );
            })}
          </NCard>

          <NT size={11} faint center>
            {h.source ? t(`health.source_${h.source}`) : t('health.notConnected')}
            {h.lastSync ? ' · ' + t('health.synced', { time: h.lastSync.toLocaleTimeString(lng === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) }) : ''}
          </NT>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Component({ label, value, unit, sub, score, color }: { label: string; value: string; unit: string; sub: string; score: number | null; color: string }) {
  return (
    <NCard style={{ flex: 1, padding: 12, gap: 6 }}>
      <NT size={10} muted numberOfLines={2} style={{ minHeight: 26 }}>{label}</NT>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
        <Num size={24} color={color}>{value}</Num>
        <NT size={10} faint style={{ marginBottom: 3 }}>{unit}</NT>
      </View>
      <ChevronBar value={(score ?? 0) / 100} color={color} height={5} />
      <NT size={9} faint numberOfLines={2}>{sub}</NT>
    </NCard>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md, paddingVertical: space.sm },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: night.card },
  hero: { alignItems: 'center', gap: 10, paddingVertical: space.md },
  heroPattern: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 24, overflow: 'hidden' },
  cta: { backgroundColor: brand.amber, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8, alignSelf: 'flex-start' },
  track: { height: 14, borderRadius: 7, backgroundColor: night.line, justifyContent: 'center' },
  band: { position: 'absolute', height: 14, borderRadius: 7, backgroundColor: 'rgba(241,85,29,0.35)', borderWidth: 1, borderColor: brand.orange },
  marker: { position: 'absolute', width: 4, height: 22, borderRadius: 2, backgroundColor: night.text, marginStart: -2 },
  stack: { flexDirection: 'row', height: 16, borderRadius: 8, overflow: 'hidden', gap: 2 },
});
