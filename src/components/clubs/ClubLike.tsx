// زر الإعجاب بالنادي (فرع أو سلسلة) مع العدد، وزر الإعجاب بتعليق عضو
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable } from 'react-native';
import { T } from '@/components/ui';
import { errorKey } from '@/lib/supabase';
import { clubLikeState, toggleClubLike, toggleReviewLike, type ClubRef } from '@/lib/trust';
import { brand, colors } from '@/theme';

const HEART = '#E0245E';

/** في واجهة صفحة النادي (خلفية داكنة) */
export function ClubLikeButton({ target }: { target: ClubRef }) {
  const { t } = useTranslation();
  const gymId = 'gymId' in target ? target.gymId : null;
  const chainId = 'chainId' in target ? target.chainId : null;
  const [s, setS] = useState<{ likes: number; liked: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useFocusEffect(useCallback(() => {
    clubLikeState(gymId ? { gymId } : { chainId: chainId! }).then(setS).catch(() => {});
  }, [gymId, chainId]));

  const press = async () => {
    if (!s || busy) return;
    const before = s;
    setS({ likes: s.likes + (s.liked ? -1 : 1), liked: !s.liked });
    setBusy(true);
    try { setS(await toggleClubLike(gymId ? { gymId } : { chainId: chainId! })); }
    catch (e) { setS(before); Alert.alert(t(errorKey(e))); }
    finally { setBusy(false); }
  };

  const liked = !!s?.liked;
  return (
    <Pressable onPress={press} accessibilityRole="button" accessibilityState={{ selected: liked }} accessibilityLabel={t('clubs.like')}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, opacity: pressed ? 0.8 : 1,
        backgroundColor: liked ? brand.cream : 'rgba(248,237,218,0.16)' })}>
      <Ionicons name={liked ? 'heart' : 'heart-outline'} size={15} color={liked ? HEART : brand.cream} />
      <T size="xs" semibold color={liked ? brand.deepGreen : brand.cream}>
        {t(liked ? 'clubs.liked' : 'clubs.like')}{s?.likes ? ` · ${s.likes}` : ''}
      </T>
    </Pressable>
  );
}

/** تحت تعليق عضو: إعجاب مع العدد (ما يقدر يعجب بتعليقه) */
export function ReviewLike({ gymId, reviewer, likes, liked, own }: { gymId: string; reviewer: string; likes: number; liked: boolean; own: boolean }) {
  const { t } = useTranslation();
  const [s, setS] = useState({ likes, liked });
  const [busy, setBusy] = useState(false);
  const press = async () => {
    if (own || busy) return;
    const before = s;
    setS({ likes: s.likes + (s.liked ? -1 : 1), liked: !s.liked });
    setBusy(true);
    try { setS(await toggleReviewLike(gymId, reviewer)); }
    catch (e) { setS(before); Alert.alert(t(errorKey(e))); }
    finally { setBusy(false); }
  };
  if (own && !s.likes) return null;
  return (
    <Pressable onPress={press} disabled={own} hitSlop={8} accessibilityRole="button" accessibilityState={{ selected: s.liked }}
      accessibilityLabel={t('clubs.likeComment')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
      <Ionicons name={s.liked ? 'heart' : 'heart-outline'} size={16} color={s.liked ? HEART : colors.muted} />
      <T size="xs" semibold color={s.liked ? HEART : colors.muted}>{s.likes ? String(s.likes) : t('clubs.like')}</T>
    </Pressable>
  );
}
