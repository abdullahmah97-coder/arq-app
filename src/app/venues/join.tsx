// انضم كملعب أو استوديو: البيانات، الرياضات، ساعات العمل ومدة الحجز والسعر، والصورة. يظهر بعد موافقة إدارة أرك
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';
import { SportIcon, VenueArt } from '@/components/bookings/parts';
import { Button, Card, Input, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import {
  clockLabel, COURT_SPORTS, loadMyVenue, saveMyVenue, SPORTS, uploadVenueImage, type Sport, type Venue, type VenueInput,
} from '@/lib/bookings';
import { useLocalized } from '@/lib/i18n';
import { setAccountType } from '@/lib/partners';
import { errorKey } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function VenueJoin() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId, profile, refreshProfile } = useUser();
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<Venue | null>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<VenueInput>({
    sports: [], name: '', name_en: null, city: '', city_en: null, district: null, district_en: null, audience: 'mixed', about: null, about_en: null,
    phone: null, maps_url: null, booking_url: null, website: null, instagram: null, image_path: null,
    open_hour: 16, close_hour: 24, slot_min: 60, price_sar: null, auto_confirm: false,
  });
  const [price, setPrice] = useState('');
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    loadMyVenue(userId).then((v) => {
      if (v) {
        setExisting(v); setConsent(true);
        const { id: _i, owner: _o, listed_by: _l, status: _s, review_note: _r, created_at: _c, source_url: _src, ...rest } = v;
        setF(rest); setPrice(v.price_sar != null ? String(v.price_sar) : '');
      }
    }).finally(() => setLoading(false));
  }, [userId]);

  if (loading) return <Loading />;
  const set = <K extends keyof VenueInput>(k: K) => (val: VenueInput[K]) => setF((x) => ({ ...x, [k]: val }));
  const hasCourts = f.sports.some((s) => COURT_SPORTS.includes(s));
  const toggleSport = (s: Sport) => set('sports')(f.sports.includes(s) ? f.sports.filter((x) => x !== s) : [...f.sports, s]);

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    const a = res.canceled ? null : res.assets?.[0];
    if (!a) return;
    setBusy(true);
    try { set('image_path')(await uploadVenueImage(userId, a.uri, a.mimeType ?? 'image/jpeg')); }
    catch (e) { Alert.alert(String((e as Error)?.message) === 'file_too_big' ? t('events.tooBig', { mb: 5 }) : t('errors.generic')); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (f.name.trim().length < 2) return Alert.alert(t('venue.err_name'));
    if (!f.sports.length) return Alert.alert(t('venue.err_sports'));
    if (f.city.trim().length < 2) return Alert.alert(t('venue.err_city'));
    if (f.phone && !/^\+?[0-9 ]{6,20}$/.test(toLatin(f.phone).trim())) return Alert.alert(t('venue.err_phone'));
    if (f.maps_url && !/^https:\/\/\S+$/.test(f.maps_url.trim())) return Alert.alert(t('venue.err_link'));
    const p = price.trim() ? Number(toLatin(price).replace(',', '.')) : null;
    if (p != null && (!Number.isFinite(p) || p < 0 || p > 5000)) return Alert.alert(t('venue.err_price'));
    if (!consent) return Alert.alert(t('venue.err_consent'));
    setBusy(true);
    try {
      await saveMyVenue({ ...f, phone: f.phone ? toLatin(f.phone) : null, price_sar: p }, existing?.id);
      if (profile.account_type === 'trainee') { await setAccountType(userId, 'venue').catch(() => {}); refreshProfile(); }
      router.replace('/venues/manage');
    } catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: existing ? t('venue.editTitle') : t('venue.joinTitle') }} />
      {!existing ? (
        <View style={{ backgroundColor: brand.deepGreen, borderRadius: radius.lg, padding: space.lg, gap: 6 }}>
          <T size="lg" bold color={brand.cream}>{t('venue.joinTitle')}</T>
          <T size="sm" color={brand.sand} style={{ lineHeight: 22 }}>{t('venue.joinIntro')}</T>
        </View>
      ) : existing.status === 'rejected' && existing.review_note ? (
        <View style={{ backgroundColor: 'rgba(241,85,29,0.12)', borderRadius: radius.md, padding: space.md, gap: 4 }}>
          <T semibold color={brand.orange}>{t('venue.needsChanges')}</T>
          <T size="sm">{existing.review_note}</T>
        </View>
      ) : null}

      <Card style={{ gap: space.sm }}>
        <Input label={t('venue.name')} value={f.name} onChangeText={set('name')} maxLength={80} placeholder={t('venue.namePh')} />
        <Input label={t('venue.nameEn')} value={f.name_en ?? ''} onChangeText={set('name_en')} maxLength={80} autoCapitalize="words" />
        <T size="sm" muted>{t('venue.sports')}</T>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          {SPORTS.map((s) => {
            const on = f.sports.includes(s);
            return (
              <Pressable key={s} onPress={() => toggleSport(s)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? brand.deepGreen : colors.cardAlt }}>
                <SportIcon sport={s} size={15} color={on ? brand.amber : colors.text} />
                <T size="sm" semibold color={on ? brand.cream : colors.text}>{t(`book.sport_${s}`)}</T>
              </Pressable>
            );
          })}
        </Row>
        <T size="sm" muted>{t('venue.audience')}</T>
        <Segmented<'mixed' | 'men' | 'women'> value={f.audience ?? 'mixed'} onChange={set('audience')}
          options={(['mixed', 'men', 'women'] as const).map((a) => ({ value: a, label: t(`book.aud_${a}`) }))} />
      </Card>

      <Card style={{ gap: space.sm }}>
        <Row gap={space.sm}>
          <View style={{ flex: 1 }}><Input label={t('venue.city')} value={f.city} onChangeText={set('city')} maxLength={40} placeholder={t('events.f_cityPh')} /></View>
          <View style={{ flex: 1 }}><Input label={t('venue.district')} value={f.district ?? ''} onChangeText={set('district')} maxLength={60} /></View>
        </Row>
        <Input label={t('venue.maps')} hint={t('venue.mapsHint')} value={f.maps_url ?? ''} onChangeText={set('maps_url')} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://maps.app.goo.gl/…" />
        <Input label={t('venue.phone')} value={f.phone ?? ''} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="05xxxxxxxx" maxLength={20} />
        <Input label={t('venue.instagram')} value={f.instagram ?? ''} onChangeText={set('instagram')} autoCapitalize="none" autoCorrect={false} maxLength={31} placeholder="@" />
        <Input label={t('venue.about')} value={f.about ?? ''} onChangeText={set('about')} maxLength={500} multiline placeholder={t('venue.aboutPh')} />
      </Card>

      {hasCourts ? (
        <Card style={{ gap: space.sm }}>
          <T semibold>{t('venue.courtsTitle')}</T>
          <T size="sm" muted>{t('venue.opens')}</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {HOURS.map((h) => <HourChip key={h} on={f.open_hour === h} label={clockLabel(h * 60, lng)}
              onPress={() => setF((x) => ({ ...x, open_hour: h, close_hour: Math.min(Math.max(x.close_hour, h + 1), h + 24, 30) }))} />)}
          </ScrollView>
          <T size="sm" muted>{t('venue.closes')}</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {Array.from({ length: Math.min(30, f.open_hour + 24) - f.open_hour }, (_, i) => f.open_hour + 1 + i).map((h) => (
              <HourChip key={h} on={f.close_hour === h} label={clockLabel(h * 60, lng) + (h > 24 ? ` ${t('venue.nextDay')}` : '')} onPress={() => set('close_hour')(h)} />
            ))}
          </ScrollView>
          <T size="sm" muted>{t('venue.slot')}</T>
          <Segmented<number> value={f.slot_min} onChange={set('slot_min')} options={[60, 90, 120, 30].map((n) => ({ value: n, label: t('book.slotLen', { n }) }))} />
          <Input label={t('venue.price')} hint={t('venue.priceHint')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" maxLength={7} />
          <Row>
            <View style={{ flex: 1 }}><T semibold>{t('venue.autoConfirm')}</T><T size="xs" muted>{t('venue.autoConfirmHint')}</T></View>
            <Switch value={f.auto_confirm} onValueChange={set('auto_confirm')} trackColor={{ true: brand.orange }} />
          </Row>
        </Card>
      ) : null}

      <Card style={{ gap: space.sm }}>
        <T semibold>{t('venue.image')}</T>
        <Pressable onPress={pick} disabled={busy}><VenueArt v={{ sports: f.sports.length ? f.sports : ['padel'], image_path: f.image_path }} style={{ height: 140, borderRadius: radius.md }} iconSize={48} /></Pressable>
        <Button small variant="secondary" icon="images-outline" title={f.image_path ? t('events.change') : t('events.pick')} loading={busy} onPress={pick} />
        <T size="xs" muted>{t('venue.imageHint')}</T>
      </Card>

      <Pressable onPress={() => setConsent((c) => !c)} accessibilityRole="checkbox" accessibilityState={{ checked: consent }} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <Ionicons name={consent ? 'checkbox' : 'square-outline'} size={22} color={consent ? brand.orange : colors.muted} />
        <T size="sm" style={{ flex: 1, lineHeight: 22 }}>{t('venue.consent')}</T>
      </Pressable>
      <Button icon="paper-plane-outline" title={existing ? t('common.save') : t('venue.submit')} loading={busy} onPress={submit} />
      {!existing ? <T size="xs" muted center>{t('venue.reviewNote')}</T> : null}
    </Screen>
  );
}

function HourChip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? brand.deepGreen : colors.cardAlt }}>
      <T size="sm" semibold color={on ? brand.cream : colors.text}>{label}</T>
    </Pressable>
  );
}
