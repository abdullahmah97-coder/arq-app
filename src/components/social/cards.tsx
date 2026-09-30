// بطاقات المحتوى الاجتماعي: النصيحة والبرنامج
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Avatar, Card, Row, T } from '@/components/ui';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import type { Author, Tip, UserProgram } from '@/lib/social';
import { publicUrl } from '@/lib/supabase';
import { getExercise } from '@/three/catalog';
import { brand, colors, radius, space } from '@/theme';
import { RankBadge } from './RankBadge';

const TAG_ICON = { training: 'barbell', nutrition: 'nutrition', recovery: 'moon', mindset: 'bulb' } as const;

export function AuthorRow({ a, sub, right }: { a?: Author; sub?: string; right?: React.ReactNode }) {
  if (!a) return null;
  return (
    <Row>
      <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: a.id } })}>
        <Avatar size={36} uri={publicUrl('avatars', a.avatar_url)} name={a.full_name ?? a.username} />
      </Pressable>
      <View style={{ flex: 1, gap: 2 }}>
        <Row gap={6}>
          <T semibold numberOfLines={1} style={{ flexShrink: 1 }}>{a.full_name || a.username}</T>
          <RankBadge points={a.points} coach={a.is_coach} small userId={a.id} />
        </Row>
        {sub ? <T size="xs" muted numberOfLines={1}>{sub}</T> : null}
      </View>
      {right}
    </Row>
  );
}

export const TipCard = memo(function TipCard({ tip, mine, onLike, onDelete, hideAuthor }: {
  tip: Tip; mine?: boolean; onLike: (t: Tip) => void; onDelete?: (t: Tip) => void; hideAuthor?: boolean;
}) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  return (
    <Card style={{ gap: space.md }}>
      {hideAuthor ? null : <AuthorRow a={tip.author_p} sub={`@${tip.author_p?.username} · ${timeAgo(tip.created_at, lng)}`} />}
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ width: 3, borderRadius: 2, backgroundColor: brand.orange }} />
        <T style={{ flex: 1, lineHeight: 26 }}>{tip.body}</T>
      </View>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={6} style={{ backgroundColor: colors.cardAlt, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Ionicons name={TAG_ICON[tip.tag]} size={13} color={colors.primary} />
          <T size="xs" semibold color={colors.primary}>{t(`social.tag_${tip.tag}`)}</T>
        </Row>
        <Row gap={space.lg}>
          {mine && onDelete ? (
            <Pressable hitSlop={10} onPress={() => onDelete(tip)} accessibilityLabel={t('common.delete')}>
              <Ionicons name="trash-outline" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
          <Pressable hitSlop={10} onPress={() => onLike(tip)} accessibilityLabel={t('social.useful')}>
            <Row gap={4}>
              <Ionicons name={tip.liked ? 'bookmark' : 'bookmark-outline'} size={18} color={tip.liked ? brand.orange : colors.muted} />
              <T size="sm" muted>{tip.likes > 0 ? tip.likes : t('social.useful')}</T>
            </Row>
          </Pressable>
        </Row>
      </Row>
    </Card>
  );
});

export const ProgramCard = memo(function ProgramCard({ p, hideAuthor }: { p: UserProgram; hideAuthor?: boolean }) {
  const { t } = useTranslation();
  const { L } = useLocalized();
  const names = p.days.flatMap((d) => d.exercises).slice(0, 4).map((e) => { const g = getExercise(e.exercise_id); return g ? L(g.name) : e.exercise_id; });
  const total = p.days.reduce((n, d) => n + d.exercises.length, 0);
  return (
    <Card onPress={() => router.push({ pathname: '/program/[id]', params: { id: p.id } })} style={{ gap: space.md, padding: 0, overflow: 'hidden' }}>
      <View style={{ backgroundColor: brand.deepGreen, padding: space.lg, gap: 6 }}>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          <Chip text={t('programs.days', { n: p.days.length, count: p.days.length })} />
          <Chip text={t(`onboarding.level_${p.level}`)} />
          <Chip text={t('social.exercisesN', { n: total, count: total })} />
        </Row>
        <T size="lg" bold color={brand.cream} numberOfLines={2}>{p.title}</T>
        {p.description ? <T size="sm" color={brand.sand} numberOfLines={2}>{p.description}</T> : null}
      </View>
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md }}>
        <T size="xs" muted numberOfLines={1}>{names.join(' · ')}{total > names.length ? ' …' : ''}</T>
        {hideAuthor ? (
          <Row gap={4}><Ionicons name="people-outline" size={15} color={colors.muted} /><T size="xs" muted>{t('social.adoptsN', { n: p.adopts })}</T></Row>
        ) : (
          <AuthorRow a={p.author_p} right={<Row gap={4}><Ionicons name="people-outline" size={15} color={colors.muted} /><T size="xs" muted>{p.adopts}</T></Row>} />
        )}
      </View>
    </Card>
  );
});

function Chip({ text }: { text: string }) {
  return (
    <View style={{ backgroundColor: 'rgba(248,237,218,0.14)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
      <T size="xs" semibold color={brand.cream}>{text}</T>
    </View>
  );
}
