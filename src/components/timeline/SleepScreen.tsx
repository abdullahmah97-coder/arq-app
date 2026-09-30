// شاشة النوم: بعد «تصبحون على خير 🌙» التايم لاين يتقفل بشاشة ليل ثابتة — الساعة، ومن متى نايم —
// لين تضغط «صباح الخير ☀️»: يطلع الفجر، وينفتح التايم لاين وفوقه لحظة صحيانك وكم نمت
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Animated, AppState, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '@/components/ui';
import { useLocalized } from '@/lib/i18n';
import { errorKey } from '@/lib/supabase';
import { postWakeNow, undoMoment, type OpenSleep } from '@/lib/timeline';
import { clockOf, dateLine, durationText, wakePromptDue } from '@/lib/wakeCore';
import { brand, fonts, radius, space, TAB_BAR_SPACE } from '@/theme';
import { NIGHT } from './Moments';
import { MomentToast } from './PlusMenu';

/** السما بالليل (فوق أغمق)، والفجر لما تضغط «صباح الخير» */
const SKY = ['#120E24', NIGHT] as const;
const DAWN = ['#3A2A58', '#C8603E', brand.amber] as const;

/** نجوم بأماكن ثابتة (نفسها كل مرة) — الثلث منها يلمع */
const STARS = Array.from({ length: 24 }, (_, i) => {
  const r = (n: number) => { const x = Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };
  return { x: Math.round(r(1) * 960) / 10 + 2, y: Math.round(r(2) * 360) / 10 + 2, size: 1.5 + r(3) * 2, o: 0.3 + r(4) * 0.6, tw: i % 3 === 0 };
});

/** «6:05 ص» ← «6:05» و«ص» (الرقم كبير والباقي صغير) */
function splitClock(s: string): [string, string] {
  const i = s.lastIndexOf(' ');
  return i > 0 ? [s.slice(0, i), s.slice(i + 1)] : [s, ''];
}

export interface Woke { id: string; slept: number }

