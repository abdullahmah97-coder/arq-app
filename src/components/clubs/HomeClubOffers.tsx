// مربع «عروض النوادي» في الرئيسية: أفضل العروض (بالسعر الشهري) + أعلى النوادي تقييماً
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { gymName } from '@/components/GymPicker';
import { NCard, NSection, NT } from '@/components/pulse/widgets';
import { loadClubs, loadOffers, type Club, type Offer } from '@/lib/clubs';
import { useLocalized } from '@/lib/i18n';
import { night, space } from '@/theme';
import { ClubLogo, OfferCard, STAR } from './parts';

export function HomeClubOffers() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  useFocusEffect(useCallback(() => {
    loadOffers().then(setOffers).catch(() => {});
    loadClubs().then(setClubs).catch(() => {});
  }, []));

  const byId = new Map(clubs.map((c) => [c.id, c]));
  const top = clubs.filter((c) => c.rating && c.reviews >= 1).sort((a, b) => (b.rating! - a.rating!) || b.reviews - a.reviews).slice(0, 3);
  if (!offers.length && !top.length) return null;

  return (
    <View style={{ gap: space.md }}>
      <NSection title={t('clubs.homeTitle')} action={t('clubs.all')} onAction={() => router.push('/clubs')} />
      {offers.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md }}>
          {offers.slice(0, 8).map((o) => <OfferCard key={o.id} o={o} club={byId.get(o.gym_id)} dark width={248} />)}
        </ScrollView>
      ) : null}
      {top.length ? (
        <NCard style={{ gap: 4, paddingVertical: space.md }} onPress={() => router.push({ pathname: '/clubs', params: { tab: 'top' } })}>
          <NT size={13} semibold muted>{t('clubs.topRated')}</NT>
          {top.map((c, i) => (
            <Pressable key={c.id} onPress={() => router.push({ pathname: '/clubs/[id]', params: { id: c.id } })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
              <NT size={13} bold color={night.accent} style={{ width: 14 }}>{i + 1}</NT>
              <ClubLogo c={c} size={30} />
              <NT size={14} semibold style={{ flex: 1 }} numberOfLines={1}>{gymName(c, lng)}</NT>
              <Ionicons name="star" size={13} color={STAR} />
              <NT size={13} semibold>{c.rating!.toFixed(1)}</NT>
              <NT size={11} faint>({c.reviews})</NT>
            </Pressable>
          ))}
        </NCard>
      ) : null}
    </View>
  );
}
