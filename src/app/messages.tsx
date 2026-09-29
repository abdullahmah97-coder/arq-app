// صندوق الرسائل: «رسالة جديدة»، أصدقاؤك للبدء بسرعة، والمحادثات بآخر رسالة وغير المقروء
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, I18nManager, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RankBadge } from '@/components/social/RankBadge';
import { Avatar, Button, Row, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { timeAgo } from '@/lib/dates';
import { loadFriends } from '@/lib/friends';
import { useLocalized } from '@/lib/i18n';
import { loadContacts, loadInbox, useIncoming, type Contact, type InboxRow } from '@/lib/messages';
import { publicUrl } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

export default function Messages() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId } = useUser();
  const [rows, setRows] = useState<InboxRow[] | null>(null);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [requests, setRequests] = useState(0);
  const load = useCallback(() => {
    loadInbox().then(setRows).catch(() => setRows([]));
    loadContacts().then(setContacts).catch(() => setContacts([]));
    loadFriends(userId).then((f) => setRequests(f.incoming.length)).catch(() => {});
  }, [userId]);
  useFocusEffect(load);
  useIncoming(userId, useCallback(() => { loadInbox().then(setRows).catch(() => {}); }, []));

  const open = (id: string) => router.push({ pathname: '/chat/[id]', params: { id } });
  const compose = () => router.push('/chat/new');
  // اللي ما بدأت معهم محادثة أول، وبعدهم الباقي
  const started = new Set((rows ?? []).map((r) => r.other_id));
  const quick = [...(contacts ?? [])].sort((a, b) => Number(started.has(a.id)) - Number(started.has(b.id))).slice(0, 20);

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{
        title: t('chat.title'),
        headerRight: () => (
          <Pressable onPress={compose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('chat.newMessage')}
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="create-outline" size={20} color={brand.cream} />
          </Pressable>
        ),
      }} />
      <FlatList
        data={rows ?? []}
        keyExtractor={(r) => r.other_id}
        contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: space.xxl }}
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <Pressable onPress={compose} accessibilityRole="button"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: brand.deepGreen, borderRadius: radius.lg, padding: space.lg, opacity: pressed ? 0.9 : 1 })}>
              <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="chatbubble-ellipses" size={22} color={brand.cream} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T bold color={brand.cream}>{t('chat.newMessage')}</T>
                <T size="xs" color={brand.sand}>{t('chat.newMessageSub')}</T>
              </View>
              <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={brand.cream} />
            </Pressable>

            {requests ? (
              <Pressable onPress={() => router.push('/friends')} accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: '#FDEBDD', borderRadius: radius.md, padding: space.md }}>
                <Ionicons name="person-add" size={18} color={brand.orange} />
                <T size="sm" semibold style={{ flex: 1 }}>{t('chat.requestsWaiting', { count: requests })}</T>
                <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={16} color={colors.muted} />
              </Pressable>
            ) : null}

            {contacts === null ? null : quick.length ? (
              <View style={{ gap: space.sm }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T size="sm" bold>{t('chat.friendsTitle')}</T>
                  <Pressable onPress={compose} hitSlop={8}><T size="sm" semibold color={colors.primary}>{t('chat.seeAll')}</T></Pressable>
                </Row>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md }}>
                  {quick.map((c) => (
                    <Pressable key={c.id} onPress={() => open(c.id)} accessibilityRole="button" accessibilityLabel={c.full_name || c.username}
                      style={{ alignItems: 'center', gap: 4, width: 66 }}>
                      <View style={{ borderWidth: 2, borderColor: started.has(c.id) ? colors.border : brand.orange, borderRadius: 30, padding: 2 }}>
                        <Avatar size={50} uri={publicUrl('avatars', c.avatar_url)} name={c.full_name ?? c.username} />
                      </View>
                      <T size="xs" numberOfLines={1}>{(c.full_name || c.username).split(' ')[0]}</T>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : (
              <View style={{ gap: space.sm, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, alignItems: 'center' }}>
                <Ionicons name="people-outline" size={28} color={colors.primary} />
                <T bold center>{t('chat.noContactsTitle')}</T>
                <T size="sm" muted center style={{ lineHeight: 21 }}>{t('chat.noContactsBody')}</T>
                <Button small icon="person-add-outline" title={t('chat.addFriends')} onPress={() => router.push('/friends')} />
              </View>
            )}

            {rows?.length ? <T size="sm" bold style={{ marginTop: space.xs }}>{t('chat.conversations')}</T> : null}
          </View>
        }
        ListEmptyComponent={rows && contacts?.length ? (
          <View style={{ alignItems: 'center', gap: 6, paddingVertical: space.xl }}>
            <Ionicons name="chatbubbles-outline" size={34} color={colors.muted} />
            <T muted center>{t('chat.emptyWithContacts')}</T>
          </View>
        ) : null}
        ListFooterComponent={
          <Row gap={6} style={{ marginTop: space.lg, paddingHorizontal: space.xs }}>
            <Ionicons name="shield-checkmark-outline" size={15} color={colors.muted} />
            <T size="xs" muted style={{ flex: 1, lineHeight: 18 }}>{t('chat.ruleLong')}</T>
          </Row>
        }
        renderItem={({ item: r }) => (
          <Pressable onPress={() => open(r.other_id)} accessibilityRole="button" accessibilityLabel={r.full_name || r.username}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: r.unread ? brand.orange : colors.border, padding: space.md, opacity: pressed ? 0.85 : 1 })}>
            <Avatar size={50} uri={publicUrl('avatars', r.avatar_url)} name={r.full_name ?? r.username} />
            <View style={{ flex: 1, gap: 2 }}>
              <Row gap={6}>
                <T semibold numberOfLines={1} style={{ flexShrink: 1 }}>{r.full_name || r.username}</T>
                <RankBadge points={r.points} coach={r.is_coach} small />
              </Row>
              <T size="sm" muted={!r.unread} semibold={!!r.unread} numberOfLines={1}>{r.last_from_me ? `${t('chat.you')}: ` : ''}{r.last_body === '📷' ? t('chat.photo') : r.last_body}</T>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <T size="xs" muted>{timeAgo(r.last_at, lng)}</T>
              {r.unread ? (
                <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center' }}>
                  <T size="xs" bold color={brand.cream}>{r.unread}</T>
                </View>
              ) : !r.can_message ? <Ionicons name="lock-closed" size={14} color={colors.muted} /> : null}
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
