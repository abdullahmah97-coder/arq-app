// صفحة المنشور: المنشور (صورة أو كلام) أو «صباح الخير ☀️» أو «تصبحون على خير 🌙»، مع التفاعل بالإيموجي
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { BrandGradient } from '@/brand/Brand';
import { useLocalized } from '@/lib/i18n';
import type { ReactionKey, Reactor } from '@/lib/reactions';
import { publicUrl } from '@/lib/supabase';
import type { FeedPost, MomentMeta } from '@/lib/types';
import { clockOf } from '@/lib/wakeCore';
import { brand, colors, radius, space } from '@/theme';
import { CoachCheck } from './social/RankBadge';
import { MomentAvatar, MomentBubble, momentText, NIGHT, ReactionPicker, ReactionPill, ReactorsStrip } from './timeline/Moments';
import { Card, Row, T } from './ui';

export const PostCard = memo(function PostCard({ post, onReact, onReactors, onDelete, isMine }: {
  post: FeedPost;
  onReact: (next: ReactionKey | null) => void;
  onReactors: () => void;
  onDelete?: (p: FeedPost) => void;
  isMine?: boolean;
}) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [picker, setPicker] = useState(false);
  const [now] = useState(() => new Date());
  const img = publicUrl('posts', post.image_path);
  const kind = post.kind ?? 'post';
  const name = post.full_name || post.username;
  const meta: MomentMeta = post.meta ?? {};
  const { headline, sub } = momentText({ item_type: kind, id: post.id, at: post.created_at, meta, gym_name: post.gym_name }, t, lng, now);
  const mine = post.my_reaction ?? null;
  const reactors: Reactor[] = post.reactors ?? [];

  return (
    <Card style={{ padding: 0 }}>
      <Row style={{ padding: space.md, alignItems: 'flex-start' }} gap={space.md}>
        <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: post.user_id } })} accessibilityRole="link" accessibilityLabel={name}>
          <MomentAvatar uri={publicUrl('avatars', post.avatar_url)} name={name} size={44} />
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <Row gap={4}>
            <T bold numberOfLines={1} style={{ flexShrink: 1 }}>{name}</T>
            {post.is_coach ? <CoachCheck size={15} /> : null}
          </Row>
          <T size="xs" muted>@{post.username}{kind === 'post' ? ` · ${sub}` : ''}</T>
        </View>
        {isMine && onDelete ? (
          <Pressable hitSlop={10} onPress={() => onDelete(post)} accessibilityRole="button" accessibilityLabel={t('common.delete')}>
            <Ionicons name="trash-outline" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </Row>

      {kind === 'wake' || kind === 'sleep' ? (
        <MomentBanner kind={kind} headline={headline} sub={sub} />
      ) : (
        <>
          {img ? <Image source={{ uri: img }} style={{ width: '100%', aspectRatio: 1, backgroundColor: colors.cardAlt }} contentFit="cover" transition={150} /> : null}
          {post.caption ? <T style={{ paddingHorizontal: space.md, paddingTop: space.md, lineHeight: 24 }}>{post.caption}</T> : null}
        </>
      )}

      <Row style={{ padding: space.md, justifyContent: 'space-between' }}>
        <ReactorsStrip count={post.like_count} reactors={reactors} comments={post.comment_count} onReactors={onReactors} onComments={() => {}} />
        <ReactionPill value={mine} open={picker} onToggle={() => setPicker((v) => !v)} />
      </Row>
      {picker ? (
        <View style={{ paddingHorizontal: space.md, paddingBottom: space.md }}>
          <ReactionPicker value={mine} onPick={(e) => { setPicker(false); onReact(e === mine ? null : e); }} />
        </View>
      ) : null}
    </Card>
  );
});

/** «صباح الخير ☀️» و«تصبحون على خير 🌙» بشكل كبير في صفحة المنشور */
function MomentBanner({ kind, headline, sub }: { kind: 'wake' | 'sleep'; headline: string; sub: string }) {
  const night = kind === 'sleep';
  const body = (
    <Row gap={space.md}>
      <MomentBubble kind={kind} size={52} ring={night ? NIGHT : brand.cream} />
      <View style={{ flex: 1, gap: 4 }}>
        <T size="lg" bold color={night ? brand.cream : brand.deepGreen}>{headline}</T>
        <T size="sm" color={night ? brand.sand : brand.deepGreen} style={{ lineHeight: 21 }}>{sub}</T>
      </View>
    </Row>
  );
  if (night) {
    return <View style={{ marginHorizontal: space.md, borderRadius: radius.md, padding: space.lg, backgroundColor: NIGHT }}>{body}</View>;
  }
  return (
    <BrandGradient name="sand" style={{ marginHorizontal: space.md, borderRadius: radius.md, padding: space.lg }}>{body}</BrandGradient>
  );
}

/** وقت على الساعة: 6:30 ص / 6:30 AM */
export function clockText(iso: string, lng: 'ar' | 'en') {
  return clockOf(new Date(iso), lng);
}
