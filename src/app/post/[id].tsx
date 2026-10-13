import { useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PostCard } from '@/components/PostCard';
import { ReactionsSheet } from '@/components/timeline/ReactionsSheet';
import { useGuidelinesGate } from '@/components/safety/Guidelines';
import { SafetySheet, type SafetyTarget } from '@/components/safety/SafetySheet';
import { Avatar, IconButton, Loading, Row, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { normalizeFeed } from '@/lib/posts';
import { saveReaction, withReaction, type ReactionKey } from '@/lib/reactions';
import { errorKey, publicUrl, supabase } from '@/lib/supabase';
import type { Comment, FeedPost } from '@/lib/types';
import { colors, font, radius, space } from '@/theme';
import { goBackOrHome } from '@/lib/nav';

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId, profile } = useUser();
  const [post, setPost] = useState<FeedPost | null>(null);
  const [reactorsOpen, setReactorsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [safety, setSafety] = useState<{ target: SafetyTarget; comment?: Comment } | null>(null);
  const gate = useGuidelinesGate();
  // ارتفاع الشريط العلوي الفعلي (يختلف من جوال لجوال) عشان خانة التعليق تطلع فوق الكيبورد بالضبط
  const headerHeight = useHeaderHeight();

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
    if (!(await gate.ensure())) return;
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

  // ضغطة مطوّلة على تعليق: تعليقي ← حذف، تعليق غيري ← بلاغ أو حظر (ولو المنشور لي أقدر أحذفه بعد)
  const onCommentPress = (c: Comment) => {
    if (c.user_id === userId) return removeComment(c);
    setSafety({ target: { type: 'comment', id: c.id, userId: c.user_id, name: c.profiles?.username ? `@${c.profiles.username}` : '' }, comment: c });
  };

  // التفاعل بالإيموجي: تحديث متفائل، ولو فشل نرجع زي ما كان
  const react = async (next: ReactionKey | null) => {
    if (!post) return;
    const prev = post;
    const me = { id: userId, name: profile.full_name || profile.username, avatar: profile.avatar_url ?? null };
    setPost(withReaction({ ...post, my_reaction: post.my_reaction ?? null, reactors: post.reactors ?? [] }, me, next));
    const { error } = await saveReaction({ type: 'post', id: post.id }, userId, prev.my_reaction ?? null, next);
    if (error) setPost(prev);
  };

  if (!post) return <Loading />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
        <FlatList
          data={comments}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: space.lg, gap: space.md }}
          ListHeaderComponent={
            <View style={{ marginBottom: space.md }}>
              <PostCard post={post} onReact={react} onReactors={() => setReactorsOpen(true)}
                onMore={post.user_id === userId ? undefined : () => setSafety({ target: { type: 'post', id: post.id, userId: post.user_id, name: post.full_name || `@${post.username}` } })} />
            </View>
          }
          renderItem={({ item }) => (
            <Pressable onLongPress={() => onCommentPress(item)} delayLongPress={350}
              accessibilityHint={item.user_id === userId ? undefined : t('safety.longPressHint')}>
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
      {reactorsOpen ? <ReactionsSheet target={{ type: 'post', id: post.id }} onClose={() => setReactorsOpen(false)} /> : null}
      <SafetySheet target={safety?.target ?? null} onClose={() => setSafety(null)}
        extra={safety?.comment && post.user_id === userId ? [{ key: 'del', label: t('common.delete'), icon: 'trash-outline', destructive: true,
          onPress: () => { const c = safety.comment!; setSafety(null); setTimeout(() => removeComment(c), Platform.OS === 'ios' ? 450 : 60); } }] : undefined}
        onBlocked={(uid) => { if (uid === post.user_id) goBackOrHome(); else load(); }} />
      {gate.modal}
    </SafeAreaView>
  );
}
