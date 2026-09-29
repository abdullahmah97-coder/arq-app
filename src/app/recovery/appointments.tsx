// مواعيدي في مراكز العلاج الطبيعي والاستشفاء: الحالة والوقت، وإلغاء الموعد
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { StatusPill } from '@/components/partners/parts';
import { Button, Card, Empty, Loading, Row, Screen, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { fmtRiyadh } from '@/lib/coaching';
import { useLocalized } from '@/lib/i18n';
import { closeAppointment, myAppointments, type Appointment } from '@/lib/recovery';
import { errorKey } from '@/lib/supabase';
import { space } from '@/theme';

export default function MyAppointments() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId } = useUser();
  const [list, setList] = useState<Appointment[] | null>(null);
  const load = useCallback(() => { myAppointments(userId).then(setList).catch(() => setList([])); }, [userId]);
  useFocusEffect(load);
  if (!list) return <Loading />;

  const cancel = (a: Appointment) => Alert.alert(t('partners.cancelAppt'), '', [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('partners.cancelAppt'), style: 'destructive', onPress: async () => { try { await closeAppointment(a.id, 'cancelled'); load(); } catch (e) { Alert.alert(t(errorKey(e))); } } },
  ]);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('partners.myAppointments') }} />
      {list.length ? list.map((a) => {
        const c = a.recovery_centers;
        const name = c ? (lng === 'en' && c.name_en ? c.name_en : c.name) : '—';
        return (
          <Card key={a.id} style={{ gap: 6 }}>
            <Row>
              <T semibold style={{ flex: 1 }}>{name}</T>
              <StatusPill status={a.status} label={t(`partners.appt_${a.status}`)} />
            </Row>
            <T size="sm" muted>{a.starts_at ? fmtRiyadh(a.starts_at, lng) : a.preferred || t('partners.anyTime')}</T>
            {a.center_note ? <T size="sm">{a.center_note}</T> : null}
            {a.status === 'requested' || a.status === 'confirmed' ? (
              <View><Button small variant="ghost" title={t('partners.cancelAppt')} onPress={() => cancel(a)} /></View>
            ) : null}
          </Card>
        );
      }) : (
        <View style={{ gap: space.md }}>
          <Empty icon="calendar-outline" text={t('partners.noMyAppointments')} />
          <Button icon="medkit-outline" title={t('recovery.centersTitle')} onPress={() => router.push('/recovery/centers')} />
        </View>
      )}
    </Screen>
  );
}
