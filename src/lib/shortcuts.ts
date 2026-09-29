// ترتيب «اختصاراتي» لكل حساب على الجهاز: يتشارك بين الرئيسية وحسابي (يتحدث لما ترجع للصفحة)
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import type { Arranged } from './orderMerge';
import { mergeShortcuts, SHORTCUT_IDS, type ShortcutId } from './shortcutsCore';

export * from './shortcutsCore';

const key = (userId: string) => `arq.shortcuts.v1:${userId}`;

export function useShortcuts(userId: string) {
  const [layout, setLayout] = useState<Arranged<ShortcutId>>({ order: [...SHORTCUT_IDS], hidden: [] });
  useFocusEffect(useCallback(() => {
    let alive = true;
    AsyncStorage.getItem(key(userId)).then((raw) => { if (alive && raw) setLayout(mergeShortcuts(JSON.parse(raw))); }).catch(() => {});
    return () => { alive = false; };
  }, [userId]));
  const save = useCallback((next: Arranged<ShortcutId>) => {
    const clean = mergeShortcuts(next);
    setLayout(clean);
    AsyncStorage.setItem(key(userId), JSON.stringify(clean)).catch(() => {});
  }, [userId]);
  return { layout, save };
}
