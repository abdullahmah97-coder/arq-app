// أضف متجرك / عدّل متجرك: مطعم صحي، ملابس رياضية، مكملات أو معدات (يُراجع من فريق ARQ قبل الظهور)
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { BrandLogo } from '@/components/store/parts';
import { Button, Card, Input, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { AdminBanner } from '@/components/partners/parts';
import { BRAND_CATEGORIES, loadBrand, loadMyBrand, saveBrand, type Brand, type BrandCategory } from '@/lib/brands';
import { goBackOrHome } from '@/lib/nav';
import { pickImage } from '@/lib/images';
import { errorKey, uploadImage } from '@/lib/supabase';
import { brand, colors, space } from '@/theme';

export default function JoinStore() {
  // ?id= المالك يعدّل أي متجر، ?new=1 المالك يضيف صفحة متجر بدون صاحب
  const { id: adminId, new: adminNew } = useLocalSearchParams<{ id?: string; new?: string }>();
  const admin = !!adminId || adminNew === '1';
  const { t } = useTranslation();
  const { userId } = useUser();
  const [existing, setExisting] = useState<Brand | null | undefined>(adminNew === '1' ? null : undefined);
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<BrandCategory>('restaurant');
  const [website, setWebsite] = useState('');
  const [instagram, setInstagram] = useState('');
  const [city, setCity] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [agree, setAgree] = useState(adminNew === '1');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (adminNew === '1') return;
    (adminId ? loadBrand(String(adminId)) : loadMyBrand(userId)).then((b) => {
      setExisting(b);
      if (b) {
        setName(b.name); setTagline(b.tagline ?? ''); setDescription(b.description ?? ''); setCategory(b.category);
        setWebsite(b.website ?? ''); setInstagram(b.instagram ?? ''); setCity(b.city ?? ''); setLogo(b.logo_path); setAgree(true);
      }
    }).catch(() => setExisting(null));
  }, [userId, adminId, adminNew]);

  if (existing === undefined) return <Loading />;

  const pickLogo = async () => {
    const img = await pickImage('library', [1, 1]);
    if (!img) return;
    try { setLogo(await uploadImage('brands', userId, img.uri, img.mimeType)); } catch (e) { Alert.alert(t(errorKey(e))); }
  };

  const submit = async () => {
    if (name.trim().length < 2) return Alert.alert(t('store.err_name'));
    if (!website.trim() && !instagram.trim()) return Alert.alert(t('store.err_link'));
    if (!agree) return Alert.alert(t('store.err_agree'));
    setBusy(true);
    try {
      await saveBrand(userId, { name, tagline, description, category, website, instagram, city, logo_path: logo }, existing?.id, adminNew === '1');
      if (admin) { goBackOrHome(); return; }
      if (!existing) Alert.alert(t('store.submitted'), t('store.submittedBody'));
      router.dismissTo('/store/manage');
    } catch (e) {
      Alert.alert(t(errorKey(e)));
    } finally { setBusy(false); }
  };

  return (
    <Screen edges={['bottom']}>
      {admin ? <Stack.Screen options={{ title: adminNew === '1' ? t('partners.addStorePage') : t('store.editStore') }} /> : null}
      {admin ? <AdminBanner /> : null}
      {!existing && !admin ? (
        <Card style={{ gap: space.sm, backgroundColor: brand.deepGreen, borderColor: brand.deepGreen }}>
          <T bold color={brand.cream}>{t('store.joinTitle')}</T>
          {(['join1', 'join2', 'join3'] as const).map((k, i) => (
            <Row key={k} style={{ alignItems: 'flex-start' }}>
              <T bold color={brand.amber}>{i + 1}</T>
              <T size="sm" color={brand.sand} style={{ flex: 1, lineHeight: 22 }}>{t(`store.${k}`)}</T>
            </Row>
          ))}
        </Card>
      ) : null}

      <Pressable onPress={pickLogo} style={{ alignItems: 'center', gap: 6 }} accessibilityRole="button" accessibilityLabel={t('store.logo')}>
        <BrandLogo b={{ name: name || 'A', logo_path: logo }} size={92} />
        <Row gap={4}><Ionicons name="image-outline" size={15} color={colors.primary} /><T size="sm" semibold color={colors.primary}>{logo ? t('store.changeLogo') : t('store.logo')}</T></Row>
      </Pressable>

      <Input label={t('store.name')} value={name} onChangeText={setName} maxLength={60} placeholder={t('store.namePh')} />
      <Input label={t('store.tagline')} value={tagline} onChangeText={setTagline} maxLength={120} placeholder={t('store.taglinePh')} />
      <View style={{ gap: 6 }}>
        <T size="sm" semibold>{t('store.category')}</T>
        <Segmented<BrandCategory> wrap value={category} onChange={setCategory} options={BRAND_CATEGORIES.map((c) => ({ value: c, label: t(`store.cat_${c}`) }))} />
      </View>
      {category === 'restaurant' ? <Input label={t('store.city')} value={city} onChangeText={setCity} maxLength={40} placeholder={t('store.cityPh')} /> : null}
      <Input label={t('store.description')} value={description} onChangeText={setDescription} maxLength={600} multiline style={{ minHeight: 90, textAlignVertical: 'top' }} placeholder={t('store.descriptionPh')} />
      <Input label={t('store.website')} value={website} onChangeText={setWebsite} autoCapitalize="none" keyboardType="url" placeholder="yourbrand.sa" />
      <Input label={t('store.instagram')} value={instagram} onChangeText={setInstagram} autoCapitalize="none" placeholder="@yourbrand" />

      {!existing && !admin ? (
        <Pressable onPress={() => setAgree(!agree)} accessibilityRole="checkbox" accessibilityState={{ checked: agree }}>
          <Row style={{ alignItems: 'flex-start' }}>
            <Ionicons name={agree ? 'checkbox' : 'square-outline'} size={22} color={agree ? brand.orange : colors.muted} />
            <T size="sm" style={{ flex: 1, lineHeight: 22 }}>{t('store.agree')}</T>
          </Row>
        </Pressable>
      ) : null}

      <Button title={existing || admin ? t('store.save') : t('store.submit')} icon={existing || admin ? 'checkmark' : 'paper-plane-outline'} loading={busy} onPress={submit} />
    </Screen>
  );
}
