// حجوزاتي: القادمة (مع الإلغاء، الاتصال بالمكان، والطريق) والسابقة
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, View } from 'react-native';
import { BookingStatusPill, SportIcon } from '@/components/bookings/parts';
import { Button, Card, Empty, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { ACTIVE_STATUSES, cancelBooking, clockLabel, myBookings, riyadhMinute, whenLabel, type MyBooking } from '@/lib/bookings';
import { useLocalized } from '@/lib/i18n';
import { errorKey } from '@/lib/supabase';
import { colors, space } from '@/theme';

export default function Bookings() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [rows, setRows] = useState<MyBooking[] | null>(null);
  const [tab, setTab] = useState<'next' | 'past'>('next');
  const [now, setNow] = useState(() => Date.now());
  const load = useCallback(() => { setNow(Date.now()); myBookings().then(setRows).catch(() => setRows([])); }, []);
  useFocusEffect(load);

  if (!rows) return <Loading />;
  const upcoming = (b: MyBooking) => ACTIVE_STATUSES.includes(b.status) && Date.parse(b.ends_at) > now;
  const shown = rows.filter((b) => (tab === 'next') === upcoming(b));

  const cancel = (b: MyBooking) => Alert.alert(t('book.cancelConfirm'), `${lng === 'en' ? b.label_en : b.label} · ${whenLabel(b.starts_at, lng)}`, [
    { text: t('common.back'), style: 'cancel' },
    { text: t('book.cancel'), style: 'destructive', onPress: async () => { try { await cancelBooking(b.id); load(); } catch (e) { Alert.alert(t(errorKey(e))); } } },
  ]);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('book.myBookings') }} />
      <Segmented<'next' | 'past'> value={tab} onChange={setTab} options={[
        { value: 'next', label: t('book.tab_next') }, { value: 'past', label: t('book.tab_past') },
      ]} />
      {!shown.length ? (
        <View style={{ gap: space.md }}>
          <Empty icon="calendar-outline" text={t(tab === 'next' ? 'book.noUpcoming' : 'book.noPast')} />
          {tab === 'next' ? <Button icon="search" title={t('book.findPlace')} onPress={() => router.push('/book')} /> : null}
        </View>
      ) : shown.map((b) => (
        <Card key={b.id} style={{ gap: space.sm }}>
          <Row style={{ alignItems: 'flex-start' }} gap={space.md}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
              <SportIcon sport={b.sport} size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <T bold numberOfLines={1}>{lng === 'en' && b.venue_name_en ? b.venue_name_en : b.venue_name}</T>
              <T size="sm">{lng === 'en' ? b.label_en : b.label}</T>
              <T size="sm" semibold color={colors.primary}>{whenLabel(b.starts_at, lng)} – {clockLabel(riyadhMinute(b.ends_at), lng)}</T>
              {b.price_sar != null ? <T size="xs" muted>{t('book.priceAtVenue', { n: b.price_sar })}</T> : null}
              {b.venue_note ? <T size="xs" muted>{t('book.venueSays', { note: b.venue_note })}</T> : null}
            </View>
            <BookingStatusPill status={b.status} />
          </Row>
          {b.status === 'pending' && upcoming(b) ? <T size="xs" muted>{t('book.donePendingHint')}</T> : null}
          {upcoming(b) ? (
            <Row gap={space.sm}>
              {b.maps_url ? <Button small style={{ flex: 1 }} variant="secondary" icon="navigate-outline" title={t('book.directions')} onPress={() => Linking.openURL(b.maps_url!).catch(() => {})} /> : null}
              {b.phone ? <Button small style={{ flex: 1 }} variant="secondary" icon="call-outline" title={t('book.call')} onPress={() => Linking.openURL(`tel:${b.phone!.replace(/\s/g, '')}`).catch(() => {})} /> : null}
              {Date.parse(b.starts_at) > now ? <Button small variant="ghost" icon="close" title={t('book.cancel')} onPress={() => cancel(b)} /> : null}
            </Row>
          ) : (
            <Button small variant="secondary" icon="repeat" title={t('book.again')} onPress={() => router.push({ pathname: '/book/[id]', params: { id: b.venue_id, sport: b.sport } })} />
          )}
        </Card>
      ))}
      <Row gap={6} style={{ justifyContent: 'center' }}>
        <Ionicons name="notifications-outline" size={14} color={colors.muted} />
        <T size="xs" muted>{t('book.reminderNote')}</T>
      </Row>
    </Screen>
  );
}
