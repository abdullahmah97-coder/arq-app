// جولة التعريف: تطلع مرة وحدة بعد ما يخلص تسجيل الحساب الجديد، وتنعاد من «حسابي».
// نسخة للمتدرب (وين تلقى كل شي في التطبيق) ونسخة للشريك (الانضمام والمراجعة والتجربة المجانية).
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo, Animated, Easing, I18nManager, PanResponder, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View,
} from 'react-native';
import { Logo, SaduPattern } from '@/brand/Brand';
import { useFullScreenInsets } from '@/components/FullSafeView';
import { Dots, MiniTabBar, StepArt } from '@/components/tour/TourParts';
import { Button, T } from '@/components/ui';
import { useHiddenParts } from '@/lib/appOwner';
import { useUser } from '@/lib/auth';
import { partnerKind } from '@/lib/partners';
import { markTourDone } from '@/lib/tour';
import { swipeStep, tourSteps, type TourVariant } from '@/lib/tourCore';
import { brand, night, radius, space } from '@/theme';

/** اتجاه الواجهة الفعلي: في الجوال من I18nManager، وفي الويب من اتجاه الصفحة */
const layoutRTL = () => (Platform.OS === 'web'
  ? typeof document !== 'undefined' && document.documentElement.dir === 'rtl'
  : I18nManager.isRTL);

export default function Tour() {
  const { t } = useTranslation();
  const { userId, profile } = useUser();
  const hidden = useHiddenParts();
  const { v } = useLocalSearchParams<{ v?: string }>();
  const ins = useFullScreenInsets();
  const { height } = useWindowDimensions();
  // الشريك (أو اللي اختار يصير شريك وقت التسجيل) يشوف جولة الشركاء أول
  const [variant, setVariant] = useState<TourVariant>(() => (v === 'trainee' || v === 'partner' ? v : partnerKind(profile) ? 'partner' : 'trainee'));
  const steps = useMemo(() => tourSteps(variant, hidden), [variant, hidden]);
  const [i, setI] = useState(0);
  const at = Math.min(i, steps.length - 1);
  const step = steps[at];
  const last = at === steps.length - 1;
  const title = t(`tour.${variant}.${step.id}.title`);
  const body = t(`tour.${variant}.${step.id}.body`);

  // تنحسب «انتهت» بأي طريقة انقفلت: ابدأ أو تخطي أو زر الرجوع في أندرويد
  useEffect(() => () => { void markTourDone(userId); }, [userId]);

  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {}); }, []);
  // قارئ الشاشة يقرأ عنوان كل خطوة لما تتغير
  useEffect(() => { AccessibilityInfo.announceForAccessibility(title); }, [title]);

  const [anim] = useState(() => new Animated.Value(1));
  const [dir, setDir] = useState(1);
  const go = useCallback((next: number) => {
    if (next < 0 || next >= steps.length || next === at) return;
    setDir(next > at ? 1 : -1);
    setI(next);
    Haptics.selectionAsync().catch(() => {});
    if (reduceMotion) return;
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [anim, at, reduceMotion, steps.length]);

  // سحب يمين ويسار بين الخطوات (اتجاهه يتبع لغة التطبيق)
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderRelease: (_e, g) => { const s = swipeStep(g.dx, layoutRTL()); if (s) go(at + s); },
  }), [go, at]);

  const close = () => { if (router.canGoBack()) router.back(); else router.replace('/'); };
  const traineeTour = () => { anim.setValue(1); setVariant('trainee'); setI(0); };

  // الخطوة الجاية تدخل من جهة القراءة: من اليمين بالإنجليزي ومن اليسار بالعربي
  const shift = (layoutRTL() ? -1 : 1) * dir * 28;
  const compact = height < 760;
  return (
    <View style={{ flex: 1, backgroundColor: night.bg }}>
      <StatusBar style="light" />
      <SaduPattern variant="peaks" color={brand.amber} opacity={0.05} />
      <View style={[styles.top, { paddingTop: ins.top + space.sm }]}>
        <Logo variant="mark" height={22} color={brand.amber} />
        {!last ? (
          <Pressable onPress={close} hitSlop={12} accessibilityRole="button" style={styles.skip}>
            <T size="sm" semibold color={night.muted}>{t('ads.skip')}</T>
          </Pressable>
        ) : null}
      </View>

      <View style={{ flex: 1 }} {...pan.panHandlers}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Animated.View style={[styles.body, { opacity: anim, transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [shift, 0] }) }] }]}>
            <StepArt icon={step.icon} size={compact ? 88 : 112} />
            <T size="sm" semibold color={brand.amber} center>{t('onboarding.stepOf', { n: at + 1, total: steps.length })}</T>
            <T size="xxl" bold color={night.text} center style={styles.title}>{title}</T>
            <T color={night.muted} center style={styles.text}>{body}</T>
            {step.tabs?.length ? <View style={styles.bar}><MiniTabBar active={step.tabs} /></View> : null}
            {last && variant === 'trainee' ? <T size="sm" color={night.faint} center style={styles.hint}>{t('tour.hint')}</T> : null}
          </Animated.View>
        </ScrollView>
      </View>

      <View style={[styles.foot, { paddingBottom: ins.bottom + space.lg }]}>
        <Dots n={steps.length} i={at} />
        <View style={styles.buttons}>
          {at > 0 ? (
            <Pressable onPress={() => go(at - 1)} accessibilityRole="button" accessibilityLabel={t('common.back')}
              style={({ pressed }) => [styles.back, { borderColor: night.faint, opacity: pressed ? 0.7 : 1 }]}>
              <T semibold color={night.text}>{t('common.back')}</T>
            </Pressable>
          ) : null}
          <Button style={{ flex: 2 }} title={last ? t('tour.start') : t('common.next')} icon={last ? 'checkmark' : undefined}
            onPress={() => (last ? close() : go(at + 1))} />
        </View>
        {last && variant === 'partner' ? (
          <Pressable onPress={traineeTour} hitSlop={8} accessibilityRole="button" style={styles.alt}>
            <T size="sm" semibold color={brand.amber}>{t('tour.traineeTour')}</T>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl, paddingBottom: space.sm },
  skip: { paddingVertical: 6, paddingHorizontal: 4 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: space.xl, paddingVertical: space.lg },
  body: { alignItems: 'center', gap: space.md },
  title: { lineHeight: 44, marginTop: space.xs },
  text: { lineHeight: 27, maxWidth: 420 },
  bar: { alignSelf: 'stretch', marginTop: space.md },
  hint: { lineHeight: 22, marginTop: space.sm, maxWidth: 360 },
  foot: { paddingHorizontal: space.xl, paddingTop: space.md, gap: space.lg },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  back: { flex: 1, minHeight: 50, borderRadius: radius.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  alt: { alignSelf: 'center', paddingVertical: 4 },
});
