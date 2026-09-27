// لوحة متجري: حالة المراجعة، تعديل البيانات، وإدارة المنتجات
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { BrandLogo, ProductTile } from '@/components/store/parts';
import { Button, Card, Empty, Loading, Row, Screen, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { deleteProduct, loadMyBrand, saveProduct, type Brand, type Product } from '@/lib/brands';
import { brand, colors, radius, space } from '@/theme';

const STATUS_COLOR = { pending: brand.amber, approved: '#2E9E6A', rejected: '#C0392B' } as const;
const STATUS_ICON = { pending: 'time-outline', approved: 'checkmark-circle', rejected: 'close-circle' } as const;

export default function ManageStore() {
  const { t } = useTranslation();
  const { userId } = useUser();
  const [b, setB] = useState<Brand | null | undefined>(undefined);
  const load = useCallback(() => { loadMyBrand(userId).then(setB).catch(() => setB(null)); }, [userId]);
  useFocusEffect(load);

  if (b === undefined) return <Loading />;
  if (!b) return (
    <Screen><Empty icon="storefront-outline" text={t('store.noStoreYet')} />
      <Button title={t('store.addYours')} icon="add" onPress={() => router.replace('/store/join')} /></Screen>
  );
  const products = [...(b.brand_products ?? [])].sort((x, y) => y.created_at.localeCompare(x.created_at));

  const act = (p: Product) => Alert.alert(p.name, '', [
    { text: t('store.editProduct'), onPress: () => router.push({ pathname: '/store/product', params: { brand: b.id, id: p.id } }) },
    { text: p.active ? t('store.hide') : t('store.show'), onPress: async () => { await saveProduct(b.id, { ...p, active: !p.active }, p.id); load(); } },
    { text: t('common.delete'), style: 'destructive', onPress: async () => { await deleteProduct(p.id); load(); } },
    { text: t('common.cancel'), style: 'cancel' },
  ]);

  return (
    <Screen edges={['bottom']}>
      <Card style={{ gap: space.md }}>
        <Row gap={space.md}>
          <BrandLogo b={b} size={60} />
          <View style={{ flex: 1, gap: 2 }}>
            <T bold size="lg">{b.name}</T>
            <T size="xs" muted numberOfLines={2}>{b.tagline || t(`store.cat_${b.category}`)}</T>
          </View>
          <Pressable onPress={() => router.push('/store/join')} hitSlop={8} accessibilityLabel={t('store.editStore')}>
            <Ionicons name="create-outline" size={22} color={colors.primary} />
          </Pressable>
        </Row>
        <Row style={{ backgroundColor: STATUS_COLOR[b.status] + '22', borderRadius: radius.md, padding: space.md, alignItems: 'flex-start' }}>
          <Ionicons name={STATUS_ICON[b.status]} size={20} color={STATUS_COLOR[b.status]} />
          <View style={{ flex: 1, gap: 2 }}>
            <T semibold>{t(`store.statusTitle_${b.status}`)}</T>
            <T size="xs" muted style={{ lineHeight: 19 }}>{b.status === 'rejected' && b.review_note ? b.review_note : t(`store.status_${b.status}`)}</T>
          </View>
        </Row>
        {b.status === 'approved' ? <Button variant="secondary" small icon="eye-outline" title={t('store.viewPublic')} onPress={() => router.push({ pathname: '/store/[id]', params: { id: b.id } })} /> : null}
      </Card>

      <Row style={{ justifyContent: 'space-between' }}>
        <T size="lg" bold>{t('store.myProducts', { n: products.length })}</T>
        <Button small icon="add" title={t('store.addProduct')} onPress={() => router.push({ pathname: '/store/product', params: { brand: b.id } })} />
      </Row>
      {products.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, justifyContent: 'space-between' }}>
          {products.map((p) => <ProductTile key={p.id} p={p} width="47.5%" onPress={() => act(p)} />)}
        </View>
      ) : <Empty icon="shirt-outline" text={t('store.addFirstProduct')} />}
      <T size="xs" muted center style={{ lineHeight: 20 }}>{t('store.rules')}</T>
    </Screen>
  );
}
