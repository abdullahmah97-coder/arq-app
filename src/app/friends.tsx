import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { Avatar, Button, Card, Empty, Input, Row, Screen, SectionTitle, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { acceptRequest, loadFriends, removeFriendship, sendRequest, type FriendState, type MiniProfile } from '@/lib/friends';
import { errorKey, publicUrl, supabase } from '@/lib/supabase';
import { space } from '@/theme';

function PersonRow({ p, right }: { p: MiniProfile; right?: React.ReactNode }) {
  return (
    <Row gap={space.md}>
      <Pressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md }}
        onPress={() => router.push({ pathname: '/user/[id]', params: { id: p.id } })}>
        <Avatar uri={publicUrl('avatars', p.avatar_url)} name={p.full_name ?? p.username} />
        <View style={{ flex: 1 }}>
          <T bold numberOfLines={1}>{p.full_name || p.username}</T>
          <T size="xs" muted>@{p.username}</T>
        </View>
      </Pressable>
      {right}
    </Row>
  );
}

export default function Friends() {
  const { t } = useTranslation();
  const { userId } = useUser();
  const [state, setState] = useState<FriendState>({ friends: [], incoming: [], outgoing: [] });
  const [q, setQ] = useState('');
  const [results, setResults] = useState<MiniProfile[]>([]);

  const load = useCallback(() => loadFriends(userId).then(setState), [userId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const search = async (text: string) => {
    setQ(text);
    const s = text.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
    if (s.length < 2) return setResults([]);
    const { data } = await supabase.from('profiles').select('id, username, full_name, avatar_url')
      .ilike('username', `${s}%`).neq('id', userId).limit(20);
    setResults((data ?? []) as MiniProfile[]);
  };

  const run = async (p: PromiseLike<{ error: any }>) => {
    const { error } = await p;
    if (error) Alert.alert(t(errorKey(error)));
    load();
  };

  const known = new Set([
    ...state.friends.map((f) => f.id),
    ...state.incoming.map((f) => f.other.id),
    ...state.outgoing.map((f) => f.other.id),
  ]);

  return (
    <Screen edges={['bottom']}>
      <Input placeholder={`🔎 ${t('friends.search')}`} value={q} onChangeText={search} autoCapitalize="none" autoCorrect={false} />
      {results.length ? (
        <Card style={{ gap: space.md }}>
          {results.map((p) => (
            <PersonRow key={p.id} p={p} right={
              known.has(p.id)
                ? <T size="sm" muted>{state.friends.some((f) => f.id === p.id) ? t('profile.isFriend') : t('friends.requested')}</T>
                : <Button small title={t('friends.add')} icon="person-add" onPress={() => run(sendRequest(userId, p.id))} />
            } />
          ))}
        </Card>
      ) : null}

      {state.incoming.length ? (
        <>
          <SectionTitle title={`${t('friends.requests')} (${state.incoming.length})`} />
          <Card style={{ gap: space.md }}>
            {state.incoming.map((f) => (
              <PersonRow key={f.id} p={f.other} right={
                <Row>
                  <Button small title={t('friends.accept')} onPress={() => run(acceptRequest(f.id))} />
                  <Button small variant="ghost" title={t('friends.decline')} onPress={() => run(removeFriendship(f.id))} />
                </Row>
              } />
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle title={`${t('friends.myFriends')} (${state.friends.length})`} />
      <Card style={{ gap: space.md }}>
        {state.friends.length === 0 ? <Empty text={t('friends.noFriends')} icon="people-outline" /> : null}
        {state.friends.map((p) => <PersonRow key={p.id} p={p} />)}
      </Card>

      {state.outgoing.length ? (
        <Card style={{ gap: space.md }}>
          {state.outgoing.map((f) => (
            <PersonRow key={f.id} p={f.other} right={
              <Button small variant="ghost" title={t('common.cancel')} onPress={() => run(removeFriendship(f.id))} />
            } />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
