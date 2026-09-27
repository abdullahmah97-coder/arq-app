// مدرب ARQ: يسأل الذكاء الاصطناعي (Edge Function "coach")، ولو ما توفر يرد المدرب المحلي
import { EXERCISES, exerciseEquipment, exerciseMuscles } from '../../three/catalog';
import { supabase } from '../supabase';
import { localCoach } from './local';
import type { CoachContext, CoachMessage, CoachReply } from './types';

export * from './types';
export { starterChips } from './local';

/** مكتبة التمارين كنص مختصر يُرسل للنموذج (المعرف | الاسم | العضلات | الأدوات) */
const LIBRARY = EXERCISES.map((e) => `${e.id} | ${e.name.en} | ${exerciseMuscles(e).primary.join(',')} | ${exerciseEquipment(e)}`).join('\n');

export async function askCoach(history: CoachMessage[], ctx: CoachContext): Promise<CoachReply> {
  const last = history[history.length - 1];
  try {
    const { data, error } = await supabase.functions.invoke('coach', {
      body: {
        messages: history.slice(-12).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.role === 'user' ? m.text : (m.reply?.text ?? m.text) })),
        context: ctx,
        library: LIBRARY,
      },
    });
    if (error || !data?.reply?.text) throw error ?? new Error('no_reply');
    return data.reply as CoachReply;
  } catch {
    // بدون إنترنت أو قبل إعداد مفتاح الذكاء الاصطناعي: المدرب المحلي
    return localCoach(last.text, ctx);
  }
}
