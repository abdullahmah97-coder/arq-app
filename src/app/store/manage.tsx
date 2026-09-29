// لوحة تحكم المتجر أو المطعم: الحالة، الصفحة، العروض والأكواد وتقريرها، تنبيه العملاء المرتبطين، المنتجات والأسعار والكميات،
// والاستيراد من ملف، ولطلبات واشتراكات الوجبات للمطاعم. المالك يفتحها لأي متجر (?id=)
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, I18nManager, Pressable, View } from 'react-native';
import { AdminBanner, Metric } from '@/components/partners/parts';
import { PromptModal } from '@/components/PromptModal';
import { BrandLogo, ProductTile } from '@/components/store/parts';
import { Avatar, Button, Card, Empty, Input, Loading, Row, Screen, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import {
  brandOfferStats, deleteProduct, loadAnnouncements, loadBrand, loadBrandOffers, loadMyBrand, saveProduct, sendStoreAnnouncement, storeAudience,
  type Announcement, type Brand, type BrandOffer, type OfferStat, type Product,
} from '@/lib/brands';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { loadSubscribers, respondSubscription, type Subscriber } from '@/lib/mealSubs';
import { errorKey, publicUrl } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

const STATUS_COLOR = { pending: brand.amber, approved: '#2E9E6A', rejected: '#C0392B', suspended: '#8A8A8A' } as const;
const STATUS_ICON = { pending: 'time-outline', approved: 'checkmark-circle', rejected: 'close-circle', suspended: 'eye-off-outline' } as const;
const arDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

export default function ManageStore() {
  const { id: adminId } = useLocalSearchParams<{ id?: string }>();
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId } = useUser();
  const [b, setB] = useState<Brand | null | undefined>(undefined);
  const [subs, setSubs] = useState<Subscriber[]>([]);
  const [offers, setOffers] = useState<BrandOffer[]>([]);
  const [stats, setStats] = useState<Record<string, OfferStat>>({});
  const [audience, setAudience] = useState({ followers: 0, subscribers: 0 });
  const [news, setNews] = useState<Announcement[]>([]);
  const [stockFor, setStockFor] = useState<Product | null>(null);

  const load = useCallback(() => {
    (adminId ? loadBrand(String(adminId)) : loadMyBrand(userId)).then((x) => {
      setB(x);
      if (!x) return;
      if (x.category === 'restaurant' && x.status === 'approved') loadSubscribers(x.id).then(setSubs).catch(() => {});
      loadBrandOffers(x.id).then(setOffers).catch(() => {});
      brandOfferStats(x.id).then((r) => setStats(Object.fromEntries(r.map((s) => [s.offer_id, s])))).catch(() => {});
      storeAudience(x.id).then(setAudience).catch(() => {});
      loadAnnouncements(x.id).then(setNews).catch(() => {});
    }).catch(() => setB(null));
  }, [userId, adminId]);
  useFocusEffect(load);

  if (b === undefined) return <Loading />;
  if (!b) return (
    <Screen><Empty icon="storefront-outline" text={t('store.noStoreYet')} />
      <Button title={t('store.addYours')} icon="add" onPress={() => router.replace('/store/join')} /></Screen>
  );
  const products = [...(b.brand_products ?? [])].sort((x, y) => y.created_at.localeCompare(x.created_at));
  const restaurant = b.category === 'restaurant';

  const act = (p: Product) => Alert.alert(p.name, '', [
    { text: t('store.editProduct'), onPress: () => router.push({ pathname: '/store/product', params: { brand: b.id, id: p.id } }) },
    { text: t('store.setStock'), onPress: () => setStockFor(p) },
    { text: p.active ? t('store.hide') : t('store.show'), onPress: async () => { await saveProduct(b.id, { ...p, active: !p.active }, p.id); load(); } },
    { text: t('common.delete'), style: 'destructive', onPress: async () => { await deleteProduct(p.id); load(); } },
    { text: t('common.cancel'), style: 'cancel' },
  ]);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('partners.storeDashboard') }} />
      {adminId ? <AdminBanner /> : null}
      <Card style={{ gap: space.md }}>
        <Row gap={space.md}>
          <BrandLogo b={b} size={60} />
          <View style={{ flex: 1, gap: 2 }}>
            <T bold size="lg">{b.name}</T>
            <T size="xs" muted numberOfLines={2}>{b.tagline || t(`store.cat_${b.category}`)}</T>
          </View>
          <Pressable onPress={() => router.push({ pathname: '/store/join', params: adminId ? { id: b.id } : {} })} hitSlop={8} accessibilityLabel={t('store.editStore')}>
            <Ionicons name="create-outline" size={22} color={colors.primary} />
          </Pressable>
        </Row>
        <Row style={{ backgroundColor: STATUS_COLOR[b.status] + '22', borderRadius: radius.md, padding: space.md, alignItems: 'flex-start' }}>
          <Ionicons name={STATUS_ICON[b.status]} size={20} color={STATUS_COLOR[b.status]} />
          <View style={{ flex: 1, gap: 2 }}>
            <T semibold>{t(`store.statusTitle_${b.status}`)}</T>
            <T size="xs" muted style={{ lineHeight: 19 }}>{(b.status === 'rejected' || b.status === 'suspended') && b.review_note ? b.review_note : t(`store.status_${b.status}`)}</T>
          </View>
        </Row>
        {b.status === 'approved' ? <Button variant="secondary" small icon="eye-outline" title={t('store.viewPublic')} onPress={() => router.push({ pathname: '/store/[id]', params: { id: b.id } })} /> : null}
      </Card>

      <Row gap={space.sm}>
        <Metric icon="pricetags-outline" n={offers.filter((o) => o.active).length} label={t('partners.activeOffers')} />
        <Metric icon="cube-outline" n={products.length} label={t(restaurant ? 'partners.dishes' : 'partners.products')} />
        <Metric icon="notifications-outline" n={audience.followers + audience.subscribers} label={t('partners.linkedCustomers')} />
      </Row>

      {restaurant && b.status === 'approved' ? <Subscribers subs={subs} onChange={load} /> : null}

      {/* العروض والأكواد */}
      <Row style={{ justifyContent: 'space-between' }}>
        <T size="lg" bold>{t('partners.offersTitle')}</T>
        <Button small icon="add" title={t('partners.addOffer')} onPress={() => router.push({ pathname: '/store/offer', params: { brand: b.id } })} />
      </Row>
      {offers.length ? offers.map((o) => {
        const s = stats[o.id];
        return (
          <Card key={o.id} onPress={() => router.push({ pathname: '/store/offer', params: { brand: b.id, id: o.id } })} style={{ gap: 6, opacity: o.active ? 1 : 0.6 }}>
            <Row gap={8}>
              <Ionicons name="pricetag-outline" size={16} color={brand.orange} />
              <T semibold style={{ flex: 1 }} numberOfLines={1}>{o.title}</T>
              {o.code ? <T size="xs" semibold color={brand.orange}>{o.code}</T> : null}
            </Row>
            <Row gap={space.md} style={{ flexWrap: 'wrap' }}>
              <T size="xs" muted>{t('partners.views', { n: s?.views ?? 0 })}</T>
              <T size="xs" muted>{t('partners.reveals', { n: s?.reveals ?? 0 })}</T>
              <T size="xs" muted>{t('partners.visits', { n: s?.visits ?? 0 })}</T>
              {!o.active ? <T size="xs" color={colors.danger}>{t('owner.inactive')}</T> : null}
            </Row>
          </Card>
        );
      }) : <T size="sm" muted>{t('partners.noOffers')}</T>}

      <Announce brandId={b.id} audience={audience} news={news} lng={lng} onSent={load} disabled={b.status !== 'approved'} />

      {/* المنتجات / المنيو */}
      <Row style={{ justifyContent: 'space-between' }}>
        <T size="lg" bold style={{ flex: 1 }}>{t(restaurant ? 'store.myMenu' : 'store.myProducts', { n: products.length })}</T>
        <Button small variant="secondary" icon="cloud-upload-outline" title={t('partners.import')} onPress={() => router.push({ pathname: '/store/import', params: { brand: b.id } })} />
        <Button small icon="add" title={t('store.addProduct')} onPress={() => router.push({ pathname: '/store/product', params: { brand: b.id } })} />
      </Row>
      {products.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, justifyContent: 'space-between' }}>
          {products.map((p) => <ProductTile key={p.id} p={p} width="47.5%" showStock onPress={() => act(p)} />)}
        </View>
      ) : <Empty icon="shirt-outline" text={t('store.addFirstProduct')} />}
      <T size="xs" muted center style={{ lineHeight: 20 }}>{t('store.rules')}</T>

      <PromptModal visible={!!stockFor} title={t('store.setStock')} message={t('store.stockHint')} onClose={() => setStockFor(null)}
        fields={[{ key: 'stock', keyboardType: 'number-pad', placeholder: '20', initial: stockFor?.stock != null ? String(stockFor.stock) : '' }]}
        onSubmit={async (v) => {
          if (!stockFor) return;
          const raw = arDigits(v.stock.trim());
          const n = raw === '' ? null : Math.round(Number(raw));
          if (n != null && (!Number.isFinite(n) || n < 0)) return Alert.alert(t('errors.invalidNumber'));
          try { await saveProduct(b.id, { ...stockFor, stock: n }, stockFor.id); setStockFor(null); load(); } catch (e) { Alert.alert(t(errorKey(e))); }
        }} />
    </Screen>
  );
}

