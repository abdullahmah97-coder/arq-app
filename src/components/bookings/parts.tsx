// أجزاء حجز الملاعب والحصص: أيقونة الرياضة، صورة المكان (أو تدرج بأيقونة)، بطاقة المكان، وحالة الحجز
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { I18nManager, Pressable, StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { SaduPattern } from '@/brand/Brand';
import { T } from '@/components/ui';
import { useLocalized } from '@/lib/i18n';
import { bookableInApp, SPORT_ICON, venueCity, venueImageUrl, venueName, type BookingStatus, type Sport, type Venue } from '@/lib/bookings';
import { brand, colors, radius, space } from '@/theme';

type Mci = ComponentProps<typeof MaterialCommunityIcons>['name'];

export const SPORT_TINT: Record<Sport, [string, string]> = {
  football: [brand.green, brand.deepGreen],
  padel: [brand.orange, brand.amber],
  tennis: [brand.deepGreen, brand.green],
  yoga: [brand.amber, brand.orange],
  pilates: [brand.deepGreen, brand.orange],
};

export function SportIcon({ sport, size = 18, color = brand.cream }: { sport: Sport; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={SPORT_ICON[sport] as Mci} size={size} color={color} />;
}

export function VenueArt({ v, style, iconSize = 34 }: { v: Pick<Venue, 'sports' | 'image_path'>; style?: StyleProp<ViewStyle>; iconSize?: number }) {
  const url = venueImageUrl(v.image_path);
  if (url) return <Image source={{ uri: url }} style={[{ backgroundColor: brand.deepGreen }, style as StyleProp<ImageStyle>]} contentFit="cover" transition={150} />;
  const s = v.sports[0] ?? 'padel';
  return (
    <LinearGradient colors={SPORT_TINT[s]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, style]}>
      <SaduPattern variant="arrows" opacity={0.12} />
      <SportIcon sport={s} size={iconSize} />
    </LinearGradient>
  );
}

/** ألوان حالة الحجز */
export const STATUS_TINT: Record<BookingStatus, { bg: string; fg: string }> = {
  pending: { bg: brand.amber, fg: brand.deepGreen },
  confirmed: { bg: '#2E8B57', fg: '#fff' },
  declined: { bg: '#B0B0B0', fg: '#fff' },
  cancelled: { bg: '#B0B0B0', fg: '#fff' },
  done: { bg: brand.deepGreen, fg: brand.cream },
  no_show: { bg: brand.orange, fg: '#fff' },
};
export function BookingStatusPill({ status }: { status: BookingStatus }) {
  const { t } = useTranslation();
  const c = STATUS_TINT[status];
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <T size="xs" semibold color={c.fg}>{t(`book.st_${status}`)}</T>
    </View>
  );
}

/** صف مكان في القائمة */
export function VenueCard({ v, onPress }: { v: Venue; onPress: () => void }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const inApp = bookableInApp(v);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={venueName(v, lng)}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.88 : 1 }]}>
      <VenueArt v={v} style={styles.art} />
      <View style={{ flex: 1, gap: 4 }}>
        <T bold numberOfLines={2}>{venueName(v, lng)}</T>
        <View style={styles.line}><Ionicons name="location-outline" size={13} color={colors.muted} /><T size="xs" muted numberOfLines={1} style={{ flexShrink: 1 }}>{venueCity(v, lng)}</T></View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
          {v.sports.map((s) => (
            <View key={s} style={styles.chip}><SportIcon sport={s} size={12} color={brand.deepGreen} /><T size="xs" semibold>{t(`book.sport_${s}`)}</T></View>
          ))}
          {v.audience && v.audience !== 'mixed' ? <View style={styles.chip}><T size="xs" semibold>{t(`book.aud_${v.audience}`)}</T></View> : null}
        </View>
        <View style={[styles.badge, inApp ? { backgroundColor: brand.orange } : null]}>
          <Ionicons name={inApp ? 'flash' : 'open-outline'} size={11} color={inApp ? brand.cream : colors.text} />
          <T size="xs" semibold color={inApp ? brand.cream : colors.text}>{inApp ? t('book.inApp') : t('book.onTheirSite')}</T>
        </View>
      </View>
      <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.sm },
  art: { width: 84, height: 104, borderRadius: 14 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
