// صفحة السلسلة (مثل وقت اللياقة، بيور جيم…): الشعار، العروض والأسعار مع مصادرها، الفروع، وتقييمات الأعضاء
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, View } from 'react-native';
import { BrandGradient, SaduPattern } from '@/brand/Brand';
import { ClubLogo, ClubRow, OfferCard, Stars } from '@/components/clubs/parts';
import { Num } from '@/components/pulse/widgets';
import { Avatar, Button, Card, Empty, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { canManageChain, loadChainBranches, loadChainReviews, loadChains, loadOffers, type Chain, type Club, type Offer, type Review } from '@/lib/clubs';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { publicUrl } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

type Tab = 'offers' | 'branches' | 'reviews';

export default function ChainPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [chain, setChain] = useState<Chain | null | undefined>(undefined);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [branches, setBranches] = useState<Club[]>([]);
  const [reviews, setReviews] = useState<(Review & { gym_name: string })[]>([]);
  const [manage, setManage] = useState(false);
  const [tab, setTab] = useState<Tab>('offers');

  useFocusEffect(useCallback(() => {
    const cid = String(id);
    loadChains().then((cs) => setChain(cs.find((c) => c.id === cid) ?? null)).catch(() => setChain(null));
    loadOffers({ chainId: cid }).then(setOffers).catch(() => {});
    loadChainBranches(cid).then(setBranches).catch(() => {});
    loadChainReviews(cid).then(setReviews).catch(() => {});
    canManageChain(cid).then(setManage).catch(() => {});
  }, [id]));

  if (chain === undefined) return <Loading />;
  if (!chain) return <Screen><Empty text={t('clubs.notFound')} /></Screen>;
  const name = lng === 'en' && chain.name_en ? chain.name_en : chain.name;

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: name }} />
      <BrandGradient name="ember" style={{ borderRadius: radius.lg, overflow: 'hidden', padding: space.xl, gap: space.sm, alignItems: 'center' }}>
        <SaduPattern variant="arrows" opacity={0.1} />
        <ClubLogo c={{ name: chain.name_en || chain.name, logo_path: chain.logo_path }} size={76} />
        <T size="xl" bold color={brand.cream} center>{name}</T>
        <T size="sm" color={brand.sand}>{[chain.name_en && lng === 'ar' ? chain.name_en : null, t(`clubs.aud_${chain.audience}`)].filter(Boolean).join(' · ')}</T>
        {chain.description ? <T size="sm" center color={brand.cream} style={{ lineHeight: 22 }}>{chain.description}</T> : null}
        <Row gap={space.sm} style={{ marginTop: space.sm, flexWrap: 'wrap', justifyContent: 'center' }}>
          {chain.website ? <HeroBtn icon="globe-outline" label={t('store.website')} onPress={() => Linking.openURL(chain.website!)} /> : null}
          {chain.instagram ? <HeroBtn icon="logo-instagram" label={`@${chain.instagram}`} onPress={() => Linking.openURL(`https://instagram.com/${chain.instagram}`)} /> : null}
        </Row>
      </BrandGradient>

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Stat value={chain.rating ? chain.rating.toFixed(1) : '—'} label={t('clubs.reviewsN', { n: chain.reviews, count: chain.reviews })} extra={chain.rating ? <Stars value={chain.rating} size={10} /> : null} />
        <Stat value={chain.best_monthly != null ? String(Math.round(chain.best_monthly)) : '—'} label={t('clubs.fromMonthlyLabel')} />
        <Stat value={String(chain.branches)} label={t('clubs.branchesInApp')} />
      </View>

      {manage ? (
        <Row gap={space.sm}>
          <View style={{ flex: 1 }}><Button small icon="add" title={t('clubs.addOffer')} onPress={() => router.push({ pathname: '/clubs/offer', params: { chain: chain.id } })} /></View>
          <View style={{ flex: 1 }}><Button small variant="secondary" icon="image-outline" title={t('clubs.editChain')} onPress={() => router.push({ pathname: '/clubs/chain-edit', params: { id: chain.id } })} /></View>
        </Row>
      ) : null}

      <Segmented<Tab> value={tab} onChange={setTab} options={[
        { value: 'offers', label: `${t('clubs.tabOffers')} (${offers.length})` },
        { value: 'branches', label: `${t('clubs.branches')} (${branches.length})` },
        { value: 'reviews', label: `${t('clubs.reviewsTab')} (${reviews.length})` },
      ]} />

      {tab === 'offers' ? (
        offers.length ? offers.map((o) => (
          <View key={o.id} style={{ gap: 6 }}>
            <OfferCard o={o} rating={chain} />
            <Row gap={space.md} style={{ paddingHorizontal: 4, alignItems: 'flex-start' }}>
              {o.details ? <T size="xs" muted style={{ flex: 1, lineHeight: 18 }}>{o.details}</T> : <View style={{ flex: 1 }} />}
              {o.promo_code ? <T size="xs" semibold color={colors.primary}>{t('clubs.code')}: {o.promo_code}</T> : null}
              {o.url || o.source_url ? <Pressable onPress={() => Linking.openURL((o.url || o.source_url)!)}><T size="xs" semibold color={colors.primary}>{o.url ? t('clubs.subscribe') : t('clubs.source')} ↗</T></Pressable> : null}
              {manage ? <Pressable onPress={() => router.push({ pathname: '/clubs/offer', params: { chain: chain.id, id: o.id } })}><Ionicons name="create-outline" size={16} color={colors.muted} /></Pressable> : null}
            </Row>
          </View>
        )) : <Empty icon="pricetags-outline" text={t('clubs.noPricesChain')} />
      ) : null}
      {tab === 'branches' ? (
        branches.length ? branches.map((b) => <ClubRow key={b.id} c={b} />) : <Empty icon="location-outline" text={t('clubs.noBranches')} />
      ) : null}
      {tab === 'reviews' ? (
        reviews.length ? reviews.map((r) => (
          <Card key={`${r.user_id}-${r.gym_name}`} style={{ gap: 6 }}>
            <Row>
              <Avatar size={32} uri={publicUrl('avatars', r.avatar_url)} name={r.full_name ?? r.username} />
              <View style={{ flex: 1, gap: 2 }}>
                <T size="sm" semibold numberOfLines={1}>{r.full_name || r.username}</T>
                <Row gap={6}><Stars value={r.rating} size={11} /><T size="xs" muted numberOfLines={1}>{r.gym_name} · {timeAgo(r.updated_at, lng)}</T></Row>
              </View>
            </Row>
            {r.body ? <T style={{ lineHeight: 24 }}>{r.body}</T> : null}
          </Card>
        )) : <Empty icon="chatbubble-ellipses-outline" text={t('clubs.noReviewsChain')} />
      ) : null}
      <T size="xs" muted center>{t('clubs.priceNote')}</T>
    </Screen>
  );
}

function Stat({ value, label, extra }: { value: string; label: string; extra?: React.ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: 2, alignItems: 'center' }}>
      <Num size={24} color={colors.text}>{value}</Num>
      {extra}
      <T size="xs" muted center>{label}</T>
    </View>
  );
}

function HeroBtn({ icon, label, onPress }: { icon: 'globe-outline' | 'logo-instagram'; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(248,237,218,0.16)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
      <Ionicons name={icon} size={14} color={brand.cream} />
      <T size="xs" semibold color={brand.cream}>{label}</T>
    </Pressable>
  );
}
