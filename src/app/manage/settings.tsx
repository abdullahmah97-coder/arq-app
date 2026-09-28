// إعدادات الفرع: مكافأة «ادعُ صديقك» ومهلة إلغاء الحجز
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { Button, Input, Screen, Segmented, T } from '@/components/ui';
import { loadGymSettings, saveGymSettings } from '@/lib/gymops';
import { goBackOrHome } from '@/lib/nav';
import { errorKey } from '@/lib/supabase';

export default function GymSettings() {
  const { gym } = useLocalSearchParams<{ gym: string }>();
  const { t } = useTranslation();
  const [reward, setReward] = useState('');
  const [cutoff, setCutoff] = useState(60);
  const [busy, setBusy] = useState(false);
  useEffect(() => { loadGymSettings(String(gym)).then((s) => { if (s) { setReward(s.referral_reward ?? ''); setCutoff(s.class_cutoff_min); } }); }, [gym]);
  const save = async () => {
    setBusy(true);
    try { await saveGymSettings(String(gym), { referral_reward: reward.trim() || null, class_cutoff_min: cutoff }); goBackOrHome(); }
    catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('gymops.tool_settings') }} />
      <Input label={t('gymops.referralReward')} value={reward} onChangeText={setReward} maxLength={160} placeholder={t('gymops.referralRewardPh')} hint={t('gymops.referralRewardHint')} />
      <T size="sm" muted>{t('gymops.cancelCutoff')}</T>
      <Segmented<number> wrap value={cutoff} onChange={setCutoff} options={[0, 30, 60, 120, 240].map((m) => ({ value: m, label: m ? t('gymops.minutesN', { count: m }) : t('gymops.anytime') }))} />
      <Button icon="checkmark" title={t('common.save')} loading={busy} onPress={save} />
    </Screen>
  );
}
