// التنبيهات التحفيزية: نصوص يكتبها المالك (رجال / نساء / الجميع) والخادم يرسلها في أوقاتها
import { supabase } from './supabase';

export type NudgeCategory = 'gym' | 'friend' | 'streak' | 'workout' | 'meal';
export type NudgeGender = 'male' | 'female' | 'all';
export type NudgeLocale = 'ar' | 'en';

export interface NudgeTemplate {
  id: string;
  category: NudgeCategory;
  gender: NudgeGender;
  friend_gender: NudgeGender;
  locale: NudgeLocale;
  title: string;
  body: string;
  active: boolean;
  updated_at: string;
}

export const NUDGE_CATEGORIES: NudgeCategory[] = ['gym', 'friend', 'streak', 'workout', 'meal'];

/** المتغيرات المتاحة لكل نوع (نفس اللي يعبّيها الخادم) */
export const NUDGE_VARS: Record<NudgeCategory, string[]> = {
  gym: ['{name}', '{gym}'],
  friend: ['{name}', '{friend}', '{gym}'],
  streak: ['{name}', '{streak}', '{gym}'],
  workout: ['{name}', '{workout}'],
  meal: ['{name}'],
};

/** قيم تجريبية للمعاينة */
export function sampleVars(t: Pick<NudgeTemplate, 'gender' | 'friend_gender' | 'locale'>): Record<string, string> {
  if (t.locale === 'en') return { name: 'Abdullah', friend: 'Faisal', gym: 'Fitness Time', streak: '5', workout: 'Chest & triceps' };
  const female = t.gender === 'female';
  const friendFemale = t.friend_gender === 'female' || (t.friend_gender === 'all' && female);
  return { name: female ? 'نورة' : 'عبدالله', friend: friendFemale ? 'ريم' : 'فيصل', gym: 'وقت اللياقة', streak: '5', workout: 'صدر وتراي' };
}

/** نفس تعبئة الخادم (_nudge_fill) */
export function fillNudge(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(name|friend|gym|streak|workout)\}/g, (_, k: string) => vars[k] ?? '');
}

export async function loadNudges(): Promise<NudgeTemplate[]> {
  const { data, error } = await supabase.from('nudge_templates')
    .select('id, category, gender, friend_gender, locale, title, body, active, updated_at')
    .order('category').order('gender').order('created_at');
  if (error) throw error;
  return (data ?? []) as NudgeTemplate[];
}

export type NudgeDraft = Omit<NudgeTemplate, 'id' | 'updated_at'> & { id?: string };

export async function saveNudge(d: NudgeDraft): Promise<void> {
  const row = {
    category: d.category, gender: d.gender, locale: d.locale, active: d.active,
    friend_gender: d.category === 'friend' ? d.friend_gender : 'all',
    title: d.title.trim(), body: d.body.trim(),
  };
  const q = d.id ? supabase.from('nudge_templates').update(row).eq('id', d.id) : supabase.from('nudge_templates').insert(row);
  const { error } = await q;
  if (error) throw error;
}

export async function setNudgeActive(id: string, active: boolean) {
  const { error } = await supabase.from('nudge_templates').update({ active }).eq('id', id);
  if (error) throw error;
}

export async function deleteNudge(id: string) {
  const { error } = await supabase.from('nudge_templates').delete().eq('id', id);
  if (error) throw error;
}

export async function sendTestNudge(id: string) {
  const { error } = await supabase.rpc('send_test_nudge', { p_template: id });
  if (error) throw error;
}

export async function nudgeStats(): Promise<Record<string, { today: number; week: number }>> {
  const { data } = await supabase.rpc('nudge_stats', { p_days: 7 });
  const out: Record<string, { today: number; week: number }> = {};
  for (const r of (data ?? []) as { category: string; today: number; last_days: number }[]) {
    out[r.category] = { today: Number(r.today), week: Number(r.last_days) };
  }
  return out;
}
