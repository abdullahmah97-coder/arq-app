// مربع «حجز الملاعب والحصص» في الرئيسية تحت المتاجر والبطولات: الأقسام (كورة، بادل، تنس، يوقا، بيلاتس) وحجزك الجاي
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { SaduPattern } from '@/brand/Brand';
import { NT } from '@/components/pulse/widgets';
import { LONG_PRESS_MS, useHomeLongPress } from '@/lib/homeLayout';
import { useLocalized } from '@/lib/i18n';
import { myBookings, nextBooking, SPORTS, whenLabel, type MyBooking } from '@/lib/bookings';
import { brand } from '@/theme';
import { SportIcon } from './parts';

export function HomeBookingTile() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const longPress = useHomeLongPress();
  const [next, setNext] = useState<MyBooking | null>(null);
  useFocusEffect(useCallback(() => {
    let dead = false;
    myBookings().then((r) => { if (!dead) setNext(nextBooking(r)); }).catch(() => {});
    return () => { dead = true; };
  }, []));

  return (
    <Pressable onPress={() => router.push('/book')} onLongPress={longPress} delayLongPress={LONG_PRESS_MS}
      accessibilityRole="button" accessibilityLabel={t('book.title')} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.92 }]}>
      <LinearGradient colors={[brand.green, brand.deepGreen]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <SaduPattern variant="peaks" opacity={0.08} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={styles.icon}><Ionicons name="calendar" size={18} color={brand.deepGreen} /></View>
        <View style={{ flex: 1 }}>
          <NT size={15} bold color={brand.cream}>{t('book.title')}</NT>
          <NT size={11} color={brand.sand} numberOfLines={1}>{t('book.homeSub')}</NT>
        </View>
      </View>
      <View style={styles.row}>
        {SPORTS.map((s) => (
          <Pressable key={s} onPress={() => router.push({ pathname: '/book', params: { sport: s } })} onLongPress={longPress} delayLongPress={LONG_PRESS_MS}
            accessibilityRole="button" accessibilityLabel={t(`book.sport_${s}`)} style={({ pressed }) => [styles.sport, pressed && { opacity: 0.8 }]}>
            <SportIcon sport={s} size={22} color={brand.amber} />
            <NT size={10} semibold color={brand.cream} numberOfLines={1}>{t(`book.sport_${s}`)}</NT>
          </Pressable>
        ))}
      </View>
      {next ? (
        <Pressable onPress={() => router.push('/bookings')} style={styles.next} accessibilityRole="button">
          <Ionicons name={next.status === 'confirmed' ? 'checkmark-circle' : 'time-outline'} size={15} color={brand.deepGreen} />
          <NT size={11} semibold color={brand.deepGreen} numberOfLines={1} style={{ flex: 1 }}>
            {t('book.nextBooking', { what: lng === 'en' ? next.label_en : next.label, when: whenLabel(next.starts_at, lng) })}
          </NT>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: 20, overflow: 'hidden', padding: 14, gap: 12 },
  icon: { width: 34, height: 34, borderRadius: 17, backgroundColor: brand.amber, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 6 },
  sport: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, borderRadius: 14, backgroundColor: 'rgba(248,237,218,0.08)', borderWidth: 1, borderColor: 'rgba(248,237,218,0.14)' },
  next: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: brand.amber, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
});