/** تنبيه العملاء المرتبطين فقط (مشتركين الوجبات واللي اشتركوا في تنبيهات المتجر)، مرة باليوم */
function Announce({ brandId, audience, news, lng, onSent, disabled }: {
  brandId: string; audience: { followers: number; subscribers: number }; news: Announcement[]; lng: 'ar' | 'en'; onSent: () => void; disabled: boolean;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const total = audience.followers + audience.subscribers;
  const send = async () => {
    if (title.trim().length < 3 || body.trim().length < 3) return Alert.alert(t('partners.err_announce'));
    setBusy(true);
    try {
      const n = await sendStoreAnnouncement(brandId, title, body);
      Alert.alert(t('partners.sent'), t('partners.sentTo', { n }));
      setTitle(''); setBody(''); onSent();
    } catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };
  return (
    <Card style={{ gap: space.sm }}>
      <Row gap={8}>
        <Ionicons name="megaphone-outline" size={20} color={colors.primary} />
        <T bold style={{ flex: 1 }}>{t('partners.announceTitle')}</T>
        <T size="xs" muted>{t('partners.audienceN', { n: total })}</T>
      </Row>
      <T size="xs" muted style={{ lineHeight: 19 }}>{t('partners.announceRuleStore')}</T>
      <Input value={title} onChangeText={setTitle} maxLength={60} placeholder={t('partners.announceTitlePh')} />
      <Input value={body} onChangeText={setBody} maxLength={240} multiline style={{ minHeight: 70, textAlignVertical: 'top' }} placeholder={t('partners.announceBodyPh')} />
      <Button icon="paper-plane-outline" title={t('partners.sendAnnounce')} loading={busy} disabled={disabled || !total} onPress={send} />
      {news.map((a) => (
        <View key={a.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, gap: 2 }}>
          <T size="sm" semibold>{a.title}</T>
          <T size="xs" muted>{timeAgo(a.created_at, lng)} · {t('partners.sentTo', { n: a.recipients })}</T>
        </View>
      ))}
    </Card>
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
