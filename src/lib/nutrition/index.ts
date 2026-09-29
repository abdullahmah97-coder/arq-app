// سجل الأكل: إضافة وحذف وقراءة اليوم، مع قاعدة الأطعمة
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Alert, Platform } from 'react-native';
import { isoDate } from '../dates';
import i18n from '../i18n';
import { supabase } from '../supabase';
import { alertTexts, calorieGoal, caloriesLeftAlert, DEFAULT_KCAL_ALERT, KCAL_ALERT_MAX, KCAL_ALERT_MIN, parseAlertConfig, type CalorieAlertConfig } from './calorieAlert';
import type { Food } from './foods';
import { scaleFood, totals, type Macros, type MealSlot } from './math';

export * from './calorieAlert';
export * from './foods';
export * from './math';
export * from './photo';

export interface FoodEntry extends Macros {
  id: string;
  eaten_on: string;
  slot: MealSlot;
  name: string;
  food_id: string | null;
  servings: number;
  source: 'db' | 'custom' | 'plan' | 'barcode' | 'photo' | 'store';
  created_at: string;
}

const toEntry = (r: any): FoodEntry => ({
  ...r, servings: Number(r.servings), kcal: Number(r.kcal),
  protein_g: Number(r.protein_g), carbs_g: Number(r.carbs_g), fat_g: Number(r.fat_g),
});

export async function loadFoodDay(userId: string, day = new Date()): Promise<FoodEntry[]> {
  const { data, error } = await supabase.from('food_logs').select('*')
    .eq('user_id', userId).eq('eaten_on', isoDate(day)).order('created_at');
  if (error) throw error;
  return (data ?? []).map(toEntry);
}

export async function logFood(userId: string, e: {
  slot: MealSlot; name: string; food_id?: string | null; servings?: number; source?: FoodEntry['source'];
} & Macros, day = new Date()): Promise<void> {
  const { error } = await supabase.from('food_logs').insert({
    user_id: userId, eaten_on: isoDate(day), slot: e.slot, name: e.name.slice(0, 80), food_id: e.food_id ?? null,
    servings: e.servings ?? 1, kcal: Math.round(e.kcal), protein_g: e.protein_g, carbs_g: e.carbs_g, fat_g: e.fat_g,
    source: e.source ?? 'db',
  });
  if (error) throw error;
  void afterFoodLogged(userId, day);
}

/** تسجيل عدة أصناف دفعة وحدة (مثل أصناف صورة الوجبة) */
export async function logFoods(userId: string, items: ({ slot: MealSlot; name: string; source: FoodEntry['source'] } & Macros)[], day = new Date()): Promise<void> {
  if (!items.length) return;
  const { error } = await supabase.from('food_logs').insert(items.map((e) => ({
    user_id: userId, eaten_on: isoDate(day), slot: e.slot, name: e.name.slice(0, 80), food_id: null, servings: 1,
    kcal: Math.round(e.kcal), protein_g: e.protein_g, carbs_g: e.carbs_g, fat_g: e.fat_g, source: e.source,
  })));
  if (error) throw error;
  void afterFoodLogged(userId, day);
}

export function logFromDb(userId: string, f: Food, servings: number, slot: MealSlot, name: string) {
  return logFood(userId, { slot, name, food_id: f.id, servings, source: 'db', ...scaleFood(f, servings) });
}

export async function deleteFood(id: string): Promise<void> {
  const { error } = await supabase.from('food_logs').delete().eq('id', id);
  if (error) throw error;
}

/** آخر الأطعمة المسجّلة (بدون تكرار) — للإضافة السريعة */
export async function recentFoodIds(userId: string, limit = 12): Promise<string[]> {
  const { data } = await supabase.from('food_logs').select('food_id').eq('user_id', userId)
    .not('food_id', 'is', null).order('created_at', { ascending: false }).limit(60);
  return [...new Set((data ?? []).map((r: any) => r.food_id as string))].slice(0, limit);
}

// ---------- «باقي لك ٢٠٠ سعرة»: بعد كل تسجيل، مرة وحدة باليوم ----------
const ALERT_KEY = 'arq.kcalLeftAlert';
const ALERT_ON_KEY = 'arq.kcalAlertOn.v1';

