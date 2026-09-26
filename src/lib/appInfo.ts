// معلومات النسخة: نوع البناء (تجريبي/إطلاق)، رقم الإصدار، ومعرّف التحديث الفوري
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

export type Variant = 'development' | 'preview' | 'beta' | 'production';

export const variant: Variant = ((Constants.expoConfig?.extra as any)?.variant as Variant) ?? 'production';
/** كل ما قبل الإطلاق الفعلي يُعامل كنسخة تجريبية (شارة BETA + زر الملاحظات) */
export const isBeta = variant !== 'production';

export function versionLabel(): string {
  const v = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '1.0.0';
  const b = Application.nativeBuildVersion;
  const u = Updates.updateId ? Updates.updateId.slice(0, 8) : null;
  return [`v${v}${b ? ` (${b})` : ''}`, variant !== 'production' ? variant : null, u ? `OTA ${u}` : null].filter(Boolean).join(' · ');
}

export function appMeta() {
  return {
    app_version: `${Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '?'}+${Application.nativeBuildVersion ?? '0'}`,
    variant,
    platform: Platform.OS,
    update_id: Updates.updateId ?? null,
  };
}

/** يبحث عن تحديث فوري وينزّله ويعيد تشغيل التطبيق. يرجع 'none' | 'updated' | 'unavailable' */
export async function checkForAppUpdate(): Promise<'none' | 'updated' | 'unavailable'> {
  if (!Updates.isEnabled || __DEV__) return 'unavailable';
  try {
    const r = await Updates.checkForUpdateAsync();
    if (!r.isAvailable) return 'none';
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
    return 'updated';
  } catch {
    return 'unavailable';
  }
}
