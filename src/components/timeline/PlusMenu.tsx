// زر ＋ الدائري في التايم لاين (فكرة Path): يفتح أربع لحظات على قوس —
// 📷 صورة، “ كلام، 🏋️ دخلت النادي، و🌙 «تصبحون على خير» (التايم لاين يتقفل بشاشة النوم لين «صباح الخير»)
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Animated, BackHandler, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorKey } from '@/lib/supabase';
import { onCheckedIn, postSleepNow } from '@/lib/timeline';
import { brand } from '@/theme';
import { MomentBubble, tap, type MomentKind } from './Moments';

const SIZE = 58;
const ITEM = 48;
const R = 118;

type Key = 'photo' | 'thought' | 'gym' | 'sleep';
const LOOK: Record<Key, { kind: MomentKind; photo?: boolean }> = {
  photo: { kind: 'post', photo: true }, thought: { kind: 'post' }, gym: { kind: 'checkin' }, sleep: { kind: 'sleep' },
};

/** مكان الزر فوق شريط التبويبات العائم */
export const fabBottom = (insetBottom: number) => Math.max(insetBottom, 10) + 64 + 16;

export function PlusMenu() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const uid = session?.user.id;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // رجع من تسجيل الحضور (زر 🏋️): «سجّلت دخولك في …»
  const [gymToast, setGymToast] = useState<{ gym: string; points: number } | null>(null);
  useEffect(() => onCheckedIn((gym, points) => setGymToast({ gym, points })), []);
  useEffect(() => {
    if (!gymToast) return;
    const h = setTimeout(() => setGymToast(null), 5000);
    return () => clearTimeout(h);
  }, [gymToast]);
  const native = Platform.OS !== 'web';
  const [main] = useState(() => new Animated.Value(0));
  const [parts] = useState(() => [0, 1, 2, 3].map(() => new Animated.Value(0)));
  const bottom = fabBottom(insets.bottom);
  // الحركة تنحسب مرة وحدة (لو انبنت من جديد كل مرة ممكن توقف في نصها)
  const itemStyles = useMemo(() => parts.map((p, i) => {
    const ang = (Math.PI / 2) * (i / (parts.length - 1));
    const base = (SIZE - ITEM) / 2;
    return {
      position: 'absolute' as const,
      end: p.interpolate({ inputRange: [0, 1], outputRange: [16 + base, 16 + base + R * Math.sin(ang)] }),
      bottom: p.interpolate({ inputRange: [0, 1], outputRange: [bottom + base, bottom + base + R * Math.cos(ang)] }),
      opacity: p.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
      transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
    };
  }), [parts, bottom]);
  const fabTurn = useMemo(() => ({ transform: [{ rotate: main.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '135deg'] }) }] }), [main]);
  const dim = useMemo(() => ({ opacity: main }), [main]);

  const animate = (to: 0 | 1) => {
    Animated.spring(main, { toValue: to, useNativeDriver: native, friction: 7, tension: 90 }).start();
    Animated.stagger(to ? 40 : 15, (to ? parts : [...parts].reverse()).map((v) =>
      Animated.spring(v, { toValue: to, useNativeDriver: false, friction: 6, tension: 120 }))).start();
  };
  const toggle = (v = !open) => { tap(); setOpen(v); animate(v ? 1 : 0); };

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { toggle(false); return true; });
    return () => sub.remove();
    // toggle يتجدد كل مرة؛ يكفي نربطه لما ينفتح
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // «تصبحون على خير»: التايم لاين يتقفل بشاشة النوم (فيها «صباح الخير» و«ما نمت؟ تراجع»)
  const sleep = async () => {
    if (!uid || busy) return;
    setBusy(true);
    try {
      await postSleepNow(uid);
    } catch (e) {
      Alert.alert(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const actions: { key: Key; label: string; run: () => void }[] = [
    { key: 'photo', label: t('timeline.plusPhoto'), run: () => router.push({ pathname: '/post/new', params: { mode: 'photo' } }) },
    { key: 'thought', label: t('timeline.plusThought'), run: () => router.push({ pathname: '/post/new', params: { mode: 'text' } }) },
    { key: 'gym', label: t('timeline.plusGym'), run: () => router.push({ pathname: '/checkin', params: { from: 'timeline' } }) },
    { key: 'sleep', label: t('timeline.plusSleep'), run: () => { void sleep(); } },
  ];

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View pointerEvents={open ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,31,27,0.42)' }, dim]}>
        <Pressable style={{ flex: 1 }} onPress={() => toggle(false)} accessibilityLabel={t('common.close')} />
      </Animated.View>

      {gymToast ? (
        <MomentToast text={`${t('timeline.checkedInToast', { gym: gymToast.gym })}${gymToast.points ? ` · ${t('timeline.checkedInPoints', { n: gymToast.points })}` : ''}`} />
      ) : null}

      {actions.map((a, i) => (
        <Animated.View key={a.key} pointerEvents={open ? 'auto' : 'none'} style={itemStyles[i]}>
          <Pressable onPress={() => { toggle(false); a.run(); }} accessibilityRole="button" accessibilityLabel={a.label} hitSlop={6}
            style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.9 : 1 }] })}>
            <MomentBubble kind={LOOK[a.key].kind} photo={LOOK[a.key].photo} size={ITEM} ring={brand.cream} />
          </Pressable>
        </Animated.View>
      ))}

      <Pressable onPress={() => toggle()} accessibilityRole="button" accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? t('common.close') : t('timeline.plusA11y')}
        style={({ pressed }) => [styles.fab, { bottom, backgroundColor: brand.orange, borderColor: brand.cream, opacity: pressed ? 0.85 : 1 }]}>
        <Animated.View style={fabTurn}>
          <Ionicons name="add" size={32} color={brand.cream} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

/** شريط تأكيد فوق زر ＋ («سجّلت دخولك في …»، «صباح الخير ☀️ نمت …») مع زر (تراجع) أو ✓ */
export function MomentToast({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.toast, { bottom: fabBottom(insets.bottom) + SIZE + 14, backgroundColor: brand.deepGreen }]} accessibilityLiveRegion="polite">
      <T size="sm" semibold color={brand.cream} style={{ flex: 1 }} numberOfLines={2}>{text}</T>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <T size="sm" bold color={brand.amber}>{action}</T>
        </Pressable>
      ) : <Ionicons name="checkmark-circle" size={20} color={brand.amber} />}
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute', end: 16, width: SIZE, height: SIZE, borderRadius: SIZE / 2,
    alignItems: 'center', justifyContent: 'center', borderWidth: 3,
    elevation: 8, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 5 },
  },
  toast: {
    position: 'absolute', start: 16, end: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12,
    elevation: 10, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
});
