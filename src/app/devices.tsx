// ربط الجوال والساعة: Apple Health (iOS) / Health Connect (Android) + وضع تجريبي
import { Ionicons } from '@expo/vector-icons';
import { ImageBackground } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Logo } from '@/brand/Brand';
import { Button, Card, Row, T, type IconName } from '@/components/ui';
import { useHealth, type DailyHealth } from '@/lib/health';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { brand, colors, space, TAB_BAR_SPACE } from '@/theme';

// مع ساعة أبل: وش يشتغل بدون تطبيق ساعة منفصل
const WATCH: [IconName, string][] = [
  ['hourglass-outline', 'watch.feat_rest'], ['chatbubble-ellipses-outline', 'watch.feat_reply'],
  ['walk-outline', 'watch.feat_workouts'], ['heart-outline', 'watch.feat_session'], ['calendar-outline', 'watch.feat_bookings'],
  ['nutrition-outline', 'watch.feat_kcal'], ['notifications-outline', 'watch.feat_quiet'],
];

// وش وصلنا من الساعة فعلاً (آخر ٣٠ يوم) — يبيّن وين المشكلة لو «ما فيه مزامنة»
type Metric = { key: string; icon: IconName; has: (d: DailyHealth) => boolean; missingHint?: string; estHint?: (d: DailyHealth) => boolean };
const METRICS: Metric[] = [
  { key: 'health.steps', icon: 'footsteps', has: (d) => (d.steps ?? 0) > 0 },
  { key: 'health.recvHeartRate', icon: 'heart', has: (d) => d.avg_hr != null },
  { key: 'health.rhr', icon: 'heart-circle', has: (d) => d.resting_hr != null, estHint: (d) => !!d.rhr_estimated },
  { key: 'health.hrv', icon: 'pulse', has: (d) => d.hrv_ms != null, missingHint: 'health.recvNoHrv' },
  { key: 'health.sleep', icon: 'moon', has: (d) => !!d.sleep },
  { key: 'health.recvStages', icon: 'bed', has: (d) => !!d.sleep?.stages },
];

const READS: [IconName, string][] = [
  ['footsteps', 'health.steps'], ['moon', 'health.sleep'], ['heart', 'health.rhr'], ['pulse', 'health.hrv'], ['flame', 'health.kcal'],
];

