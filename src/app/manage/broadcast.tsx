// إعلان لكل أعضاء الفرع الساريين (مرتين باليوم كحد أقصى)
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { Button, Card, Input, Screen, T } from '@/components/ui';
import { timeAgo } from '@/lib/dates';
import { loadBroadcasts, sendBroadcast } from '@/lib/gymops';
import { useLocalized } from '@/lib/i18n';
import { errorKey } from '@/lib/supabase';
import { space } from '@/theme';

export default function Broadcast() {
  const { gym } = useLocalSearchParams<{ gym: string }>();
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [past, setPast] = useState<any[]>([]);
  const load = useCallback(() => { loadBroadcasts(String(gym)).then(setPast).catch(() => {}); }, [gym]);
  useFocusEffect(load);
  const send = async () => {
    if (title.trim().length < 2 || body.trim().length < 3) return Alert.alert(t('gymops.err_broadcast'));
    setBusy(true);
    try { const n = await sendBroadcast(String(gym), title, body); setTitle(''); setBody(''); load(); Alert.alert(t('gymops.broadcastSent', { count: n })); }
    catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('gymops.tool_broadcast') }} />
      <T size="sm" muted>{t('gymops.broadcastHint')}</T>
      <Input label={t('gymops.bTitle')} value={title} onChangeText={setTitle} maxLength={80} placeholder={t('gymops.bTitlePh')} />
      <Input label={t('gymops.bBody')} value={body} onChangeText={setBody} maxLength={240} multiline placeholder={t('gymops.bBodyPh')} />
      <Button icon="megaphone-outline" title={t('gymops.sendBroadcast')} loading={busy} onPress={send} />
      {past.map((b) => (
        <Card key={b.id} style={{ gap: 4 }}>
          <T semibold>{b.title}</T>
          <T size="sm">{b.body}</T>
          <T size="xs" muted>{t('gymops.reachedN', { count: b.recipients })} · {timeAgo(b.created_at, lng)}</T>
        </Card>
      ))}
      <T size="xs" muted>{t('gymops.broadcastLimit')}</T>
    </Screen>
  );
}
