// حساب مستخدم آخر: متابعة، صداقة، ورتبته وبرامجه ونصائحه
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { gymName } from '@/components/GymPicker';
import { ProfileView } from '@/components/social/ProfileView';
import { Button, Empty, Loading, Row, Screen } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { acceptRequest, relationTo, removeFriendship, sendRequest, type Relation } from '@/lib/friends';
import { useLocalized } from '@/lib/i18n';
import { canMessage } from '@/lib/messages';
import { isAdmin, setCoach } from '@/lib/owner';
import { follow, isFollowing, unfollow, type PublicProfile } from '@/lib/social';
import { errorKey, supabase } from '@/lib/supabase';
import type { Gym } from '@/lib/types';
import { space } from '@/theme';

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId } = useUser();
  const [p, setP] = useState<PublicProfile | null | undefined>(undefined);
  const [gym, setGym] = useState<Gym | null>(null);
  const [rel, setRel] = useState<{ relation: Relation; id?: string }>({ relation: 'none' });
  const [following, setFollowing] = useState(false);
  const [mutual, setMutual] = useState(false);
  const [admin, setAdmin] = useState(false);
  useEffect(() => { isAdmin().then(setAdmin).catch(() => {}); }, []);
  const [busy, setBusy] = useState<'follow' | 'friend' | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
    if (error && !data) return; // بدون إنترنت: نخلي آخر حالة
    setP((data as PublicProfile) ?? null);
    if (data?.gym_id) {
      const { data: g } = await supabase.from('gyms').select('*').eq('id', data.gym_id).single();
      setGym(g as Gym);
    }
    const [r, f, m] = await Promise.all([relationTo(userId, id), isFollowing(userId, id), canMessage(userId, id)]);
    setRel(r); setFollowing(f); setMutual(m);
  }, [id, userId]);

  // عند الرجوع للصفحة (مثلاً بعد قبول طلب الصداقة) تتحدث الأزرار
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (p === undefined) return <Loading />;
  if (!p) return <Screen><Empty icon="person-outline" text={t('errors.userNotFound')} /></Screen>;
  const self = p.id === userId;

  const toggleFollow = async () => {
    setBusy('follow');
    // تحديث متفائل للعداد
    setFollowing(!following);
    setP({ ...p, followers_count: p.followers_count + (following ? -1 : 1) });
    const { error } = following ? await unfollow(userId, p.id) : await follow(userId, p.id);
    setBusy(null);
    if (error) { Alert.alert(t(errorKey(error))); load(); } else canMessage(userId, p.id).then(setMutual);
  };

  const run = async (fn: () => PromiseLike<{ error: any }>) => {
    setBusy('friend');
    const { error } = await fn();
    setBusy(null);
    if (error) Alert.alert(t(errorKey(error)));
    load();
  };

  const friendBtn = (() => {
    switch (rel.relation) {
      case 'none': return <Button variant="secondary" icon="person-add-outline" title={t('profile.addFriend')} loading={busy === 'friend'} onPress={() => run(() => sendRequest(userId, id))} />;
      case 'outgoing': return <Button variant="ghost" title={t('profile.pending')} loading={busy === 'friend'} onPress={() => run(() => removeFriendship(rel.id!))} />;
      case 'incoming': return <Button variant="secondary" title={t('friends.accept')} loading={busy === 'friend'} onPress={() => run(() => acceptRequest(rel.id!))} />;
      case 'friends': return <Button variant="ghost" title={t('profile.isFriend')} onPress={() => Alert.alert(t('friends.removeConfirm'), '', [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('friends.remove'), style: 'destructive', onPress: () => run(() => removeFriendship(rel.id!)) },
      ])} />;
      default: return null;
    }
  })();

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: `@${p.username}` }} />
      <ProfileView p={p} me={userId} gymLabel={gym ? gymName(gym, lng) : null} actions={self ? null : (
        <View style={{ gap: space.sm }}>
        <Row gap={space.md}>
          <View style={{ flex: 1 }}>
            <Button title={following ? t('social.followingBtn') : t('social.follow')} icon={following ? 'checkmark' : 'add'}
              variant={following ? 'secondary' : 'primary'} loading={busy === 'follow'} onPress={toggleFollow} />
          </View>
          <View style={{ flex: 1 }}>{friendBtn}</View>
        </Row>
        <Button variant={mutual ? 'secondary' : 'ghost'} icon={mutual ? 'chatbubble-ellipses-outline' : 'lock-closed-outline'}
          title={mutual ? t('chat.message') : t('chat.lockedShort')}
          onPress={() => (mutual ? router.push({ pathname: '/chat/[id]', params: { id: p.id } }) : Alert.alert(t('chat.lockedTitle'), t('chat.locked', { name: p.full_name || p.username })))} />
        {admin ? (
          <Button variant="ghost" small icon={p.is_coach ? 'close-circle-outline' : 'shield-checkmark-outline'}
            title={p.is_coach ? t('owner.unverifyCoach') : t('owner.verifyCoach')}
            onPress={async () => { try { await setCoach(p.id, !p.is_coach); load(); } catch (e) { Alert.alert(t(errorKey(e))); } }} />
        ) : null}
        </View>
      )} />
    </Screen>
  );
}
