// شريط تبويب عائم (الملف الشخصي من صورة الحساب أعلى الشاشات)
// الزر الماسي في المنتصف = مدرب ARQ الذكي (كبسولة داكنة) مع زر "النبض" الماسي في المنتصف — مستوحى من شكل الماسة في شعار ARQ
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { OwnerPartSheet, useOwnerMode } from '@/components/owner/Hideable';
import type { IconName } from '@/components/ui';
import { useHiddenParts } from '@/lib/appOwner';
import { brand, fonts } from '@/theme';

/** المساحة التي يجب تركها أسفل المحتوى حتى لا يغطيه الشريط */
export { TAB_BAR_SPACE } from '@/theme';

const ICONS: Record<string, [IconName, IconName]> = {
  index: ['home-outline', 'home'],
  plan: ['calendar-outline', 'calendar'],
  community: ['people-outline', 'people'],
  compete: ['trophy-outline', 'trophy'],
};

function Tab({ label, icon, active, onPress, onLongPress, off }: {
  label: string; icon: [IconName, IconName]; active: boolean; onPress: () => void;
  /** المالك: ضغطة مطوّلة تخفي التبويب عن الكل أو ترجّعه */
  onLongPress?: () => void; off?: boolean;
}) {
  const [a] = useState(() => new Animated.Value(active ? 1 : 0));
  useEffect(() => { Animated.spring(a, { toValue: active ? 1 : 0, useNativeDriver: false, friction: 8 }).start(); }, [active, a]);
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={600} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={label} hitSlop={6}
      style={off ? { opacity: 0.35 } : undefined}>
      <Animated.View style={[styles.tab, { backgroundColor: a.interpolate({ inputRange: [0, 1], outputRange: ['rgba(254,169,79,0)', 'rgba(254,169,79,0.16)'] }) }]}>
        <Ionicons name={active ? icon[1] : icon[0]} size={21} color={active ? brand.amber : 'rgba(248,237,218,0.62)'} />
        {active ? <Text numberOfLines={1} style={styles.label}>{label}</Text> : null}
      </Animated.View>
    </Pressable>
  );
}

export function PulseTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const { t } = useTranslation();
  const aiLabel = t('coach.tab');
  // التبويبات اللي أخفاها المالك ما تطلع للمستخدمين (الرئيسية ما تنخفي)، وعند المالك تطلع باهتة
  const owner = useOwnerMode();
  const parts = useHiddenParts();
  const off = (name: string) => name !== 'index' && parts.has(`tab.${name}`);
  const [menu, setMenu] = useState<{ id: string; label: string } | null>(null);
  const routes = state.routes.filter((r) => r.name in ICONS && (owner || !off(r.name)));
  const aiOff = parts.has('tab.ai');
  const half = Math.ceil(routes.length / 2);
  const [glow] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1400, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(glow, { toValue: 0, duration: 1400, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [glow]);

  const render = (r: (typeof routes)[number]) => {
    const i = state.routes.indexOf(r);
    const { options } = descriptors[r.key];
    const active = state.index === i;
    return (
      <Tab key={r.key} label={String(options.title ?? r.name)} icon={ICONS[r.name]} active={active} off={off(r.name)}
        onLongPress={owner && r.name !== 'index' ? () => setMenu({ id: `tab.${r.name}`, label: String(options.title ?? r.name) }) : undefined}
        onPress={() => {
          const e = navigation.emit({ type: 'tabPress', target: r.key, canPreventDefault: true });
          if (!active && !e.defaultPrevented) navigation.navigate(r.name, r.params);
        }} />
    );
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={[styles.bar, { backgroundColor: brand.deepGreen + 'F5' }]}>
        <View style={styles.side}>{routes.slice(0, half).map(render)}</View>
        {aiOff && !owner ? <View style={styles.centerHit} /> : (
        <Pressable onPress={() => router.push('/coach')} onLongPress={owner ? () => setMenu({ id: 'tab.ai', label: aiLabel }) : undefined} delayLongPress={600}
          accessibilityLabel={aiLabel} style={[styles.centerHit, aiOff && { opacity: 0.35 }]}>
          <Animated.View style={[styles.halo, { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] }), transform: [{ rotate: '45deg' }, { scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] }]} />
          <View style={styles.diamond}>
            <View style={{ transform: [{ rotate: '-45deg' }], alignItems: 'center' }}>
              <Ionicons name="sparkles" size={20} color={brand.cream} />
              <Text style={styles.ai}>AI</Text>
            </View>
          </View>
        </Pressable>
        )}
        <View style={styles.side}>{routes.slice(half).map(render)}</View>
      </View>
      {owner && menu ? <OwnerPartSheet id={menu.id} label={menu.label} visible onClose={() => setMenu(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14 },
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(6,31,27,0.96)', borderRadius: 26, height: 64, paddingHorizontal: 8,
    borderWidth: 1, borderColor: 'rgba(254,169,79,0.18)',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12,
  },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 42, paddingHorizontal: 11, borderRadius: 21 },
  ai: { color: brand.cream, fontFamily: 'Noah-Bold', fontSize: 10, lineHeight: 12, marginTop: -1 },
  label: { color: brand.amber, fontFamily: fonts.semibold, fontSize: 12, lineHeight: 20 },
  centerHit: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', marginTop: -30 },
  halo: { position: 'absolute', width: 54, height: 54, borderRadius: 12, backgroundColor: brand.orange },
  diamond: {
    width: 50, height: 50, borderRadius: 11, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center',
    transform: [{ rotate: '45deg' }], borderWidth: 2, borderColor: brand.amber,
  },
});
