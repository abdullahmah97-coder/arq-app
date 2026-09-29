// اشتراك الوجبات مع المطاعم الصحية: الطلب بموافقة صريحة، رد المطعم، جدولة الوجبات، وإنهاء المشاركة
import { isoDate } from './dates';
import type { MealSlot } from './nutrition';
import { supabase } from './supabase';

export type SubStatus = 'requested' | 'active' | 'declined' | 'ended';
export interface MealSub {
  id: string; user_id: string; brand_id: string; status: SubStatus; slots: MealSlot[]; notes: string | null;
  starts_on: string; created_at: string; brands?: { name: string; logo_path: string | null } | null;
}
export interface Subscriber {
  id: string; status: SubStatus; slots: MealSlot[]; notes: string | null; starts_on: string; created_at: string;
  name: string; avatar_url: string | null; calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null;
}
export interface SubMeal {
  id: string; subscription_id: string; day: string; slot: MealSlot; product_id: string | null; name: string;
  kcal: number; protein_g: number; carbs_g: number; fat_g: number;
}
export const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];
/** نصيب كل وجبة من سعرات اليوم (نفس توزيع الخطة) */
export const SLOT_SHARE: Record<MealSlot, number> = { breakfast: 0.25, lunch: 0.35, snack: 0.15, dinner: 0.25 };

const num = (r: SubMeal): SubMeal => ({ ...r, kcal: Number(r.kcal), protein_g: Number(r.protein_g), carbs_g: Number(r.carbs_g), fat_g: Number(r.fat_g) });

export async function mySubscriptions(): Promise<MealSub[]> {
  const { data } = await supabase.from('meal_subscriptions').select('*, brands(name, logo_path)')
    .in('status', ['requested', 'active']).order('created_at', { ascending: false });
  return (data ?? []) as MealSub[];
}

export async function mySubscriptionWith(brandId: string, me: string): Promise<MealSub | null> {
  const { data } = await supabase.from('meal_subscriptions').select('*').eq('brand_id', brandId).eq('user_id', me)
    .in('status', ['requested', 'active']).maybeSingle();
  return (data as MealSub) ?? null;
}

export async function requestSubscription(brandId: string, slots: MealSlot[], notes: string, consent: boolean) {
  const { data, error } = await supabase.rpc('request_meal_subscription', { p_brand: brandId, p_slots: slots, p_notes: notes, p_consent: consent });
  if (error) throw error;
  return data as string;
}
export async function respondSubscription(id: string, accept: boolean) {
  const { error } = await supabase.rpc('respond_meal_subscription', { p_id: id, p_accept: accept });
  if (error) throw error;
}
export async function endSubscription(id: string) {
  const { error } = await supabase.rpc('end_meal_subscription', { p_id: id });
  if (error) throw error;
}

export async function loadSubscribers(brandId: string): Promise<Subscriber[]> {
  const { data, error } = await supabase.rpc('restaurant_subscribers', { p_brand: brandId });
  if (error) throw error;
  return (data ?? []) as Subscriber[];
}

/** وجبات الاشتراكات لتاريخ معيّن (للمشترك: كل اشتراكاته، وللمطعم: اشتراك واحد) */
export async function mealsOn(day: Date, subscriptionId?: string): Promise<(SubMeal & { brand?: string })[]> {
  let q = supabase.from('subscription_meals').select('*, meal_subscriptions(brands(name))').eq('day', isoDate(day)).order('created_at');
  if (subscriptionId) q = q.eq('subscription_id', subscriptionId);
  const { data } = await q;
  return (data ?? []).map((r: SubMeal & { meal_subscriptions?: { brands?: { name: string } | null } | null }) =>
    ({ ...num(r), brand: r.meal_subscriptions?.brands?.name }));
}

export async function addSubMeal(m: Omit<SubMeal, 'id'>) {
  const { error } = await supabase.from('subscription_meals').insert({ ...m, name: m.name.trim().slice(0, 80) });
  if (error) throw error;
}
export async function deleteSubMeal(id: string) {
  const { error } = await supabase.from('subscription_meals').delete().eq('id', id);
  if (error) throw error;
}
