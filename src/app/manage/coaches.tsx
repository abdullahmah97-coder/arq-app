// مدربين النادي: اعتماد المدربين اللي يقولون إنهم يدرّبون في الفرع، أو إزالتهم
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { VerifiedBadge } from '@/components/coaching/parts';
import { Avatar, Button, Card, Empty, Loading, Row, Screen, T } from '@/components/ui';
import { approveCoachGym, loadGymCoaches, removeCoachGym, type GymCoach } from '@/lib/coaching';
import { errorKey, publicUrl } from '@/lib/supabase';
import { space } from '@/theme';

export default function ManageCoaches() {
  const { gym, gymId } = useLocalSearchParams<{ gym?: string; gymId?: string }>();
  const g = String(gym ?? gymId ?? '');
  const { t } = useTranslation();
  const [list, setList] = useState<GymCoach[] | null>(null);
  const load = useCallback(() => { loadGymCoaches(g).then(setList).catch(() => setList([])); }, [g]);
  useFocusEffect(load);
  if (list === null) return <Loading />;
  const act = (p: Promise<void>) => p.then(load).catch((e) => Alert.alert(t(errorKey(e))));
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('coaching.gymCoaches') }} />
      <T size="sm" muted>{t('coaching.manageHint')}</T>
      {list.length ? list.map((c) => (
        <Card key={c.user_id} style={{ gap: space.sm }}>
          <Pressable onPress={() => router.push({ pathname: '/coaches/[id]', params: { id: c.user_id } })}>
            <Row>
              <Avatar size={40} uri={publicUrl('avatars', c.avatar_url)} name={c.full_name ?? c.username} />
              <View style={{ flex: 1 }}>
                <Row gap={6}><T semibold>{c.full_name || c.username}</T>{c.verified ? <VerifiedBadge small /> : null}</Row>
                <T size="xs" muted>{c.headline ?? ''}</T>
              </View>
              <T size="xs" muted>{c.status === 'approved' ? t('coaching.gymApproved') : t('coaching.gymPending')}</T>
            </Row>
          </Pressable>
          <Row gap={space.sm}>
            {c.status === 'pending' ? <Button small style={{ flex: 1 }} title={t('coaching.approve')} onPress={() => act(approveCoachGym(c.user_id, g))} /> : null}
            <Button small variant="ghost" title={t('coaching.remove')} onPress={() => act(removeCoachGym(c.user_id, g))} />
          </Row>
        </Card>
      )) : <Empty icon="barbell-outline" text={t('coaching.noGymCoaches')} />}
    </Screen>
  );
}
