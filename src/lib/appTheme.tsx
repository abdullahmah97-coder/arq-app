// ثيم لون التطبيق: يُحفظ على الجهاز ويُطبَّق قبل رسم الواجهة
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext } from 'react';
import { applyTheme, THEMES, type ThemeId } from '../theme';

const KEY = 'arq.theme';

export async function restoreTheme(): Promise<ThemeId> {
  let id: ThemeId = 'palm';
  try {
    const v = (await AsyncStorage.getItem(KEY)) as ThemeId | null;
    if (v && v in THEMES) id = v;
  } catch {}
  applyTheme(id);
  return id;
}

export async function saveTheme(id: ThemeId) {
  applyTheme(id);
  try { await AsyncStorage.setItem(KEY, id); } catch {}
}

export const ThemeCtx = createContext<{ theme: ThemeId; setTheme: (id: ThemeId) => void }>({ theme: 'palm', setTheme: () => {} });
export const useAppTheme = () => useContext(ThemeCtx);
