// جسر بين التطبيق والمولدين: يحاول الذكاء الاصطناعي أولاً ثم يرجع للقواعد
import { supabase } from '../supabase';
import { calcTargets, generateRulesPlan } from './rules';
import type { PlanInput, WeeklyPlan } from './types';
import { isWeeklyPlan } from './validate';

export interface GeneratedPlan {
  plan: WeeklyPlan;
  source: 'ai' | 'rules';
  aiError?: string;
}

export async function generatePlan(input: PlanInput, photoPath?: string | null): Promise<GeneratedPlan> {
  const targets = calcTargets(input);
  try {
    const { data, error } = await supabase.functions.invoke('generate-plan', {
      body: { input, targets, photo_path: photoPath ?? undefined },
    });
    if (error) throw error;
    if (data?.plan && isWeeklyPlan(data.plan)) return { plan: data.plan, source: 'ai' };
    throw new Error(data?.error ?? 'invalid_plan');
  } catch (e: any) {
    return { plan: generateRulesPlan(input), source: 'rules', aiError: String(e?.message ?? e) };
  }
}

/** يحفظ الخطة كخطة فعّالة ويُلغي تفعيل السابقة */
export async function savePlan(userId: string, g: GeneratedPlan, inbodyReportId?: string | null) {
  await supabase.from('plans').update({ active: false }).eq('user_id', userId).eq('active', true);
  const { data, error } = await supabase
    .from('plans')
    .insert({ user_id: userId, source: g.source, data: g.plan, active: true, inbody_report_id: inbodyReportId ?? null })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}
