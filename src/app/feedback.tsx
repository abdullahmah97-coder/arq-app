// ملاحظات المختبرين: خطأ / فكرة / تصميم — تُحفظ مع رقم النسخة والجهاز لتسهيل الإصلاح
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { Button, Input, OptionCard, Screen, T } from '@/components/ui';
import { appMeta, versionLabel } from '@/lib/appInfo';
import { useUser } from '@/lib/auth';
import { errorKey, supabase } from '@/lib/supabase';
import { space } from '@/theme';

type Category = 'bug' | 'idea' | 'design' | 'other';
const ICONS = { bug: 'bug-outline', idea: 'bulb-outline', design: 'color-palette-outline', other: 'chatbubble-ellipses-outline' } as const;

export default function Feedback() {
  const { t } = useTranslation();
  const { userId } = useUser();
  const { screen } = useLocalSearchParams<{ screen?: string }>();
  const [category, setCategory] = useState<Category>('bug');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (message.trim().length < 3) return;
    setBusy(true);
    const { error } = await supabase.from('beta_feedback').insert({
      user_id: userId, category, message: message.trim(), screen: screen ?? null, ...appMeta(),
    });
    setBusy(false);
    if (error) return Alert.alert(t(errorKey(error)));
    Alert.alert(t('beta.thanks'));
    router.back();
  };

  return (
    <Screen edges={['bottom']}>
      <T muted style={{ lineHeight: 24 }}>{t('beta.intro')}</T>
      {(['bug', 'idea', 'design', 'other'] as const).map((c) => (
        <OptionCard key={c} title={t(`beta.cat_${c}`)} icon={ICONS[c]} selected={category === c} onPress={() => setCategory(c)} />
      ))}
      <Input label={t('beta.message')} value={message} onChangeText={setMessage} multiline maxLength={2000}
        placeholder={t(`beta.ph_${category}`)} style={{ minHeight: 130 }} />
      <Button title={t('beta.send')} icon="send" onPress={send} loading={busy} disabled={message.trim().length < 3} />
      <T size="xs" muted center style={{ marginTop: space.sm }}>{versionLabel()}</T>
    </Screen>
  );
}
