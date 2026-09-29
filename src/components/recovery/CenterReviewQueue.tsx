// لوحة المالك: مراكز العلاج الطبيعي والاستشفاء اللي طلبت تنضم للدليل (اعتماد أو رفض مع سبب)
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { Button, Card, Input, Row, T } from '@/components/ui';
import { CenterCard } from '@/components/recovery/parts';
import { loadCenterRequests, reviewCenter, type RecoveryCenter } from '@/lib/recovery';
import { errorKey } from '@/lib/supabase';
import { space } from '@/theme';

export function CenterReviewQueue() {
  const { t } = useTranslation();
  const [q, setQ] = useState<RecoveryCenter[]>([]);
  const load = useCallback(() => { loadCenterRequests().then(setQ).catch(() => {}); }, []);
  useFocusEffect(load);
  if (!q.length) return null;
  return (
    <Card style={{ gap: space.md }}>
      <T semibold>{t('recovery.reviewQueue', { count: q.length })}</T>
      {q.map((c) => <Item key={c.id} c={c} onDone={load} />)}
    </Card>
  );
}

function Item({ c, onDone }: { c: RecoveryCenter; onDone: () => void }) {
  const { t } = useTranslation();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const decide = async (d: 'approved' | 'rejected') => {
    if (d === 'rejected' && note.trim().length < 3) return Alert.alert(t('coaching.err_rejectNote'));
    setBusy(true);
    try { await reviewCenter(c.id, d, d === 'rejected' ? note : undefined); onDone(); }
    catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };
  return (
    <View style={{ gap: space.sm }}>
      <CenterCard c={c} />
      <T size="xs" muted>{t('recovery.license')}: {c.license_no || '—'}</T>
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
