// ملخص الجلسة + جدول المقارنة مع آخر جلسة مماثلة (نفس العضلات) والأرقام الشخصية
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, I18nManager, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { FullSafeView } from '@/components/FullSafeView';
import { SaduPattern } from '@/brand/Brand';
import { NT, Num } from '@/components/pulse/widgets';
import { useLocalized } from '@/lib/i18n';
import { FriendsBest } from '@/components/workout/FriendsBest';
import { SessionWatchCard } from '@/components/pulse/WatchWorkouts';
import { exportWorkoutToHealth, sessionWatchStats, type SessionWatchStats } from '@/lib/health';
import { compareSession, daysAgo, fmtSet, loadFriendsBest, loadHistory, loadSession, summarize, type FriendBest, type SessionCompare, type SessionData } from '@/lib/training';
import { getExercise } from '@/three/catalog';
import { brand, night, pulse, space } from '@/theme';

export default function WorkoutSummary() {
  const { id, points } = useLocalSearchParams<{ id: string; points?: string }>();
  const { t } = useTranslation();
  const { L, lng } = useLocalized();
  const [session, setSession] = useState<SessionData | null>(null);
  const [cmp, setCmp] = useState<SessionCompare | null>(null);
  const [friends, setFriends] = useState<Record<string, FriendBest[]>>({});
  const [watch, setWatch] = useState<{ stats: SessionWatchStats | null; saved: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      const [s, h] = await Promise.all([loadSession(String(id)), loadHistory(120)]);
      setSession(s);
      if (s) {
        setCmp(compareSession(s, h));
        loadFriendsBest([...new Set(s.sets.map((x) => x.exercise_id))]).then(setFriends).catch(() => {});
        // الساعة: نبض وسعرات الجلسة، ونحفظها في Apple Health (الجلسات الجديدة بس، مرة وحدة)
        const start = new Date(s.started_at);
        const end = s.finished_at ? new Date(s.finished_at) : null;
        if (end) {
          const stats = await sessionWatchStats(start, end).catch(() => null);
          const fresh = Date.now() - end.getTime() < 86_400_000;
          const saved = fresh ? await exportWorkoutToHealth({ id: s.id, title: s.title || 'ARQ', start, end }, stats?.kcal ?? null).catch(() => false) : false;
          setWatch({ stats, saved });
        }
      }
    })();
  }, [id]);

  const Delta = ({ v, unit = '%' }: { v: number | null; unit?: string }) => {
    if (v == null) return <NT size={12} faint>—</NT>;
    const up = v > 0, same = v === 0;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        {!same ? <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={12} color={up ? pulse.green : brand.orange} /> : null}
        <Num size={14} color={same ? night.muted : up ? pulse.green : brand.orange}>{up ? '+' : ''}{v}{unit}</Num>
      </View>
    );
  };

  const date = session ? new Date(session.started_at).toLocaleDateString(lng === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  const prevDays = session && cmp?.previous ? daysAgo(cmp.previous.started_at, Date.parse(session.started_at)) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: night.bg }}>
      <StatusBar style={night.statusBar} />
      <LinearGradient colors={[night.bg2, night.bg]} style={StyleSheet.absoluteFill} end={{ x: 0, y: 0.5 }} />
      <FullSafeView edges={['top']} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} hitSlop={10} style={styles.iconBtn}>
            <Ionicons name={lng === 'ar' ? 'chevron-forward' : 'chevron-back'} size={22} color={night.text} />
          </Pressable>
          <NT size={16} bold>{t('workout.summary')}</NT>
          <View style={{ width: 40 }} />
        </View>
        {!session || !cmp ? <ActivityIndicator color={brand.amber} style={{ marginTop: 60 }} /> : (
          <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 60 }}>
            {/* البطل */}
            <View style={styles.hero}>
              <SaduPattern variant="chevron" opacity={0.08} color={brand.amber} />
              {cmp.prs > 0 ? <NT size={28}>🏆</NT> : null}
              <NT size={22} bold center>{session.title || t('workout.title')}</NT>
              <NT size={12} muted>{date}</NT>
              {Number(points) > 0 ? <NT size={12} semibold color={brand.amber}>+{points} {t('common.points')}</NT> : null}
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Stat label={t('workout.volume')} value={`${Math.round(cmp.totals.now.volume).toLocaleString('en-US')}`} unit={t('workout.kg')} delta={<Delta v={cmp.volumeDelta} />} />
              <Stat label={t('workout.sets')} value={String(cmp.totals.now.sets)} delta={cmp.totals.prev ? <Delta v={cmp.totals.now.sets - cmp.totals.prev.sets} unit="" /> : null} />
              <Stat label={t('workout.duration')} value={cmp.totals.now.minutes != null ? String(cmp.totals.now.minutes) : '—'} unit={t('coach.min')}
                delta={cmp.totals.prev?.minutes != null && cmp.totals.now.minutes != null ? <Delta v={cmp.totals.now.minutes - cmp.totals.prev.minutes} unit="" /> : null} />
            </View>

            {watch ? <SessionWatchCard stats={watch.stats} saved={watch.saved} /> : null}

            {/* بعد التمرين: روتين الاستشفاء لنفس العضلات */}
            <Pressable onPress={() => router.push('/recovery')} accessibilityRole="button"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: night.card, borderRadius: 18,
                borderWidth: 1, borderColor: night.line, padding: 14, opacity: pressed ? 0.85 : 1 })}>
              <Ionicons name="leaf" size={20} color={brand.amber} />
              <View style={{ flex: 1 }}>
                <NT size={14} bold>{t('recovery.afterWorkout')}</NT>
                <NT size={11} muted>{t('recovery.afterWorkoutHint')}</NT>
              </View>
              <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={night.muted} />
            </Pressable>

            {/* المقارنة */}
            <View style={{ gap: 4 }}>
              <NT size={16} bold>{t('workout.compareTitle')}</NT>
              <NT size={12} muted>
                {cmp.previous
                  ? t('workout.compareWith', { title: cmp.previous.title || t('workout.title'), days: prevDays, count: prevDays })
                  : t('workout.noPrevious')}
              </NT>
            </View>
            <View style={styles.table}>
              <View style={[styles.tr, styles.th]}>
                <NT size={11} faint style={{ flex: 1.6 }}>{t('workout.exercise')}</NT>
                <NT size={11} faint style={styles.col}>{t('workout.last')}</NT>
                <NT size={11} faint style={styles.col}>{t('workout.today')}</NT>
                <NT size={11} faint style={styles.colD}>{t('workout.change')}</NT>
              </View>
              {cmp.rows.map((r) => {
                const g = getExercise(r.exercise_id);
                return (
                  <Pressable key={r.exercise_id} onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: r.exercise_id } })} style={styles.tr}>
                    <View style={{ flex: 1.6, gap: 2 }}>
                      <NT size={13} semibold numberOfLines={2}>{g ? L(g.name) : r.exercise_id}{r.pr ? ' 🏆' : ''}</NT>
                      <NT size={10} faint>{r.now.sets} × · {Math.round(r.now.volume)} {t('workout.kg')}</NT>
                    </View>
                    <Num size={14} color={night.muted} style={styles.col}>{r.prev?.top ? fmtSet(r.prev.top) : '—'}</Num>
                    <Num size={14} color={night.text} style={styles.col}>{r.now.top ? fmtSet(r.now.top) : '—'}</Num>
                    <View style={styles.colD}><Delta v={r.volumeDelta} /></View>
                  </Pressable>
                );
              })}
            </View>
            <NT size={11} faint style={{ lineHeight: 18 }}>{t('workout.legend')}</NT>

            {/* أفضل رقم بين الأصدقاء */}
            {cmp.rows.some((r) => friends[r.exercise_id]?.some((f) => !f.is_me)) ? (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="trophy" size={16} color={brand.amber} />
                  <NT size={16} bold>{t('workout.friendsBoard')}</NT>
                </View>
                <NT size={12} muted>{t('workout.friendsBoardHint')}</NT>
                {cmp.rows.filter((r) => friends[r.exercise_id]?.some((f) => !f.is_me)).map((r) => {
                  const g = getExercise(r.exercise_id);
                  const top = summarize(r.exercise_id, session.sets).top;
                  return (
                    <View key={r.exercise_id} style={[styles.stat, { gap: 8 }]}>
                      <NT size={14} bold>{g ? L(g.name) : r.exercise_id}</NT>
                      <FriendsBest rows={friends[r.exercise_id]} mine={top} />
                    </View>
                  );
                })}
              </View>
            ) : (
              <Pressable onPress={() => router.push('/friends')} style={[styles.stat, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                <Ionicons name="people-outline" size={18} color={brand.amber} />
                <NT size={12} muted style={{ flex: 1 }}>{t('workout.friendsBoardEmpty')}</NT>
              </Pressable>
            )}

            <Pressable onPress={() => router.push('/workout/history')} style={styles.link}>
              <Ionicons name="list-outline" size={18} color={brand.deepGreen} />
              <NT semibold color={brand.deepGreen}>{t('workout.history')}</NT>
            </Pressable>
          </ScrollView>
        )}
      </FullSafeView>
    </View>
  );
}

function Stat({ label, value, unit, delta }: { label: string; value: string; unit?: string; delta?: React.ReactNode }) {
  return (
    <View style={styles.stat}>
      <NT size={11} muted>{label}</NT>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
        <Num size={24}>{value}</Num>
        {unit ? <NT size={10} faint style={{ marginBottom: 3 }}>{unit}</NT> : null}
      </View>
      {delta}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md, paddingVertical: space.sm },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: night.card },
  hero: { alignItems: 'center', gap: 4, paddingVertical: space.lg, borderRadius: 22, overflow: 'hidden', backgroundColor: night.card },
  stat: { flex: 1, backgroundColor: night.card, borderRadius: 16, borderWidth: 1, borderColor: night.line, padding: 12, gap: 4 },
  table: { backgroundColor: night.card, borderRadius: 18, borderWidth: 1, borderColor: night.line, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: night.line },
  th: { paddingVertical: 8, backgroundColor: night.cardStrong },
  col: { width: 64, textAlign: 'center' },
  colD: { width: 58, alignItems: 'center' },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: brand.amber, borderRadius: 999, paddingVertical: 12 },
});
