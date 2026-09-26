// إعداد التطبيق الديناميكي: نسخ منفصلة للتطوير والتجربة والإطلاق
//   APP_VARIANT=development → "ARQ Dev"      (sa.arq.app.dev)     — بناء تطوير
//   APP_VARIANT=preview     → "ARQ Preview"  (sa.arq.app.preview) — تثبيت مباشر برابط (بدون متجر)
//   APP_VARIANT=beta        → "ARQ أرك"      (sa.arq.app)         — TestFlight / Google Play اختبار داخلي
//   (بدون متغير)            → الإطلاق الفعلي (sa.arq.app)
// app.json يبقى المصدر الأساسي (وأدوات EAS تكتب فيه projectId)، وهذا الملف يطبّق الفروقات فقط.
import type { ConfigContext, ExpoConfig } from 'expo/config';

type Variant = 'development' | 'preview' | 'beta' | 'production';
const VARIANT = (process.env.APP_VARIANT as Variant) || 'production';

const SUFFIX: Record<Variant, { name: string; id: string }> = {
  development: { name: ' Dev', id: '.dev' },
  preview: { name: ' Preview', id: '.preview' },
  beta: { name: '', id: '' },
  production: { name: '', id: '' },
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const s = SUFFIX[VARIANT] ?? SUFFIX.production;
  const projectId: string | undefined = (config.extra as any)?.eas?.projectId;
  return {
    ...(config as ExpoConfig),
    name: `${config.name}${s.name}`,
    ios: { ...config.ios, bundleIdentifier: `${config.ios?.bundleIdentifier}${s.id}` },
    android: { ...config.android, package: `${config.android?.package}${s.id}` },
    // تحديثات فورية (OTA): تصلح وتطوّر وتوصل للمختبرين بدون بناء جديد
    runtimeVersion: { policy: 'fingerprint' },
    updates: {
      ...(config.updates ?? {}),
      ...(projectId ? { url: `https://u.expo.dev/${projectId}` } : {}),
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
    },
    extra: { ...(config.extra ?? {}), variant: VARIANT },
  };
};
