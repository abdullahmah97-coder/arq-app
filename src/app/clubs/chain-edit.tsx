// تعديل بيانات السلسلة وشعارها (للمالك ومدير السلسلة فقط — مفروض في القاعدة)
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { ClubLogo } from '@/components/clubs/parts';
import { Button, Input, Row, Screen, Segmented, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { saveChain, type Audience } from '@/lib/clubs';
import { pickImage } from '@/lib/images';
import { errorKey, supabase, uploadImage } from '@/lib/supabase';
import { colors, space } from '@/theme';

export default function ChainEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { userId } = useUser();
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [audience, setAudience] = useState<Audience>('mixed');
  const [website, setWebsite] = useState('');
  const [instagram, setInstagram] = useState('');
  const [description, setDescription] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('gym_chains').select('*').eq('id', id).single().then(({ data: c }) => {
      if (!c) return;
      setName(c.name); setNameEn(c.name_en ?? ''); setAudience(c.audience); setWebsite(c.website ?? ''); setInstagram(c.instagram ?? '');
      setDescription(c.description ?? ''); setLogo(c.logo_path);
    });
  }, [id]);

  const pickLogo = async () => {
    const img = await pickImage('library', [1, 1]);
    if (!img) return;
    try { setLogo(await uploadImage('brands', userId, img.uri, img.mimeType)); } catch (e) { Alert.alert(t(errorKey(e))); }
  };

  const save = async () => {
    if (name.trim().length < 2) return Alert.alert(t('store.err_name'));
    const web = website.trim() ? (/^https:\/\//i.test(website.trim()) ? website.trim() : `https://${website.trim().replace(/^http:\/\//i, '')}`) : null;
    setBusy(true);
    try {
      await saveChain(String(id), { name: name.trim(), name_en: nameEn.trim() || null, audience, website: web, instagram: instagram.trim().replace(/^@/, '') || null, description: description.trim() || null, logo_path: logo });
      router.back();
    } catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };

  return (
    <Screen edges={['bottom']}>
      <Pressable onPress={pickLogo} style={{ alignItems: 'center', gap: 6 }} accessibilityRole="button" accessibilityLabel={t('clubs.uploadLogo')}>
        <ClubLogo c={{ name: nameEn || name || '?', logo_path: logo }} size={96} />
        <Row gap={4}><Ionicons name="image-outline" size={15} color={colors.primary} /><T size="sm" semibold color={colors.primary}>{logo ? t('store.changeLogo') : t('clubs.uploadLogo')}</T></Row>
      </Pressable>
      <T size="xs" muted center style={{ lineHeight: 19 }}>{t('clubs.logoHint')}</T>
      <Input label={t('clubs.nameAr')} value={name} onChangeText={setName} maxLength={60} />
      <Input label={t('clubs.nameEn')} value={nameEn} onChangeText={setNameEn} maxLength={60} autoCapitalize="words" />
      <View style={{ gap: 6 }}>
        <T size="sm" semibold>{t('clubs.audience')}</T>
        <Segmented<Audience> value={audience} onChange={setAudience} options={[{ value: 'men', label: t('clubs.aud_men') }, { value: 'women', label: t('clubs.aud_women') }, { value: 'mixed', label: t('clubs.aud_mixed') }]} />
      </View>
      <Input label={t('store.website')} value={website} onChangeText={setWebsite} autoCapitalize="none" keyboardType="url" />
      <Input label={t('store.instagram')} value={instagram} onChangeText={setInstagram} autoCapitalize="none" />
      <Input label={t('store.description')} value={description} onChangeText={setDescription} maxLength={400} multiline style={{ minHeight: 80, textAlignVertical: 'top' }} />
      <Button title={t('store.save')} icon="checkmark" loading={busy} onPress={save} />
      <View style={{ height: space.lg }} />
    </Screen>
  );
}
