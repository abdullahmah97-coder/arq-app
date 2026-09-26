import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { Avatar, Button, Card, H, Loading, Row, Screen, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { daysBetween } from '@/lib/dates';
import { errorKey, publicUrl, supabase } from '@/lib/supabase';
import type { Challenge, ChallengeStanding } from '@/lib/types';
import { colors, space } from '@/theme';

const MEDAL = [colors.gold, colors.silver, colors.bronze];

export default function ChallengeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { userId, refreshProfile } = useUser();
  const [c, setC] = useState<Challenge | null>(null);
  const [rows, setRows] = useState<ChallengeStanding[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('challenges').select('*').eq('id', id).maybeSingle();
    if (!data) return router.back();
    setC(data as Challenge);
    const { data: st } = await supabase.rpc('challenge_standings', { p_challenge: id });
    setRows(((st ?? []) as ChallengeStanding[]).map((r) => ({ ...r, score: Number(r.score) })));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (!c) return <Loading />;

  const me = rows.find((r) => r.user_id === userId);
  const left = daysBetween(c.ends_on);
  const ended = left < 0;
  const joined = rows.filter((r) => r.status === 'joined');

  const act = async (fn: () => PromiseLike<{ error: any }>, after?: () => void) => {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) return Alert.alert(t(errorKey(error)));
    after?.();
    load();
  };

  const leave = () => Alert.alert(t('compete.leave'), '', [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('compete.leave'), style: 'destructive', onPress: () =>
      act(() => supabase.from('challenge_members').delete().eq('challenge_id', id).eq('user_id', userId), () => router.back()) },
  ]);

  return (
    <Screen edges={['bottom']}>
      <View style={{ gap: space.xs }}>
        <H>{c.title}</H>
        <T muted>{t(`compete.metric_${c.metric}`)} · {c.starts_on} → {c.ends_on}</T>
        <T bold style={{ color: ended ? colors.muted : colors.fire }}>
          {ended ? t('compete.ended') : t('compete.endsIn', { days: left + 1 })}
        </T>
      </View>

      {me?.status === 'invited' ? (
        <Card style={{ gap: space.md, borderColor: colors.fire }}>
          <T bold>{t('compete.pendingInvite')} ⚡</T>
          <Button title={t('compete.join')} onPress={() => act(() => supabase.rpc('join_challenge', { p_challenge: id }))} loading={busy} />
        </Card>
      ) : null}

      <T size="lg" bold>{t('compete.standings')}</T>
      <Card style={{ padding: space.sm }}>
        {rows.map((r, i) => (
          <Row key={r.user_id} gap={space.md} style={{ padding: space.sm, opacity: r.status === 'invited' ? 0.5 : 1 }}>
            <View style={{ width: 26, alignItems: 'center' }}>
              {r.status === 'joined' && i < 3 && r.score > 0
                ? <Ionicons name="medal" size={20} color={MEDAL[i]} />
                : <T muted bold>{i + 1}</T>}
            </View>
            <Avatar size={34} uri={publicUrl('avatars', r.avatar_url)} name={r.username} />
            <View style={{ flex: 1 }}>
              <T bold>{r.user_id === userId ? t('common.you') : `@${r.username}`}</T>
              <T size="xs" muted>{r.status === 'invited' ? t('compete.invited') : t('compete.joined')}</T>
            </View>
            <T bold size="lg" style={{ color: colors.primary }}>{r.score}</T>
          </Row>
        ))}
      </Card>

      <T size="sm" muted center>{t('compete.winner')}</T>

      {ended && !c.settled && joined.length > 1 ? (
        <Button title={t('compete.settle')} icon="trophy" onPress={() => act(() => supabase.rpc('settle_challenge', { p_challenge: id }), refreshProfile)} loading={busy} />
      ) : null}
      {me && c.creator !== userId && !ended ? <Button title={t('compete.leave')} variant="ghost" onPress={leave} /> : null}
    </Screen>
  );
}