/** زر التنبيه في مربع السعرات (شغّال افتراضياً) */
export async function kcalAlertOn(): Promise<boolean> {
  return (await AsyncStorage.getItem(ALERT_ON_KEY).catch(() => null)) !== '0';
}
export async function setKcalAlertOn(on: boolean): Promise<void> {
  await AsyncStorage.setItem(ALERT_ON_KEY, on ? '1' : '0').catch(() => {});
  // لما يشغّله نطلب إذن الإشعارات (وإذا رفض يطلع التنبيه داخل التطبيق)
  if (on && Platform.OS !== 'web') {
    const p = await Notifications.getPermissionsAsync().catch(() => null);
    if (p && !p.granted && p.canAskAgain) await Notifications.requestPermissionsAsync().catch(() => {});
  }
}

// المستخدم يختار متى ينبّهه (كم سعرة باقية). بدون اختيار = رقم لوحة الإدارة
const ALERT_AT_KEY = 'arq.kcalAlertAt.v1';
export async function kcalAlertAt(): Promise<number | null> {
  const v = Number(await AsyncStorage.getItem(ALERT_AT_KEY).catch(() => null));
  return Number.isFinite(v) && v >= KCAL_ALERT_MIN && v <= KCAL_ALERT_MAX ? Math.round(v) : null;
}
export async function setKcalAlertAt(n: number): Promise<void> {
  await AsyncStorage.setItem(ALERT_AT_KEY, String(Math.round(n))).catch(() => {});
}

// نص التنبيه والرقم من لوحة إدارة التطبيق (نحتفظ فيها ١٠ دقايق)
let cfgCache: { at: number; cfg: CalorieAlertConfig } | null = null;
export async function loadCalorieAlertConfig(fresh = false): Promise<CalorieAlertConfig> {
  if (!fresh && cfgCache && Date.now() - cfgCache.at < 10 * 60_000) return cfgCache.cfg;
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'calorie_alert').maybeSingle();
  const cfg = error ? (cfgCache?.cfg ?? DEFAULT_KCAL_ALERT) : parseAlertConfig((data as { value?: unknown } | null)?.value);
  if (!error) cfgCache = { at: Date.now(), cfg };
  return cfg;
}
export async function saveCalorieAlertConfig(c: CalorieAlertConfig): Promise<void> {
  const { error } = await supabase.from('app_settings').upsert({ key: 'calorie_alert', value: c });
  if (error) throw error;
  cfgCache = { at: Date.now(), cfg: c };
}

async function afterFoodLogged(userId: string, day: Date) {
  try {
    const today = isoDate(new Date());
    const goal = calorieGoal();
    if (!goal || isoDate(day) !== today || !(await kcalAlertOn())) return;
    const cfg = await loadCalorieAlertConfig();
    if (!cfg.enabled) return;
    const saved = JSON.parse((await AsyncStorage.getItem(ALERT_KEY)) ?? 'null') as { u: string; d: string } | null;
    const eaten = totals(await loadFoodDay(userId, day)).kcal;
    const left = caloriesLeftAlert(eaten, goal, saved?.u === userId ? saved.d : null, today, (await kcalAlertAt()) ?? cfg.threshold);
    if (left == null) return;
    await AsyncStorage.setItem(ALERT_KEY, JSON.stringify({ u: userId, d: today }));
    const { title, body } = alertTexts(cfg, i18n.language, { n: left, eaten, goal });
    if (Platform.OS !== 'web') {
      const p = await Notifications.getPermissionsAsync();
      if (p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
        await Notifications.scheduleNotificationAsync({ content: { title, body, sound: 'default', interruptionLevel: 'active', data: { kind: 'kcal', url: '/(tabs)/plan' } }, trigger: null });
        return;
      }
    }
    // بدون إذن الإشعارات: نفس التنبيه داخل التطبيق
    Alert.alert(title, body);
  } catch { /* التنبيه إضافة: ما يوقف تسجيل الأكل */ }
}
