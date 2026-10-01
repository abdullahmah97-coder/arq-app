// التفاعل بالإيموجي على المنشورات والحضور (بدل اللايك): ❤️ 💪 🔥 😂 👏 🐑
// نفس جداول اللايك القديمة (post_likes / checkin_likes) + عمود emoji، فالنسخ القديمة من التطبيق تشتغل مثل قبل.
import { isReaction, type ReactionKey, type ReactTarget } from './reactionsCore';
import { supabase } from './supabase';

export * from './reactionsCore';

// الجدول والعمود، وبطاقة الزيارة: in = «في النادي»، out = «انتهى التمرين» (كل بطاقة بتفاعلها)
const TABLE = {
  post: ['post_likes', 'post_id', null],
  checkin: ['checkin_likes', 'check_in_id', 'in'],
  checkout: ['checkin_likes', 'check_in_id', 'out'],
} as const;

/**
 * يحفظ تفاعلي: null يشيله، أول مرة يضيفه (ويوصل تنبيه لصاحبه)، وبعدها يغيّر الإيموجي بس (بدون تنبيه ثاني).
 * لو الحالة عندنا قديمة (تفاعلت من جهاز ثاني) يصلّح نفسه: تعديل ما لقى شي ← إضافة، وإضافة مكررة ← تعديل.
 */
export async function saveReaction(target: ReactTarget, me: string, prev: ReactionKey | null, next: ReactionKey | null) {
  const [table, col, phase] = TABLE[target.type];
  const mine: Record<string, string> = phase ? { [col]: target.id, user_id: me, phase } : { [col]: target.id, user_id: me };
  const update = () => supabase.from(table).update({ emoji: next }).match(mine).select('user_id');
  const insert = () => supabase.from(table).insert({ ...mine, emoji: next });
  if (!next) return supabase.from(table).delete().match(mine);
  if (prev) {
    const up = await update();
    if (up.error || up.data?.length) return up;
    return insert();
  }
  const ins = await insert();
  if (ins.error?.code === '23505') return update();
  return ins;
}

export interface ReactionRow { user_id: string; username: string; full_name: string | null; avatar_url: string | null; is_coach: boolean; emoji: ReactionKey; at: string }

/** «مين تفاعل»: كلهم (الأحدث أول) */
export async function loadReactions(target: ReactTarget): Promise<ReactionRow[]> {
  const { data, error } = await supabase.rpc('reactions_of', { p_type: target.type, p_id: target.id });
  if (error) throw error;
  return ((data ?? []) as ReactionRow[]).filter((r) => isReaction(r.emoji));
}
