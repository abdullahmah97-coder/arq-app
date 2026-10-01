// شاشة النوم: بعد «تصبحون على خير 🌙» التطبيق يتقفل بليل الصحراء — نجوم، وكثبان تحت، وقرص نوم
// يرسم نومك على وجه الساعة (من وقت ما نمت للحين) وفي نصه كم نمت —
// لين تضغط «صباح الخير ☀️»: يطلع الفجر وتشرق الشمس من ورا الكثبان، وينفتح التطبيق وفوقه لحظة صحيانك وكم نمت
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Animated, AppState, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Path, Stop, LinearGradient as SvgGradient, Text as SvgText } from 'react-native-svg';
import { T } from '@/components/ui';
import { useLocalized } from '@/lib/i18n';
import { errorKey } from '@/lib/supabase';
import { postWakeNow, undoMoment, type OpenSleep } from '@/lib/timeline';
import { clockOf, dateLine, durationText, wakePromptDue } from '@/lib/wakeCore';
import { brand, fonts, radius, space, TAB_BAR_SPACE } from '@/theme';
import { NIGHT } from './Moments';
import { MomentToast } from './PlusMenu';

/** السما بالليل (فوق أغمق)، والفجر لما تضغط «صباح الخير» */
const SKY = ['#0D0A1C', '#1B1436', NIGHT] as const;
const DAWN = ['#3A2A58', '#C8603E', brand.amber] as const;
const CREAM = '#F8EDDA';
const SAND = '#F7DFBB';
const LILAC = '#B9A6EC';
const AMBER = '#FEA94F';

/** نجوم بأماكن ثابتة (نفسها كل مرة) — الثلث منها يلمع */
const STARS = Array.from({ length: 34 }, (_, i) => {
  const r = (n: number) => { const x = Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };
  return { x: Math.round(r(1) * 960) / 10 + 2, y: Math.round(r(2) * 560) / 10 + 2, size: 1.2 + r(3) * 2.2, o: 0.25 + r(4) * 0.6, tw: i % 3 === 0 };
});

/** «6:05 ص» ← «6:05» و«ص» (الرقم كبير والباقي أصغر على نفس السطر) */
function splitClock(s: string): [string, string] {
  const i = s.lastIndexOf(' ');
  return i > 0 ? [s.slice(0, i), s.slice(i + 1)] : [s, ''];
}

/** زاوية الوقت على وجه ساعة ١٢ ساعة (من فوق، مع عقارب الساعة) */
const angleOf = (d: Date) => (((d.getHours() % 12) + d.getMinutes() / 60) / 12) * Math.PI * 2;

