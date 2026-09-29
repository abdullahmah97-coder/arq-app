// صفحة السلسلة (مثل وقت اللياقة، بيور جيم…): الشعار والإعجاب، الخدمات، التقييم والتعليقات مع الإعجاب بها،
// والعروض والأسعار مع مصادرها، والفروع
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { I18nManager, Linking, Modal, Pressable, ScrollView, View } from 'react-native';
import { BrandGradient, SaduPattern } from '@/brand/Brand';
import { ClubLikeButton } from '@/components/clubs/ClubLike';
import { ChainServicesCard } from '@/components/clubs/GymServices';
import { ClubLogo, ClubRow, OfferCard, Stars } from '@/components/clubs/parts';
import { gymName } from '@/components/GymPicker';
import { Num } from '@/components/pulse/widgets';
import { FacetBars } from '@/components/trust/FacetBars';
import { ReviewCard } from '@/components/trust/ReviewCard';
import { Button, Card, Empty, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { canManageChain, loadChainBranches, loadChains, loadOffers, ratingBars, type Chain, type Club, type Offer } from '@/lib/clubs';
import { useLocalized } from '@/lib/i18n';
import { loadChainReviewsFull, summarizeReviews, type FullReview } from '@/lib/trust';
import { brand, colors, radius, space } from '@/theme';

type Tab = 'offers' | 'branches' | 'comments';
/** اختيار الفرع: للتقييم (التقييم لفرع زرته) أو لتأكيد الخدمات */
type Pick = 'rate' | 'services';
const PREVIEW = 2;

export default function ChainPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [chain, setChain] = useState<Chain | null | undefined>(undefined);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [branches, setBranches] = useState<Club[]>([]);
  const [reviews, setReviews] = useState<FullReview[]>([]);
  const [manage, setManage] = useState(false);
  const [tab, setTab] = useState<Tab>('offers');
  const [pick, setPick] = useState<Pick | null>(null);

  const loadReviews = useCallback(() => { loadChainReviewsFull(String(id)).then(setReviews).catch(() => {}); }, [id]);
  useFocusEffect(useCallback(() => {
    const cid = String(id);
    loadChains().then((cs) => setChain(cs.find((c) => c.id === cid) ?? null)).catch(() => setChain(null));
    loadOffers({ chainId: cid }).then(setOffers).catch(() => {});
    loadChainBranches(cid).then(setBranches).catch(() => {});
    loadReviews();
    canManageChain(cid).then(setManage).catch(() => {});
  }, [id, loadReviews]));

  if (chain === undefined) return <Loading />;
  if (!chain) return <Screen><Empty text={t('clubs.notFound')} /></Screen>;
  const name = lng === 'en' && chain.name_en ? chain.name_en : chain.name;
  const { avg, facets } = summarizeReviews(reviews);
  const bars = ratingBars(reviews);
  const mine = reviews.find((r) => r.is_me);

  const goBranch = (why: Pick, b: Club) => {
    setPick(null);
    if (why === 'rate') router.push({ pathname: '/clubs/review', params: { gym: b.id, name: gymName(b, lng) } });
    else router.push({ pathname: '/clubs/[id]', params: { id: b.id } });
  };
  // التقييم والخدمات لكل فرع: فرع واحد نفتحه مباشرة، وأكثر نخليه يختار
  const choose = (why: Pick) => {
    if (branches.length === 1) goBranch(why, branches[0]);
    else if (branches.length > 1) setPick(why);
    else setTab('branches');
  };
  // الضغط على عرض هنا ما يفتح نفس الصفحة مرة ثانية: يفتح رابط الاشتراك أو المصدر لو موجود
  const openOffer = (o: Offer) => {
    const url = o.url || o.source_url;
    if (url) Linking.openURL(url).catch(() => {});
  };

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
          <ClubLikeButton target={{ chainId: chain.id }} />
          {chain.website ? <HeroBtn icon="globe-outline" label={t('store.website')} onPress={() => Linking.openURL(chain.website!)} /> : null}
          {chain.instagram ? <HeroBtn icon="logo-instagram" label={`@${chain.instagram}`} onPress={() => Linking.openURL(`https://instagram.com/${chain.instagram}`)} /> : null}
        </Row>
      </BrandGradient>

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Stat value={reviews.length ? avg.toFixed(1) : '—'} label={t('clubs.reviewsN', { n: reviews.length, count: reviews.length })} extra={reviews.length ? <Stars value={avg} size={10} /> : null} />
        <Stat value={chain.best_monthly != null ? String(Math.round(chain.best_monthly)) : '—'} label={t('clubs.fromMonthlyLabel')} />
        <Stat value={String(chain.branches)} label={t('clubs.branchesInApp')} />
      </View>

      {manage ? (
        <Row gap={space.sm}>
          <View style={{ flex: 1 }}><Button small icon="add" title={t('clubs.addOffer')} onPress={() => router.push({ pathname: '/clubs/offer', params: { chain: chain.id } })} /></View>
          <View style={{ flex: 1 }}><Button small variant="secondary" icon="image-outline" title={t('clubs.editChain')} onPress={() => router.push({ pathname: '/clubs/chain-edit', params: { id: chain.id } })} /></View>
        </Row>
      ) : null}

      {/* الخدمات */}
      <ChainServicesCard chainId={chain.id} manage={manage} onHelp={branches.length ? () => choose('services') : undefined} />

      {/* التقييم وآخر التعليقات */}
      <Card style={{ gap: space.md }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T size="lg" bold>{t('clubs.ratingTitle')}</T>
          <Button small variant={mine ? 'secondary' : 'primary'} icon={mine ? 'create-outline' : 'star-outline'}
            title={mine ? t('clubs.editReview') : t('clubs.rate')}
            onPress={() => (mine?.gym_id ? router.push({ pathname: '/clubs/review', params: { gym: mine.gym_id, name: mine.gym_name ?? name } }) : choose('rate'))} />
        </Row>
        <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center' }}>
          <View style={{ alignItems: 'center', gap: 4, width: 96 }}>
            <Num size={40} color={colors.text}>{reviews.length ? avg.toFixed(1) : '—'}</Num>
            <Stars value={avg} size={14} />
            <T size="xs" muted>{t('clubs.reviewsN', { n: reviews.length, count: reviews.length })}</T>
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
        </View>
        <FacetBars f={facets} />
        {reviews.length ? (
          <>
            <T size="sm" semibold>{t('clubs.latestComments')}</T>
            {reviews.slice(0, PREVIEW).map((r) => <ReviewCard key={`${r.gym_id}-${r.user_id}`} r={r} gymId={r.gym_id ?? ''} onChanged={loadReviews} showGym />)}
            {reviews.length > PREVIEW ? (
              <Pressable onPress={() => setTab('comments')} accessibilityRole="button" hitSlop={6}>
                <T size="sm" semibold color={colors.primary}>{t('clubs.allComments', { n: reviews.length })}</T>
              </Pressable>
            ) : null}
          </>
        ) : <T size="sm" muted style={{ lineHeight: 22 }}>{t('clubs.noCommentsChain')}</T>}
      </Card>

      <Segmented<Tab> value={tab} onChange={setTab} options={[
        { value: 'offers', label: `${t('clubs.tabOffers')} (${offers.length})` },
        { value: 'branches', label: `${t('clubs.branches')} (${branches.length})` },
        { value: 'comments', label: `${t('clubs.tabComments')} (${reviews.length})` },
      ]} />

      {tab === 'offers' ? (
        offers.length ? offers.map((o) => (
          <View key={o.id} style={{ gap: 6 }}>
            <OfferCard o={o} rating={reviews.length ? { rating: avg, reviews: reviews.length } : chain} onPress={() => openOffer(o)} />
            <Row gap={space.md} style={{ paddingHorizontal: 4, alignItems: 'flex-start' }}>
              {o.details ? <T size="xs" muted style={{ flex: 1, lineHeight: 18 }}>{o.details}</T> : <View style={{ flex: 1 }} />}
              {o.promo_code ? <T size="xs" semibold color={colors.primary}>{t('clubs.code')}: {o.promo_code}</T> : null}
              {o.url || o.source_url ? <Pressable onPress={() => openOffer(o)}><T size="xs" semibold color={colors.primary}>{o.url ? t('clubs.subscribe') : t('clubs.source')} ↗</T></Pressable> : null}
              {manage ? <Pressable onPress={() => router.push({ pathname: '/clubs/offer', params: { chain: chain.id, id: o.id } })}><Ionicons name="create-outline" size={16} color={colors.muted} /></Pressable> : null}
            </Row>
          </View>
        )) : <Empty icon="pricetags-outline" text={t('clubs.noPricesChain')} />
      ) : null}
      {tab === 'branches' ? (
        branches.length ? branches.map((b) => <ClubRow key={b.id} c={b} />) : <Empty icon="location-outline" text={t('clubs.noBranches')} />
      ) : null}
      {tab === 'comments' ? (
        reviews.length ? reviews.map((r) => <ReviewCard key={`${r.gym_id}-${r.user_id}`} r={r} gymId={r.gym_id ?? ''} onChanged={loadReviews} showGym />)
          : <Empty icon="chatbubble-ellipses-outline" text={t('clubs.noCommentsChain')} />
      ) : null}
      <T size="xs" muted center>{t('clubs.priceNote')}</T>

      {/* اختيار الفرع */}
      <Modal visible={!!pick} transparent animationType="fade" onRequestClose={() => setPick(null)}>
        <Pressable onPress={() => setPick(null)} style={{ flex: 1, backgroundColor: 'rgba(6,24,21,0.55)', justifyContent: 'flex-end' }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: space.lg, gap: space.sm, maxHeight: '70%' }}>
            <T size="lg" bold>{t(pick === 'rate' ? 'clubs.pickBranchRate' : 'clubs.pickBranchServices')}</T>
            <T size="xs" muted>{t(pick === 'rate' ? 'clubs.pickBranchRateHint' : 'clubs.pickBranchServicesHint')}</T>
            <ScrollView contentContainerStyle={{ gap: space.sm, paddingBottom: space.lg }}>
              {branches.map((b) => (
                <Pressable key={b.id} onPress={() => pick && goBranch(pick, b)} accessibilityRole="button"
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
                    borderRadius: radius.lg, padding: space.md, opacity: pressed ? 0.85 : 1 })}>
                  <ClubLogo c={b} size={36} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <T semibold numberOfLines={1}>{gymName(b, lng)}</T>
                    <T size="xs" muted numberOfLines={1}>{[b.district || b.city, b.distance_m != null ? t('clubs.km', { n: (b.distance_m / 1000).toFixed(1) }) : null].filter(Boolean).join(' · ')}</T>
                  </View>
                  <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.muted} />
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
