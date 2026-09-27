// النوادي: العروض (مرتبة بالسعر الشهري)، الأعلى تقييماً، والأقرب لك
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { ClubRow, OfferCard } from '@/components/clubs/parts';
import { Empty, Screen, Segmented, T } from '@/components/ui';
import { loadClubs, loadOffers, type Audience, type Club, type Offer } from '@/lib/clubs';
import { getCurrentPosition } from '@/lib/location';
import { space } from '@/theme';

type Tab = 'offers' | 'top' | 'near';

export default function Clubs() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(params.tab ?? 'offers');
  const [aud, setAud] = useState<Audience | 'all'>('all');
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [clubs, setClubs] = useState<Club[] | null>(null);
  const [near, setNear] = useState<Club[] | null>(null);
  const [locDenied, setLocDenied] = useState(false);

  useFocusEffect(useCallback(() => {
    loadOffers().then(setOffers).catch(() => setOffers([]));
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

  const okAud = (a?: Audience | null) => aud === 'all' || a === aud || a === 'mixed';
  const byId = new Map((clubs ?? []).map((c) => [c.id, c]));
  const shownOffers = (offers ?? []).filter((o) => okAud(o.gyms?.audience));
  const top = (clubs ?? []).filter((c) => okAud(c.audience)).sort((a, b) => ((b.rating ?? 0) - (a.rating ?? 0)) || b.reviews - a.reviews);
  const nearList = (near ?? []).filter((c) => okAud(c.audience));

  return (
    <Screen edges={['bottom']}>
      <Segmented value={tab} onChange={pickTab} options={[
        { value: 'offers', label: t('clubs.tabOffers') }, { value: 'top', label: t('clubs.tabTop') }, { value: 'near', label: t('clubs.tabNear') },
      ]} />
      <Segmented<Audience | 'all'> wrap value={aud} onChange={setAud} options={[
        { value: 'all', label: t('store.all') }, { value: 'men', label: t('clubs.aud_men') }, { value: 'women', label: t('clubs.aud_women') },
      ]} />

      {tab === 'offers' ? (
        <>
          <T size="xs" muted>{t('clubs.offersHint')}</T>
          {offers === null ? null : shownOffers.length ? shownOffers.map((o) => <OfferCard key={o.id} o={o} club={byId.get(o.gym_id)} />)
            : <Empty icon="pricetags-outline" text={t('clubs.noOffers')} />}
        </>
      ) : null}
      {tab === 'top' ? (
        <View style={{ gap: space.sm }}>
          <T size="xs" muted>{t('clubs.topHint')}</T>
          {clubs === null ? null : top.length ? top.map((c, i) => <ClubRow key={c.id} c={c} rank={c.rating ? i + 1 : undefined} />) : <Empty icon="star-outline" text={t('clubs.noClubs')} />}
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
