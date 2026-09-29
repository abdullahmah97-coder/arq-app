// البطولات والفعاليات المحلية: ماراثون الرياض، كأس السعودية، الهايكنج، الرماية، الملاكمة… مع فلتر بالنوع
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { BrandGradient, SaduPattern } from '@/brand/Brand';
import { EventCard } from '@/components/events/EventParts';
import { Empty, Loading, Screen, Segmented, T } from '@/components/ui';
import { EVENT_CATEGORIES, loadEvents, upcomingEvents, type EventCategory, type LocalEvent } from '@/lib/localEvents';
import { brand, radius, space } from '@/theme';

export default function Events() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<LocalEvent[] | null>(null);
  const [cat, setCat] = useState<EventCategory | 'all'>('all');
  useFocusEffect(useCallback(() => { loadEvents().then((r) => setRows(upcomingEvents(r))).catch(() => setRows([])); }, []));

  if (!rows) return <Loading />;
  const cats = EVENT_CATEGORIES.filter((c) => rows.some((e) => e.category === c));
  const list = rows.filter((e) => cat === 'all' || e.category === cat);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('events.title') }} />
      <BrandGradient name="ember" style={{ borderRadius: radius.lg, overflow: 'hidden', padding: space.lg, gap: 6 }}>
        <SaduPattern variant="peaks" opacity={0.1} />
        <T size="xs" semibold color={brand.amber}>{t('events.eyebrow')}</T>
        <T size="xl" bold color={brand.cream}>{t('events.title')}</T>
        <T size="sm" color={brand.sand} style={{ lineHeight: 22 }}>{t('events.intro')}</T>
      </BrandGradient>
      {cats.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Segmented<EventCategory | 'all'> wrap value={cat} onChange={setCat}
            options={[{ value: 'all', label: t('store.all') }, ...cats.map((c) => ({ value: c, label: t(`events.cat_${c}`) }))]} />
        </ScrollView>
      ) : null}
      {list.length ? (
        <View style={{ gap: space.sm }}>
          {list.map((e) => <EventCard key={e.id} e={e} onPress={() => router.push({ pathname: '/events/[id]', params: { id: e.id } })} />)}
        </View>
      ) : <Empty icon="trophy-outline" text={t('events.empty')} />}
      <T size="xs" muted center style={{ lineHeight: 19 }}>{t('events.sourceNote')}</T>
    </Screen>
  );
}