export function SleepScreen({ uid, sleep, onWoke, full }: {
  uid: string; sleep: OpenSleep; onWoke: (w: Woke | null) => void;
  /** يغطي التطبيق كله (فوق كل الصفحات وشريط التبويبات) بدل التايم لاين بس */
  full?: boolean;
}) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const insets = useSafeAreaInsets();
  const native = Platform.OS !== 'web';
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  /** «ما نمت؟» ← نتأكد قبل ما نشيل «تصبحون على خير» */
  const [asking, setAsking] = useState(false);
  const [dawn] = useState(() => new Animated.Value(0));
  const [twinkle] = useState(() => new Animated.Value(0));
  const at = useMemo(() => new Date(sleep.at), [sleep.at]);

  // الساعة تمشي، وترجع صح أول ما ترجع للتطبيق
  useEffect(() => {
    const h = setInterval(() => setNow(new Date()), 15_000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') setNow(new Date()); });
    return () => { clearInterval(h); sub.remove(); };
  }, []);
  useEffect(() => {
    const ease = Easing.inOut(Easing.sin);
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(twinkle, { toValue: 1, duration: 1800, easing: ease, useNativeDriver: native }),
      Animated.timing(twinkle, { toValue: 0, duration: 1800, easing: ease, useNativeDriver: native }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [twinkle, native]);

  // الحركات تنحسب مرة وحدة (لو انبنت من جديد كل مرة ممكن توقف في نصها)
  const look = useMemo(() => ({
    moon: {
      opacity: dawn.interpolate({ inputRange: [0, 0.6], outputRange: [1, 0], extrapolate: 'clamp' }),
      transform: [{ translateY: dawn.interpolate({ inputRange: [0, 1], outputRange: [0, 36] }) }],
    },
    sun: {
      opacity: dawn.interpolate({ inputRange: [0.3, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
      transform: [{ translateY: dawn.interpolate({ inputRange: [0, 1], outputRange: [48, 0] }) }, { scale: dawn.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
    },
    dawn: { opacity: dawn },
    stars: { opacity: dawn.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
    twinkle: { opacity: twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }) },
    pulse: { transform: [{ scale: twinkle.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] }) }] },
  }), [dawn, twinkle]);

  const mins = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 60000));
  const due = wakePromptDue(now, at);
  const [hm, ap] = splitClock(clockOf(now, lng));
  const since = [t('timeline.sleptAt', { time: clockOf(at, lng) })];
  if (mins >= 1) since.push(t('timeline.sleepSoFar', { d: durationText(mins, lng) }));

  const wake = async () => {
    if (busy) return;
    setBusy(true);
    setAsking(false);
    if (native) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // يطلع الفجر أول، وبعدها ينفتح التايم لاين
    await new Promise<void>((done) => {
      Animated.timing(dawn, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start(() => done());
    });
    try {
      const slept = Math.max(0, Math.floor((Date.now() - at.getTime()) / 60000));
      const id = await postWakeNow(uid);
      onWoke(id ? { id, slept } : null);
    } catch (e) {
      Animated.timing(dawn, { toValue: 0, duration: 300, useNativeDriver: native }).start();
      setBusy(false);
      Alert.alert(t(errorKey(e)));
    }
  };

  const undo = async () => {
    if (busy || !sleep.id) return;
    setBusy(true);
    try {
      await undoMoment(uid, sleep.id, 'sleep');
    } catch (e) {
      setBusy(false);
      setAsking(false);
      Alert.alert(t(errorKey(e)));
    }
  };

  return (
    <View style={[styles.wrap, full && styles.wrapFull]}>
      <LinearGradient colors={SKY} style={StyleSheet.absoluteFill} />
      {/* الصبح: ضو خفيف تحت كأنه الفجر */}
      {due ? <LinearGradient colors={['rgba(254,169,79,0)', 'rgba(254,169,79,0.26)']} style={styles.horizon} pointerEvents="none" /> : null}
      <Animated.View style={[StyleSheet.absoluteFill, look.dawn]} pointerEvents="none">
        <LinearGradient colors={DAWN} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, look.stars]} pointerEvents="none">
        {STARS.map((s, i) => (
          <Animated.View key={i} style={[{ position: 'absolute', left: `${s.x}%`, top: `${s.y}%` }, s.tw ? look.twinkle : null]}>
            <View style={{ width: s.size, height: s.size, borderRadius: s.size / 2, backgroundColor: brand.cream, opacity: s.o }} />
          </Animated.View>
        ))}
      </Animated.View>

      <ScrollView showsVerticalScrollIndicator={false} bounces={false}
        contentContainerStyle={[styles.body, full && { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl }]}>
        <View style={styles.orb} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={[styles.glow, { width: 148, height: 148, borderRadius: 74 }]} />
          <View style={[styles.glow, { width: 108, height: 108, borderRadius: 54 }]} />
          <Animated.View style={look.moon}><Ionicons name="moon" size={60} color={brand.sand} /></Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, styles.center, look.sun]}><Ionicons name="sunny" size={76} color={brand.amber} /></Animated.View>
        </View>

        <View style={styles.clockRow} accessible accessibilityLabel={clockOf(now, lng)}>
          <Text style={[styles.clock, { fontFamily: fonts.title }]}>{hm}</Text>
          {ap ? <Text style={[styles.ampm, { fontFamily: fonts.title }]}>{ap}</Text> : null}
        </View>
        <T size="sm" color={brand.sand} center style={{ opacity: 0.85, lineHeight: 22 }}>{dateLine(now, lng)}</T>

        <T size="xl" bold color={brand.cream} center style={{ marginTop: space.lg, lineHeight: 34 }}>
          {t(due ? 'timeline.sleepDueTitle' : 'timeline.sleepTitle')}
        </T>
        <T size="sm" semibold color={brand.sand} center style={{ lineHeight: 22 }}>{since.join(' · ')}</T>
        <T size="sm" color={brand.sand} center style={{ opacity: 0.8, lineHeight: 22, marginTop: space.xs, maxWidth: 320 }}>
          {t(full ? 'timeline.sleepLockedApp' : 'timeline.sleepLocked')}
        </T>

        <Animated.View style={[styles.btnWrap, due && !busy ? look.pulse : null]}>
          <Pressable onPress={wake} disabled={busy} accessibilityRole="button" accessibilityLabel={t('timeline.wakeA11y')}
            accessibilityState={{ busy }}
            style={({ pressed }) => [styles.btn, { backgroundColor: brand.amber, opacity: pressed ? 0.85 : 1 }]}>
            {busy ? <ActivityIndicator color={brand.deepGreen} />
              : <Text style={[styles.btnText, { color: brand.deepGreen, fontFamily: fonts.title }]}>{t('timeline.wakeBtn')}</Text>}
          </Pressable>
        </Animated.View>

        {sleep.id ? (asking ? (
          <View style={styles.ask}>
            <T size="sm" color={brand.cream} center style={{ lineHeight: 22 }}>{t('timeline.undoSleepQ')}</T>
            <View style={{ flexDirection: 'row', gap: space.xl }}>
              <Pressable onPress={undo} disabled={busy} hitSlop={10} accessibilityRole="button">
                <T size="sm" bold color={brand.amber}>{t('timeline.undoSleepYes')}</T>
              </Pressable>
              <Pressable onPress={() => setAsking(false)} disabled={busy} hitSlop={10} accessibilityRole="button">
                <T size="sm" semibold color={brand.sand}>{t('timeline.undoSleepNo')}</T>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={() => setAsking(true)} disabled={busy} hitSlop={10} accessibilityRole="button" style={{ marginTop: space.md }}>
            <T size="sm" color={brand.sand} style={{ textDecorationLine: 'underline', opacity: 0.85 }}>{t('timeline.notSlept')}</T>
          </Pressable>
        )) : null}
      </ScrollView>
    </View>
  );
}

