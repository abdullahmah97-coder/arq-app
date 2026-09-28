// يفتح لما الاستقبال يمسح رمز العضو بكاميرا الجوال (arq://entry/<token>)
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EntryVerifier } from '@/components/gymops/EntryVerifier';
import { Screen } from '@/components/ui';

export default function EntryFromScan() {
  const { token, gym } = useLocalSearchParams<{ token: string; gym?: string }>();
  const { t } = useTranslation();
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('gymops.verifyEntry') }} />
      <EntryVerifier token={token === 'code' ? null : token} gymParam={gym ?? null} />
    </Screen>
  );
}
