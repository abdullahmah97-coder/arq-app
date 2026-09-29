// المتاجر: مطاعم صحية (بسعرات الأطباق واشتراك الوجبات)، ملابس رياضية، مكملات ومعدات + «أضف متجرك» + استبدال النقاط (قريباً)
import { Ionicons } from '@expo/vector-icons';
import { ImageBackground } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { I18nManager, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { BrandLogo, ProductTile, RedeemSoon } from '@/components/store/parts';
import { Card, Empty, Row, Screen, Segmented, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { BRAND_CATEGORIES, FEATURED_CATEGORIES, loadBrands, loadMyBrand, type Brand, type BrandCategory } from '@/lib/brands';
import { brand, colors, radius, space } from '@/theme';

const CAT_ICON: Partial<Record<BrandCategory, keyof typeof Ionicons.glyphMap>> = { restaurant: 'restaurant', apparel: 'shirt', supplements: 'flask', equipment: 'barbell' };

export default function Store() {
  const { t } = useTranslation();
  const { userId, profile } = useUser();
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [mine, setMine] = useState<Brand | null>(null);
  const [cat, setCat] = useState<BrandCategory | 'all'>('all');
  useFocusEffect(useCallback(() => {
    loadBrands().then(setBrands).catch(() => setBrands([]));
    loadMyBrand(userId).then(setMine).catch(() => {});
  }, [userId]));

  const list = (brands ?? []).filter((b) => cat === 'all' || b.category === cat);
  const count = (c: BrandCategory) => (brands ?? []).filter((b) => b.category === c).length;
  // الأقسام الرئيسية دايماً ظاهرة، والباقي إذا فيه متاجر
  const cats = BRAND_CATEGORIES.filter((c) => FEATURED_CATEGORIES.includes(c) || count(c) > 0);

  return (
    <Screen edges={['bottom']}>
      <ImageBackground source={require('../../../assets/imagery/fabric-flow.jpg')} style={{ minHeight: 190, borderRadius: 22, overflow: 'hidden' }} contentFit="cover">
        <LinearGradient colors={['rgba(10,51,45,0.25)', 'rgba(10,51,45,0.95)']} style={StyleSheet.absoluteFill} />
        <View style={{ flex: 1, justifyContent: 'flex-end', padding: space.lg, gap: 4 }}>
          <T size="xs" semibold color={brand.amber}>{t('store.eyebrow')}</T>
          <T size="xl" bold color={brand.cream}>{t('store.title')}</T>
          <T size="sm" color={brand.sand} style={{ lineHeight: 22 }}>{t('store.intro')}</T>
        </View>
      </ImageBackground>

      <Pressable onPress={() => router.push(mine ? '/store/manage' : '/store/join')} accessibilityRole="button">
        <Row style={{ backgroundColor: colors.card, borderWidth: 1.5, borderColor: brand.orange, borderStyle: 'dashed', borderRadius: radius.lg, padding: space.lg }} gap={space.md}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={mine ? 'storefront' : 'add'} size={24} color={brand.cream} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T bold>{mine ? t('store.manageMine', { name: mine.name }) : t('store.addYours')}</T>
            <T size="xs" muted style={{ lineHeight: 19 }}>{mine ? t(`store.status_${mine.status}`) : t('store.addYoursBody')}</T>
          </View>
          <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.muted} />
        </Row>
      </Pressable>

      {/* الأقسام الرئيسية دايماً ظاهرة: مطاعم صحية، ملابس رياضية، مكملات غذائية، معدات رياضية */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {FEATURED_CATEGORIES.map((c) => {
          const on = cat === c;
          return (
            <Pressable key={c} onPress={() => setCat(on ? 'all' : c)} accessibilityRole="button" accessibilityState={{ selected: on }}
              style={({ pressed }) => ({ width: '48%', flexGrow: 1, gap: 6, borderRadius: radius.lg, padding: space.md, borderWidth: 1.5, opacity: pressed ? 0.85 : 1,
                backgroundColor: on ? brand.deepGreen : colors.card, borderColor: on ? brand.deepGreen : colors.border })}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={CAT_ICON[c] ?? 'storefront'} size={20} color={brand.cream} />
              </View>
              <T bold color={on ? brand.cream : colors.text}>{t(`store.cat_${c}`)}</T>
              <T size="xs" color={on ? brand.sand : colors.muted}>{t(`store.featured_${c}`)}</T>
            </Pressable>
          );
        })}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Segmented<BrandCategory | 'all'> wrap value={cat} onChange={setCat}
          options={[{ value: 'all', label: t('store.all') }, ...cats.map((c) => ({ value: c, label: t(`store.cat_${c}`) }))]} />
      </ScrollView>

      {brands === null ? null : list.length ? list.map((b) => {
        const products = (b.brand_products ?? []).filter((p) => p.active);
        return (
          <Card key={b.id} style={{ gap: space.md }} onPress={() => router.push({ pathname: '/store/[id]', params: { id: b.id } })}>
            <Row gap={space.md}>
              <BrandLogo b={b} />
              <View style={{ flex: 1, gap: 2 }}>
                <T bold size="lg">{b.name}</T>
                <T size="xs" muted numberOfLines={2}>{[t(`store.cat_${b.category}`), b.city].filter(Boolean).join(' · ')}{b.tagline ? ` — ${b.tagline}` : ''}</T>
              </View>
              <T size="xs" muted>{t('store.productsN', { n: products.length, count: products.length })}</T>
            </Row>
            {products.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md }}>
                {products.slice(0, 8).map((p) => <ProductTile key={p.id} p={p} width={132} fallbackUrl={b.website} onPress={() => router.push({ pathname: '/store/[id]', params: { id: b.id } })} />)}
              </ScrollView>
            ) : null}
          </Card>
        );
      }) : <Empty icon={cat === 'restaurant' ? 'restaurant-outline' : 'storefront-outline'} text={t(cat === 'all' ? 'store.empty' : `store.emptyCat_${cat === 'restaurant' ? 'restaurant' : 'other'}`)} />}
      <RedeemSoon points={profile.points} />
    </Screen>
  );
}
