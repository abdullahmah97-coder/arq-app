// شكل حلقات الرئيسية اللي اختاره المستخدم: يتحفظ على جهازه لكل حساب (مثل ترتيب الرئيسية)
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_RING_STYLE, parseRingStyle, type RingStyle } from './ringStyleCore';

export * from './ringStyleCore';

const key = (userId: string) => `arq.ringStyle.v1:${userId}`;

export function useRingStyle(userId: string) {
  const [style, setStyle] = useState<RingStyle>(DEFAULT_RING_STYLE);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(key(userId)).then((raw) => { if (alive) setStyle(parseRingStyle(raw)); }).catch(() => {});
    return () => { alive = false; };
  }, [userId]);
  const save = useCallback((next: RingStyle) => {
    setStyle(next);
    AsyncStorage.setItem(key(userId), next).catch(() => {});
  }, [userId]);
  return { style, save };
}
