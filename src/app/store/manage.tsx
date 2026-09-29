// لوحة متجري: حالة المراجعة، تعديل البيانات، إدارة المنتجات، وللمطاعم: طلبات واشتراكات الوجبات
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, I18nManager, Pressable, View } from 'react-native';
import { BrandLogo, ProductTile } from '@/components/store/parts';
import { Avatar, Button, Card, Empty, Loading, Row, Screen, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { deleteProduct, loadMyBrand, saveProduct, type Brand, type Product } from '@/lib/brands';
import { useLocalized } from '@/lib/i18n';
import { loadSubscribers, respondSubscription, type Subscriber } from '@/lib/mealSubs';
import { errorKey, publicUrl } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

const STATUS_COLOR = { pending: brand.amber, approved: '#2E9E6A', rejected: '#C0392B' } as const;
const STATUS_ICON = { pending: 'time-outline', approved: 'checkmark-circle', rejected: 'close-circle' } as const;

export default function ManageStore() {
  const { t } = useTranslation();
  const { userId } = useUser();
  const [b, setB] = useState<Brand | null | undefined>(undefined);
  const [subs, setSubs] = useState<Subscriber[]>([]);
  const load = useCallback(() => {
    loadMyBrand(userId).then((x) => {
      setB(x);
      if (x?.category === 'restaurant' && x.status === 'approved') loadSubscribers(x.id).then(setSubs).catch(() => {});
    }).catch(() => setB(null));
  }, [userId]);
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

      {b.category === 'restaurant' && b.status === 'approved' ? <Subscribers subs={subs} onChange={load} /> : null}

      <Row style={{ justifyContent: 'space-between' }}>
        <T size="lg" bold>{t(b.category === 'restaurant' ? 'store.myMenu' : 'store.myProducts', { n: products.length })}</T>
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

/** طلبات واشتراكات الوجبات: قبول/اعتذار، وفتح جدول المشترك */
function Subscribers({ subs, onChange }: { subs: Subscriber[]; onChange: () => void }) {
  const { t } = useTranslation();
  const { num } = useLocalized();
  const respond = async (s: Subscriber, accept: boolean) => {
    try { await respondSubscription(s.id, accept); onChange(); } catch (e) { Alert.alert(t(errorKey(e))); }
  };
  return (
    <Card style={{ gap: space.md }}>
      <Row gap={8}>
        <Ionicons name="people-outline" size={20} color={colors.primary} />
        <T bold style={{ flex: 1 }}>{t('subs.kitchenTitle')}</T>
        <T size="xs" muted>{t('subs.activeN', { n: subs.filter((s) => s.status === 'active').length })}</T>
      </Row>
      {subs.length ? subs.map((s) => (
        <Pressable key={s.id} disabled={s.status !== 'active'} onPress={() => router.push({ pathname: '/store/subscriber/[id]', params: { id: s.id } })}
          style={{ gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm }}>
          <Row gap={space.sm}>
            <Avatar size={36} uri={publicUrl('avatars', s.avatar_url)} name={s.name} />
            <View style={{ flex: 1 }}>
              <T semibold>{s.name}</T>
              <T size="xs" muted>{s.calories != null ? t('subs.targetsLine', { kcal: num(s.calories), p: num(s.protein_g ?? 0), c: num(s.carbs_g ?? 0), f: num(s.fat_g ?? 0) }) : t('subs.noPlanYet')}</T>
            </View>
            {s.status === 'active' ? <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={16} color={colors.muted} /> : null}
          </Row>
          <T size="xs" muted>{s.slots.map((x) => t(`plan.slot_${x}`)).join('، ')}{s.notes ? ` · ${s.notes}` : ''}</T>
          {s.status === 'requested' ? (
            <Row gap={space.sm}>
              <Button small style={{ flex: 1 }} icon="checkmark" title={t('subs.accept')} onPress={() => respond(s, true)} />
              <Button small variant="ghost" title={t('subs.decline')} onPress={() => respond(s, false)} />
            </Row>
          ) : null}
        </Pressable>
      )) : <T size="sm" muted>{t('subs.kitchenEmpty')}</T>}
    </Card>
  );
}
