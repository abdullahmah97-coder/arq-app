// لوحة إدارة التطبيق: الملاعب والاستوديوهات اللي طلبت تنضم للحجز (اعتماد أو رفض مع سبب)
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { Button, Card, Input, Row, T } from '@/components/ui';
import { clockLabel, pendingVenues, reviewVenue, type Venue } from '@/lib/bookings';
import { useLocalized } from '@/lib/i18n';
import { errorKey } from '@/lib/supabase';
import { space } from '@/theme';
import { VenueCard } from './parts';

export function VenueReviewQueue({ onChange }: { onChange?: () => void }) {
  const { t } = useTranslation();
  const [q, setQ] = useState<Venue[]>([]);
  const load = useCallback(() => { pendingVenues().then(setQ).catch(() => {}); }, []);
  useFocusEffect(load);
  if (!q.length) return null;
  return (
    <Card style={{ gap: space.md }}>
      <T semibold>{t('venue.reviewQueue', { count: q.length })}</T>
      {q.map((v) => <Item key={v.id} v={v} onDone={() => { load(); onChange?.(); }} />)}
    </Card>
  );
}

function Item({ v, onDone }: { v: Venue; onDone: () => void }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const decide = async (d: 'approved' | 'rejected') => {
    if (d === 'rejected' && note.trim().length < 3) return Alert.alert(t('coaching.err_rejectNote'));
    setBusy(true);
    try { await reviewVenue(v.id, d, d === 'rejected' ? note : undefined); onDone(); }
    catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };
  return (
    <View style={{ gap: space.sm }}>
      <VenueCard v={v} onPress={() => {}} />
      <T size="xs" muted>
        {[v.phone, `${clockLabel(v.open_hour * 60, lng)} – ${clockLabel(v.close_hour * 60, lng)}`, v.price_sar != null ? t('book.priceSlot', { n: v.price_sar }) : null].filter(Boolean).join(' · ')}
      </T>
      {rejecting ? (
        <View style={{ gap: space.sm }}>
          <Input value={note} onChangeText={setNote} maxLength={300} multiline placeholder={t('coaching.rejectNotePh')} />
          <Row gap={space.sm}>
            <Button small style={{ flex: 1 }} variant="secondary" title={t('coaching.sendReject')} loading={busy} onPress={() => decide('rejected')} />
            <Button small variant="ghost" title={t('common.cancel')} onPress={() => setRejecting(false)} />
          </Row>
        </View>
      ) : (
        <Row gap={space.sm}>
          <Button small style={{ flex: 1 }} icon="checkmark-circle-outline" title={t('coaching.approve')} loading={busy} onPress={() => decide('approved')} />
          <Button small variant="secondary" title={t('coaching.reject')} onPress={() => setRejecting(true)} />
        </Row>
      )}
    </View>
  );
}
