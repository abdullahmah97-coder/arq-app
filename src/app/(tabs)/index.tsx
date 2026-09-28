// الرئيسية "النبض": شاشة غامرة داكنة — حلقات الجاهزية/الإجهاد/النوم، مهمة اليوم المعدّلة حسب الجاهزية، الخطوات، والحضور.
import { Ionicons } from '@expo/vector-icons';
import { Image, ImageBackground } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Logo, SaduPattern } from '@/brand/Brand';
import { CheckInCard } from '@/components/CheckInCard';
import { HomeClubOffers } from '@/components/clubs/HomeClubOffers';
import { NotificationBell } from '@/components/NotificationBell';
import { PushPrompt } from '@/components/PushPrompt';
import { ChevronBar, MiniBars, Rings } from '@/components/pulse/Rings';
import { MetricChip, NCard, NSection, NT, Num, OnDark, Pill, zoneColor } from '@/components/pulse/widgets';
import { Avatar } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { startOfWeek, todayIndex } from '@/lib/dates';
import { adaptWorkout, useHealth } from '@/lib/health';
import { useLocalized } from '@/lib/i18n';
import { isBeta } from '@/lib/appInfo';
import { getActiveWorkout, type ActiveWorkout } from '@/lib/training';
import { publicUrl, supabase } from '@/lib/supabase';
import type { LeaderboardRow } from '@/lib/types';
import { brand, night, pulse, space, TAB_BAR_SPACE } from '@/theme';

const IMG = {
  mission: require('../../../assets/imagery/run-dune.jpg'),
  rest: require('../../../assets/imagery/fabric-flow.jpg'),
  bottle: require('../../../assets/imagery/bottle.jpg'),
};

