// ملف المدرب: النبذة، التخصصات، الخبرة، الشهادات، اللغات، من يدرّب، المدينة، أونلاين/حضوري، السعر، الأندية، وطلب التوثيق
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Switch, View } from 'react-native';
import { Chip, VerifiedBadge } from '@/components/coaching/parts';
import { GymPicker } from '@/components/GymPicker';
import { Button, Card, Input, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { addCoachGym, LANGS, loadMyCoachGyms, loadMyCoachProfile, removeCoachGym, requestVerification, saveCoachProfile, SPECIALTIES,
  type CoachProfile, type MyCoachGym, type Specialty } from '@/lib/coaching';
import { useLocalized } from '@/lib/i18n';
import { goBackOrHome } from '@/lib/nav';
import { errorKey } from '@/lib/supabase';
import { brand, colors, space } from '@/theme';

const num = (s: string) => { const v = Number(s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))); return Number.isFinite(v) ? v : null; };

export default function CoachProfileEdit() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId, profile } = useUser();
  const [p, setP] = useState<CoachProfile | null | undefined>(undefined);
  const [f, setF] = useState({ headline: '', bio: '', specialties: [] as Specialty[], years: '', certs: '', languages: ['ar'] as string[],
    trains: 'any' as 'any' | 'men' | 'women', city: '', online: false, in_person: true, price: '', accepting: true, instagram: '' });
  const [gyms, setGyms] = useState<MyCoachGym[]>([]);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => {
    loadMyCoachProfile(userId).then((x) => {
      setP(x);
      if (x) setF({ headline: x.headline ?? '', bio: x.bio ?? '', specialties: x.specialties, years: x.years_exp != null ? String(x.years_exp) : '', certs: x.certifications ?? '',
        languages: x.languages, trains: x.trains, city: x.city ?? '', online: x.online, in_person: x.in_person, price: x.price_from_sar != null ? String(x.price_from_sar) : '',
        accepting: x.accepting, instagram: x.instagram ?? '' });
    }).catch(() => setP(null));
    loadMyCoachGyms(userId).then(setGyms);
  }, [userId]));

  if (p === undefined) return <Loading />;
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((o) => ({ ...o, [k]: v }));
  const toggle = <V extends string>(list: V[], v: V, max = 99) => (list.includes(v) ? list.filter((x) => x !== v) : list.length >= max ? list : [...list, v]);

  const save = async () => {
    if (f.headline.trim().length < 3) return Alert.alert(t('coaching.err_headline'));
    const insta = f.instagram.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
    setBusy(true);
    try {
      await saveCoachProfile(userId, { headline: f.headline.trim(), bio: f.bio.trim() || null, specialties: f.specialties, years_exp: num(f.years), certifications: f.certs.trim() || null,
        languages: f.languages.length ? f.languages : ['ar'], trains: f.trains, city: f.city.trim() || null, online: f.online, in_person: f.in_person,
        price_from_sar: f.price.trim() ? num(f.price) : null, accepting: f.accepting, instagram: insta || null });
      if (!p) Alert.alert(t('coaching.profileCreated'));
      goBackOrHome();
    } catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: p ? t('coaching.editProfile') : t('coaching.createProfile') }} />
      <Input label={t('coaching.headline')} value={f.headline} onChangeText={(v) => set('headline', v)} maxLength={80} placeholder={t('coaching.headlinePh')} />
      <Input label={t('coaching.bio')} value={f.bio} onChangeText={(v) => set('bio', v)} maxLength={800} multiline style={{ minHeight: 110, textAlignVertical: 'top' }} placeholder={t('coaching.bioPh')} />
      <View style={{ gap: 6 }}>
        <T size="sm" semibold>{t('coaching.specialties')}</T>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>{SPECIALTIES.map((s) => <Chip key={s} label={t(`coaching.sp_${s}`)} on={f.specialties.includes(s)} onPress={() => set('specialties', toggle(f.specialties, s, 6))} />)}</Row>
      </View>
      <Row gap={space.md}>
        <View style={{ flex: 1 }}><Input label={t('coaching.years')} value={f.years} onChangeText={(v) => set('years', v)} keyboardType="number-pad" placeholder="5" /></View>
        <View style={{ flex: 1 }}><Input label={t('coaching.priceFrom')} value={f.price} onChangeText={(v) => set('price', v)} keyboardType="decimal-pad" placeholder="250" /></View>
      </Row>
      <Input label={t('coaching.certs')} value={f.certs} onChangeText={(v) => set('certs', v)} maxLength={400} multiline placeholder={t('coaching.certsPh')} />
      <View style={{ gap: 6 }}>
        <T size="sm" semibold>{t('coaching.trainsWho')}</T>
        <Segmented<'any' | 'men' | 'women'> value={f.trains} onChange={(v) => set('trains', v)} options={(['any', 'men', 'women'] as const).map((v) => ({ value: v, label: t(`coaching.trains_${v}`) }))} />
      </View>
      <View style={{ gap: 6 }}>
        <T size="sm" semibold>{t('coaching.languages')}</T>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>{LANGS.map((l) => <Chip key={l} label={t(`coaching.lang_${l}`)} on={f.languages.includes(l)} onPress={() => set('languages', toggle(f.languages, l))} />)}</Row>
      </View>
      <Input label={t('coaching.city')} value={f.city} onChangeText={(v) => set('city', v)} maxLength={40} placeholder={t('coaching.cityPh')} />
      <Input label="Instagram" value={f.instagram} onChangeText={(v) => set('instagram', v)} autoCapitalize="none" autoCorrect={false} placeholder="@username" />
      <Card style={{ gap: space.sm }}>
        <Row style={{ justifyContent: 'space-between' }}><T semibold>{t('coaching.inPerson')}</T><Switch value={f.in_person} onValueChange={(v) => set('in_person', v)} trackColor={{ true: brand.orange }} /></Row>
        <Row style={{ justifyContent: 'space-between' }}><T semibold>{t('coaching.online')}</T><Switch value={f.online} onValueChange={(v) => set('online', v)} trackColor={{ true: brand.orange }} /></Row>
        <Row style={{ justifyContent: 'space-between' }}><T semibold>{t('coaching.acceptingNew')}</T><Switch value={f.accepting} onValueChange={(v) => set('accepting', v)} trackColor={{ true: brand.orange }} /></Row>
      </Card>
      <Button title={t('coaching.saveProfile')} icon="checkmark" loading={busy} onPress={save} />

      {p ? (
        <>
          <Card style={{ gap: space.sm }}>
            <T semibold>{t('coaching.myGyms')}</T>
            {gyms.map((g) => (
              <Row key={g.gym_id} style={{ justifyContent: 'space-between' }}>
                <T size="sm" style={{ flex: 1 }}>{lng === 'en' && g.gyms?.name_en ? g.gyms.name_en : g.gyms?.name}</T>
                <T size="xs" muted>{g.status === 'approved' ? t('coaching.gymApproved') : t('coaching.gymPending')}</T>
                <Pressable hitSlop={8} onPress={() => removeCoachGym(userId, g.gym_id).then(() => loadMyCoachGyms(userId).then(setGyms))}><T size="xs" color={colors.danger}>  {t('common.delete')}</T></Pressable>
              </Row>
            ))}
            {picking ? <GymPicker userId={userId} value={null} onChange={async (g) => { setPicking(false); try { await addCoachGym(userId, g.id); setGyms(await loadMyCoachGyms(userId)); } catch (e) { Alert.alert(t(errorKey(e))); } }} />
              : <Button small variant="secondary" icon="add" title={t('coaching.addGym')} onPress={() => setPicking(true)} />}
            <T size="xs" muted>{t('coaching.gymHint')}</T>
          </Card>
          <Card style={{ gap: space.sm }}>
            {profile.is_coach ? <VerifiedBadge /> : p.verify_requested_at ? <T size="sm" semibold>{t('coaching.verifyPending')}</T> : (
              <>
                <T size="sm">{t('coaching.verifyIntro')}</T>
                <Button small variant="secondary" icon="shield-checkmark-outline" title={t('coaching.requestVerify')}
                  onPress={async () => { if (!f.certs.trim()) return Alert.alert(t('coaching.err_certs')); await requestVerification(userId); setP({ ...p, verify_requested_at: new Date().toISOString() }); }} />
              </>
            )}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
