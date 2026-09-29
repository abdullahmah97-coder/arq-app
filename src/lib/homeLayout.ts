// ترتيب أقسام الرئيسية: المستخدم يرتّبها ويخفي اللي ما يبيه (بالضغط المطول)، ويتحفظ على جهازه لكل حساب
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { DEFAULT_LAYOUT, mergeLayout, type HomeLayout } from './homeSections';

export * from './homeSections';

const key = (userId: string) => `arq.homeLayout.v1:${userId}`;

export function useHomeLayout(userId: string) {
  const [layout, setLayout] = useState<HomeLayout>(DEFAULT_LAYOUT);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(key(userId))
      .then((raw) => { if (alive && raw) setLayout(mergeLayout(JSON.parse(raw))); })
      .catch(() => {})
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [userId]);
  const save = useCallback((next: HomeLayout) => {
    const clean = mergeLayout(next);
    setLayout(clean);
    AsyncStorage.setItem(key(userId), JSON.stringify(clean)).catch(() => {});
  }, [userId]);
  return { layout, save, ready };
}

/** الضغط المطول على أي بطاقة في الرئيسية يفتح الترتيب. خارج الرئيسية القيمة فاضية فما يتغير شي */
export const HomeLongPress = createContext<(() => void) | undefined>(undefined);
export const useHomeLongPress = () => useContext(HomeLongPress);
export const LONG_PRESS_MS = 450;
