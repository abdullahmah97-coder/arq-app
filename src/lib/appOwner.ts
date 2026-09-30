// مالك التطبيق: نعرف مين هو (لشارة «المالك» بدل الرتبة)، وأجزاء التطبيق اللي أخفاها عن الكل بالضغط المطوّل.
// الاثنين محفوظين في الجهاز عشان يطلعون على طول من أول فتح، ويتحدّثون من القاعدة (وكل ما يرجع التطبيق للواجهة).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { supabase } from './supabase';

interface Store { value: ReadonlySet<string>; subs: Set<() => void>; started: boolean }
const emit = (s: Store) => s.subs.forEach((f) => { try { f(); } catch { /* مستمع واحد ما يوقف الباقي */ } });
const setValue = (s: Store, next: Iterable<string>, cacheKey: string) => {
  s.value = new Set(next);
  emit(s);
  AsyncStorage.setItem(cacheKey, JSON.stringify([...s.value])).catch(() => {});
};
async function readCache(s: Store, cacheKey: string) {
  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (raw && !s.value.size) { s.value = new Set(JSON.parse(raw) as string[]); emit(s); }
  } catch { /* بدون كاش */ }
}

// ---------- مين المالك ----------
const OWNERS_KEY = 'arq.owners.v1';
const owners: Store = { value: new Set(), subs: new Set(), started: false };
async function loadOwners() {
  await readCache(owners, OWNERS_KEY);
  // قبل تحديث القاعدة ما فيه is_owner: نتركها فاضية بصمت
  const { data, error } = await supabase.from('profiles').select('id').eq('is_owner', true).limit(5);
  if (!error) setValue(owners, ((data ?? []) as { id: string }[]).map((r) => r.id), OWNERS_KEY);
}
const subscribeOwners = (f: () => void) => {
  owners.subs.add(f);
  if (!owners.started) { owners.started = true; void loadOwners(); }
  return () => { owners.subs.delete(f); };
};
/** هل هالحساب مالك التطبيق؟ (لشارة «المالك») */
export function useIsOwnerId(id?: string | null): boolean {
  const set = useSyncExternalStore(subscribeOwners, () => owners.value, () => owners.value);
  return !!id && set.has(id);
}

// ---------- الأجزاء المخفية عن الكل ----------
const HIDDEN_KEY = 'arq.hiddenParts.v1';
const hidden: Store = { value: new Set(), subs: new Set(), started: false };
let lastFetch = 0;
export async function refreshHiddenParts(force = false) {
  if (!force && Date.now() - lastFetch < 60_000) return;
  lastFetch = Date.now();
  const { data, error } = await supabase.from('app_hidden').select('key');
  if (!error) setValue(hidden, ((data ?? []) as { key: string }[]).map((r) => r.key), HIDDEN_KEY);
}
const subscribeHidden = (f: () => void) => {
  hidden.subs.add(f);
  if (!hidden.started) {
    hidden.started = true;
    void readCache(hidden, HIDDEN_KEY).then(() => refreshHiddenParts(true));
    // لما يرجع التطبيق للواجهة نشيك (مرة بالدقيقة بالكثير)
    AppState.addEventListener('change', (st) => { if (st === 'active') void refreshHiddenParts(); });
  }
  return () => { hidden.subs.delete(f); };
};
/** كل الأجزاء المخفية (مفاتيح مثل home.sleep و tab.compete) */
export const useHiddenParts = () => useSyncExternalStore(subscribeHidden, () => hidden.value, () => hidden.value);

/** المالك: يخفي جزء عن الكل أو يرجّعه (يبان على طول، ولو فشل يرجع زي ما كان) */
export async function setPartHidden(key: string, label: string, hide: boolean) {
  const prev = hidden.value;
  const next = new Set(prev);
  if (hide) next.add(key); else next.delete(key);
  setValue(hidden, next, HIDDEN_KEY);
  const { error } = hide
    ? await supabase.from('app_hidden').upsert({ key, label: label.slice(0, 120) })
    : await supabase.from('app_hidden').delete().eq('key', key);
  if (error) { setValue(hidden, prev, HIDDEN_KEY); throw error; }
}

/** قائمة المخفي كاملة (للوحة المالك) */
export async function listHiddenParts(): Promise<{ key: string; label: string | null; hidden_at: string }[]> {
  const { data, error } = await supabase.from('app_hidden').select('key, label, hidden_at').order('hidden_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
