// لوحة المالك: إدارة الشركاء لكل فئة. بحث وفلترة بالحالة، وإضافة وتعديل وإخفاء وحذف، وفتح لوحة تحكم الشريك نيابة عنه،
// وربط الصفحة بحساب صاحبها، ومدراء الأندية. كل إجراء ينحفظ في سجل المالك
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, Pressable, View } from 'react-native';
import { StatusPill } from '@/components/partners/parts';
import { PromptModal, type PromptField } from '@/components/PromptModal';
import { Button, Empty, Input, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import {
  assignPartner, chainManagers, KIND_ICON, listPartners, PARTNER_KINDS, partnerAction, removeChainManager, statusGroup,
  type PartnerAction, type PartnerKind, type PartnerRow, type StatusGroup,
} from '@/lib/partners';
import { errorKey, publicUrl } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

type Prompt = { title: string; message?: string; fields: PromptField[]; confirm?: string; danger?: boolean; run: (v: Record<string, string>) => Promise<void> };
type SheetItem = { icon: keyof typeof Ionicons.glyphMap; label: string; danger?: boolean; onPress: () => void };

export default function OwnerPartners() {
  const params = useLocalSearchParams<{ kind?: PartnerKind }>();
  const { t } = useTranslation();
  const [kind, setKind] = useState<PartnerKind>(PARTNER_KINDS.includes(params.kind as PartnerKind) ? (params.kind as PartnerKind) : 'club');
  const [rows, setRows] = useState<PartnerRow[] | null>(null);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<StatusGroup | 'all'>('all');
  const [sheet, setSheet] = useState<{ row: PartnerRow; items: SheetItem[] } | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  const load = useCallback(() => { setRows(null); listPartners(kind).then(setRows).catch(() => setRows([])); }, [kind]);
  useFocusEffect(load);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => (group === 'all' || statusGroup(r.status) === group)
      && (!s || r.name.toLowerCase().includes(s) || r.subtitle.toLowerCase().includes(s) || (r.owner_username ?? '').toLowerCase().includes(s)));
  }, [rows, q, group]);
  const counts = useMemo(() => {
    const c: Record<StatusGroup, number> = { pending: 0, live: 0, hidden: 0, rejected: 0 };
    (rows ?? []).forEach((r) => { c[statusGroup(r.status)]++; });
    return c;
  }, [rows]);

  const act = (r: PartnerRow, a: PartnerAction, note?: string) =>
    partnerAction(kind, r.id, a, note).then(load).catch((e) => Alert.alert(t(errorKey(e))));
  const withNote = (r: PartnerRow, a: 'reject' | 'hide') => setPrompt({
    title: t(a === 'reject' ? 'coaching.reject' : 'partners.hide'), message: t(a === 'reject' ? 'partners.rejectMsg' : 'partners.hideMsg'),
    fields: [{ key: 'note', multiline: true, placeholder: t('coaching.rejectNotePh') }], danger: true,
    run: async (v) => { if (a === 'reject' && v.note.trim().length < 3) { Alert.alert(t('coaching.err_rejectNote')); return; } await act(r, a, v.note); setPrompt(null); },
  });
  const assign = (r: PartnerRow | null) => setPrompt({
    title: t(kind === 'coach' ? 'partners.addCoach' : kind === 'club' ? 'partners.addManager' : 'partners.linkOwner'),
    message: t(`partners.assignMsg_${kind}`),
    fields: [{ key: 'u', label: t('partners.username'), placeholder: '@username', autoCapitalize: 'none' }],
    run: async (v) => {
      try { await assignPartner(kind, r?.id ?? null, v.u); setPrompt(null); load(); Alert.alert(t('partners.linked')); }
      catch (e) { Alert.alert(t(errorKey(e))); }
    },
  });
  const remove = (r: PartnerRow) => Alert.alert(t('partners.deleteTitle', { name: r.name }), t(`partners.deleteMsg_${kind}`), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.delete'), style: 'destructive', onPress: () => act(r, 'delete') },
  ]);
  const managers = async (r: PartnerRow) => {
    const list = await chainManagers(r.id);
    setSheet({ row: r, items: [
      ...list.map((m) => ({ icon: 'person-remove-outline' as const, label: t('partners.removeManager', { name: m.full_name || m.username }), danger: true,
        onPress: () => Alert.alert(t('partners.removeManager', { name: m.username }), '', [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.delete'), style: 'destructive', onPress: () => removeChainManager(r.id, m.user_id).then(load).catch((e) => Alert.alert(t(errorKey(e)))) },
        ]) })),
      { icon: 'person-add-outline', label: t('partners.addManager'), onPress: () => assign(r) },
    ] });
  };

  const open = (r: PartnerRow) => {
    const g = statusGroup(r.status);
    const items: SheetItem[] = [];
    if (r.status === 'pending') {
      items.push({ icon: 'checkmark-circle-outline', label: t('coaching.approve'), onPress: () => act(r, 'approve') });
      items.push({ icon: 'close-circle-outline', label: t('coaching.reject'), onPress: () => withNote(r, 'reject') });
    }
    if (kind === 'club') {
      items.push({ icon: 'eye-outline', label: t('partners.openPage'), onPress: () => router.push({ pathname: '/clubs/chain/[id]', params: { id: r.id } }) });
      items.push({ icon: 'create-outline', label: t('partners.editPage'), onPress: () => router.push({ pathname: '/clubs/chain-edit', params: { id: r.id } }) });
      items.push({ icon: 'pricetags-outline', label: t('clubs.addOffer'), onPress: () => router.push({ pathname: '/clubs/offer', params: { chain: r.id } }) });
      items.push({ icon: 'people-outline', label: t('partners.managers'), onPress: () => { managers(r).catch(() => {}); } });
      items.push(r.partner
        ? { icon: 'ribbon-outline', label: t('partners.partnerOff'), onPress: () => act(r, 'partner_off') }
        : { icon: 'ribbon', label: t('partners.partnerOn'), onPress: () => act(r, 'partner_on') });
    } else if (kind === 'store') {
      items.push({ icon: 'eye-outline', label: t('partners.openPage'), onPress: () => router.push({ pathname: '/store/[id]', params: { id: r.id } }) });
      items.push({ icon: 'speedometer-outline', label: t('partners.openDashboardFor'), onPress: () => router.push({ pathname: '/store/manage', params: { id: r.id } }) });
      items.push({ icon: 'create-outline', label: t('partners.editPage'), onPress: () => router.push({ pathname: '/store/join', params: { id: r.id } }) });
      items.push({ icon: 'cloud-upload-outline', label: t('partners.import'), onPress: () => router.push({ pathname: '/store/import', params: { brand: r.id } }) });
      if (!r.owner_id) items.push({ icon: 'link-outline', label: t('partners.linkOwner'), onPress: () => assign(r) });
    } else if (kind === 'coach') {
      items.push({ icon: 'eye-outline', label: t('partners.openPage'), onPress: () => router.push({ pathname: '/coaches/[id]', params: { id: r.id } }) });
    } else if (kind === 'venue') {
      items.push({ icon: 'eye-outline', label: t('partners.openPage'), onPress: () => router.push({ pathname: '/book/[id]', params: { id: r.id } }) });
      if (!r.owner_id) items.push({ icon: 'link-outline', label: t('partners.linkOwner'), onPress: () => assign(r) });
    } else {
      items.push({ icon: 'speedometer-outline', label: t('partners.openDashboardFor'), onPress: () => router.push({ pathname: '/recovery/manage', params: { id: r.id } }) });
      items.push({ icon: 'create-outline', label: t('partners.editPage'), onPress: () => router.push({ pathname: '/recovery/join', params: { id: r.id } }) });
      if (!r.owner_id) items.push({ icon: 'link-outline', label: t('partners.linkOwner'), onPress: () => assign(r) });
    }
    if (g === 'live') items.push({ icon: 'eye-off-outline', label: t('partners.hide'), onPress: () => (kind === 'club' ? act(r, 'hide') : withNote(r, 'hide')) });
    if (g === 'hidden' || g === 'rejected') items.push({ icon: 'eye-outline', label: t('partners.show'), onPress: () => act(r, 'show') });
    items.push({ icon: 'trash-outline', label: t('common.delete'), danger: true, onPress: () => remove(r) });
    setSheet({ row: r, items });
  };

  const add = () => {
    if (kind === 'club') router.push('/clubs/chain-edit');
    else if (kind === 'store') router.push({ pathname: '/store/join', params: { new: '1' } });
    else if (kind === 'center') router.push({ pathname: '/recovery/join', params: { new: '1' } });
    else assign(null);
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('partners.manageTitle') }} />
      <Segmented<PartnerKind> wrap value={kind} onChange={(k) => { setKind(k); setGroup('all'); }} options={PARTNER_KINDS.map((k) => ({ value: k, label: t(`partners.kind_${k}`) }))} />
      <Row gap={space.sm}>
        <View style={{ flex: 1 }}><Input value={q} onChangeText={setQ} placeholder={t('partners.searchPh')} /></View>
        {kind !== 'venue' ? <Button icon="add" title={t(`partners.add_${kind}`)} onPress={add} /> : null}
      </Row>
      <Segmented<StatusGroup | 'all'> wrap value={group} onChange={setGroup} options={[
        { value: 'all', label: `${t('store.all')} ${rows?.length ?? ''}`.trim() },
        ...(['pending', 'live', 'hidden', 'rejected'] as StatusGroup[]).map((g) => ({ value: g, label: `${t(`partners.grp_${g}`)} ${counts[g] || ''}`.trim() })),
      ]} />
      <T size="xs" muted style={{ lineHeight: 19 }}>{t(`partners.manageHint_${kind}`)}</T>
      {!rows ? <Loading /> : shown.length ? shown.map((r) => <PartnerRowCard key={r.id} r={r} kind={kind} onPress={() => open(r)} />)
        : <Empty icon={KIND_ICON[kind] as never} text={t('partners.noneHere')} />}

      <Modal visible={!!sheet} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <Pressable onPress={() => setSheet(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: space.lg, paddingBottom: space.xl, gap: 2 }}>
            <T bold size="lg" numberOfLines={1}>{sheet?.row.name}</T>
            {sheet?.row.owner_username ? <T size="xs" muted>@{sheet.row.owner_username}</T> : null}
            {sheet?.items.map((it, i) => (
              <Pressable key={i} onPress={() => { setSheet(null); it.onPress(); }} accessibilityRole="button"
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 12, opacity: pressed ? 0.6 : 1,
                  borderTopWidth: i ? 1 : 0, borderTopColor: colors.border })}>
                <Ionicons name={it.icon} size={20} color={it.danger ? colors.danger : colors.primary} />
                <T semibold color={it.danger ? colors.danger : colors.text}>{it.label}</T>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
      <PromptModal visible={!!prompt} title={prompt?.title ?? ''} message={prompt?.message} fields={prompt?.fields ?? []} danger={prompt?.danger}
        onClose={() => setPrompt(null)} onSubmit={async (v) => { await prompt?.run(v); }} />
    </Screen>
  );
}

