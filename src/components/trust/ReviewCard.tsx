// تقييم واحد: زائر موثّق، التفاصيل، رد النادي العلني (المدير يرد)، وبلاغ عن تقييم
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { Stars } from '@/components/clubs/parts';
import { RankBadge } from '@/components/social/RankBadge';
import { Avatar, Button, Card, Input, Row, T } from '@/components/ui';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { errorKey, publicUrl } from '@/lib/supabase';
import { FACETS, flagReview, replyToReview, type FullReview } from '@/lib/trust';
import { brand, colors, radius, space } from '@/theme';

export function ReviewCard({ r, gymId, onChanged }: { r: FullReview; gymId: string; onChanged: () => void }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState(r.reply ?? '');
  const [busy, setBusy] = useState(false);
  const facets = FACETS.filter((f) => r.facets[f] != null);

  const sendReply = async () => {
    if (draft.trim().length < 2) return;
    setBusy(true);
    try { await replyToReview(gymId, r.user_id, draft, !!r.reply); setReplying(false); onChanged(); }
    catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };
  const flag = () => Alert.alert(t('trust.flagTitle'), t('trust.flagBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    ...(['fake', 'offensive', 'spam'] as const).map((k) => ({ text: t(`trust.flag_${k}`), onPress: async () => {
      try { await flagReview(gymId, r.user_id, k); Alert.alert(t('trust.flagged')); } catch (e) { Alert.alert(t(errorKey(e))); }
    } })),
  ]);

  return (
    <Card style={{ gap: 6, borderColor: r.is_me ? brand.orange : colors.border }}>
      <Row>
        <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: r.user_id } })}>
          <Avatar size={34} uri={publicUrl('avatars', r.avatar_url)} name={r.full_name ?? r.username} />
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <Row gap={6}>
            <T size="sm" semibold numberOfLines={1} style={{ flexShrink: 1 }}>{r.is_me ? t('presence.you') : r.full_name || r.username}</T>
            <RankBadge points={r.points} small />
          </Row>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <Stars value={r.rating} size={11} />
            <T size="xs" muted>{timeAgo(r.updated_at, lng)}</T>
            {r.visited ? <Row gap={2}><Ionicons name="checkmark-circle" size={12} color={colors.success} /><T size="xs" color={colors.success}>{t('trust.verifiedVisitor')}</T></Row> : null}
          </Row>
        </View>
        {!r.is_me ? <Pressable onPress={flag} hitSlop={10} accessibilityLabel={t('trust.flagTitle')}><Ionicons name="flag-outline" size={15} color={colors.muted} /></Pressable> : null}
      </Row>
      {r.body ? <T style={{ lineHeight: 24 }}>{r.body}</T> : null}
      {facets.length ? (
        <Row gap={10} style={{ flexWrap: 'wrap' }}>
          {facets.map((f) => <T key={f} size="xs" muted>{t(`trust.facet_${f}`)} {r.facets[f]}/5</T>)}
        </Row>
      ) : null}
      {r.reply && !replying ? (
        <View style={{ backgroundColor: colors.bg, borderRadius: radius.md, padding: space.sm, gap: 2, borderStartWidth: 3, borderStartColor: brand.deepGreen }}>
          <T size="xs" semibold>{t('trust.gymReply')}</T>
          <T size="sm" style={{ lineHeight: 22 }}>{r.reply}</T>
        </View>
      ) : null}
      {r.can_reply ? (
        replying ? (
          <View style={{ gap: space.sm }}>
            <Input value={draft} onChangeText={setDraft} multiline maxLength={600} placeholder={t('trust.replyPh')} />
            <Row gap={space.sm}>
              <Button small title={t('trust.publishReply')} loading={busy} onPress={sendReply} />
              <Button small variant="ghost" title={t('common.cancel')} onPress={() => setReplying(false)} />
            </Row>
            <T size="xs" muted>{t('trust.replyRule')}</T>
          </View>
        ) : (
          <Pressable onPress={() => setReplying(true)} hitSlop={6}><T size="xs" semibold color={colors.primary}>{r.reply ? t('trust.editReply') : t('trust.replyAsGym')}</T></Pressable>
        )
      ) : null}
    </Card>
  );
}
