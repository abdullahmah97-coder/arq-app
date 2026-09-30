import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { BrandGradient } from '@/brand/Brand';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { publicUrl } from '@/lib/supabase';
import type { FeedPost, WakeMeta } from '@/lib/types';
import { brand, colors, radius, space } from '@/theme';
import { CoachCheck } from './social/RankBadge';
import { Avatar, Card, Row, T } from './ui';

export const PostCard = memo(function PostCard({ post, onLike, onDelete, isMine, detail, verified }: {
  post: FeedPost; onLike: (p: FeedPost) => void; onDelete?: (p: FeedPost) => void; isMine?: boolean; detail?: boolean;
  /** علامة التوثيق ✓ جنب الاسم */
  verified?: boolean;
}) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const img = publicUrl('posts', post.image_path);
  const wake = post.kind === 'wake';

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <Row style={{ padding: space.md }}>
        <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: post.user_id } })}>
          <Avatar uri={publicUrl('avatars', post.avatar_url)} name={post.full_name ?? post.username} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Row gap={4}>
            <T bold numberOfLines={1} style={{ flexShrink: 1 }}>{post.full_name || post.username}</T>
            {verified ? <CoachCheck size={15} /> : null}
          </Row>
          <T size="xs" muted>
            @{post.username} · {timeAgo(post.created_at, lng)}
            {post.gym_name ? ` · 📍 ${t('feed.atGym', { gym: post.gym_name })}` : ''}
          </T>
        </View>
        {isMine && onDelete ? (
          <Pressable hitSlop={10} onPress={() => onDelete(post)} accessibilityRole="button" accessibilityLabel={t('common.delete')}>
            <Ionicons name="trash-outline" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </Row>

      {wake ? <WakeBody meta={post.meta} created={post.created_at} /> : (
        <>
          {img ? <Image source={{ uri: img }} style={{ width: '100%', aspectRatio: 1, backgroundColor: colors.cardAlt }} contentFit="cover" transition={150} /> : null}
          {post.caption ? <T style={{ paddingHorizontal: space.md, paddingTop: space.md }}>{post.caption}</T> : null}
        </>
      )}

      <Row style={{ padding: space.md }} gap={space.lg}>
        <Pressable onPress={() => onLike(post)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('timeline.like')}>
          <Row gap={space.xs}>
            <Ionicons name={post.liked_by_me ? 'heart' : 'heart-outline'} size={22} color={post.liked_by_me ? colors.danger : colors.text} />
            <T size="sm">{post.like_count}</T>
          </Row>
        </Pressable>
        <Pressable disabled={detail} onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })} hitSlop={8}
          accessibilityRole="button" accessibilityLabel={t('timeline.comment')}>
          <Row gap={space.xs}>
            <Ionicons name="chatbubble-outline" size={20} color={colors.text} />
            <T size="sm">{post.comment_count}</T>
          </Row>
        </Pressable>
      </Row>
    </Card>
  );
});

/** وقت على الساعة: ٦:٣٠ ص / 6:30 AM */
export function clockText(iso: string, lng: 'ar' | 'en') {
  const d = new Date(iso);
  try {
    return d.toLocaleTimeString(lng === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

/** «صحى ☀️»: وقت المنبّه، أو «صباح الخير» بوقت فتح التطبيق */
function WakeBody({ meta, created }: { meta?: WakeMeta; created: string }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const time = clockText(meta?.at ?? created, lng);
  const alarm = meta?.src === 'alarm';
  return (
    <BrandGradient name="sand" style={{ marginHorizontal: space.md, borderRadius: radius.md, paddingVertical: space.lg, paddingHorizontal: space.lg }}>
      <Row gap={space.md}>
        <T size="xxl">{alarm ? '⏰' : '☀️'}</T>
        <View style={{ flex: 1, gap: 2 }}>
          <T size="lg" bold color={brand.deepGreen}>{alarm ? t('timeline.woke', { time }) : t('timeline.morning')}</T>
          <T size="sm" color={brand.deepGreen}>{alarm ? t('timeline.wokeSub') : t('timeline.morningSub', { time })}</T>
        </View>
      </Row>
    </BrandGradient>
  );
}

/** تبديل الإعجاب مع تحديث متفائل */
export function toggleLikeLocal(p: FeedPost): FeedPost {
  return { ...p, liked_by_me: !p.liked_by_me, like_count: p.like_count + (p.liked_by_me ? -1 : 1) };
}

export const postImageStyle = { borderRadius: radius.md };
