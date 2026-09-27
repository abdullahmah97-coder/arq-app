// صندوق الرسائل: المحادثات + الأشخاص اللي تقدر تراسلهم (متابعة متبادلة)
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RankBadge } from '@/components/social/RankBadge';
import { Avatar, Empty, Row, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { loadContacts, loadInbox, useIncoming, type Contact, type InboxRow } from '@/lib/messages';
import { publicUrl } from '@/lib/supabase';
import { brand, colors, space } from '@/theme';

export default function Messages() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId } = useUser();
  const [rows, setRows] = useState<InboxRow[] | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const load = useCallback(() => {
    loadInbox().then(setRows).catch(() => setRows([]));
    loadContacts().then(setContacts).catch(() => {});
  }, []);
  useFocusEffect(load);
  useIncoming(userId, useCallback(() => { loadInbox().then(setRows); }, []));

  const open = (id: string) => router.push({ pathname: '/chat/[id]', params: { id } });
  const fresh = contacts.filter((c) => !(rows ?? []).some((r) => r.other_id === c.id));

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={rows ?? []}
        keyExtractor={(r) => r.other_id}
        contentContainerStyle={{ padding: space.lg, gap: space.sm }}
        ListHeaderComponent={
          <View style={{ gap: space.sm, marginBottom: space.md }}>
            <Row gap={6} style={{ backgroundColor: colors.cardAlt, borderRadius: 12, padding: space.md }}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
              <T size="xs" style={{ flex: 1, lineHeight: 19 }}>{t('chat.ruleLong')}</T>
            </Row>
            {fresh.length ? (
              <>
                <T size="sm" bold>{t('chat.startWith')}</T>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md }}>
                  {fresh.map((c) => (
                    <Pressable key={c.id} onPress={() => open(c.id)} style={{ alignItems: 'center', gap: 4, width: 64 }}>
                      <Avatar size={52} uri={publicUrl('avatars', c.avatar_url)} name={c.full_name ?? c.username} />
                      <T size="xs" numberOfLines={1}>{(c.full_name || c.username).split(' ')[0]}</T>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : null}
            {rows?.length ? <T size="sm" bold>{t('chat.conversations')}</T> : null}
          </View>
        }
        ListEmptyComponent={rows ? <Empty icon="chatbubbles-outline" text={contacts.length ? t('chat.emptyWithContacts') : t('chat.empty')} /> : null}
        renderItem={({ item: r }) => (
          <Pressable onPress={() => open(r.other_id)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: r.unread ? brand.orange : colors.border, padding: space.md, opacity: pressed ? 0.85 : 1 })}>
            <Avatar size={48} uri={publicUrl('avatars', r.avatar_url)} name={r.full_name ?? r.username} />
            <View style={{ flex: 1, gap: 2 }}>
              <Row gap={6}>
                <T semibold numberOfLines={1} style={{ flexShrink: 1 }}>{r.full_name || r.username}</T>
                <RankBadge points={r.points} coach={r.is_coach} small />
              </Row>
              <T size="sm" muted={!r.unread} semibold={!!r.unread} numberOfLines={1}>{r.last_from_me ? `${t('chat.you')}: ` : ''}{r.last_body}</T>
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