/** قرص النوم: وجه ساعة فيه قوس من وقت ما نمت للحين، والقمر عند «الحين» */
function SleepDial({ size, at, mins }: { size: number; at: Date; mins: number }) {
  const c = size / 2;
  const R = c - 16;
  const pt = (a: number, r = R) => ({ x: c + r * Math.sin(a), y: c - r * Math.cos(a) });
  const a0 = angleOf(at);
  const sweep = Math.min((mins / 720) * Math.PI * 2, Math.PI * 2 - 0.0001);
  const p0 = pt(a0);
  const p1 = pt(a0 + sweep);
  const arc = `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${R} ${R} 0 ${sweep > Math.PI ? 1 : 0} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <SvgGradient id="sleepArc" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={LILAC} />
          <Stop offset="1" stopColor={AMBER} />
        </SvgGradient>
      </Defs>
      {/* هالة خفيفة ووجه الساعة */}
      <Circle cx={c} cy={c} r={R + 10} fill="rgba(185,166,236,0.05)" />
      <Circle cx={c} cy={c} r={R} stroke="rgba(248,237,218,0.09)" strokeWidth={12} fill="none" />
      {Array.from({ length: 12 }, (_, i) => {
        const p = pt((i / 12) * Math.PI * 2, R - 20);
        const major = i % 3 === 0;
        return <Circle key={i} cx={p.x} cy={p.y} r={major ? 2.2 : 1.3} fill={CREAM} fillOpacity={major ? 0.5 : 0.25} />;
      })}
      {[12, 3, 6, 9].map((h) => {
        const p = pt(((h % 12) / 12) * Math.PI * 2, R - 36);
        return <SvgText key={h} x={p.x} y={p.y + 4} fontSize={11} fill={SAND} fillOpacity={0.4} textAnchor="middle">{h}</SvgText>;
      })}
      {/* نومك: من وقت ما نمت للحين */}
      {mins >= 1 ? <Path d={arc} stroke="url(#sleepArc)" strokeWidth={12} strokeLinecap="round" fill="none" /> : null}
      <Circle cx={p0.x} cy={p0.y} r={4} fill={LILAC} />
      <Circle cx={p1.x} cy={p1.y} r={15} fill={AMBER} fillOpacity={0.16} />
      <Circle cx={p1.x} cy={p1.y} r={8} fill={CREAM} />
    </Svg>
  );
}

/** كثبان الصحراء تحت (ثلاث طبقات، أبعدها أفتح) وعلى حوافها ضو القمر */
function Dunes({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 400 200" preserveAspectRatio="none">
      <Path d="M0 92 C 70 58 150 66 222 92 S 352 74 400 62 L400 200 L0 200 Z" fill="#3B2E66" />
      <Path d="M0 92 C 70 58 150 66 222 92 S 352 74 400 62" stroke={SAND} strokeOpacity={0.22} strokeWidth={1.4} fill="none" />
      <Path d="M0 130 C 80 104 150 108 214 128 S 336 104 400 116 L400 200 L0 200 Z" fill="#2A2050" />
      <Path d="M0 130 C 80 104 150 108 214 128 S 336 104 400 116" stroke={SAND} strokeOpacity={0.16} strokeWidth={1.4} fill="none" />
      <Path d="M0 164 C 96 146 186 172 262 158 S 364 148 400 158 L400 200 L0 200 Z" fill="#1B1436" />
    </Svg>
  );
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
  const { width: winW } = useWindowDimensions();
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
    night: { opacity: dawn.interpolate({ inputRange: [0, 0.7], outputRange: [1, 0.25], extrapolate: 'clamp' }) },
    sun: {
      opacity: dawn.interpolate({ inputRange: [0.15, 0.8], outputRange: [0, 1], extrapolate: 'clamp' }),
      transform: [{ translateY: dawn.interpolate({ inputRange: [0, 1], outputRange: [90, 0] }) }],
    },
    dawn: { opacity: dawn },
    stars: { opacity: dawn.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
    twinkle: { opacity: twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }) },
    pulse: { transform: [{ scale: twinkle.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] }) }] },
  }), [dawn, twinkle]);

  const mins = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 60000));
  const due = wakePromptDue(now, at);
  const [hm, ap] = splitClock(clockOf(now, lng));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const dial = Math.min(winW - space.xl * 2, 280);
  const dunesH = Math.round(Math.min(winW, 500) * 0.56);

  const wake = async () => {
    if (busy) return;
    setBusy(true);
    setAsking(false);
    if (native) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // يطلع الفجر وتشرق الشمس أول، وبعدها ينفتح التطبيق
    await new Promise<void>((done) => {
      Animated.timing(dawn, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start(() => done());
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

  const big = { fontFamily: fonts.display, color: CREAM, fontSize: 54, lineHeight: 64 };
  const unit = { fontFamily: fonts.title, color: SAND, fontSize: 17, lineHeight: 64 };

  return (
    <View style={[styles.wrap, full && styles.wrapFull]}>
      <LinearGradient colors={SKY} style={StyleSheet.absoluteFill} />
      {/* الصبح: ضو خفيف ورا الكثبان كأنه الفجر */}
      {due ? <LinearGradient colors={['rgba(254,169,79,0)', 'rgba(254,169,79,0.22)']} style={styles.horizon} pointerEvents="none" /> : null}
      <Animated.View style={[StyleSheet.absoluteFill, look.dawn]} pointerEvents="none">
        <LinearGradient colors={DAWN} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, look.stars]} pointerEvents="none">
        {STARS.map((s, i) => (
          <Animated.View key={i} style={[{ position: 'absolute', left: `${s.x}%`, top: `${s.y}%` }, s.tw ? look.twinkle : null]}>
            <View style={{ width: s.size, height: s.size, borderRadius: s.size / 2, backgroundColor: CREAM, opacity: s.o }} />
          </Animated.View>
        ))}
      </Animated.View>

      {/* الشمس تشرق من ورا الكثبان، والكثبان قدامها */}
      <View pointerEvents="none" style={[styles.ground, { height: dunesH }]}>
        <Animated.View style={[styles.sun, { bottom: dunesH * 0.42 }, look.sun]}>
          <View style={styles.sunGlow} />
          <View style={styles.sunCore} />
        </Animated.View>
        <Dunes width={winW} height={dunesH} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} bounces={false}
        contentContainerStyle={[styles.body, full
          ? { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl }
          : { paddingTop: space.xl, paddingBottom: TAB_BAR_SPACE + space.md }]}>
        {/* الساعة والتاريخ فوق */}
        <View style={styles.top} accessible accessibilityLabel={`${clockOf(now, lng)}، ${dateLine(now, lng)}`}>
          <Text style={styles.clock}>
            <Text style={{ fontFamily: fonts.display }}>{hm}</Text>
            {ap ? <Text style={[styles.ampm, { fontFamily: fonts.title }]}>{` ${ap}`}</Text> : null}
          </Text>
          <T size="sm" color={SAND} center style={{ opacity: 0.75 }}>{dateLine(now, lng)}</T>
        </View>

        {/* قرص النوم وفي نصه كم نمت، وتحته العنوان */}
        <View style={{ alignItems: 'center', gap: space.lg }}>
        <Animated.View style={[{ width: dial, height: dial, alignSelf: 'center' }, look.night]}
          accessible accessibilityLabel={[t('timeline.sleptAt', { time: clockOf(at, lng) }), mins >= 1 ? t('timeline.sleepSoFar', { d: durationText(mins, lng) }) : t('timeline.justSlept')].join('، ')}>
          <SleepDial size={dial} at={at} mins={mins} />
          <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
            <T size="sm" color={SAND} center style={{ opacity: 0.8 }}>{mins >= 1 ? t('timeline.sleepSoFarLabel') : t('timeline.justSlept')}</T>
            <Text style={{ textAlign: 'center' }}>
              {h ? <Text style={big}>{h}</Text> : null}
              {h ? <Text style={unit}>{` ${t('timeline.hShort')}  `}</Text> : null}
              <Text style={big}>{m}</Text>
              <Text style={unit}>{` ${t('timeline.mShort')}`}</Text>
            </Text>
            <T size="sm" color={LILAC} center>{t('timeline.sinceTime', { time: clockOf(at, lng) })}</T>
          </View>
        </Animated.View>

        <View style={{ alignItems: 'center', gap: 6, paddingHorizontal: space.md }}>
          <T size="xl" bold color={CREAM} center style={{ lineHeight: 34 }}>{t(due ? 'timeline.sleepDueTitle' : 'timeline.sleepTitle')}</T>
          <T size="sm" color={SAND} center style={{ opacity: 0.8, lineHeight: 22, maxWidth: 320 }}>
            {t(full ? 'timeline.sleepLockedApp' : 'timeline.sleepLocked')}
          </T>
        </View>
        </View>

        <View style={{ alignSelf: 'stretch', alignItems: 'center', gap: space.md }}>
          <Animated.View style={[styles.btnWrap, due && !busy ? look.pulse : null]}>
            <Pressable onPress={wake} disabled={busy} accessibilityRole="button" accessibilityLabel={t('timeline.wakeA11y')}
              accessibilityState={{ busy }}
              style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.85 : 1 }]}>
              {busy ? <ActivityIndicator color={brand.deepGreen} />
                : <Text style={[styles.btnText, { color: '#2A1B0A', fontFamily: fonts.title }]}>{t('timeline.wakeBtn')}</Text>}
            </Pressable>
          </Animated.View>

          {sleep.id ? (asking ? (
            <View style={styles.ask}>
              <T size="sm" color={CREAM} center style={{ lineHeight: 22 }}>{t('timeline.undoSleepQ')}</T>
              <View style={{ flexDirection: 'row', gap: space.xl }}>
                <Pressable onPress={undo} disabled={busy} hitSlop={10} accessibilityRole="button">
                  <T size="sm" bold color={AMBER}>{t('timeline.undoSleepYes')}</T>
                </Pressable>
                <Pressable onPress={() => setAsking(false)} disabled={busy} hitSlop={10} accessibilityRole="button">
                  <T size="sm" semibold color={SAND}>{t('timeline.undoSleepNo')}</T>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={() => setAsking(true)} disabled={busy} hitSlop={10} accessibilityRole="button">
              <T size="sm" color={SAND} style={{ textDecorationLine: 'underline', opacity: 0.8 }}>{t('timeline.notSlept')}</T>
            </Pressable>
          )) : null}
        </View>
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
  horizon: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '40%' },
  ground: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sun: { position: 'absolute', alignSelf: 'center', width: 150, height: 150, alignItems: 'center', justifyContent: 'center' },
  sunGlow: { position: 'absolute', width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(254,169,79,0.25)' },
  sunCore: { width: 84, height: 84, borderRadius: 42, backgroundColor: AMBER },
  body: { flexGrow: 1, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl, gap: space.lg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  top: { alignItems: 'center', gap: 2 },
  clock: { color: CREAM, fontSize: 34, lineHeight: 44, textAlign: 'center' },
  ampm: { color: SAND, fontSize: 17 },
  btnWrap: { alignSelf: 'stretch' },
  btn: {
    height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: AMBER,
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  btnText: { fontSize: 19, lineHeight: 30 },
  ask: { alignItems: 'center', gap: space.sm },
});
