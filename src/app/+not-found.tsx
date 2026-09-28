// رابط لصفحة غير موجودة (مثلاً رابط قديم): رسالة بالعربي/الإنجليزي وزر للرئيسية
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, T } from '@/components/ui';
import { brand, colors, space } from '@/theme';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: '' }} />
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="compass-outline" size={32} color={brand.orange} />
      </View>
      <T bold center>{t('errors.notFoundTitle')}</T>
      <T size="sm" muted center>{t('errors.notFoundHint')}</T>
      <Button title={t('common.home')} icon="home-outline" style={{ alignSelf: 'stretch' }} onPress={() => router.replace('/(tabs)')} />
    </View>
  );
}
