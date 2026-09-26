import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { Avatar, Button, Card, Input, OptionCard, Row, Screen, Segmented, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { addDays, isoDate } from '@/lib/dates';
import { loadFriends, type MiniProfile } from '@/lib/friends';
import { errorKey, publicUrl, supabase } from '@/lib/supabase';
import type { ChallengeMetric } from '@/lib/types';
import { colors, space } from '@/theme';

export default function NewChallenge() {
  const { t } = useTranslation();
  const { userId } = useUser();
  const [title, setTitle] = useState('');
  const [metric, setMetric] = useState<ChallengeMetric>('checkins');
  const [duration, setDuration] = useState(7);
  const [friends, setFriends] = useState<MiniProfile[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => { loadFriends(userId).then((s) => setFriends(s.friends)); }, [userId]);

  const toggle = (id: string) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const create = async () => {
    if (title.trim().length < 3 || picked.size === 0) return Alert.alert(t('errors.required'));
    setBusy(true);
    try {
      const start = new Date();
      const { data, error } = await supabase.from('challenges').insert({
        creator: userId,
        title: title.trim(),
        metric,
        starts_on: isoDate(start),
        ends_on: isoDate(addDays(start, duration - 1)),
      }).select('id').single();
      if (error) throw error;
      const { error: mErr } = await supabase.from('challenge_members')
        .insert([...picked].map((uid) => ({ challenge_id: data.id, user_id: uid, status: 'invited' })));
      if (mErr) throw mErr;
      router.replace({ pathname: '/challenge/[id]', params: { id: data.id } });
    } catch (e) {
      Alert.alert(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['bottom']}>
      <Input label={t('compete.challengeTitle')} value={title} onChangeText={setTitle} maxLength={80} placeholder="🔥" />
      <T size="sm" muted>{t('compete.metric')}</T>
      {(['checkins', 'workouts', 'steps', 'points'] as const).map((m) => (
        <OptionCard key={m} title={t(`compete.metric_${m}`)} selected={metric === m} onPress={() => setMetric(m)}
          icon={m === 'checkins' ? 'location-outline' : m === 'workouts' ? 'barbell-outline' : m === 'steps' ? 'footsteps-outline' : 'star-outline'} />
      ))}
      <T size="sm" muted>{t('compete.duration')}</T>
      <Segmented value={duration} onChange={setDuration}
        options={[7, 14, 30].map((d) => ({ value: d, label: `${d} ${t('common.days')}` }))} />

      <T size="sm" muted>{t('compete.inviteFriends')}</T>
      {friends.length === 0 ? (
        <Card style={{ gap: space.md }}>
          <T muted center>{t('compete.noFriendsToInvite')}</T>
          <Button title={t('friends.title')} variant="secondary" icon="person-add-outline" onPress={() => router.push('/friends')} />
        </Card>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
          {friends.map((f) => {
            const on = picked.has(f.id);
            return (
              <Pressable key={f.id} onPress={() => toggle(f.id)} style={{ alignItems: 'center', width: 72, gap: 4, opacity: on ? 1 : 0.55 }}>
                <View style={{ borderWidth: 2, borderColor: on ? colors.primary : 'transparent', borderRadius: 30, padding: 2 }}>
                  <Avatar size={50} uri={publicUrl('avatars', f.avatar_url)} name={f.full_name ?? f.username} />
                </View>
                <T size="xs" numberOfLines={1}>{f.full_name?.split(' ')[0] || f.username}</T>
              </Pressable>
            );
          })}
        </View>
      )}
      <Row style={{ marginTop: space.md }}>
        <Button style={{ flex: 1 }} title={t('compete.create')} icon="flash" onPress={create} loading={busy} disabled={friends.length === 0} />
      </Row>
    </Screen>
  );
}
