// قبل i18next: قواعد الجمع (يوم/يومين/أيام) لأن محرك الجوال ما فيه Intl.PluralRules
import '../polyfills/pluralRules';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { I18nManager } from 'react-native';
import ar from '../locales/ar.json';
import en from '../locales/en.json';
import type { I18nText, Locale } from './types';
import { setFontLang } from '../theme';

const KEY = 'app.locale';

function deviceLocale(): Locale {
  const code = getLocales()[0]?.languageCode ?? 'ar';
  return code === 'en' ? 'en' : 'ar';
}

i18n.use(initReactI18next).init({
  resources: { ar: { translation: ar }, en: { translation: en } },
  lng: I18nManager.isRTL ? 'ar' : deviceLocale(),
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
  returnObjects: true,
});

/** يُستدعى عند بدء التشغيل لاستعادة اللغة المحفوظة */
export async function restoreLocale(): Promise<void> {
  const saved = (await AsyncStorage.getItem(KEY)) as Locale | null;
  const lng = saved ?? deviceLocale();
  await i18n.changeLanguage(lng);
  setFontLang(lng);
  applyDirection(lng);
}

/** يضبط اتجاه الواجهة؛ يرجع true إذا تغيّر الاتجاه ويحتاج إعادة تشغيل */
function applyDirection(lng: Locale): boolean {
  const rtl = lng === 'ar';
  I18nManager.allowRTL(rtl);
  if (I18nManager.isRTL !== rtl) {
    I18nManager.forceRTL(rtl);
    return true;
  }
  return false;
}

export async function setLocale(lng: Locale): Promise<{ needsRestart: boolean }> {
  await AsyncStorage.setItem(KEY, lng);
  await i18n.changeLanguage(lng);
  setFontLang(lng);
  return { needsRestart: applyDirection(lng) };
}

export function currentLocale(): Locale {
  return i18n.language === 'en' ? 'en' : 'ar';
}

/** اختيار النص حسب اللغة الحالية من كائن {ar,en} */
export function useLocalized() {
  const { i18n: inst } = useTranslation();
  const lng: Locale = inst.language === 'en' ? 'en' : 'ar';
  return {
    lng,
    L: (x: I18nText | null | undefined) => (x ? x[lng] || x.ar || x.en : ''),
    num: (n: number) => new Intl.NumberFormat(lng === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US').format(n),
  };
}

export default i18n;
