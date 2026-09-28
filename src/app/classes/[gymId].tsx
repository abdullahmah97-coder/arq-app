// حصص النادي للأسبوع: احجز مقعدك أو ادخل قائمة الانتظار، وألغِ قبل الموعد
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { Button, Card, Empty, Loading, Row, Screen, T } from '@/components/ui';
import { bookClass, cancelBooking, loadSchedule, type ClassSlot } from '@/lib/gymops';
import { errorKey } from '@/lib/supabase';
import { brand, colors, space } from '@/theme';

export default function GymClasses() {
  const { gymId } = useLocalSearchParams<{ gymId: string }>();
  const { t } = useTranslation();
  const [slots, setSlots] = useState<ClassSlot[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => { loadSchedule(String(gymId), 14).then(setSlots).catch(() => setSlots([])); }, [gymId]);
  useFocusEffect(load);
  const days = t('weekdays', { returnObjects: true }) as string[];

  const act = async (s: ClassSlot) => {
    const key = `${s.class_id}${s.class_date}`;
    setBusy(key);
    try {
      if (s.my_booking) await cancelBooking(s.my_booking);
      else { const r = await bookClass(s.class_id, s.class_date); Alert.alert(r === 'booked' ? t('gymops.booked') : t('gymops.waitlisted')); }
      load();
    } catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(null); }
  };

  if (slots === null) return <Loading />;
  const byDay = slots.reduce<Record<string, ClassSlot[]>>((a, s) => { (a[s.class_date] ||= []).push(s); return a; }, {});
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('gymops.classes') }} />
      {Object.keys(byDay).length ? Object.entries(byDay).map(([date, list]) => (
        <View key={date} style={{ gap: space.sm }}>
          <T bold>{days[new Date(`${date}T12:00:00`).getDay()]} · {date}</T>
          {list.map((s) => {
            const full = s.booked >= s.capacity;
            return (
              <Card key={`${s.class_id}${date}`} style={{ gap: 6 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <T semibold>{s.name}</T>
                    <T size="xs" muted>{s.start_time.slice(0, 5)} · {t('gymops.minutesN', { count: s.duration_min })}{s.coach_name ? ` · ${s.coach_name}` : ''} · {t(`clubs.aud_${s.audience}`)}</T>
                  </View>
                  <T size="xs" semibold color={full ? brand.orange : colors.success}>{full ? t('gymops.full') : t('gymops.seatsLeft', { count: s.capacity - s.booked })}</T>
                </Row>
                {s.my_status ? <T size="xs" semibold color={colors.primary}>{s.my_status === 'waitlist' ? t('gymops.onWaitlist') : t('gymops.youreIn')}</T> : null}
                <Button small variant={s.my_booking ? 'secondary' : 'primary'} loading={busy === `${s.class_id}${s.class_date}`}
                  title={s.my_booking ? t('gymops.cancelBooking') : full ? t('gymops.joinWaitlist') : t('gymops.book')} onPress={() => act(s)} />
              </Card>
            );
          })}
        </View>
      )) : <Empty icon="calendar-outline" text={t('gymops.noClassesSoon')} />}
    </Screen>
  );
}
