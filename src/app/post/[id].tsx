import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PostCard, toggleLikeLocal } from '@/components/PostCard';
import { Avatar, IconButton, Loading, Row, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { normalizeFeed, setLike } from '@/lib/posts';
import { errorKey, publicUrl, supabase } from '@/lib/supabase';
import type { Comment, FeedPost } from '@/lib/types';
import { colors, font, radius, space } from '@/theme';
import { goBackOrHome } from '@/lib/nav';

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId } = useUser();
  const [post, setPost] = useState<FeedPost | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('feed', { p_post: id, p_limit: 1 });
    const p = normalizeFeed(data)[0];
    if (!p) { goBackOrHome(); return; }
    setPost(p);
    const { data: cs } = await supabase.from('comments')
      .select('*, profiles(username, avatar_url)').eq('post_id', id).order('created_at');
    setComments((cs ?? []) as Comment[]);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    const { error } = await supabase.from('comments').insert({ post_id: id, user_id: userId, body });
    setSending(false);
    if (error) return Alert.alert(t(errorKey(error)));
    setText('');
    load();
  };

  const removeComment = (c: Comment) =>
    Alert.alert(t('common.delete'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: async () => { await supabase.from('comments').delete().eq('id', c.id); load(); } },
    ]);

  if (!post) return <Loading />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <FlatList
          data={comments}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: space.lg, gap: space.md }}
          ListHeaderComponent={
            <View style={{ marginBottom: space.md }}>
              <PostCard detail post={post} onLike={async (p) => { setPost(toggleLikeLocal(p)); await setLike(p, userId); }} />
            </View>
          }
          renderItem={({ item }) => (
            <Pressable onLongPress={() => (item.user_id === userId || post.user_id === userId) && removeComment(item)}>
              <Row style={{ alignItems: 'flex-start' }}>
                <Avatar size={32} uri={publicUrl('avatars', item.profiles?.avatar_url)} name={item.profiles?.username} />
                <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: radius.md, padding: space.sm }}>
                  <T size="xs" muted>@{item.profiles?.username} · {timeAgo(item.created_at, lng)}</T>
                  <T>{item.body}</T>
                </View>
              </Row>
            </Pressable>
          )}
        />
        <Row style={{ padding: space.md, borderTopWidth: 1, borderTopColor: colors.border }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('feed.writeComment')}
            placeholderTextColor={colors.muted}
            maxLength={500}
            style={{ flex: 1, color: colors.text, backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: 10, fontSize: font.md, textAlign: 'auto' }}
          />
          <IconButton icon="send" color={sending ? colors.muted : colors.primary} onPress={send} />
        </Row>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
