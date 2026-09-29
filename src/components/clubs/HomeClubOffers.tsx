// مربع «عروض النوادي» في الرئيسية: أفضل العروض (بالسعر الشهري) + أعلى النوادي تقييماً أو أرخصها
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { NCard, NSection, NT } from '@/components/pulse/widgets';
import { loadChains, loadClubs, loadOffers, type Chain, type Club, type Offer } from '@/lib/clubs';
import { useLocalized } from '@/lib/i18n';
import { LONG_PRESS_MS, useHomeLongPress } from '@/lib/homeLayout';
import { night, space } from '@/theme';
import { ClubLogo, OfferCard, STAR } from './parts';

export function HomeClubOffers() {
  const { t } = useTranslation();
  const longPress = useHomeLongPress();
  const { lng } = useLocalized();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [chains, setChains] = useState<Chain[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  useFocusEffect(useCallback(() => {
    loadOffers().then(setOffers).catch(() => {});
    loadChains().then(setChains).catch(() => {});
    loadClubs().then(setClubs).catch(() => {});
  }, []));

  const chainById = new Map(chains.map((c) => [c.id, c]));
  const clubById = new Map(clubs.map((c) => [c.id, c]));
  const ratingOf = (o: Offer) => (o.chain_id ? chainById.get(o.chain_id) : o.gym_id ? clubById.get(o.gym_id) : null) ?? null;
  // عرض واحد لكل سلسلة/نادي في الرئيسية (الأرخص شهرياً) حتى تتنوع البطاقات
  const seen = new Set<string>();
  const picks = offers.filter((o) => { const k = o.chain_id ?? o.gym_id ?? o.id; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 10);
  const rated = chains.filter((c) => c.rating && c.reviews > 0).sort((a, b) => (b.rating! - a.rating!) || b.reviews - a.reviews);
  const cheap = chains.filter((c) => c.best_monthly != null).sort((a, b) => a.best_monthly! - b.best_monthly!);
  const list = (rated.length >= 3 ? rated : cheap).slice(0, 3);
  const byRating = rated.length >= 3;
  if (!picks.length && !list.length) return null;

  return (
    <View style={{ gap: space.md }}>
      <NSection title={t('clubs.homeTitle')} action={t('clubs.all')} onAction={() => router.push('/clubs')} />
      {picks.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md }}>
          {picks.map((o) => <OfferCard key={o.id} o={o} rating={ratingOf(o)} dark width={252} />)}
        </ScrollView>
      ) : null}
      {list.length ? (
        <NCard style={{ gap: 4, paddingVertical: space.md }} onPress={() => router.push({ pathname: '/clubs', params: { tab: 'chains' } })}>
          <NT size={13} semibold muted>{byRating ? t('clubs.topRated') : t('clubs.cheapest')}</NT>
          {list.map((c, i) => (
            <Pressable key={c.id} onPress={() => router.push({ pathname: '/clubs/chain/[id]', params: { id: c.id } })} onLongPress={longPress} delayLongPress={LONG_PRESS_MS}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
              <NT size={13} bold color={night.accent} style={{ width: 14 }}>{i + 1}</NT>
              <ClubLogo c={{ name: c.name_en || c.name, logo_path: c.logo_path }} size={30} />
              <NT size={14} semibold style={{ flex: 1 }} numberOfLines={1}>{lng === 'en' && c.name_en ? c.name_en : c.name}</NT>
              {byRating ? (
                <>
                  <Ionicons name="star" size={13} color={STAR} />
                  <NT size={13} semibold>{c.rating!.toFixed(1)}</NT>
                  <NT size={11} faint>({c.reviews})</NT>
                </>
              ) : <NT size={13} semibold color={night.accent}>{t('clubs.fromMonthly', { n: Math.round(c.best_monthly!) })}</NT>}
            </Pressable>
          ))}
        </NCard>
      ) : null}
    </View>
  );
}
