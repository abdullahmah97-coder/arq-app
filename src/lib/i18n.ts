// قبل i18next: قواعد الجمع (يوم/يومين/أيام) لأن محرك الجوال ما فيه Intl.PluralRules
import '../polyfills/pluralRules';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import * as Updates from 'expo-updates';
import { initReactI18next, useTranslation } from 'react-i18next';
import { AppState, I18nManager, Platform } from 'react-native';
import ar from '../locales/ar.json';
import en from '../locales/en.json';
import type { I18nText, Locale } from './types';
import { setFontLang } from '../theme';

const KEY = 'app.locale';
/** لغة الجوال (أو لغة أرك من إعدادات الجوال) آخر مرة فتح التطبيق: لو تغيّرت من الإعدادات نمشي عليها */
const DEVICE_KEY = 'app.deviceLocale';
/** آخر مرة أعدنا التشغيل عشان اتجاه الواجهة (يمين/يسار): ما نعيده أكثر من مرة ورا بعض */
const DIR_RELOAD_KEY = 'app.dirReloadAt';

function deviceLocale(): Locale {
  const code = getLocales()[0]?.languageCode ?? 'ar';
  return code === 'en' ? 'en' : 'ar';
}

/**
 * يعيد تشغيل التطبيق عشان يتطبّق اتجاه الواجهة الجديد (العربي يمين، الإنجليزي يسار).
 * مرة وحدة بس خلال دقيقة (لو ما تطبّق بعدها ما ندخل في دوامة). يرجع false لو ما قدر.
 */
export async function reloadForDirection(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const last = Number(await AsyncStorage.getItem(DIR_RELOAD_KEY)) || 0;
    if (Date.now() - last < 60_000) return false;
    await AsyncStorage.setItem(DIR_RELOAD_KEY, String(Date.now()));
    await Updates.reloadAsync();
    return true;
  } catch {
    return false;
  }
}

i18n.use(initReactI18next).init({
  resources: { ar: { translation: ar }, en: { translation: en } },
  lng: I18nManager.isRTL ? 'ar' : deviceLocale(),
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
  returnObjects: true,
});

/**
 * يُستدعى عند بدء التشغيل: اللغة تتغيّر من داخل التطبيق أو من إعدادات الجوال.
 * لو لغة الجوال (أو لغة أرك في إعدادات الجوال) تغيّرت من آخر مرة ← نمشي عليها، وإلا اختياره من داخل التطبيق.
 */
export async function restoreLocale(): Promise<void> {
  const [saved, seen] = await Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(DEVICE_KEY)]).catch(() => [null, null]);
  const device = deviceLocale();
  const fromSettings = !!seen && seen !== device;
  const lng: Locale = fromSettings ? device : saved === 'en' || saved === 'ar' ? saved : device;
  if (seen !== device) AsyncStorage.setItem(DEVICE_KEY, device).catch(() => {});
  if (fromSettings && saved !== lng) AsyncStorage.setItem(KEY, lng).catch(() => {});
  await i18n.changeLanguage(lng);
  setFontLang(lng);
  // الاتجاه تغيّر (مثلاً غيّر اللغة من إعدادات الجوال): نعيد التشغيل مرة عشان تنقلب الواجهة
  if (applyDirection(lng)) void reloadForDirection();
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

/**
 * لغة أرك من إعدادات الجوال: الآيفون يعيد تشغيل التطبيق لحاله (ويمسكها restoreLocale)،
 * والأندرويد ما يعيده، فنتأكد كل ما يرجع للتطبيق ونطبّقها.
 */
export function watchDeviceLocale(): () => void {
  const sub = AppState.addEventListener('change', (s) => {
    if (s !== 'active') return;
    void (async () => {
      const device = deviceLocale();
      const seen = await AsyncStorage.getItem(DEVICE_KEY).catch(() => null);
      if (!seen || seen === device) return;
      await AsyncStorage.setItem(DEVICE_KEY, device).catch(() => {});
      if (currentLocale() === device) return;
      const { needsRestart } = await setLocale(device);
      if (needsRestart) void reloadForDirection();
    })();
  });
  return () => sub.remove();
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
