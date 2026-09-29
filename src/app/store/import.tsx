// استيراد منتجات أو منيو دفعة وحدة: ينسخ الشريك (أو المالك من إيميل الشريك) الجدول من إكسل ويلصقه هنا، ونعرض المعاينة قبل الإضافة
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { Button, Card, Input, Row, Screen, T } from '@/components/ui';
import { importProducts, parseProductsText } from '@/lib/brands';
import { useLocalized } from '@/lib/i18n';
import { goBackOrHome } from '@/lib/nav';
import { errorKey } from '@/lib/supabase';
import { brand, colors, space } from '@/theme';

export default function ImportProducts() {
  const { brand: brandId } = useLocalSearchParams<{ brand: string }>();
  const { t } = useTranslation();
  const { num } = useLocalized();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => parseProductsText(text), [text]);

  const run = async () => {
    if (!parsed.rows.length) return Alert.alert(t('partners.importEmpty'));
    setBusy(true);
    try {
      const n = await importProducts(String(brandId), parsed.rows);
      Alert.alert(t('partners.imported', { n }));
      goBackOrHome();
    } catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('partners.importTitle') }} />
      <Card style={{ gap: 6, backgroundColor: brand.deepGreen, borderColor: brand.deepGreen }}>
        <T bold color={brand.cream}>{t('partners.importHow')}</T>
        <T size="sm" color={brand.sand} style={{ lineHeight: 22 }}>{t('partners.importColumns')}</T>
        <T size="xs" color={brand.amber}>{t('partners.importExample')}</T>
      </Card>
      <Input value={text} onChangeText={setText} multiline maxLength={20000} autoCapitalize="none"
        style={{ minHeight: 180, textAlignVertical: 'top', fontSize: 13 }} placeholder={t('partners.importPh')} />
      {text.trim() ? (
        <Card style={{ gap: 6 }}>
          <T semibold>{t('partners.importPreview', { n: parsed.rows.length })}</T>
          {parsed.rows.slice(0, 8).map((r, i) => (
            <Row key={i} style={{ justifyContent: 'space-between' }}>
              <T size="sm" numberOfLines={1} style={{ flex: 1 }}>{r.name}</T>
              <T size="xs" muted>{[r.price_sar != null ? `${num(r.price_sar)} ${t('store.sar')}` : null, r.kcal != null ? `${num(r.kcal)} ${t('common.kcal')}` : null,
                r.stock != null ? t('store.stockLeft', { n: r.stock }) : null].filter(Boolean).join(' · ')}</T>
            </Row>
          ))}
          {parsed.rows.length > 8 ? <T size="xs" muted>+{parsed.rows.length - 8}</T> : null}
          {parsed.errors.length ? <T size="xs" color={colors.danger}>{t('partners.importErrors', { lines: parsed.errors.slice(0, 10).join('، ') })}</T> : null}
        </Card>
      ) : null}
      <View style={{ gap: space.sm }}>
        <Button icon="cloud-upload-outline" title={t('partners.importRun', { n: parsed.rows.length })} loading={busy} disabled={!parsed.rows.length} onPress={run} />
        <T size="xs" muted center>{t('partners.importLimit')}</T>
      </View>
    </Screen>
  );
}
