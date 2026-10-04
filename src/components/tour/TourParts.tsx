// قطع جولة التعريف: رسمة الخطوة، ونسخة صغيرة من شريط التبويبات، ونقاط التقدّم.
// الألوان تنقرأ وقت الرسم (مو في StyleSheet) عشان تتبع لون التطبيق المختار.
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Logo } from '@/brand/Brand';
import { T, type IconName } from '@/components/ui';
import { useHiddenParts } from '@/lib/appOwner';
import type { TourTab } from '@/lib/tourCore';
import { brand, night } from '@/theme';

type BarTab = Exclude<TourTab, 'ai'>;
const TAB_ICON: Record<BarTab, [IconName, IconName]> = {
  index: ['home-outline', 'home'],
  plan: ['calendar-outline', 'calendar'],
  community: ['people-outline', 'people'],
  compete: ['trophy-outline', 'trophy'],
};
const TAB_LABEL: Record<TourTab, string> = {
  index: 'home.tab', plan: 'plan.title', ai: 'coach.tab', community: 'feed.title', compete: 'compete.title',
};

/** رسمة الخطوة: معيّن الهوية (مثل زر المدرب الذكي) وفيه أيقونة الخطوة */
export function StepArt({ icon, size = 116 }: { icon: string; size?: number }) {
  const glyph = Math.round(size * 0.4);
  return (
    <View style={{ width: size * 1.55, height: size * 1.55, alignItems: 'center', justifyContent: 'center' }}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.rot, { width: size * 1.3, height: size * 1.3, borderRadius: size * 0.26, backgroundColor: brand.orange, opacity: 0.14 }]} />
      <LinearGradient colors={[brand.orange, brand.amber]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }}
        style={[styles.rot, styles.center, { width: size, height: size, borderRadius: size * 0.2, borderWidth: 2, borderColor: brand.amber }]}>
        <View style={{ transform: [{ rotate: '-45deg' }] }}>
          {icon === 'logo'
            ? <Logo variant="mark" height={glyph} color={brand.deepGreen} />
            : <Ionicons name={icon as IconName} size={glyph} color={brand.deepGreen} />}
        </View>
      </LinearGradient>
    </View>
  );
}

/** شريط التبويبات مصغّر: يبرز المكان اللي نشرحه (بنفس ترتيب الشريط الحقيقي وبدون التبويبات المخفية) */
export function MiniTabBar({ active }: { active: TourTab[] }) {
  const { t } = useTranslation();
  const hidden = useHiddenParts();
  const tabs = (['index', 'plan', 'community', 'compete'] as const).filter((n) => n === 'index' || !hidden.has(`tab.${n}`));
  const half = Math.ceil(tabs.length / 2);
  const on = (n: TourTab) => active.includes(n);
  // تبويب واحد: اسمه داخل الشريط مثل الشريط الحقيقي. أكثر من واحد (أو زر المدرب): الأسماء تحت الشريط عشان ما تزحم
  const inline = active.length === 1 && active[0] !== 'ai';
  const item = (n: BarTab) => (
    <View key={n} style={[styles.tab, { backgroundColor: on(n) ? 'rgba(254,169,79,0.16)' : 'transparent' }]}>
      <Ionicons name={TAB_ICON[n][on(n) ? 1 : 0]} size={18} color={on(n) ? brand.amber : night.faint} />
      {on(n) && inline ? <T size="xs" semibold color={brand.amber} numberOfLines={1}>{t(TAB_LABEL[n])}</T> : null}
    </View>
  );
  const ai = on('ai');
  return (
    <View style={styles.barWrap} accessible accessibilityLabel={active.map((n) => t(TAB_LABEL[n])).join(' · ')}>
      <View style={[styles.bar, { backgroundColor: night.bg2, borderColor: 'rgba(254,169,79,0.18)' }]}>
        <View style={styles.side}>{tabs.slice(0, half).map(item)}</View>
        {hidden.has('tab.ai') ? <View style={styles.diamondHit} /> : (
          <View style={styles.diamondHit}>
            <View style={[styles.rot, styles.center, styles.diamond, {
              backgroundColor: brand.orange, opacity: ai || !active.length ? 1 : 0.45, borderColor: ai ? brand.amber : 'transparent',
            }]}>
              <View style={{ transform: [{ rotate: '-45deg' }] }}><Ionicons name="sparkles" size={14} color={brand.cream} /></View>
            </View>
          </View>
        )}
        <View style={styles.side}>{tabs.slice(half).map(item)}</View>
      </View>
      {!inline && active.length ? <T size="xs" semibold color={brand.amber}>{active.map((n) => t(TAB_LABEL[n])).join(' · ')}</T> : null}
    </View>
  );
}

/** نقاط التقدّم: الحالية أطول وبلون الكهرماني */
export function Dots({ n, i }: { n: number; i: number }) {
  return (
    <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: n }, (_, k) => (
        <View key={k} style={{ width: k === i ? 22 : 7, height: 7, borderRadius: 4, backgroundColor: k === i ? brand.amber : night.faint }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  rot: { position: 'absolute', transform: [{ rotate: '45deg' }] },
  center: { alignItems: 'center', justifyContent: 'center' },
  barWrap: { alignSelf: 'stretch', alignItems: 'center', gap: 6 },
  bar: {
    alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', height: 52, borderRadius: 22, borderWidth: 1, paddingHorizontal: 6,
  },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 9, borderRadius: 17 },
  diamondHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  diamond: { width: 30, height: 30, borderRadius: 7, borderWidth: 1.5 },
  dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
