// رسالة جديدة: اختر صديق (أو أحد تتابعون بعض، أو مدربك) وتنفتح المحادثة على طول
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, I18nManager, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RankBadge } from '@/components/social/RankBadge';
import { Avatar, Button, Input, Loading, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { loadFriends } from '@/lib/friends';
import { loadContacts, type Contact, type ContactRelation } from '@/lib/messages';
import { publicUrl } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

const REL_ICON: Record<ContactRelation, keyof typeof Ionicons.glyphMap> = { friend: 'people', mutual: 'swap-horizontal', coach: 'barbell' };
const REL_ORDER: Record<ContactRelation, number> = { friend: 0, coach: 1, mutual: 2 };

export default function NewMessage() {
  const { t } = useTranslation();
  const { userId } = useUser();
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [requests, setRequests] = useState(0);
  const [q, setQ] = useState('');

  useEffect(() => {
    loadContacts().then(setContacts).catch(() => setContacts([]));
    loadFriends(userId).then((f) => setRequests(f.incoming.length)).catch(() => {});
  }, [userId]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (contacts ?? [])
      .filter((c) => !s || c.username.toLowerCase().includes(s) || (c.full_name ?? '').toLowerCase().includes(s))
      .sort((a, b) => REL_ORDER[a.relation ?? 'mutual'] - REL_ORDER[b.relation ?? 'mutual'] || (a.full_name || a.username).localeCompare(b.full_name || b.username));
  }, [contacts, q]);

  const start = (c: Contact) => router.replace({ pathname: '/chat/[id]', params: { id: c.id } });

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: t('chat.newMessage') }} />
      {contacts === null ? <Loading /> : (
        <FlatList
          data={shown}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: space.xxl }}
          ListHeaderComponent={
            <View style={{ gap: space.md, marginBottom: space.xs }}>
              {contacts.length ? (
                <Input value={q} onChangeText={setQ} placeholder={t('chat.searchContacts')} autoCapitalize="none" autoCorrect={false} clearButtonMode="while-editing" />
              ) : null}
              {requests ? (
                <Pressable onPress={() => router.push('/friends')} accessibilityRole="button"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: '#FDEBDD', borderRadius: radius.md, padding: space.md }}>
                  <Ionicons name="person-add" size={18} color={brand.orange} />
                  <T size="sm" semibold style={{ flex: 1 }}>{t('chat.requestsWaiting', { count: requests })}</T>
                  <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={16} color={colors.muted} />
                </Pressable>
              ) : null}
              {contacts.length ? <T size="sm" bold>{t('chat.pickFriend')}</T> : null}
            </View>
          }
          ListEmptyComponent={
            contacts.length ? <T muted center style={{ marginTop: space.lg }}>{t('chat.noMatches')}</T> : (
              <View style={{ gap: space.sm, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.xl, alignItems: 'center' }}>
                <Ionicons name="people-outline" size={32} color={colors.primary} />
                <T bold center>{t('chat.noContactsTitle')}</T>
                <T size="sm" muted center style={{ lineHeight: 21 }}>{t('chat.noContactsBody')}</T>
                <Button icon="person-add-outline" title={t('chat.addFriends')} onPress={() => router.push('/friends')} />
              </View>
            )
          }
          ListFooterComponent={contacts.length ? (
            <Pressable onPress={() => router.push('/friends')} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: space.lg }}>
              <Ionicons name="person-add-outline" size={16} color={colors.primary} />
              <T size="sm" semibold color={colors.primary}>{t('chat.addMoreFriends')}</T>
            </Pressable>
          ) : null}
          renderItem={({ item: c }) => {
            const rel = c.relation ?? 'mutual';
            return (
              <Pressable onPress={() => start(c)} accessibilityRole="button" accessibilityLabel={c.full_name || c.username}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: space.md, opacity: pressed ? 0.85 : 1 })}>
                <Avatar size={46} uri={publicUrl('avatars', c.avatar_url)} name={c.full_name ?? c.username} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <T semibold numberOfLines={1} style={{ flexShrink: 1 }}>{c.full_name || c.username}</T>
                    <RankBadge points={c.points} coach={c.is_coach} small userId={c.id} />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <T size="xs" muted numberOfLines={1} style={{ flexShrink: 1 }}>@{c.username}</T>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 }}>
                      <Ionicons name={REL_ICON[rel]} size={11} color={colors.primary} />
                      <T size="xs" style={{ fontSize: 11 }}>{t(`chat.rel_${rel}`)}</T>
                    </View>
                  </View>
                </View>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="chatbubble" size={16} color={brand.cream} />
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