export default function Home() {
  const { t } = useTranslation();
  const { L, lng } = useLocalized();
  const { userId, profile, plan, refreshProfile } = useUser();
  const h = useHealth();
  const [rank, setRank] = useState<string>('—');
  const [showRules, setShowRules] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const weekdays = t('weekdaysShort', { returnObjects: true }) as string[];

  const loadRank = useCallback(async () => {
    const { data } = await supabase.rpc('leaderboard', { p_scope: 'friends', p_since: startOfWeek().toISOString(), p_limit: 200 });
    const rows = (data ?? []) as LeaderboardRow[];
    const me = rows.find((r) => r.user_id === userId);
    setRank(me && rows.length > 1 ? `${me.rank}/${rows.length}` : '—');
  }, [userId]);
  const [active, setActive] = useState<ActiveWorkout | null>(null);
  useFocusEffect(useCallback(() => { loadRank(); getActiveWorkout().then(setActive); }, [loadRank]));

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshProfile(), loadRank(), h.refresh()]);
    setRefreshing(false);
  };

  const s = h.scores;
  const zone = s?.zone ?? null;
  const zc = zoneColor(zone);
  const sleepMin = h.today?.sleep?.asleep_min ?? null;
  const today = plan?.data.days.find((d) => d.day === todayIndex());
  const adapted = useMemo(() => (today ? adaptWorkout(today, zone) : null), [today, zone]);
  const week = h.history.slice(-7);
  const steps = h.today?.steps ?? 0;
  const connected = h.status === 'connected';
  const firstName = profile.full_name?.split(' ')[0] || profile.username;
  const dateStr = new Date().toLocaleDateString(lng === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <View style={{ flex: 1, backgroundColor: night.bg }}>
      <StatusBar style={night.statusBar} />
      <LinearGradient colors={[night.bg2, night.bg]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 0, y: 0.6 }} />
      <View style={styles.pattern}><SaduPattern variant="peaks" opacity={0.05} color={brand.amber} /></View>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.lg, paddingBottom: TAB_BAR_SPACE }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={night.accent} />}
        >
          {/* الترويسة */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Logo variant="mark" height={22} color={brand.orange} />
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <NT size={17} bold>{t('home.hello', { name: firstName })}</NT>
                  {isBeta ? (
                    <Pressable onPress={() => router.push({ pathname: '/feedback', params: { screen: 'home' } })} style={styles.beta}>
                      <NT size={10} bold color={brand.deepGreen}>{t('beta.badge')}</NT>
                    </Pressable>
                  ) : null}
                </View>
                <NT size={11} faint>{dateStr}</NT>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <NotificationBell color={night.text} ring={night.bg2} />
              <Pressable onPress={() => router.push('/(tabs)/profile')} style={styles.avatarRing} accessibilityLabel={t('profile.title')}>
                <Avatar uri={publicUrl('avatars', profile.avatar_url)} name={profile.full_name ?? profile.username} size={38} />
              </Pressable>
            </View>
          </View>

          <PushPrompt />

          {/* الحلقات */}
          <Pressable onPress={() => router.push(connected ? '/health' : '/devices')} style={{ alignItems: 'center', marginTop: space.sm }}>
            <Rings
              size={264}
              stroke={15}
              gap={9}
              rings={[
                { value: (s?.recovery ?? 0) / 100, color: zc, color2: zone === 'green' ? brand.amber : zc },
                { value: (s?.strain ?? 0) / 21, color: brand.orange, color2: brand.amber },
                { value: sleepMin != null && s ? sleepMin / Math.max(1, s.sleep_need_min) : 0, color: pulse.sleep, color2: night.statusBar === 'dark' ? brand.green : brand.cream },
              ]}
            >
              {connected && s?.recovery != null ? (
                <View style={{ alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <Num size={68} color={night.text}>{s.recovery}</Num>
                    <Num size={24} color={zc} style={{ marginTop: 8 }}>%</Num>
                  </View>
                  <NT size={12} semibold color={zc}>{t('health.recovery')}</NT>
                </View>
              ) : connected ? (
                <View style={{ alignItems: 'center', paddingHorizontal: 40 }}>
                  <Num size={46}>{s ? s.strain.toFixed(1) : '—'}</Num>
                  <NT size={12} muted center>{t('health.strain')}</NT>
                  <NT size={10} faint center style={{ marginTop: 6 }}>{t('health.zone_none')}</NT>
                </View>
              ) : h.status === 'loading' ? (
                <ActivityIndicator color={brand.amber} />
              ) : (
                <View style={{ alignItems: 'center', gap: 8, paddingHorizontal: 36 }}>
                  <Ionicons name="watch-outline" size={34} color={night.accent} />
                  <NT size={14} bold center>{t('health.connectTitle')}</NT>
                  <View style={styles.cta}><NT size={12} semibold color={brand.deepGreen}>{t('health.connect')}</NT></View>
                </View>
              )}
            </Rings>
          </Pressable>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <MetricChip icon="pulse" label={t('health.recovery')} color={zc}
              value={s?.recovery != null ? String(s.recovery) : '—'} unit={s?.recovery != null ? '%' : undefined} onPress={() => router.push('/health')} />
            <MetricChip icon="flame" label={t('health.strain')} color={brand.orange}
              value={connected && s ? s.strain.toFixed(1) : '—'} unit="/21" onPress={() => router.push('/health')} />
            <MetricChip icon="moon" label={t('health.sleep')} color={pulse.sleep}
              value={sleepMin != null ? `${Math.floor(sleepMin / 60)}:${String(Math.round(sleepMin % 60)).padStart(2, '0')}` : '—'}
              unit={sleepMin != null ? t('health.hours') : undefined} onPress={() => router.push('/health')} />
          </View>
          {connected && s?.zone ? (
            <View style={{ alignItems: "center", marginTop: -6 }}><Pill center color={zc} bg="rgba(254,169,79,0.1)">{t(`health.zone_${zone}`)}</Pill></View>
          ) : null}
          {connected && s ? (
            <NT size={12} muted center>{t('health.target', { a: s.strain_target[0], b: s.strain_target[1] })} · {h.syncing ? t('health.syncing') : t(`health.source_${h.source}`)}</NT>
          ) : null}

          {active ? (
            <Pressable onPress={() => router.push('/workout/log')} style={styles.resume}>
              <Ionicons name="barbell" size={20} color={brand.deepGreen} />
              <View style={{ flex: 1 }}>
                <NT size={13} bold color={brand.deepGreen}>{t('workout.resume')}</NT>
                <NT size={11} color={brand.green} numberOfLines={1}>{active.title} · {t('workout.setsDone', { done: active.done.length, total: active.exercises.reduce((a, e) => a + e.sets, 0) })}</NT>
              </View>
              <Ionicons name={lng === 'ar' ? 'chevron-back' : 'chevron-forward'} size={18} color={brand.deepGreen} />
            </Pressable>
          ) : null}

          {/* مهمة اليوم */}
          <NSection title={t('health.mission')} action={plan ? t('home.openPlan') : undefined} onAction={() => router.push('/(tabs)/plan')} />
          <Pressable onPress={() => router.push('/(tabs)/plan')}>
            <ImageBackground source={adapted && !adapted.day.rest ? IMG.mission : IMG.rest} style={styles.mission} imageStyle={{ borderRadius: 22 }} contentFit="cover">
              <LinearGradient colors={['rgba(6,31,27,0.15)', 'rgba(6,31,27,0.92)']} style={[StyleSheet.absoluteFill, { borderRadius: 22 }]} />
              <OnDark style={{ flex: 1, justifyContent: 'flex-end', padding: space.lg, gap: 8 }}>
                {!plan ? (
                  <>
                    <NT size={22} bold>{t('home.noPlan')}</NT>
                    <View style={styles.cta}><NT size={13} semibold color={brand.deepGreen}>{t('home.makePlan')}</NT></View>
                  </>
                ) : adapted && !adapted.day.rest ? (
                  <>
                    {adapted.reason ? <Pill color={zc} bg="rgba(6,31,27,0.7)">{adapted.changed ? t('health.adaptedBadge') : t(adapted.reason)}</Pill> : null}
                    <NT size={24} bold>{L(adapted.day.focus)}</NT>
                    {adapted.day.exercises.slice(0, 3).map((e, i) => (
                      <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                        <NT size={13} muted numberOfLines={1} style={{ flex: 1 }}>{L(e.name)}</NT>
                        <Num size={15} color={brand.amber}>{e.sets}×{e.reps}</Num>
                      </View>
                    ))}
                    {adapted.changed && adapted.reason ? <NT size={11} faint>{t(adapted.reason)}</NT> : null}
                  </>
                ) : (
                  <>
                    <Ionicons name="bed-outline" size={26} color={brand.sand} />
                    <NT size={20} bold>{t('home.restDay')}</NT>
                  </>
                )}
              </OnDark>
            </ImageBackground>
          </Pressable>

          {/* الخطوات */}
          <NCard onPress={() => router.push(connected ? '/health' : '/devices')}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View>
                <NT size={12} muted>{t('health.steps')}</NT>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
                  <Num size={38}>{connected ? steps.toLocaleString('en-US') : '—'}</Num>
                  <NT size={12} faint style={{ marginBottom: 6 }}>{t('health.stepsGoal', { goal: h.stepGoal.toLocaleString('en-US') })}</NT>
                </View>
              </View>
              <Ionicons name="footsteps" size={26} color={pulse.steps} />
            </View>
            <ChevronBar value={steps / h.stepGoal} color={steps >= 10000 ? brand.orange : pulse.steps} />
            {week.length ? (
              <MiniBars values={week.map((w) => w.day.steps)} max={Math.max(12000, ...week.map((w) => w.day.steps ?? 0))}
                colors={week.map((w) => ((w.day.steps ?? 0) >= 10000 ? brand.orange : pulse.steps))}
                labels={week.map((w) => weekdays[new Date(w.day.day + 'T12:00:00').getDay()])} height={44} />
            ) : null}
            <NT size={11} faint>{t('health.stepsPoints')}</NT>
          </NCard>

          {/* النقاط والسلسلة والترتيب */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[
              { icon: 'star' as const, v: String(profile.points), l: t('home.points'), c: pulse.yellow },
              { icon: 'flame' as const, v: String(profile.streak), l: t('home.streak'), c: brand.orange },
              { icon: 'podium' as const, v: rank, l: t('home.weekRank'), c: brand.sand },
            ].map((x) => (
              <NCard key={x.l} style={{ flex: 1, padding: 14, gap: 4 }} onPress={() => router.push('/(tabs)/compete')}>
                <Ionicons name={x.icon} size={16} color={x.c} />
                <Num size={26}>{x.v}</Num>
                <NT size={10} muted numberOfLines={2}>{x.l}</NT>
              </NCard>
            ))}
          </View>

          <CheckInCard onChange={loadRank} />

          {/* عروض النوادي: الأسعار والعروض والتقييمات */}
          <HomeClubOffers />

          {/* متجر الشركاء: أضف متجرك + استبدال النقاط (قريباً) */}
          <Pressable style={styles.store} onPress={() => router.push('/store')} accessibilityRole="button" accessibilityLabel={t('store.title')}>
            <Image source={IMG.bottle} style={styles.storeImg} contentFit="cover" />
            <View style={{ flex: 1, gap: 4, padding: space.md }}>
              <NT size={16} bold color={brand.deepGreen}>{t('store.homeTitle')}</NT>
              <NT size={12} color={brand.green}>{t('store.homeBody')}</NT>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <Pill color={brand.cream} bg={brand.orange}>{t('store.soon')}</Pill>
                <NT size={11} color={brand.green} numberOfLines={1} style={{ flexShrink: 1 }}>{t('store.redeemShort')}</NT>
              </View>
            </View>
          </Pressable>

          <NCard onPress={() => setShowRules((x) => !x)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Ionicons name="help-circle-outline" size={18} color={night.accent} />
                <NT semibold>{t('home.pointsRules')}</NT>
              </View>
              <Ionicons name={showRules ? 'chevron-up' : 'chevron-down'} size={16} color={night.muted} />
            </View>
            {showRules ? <NT muted style={{ lineHeight: 24 }}>{t('home.rules')}</NT> : null}
          </NCard>

          <View style={{ alignItems: 'center', gap: 6, marginTop: space.md, opacity: 0.5 }}>
            <Logo variant="lockup" height={14} color={brand.sand} />
            <NT size={11} faint>{t('app.slogan')}</NT>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  pattern: { position: 'absolute', top: 0, left: 0, right: 0, height: 420 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: space.sm },
  resume: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: brand.amber, borderRadius: 18, padding: 14 },
  beta: { backgroundColor: brand.amber, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  avatarRing: { padding: 2, borderRadius: 24, borderWidth: 1.5, borderColor: brand.orange },
  cta: { backgroundColor: brand.amber, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7, alignSelf: 'center' },
  mission: { height: 250, borderRadius: 22, overflow: 'hidden' },
  store: { flexDirection: 'row', alignItems: 'center', backgroundColor: brand.cream, borderRadius: 20, overflow: 'hidden' },
  storeImg: { width: 108, height: 116 },
});
