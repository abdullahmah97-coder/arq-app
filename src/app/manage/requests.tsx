// طلبات التجميد والنقل من الأعضاء: موافقة أو رفض مع رد
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { Button, Card, Empty, Input, Loading, Row, Screen, T } from '@/components/ui';
import { decideRequest, loadGymRequests } from '@/lib/gymops';
import { errorKey } from '@/lib/supabase';
import { space } from '@/theme';

export default function Requests() {
  const { gym } = useLocalSearchParams<{ gym: string }>();
  const { t } = useTranslation();
  const [rows, setRows] = useState<any[] | null>(null);
  const [reply, setReply] = useState<Record<string, string>>({});
  const load = useCallback(() => { loadGymRequests(String(gym)).then(setRows).catch(() => setRows([])); }, [gym]);
  useFocusEffect(load);
  const decide = async (id: string, approve: boolean) => {
    try { await decideRequest(id, approve, reply[id] ?? ''); load(); } catch (e) { Alert.alert(t(errorKey(e))); }
  };
  if (rows === null) return <Loading />;
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('gymops.tool_requests') }} />
      {rows.length ? rows.map((r) => (
        <Card key={r.id} style={{ gap: space.sm }}>
          <T semibold>{r.profiles?.full_name || r.profiles?.username}</T>
          <T size="sm">{r.kind === 'freeze' ? t('gymops.reqFreeze', { count: r.days, date: r.from_date }) : t('gymops.reqTransfer')}</T>
          <T size="xs" muted>{r.memberships?.plan_name} · {t('gymops.endsOn', { date: r.memberships?.ends_on })}</T>
          {r.reason ? <T size="sm" muted>«{r.reason}»</T> : null}
          <Input value={reply[r.id] ?? ''} onChangeText={(v) => setReply((x) => ({ ...x, [r.id]: v }))} maxLength={300} placeholder={t('gymops.replyPh')} />
          <Row gap={space.sm}>
            <View style={{ flex: 1 }}><Button small icon="checkmark" title={t('gymops.approve')} onPress={() => decide(r.id, true)} /></View>
            <View style={{ flex: 1 }}><Button small variant="secondary" icon="close" title={t('gymops.reject')} onPress={() => decide(r.id, false)} /></View>
          </Row>
        </Card>
      )) : <Empty icon="checkmark-done-outline" text={t('gymops.noRequests')} />}
    </Screen>
  );
}
