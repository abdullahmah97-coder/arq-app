import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PostCard, toggleLikeLocal } from '@/components/PostCard';
import { Empty, H, IconButton, ProfileButton, Row } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { deletePost, normalizeFeed, setLike } from '@/lib/posts';
import { supabase } from '@/lib/supabase';
import type { FeedPost } from '@/lib/types';
import { colors, space, TAB_BAR_SPACE } from '@/theme';

const PAGE = 20;

export default function Community() {
  const { t } = useTranslation();
  const { userId } = useUser();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async (before?: string) => {
    const { data } = await supabase.rpc('feed', { p_before: before ?? new Date().toISOString(), p_limit: PAGE });
    const rows = normalizeFeed(data);
    setDone(rows.length < PAGE);
    setPosts((prev) => (before ? [...prev, ...rows] : rows));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const like = useCallback(async (p: FeedPost) => {
    setPosts((ps) => ps.map((x) => (x.id === p.id ? toggleLikeLocal(x) : x)));
    const { error } = await setLike(p, userId);
    if (error) setPosts((ps) => ps.map((x) => (x.id === p.id ? p : x)));
  }, [userId]);

  const remove = useCallback((p: FeedPost) => {
    Alert.alert(t('feed.deletePost'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: async () => {
        await deletePost(p);
        setPosts((ps) => ps.filter((x) => x.id !== p.id));
      } },
    ]);
  }, [t]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.sm }}>
        <H>{t('feed.title')}</H>
        <Row gap={space.md}>
          <IconButton icon="person-add-outline" onPress={() => router.push('/friends')} />
          <ProfileButton />
        </Row>
      </Row>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: TAB_BAR_SPACE }}
        renderItem={({ item }) => <PostCard post={item} onLike={like} onDelete={remove} isMine={item.user_id === userId} />}
        ListEmptyComponent={<Empty text={t('feed.emptyFeed')} icon="people-outline" />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        onEndReachedThreshold={0.5}
        onEndReached={() => { if (!done && posts.length) load(posts[posts.length - 1].created_at); }}
      />
      <View style={{ position: 'absolute', bottom: space.xl, end: space.xl }}>
        <Pressable
          onPress={() => router.push('/post/new')}
          style={({ pressed }) => ({
            width: 58, height: 58, borderRadius: 29, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
            opacity: pressed ? 0.8 : 1, elevation: 6, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
          })}
        >
          <Ionicons name="add" size={30} color={colors.onPrimary} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