function PartnerRowCard({ r, kind, onPress }: { r: PartnerRow; kind: PartnerKind; onPress: () => void }) {
  const { t } = useTranslation();
  const logo = r.logo_path ? publicUrl('brands', r.logo_path) : r.avatar_url ? publicUrl('avatars', r.avatar_url) : null;
  const meta = kind === 'club' ? t('partners.clubMeta', { b: r.meta.branches ?? 0, m: r.meta.managers ?? 0, o: r.meta.offers ?? 0 })
    : kind === 'store' ? [t(`store.cat_${r.meta.category}`), r.meta.city, t('partners.productsN', { n: r.meta.products ?? 0 })].filter(Boolean).join(' · ')
    : kind === 'coach' ? [r.meta.city, t('partners.clientsN', { n: r.meta.clients ?? 0 })].filter(Boolean).join(' · ')
    : kind === 'venue' ? [((r.meta.sports ?? []) as string[]).map((x) => t(`book.sport_${x}`)).join('، '), r.meta.city,
        r.listed_by === 'owner' ? t('venue.metaCounts', { c: r.meta.courts ?? 0, k: r.meta.classes ?? 0, b: r.meta.upcoming ?? 0 }) : t('book.onTheirSite')].filter(Boolean).join(' · ')
    : [t(`recovery.kind_${r.meta.kind}`), (r.meta.cities ?? []).slice(0, 2).join('، ')].filter(Boolean).join(' · ');
  const statusLabel = r.status === 'listed' ? t('partners.st_listed') : r.status === 'approved' && r.partner ? t('partners.st_partner')
    : r.status === 'approved' ? t('partners.st_live') : t(`partners.st_${r.status === 'suspended' ? 'hidden' : r.status}`);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({
      flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1,
      borderColor: r.status === 'pending' ? brand.orange : colors.border, padding: space.md, opacity: pressed ? 0.8 : 1,
    })}>
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.cardAlt, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {logo ? <Image source={{ uri: logo }} style={{ width: 44, height: 44 }} contentFit="cover" /> : <Ionicons name={KIND_ICON[kind] as never} size={20} color={colors.primary} />}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T semibold numberOfLines={1}>{r.name}</T>
        {r.subtitle ? <T size="xs" muted numberOfLines={1}>{r.subtitle}</T> : null}
        <T size="xs" muted numberOfLines={1}>{meta}{r.owner_username ? ` · @${r.owner_username}` : ''}</T>
      </View>
      <StatusPill status={r.status === 'approved' && !r.partner && kind !== 'coach' ? 'listed' : r.status} label={statusLabel} />
    </Pressable>
  );
}
