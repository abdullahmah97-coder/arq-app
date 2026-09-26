import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { setLocale } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { Segmented } from './ui';
import type { Locale } from '@/lib/types';

export function LanguageToggle({ userId }: { userId?: string }) {
  const { t, i18n } = useTranslation();
  const value: Locale = i18n.language === 'en' ? 'en' : 'ar';

  const change = async (lng: Locale) => {
    if (lng === value) return;
    const { needsRestart } = await setLocale(lng);
    if (userId) await supabase.from('profiles').update({ locale: lng }).eq('id', userId);
    if (needsRestart) Alert.alert(t('profile.restartTitle'), t('profile.restartBody'));
  };

  return (
    <Segmented
      wrap
      value={value}
      onChange={change}
      options={[{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]}
    />
  );
}