/** بعد «صباح الخير»: «صباح الخير ☀️ نمت 7 ساعات — طلع لأصدقائك» مع تراجع */
export function WokeToast({ uid, woke, onDone }: { uid: string; woke: Woke; onDone: () => void }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  useEffect(() => {
    const h = setTimeout(onDone, 6000);
    return () => clearTimeout(h);
  }, [woke, onDone]);
  const undo = async () => {
    onDone();
    try { await undoMoment(uid, woke.id, 'wake'); } catch (e) { Alert.alert(t(errorKey(e))); }
  };
  // نفس حساب الخادم: أقل من ٢٠ دقيقة ما نكتب كم نمت
  const text = woke.slept >= 20 ? t('timeline.wokeToast', { d: durationText(woke.slept, lng) }) : t('timeline.wokeToastShort');
  return <MomentToast text={text} action={t('timeline.undo')} onAction={undo} />;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: 'hidden', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  wrapFull: { borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  horizon: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' },
  body: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: TAB_BAR_SPACE + space.md, gap: 6 },
  center: { alignItems: 'center', justifyContent: 'center' },
  orb: { width: 148, height: 148, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  glow: { position: 'absolute', backgroundColor: 'rgba(247,223,187,0.07)' },
  clockRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  clock: { color: brand.cream, fontSize: 60, lineHeight: 76 },
  ampm: { color: brand.sand, fontSize: 20, lineHeight: 40, opacity: 0.9 },
  btnWrap: { alignSelf: 'stretch', marginTop: space.xl },
  btn: {
    height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  btnText: { fontSize: 19, lineHeight: 30 },
  ask: { marginTop: space.md, alignItems: 'center', gap: space.sm },
});
