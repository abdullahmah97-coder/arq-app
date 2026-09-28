// إضافة / تعديل منتج في متجري
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Switch, View } from 'react-native';
import { Button, Input, Row, Screen, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { saveProduct } from '@/lib/brands';
import { pickImage } from '@/lib/images';
import { errorKey, publicUrl, supabase, uploadImage } from '@/lib/supabase';
import { brand, colors, radius } from '@/theme';
import { goBackOrHome } from '@/lib/nav';

export default function ProductForm() {
  const { brand: brandId, id } = useLocalSearchParams<{ brand: string; id?: string }>();
  const { t } = useTranslation();
  const { userId } = useUser();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase.from('brand_products').select('*').eq('id', id).single().then(({ data }) => {
      if (!data) return;
      setName(data.name); setPrice(data.price_sar != null ? String(+data.price_sar) : ''); setDescription(data.description ?? '');
      setUrl(data.url ?? ''); setImage(data.image_path); setActive(data.active);
    });
  }, [id]);

  const pick = async () => {
    const img = await pickImage('library', [1, 1]);
    if (!img) return;
    try { setImage(await uploadImage('brands', userId, img.uri, img.mimeType)); } catch (e) { Alert.alert(t(errorKey(e))); }
  };

  const save = async () => {
    if (name.trim().length < 2) return Alert.alert(t('store.err_productName'));
    const n = price.trim() ? Number(price.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(',', '.')) : null;
    if (n != null && !(n >= 0 && n <= 100000)) return Alert.alert(t('errors.invalidNumber'));
    setBusy(true);
    try {
      await saveProduct(String(brandId), { name, description, price_sar: n, url: url || null, image_path: image, active }, id);
      goBackOrHome();
    } catch (e) {
      Alert.alert(t(errorKey(e)));
    } finally { setBusy(false); }
  };

  const uri = publicUrl('brands', image);
  return (
    <Screen edges={['bottom']}>
      <Pressable onPress={pick} accessibilityRole="button" accessibilityLabel={t('store.productImage')}
        style={{ alignSelf: 'center', width: 180, aspectRatio: 1, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
        {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : (
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Ionicons name="camera-outline" size={30} color={colors.primary} />
            <T size="sm" semibold color={colors.primary}>{t('store.productImage')}</T>
          </View>
        )}
      </Pressable>
      <Input label={t('store.productName')} value={name} onChangeText={setName} maxLength={80} placeholder={t('store.productNamePh')} />
      <Input label={t('store.price')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="129" />
      <Input label={t('store.productDesc')} value={description} onChangeText={setDescription} maxLength={300} multiline style={{ minHeight: 70, textAlignVertical: 'top' }} />
      <Input label={t('store.productUrl')} value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" placeholder="yourbrand.sa/products/tee" hint={t('store.productUrlHint')} />
      <Row style={{ justifyContent: 'space-between' }}>
        <T semibold>{t('store.visible')}</T>
        <Switch value={active} onValueChange={setActive} trackColor={{ true: brand.orange }} />
      </Row>
      <Button title={t('store.saveProduct')} icon="checkmark" loading={busy} onPress={save} />
    </Screen>
  );
}
