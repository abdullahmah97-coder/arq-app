// النوادي: كل العروض (مرتبة بالسعر الشهري)، كل السلاسل، والفروع الأقرب لك
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { ChainRow, ClubRow, OfferCard } from '@/components/clubs/parts';
import { Empty, Screen, Segmented, T } from '@/components/ui';
import { loadChains, loadClubs, loadOffers, type Audience, type Chain, type Club, type Offer } from '@/lib/clubs';
import { getCurrentPosition } from '@/lib/location';
import { space } from '@/theme';

type Tab = 'offers' | 'chains' | 'near';
type Sort = 'price' | 'rating';

export default function Clubs() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'chains' || params.tab === 'near' ? params.tab : 'offers');
  const [aud, setAud] = useState<Audience | 'all'>('all');
  const [months, setMonths] = useState<number | 'all'>('all');
  const [sort, setSort] = useState<Sort>('price');
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [chains, setChains] = useState<Chain[] | null>(null);
  const [clubs, setClubs] = useState<Club[] | null>(null);
  const [near, setNear] = useState<Club[] | null>(null);
  const [locDenied, setLocDenied] = useState(false);

  useFocusEffect(useCallback(() => {
    loadOffers().then(setOffers).catch(() => setOffers([]));
    loadChains().then(setChains).catch(() => setChains([]));
    loadClubs().then(setClubs).catch(() => setClubs([]));
  }, []));

  const pickTab = async (v: Tab) => {
    setTab(v);
    if (v === 'near' && !near) {
      const pos = await getCurrentPosition().catch(() => null);
      if (!pos) { setLocDenied(true); setNear([]); return; }
      setNear(await loadClubs(pos));
    }
  };

  const okAud = (a?: Audience | null) => aud === 'all' || !a || a === aud || a === 'mixed';
  const chainById = new Map((chains ?? []).map((c) => [c.id, c]));
  const clubById = new Map((clubs ?? []).map((c) => [c.id, c]));
  const ratingOf = (o: Offer) => (o.chain_id ? chainById.get(o.chain_id) : o.gym_id ? clubById.get(o.gym_id) : null) ?? null;
  const shownOffers = (offers ?? []).filter((o) => okAud((o.gym_chains ?? o.gyms)?.audience) && (months === 'all' || o.months === months));
  const shownChains = (chains ?? []).filter((c) => okAud(c.audience)).sort((a, b) => sort === 'rating'
    ? ((b.rating ?? 0) - (a.rating ?? 0)) || b.reviews - a.reviews
    : ((a.best_monthly ?? 1e9) - (b.best_monthly ?? 1e9)) || b.offers - a.offers);
  const nearList = (near ?? []).filter((c) => okAud(c.audience));

  return (
    <Screen edges={['bottom']}>
      <Segmented value={tab} onChange={pickTab} options={[
        { value: 'offers', label: `${t('clubs.tabOffers')}${offers ? ` (${offers.length})` : ''}` },
        { value: 'chains', label: `${t('clubs.tabChains')}${chains ? ` (${chains.length})` : ''}` },
        { value: 'near', label: t('clubs.tabNear') },
      ]} />
      <Segmented<Audience | 'all'> wrap value={aud} onChange={setAud} options={[
        { value: 'all', label: t('store.all') }, { value: 'men', label: t('clubs.aud_men') }, { value: 'women', label: t('clubs.aud_women') },
      ]} />

      {tab === 'offers' ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <Segmented<number | 'all'> wrap value={months} onChange={setMonths} options={[
              { value: 'all', label: t('clubs.anyLength') }, { value: 1, label: t('clubs.monthsN', { n: 1 }) }, { value: 3, label: t('clubs.monthsN', { n: 3 }) },
              { value: 6, label: t('clubs.monthsN', { n: 6 }) }, { value: 12, label: t('clubs.monthsN', { n: 12 }) }, { value: 0, label: t('clubs.dayPass') },
            ]} />
          </ScrollView>
          <T size="xs" muted>{t('clubs.offersHint')}</T>
          {offers === null ? null : shownOffers.length ? shownOffers.map((o) => <OfferCard key={o.id} o={o} rating={ratingOf(o)} />)
            : <Empty icon="pricetags-outline" text={t('clubs.noOffers')} />}
          <T size="xs" muted center>{t('clubs.priceNote')}</T>
        </>
      ) : null}
      {tab === 'chains' ? (
        <View style={{ gap: space.sm }}>
          <Segmented<Sort> value={sort} onChange={setSort} options={[{ value: 'price', label: t('clubs.sortPrice') }, { value: 'rating', label: t('clubs.sortRating') }]} />
          {chains === null ? null : shownChains.length ? shownChains.map((c, i) => <ChainRow key={c.id} c={c} rank={sort === 'rating' && c.rating ? i + 1 : undefined} />)
            : <Empty icon="barbell-outline" text={t('clubs.noClubs')} />}
        </View>
      ) : null}
      {tab === 'near' ? (
        <View style={{ gap: space.sm }}>
          {locDenied ? <Empty icon="location-outline" text={t('errors.locationDenied')} /> : near === null ? <T muted center>…</T>
            : nearList.length ? nearList.map((c) => <ClubRow key={c.id} c={c} />) : <Empty icon="location-outline" text={t('clubs.noClubs')} />}
        </View>
      ) : null}
    </Screen>
  );
}
