// دليل مراكز العلاج الطبيعي والاستشفاء: فلتر المدينة والنوع، والشركاء أولاً، و«أضف مركزك»
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { I18nManager, Pressable, ScrollView, View } from 'react-native';
import { CenterCard } from '@/components/recovery/parts';
import { Empty, Loading, Row, Screen, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { CENTER_KINDS, cityLabel, loadCenters, loadMyCenter, type CenterKind, type RecoveryCenter } from '@/lib/recovery';
import { brand, colors, radius, space } from '@/theme';

export default function Centers() {
  const { t, i18n } = useTranslation();
  const { userId } = useUser();
  // ?focus=<id>: جاي من إعلان أو رابط لمركز معيّن → نعرضه أول
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const [list, setList] = useState<RecoveryCenter[] | null>(null);
  const [mine, setMine] = useState<RecoveryCenter | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [kind, setKind] = useState<CenterKind | null>(null);
  useFocusEffect(useCallback(() => {
    loadCenters().then(setList).catch(() => setList([]));
    loadMyCenter(userId).then(setMine).catch(() => {});
  }, [userId]));

  const cities = useMemo(() => {
    const n = new Map<string, number>();
    for (const c of list ?? []) for (const x of c.cities) n.set(x, (n.get(x) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [list]);
  const shown = (list ?? []).filter((c) => (!city || c.cities.includes(city)) && (!kind || c.kind === kind))
    .sort((a, b) => Number(b.id === focus) - Number(a.id === focus));

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('recovery.centersTitle') }} />
      <T muted>{t('recovery.centersIntro')}</T>

      <Pressable onPress={() => router.push('/recovery/join')} accessibilityRole="button">
        <Row style={{ backgroundColor: colors.card, borderWidth: 1.5, borderColor: brand.orange, borderStyle: 'dashed', borderRadius: radius.lg, padding: space.md }} gap={space.md}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={mine ? 'medkit' : 'add'} size={22} color={brand.cream} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T bold>{mine ? t('recovery.myCenter', { name: mine.name }) : t('recovery.addCenter')}</T>
            <T size="xs" muted>{mine ? t(`recovery.status_${mine.status}`) : t('recovery.addCenterBody')}</T>
          </View>
          <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.muted} />
        </Row>
      </Pressable>

      <Chips value={kind} onChange={setKind} all={t('recovery.allKinds')} options={CENTER_KINDS.map((k) => ({ value: k, label: t(`recovery.kind_${k}`) }))} />
      {cities.length > 1 ? <Chips value={city} onChange={setCity} all={t('recovery.allCities')} options={cities.map((c) => ({ value: c, label: cityLabel(c, i18n.language) }))} /> : null}

      {list === null ? <Loading /> : shown.length ? shown.map((c) => <CenterCard key={c.id} c={c} />) : <Empty icon="medkit-outline" text={t('recovery.noCenters')} />}
      <T size="xs" muted center>{t('recovery.centersNote')}</T>
    </Screen>
  );
}

function Chips<V extends string>({ value, onChange, options, all }: {
  value: V | null; onChange: (v: V | null) => void; options: { value: V; label: string }[]; all: string;
}) {
  const items: { value: V | null; label: string }[] = [{ value: null, label: all }, ...options];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {items.map((o) => {
        const on = value === o.value;
        return (
          <Pressable key={o.value ?? 'all'} onPress={() => onChange(o.value)}
            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1,
              backgroundColor: on ? brand.deepGreen : colors.card, borderColor: on ? brand.deepGreen : colors.border }}>
            <T size="sm" semibold color={on ? brand.cream : colors.text}>{o.label}</T>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
