// حجز الملاعب والحصص: الأقسام (كورة، بادل، تنس، يوقا، بيلاتس)، الأماكن اللي تحجز فيها من أرك أول، وبعدها المدرجة من مواقعها
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SaduPattern } from '@/brand/Brand';
import { SportIcon, VenueCard } from '@/components/bookings/parts';
import { Button, Empty, Loading, Row, Screen, T } from '@/components/ui';
import { bookableInApp, loadVenues, SPORTS, type Sport, type Venue } from '@/lib/bookings';
import { brand, colors, radius, space } from '@/theme';

export default function Book() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ sport?: string }>();
  const [sport, setSport] = useState<Sport>(SPORTS.includes(params.sport as Sport) ? (params.sport as Sport) : 'padel');
  const [rows, setRows] = useState<Venue[] | null>(null);
  useFocusEffect(useCallback(() => {
    setRows(null);
    loadVenues(sport).then(setRows).catch(() => setRows([]));
  }, [sport]));

  const inApp = (rows ?? []).filter(bookableInApp);
  const listed = (rows ?? []).filter((v) => !bookableInApp(v));
  const open = (v: Venue) => router.push({ pathname: '/book/[id]', params: { id: v.id, sport } });

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('book.title') }} />
      <LinearGradient colors={[brand.green, brand.deepGreen]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.lg, overflow: 'hidden', padding: space.lg, gap: 6 }}>
        <SaduPattern variant="peaks" opacity={0.1} />
        <T size="xs" semibold color={brand.amber}>{t('book.eyebrow')}</T>
        <T size="xl" bold color={brand.cream}>{t('book.title')}</T>
        <T size="sm" color={brand.sand} style={{ lineHeight: 22 }}>{t('book.intro')}</T>
      </LinearGradient>

      <Button variant="secondary" icon="calendar-outline" title={t('book.myBookings')} onPress={() => router.push('/bookings')} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {SPORTS.map((s) => {
          const on = s === sport;
          return (
            <Pressable key={s} onPress={() => setSport(s)} accessibilityRole="button" accessibilityState={{ selected: on }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
                backgroundColor: on ? brand.deepGreen : colors.cardAlt }}>
              <SportIcon sport={s} size={16} color={on ? brand.amber : colors.text} />
              <T size="sm" semibold color={on ? brand.cream : colors.text}>{t(`book.sport_${s}`)}</T>
            </Pressable>
          );
        })}
      </ScrollView>

      {!rows ? <Loading /> : !rows.length ? <Empty icon="calendar-outline" text={t('book.empty')} /> : (
        <>
          {inApp.length ? (
            <View style={{ gap: space.sm }}>
              <Row gap={6}><Ionicons name="flash" size={15} color={brand.orange} /><T semibold>{t('book.inAppTitle')}</T></Row>
              {inApp.map((v) => <VenueCard key={v.id} v={v} onPress={() => open(v)} />)}
            </View>
          ) : (
            <View style={{ backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: space.md, gap: 4 }}>
              <T size="sm" semibold>{t('book.noPartnersYet')}</T>
              <T size="xs" muted style={{ lineHeight: 19 }}>{t('book.noPartnersBody')}</T>
            </View>
          )}
          {listed.length ? (
            <View style={{ gap: space.sm }}>
              <T semibold>{t('book.listedTitle')}</T>
              {listed.map((v) => <VenueCard key={v.id} v={v} onPress={() => open(v)} />)}
            </View>
          ) : null}
        </>
      )}
      <T size="xs" muted center style={{ lineHeight: 19 }}>{t('book.sourceNote')}</T>
      <Pressable onPress={() => router.push('/venues/join')} accessibilityRole="button" style={{ alignSelf: 'center', padding: 6 }}>
        <T size="sm" semibold color={colors.primary}>{t('book.ownVenue')}</T>
      </Pressable>
    </Screen>
  );
}
