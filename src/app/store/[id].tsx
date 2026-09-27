// صفحة براند: نبذة، روابط، ومنتجاته (الشراء من موقع البراند)
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, View } from 'react-native';
import { BrandLogo, ProductTile, RedeemSoon } from '@/components/store/parts';
import { Empty, Loading, Row, Screen, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { loadBrand, type Brand } from '@/lib/brands';
import { brand, radius, space } from '@/theme';

export default function BrandPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { profile } = useUser();
  const [b, setB] = useState<Brand | null | undefined>(undefined);
  useEffect(() => { loadBrand(String(id)).then(setB).catch(() => setB(null)); }, [id]);
  if (b === undefined) return <Loading />;
  if (!b) return <Screen><Empty text={t('store.notFound')} /></Screen>;
  const products = (b.brand_products ?? []).filter((p) => p.active);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: b.name }} />
      <View style={{ backgroundColor: brand.deepGreen, borderRadius: radius.lg, padding: space.xl, gap: space.md, alignItems: 'center' }}>
        <BrandLogo b={b} size={84} />
        <T size="xl" bold color={brand.cream}>{b.name}</T>
        {b.tagline ? <T center color={brand.sand}>{b.tagline}</T> : null}
        <View style={{ backgroundColor: 'rgba(248,237,218,0.14)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 2 }}>
          <T size="xs" semibold color={brand.amber}>{t(`store.cat_${b.category}`)}</T>
        </View>
        <Row gap={space.sm}>
          {b.website ? <LinkBtn icon="globe-outline" label={t('store.website')} url={b.website} /> : null}
          {b.instagram ? <LinkBtn icon="logo-instagram" label={`@${b.instagram}`} url={`https://instagram.com/${b.instagram}`} /> : null}
        </Row>
      </View>
      {b.description ? <T style={{ lineHeight: 26 }}>{b.description}</T> : null}

      <T size="lg" bold>{t('store.products')}</T>
      {products.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, justifyContent: 'space-between' }}>
          {products.map((p) => <ProductTile key={p.id} p={p} width="47.5%" fallbackUrl={b.website} />)}
        </View>
      ) : <Empty icon="shirt-outline" text={t('store.noProducts')} />}
      <T size="xs" muted center>{t('store.buyNote')}</T>
      <RedeemSoon points={profile.points} />
    </Screen>
  );
}

function LinkBtn({ icon, label, url }: { icon: 'globe-outline' | 'logo-instagram'; label: string; url: string }) {
  return (
    <Pressable onPress={() => Linking.openURL(url)} accessibilityRole="link"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: brand.orange, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}>
      <Ionicons name={icon} size={16} color={brand.cream} />
      <T size="sm" semibold color={brand.cream}>{label}</T>
    </Pressable>
  );
}
