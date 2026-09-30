// قائمة المتابِعين / المتابَعين
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RankBadge } from '@/components/social/RankBadge';
import { Avatar, Empty, Row, T } from '@/components/ui';
import { loadFollows, type Author } from '@/lib/social';
import { publicUrl } from '@/lib/supabase';
import { colors, space } from '@/theme';

export default function Follows() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: string }>();
  const k = kind === 'following' ? 'following' : 'followers';
  const { t } = useTranslation();
  const [list, setList] = useState<Author[] | null>(null);
  useEffect(() => { loadFollows(String(id), k).then(setList).catch(() => setList([])); }, [id, k]);

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: t(k === 'followers' ? 'social.followers' : 'social.following') }} />
      <FlatList
        data={list ?? []}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: space.lg, gap: space.sm }}
        ListEmptyComponent={list ? <Empty icon="people-outline" text={t(k === 'followers' ? 'social.noFollowers' : 'social.noFollowing')} /> : null}
        renderItem={({ item: a }) => (
          <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: a.id } })}
            style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: space.md }}>
            <Row>
              <Avatar size={44} uri={publicUrl('avatars', a.avatar_url)} name={a.full_name ?? a.username} />
              <Row gap={2} style={{ flex: 1, flexDirection: 'column', alignItems: 'flex-start' }}>
                <T semibold numberOfLines={1}>{a.full_name || a.username}</T>
                <T size="xs" muted>@{a.username}</T>
              </Row>
              <RankBadge points={a.points} coach={a.is_coach} small userId={a.id} />
            </Row>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
