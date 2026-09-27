// صفحة النادي: التقييم وتوزيعه، العروض والأسعار، والتعليقات (مع «زار النادي ✓»)
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, Pressable, View } from 'react-native';
import { BrandGradient, SaduPattern } from '@/brand/Brand';
import { ClubLogo, OfferCard, Stars } from '@/components/clubs/parts';
import { gymName } from '@/components/GymPicker';
import { Num } from '@/components/pulse/widgets';
import { RankBadge } from '@/components/social/RankBadge';
import { Avatar, Button, Card, Empty, Loading, Row, Screen, T } from '@/components/ui';
import { canManageGym, loadClubs, loadOffers, loadReviews, ratingBars, type Club, type Offer, type Review } from '@/lib/clubs';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { publicUrl } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

export default function ClubPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [club, setClub] = useState<Club | null | undefined>(undefined);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [manage, setManage] = useState(false);

  useFocusEffect(useCallback(() => {
    loadClubs().then((cs) => {
      const c = cs.find((x) => x.id === id) ?? null;
      setClub(c);
      loadOffers({ gymId: String(id), chainId: c?.chain_id }).then(setOffers).catch(() => {});
    }).catch(() => setClub(null));
    loadReviews(String(id)).then(setReviews).catch(() => {});
    canManageGym(String(id)).then(setManage).catch(() => {});
  }, [id]));

  if (club === undefined) return <Loading />;
  if (!club) return <Screen><Empty text={t('clubs.notFound')} /></Screen>;
  const avg = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0;
  const bars = ratingBars(reviews);
  const mine = reviews.find((r) => r.is_me);
  const mapsUrl = Platform.OS === 'ios' ? `https://maps.apple.com/?ll=${club.lat},${club.lng}&q=${encodeURIComponent(club.name)}` : `https://www.google.com/maps/search/?api=1&query=${club.lat},${club.lng}`;
  const active = offers.filter((o) => o.active);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: gymName(club, lng) }} />
      <BrandGradient name="ember" style={{ borderRadius: radius.lg, overflow: 'hidden', padding: space.xl, gap: space.sm, alignItems: 'center' }}>
        <SaduPattern variant="arrows" opacity={0.1} />
        <ClubLogo c={club} size={72} />
        <T size="xl" bold color={brand.cream} center>{gymName(club, lng)}</T>
        <T size="sm" color={brand.sand}>{[club.chain, t(`clubs.aud_${club.audience}`), club.district || club.city].filter(Boolean).join(' · ')}</T>
        {club.chain_id ? (
          <Pressable onPress={() => router.push({ pathname: '/clubs/chain/[id]', params: { id: club.chain_id! } })}>
            <T size="xs" semibold color={brand.amber}>{t('clubs.seeChain')} ›</T>
          </Pressable>
        ) : null}
        <Row gap={space.sm} style={{ marginTop: space.sm }}>
          <HeroBtn icon="navigate" label={t('clubs.directions')} onPress={() => Linking.openURL(mapsUrl)} />
          <HeroBtn icon="people" label={t('clubs.whoIsHere')} onPress={() => router.push({ pathname: '/gym/[id]', params: { id: club.id } })} />
          {club.website ? <HeroBtn icon="globe-outline" label={t('store.website')} onPress={() => Linking.openURL(club.website!)} /> : null}
        </Row>
      </BrandGradient>

      {/* التقييم */}
      <Card style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center' }}>
        <View style={{ alignItems: 'center', gap: 4, width: 96 }}>
          <Num size={40} color={colors.text}>{reviews.length ? avg.toFixed(1) : '—'}</Num>
          <Stars value={avg} size={14} />
          <T size="xs" muted>{t('clubs.reviewsN', { n: reviews.length })}</T>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          {bars.map((b) => (
            <Row key={b.stars} gap={6}>
              <T size="xs" muted style={{ width: 10 }}>{b.stars}</T>
              <View style={{ flex: 1, height: 7, borderRadius: 4, backgroundColor: colors.cardAlt, overflow: 'hidden' }}>
                <View style={{ width: `${b.pct * 100}%`, height: '100%', backgroundColor: '#F5B400', borderRadius: 4 }} />
              </View>
              <T size="xs" muted style={{ width: 18, textAlign: 'right' }}>{b.n}</T>
            </Row>
          ))}
        </View>
      </Card>

      {/* العروض */}
      <Row style={{ justifyContent: 'space-between' }}>
        <T size="lg" bold>{t('clubs.offersAndPrices')}</T>
        {manage ? <Button small icon="add" title={t('clubs.addOffer')} onPress={() => router.push({ pathname: '/clubs/offer', params: { gym: club.id } })} /> : null}
      </Row>
      {active.length ? active.map((o) => (
        <View key={o.id} style={{ gap: 6 }}>
          <OfferCard o={o} rating={club} />
          <Row gap={space.md} style={{ paddingHorizontal: 4 }}>
            {o.details ? <T size="xs" muted style={{ flex: 1 }}>{o.details}</T> : <View style={{ flex: 1 }} />}
            {o.promo_code ? <T size="xs" semibold color={colors.primary}>{t('clubs.code')}: {o.promo_code}</T> : null}
            {o.url || o.source_url ? <Pressable onPress={() => Linking.openURL((o.url || o.source_url)!)}><T size="xs" semibold color={colors.primary}>{o.url ? t('clubs.subscribe') : t('clubs.source')} ↗</T></Pressable> : null}
            {manage ? <Pressable onPress={() => router.push({ pathname: '/clubs/offer', params: { gym: club.id, id: o.id } })}><Ionicons name="create-outline" size={16} color={colors.muted} /></Pressable> : null}
          </Row>
        </View>
      )) : <Empty icon="pricetags-outline" text={t('clubs.noOffersClub')} />}
      <T size="xs" muted center>{t('clubs.priceNote')}</T>

      {/* التعليقات */}
      <Row style={{ justifyContent: 'space-between' }}>
        <T size="lg" bold>{t('clubs.reviews')}</T>
        <Button small variant={mine ? 'secondary' : 'primary'} icon={mine ? 'create-outline' : 'star-outline'} title={mine ? t('clubs.editReview') : t('clubs.rate')}
          onPress={() => router.push({ pathname: '/clubs/review', params: { gym: club.id, name: gymName(club, lng) } })} />
      </Row>
      {reviews.length ? reviews.map((r) => (
        <Card key={r.user_id} style={{ gap: 6, borderColor: r.is_me ? brand.orange : colors.border }}>
          <Row>
            <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: r.user_id } })}>
              <Avatar size={34} uri={publicUrl('avatars', r.avatar_url)} name={r.full_name ?? r.username} />
            </Pressable>
            <View style={{ flex: 1, gap: 2 }}>
              <Row gap={6}>
                <T size="sm" semibold numberOfLines={1} style={{ flexShrink: 1 }}>{r.is_me ? t('presence.you') : r.full_name || r.username}</T>
                <RankBadge points={r.points} small />
              </Row>
              <Row gap={6}>
                <Stars value={r.rating} size={11} />
                <T size="xs" muted>{timeAgo(r.updated_at, lng)}</T>
                {r.visited ? <Row gap={2}><Ionicons name="checkmark-circle" size={12} color={colors.success} /><T size="xs" color={colors.success}>{t('clubs.visited')}</T></Row> : null}
              </Row>
            </View>
          </Row>
          {r.body ? <T style={{ lineHeight: 24 }}>{r.body}</T> : null}
        </Card>
      )) : <Empty icon="chatbubble-ellipses-outline" text={t('clubs.noReviews')} />}
    </Screen>
  );
}

function HeroBtn({ icon, label, onPress }: { icon: 'navigate' | 'people' | 'globe-outline'; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(248,237,218,0.16)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
      <Ionicons name={icon} size={14} color={brand.cream} />
      <T size="xs" semibold color={brand.cream}>{label}</T>
    </Pressable>
  );
}
