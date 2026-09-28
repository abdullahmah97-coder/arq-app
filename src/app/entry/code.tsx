// الاستقبال: إدخال رقم العضو (٦ خانات) يدوياً، أو انتظار المسح بكاميرا الجوال
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EntryVerifier } from '@/components/gymops/EntryVerifier';
import { Screen } from '@/components/ui';

export default function EntryByCode() {
  const { gym } = useLocalSearchParams<{ gym?: string }>();
  const { t } = useTranslation();
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('gymops.verifyEntry') }} />
      <EntryVerifier gymParam={gym ?? null} />
    </Screen>
  );
}
