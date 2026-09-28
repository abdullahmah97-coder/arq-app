// لوحة المالك (تظهر لمالك التطبيق فقط): تقارير المختبرين + طلبات المتاجر
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, I18nManager, Linking, Modal, Pressable, TextInput, View } from 'react-native';
import { Num } from '@/components/pulse/widgets';
import { BrandLogo } from '@/components/store/parts';
import { Button, Card, Empty, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import {
  isAdmin, loadBrandRequests, loadReports, REPORT_STATUSES, reportShotUrl, reviewBrand, STATUS_COLOR, updateReport, type Report, type ReportStatus,
} from '@/lib/owner';
import type { Brand } from '@/lib/brands';
import { loadOffers, type Offer } from '@/lib/clubs';
import { errorKey } from '@/lib/supabase';
import { brand, colors, fonts, radius, space } from '@/theme';

const CAT_ICON = { bug: 'bug', idea: 'bulb', design: 'color-palette', other: 'chatbubble-ellipses' } as const;

export default function Owner() {
  const { t } = useTranslation();
  const [ok, setOk] = useState<boolean | null>(null);
  const [tab, setTab] = useState<'reports' | 'brands' | 'offers'>('reports');
  const [offers, setOffers] = useState<Offer[]>([]);
  const [filter, setFilter] = useState<ReportStatus | 'all'>('new');
  const [reports, setReports] = useState<Report[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [shot, setShot] = useState<string | null>(null);

  const load = useCallback(async () => {
    const admin = await isAdmin();
    setOk(admin);
    if (!admin) return;
    const [r, b, o] = await Promise.all([loadReports(), loadBrandRequests(), loadOffers()]);
    setReports(r); setBrands(b); setOffers(o);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (ok === null) return <Loading />;
  if (!ok) return <Screen><Empty icon="lock-closed-outline" text={t('owner.noAccess')} /></Screen>;

  const count = (s: ReportStatus) => reports.filter((r) => r.status === s).length;
  const shown = reports.filter((r) => filter === 'all' || r.status === filter);
  const pending = brands.filter((b) => b.status === 'pending');
  const others = brands.filter((b) => b.status !== 'pending');

  return (
    <Screen edges={['bottom']}>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Stat n={count('new')} label={t('owner.newReports')} color={STATUS_COLOR.new} />
        <Stat n={count('fixed')} label={t('owner.fixed')} color={STATUS_COLOR.fixed} />
        <Stat n={pending.length} label={t('owner.pendingBrands')} color={brand.orange} />
      </View>
      <Pressable onPress={() => router.push('/owner-nudges')} accessibilityRole="button"
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: brand.deepGreen, borderRadius: radius.md, padding: space.md, opacity: pressed ? 0.85 : 1 })}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="flame" size={22} color={brand.cream} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T semibold color={brand.cream}>{t('nudge.button')}</T>
          <T size="xs" color="rgba(248,237,218,0.75)">{t('nudge.buttonHint')}</T>
        </View>
        <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={brand.cream} />
      </Pressable>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'reports', label: `${t('owner.reports')} (${reports.length})` }, { value: 'brands', label: `${t('owner.brands')} (${pending.length})` }, { value: 'offers', label: `${t('owner.offers')} (${offers.length})` }]} />

      {tab === 'offers' ? (
        <>
          <Row gap={space.sm}>
            <View style={{ flex: 1 }}><Button icon="add" title={t('clubs.addOffer')} onPress={() => router.push('/clubs/offer')} /></View>
            <View style={{ flex: 1 }}><Button variant="secondary" icon="image-outline" title={t('owner.chainsLogos')} onPress={() => router.push({ pathname: '/clubs', params: { tab: 'chains' } })} /></View>
          </Row>
          <T size="xs" muted>{t('owner.offersHint')}</T>
          {offers.length ? offers.map((o) => (
            <Pressable key={o.id} onPress={() => router.push({ pathname: '/clubs/offer', params: o.chain_id ? { chain: o.chain_id, id: o.id } : { gym: o.gym_id!, id: o.id } })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md, opacity: o.active ? 1 : 0.55 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <T semibold numberOfLines={1}>{o.gym_chains?.name || o.gyms?.chain || o.gyms?.name} · {o.title}</T>
                <T size="xs" muted>{+o.price_sar} {t('clubs.sar')}{o.ends_on ? ` · ${t('clubs.until', { d: o.ends_on })}` : ''}{o.active ? '' : ` · ${t('owner.inactive')}`}</T>
              </View>
              <Ionicons name="create-outline" size={18} color={colors.muted} />
            </Pressable>
          )) : <Empty icon="pricetags-outline" text={t('clubs.noOffers')} />}
        </>
      ) : null}

      {tab === 'offers' ? null : tab === 'reports' ? (
        <>
          <Segmented<ReportStatus | 'all'> wrap value={filter} onChange={setFilter}
            options={[{ value: 'all', label: t('store.all') }, ...REPORT_STATUSES.map((s) => ({ value: s, label: `${t(`owner.st_${s}`)} ${count(s) || ''}`.trim() }))]} />
          {shown.length ? shown.map((r) => <ReportCard key={r.id} r={r} onShot={async (p) => setShot((await reportShotUrl(p)) ?? null)} onChanged={load} />)
            : <Empty icon="checkmark-done-outline" text={t('owner.noReports')} />}
        </>
      ) : (
        <>
          {pending.length ? pending.map((b) => <BrandRequest key={b.id} b={b} onDone={load} />) : <Empty icon="storefront-outline" text={t('owner.noBrandRequests')} />}
          {others.length ? <T bold>{t('owner.reviewed')}</T> : null}
          {others.map((b) => (
            <Card key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }} onPress={() => router.push({ pathname: '/store/[id]', params: { id: b.id } })}>
              <BrandLogo b={b} size={40} />
              <T semibold style={{ flex: 1 }}>{b.name}</T>
              <T size="xs" semibold color={b.status === 'approved' ? STATUS_COLOR.fixed : colors.danger}>{t(`store.statusTitle_${b.status}`)}</T>
            </Card>
          ))}
        </>
      )}

      <Modal visible={!!shot} transparent animationType="fade" onRequestClose={() => setShot(null)}>
        <Pressable onPress={() => setShot(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: space.lg }}>
          {shot ? <Image source={{ uri: shot }} style={{ width: '100%', height: '80%' }} contentFit="contain" /> : null}
        </Pressable>
      </Modal>
    </Screen>
  );
}

