// مقارنة ٢–٣ أندية جنب بعض: التقييم، أرخص شهر، الموجودين الحين، التفاصيل، والخدمات — الأفضل بكل سطر يتلوّن
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { ClubLogo } from '@/components/clubs/parts';
import { ServiceIcon } from '@/components/clubs/GymServices';
import { Button, Card, Empty, Loading, Row, Screen, T } from '@/components/ui';
import { useLocalized } from '@/lib/i18n';
import { loadServiceCatalog, serviceName, type ServiceDef } from '@/lib/services';
import { compareList, FACETS, loadCompare, toggleCompare, type CompareRow } from '@/lib/trust';
import { brand, colors, radius, space } from '@/theme';

type Metric = { key: string; label: string; get: (r: CompareRow) => number | null; fmt: (v: number) => string; better: 'high' | 'low' };

export default function Compare() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [ids, setIds] = useState<string[] | null>(null);
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [catalog, setCatalog] = useState<ServiceDef[]>([]);

  const load = useCallback(async () => {
    const list = await compareList();
    setIds(list);
    setRows(await loadCompare(list));
  }, []);
  useFocusEffect(useCallback(() => { load(); loadServiceCatalog().then(setCatalog); }, [load]));

  if (ids === null) return <Loading />;
  const title = <Stack.Screen options={{ title: t('trust.compareTitle') }} />;
  if (rows.length < 2) {
    return (
      <Screen edges={['bottom']}>
        {title}
        <Empty icon="git-compare-outline" text={t('trust.compareEmpty')} />
        <Button icon="search" title={t('trust.pickClubs')} onPress={() => router.push('/clubs')} />
      </Screen>
    );
  }

  const metrics: Metric[] = [
    { key: 'rating', label: t('trust.cmpRating'), get: (r) => r.rating, fmt: (v) => v.toFixed(1), better: 'high' },
    { key: 'reviews', label: t('trust.cmpReviews'), get: (r) => r.reviews, fmt: (v) => String(v), better: 'high' },
    { key: 'price', label: t('trust.cmpMonthly'), get: (r) => r.best_monthly, fmt: (v) => `${Math.round(v).toLocaleString('en-US')} ${t('clubs.sar')}`, better: 'low' },
    { key: 'now', label: t('trust.cmpNow'), get: (r) => r.present_now, fmt: (v) => String(v), better: 'low' },
    ...FACETS.map((f): Metric => ({ key: f, label: t(`trust.facet_${f}`), get: (r) => r[f], fmt: (v) => v.toFixed(1), better: 'high' })),
  ];
  const used = catalog.filter((s) => rows.some((r) => r.services.includes(s.key)));
  const w = `${100 / rows.length}%` as const;

  const Line = ({ label, children }: { label: string; children: ReactNode }) => (
    <View style={{ gap: 4, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
      <T size="xs" muted>{label}</T>
      <View style={{ flexDirection: 'row' }}>{children}</View>
    </View>
  );

  return (
    <Screen edges={['bottom']}>
      {title}
      <Card style={{ gap: 0 }}>
        <View style={{ flexDirection: 'row', paddingBottom: space.sm }}>
          {rows.map((r) => (
            <View key={r.id} style={{ width: w, alignItems: 'center', gap: 4, paddingHorizontal: 4 }}>
              <Pressable onPress={() => router.push({ pathname: '/clubs/[id]', params: { id: r.id } })} style={{ alignItems: 'center', gap: 4 }}>
                <ClubLogo c={{ name: r.name_en || r.name, logo_path: r.chain_logo }} size={44} />
                <T size="xs" semibold center numberOfLines={2}>{lng === 'en' && r.name_en ? r.name_en : r.name}</T>
              </Pressable>
              <Pressable hitSlop={8} accessibilityLabel={t('trust.removeCompare')} onPress={async () => { const next = await toggleCompare(r.id); setIds(next); setRows((p) => p.filter((x) => x.id !== r.id)); }}>
                <Ionicons name="close-circle-outline" size={18} color={colors.muted} />
              </Pressable>
            </View>
          ))}
        </View>
        {metrics.map((m) => {
          const vals = rows.map(m.get);
          const known = vals.filter((v): v is number => v != null);
          const best = known.length > 1 ? (m.better === 'high' ? Math.max(...known) : Math.min(...known)) : null;
          const tie = best != null && known.filter((v) => v === best).length === known.length;
          if (!known.length) return null;
          return (
            <Line key={m.key} label={m.label}>
              {vals.map((v, i) => {
                const win = v != null && v === best && !tie;
                return (
                  <View key={rows[i].id} style={{ width: w, alignItems: 'center' }}>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: win ? 'rgba(46,125,50,0.12)' : 'transparent' }}>
                      <T size="sm" semibold={win} color={win ? brand.green : v == null ? colors.muted : colors.text}>{v == null ? '—' : m.fmt(v)}</T>
                    </View>
                  </View>
                );
              })}
            </Line>
          );
        })}
        {used.length ? <T size="sm" bold style={{ paddingTop: space.md, paddingBottom: 4 }}>{t('services.title')}</T> : null}
        {used.map((s) => (
          <Line key={s.key} label={serviceName(s, lng)}>
            {rows.map((r) => (
              <View key={r.id} style={{ width: w, alignItems: 'center' }}>
                {r.services.includes(s.key)
                  ? <Row gap={4}><ServiceIcon icon={s.icon} size={16} /><Ionicons name="checkmark" size={16} color={colors.success} /></Row>
                  : <Ionicons name="remove" size={16} color={colors.muted} />}
              </View>
            ))}
          </Line>
        ))}
      </Card>
      <T size="xs" muted center>{t('trust.compareNote')}</T>
      {rows.length < 3 ? <Button variant="secondary" icon="add" title={t('trust.addToCompare')} onPress={() => router.push('/clubs')} /> : null}
    </Screen>
  );
}
