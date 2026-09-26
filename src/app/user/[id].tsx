import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { gymName } from '@/components/GymPicker';
import { Avatar, Button, Card, Loading, Row, Screen, Stat, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { acceptRequest, relationTo, removeFriendship, sendRequest, type Relation } from '@/lib/friends';
import { useLocalized } from '@/lib/i18n';
import { errorKey, publicUrl, supabase } from '@/lib/supabase';
import type { Gym, Profile } from '@/lib/types';
import { colors, space } from '@/theme';

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId } = useUser();
  const [p, setP] = useState<Profile | null>(null);
  const [gym, setGym] = useState<Gym | null>(null);
  const [rel, setRel] = useState<{ relation: Relation; id?: string }>({ relation: 'none' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('id', id).single();
    setP(data as Profile);
    if (data?.gym_id) {
      const { data: g } = await supabase.from('gyms').select('*').eq('id', data.gym_id).single();
      setGym(g as Gym);
    }
    setRel(await relationTo(userId, id));
  }, [id, userId]);

  useEffect(() => { load(); }, [load]);

  if (!p) return <Loading />;

  const run = async (fn: () => PromiseLike<{ error: any }>) => {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) Alert.alert(t(errorKey(error)));
    load();
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: `@${p.username}` }} />
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Avatar size={96} uri={publicUrl('avatars', p.avatar_url)} name={p.full_name ?? p.username} />
        <T size="xl" bold>{p.full_name || p.username}</T>
        <T muted>@{p.username}{gym ? ` · 📍 ${gymName(gym, lng)}` : ''}</T>
        {p.bio ? <T center>{p.bio}</T> : null}
      </View>

      <Row gap={space.md}>
        <Stat icon="star" label={t('home.points')} value={p.points} />
        <Stat icon="flame" color={colors.fire} label={t('home.streak')} value={p.streak} />
        <Stat icon="ribbon" color={colors.gold} label={t('profile.bestStreak')} value={p.best_streak} />
      </Row>

      <Card>
        {rel.relation === 'none' && <Button title={t('profile.addFriend')} icon="person-add" loading={busy} onPress={() => run(() => sendRequest(userId, id))} />}
        {rel.relation === 'outgoing' && <Button title={`${t('profile.pending')} · ${t('common.cancel')}`} variant="ghost" loading={busy} onPress={() => run(() => removeFriendship(rel.id!))} />}
        {rel.relation === 'incoming' && <Button title={t('friends.accept')} loading={busy} onPress={() => run(() => acceptRequest(rel.id!))} />}
        {rel.relation === 'friends' && (
          <Button title={t('profile.isFriend')} variant="secondary" onPress={() => Alert.alert(t('friends.removeConfirm'), '', [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('friends.remove'), style: 'destructive', onPress: () => run(() => removeFriendship(rel.id!)) },
          ])} />
        )}
      </Card>
    </Screen>
  );
}
