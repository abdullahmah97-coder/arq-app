// ملاحظات الأعضاء للفرع: شكاوى واقتراحات وشكر، مع الحالة والرد
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { Button, Card, Empty, Input, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { timeAgo } from '@/lib/dates';
import { loadGymFeedback, replyFeedback } from '@/lib/gymops';
import { useLocalized } from '@/lib/i18n';
import { errorKey } from '@/lib/supabase';
import { colors, space } from '@/theme';

type St = 'new' | 'in_progress' | 'resolved';

export default function GymFeedback() {
  const { gym } = useLocalSearchParams<{ gym: string }>();
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [rows, setRows] = useState<any[] | null>(null);
  const [tab, setTab] = useState<St>('new');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const load = useCallback(() => { loadGymFeedback(String(gym)).then(setRows).catch(() => setRows([])); }, [gym]);
  useFocusEffect(load);
  const act = async (id: string, status: St) => {
    try { await replyFeedback(id, status, draft[id] ?? ''); setDraft((d) => ({ ...d, [id]: '' })); load(); } catch (e) { Alert.alert(t(errorKey(e))); }
  };
  if (rows === null) return <Loading />;
  const shown = rows.filter((r) => r.status === tab);
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('gymops.tool_feedbackIn') }} />
      <Segmented<St> value={tab} onChange={setTab} options={(['new', 'in_progress', 'resolved'] as St[]).map((s) => ({ value: s, label: `${t(`gymops.fbs_${s}`)} (${rows.filter((r) => r.status === s).length})` }))} />
      {shown.length ? shown.map((f) => (
        <Card key={f.id} style={{ gap: space.sm }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T size="xs" semibold color={f.category === 'complaint' ? colors.danger : colors.primary}>{t(`gymops.fb_${f.category}`)}</T>
            <T size="xs" muted>{f.profiles?.full_name || f.profiles?.username} · {timeAgo(f.created_at, lng)}</T>
          </Row>
          <T>{f.body}</T>
          {f.reply ? <T size="sm" muted>{t('gymops.yourReply')}: {f.reply}</T> : null}
          <Input value={draft[f.id] ?? ''} onChangeText={(v) => setDraft((d) => ({ ...d, [f.id]: v }))} maxLength={800} multiline placeholder={t('gymops.replyPh')} />
          <Row gap={space.sm}>
            {f.status !== 'in_progress' ? <Button small variant="secondary" title={t('gymops.markInProgress')} onPress={() => act(f.id, 'in_progress')} /> : null}
            {f.status !== 'resolved' ? <Button small title={t('gymops.markResolved')} onPress={() => act(f.id, 'resolved')} /> : null}
            {f.status === 'resolved' ? <Button small variant="secondary" title={t('gymops.sendReply')} onPress={() => act(f.id, 'resolved')} /> : null}
          </Row>
        </Card>
      )) : <Empty icon="chatbox-outline" text={t('gymops.noFeedback')} />}
    </Screen>
  );
}
