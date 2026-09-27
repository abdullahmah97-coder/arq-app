// سجل الأكل: إضافة وحذف وقراءة اليوم، مع قاعدة الأطعمة
import { isoDate } from '../dates';
import { supabase } from '../supabase';
import type { Food } from './foods';
import { scaleFood, type Macros, type MealSlot } from './math';

export * from './foods';
export * from './math';

export interface FoodEntry extends Macros {
  id: string;
  eaten_on: string;
  slot: MealSlot;
  name: string;
  food_id: string | null;
  servings: number;
  source: 'db' | 'custom' | 'plan' | 'barcode' | 'photo';
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
