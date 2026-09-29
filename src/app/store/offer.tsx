// عرض متجر: عنوان وتفاصيل وكود خصم ونسبة وتاريخ انتهاء. يظهر في صفحة المتجر، وكل مشاهدة وكشف كود وزيارة تنحسب في التقرير
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Switch, View } from 'react-native';
import { Button, Input, Loading, Row, Screen, T } from '@/components/ui';
import { deleteBrandOffer, loadBrandOffers, saveBrandOffer } from '@/lib/brands';
import { goBackOrHome } from '@/lib/nav';
import { errorKey } from '@/lib/supabase';
import { brand, colors, space } from '@/theme';

const arDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

export default function StoreOfferForm() {
  const { brand: brandId, id } = useLocalSearchParams<{ brand: string; id?: string }>();
  const { t } = useTranslation();
  const [ready, setReady] = useState(!id);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [code, setCode] = useState('');
  const [percent, setPercent] = useState('');
  const [url, setUrl] = useState('');
  const [ends, setEnds] = useState('');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadBrandOffers(String(brandId)).then((list) => {
      const o = list.find((x) => x.id === id);
      if (o) {
        setTitle(o.title); setDetails(o.details ?? ''); setCode(o.code ?? ''); setPercent(o.percent ? String(o.percent) : '');
        setUrl(o.url ?? ''); setEnds(o.ends_on ?? ''); setActive(o.active);
      }
      setReady(true);
    }).catch(() => setReady(true));
  }, [brandId, id]);
  if (!ready) return <Loading />;

  const save = async () => {
    if (title.trim().length < 3) return Alert.alert(t('partners.err_offerTitle'));
    const pct = percent.trim() ? Number(arDigits(percent.trim())) : null;
    if (pct != null && (!Number.isFinite(pct) || pct < 1 || pct > 90)) return Alert.alert(t('partners.err_percent'));
    if (code.trim() && !/^[A-Za-z0-9_-]{2,30}$/.test(code.trim())) return Alert.alert(t('partners.err_code'));
    const endsOn = arDigits(ends.trim());
    if (endsOn && !/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) return Alert.alert(t('errors.invalidNumber'));
    setBusy(true);
    try {
      await saveBrandOffer(String(brandId), { title, details, code, percent: pct ? Math.round(pct) : null, url, ends_on: endsOn || null, active }, id);
      goBackOrHome();
    } catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };
  const remove = () => Alert.alert(t('partners.deleteOffer'), '', [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.delete'), style: 'destructive', onPress: async () => { await deleteBrandOffer(String(id)); goBackOrHome(); } },
  ]);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: id ? t('partners.editOffer') : t('partners.addOffer') }} />
      <Input label={t('partners.offerTitle')} value={title} onChangeText={setTitle} maxLength={80} placeholder={t('partners.offerTitlePh')} />
      <Input label={t('partners.offerDetails')} value={details} onChangeText={setDetails} maxLength={300} multiline
        style={{ minHeight: 70, textAlignVertical: 'top' }} placeholder={t('partners.offerDetailsPh')} />
      <Row gap={space.sm}>
        <View style={{ flex: 1 }}><Input label={t('partners.offerCode')} value={code} onChangeText={setCode} autoCapitalize="characters" maxLength={30} placeholder="ARQ20" /></View>
        <View style={{ flex: 1 }}><Input label={t('partners.offerPercent')} value={percent} onChangeText={setPercent} keyboardType="number-pad" maxLength={2} placeholder="20" /></View>
      </Row>
      <Input label={t('partners.offerUrl')} value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" placeholder="store.sa/offer" />
      <Input label={t('partners.offerEnds')} hint={t('partners.dateHint')} value={ends} onChangeText={setEnds} maxLength={10} placeholder="2026-12-31" />
      <Row style={{ justifyContent: 'space-between', backgroundColor: colors.card, borderRadius: 12, padding: space.md }}>
        <T semibold>{t('partners.offerActive')}</T>
        <Switch value={active} onValueChange={setActive} trackColor={{ true: brand.orange, false: colors.border }} />
      </Row>
      <T size="xs" muted style={{ lineHeight: 19 }}>{t('partners.offerRule')}</T>
      <Button title={t('store.save')} icon="checkmark" loading={busy} onPress={save} />
      {id ? <Button variant="ghost" title={t('partners.deleteOffer')} onPress={remove} /> : null}
    </Screen>
  );
}
