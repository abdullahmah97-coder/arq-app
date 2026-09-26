import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { publicUrl } from '@/lib/supabase';
import type { FeedPost } from '@/lib/types';
import { colors, radius, space } from '@/theme';
import { Avatar, Card, Row, T } from './ui';

export const PostCard = memo(function PostCard({ post, onLike, onDelete, isMine, detail }: {
  post: FeedPost; onLike: (p: FeedPost) => void; onDelete?: (p: FeedPost) => void; isMine?: boolean; detail?: boolean;
}) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const img = publicUrl('posts', post.image_path);

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <Row style={{ padding: space.md }}>
        <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: post.user_id } })}>
          <Avatar uri={publicUrl('avatars', post.avatar_url)} name={post.full_name ?? post.username} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <T bold>{post.full_name || post.username}</T>
          <T size="xs" muted>
            @{post.username} · {timeAgo(post.created_at, lng)}
            {post.gym_name ? ` · 📍 ${t('feed.atGym', { gym: post.gym_name })}` : ''}
          </T>
        </View>
        {isMine && onDelete ? (
          <Pressable hitSlop={10} onPress={() => onDelete(post)}>
            <Ionicons name="trash-outline" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </Row>

      {img ? <Image source={{ uri: img }} style={{ width: '100%', aspectRatio: 1, backgroundColor: colors.cardAlt }} contentFit="cover" transition={150} /> : null}
      {post.caption ? <T style={{ paddingHorizontal: space.md, paddingTop: space.md }}>{post.caption}</T> : null}

      <Row style={{ padding: space.md }} gap={space.lg}>
        <Pressable onPress={() => onLike(post)} hitSlop={8}>
          <Row gap={space.xs}>
            <Ionicons name={post.liked_by_me ? 'heart' : 'heart-outline'} size={22} color={post.liked_by_me ? colors.danger : colors.text} />
            <T size="sm">{post.like_count}</T>
          </Row>
        </Pressable>
        <Pressable disabled={detail} onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })} hitSlop={8}>
          <Row gap={space.xs}>
            <Ionicons name="chatbubble-outline" size={20} color={colors.text} />
            <T size="sm">{post.comment_count}</T>
          </Row>
        </Pressable>
      </Row>
    </Card>
  );
});

/** تبديل الإعجاب مع تحديث متفائل */
export function toggleLikeLocal(p: FeedPost): FeedPost {
  return { ...p, liked_by_me: !p.liked_by_me, like_count: p.like_count + (p.liked_by_me ? -1 : 1) };
}

export const postImageStyle = { borderRadius: radius.md };
