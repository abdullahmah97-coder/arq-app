// زر رجوع/إغلاق خاص بالتطبيق في رأس الصفحات
// سبب وجوده: زر الرجوع الأصلي في iOS 26 يتوقف أحياناً عن الاستجابة في الصفحات المفتوحة فوق التبويبات،
// وصفحات النوافذ (modal) ما فيها زر رجوع أصلاً. هذا الزر يشتغل دائماً، ويرجع للرئيسية إذا ما فيه صفحة سابقة.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { I18nManager, Pressable } from 'react-native';
import { colors } from '@/theme';

export function goBackOrHome() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

export function HeaderBack({ close, tintColor }: { close?: boolean; tintColor?: string }) {
  const { t } = useTranslation();
  const icon = close ? 'close' : I18nManager.isRTL ? 'chevron-forward' : 'chevron-back';
  return (
    <Pressable
      onPress={goBackOrHome}
      hitSlop={14}
      accessibilityRole="button"
      accessibilityLabel={close ? t('common.close') : t('common.back')}
      style={({ pressed }) => ({ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.45 : 1 })}
    >
      <Ionicons name={icon} size={close ? 24 : 27} color={tintColor ?? colors.text} />
    </Pressable>
  );
}
