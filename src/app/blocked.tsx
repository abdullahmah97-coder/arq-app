// اللي حظرتهم: ترفع الحظر من هنا (الصداقة والمتابعة ما ترجع تلقائياً)
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { Avatar, Button, Card, Empty, Loading, Row, Screen, T } from '@/components/ui';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { listBlocks, unblockUser, type BlockedUser } from '@/lib/safety';
import { errorKey, publicUrl } from '@/lib/supabase';
import { space } from '@/theme';

export default function Blocked() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [list, setList] = useState<BlockedUser[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => { listBlocks().then(setList).catch(() => setList([])); }, []);
  useFocusEffect(load);

  const unblock = (u: BlockedUser) => {
    const name = u.full_name || u.username;
    Alert.alert(t('safety.unblockQ', { name }), t('safety.unblockExplain'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('safety.unblock'), onPress: async () => {
        setBusy(u.user_id);
        try { await unblockUser(u.user_id); setList((x) => (x ?? []).filter((y) => y.user_id !== u.user_id)); }
        catch (e) { Alert.alert(t(errorKey(e))); }
        finally { setBusy(null); }
      } },
    ]);
  };

  if (!list) return <Loading />;
  return (
    <Screen edges={['bottom']}>
      <T size="sm" muted style={{ lineHeight: 21 }}>{t('safety.blockedListHint')}</T>
      {!list.length ? <Empty icon="shield-checkmark-outline" text={t('safety.blockedListEmpty')} /> : list.map((u) => (
        <Card key={u.user_id} style={{ paddingVertical: space.sm }}>
          <Row gap={space.md}>
            <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: u.user_id } })} accessibilityRole="link"
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 }}>
              <Avatar size={40} uri={publicUrl('avatars', u.avatar_url)} name={u.full_name || u.username} />
              <View style={{ flex: 1 }}>
                <T semibold numberOfLines={1}>{u.full_name || u.username}</T>
                <T size="xs" muted numberOfLines={1}>@{u.username} · {timeAgo(u.blocked_at, lng)}</T>
              </View>
            </Pressable>
            <Button small variant="secondary" title={t('safety.unblock')} loading={busy === u.user_id} onPress={() => unblock(u)} />
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