export default function Devices() {
  const { t } = useTranslation();
  const h = useHealth();
  const [busy, setBusy] = useState(false);
  const ios = Platform.OS === 'ios';
  const android = Platform.OS === 'android';
  const native = ios || android;
  const realConnected = h.status === 'connected' && h.source !== 'demo';
  const { lng } = useLocalized();
  const [xiaomi, setXiaomi] = useState(false);
  const received = useMemo(() => {
    // آخر يوم في القراءة = اليوم (القراءة تنتهي باليوم)، واللي قبله = أمس
    const today = h.days[h.days.length - 1]?.day;
    const yesterday = h.days[h.days.length - 2]?.day;
    return METRICS.map((m) => {
      const last = [...h.days].reverse().find(m.has);
      const when = !last ? null : last.day === today ? t('health.recvToday') : last.day === yesterday ? t('health.recvYesterday') : timeAgo(`${last.day}T12:00:00`, lng);
      return { m, last, when };
    });
  }, [h.days, t, lng]);

  const connect = async () => {
    setBusy(true);
    try {
      const ok = await h.connect();
      if (!ok) Alert.alert(t('health.unavailable'));
      else router.dismissTo('/health');
    } finally { setBusy(false); }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: TAB_BAR_SPACE }}>
      <ImageBackground source={require('../../assets/imagery/sprint.jpg')} style={styles.hero} imageStyle={{ borderRadius: 20 }} contentFit="cover">
        <LinearGradient colors={['rgba(10,51,45,0.1)', 'rgba(10,51,45,0.95)']} style={[StyleSheet.absoluteFill, { borderRadius: 20 }]} />
        <View style={{ flex: 1, justifyContent: 'flex-end', padding: space.lg, gap: 6 }}>
          <Logo variant="mark" height={20} color={brand.orange} />
          <T size="xl" bold color={brand.cream}>{t('health.connectTitle')}</T>
          <T size="sm" color={brand.sand} style={{ lineHeight: 22 }}>{t('health.connectBody')}</T>
        </View>
      </ImageBackground>

      {native ? (
        <Card style={{ gap: space.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={space.md}>
              <View style={[styles.srcIcon, { backgroundColor: ios ? '#FFFFFF' : brand.deepGreen }]}>
                <Ionicons name={ios ? 'heart' : 'fitness'} size={24} color={ios ? '#FF2D55' : brand.amber} />
              </View>
              <View>
                <T bold>{ios ? 'Apple Health' : 'Health Connect'}</T>
                <T size="xs" muted>{ios ? t('health.via_ios') : t('health.via_android')}</T>
              </View>
            </Row>
            <View style={[styles.dot, { backgroundColor: realConnected ? brand.green : colors.border }]} />
          </Row>
          <T size="sm" muted>{ios ? t('health.watches_ios') : t('health.watches_android')}</T>
          {h.status === 'unavailable' ? <T size="sm" color={colors.danger}>{t('health.unavailable')}</T> : null}
          {realConnected ? (
            <View style={{ gap: space.sm }}>
              <Button title={t('health.refresh')} icon="sync" onPress={() => h.refresh()} loading={h.syncing} />
              {h.openSettings ? <Button title={t('health.manage')} variant="secondary" icon="settings-outline" onPress={() => h.openSettings?.()} /> : null}
              <Button title={t('health.disconnect')} variant="ghost" onPress={() => h.disconnect()} />
            </View>
          ) : (
            <Button title={t('health.connect')} icon="link" onPress={connect} loading={busy} disabled={h.status === 'unavailable'} />
          )}
        </Card>
      ) : null}

      {realConnected ? (
        <Card style={{ gap: space.sm }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row><Ionicons name="checkmark-done" size={18} color={brand.green} /><T bold>{t('health.recvTitle')}</T></Row>
            {h.lastSync ? <T size="xs" muted>{timeAgo(h.lastSync.toISOString(), lng)}</T> : null}
          </Row>
          {received.map(({ m, last, when }) => (
            <View key={m.key} style={{ gap: 2 }}>
              <Row gap={10}>
                <Ionicons name={m.icon} size={16} color={last ? brand.orange : colors.muted} />
                <T size="sm" style={{ flex: 1 }}>{t(m.key)}</T>
                <Ionicons name={last ? 'checkmark-circle' : 'close-circle-outline'} size={16} color={last ? brand.green : colors.muted} />
                <T size="xs" muted>{when ?? t('health.recvNone')}</T>
              </Row>
              {last && m.estHint?.(last) ? <T size="xs" muted style={{ lineHeight: 18, marginStart: 26 }}>{t('health.recvRhrEst')}</T> : null}
              {!last && m.missingHint ? <T size="xs" muted style={{ lineHeight: 18, marginStart: 26 }}>{t(m.missingHint)}</T> : null}
            </View>
          ))}
          <T size="xs" muted style={{ lineHeight: 19 }}>{t('health.recvFooter')}</T>
        </Card>
      ) : null}

      {native ? (
        <Card style={{ gap: space.sm }}>
          <Pressable onPress={() => setXiaomi((x) => !x)} accessibilityRole="button" accessibilityState={{ expanded: xiaomi }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row><Ionicons name="watch-outline" size={18} color={brand.orange} /><T bold>{t('health.xiaomiTitle')}</T></Row>
              <Ionicons name={xiaomi ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
            </Row>
          </Pressable>
          {xiaomi ? (
            <View style={{ gap: space.sm }}>
              {(t(ios ? 'health.xiaomiStepsIos' : 'health.xiaomiStepsAndroid', { returnObjects: true }) as string[]).map((step, i) => (
                <Row key={step} gap={10} style={{ alignItems: 'flex-start' }}>
                  <View style={styles.stepNum}><T size="xs" bold color={brand.cream}>{i + 1}</T></View>
                  <T size="sm" style={{ flex: 1, lineHeight: 21 }}>{step}</T>
                </Row>
              ))}
              <T size="xs" muted style={{ lineHeight: 19 }}>{t('health.xiaomiNote')}</T>
            </View>
          ) : null}
        </Card>
      ) : null}

      {!android ? (
        <Card style={{ gap: space.sm }}>
          <Row><Ionicons name="watch" size={18} color={brand.orange} /><T bold>{t('watch.featuresTitle')}</T></Row>
          {WATCH.map(([icon, key]) => (
            <Row key={key} gap={10} style={{ alignItems: 'flex-start' }}>
              <Ionicons name={icon} size={16} color={brand.green} style={{ marginTop: 3 }} />
              <T size="sm" style={{ flex: 1, lineHeight: 21 }}>{t(key)}</T>
            </Row>
          ))}
          <T size="xs" muted style={{ lineHeight: 19 }}>{t('watch.featuresNote')}</T>
        </Card>
      ) : null}

      <Card style={{ gap: space.md }}>
        <T bold>{t('health.components')}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {READS.map(([icon, key]) => (
            <Row key={key} gap={6} style={styles.chip}>
              <Ionicons name={icon} size={14} color={brand.orange} />
              <T size="xs">{t(key)}</T>
            </Row>
          ))}
        </View>
        <T size="xs" muted style={{ lineHeight: 20 }}>{t('health.noWatch')}</T>
      </Card>

      <Card style={{ gap: space.sm }}>
        <Row><Ionicons name="flask-outline" size={18} color={brand.green} /><T bold>{t('health.demo')}</T></Row>
        <Button title={h.source === 'demo' ? t('health.disconnect') : t('health.demo')} variant="secondary"
          onPress={() => (h.source === 'demo' ? h.disconnect() : (h.useDemo(), router.dismissTo('/health')))} />
      </Card>

      <Row style={{ alignItems: 'flex-start' }}>
        <Ionicons name="lock-closed-outline" size={16} color={colors.muted} />
        <T size="xs" muted style={{ flex: 1, lineHeight: 20 }}>{t('health.privacy')}</T>
      </Row>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { height: 240, borderRadius: 20, overflow: 'hidden' },
  srcIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  dot: { width: 12, height: 12, borderRadius: 6 },
  chip: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  stepNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
});
