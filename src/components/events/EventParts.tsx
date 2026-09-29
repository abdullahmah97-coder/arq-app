// أجزاء البطولات والفعاليات: الصورة (أو تدرج الهوية بأيقونة النوع لو ما فيه صورة) وبطاقة الفعالية في القائمة
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { I18nManager, Pressable, StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { SaduPattern } from '@/brand/Brand';
import { T } from '@/components/ui';
import { useLocalized } from '@/lib/i18n';
import { daysUntil, EVENT_ICON, eventDateLabel, eventImageUrl, eventState, type EventCategory, type LocalEvent } from '@/lib/localEvents';
import { brand, colors, radius, space } from '@/theme';

type Mci = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** ألوان كل نوع (من ألوان الهوية فقط) */
export const EVENT_TINT: Record<EventCategory, [string, string]> = {
  running: [brand.orange, brand.amber],
  horse_racing: [brand.deepGreen, brand.green],
  hiking: [brand.green, brand.amber],
  shooting: [brand.deepGreen, brand.orange],
  boxing: [brand.orange, brand.deepGreen],
  motorsport: [brand.green, brand.deepGreen],
  cycling: [brand.amber, brand.orange],
  football: [brand.green, brand.deepGreen],
  other: [brand.deepGreen, brand.amber],
};

export function EventIcon({ category, size = 20, color = brand.cream }: { category: EventCategory; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={EVENT_ICON[category] as Mci} size={size} color={color} />;
}

/** صورة الفعالية، أو تدرج بأيقونة نوعها */
export function EventArt({ e, style, iconSize = 40 }: { e: Pick<LocalEvent, 'category' | 'image_path'>; style?: StyleProp<ViewStyle>; iconSize?: number }) {
  const url = eventImageUrl(e.image_path);
  if (url) return <Image source={{ uri: url }} style={[{ backgroundColor: brand.deepGreen }, style as StyleProp<ImageStyle>]} contentFit="cover" transition={150} />;
  return (
    <LinearGradient colors={EVENT_TINT[e.category] ?? EVENT_TINT.other} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, style]}>
      <SaduPattern variant="arrows" opacity={0.12} />
      <EventIcon category={e.category} size={iconSize} />
    </LinearGradient>
  );
}

/** «جارية الآن» / «بعد ٣ أيام» / «مستمرة» */
export function useEventBadge() {
  const { t } = useTranslation();
  return (e: LocalEvent): { label: string; hot: boolean } | null => {
    const st = eventState(e);
    if (st === 'now') return { label: t('events.now'), hot: true };
    if (st === 'open') return { label: t('events.open'), hot: false };
    if (st === 'past') return { label: t('events.past'), hot: false };
    if (e.date_note) return null;
    const d = daysUntil(e);
    if (d == null) return null;
    if (d === 0) return { label: t('events.today'), hot: true };
    if (d === 1) return { label: t('events.tomorrow'), hot: true };
    return { label: t('events.inDays', { count: d, n: d }), hot: d <= 7 };
  };
}

export const evTitle = (e: LocalEvent, lng: string) => (lng === 'en' && e.title_en ? e.title_en : e.title);
export const evCity = (e: LocalEvent, lng: string) => (lng === 'en' ? e.city_en || e.city : e.city);
export const evVenue = (e: LocalEvent, lng: string) => (lng === 'en' ? e.venue_en || e.venue : e.venue);
export const evSummary = (e: LocalEvent, lng: string) => (lng === 'en' ? e.summary_en || e.summary : e.summary);

/** صف فعالية في القائمة */
export function EventCard({ e, onPress }: { e: LocalEvent; onPress: () => void }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const badge = useEventBadge()(e);
  const when = eventDateLabel(e, lng);
  const where = [evCity(e, lng), evVenue(e, lng)].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={evTitle(e, lng)}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.88 : 1 }]}>
      <EventArt e={e} style={styles.art} iconSize={34} />
      <View style={{ flex: 1, gap: 4, paddingVertical: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <View style={styles.cat}><EventIcon category={e.category} size={12} color={brand.deepGreen} /><T size="xs" semibold>{t(`events.cat_${e.category}`)}</T></View>
          {badge ? <View style={[styles.badge, badge.hot && { backgroundColor: brand.orange }]}><T size="xs" semibold color={badge.hot ? brand.cream : colors.text}>{badge.label}</T></View> : null}
        </View>
        <T bold numberOfLines={2}>{evTitle(e, lng)}</T>
        {when ? (
          <View style={styles.line}><Ionicons name="calendar-outline" size={13} color={colors.primary} /><T size="xs" semibold color={colors.primary} numberOfLines={1} style={{ flexShrink: 1 }}>{when}</T></View>
        ) : null}
        {where ? (
          <View style={styles.line}><Ionicons name="location-outline" size={13} color={colors.muted} /><T size="xs" muted numberOfLines={1} style={{ flexShrink: 1 }}>{where}</T></View>
        ) : null}
      </View>
      <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.sm },
  art: { width: 84, height: 96, borderRadius: 14 },
  cat: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badge: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
