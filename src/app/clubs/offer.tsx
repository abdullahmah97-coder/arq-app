// إضافة / تعديل عرض نادي (لمالك التطبيق ومدير النادي المعتمد فقط — مفروض في القاعدة)
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Switch, View } from 'react-native';
import { ClubLogo } from '@/components/clubs/parts';
import { gymName } from '@/components/GymPicker';
import { Button, Empty, Input, Row, Screen, T } from '@/components/ui';
import { canManageGym, deleteOffer, loadClubs, saveOffer, type Club } from '@/lib/clubs';
import { useLocalized } from '@/lib/i18n';
import { errorKey, supabase } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

const MONTHS = [0, 1, 3, 6, 12];
const toNum = (s: string) => { const v = Number(s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(',', '.')); return Number.isFinite(v) ? v : NaN; };
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export default function OfferForm() {
  const { gym, id } = useLocalSearchParams<{ gym?: string; id?: string }>();
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [gymId, setGymId] = useState<string | null>(gym ?? null);
  const [clubs, setClubs] = useState<Club[]>([]);
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
  const [busy, setBusy] = useState(false);

  useEffect(() => { loadClubs().then(setClubs).catch(() => {}); }, []);
  useEffect(() => { if (gymId) canManageGym(gymId).then(setAllowed); }, [gymId]);
  useEffect(() => {
    if (!id) return;
    supabase.from('gym_offers').select('*').eq('id', id).single().then(({ data: o }) => {
      if (!o) return;
      setTitle(o.title); setDetails(o.details ?? ''); setPrice(String(+o.price_sar)); setOldPrice(o.old_price_sar ? String(+o.old_price_sar) : '');
      setMonths(o.months); setEndsOn(o.ends_on ?? ''); setUrl(o.url ?? ''); setCode(o.promo_code ?? ''); setActive(o.active);
    });
  }, [id]);

  const club = clubs.find((c) => c.id === gymId);

  if (!gymId) {
    const list = clubs.filter((c) => !q || `${c.name} ${c.name_en ?? ''} ${c.chain ?? ''}`.toLowerCase().includes(q.toLowerCase()));
    return (
      <Screen edges={['bottom']}>
        <Stack.Screen options={{ title: t('clubs.pickClub') }} />
        <Input value={q} onChangeText={setQ} placeholder={t('clubs.searchClub')} />
        {list.map((c) => (
          <Pressable key={c.id} onPress={() => setGymId(c.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
            <ClubLogo c={c} size={36} /><T semibold style={{ flex: 1 }}>{gymName(c, lng)}</T><T size="xs" muted>{c.city}</T>
          </Pressable>
        ))}
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
    setBusy(true);
    try {
      await saveOffer({ gym_id: gymId, title, details, price_sar: p, old_price_sar: op, months, ends_on: endsOn || null, url: url || null, promo_code: code || null, active }, id);
      router.back();
    } catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: id ? t('clubs.editOffer') : t('clubs.addOffer') }} />
      {club ? <Row><ClubLogo c={club} size={36} /><T bold style={{ flex: 1 }}>{gymName(club, lng)}</T>{!gym ? <Pressable onPress={() => setGymId(null)}><T size="sm" color={colors.primary}>{t('clubs.change')}</T></Pressable> : null}</Row> : null}
      <Input label={t('clubs.offerTitle')} value={title} onChangeText={setTitle} maxLength={80} placeholder={t('clubs.offerTitlePh')} />
      <View style={{ gap: 6 }}>
        <T size="sm" semibold>{t('clubs.duration')}</T>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          {MONTHS.map((m) => (
            <Pressable key={m} onPress={() => setMonths(m)} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: months === m ? brand.deepGreen : colors.cardAlt }}>
              <T size="sm" semibold color={months === m ? brand.cream : colors.text}>{m === 0 ? t('clubs.dayPass') : t('clubs.monthsN', { n: m })}</T>
            </Pressable>
          ))}
        </Row>
      </View>
      <Row gap={space.md}>
        <View style={{ flex: 1 }}><Input label={t('clubs.priceNow')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="399" /></View>
        <View style={{ flex: 1 }}><Input label={t('clubs.priceBefore')} value={oldPrice} onChangeText={setOldPrice} keyboardType="decimal-pad" placeholder="550" /></View>
      </Row>
      <Input label={t('clubs.details')} value={details} onChangeText={setDetails} maxLength={400} multiline style={{ minHeight: 70, textAlignVertical: 'top' }} placeholder={t('clubs.detailsPh')} />
      <View style={{ gap: 6 }}>
        <Input label={t('clubs.endsOn')} value={endsOn} onChangeText={setEndsOn} placeholder="2026-10-31" autoCapitalize="none" />
        <Row gap={6}>
          {[7, 14, 30].map((d) => <Pressable key={d} onPress={() => setEndsOn(plusDays(d))} style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.cardAlt }}><T size="xs" semibold>{t('clubs.plusDays', { n: d })}</T></Pressable>)}
          <Pressable onPress={() => setEndsOn('')} style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.cardAlt }}><T size="xs" semibold>{t('clubs.noEnd')}</T></Pressable>
        </Row>
      </View>
      <Input label={t('clubs.subscribeUrl')} value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" placeholder="gym.sa/offers" />
      <Input label={t('clubs.promo')} value={code} onChangeText={setCode} autoCapitalize="characters" maxLength={30} placeholder="ARQ10" />
      <Row style={{ justifyContent: 'space-between' }}><T semibold>{t('clubs.activeOffer')}</T><Switch value={active} onValueChange={setActive} trackColor={{ true: brand.orange }} /></Row>
      <Button title={t('clubs.saveOffer')} icon="checkmark" loading={busy} onPress={save} />
      {id ? <Button variant="ghost" icon="trash-outline" title={t('common.delete')} onPress={async () => { await deleteOffer(id); router.back(); }} /> : null}
    </Screen>
  );
}
