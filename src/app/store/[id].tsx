// صفحة متجر: نبذة وروابط ومنتجات. وللمطاعم الصحية: منيو بالسعرات مع «أكلتها» واشتراك وجبات يرتبط بخطتك
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, View } from 'react-native';
import { BrandLogo, ProductTile, RedeemSoon } from '@/components/store/parts';
import { Button, Card, Empty, Loading, Row, Screen, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { hasMacros, loadBrand, type Brand, type Product } from '@/lib/brands';
import { useLocalized } from '@/lib/i18n';
import { endSubscription, mySubscriptionWith, type MealSub } from '@/lib/mealSubs';
import { logFood, slotForHour } from '@/lib/nutrition';
import { errorKey } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

export default function BrandPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { num } = useLocalized();
  const { userId, profile } = useUser();
  const [b, setB] = useState<Brand | null | undefined>(undefined);
  const [sub, setSub] = useState<MealSub | null>(null);
  const [logged, setLogged] = useState<Set<string>>(new Set());
  useFocusEffect(useCallback(() => {
    loadBrand(String(id)).then(setB).catch(() => setB(null));
    mySubscriptionWith(String(id), userId).then(setSub).catch(() => {});
  }, [id, userId]));
  if (b === undefined) return <Loading />;
  if (!b) return <Screen><Empty text={t('store.notFound')} /></Screen>;
  const products = (b.brand_products ?? []).filter((p) => p.active);
  const restaurant = b.category === 'restaurant';
  const mine = b.owner === userId;

  const ate = async (p: Product) => {
    try {
      await logFood(userId, {
        slot: slotForHour(new Date().getHours()), name: `${p.name} · ${b.name}`, source: 'store',
        kcal: p.kcal ?? 0, protein_g: Number(p.protein_g ?? 0), carbs_g: Number(p.carbs_g ?? 0), fat_g: Number(p.fat_g ?? 0),
      });
      setLogged((s) => new Set(s).add(p.id));
    } catch (e) { Alert.alert(t(errorKey(e))); }
  };
  const stop = () => sub && Alert.alert(t('subs.endTitle'), t('subs.endBody', { name: b.name }), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('subs.end'), style: 'destructive', onPress: async () => { try { await endSubscription(sub.id); setSub(null); } catch (e) { Alert.alert(t(errorKey(e))); } } },
  ]);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: b.name }} />
      <View style={{ backgroundColor: brand.deepGreen, borderRadius: radius.lg, padding: space.xl, gap: space.md, alignItems: 'center' }}>
        <BrandLogo b={b} size={84} />
        <T size="xl" bold color={brand.cream}>{b.name}</T>
        {b.tagline ? <T center color={brand.sand}>{b.tagline}</T> : null}
        <View style={{ backgroundColor: 'rgba(248,237,218,0.14)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 2 }}>
          <T size="xs" semibold color={brand.amber}>{[t(`store.cat_${b.category}`), b.city].filter(Boolean).join(' · ')}</T>
        </View>
        <Row gap={space.sm}>
          {b.website ? <LinkBtn icon="globe-outline" label={t('store.website')} url={b.website} /> : null}
          {b.instagram ? <LinkBtn icon="logo-instagram" label={`@${b.instagram}`} url={`https://instagram.com/${b.instagram}`} /> : null}
        </Row>
      </View>
      {b.description ? <T style={{ lineHeight: 26 }}>{b.description}</T> : null}

      {/* اشتراك الوجبات: يربط المطعم بجدولك الغذائي */}
      {restaurant && !mine ? (
        <Card style={{ gap: space.sm, borderColor: brand.orange, borderWidth: 1.5 }}>
          <Row gap={8}>
            <Ionicons name={sub?.status === 'active' ? 'checkmark-circle' : 'calendar-outline'} size={20} color={sub?.status === 'active' ? colors.success : brand.orange} />
            <T bold style={{ flex: 1 }}>{t(sub ? `subs.state_${sub.status}` : 'subs.ctaTitle')}</T>
          </Row>
          <T size="sm" muted style={{ lineHeight: 22 }}>{t(sub ? `subs.stateBody_${sub.status}` : 'subs.ctaBody', { name: b.name })}</T>
          {sub ? (
            <Row gap={space.sm}>
              {sub.status === 'active' ? <Button small style={{ flex: 1 }} icon="calendar" title={t('subs.openPlan')} onPress={() => router.push('/(tabs)/plan')} /> : null}
              <Button small variant="ghost" title={t(sub.status === 'active' ? 'subs.end' : 'subs.cancelRequest')} onPress={stop} />
            </Row>
          ) : (
            <Button icon="share-social-outline" title={t('subs.cta')} onPress={() => router.push({ pathname: '/store/subscribe', params: { brand: b.id } })} />
          )}
        </Card>
      ) : null}

      <T size="lg" bold>{t(restaurant ? 'store.menu' : 'store.products')}</T>
      {restaurant && products.some(hasMacros) ? (
        <View style={{ gap: space.sm }}>
          {products.map((p) => (
            <Card key={p.id} style={{ gap: 6 }}>
              <Row>
                <View style={{ flex: 1, gap: 2 }}>
                  <T semibold>{p.name}</T>
                  {hasMacros(p) ? (
                    <T size="xs" muted>{num(p.kcal ?? 0)} {t('common.kcal')} · {t('plan.protein')} {num(+(p.protein_g ?? 0))} · {t('plan.carbs')} {num(+(p.carbs_g ?? 0))} · {t('plan.fat')} {num(+(p.fat_g ?? 0))} {t('common.g')}</T>
                  ) : null}
                </View>
                {p.price_sar != null ? <T bold color={brand.orange}>{num(+p.price_sar)} {t('store.sar')}</T> : null}
              </Row>
              {p.description ? <T size="xs" muted>{p.description}</T> : null}
              {hasMacros(p) ? (
                <Pressable onPress={() => ate(p)} disabled={logged.has(p.id)} accessibilityRole="button"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: radius.pill, borderWidth: 1,
                    borderColor: logged.has(p.id) ? colors.success : colors.primary, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Ionicons name={logged.has(p.id) ? 'checkmark-circle' : 'add-circle-outline'} size={15} color={logged.has(p.id) ? colors.success : colors.primary} />
                  <T size="xs" semibold color={logged.has(p.id) ? colors.success : colors.primary}>{logged.has(p.id) ? t('food.logged') : t('food.ate')}</T>
                </Pressable>
              ) : null}
            </Card>
          ))}
        </View>
      ) : products.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, justifyContent: 'space-between' }}>
          {products.map((p) => <ProductTile key={p.id} p={p} width="47.5%" fallbackUrl={b.website} />)}
        </View>
      ) : <Empty icon={restaurant ? 'restaurant-outline' : 'shirt-outline'} text={t('store.noProducts')} />}
      <T size="xs" muted center>{t(restaurant ? 'store.orderNote' : 'store.buyNote')}</T>
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
