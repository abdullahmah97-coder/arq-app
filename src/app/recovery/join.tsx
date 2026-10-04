// أضف مركزك / عدّل مركزك: مراكز العلاج الطبيعي والاستشفاء (تنراجع من إدارة أرك قبل الظهور)
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { Button, Card, Input, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { pickImage } from '@/lib/images';
import { AdminBanner, PartnerAgree } from '@/components/partners/parts';
import { acceptPartnerTerms } from '@/lib/partners';
import { goBackOrHome } from '@/lib/nav';
import {
  CENTER_CITIES, CENTER_KINDS, CENTER_SERVICES, loadCenter, loadMyCenter, saveCenter, type CenterKind, type CenterService, type RecoveryCenter,
} from '@/lib/recovery';
import { errorKey, publicUrl, uploadImage } from '@/lib/supabase';
import { brand, colors, space } from '@/theme';

export default function JoinCenter() {
  // ?id= المالك يعدّل أي مركز، ?new=1 المالك يضيف مركز من موقعه الرسمي
  const { id: adminId, new: adminNew } = useLocalSearchParams<{ id?: string; new?: string }>();
  const admin = !!adminId || adminNew === '1';
  const { t } = useTranslation();
  const { userId } = useUser();
  const [existing, setExisting] = useState<RecoveryCenter | null | undefined>(adminNew === '1' ? null : undefined);
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [kind, setKind] = useState<CenterKind>('physio');
  const [cities, setCities] = useState<string[]>([]);
  const [services, setServices] = useState<CenterService[]>([]);
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [website, setWebsite] = useState('');
  const [instagram, setInstagram] = useState('');
  const [license, setLicense] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [agree, setAgree] = useState(adminNew === '1');
  const [offerText, setOfferText] = useState('');
  const [offerCode, setOfferCode] = useState('');
  const [offerEnds, setOfferEnds] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (adminNew === '1') return;
    (adminId ? loadCenter(String(adminId)) : loadMyCenter(userId)).then((c) => {
      setExisting(c);
      if (c) {
        setName(c.name); setNameEn(c.name_en ?? ''); setKind(c.kind); setCities(c.cities); setServices(c.services);
        setDescription(c.description ?? ''); setPhone(c.phone ?? ''); setWhatsapp(c.whatsapp ?? ''); setWebsite(c.website ?? '');
        setInstagram(c.instagram ?? ''); setLicense(c.license_no ?? ''); setLogo(c.logo_path); setAgree(true);
        setOfferText(c.offer_text ?? ''); setOfferCode(c.offer_code ?? ''); setOfferEnds(c.offer_ends ?? '');
      }
    }).catch(() => setExisting(null));
  }, [userId, adminId, adminNew]);

  if (existing === undefined) return <Loading />;

  const toggle = <V,>(list: V[], v: V, set: (x: V[]) => void, max: number) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : list.length >= max ? list : [...list, v]);

  const pickLogo = async () => {
    const img = await pickImage('library', [1, 1]);
    if (!img) return;
    try { setLogo(await uploadImage('brands', userId, img.uri, img.mimeType)); } catch (e) { Alert.alert(t(errorKey(e))); }
  };

  const submit = async () => {
    if (name.trim().length < 2) return Alert.alert(t('recovery.err_name'));
    if (!cities.length) return Alert.alert(t('recovery.err_city'));
    if (!phone.trim() && !whatsapp.trim() && !website.trim()) return Alert.alert(t('recovery.err_contact'));
    if (!admin && license.trim().length < 3) return Alert.alert(t('recovery.err_license'));
    if (!agree) return Alert.alert(t('store.err_agree'));
    const ends = offerEnds.trim().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    if (ends && !/^\d{4}-\d{2}-\d{2}$/.test(ends)) return Alert.alert(t('errors.invalidNumber'));
    setBusy(true);
    try {
      await saveCenter(userId, {
        name, name_en: nameEn, kind, cities, services, description, phone, whatsapp, website, instagram, logo_path: logo, license_no: license,
        offer_text: offerText, offer_code: offerCode, offer_ends: ends || null,
      }, existing?.id, adminNew === '1');
      if (admin) { goBackOrHome(); return; }
      if (!existing) await acceptPartnerTerms('center');
      Alert.alert(existing && existing.status === 'approved' ? t('recovery.saved') : t('recovery.submitted'), existing?.status === 'approved' ? undefined : t('recovery.submittedBody'));
      router.back();
    } catch (e) {
      Alert.alert(t(errorKey(e)));
    } finally { setBusy(false); }
  };

  const chip = (label: string, on: boolean, onPress: () => void, key: string) => (
    <Pressable key={key} onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
      style={{ paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, borderWidth: 1, backgroundColor: on ? brand.deepGreen : colors.card, borderColor: on ? brand.deepGreen : colors.border }}>
      <T size="sm" color={on ? brand.cream : colors.text}>{label}</T>
    </Pressable>
  );

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: existing ? t('recovery.editCenter') : t('recovery.addCenter') }} />
      {admin ? <AdminBanner /> : null}
      {admin && !existing ? null : existing ? (
        <Card style={{ gap: 4, borderColor: existing.status === 'rejected' ? colors.danger : existing.status === 'approved' ? colors.success : brand.amber }}>
          <T semibold>{t(`recovery.status_${existing.status}`)}</T>
          {existing.review_note && existing.status === 'rejected' ? <T size="sm">{t('coaching.reviewNote')}: {existing.review_note}</T> : null}
        </Card>
      ) : (
        <Card style={{ gap: space.sm, backgroundColor: brand.deepGreen, borderColor: brand.deepGreen }}>
          <T bold color={brand.cream}>{t('recovery.joinTitle')}</T>
          {(['join1', 'join2', 'join3'] as const).map((k, i) => (
            <Row key={k} style={{ alignItems: 'flex-start' }}>
              <T bold color={brand.amber}>{i + 1}</T>
              <T size="sm" color={brand.sand} style={{ flex: 1, lineHeight: 22 }}>{t(`recovery.${k}`)}</T>
            </Row>
          ))}
        </Card>
      )}

      <Pressable onPress={pickLogo} style={{ alignItems: 'center', gap: 6 }} accessibilityRole="button" accessibilityLabel={t('recovery.logo')}>
        <View style={{ width: 84, height: 84, borderRadius: 20, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {logo ? <Image source={{ uri: publicUrl('brands', logo) }} style={{ width: 84, height: 84 }} contentFit="cover" /> : <Ionicons name="medkit-outline" size={34} color={colors.primary} />}
        </View>
        <T size="sm" semibold color={colors.primary}>{logo ? t('store.changeLogo') : t('recovery.logo')}</T>
      </Pressable>

      <Input label={t('recovery.name')} value={name} onChangeText={setName} maxLength={80} placeholder={t('recovery.namePh')} />
      <Input label={t('recovery.nameEn')} value={nameEn} onChangeText={setNameEn} maxLength={80} autoCapitalize="words" placeholder="Physio Center" />
      <View style={{ gap: 6 }}>
        <T size="sm" semibold>{t('recovery.kind')}</T>
        <Segmented<CenterKind> wrap value={kind} onChange={setKind} options={CENTER_KINDS.map((k) => ({ value: k, label: t(`recovery.kind_${k}`) }))} />
      </View>
      <View style={{ gap: 6 }}>
        <T size="sm" semibold>{t('recovery.cities')}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {CENTER_CITIES.map((c) => chip(c, cities.includes(c), () => toggle(cities, c, setCities, 12), c))}
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <T size="sm" semibold>{t('recovery.services')}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {CENTER_SERVICES.map((s) => chip(t(`recovery.svc_${s}`), services.includes(s), () => toggle(services, s, setServices, 14), s))}
        </View>
      </View>
      <Input label={t('recovery.description')} value={description} onChangeText={setDescription} maxLength={600} multiline
        style={{ minHeight: 90, textAlignVertical: 'top' }} placeholder={t('recovery.descriptionPh')} />
      <Row gap={space.sm}>
        <View style={{ flex: 1 }}><Input label={t('recovery.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="920000000" /></View>
        <View style={{ flex: 1 }}><Input label={t('recovery.whatsapp')} value={whatsapp} onChangeText={setWhatsapp} keyboardType="phone-pad" placeholder="05xxxxxxxx" /></View>
      </Row>
      <Input label={t('store.website')} value={website} onChangeText={setWebsite} autoCapitalize="none" keyboardType="url" placeholder="center.sa" />
      <Input label={t('store.instagram')} value={instagram} onChangeText={setInstagram} autoCapitalize="none" placeholder="@center" />
      <Input label={t('recovery.license')} hint={t('recovery.licenseHint')} value={license} onChangeText={setLicense} maxLength={40} autoCapitalize="characters" />

      {/* عرض لمستخدمي أرك (اختياري) */}
      <Card style={{ gap: space.sm }}>
        <T semibold>{t('partners.centerOffer')}</T>
        <T size="xs" muted>{t('partners.centerOfferHint')}</T>
        <Input value={offerText} onChangeText={setOfferText} maxLength={120} placeholder={t('partners.centerOfferPh')} />
        <Row gap={space.sm}>
          <View style={{ flex: 1 }}><Input label={t('partners.offerCode')} value={offerCode} onChangeText={setOfferCode} maxLength={30} autoCapitalize="characters" placeholder="ARQ" /></View>
          <View style={{ flex: 1 }}><Input label={t('partners.offerEnds')} value={offerEnds} onChangeText={setOfferEnds} maxLength={10} placeholder="2026-12-31" /></View>
        </Row>
      </Card>

      {!existing && !admin ? <PartnerAgree boxed checked={agree} onToggle={() => setAgree(!agree)} pledge={t('recovery.agree')} /> : null}

      <Button title={existing ? t('store.save') : t('store.submit')} icon={existing ? 'checkmark' : 'paper-plane-outline'} loading={busy} onPress={submit} />
    </Screen>
  );
}