function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: 2 }}>
      <Num size={28} color={color}>{n}</Num>
      <T size="xs" muted>{label}</T>
    </View>
  );
}

function ReportCard({ r, onShot, onChanged }: { r: Report; onShot: (path: string) => void; onChanged: () => void }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [note, setNote] = useState(r.admin_note ?? '');
  const [saving, setSaving] = useState(false);
  const save = async (patch: { status?: ReportStatus; admin_note?: string | null }) => {
    setSaving(true);
    try { await updateReport(r.id, patch); onChanged(); } catch (e) { Alert.alert(t(errorKey(e))); } finally { setSaving(false); }
  };
  return (
    <Card style={{ gap: space.sm, borderColor: r.status === 'new' ? STATUS_COLOR.new : colors.border }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={6}>
          <Ionicons name={CAT_ICON[r.category]} size={16} color={colors.primary} />
          <T size="sm" semibold>{t(`beta.cat_${r.category}`)}</T>
        </Row>
        <T size="xs" muted>{timeAgo(r.created_at, lng)}</T>
      </Row>
      <T style={{ lineHeight: 24 }}>{r.message}</T>
      <T size="xs" muted>
        {r.profiles ? `@${r.profiles.username}` : ''}{r.screen ? ` · ${t('owner.screen')}: ${r.screen}` : ''} · {[r.app_version, r.platform, r.variant].filter(Boolean).join(' · ')}
      </T>
      {r.screenshot_path ? (
        <Pressable onPress={() => onShot(r.screenshot_path!)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="image" size={16} color={colors.primary} /><T size="sm" semibold color={colors.primary}>{t('owner.viewShot')}</T>
        </Pressable>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {REPORT_STATUSES.map((s) => {
          const on = r.status === s;
          return (
            <Pressable key={s} disabled={saving || on} onPress={() => save({ status: s })}
              style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: on ? STATUS_COLOR[s] : colors.cardAlt }}>
              <T size="xs" semibold color={on ? '#fff' : colors.text}>{t(`owner.st_${s}`)}</T>
            </Pressable>
          );
        })}
      </View>
      <Row>
        <TextInput value={note} onChangeText={setNote} placeholder={t('owner.notePh')} placeholderTextColor={colors.muted} maxLength={1000}
          style={{ flex: 1, minWidth: 0, minHeight: 40, borderRadius: radius.md, backgroundColor: colors.cardAlt, paddingHorizontal: 12, color: colors.text, fontFamily: fonts.regular, textAlign: 'auto' }} />
        {note !== (r.admin_note ?? '') ? <Button small title={t('store.save')} loading={saving} onPress={() => save({ admin_note: note })} /> : null}
      </Row>
    </Card>
  );
}

function BrandRequest({ b, onDone }: { b: Brand; onDone: () => void }) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const act = async (status: 'approved' | 'rejected') => {
    if (status === 'rejected' && !note.trim()) return Alert.alert(t('owner.rejectNeedsNote'));
    setBusy(status === 'approved' ? 'approve' : 'reject');
    try { await reviewBrand(b.id, status, note); onDone(); } catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(null); }
  };
  return (
    <Card style={{ gap: space.sm }}>
      <Row gap={space.md}>
        <BrandLogo b={b} size={52} />
        <View style={{ flex: 1, gap: 2 }}>
          <T bold>{b.name}</T>
          <T size="xs" muted>{t(`store.cat_${b.category}`)} · {t('store.productsN', { n: b.brand_products?.length ?? 0 })}</T>
        </View>
      </Row>
      {b.tagline ? <T size="sm">{b.tagline}</T> : null}
      {b.description ? <T size="sm" muted>{b.description}</T> : null}
      <Row gap={space.md}>
        {b.website ? <T size="sm" semibold color={colors.primary} style={{ textDecorationLine: 'underline' }}>{b.website}</T> : null}
        {b.instagram ? <Pressable onPress={() => Linking.openURL(`https://instagram.com/${b.instagram}`)}><T size="sm" semibold color={colors.primary}>@{b.instagram}</T></Pressable> : null}
      </Row>
      <TextInput value={note} onChangeText={setNote} placeholder={t('owner.reviewNotePh')} placeholderTextColor={colors.muted} maxLength={300}
        style={{ minHeight: 40, borderRadius: radius.md, backgroundColor: colors.cardAlt, paddingHorizontal: 12, color: colors.text, fontFamily: fonts.regular, textAlign: 'auto' }} />
      <Row gap={space.sm}>
        <View style={{ flex: 1 }}><Button title={t('owner.approve')} icon="checkmark-circle-outline" loading={busy === 'approve'} onPress={() => act('approved')} /></View>
        <View style={{ flex: 1 }}><Button title={t('owner.reject')} variant="secondary" icon="close-circle-outline" loading={busy === 'reject'} onPress={() => act('rejected')} /></View>
      </Row>
    </Card>
  );
}
