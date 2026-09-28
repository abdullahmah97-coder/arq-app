// إضافة / تعديل عرض نادي (لمالك التطبيق ومدير النادي المعتمد فقط — مفروض في القاعدة)
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Switch, View } from 'react-native';
import { ClubLogo } from '@/components/clubs/parts';
import { gymName } from '@/components/GymPicker';
import { Button, Empty, Input, Row, Screen, T } from '@/components/ui';
import { canManageChain, canManageGym, deleteOffer, loadChains, loadClubs, saveOffer, type Chain, type Club } from '@/lib/clubs';
import { useLocalized } from '@/lib/i18n';
import { errorKey, supabase } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';
import { goBackOrHome } from '@/lib/nav';

const MONTHS = [0, 1, 3, 6, 12];
const toNum = (s: string) => { const v = Number(s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(',', '.')); return Number.isFinite(v) ? v : NaN; };
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export default function OfferForm() {
  const { gym, chain, id } = useLocalSearchParams<{ gym?: string; chain?: string; id?: string }>();
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [gymId, setGymId] = useState<string | null>(gym ?? null);
  const [chainId, setChainId] = useState<string | null>(chain ?? null);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [chains, setChains] = useState<Chain[]>([]);
  const [source, setSource] = useState('');
  const [q, setQ] = useState('');
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [price, setPrice] = useState('');
  const [oldPrice, setOldPrice] = useState('');
  const [months, setMonths] = useState(1);
  const [endsOn, setEndsOn] = useState('');
  const [url, setUrl] = useState('');
  const [code, setCode] = useState('');
  const [active, setActive] = useState(true);
  const [joinFee, setJoinFee] = useState('');
  const [vat, setVat] = useState<'yes' | 'no' | 'unknown'>('unknown');
  const [minMonths, setMinMonths] = useState('');
  const [terms, setTerms] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { loadClubs().then(setClubs).catch(() => {}); loadChains().then(setChains).catch(() => {}); }, []);
  useEffect(() => {
    if (gymId) canManageGym(gymId).then(setAllowed);
    else if (chainId) canManageChain(chainId).then(setAllowed);
  }, [gymId, chainId]);
  useEffect(() => {
    if (!id) return;
    supabase.from('gym_offers').select('*').eq('id', id).single().then(({ data: o }) => {
      if (!o) return;
      setTitle(o.title); setDetails(o.details ?? ''); setPrice(String(+o.price_sar)); setOldPrice(o.old_price_sar ? String(+o.old_price_sar) : '');
      setMonths(o.months); setEndsOn(o.ends_on ?? ''); setUrl(o.url ?? ''); setCode(o.promo_code ?? ''); setActive(o.active);
      setJoinFee(o.join_fee_sar != null ? String(+o.join_fee_sar) : ''); setVat(o.vat_included == null ? 'unknown' : o.vat_included ? 'yes' : 'no');
      setMinMonths(o.min_months != null ? String(o.min_months) : ''); setTerms(o.terms ?? '');
      setSource(o.source_url ?? ''); if (o.chain_id) setChainId(o.chain_id); if (o.gym_id) setGymId(o.gym_id);
    });
  }, [id]);

  const club = clubs.find((c) => c.id === gymId);
  const ch = chains.find((c) => c.id === chainId);

  if (!gymId && !chainId) {
    const match = (x: string) => !q || x.toLowerCase().includes(q.toLowerCase());
    const cl = chains.filter((c) => match(`${c.name} ${c.name_en ?? ''}`));
    const br = clubs.filter((c) => match(`${c.name} ${c.name_en ?? ''} ${c.chain ?? ''}`));
    const row = (key: string, logo: { name: string; logo_path?: string | null }, title: string, sub: string, onPress: () => void) => (
      <Pressable key={key} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
        <ClubLogo c={logo} size={36} /><T semibold style={{ flex: 1 }}>{title}</T><T size="xs" muted>{sub}</T>
      </Pressable>
    );
    return (
      <Screen edges={['bottom']}>
        <Stack.Screen options={{ title: t('clubs.pickClub') }} />
        <Input value={q} onChangeText={setQ} placeholder={t('clubs.searchClub')} />
        {cl.length ? <T size="sm" bold>{t('clubs.chainWide')}</T> : null}
        {cl.map((c) => row(c.id, { name: c.name_en || c.name, logo_path: c.logo_path }, c.name, t('clubs.allBranches'), () => setChainId(c.id)))}
        {br.length ? <T size="sm" bold>{t('clubs.oneBranch')}</T> : null}
        {br.map((c) => row(c.id, c, gymName(c, lng), c.city ?? '', () => setGymId(c.id)))}
      </Screen>
    );
  }
  if (allowed === false) return <Screen><Empty icon="lock-closed-outline" text={t('owner.noAccess')} /></Screen>;

  const save = async () => {
    const p = toNum(price), op = oldPrice.trim() ? toNum(oldPrice) : null;
    if (title.trim().length < 3) return Alert.alert(t('clubs.err_title'));
    if (!(p >= 0)) return Alert.alert(t('errors.invalidNumber'));
    if (op != null && !(op > p)) return Alert.alert(t('clubs.err_oldPrice'));
    if (endsOn && !/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) return Alert.alert(t('clubs.err_date'));
    const jf = joinFee.trim() ? toNum(joinFee) : null;
    const mm = minMonths.trim() ? Math.round(toNum(minMonths)) : null;
    if (jf != null && !(jf >= 0)) return Alert.alert(t('errors.invalidNumber'));
    if (mm != null && !(mm >= 0 && mm <= 36)) return Alert.alert(t('errors.invalidNumber'));
    setBusy(true);
    try {
      await saveOffer({ gym_id: gymId, chain_id: gymId ? null : chainId, source_url: source || null, title, details, price_sar: p, old_price_sar: op, months, ends_on: endsOn || null, url: url || null, promo_code: code || null, active,
        join_fee_sar: jf, vat_included: vat === 'unknown' ? null : vat === 'yes', min_months: mm, terms: terms || null }, id);
      goBackOrHome();
    } catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: id ? t('clubs.editOffer') : t('clubs.addOffer') }} />
      {club || ch ? (
        <Row>
          <ClubLogo c={club ?? { name: ch!.name_en || ch!.name, logo_path: ch!.logo_path }} size={36} />
          <View style={{ flex: 1 }}>
            <T bold>{club ? gymName(club, lng) : ch!.name}</T>
            <T size="xs" muted>{club ? t('clubs.oneBranch') : t('clubs.allBranches')}</T>
          </View>
          {!gym && !chain ? <Pressable onPress={() => { setGymId(null); setChainId(null); }}><T size="sm" color={colors.primary}>{t('clubs.change')}</T></Pressable> : null}
        </Row>
      ) : null}
      <Input label={t('clubs.offerTitle')} value={title} onChangeText={setTitle} maxLength={80} placeholder={t('clubs.offerTitlePh')} />
      <View style={{ gap: 6 }}>
        <T size="sm" semibold>{t('clubs.duration')}</T>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          {MONTHS.map((m) => (
            <Pressable key={m} onPress={() => setMonths(m)} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: months === m ? brand.deepGreen : colors.cardAlt }}>
              <T size="sm" semibold color={months === m ? brand.cream : colors.text}>{m === 0 ? t('clubs.dayPass') : t('clubs.monthsN', { n: m, count: m })}</T>
            </Pressable>
          ))}
        </Row>
      </View>
      <Row gap={space.md}>
        <View style={{ flex: 1 }}><Input label={t('clubs.priceNow')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="399" /></View>
        <View style={{ flex: 1 }}><Input label={t('clubs.priceBefore')} value={oldPrice} onChangeText={setOldPrice} keyboardType="decimal-pad" placeholder="550" /></View>
      </Row>
      {/* السعر الكامل: رسوم التسجيل + الضريبة + أقل مدة التزام + الشروط */}
      <View style={{ gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.cardAlt }}>
        <T size="sm" semibold>{t('trust.fullPriceTitle')}</T>
        <Row gap={space.md}>
          <View style={{ flex: 1 }}><Input label={t('trust.joinFee')} value={joinFee} onChangeText={setJoinFee} keyboardType="decimal-pad" placeholder="0" /></View>
          <View style={{ flex: 1 }}><Input label={t('trust.minMonths')} value={minMonths} onChangeText={setMinMonths} keyboardType="number-pad" placeholder="1" /></View>
        </Row>
        <T size="xs" semibold>{t('trust.vatQ')}</T>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          {(['yes', 'no', 'unknown'] as const).map((v) => (
            <Pressable key={v} onPress={() => setVat(v)} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: vat === v ? brand.deepGreen : colors.card }}>
              <T size="sm" semibold color={vat === v ? brand.cream : colors.text}>{t(`trust.vat_${v}`)}</T>
            </Pressable>
          ))}
        </Row>
        <Input label={t('trust.terms')} value={terms} onChangeText={setTerms} maxLength={400} multiline style={{ minHeight: 60, textAlignVertical: 'top' }} placeholder={t('trust.termsPh')} />
        <T size="xs" muted>{t('trust.fullPriceHint')}</T>
      </View>
      <Input label={t('clubs.details')} value={details} onChangeText={setDetails} maxLength={400} multiline style={{ minHeight: 70, textAlignVertical: 'top' }} placeholder={t('clubs.detailsPh')} />
      <View style={{ gap: 6 }}>
        <Input label={t('clubs.endsOn')} value={endsOn} onChangeText={setEndsOn} placeholder="2026-10-31" autoCapitalize="none" />
        <Row gap={6}>
          {[7, 14, 30].map((d) => <Pressable key={d} onPress={() => setEndsOn(plusDays(d))} style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.cardAlt }}><T size="xs" semibold>{t('clubs.plusDays', { n: d, count: d })}</T></Pressable>)}
          <Pressable onPress={() => setEndsOn('')} style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.cardAlt }}><T size="xs" semibold>{t('clubs.noEnd')}</T></Pressable>
        </Row>
      </View>
      <Input label={t('clubs.subscribeUrl')} value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" placeholder="gym.sa/offers" />
      <Input label={t('clubs.sourceUrl')} value={source} onChangeText={setSource} autoCapitalize="none" keyboardType="url" placeholder="gym.sa/offers" hint={t('clubs.sourceHint')} />
      <Input label={t('clubs.promo')} value={code} onChangeText={setCode} autoCapitalize="characters" maxLength={30} placeholder="ARQ10" />
      <Row style={{ justifyContent: 'space-between' }}><T semibold>{t('clubs.activeOffer')}</T><Switch value={active} onValueChange={setActive} trackColor={{ true: brand.orange }} /></Row>
      <Button title={t('clubs.saveOffer')} icon="checkmark" loading={busy} onPress={save} />
      {id ? <Button variant="ghost" icon="trash-outline" title={t('common.delete')} onPress={async () => { await deleteOffer(id); goBackOrHome(); }} /> : null}
    </Screen>
  );
}
