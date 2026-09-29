// أيقونة التطبيق على الشاشة الرئيسية تمشي مع لون التطبيق (آيفون):
// النخيل = الأيقونة الأصلية، والباقي أيقونات بديلة مضمّنة في التطبيق (app.json ← expo-alternate-app-icons).
// iOS يطلع رسالة «غيّرت أيقونة أرك» كل مرة تتغيّر: هذا من النظام وما ينشال.
import * as AltIcons from 'expo-alternate-app-icons';
import { AppState, Platform } from 'react-native';
import type { ThemeId } from '../theme';

const ICON: Record<ThemeId, string | null> = { palm: null, oasis: 'Oasis', dune: 'Dune', sand: 'Sand', lavender: 'Lavender' };

export const appIconFor = (theme: ThemeId) => ICON[theme] ?? null;

/** يغيّر الأيقونة لو تختلف عن لون التطبيق (آيفون بس، والتطبيق لازم يكون قدامك وإلا iOS يرفض) */
export async function syncAppIcon(theme: ThemeId): Promise<void> {
  if (Platform.OS !== 'ios' || AppState.currentState !== 'active') return;
  try {
    if (!AltIcons.supportsAlternateIcons) return;
    const want = appIconFor(theme);
    if ((AltIcons.getAppIconName() ?? null) === want) return;
    await AltIcons.setAlternateAppIcon(want);
  } catch { /* النسخ القديمة أو رفض النظام: تبقى الأيقونة الحالية */ }
}
