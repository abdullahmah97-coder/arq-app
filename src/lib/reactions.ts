// التفاعل بالإيموجي على المنشورات والحضور (بدل اللايك): ❤️ 💪 🔥 😂 👏 🐑
// نفس جداول اللايك القديمة (post_likes / checkin_likes) + عمود emoji، فالنسخ القديمة من التطبيق تشتغل مثل قبل.
import { isReaction, type ReactionKey, type ReactTarget } from './reactionsCore';
import { supabase } from './supabase';

export * from './reactionsCore';

const TABLE = { post: ['post_likes', 'post_id'], checkin: ['checkin_likes', 'check_in_id'] } as const;

/**
 * يحفظ تفاعلي: null يشيله، أول مرة يضيفه (ويوصل تنبيه لصاحبه)، وبعدها يغيّر الإيموجي بس (بدون تنبيه ثاني).
 * لو الحالة عندنا قديمة (تفاعلت من جهاز ثاني) يصلّح نفسه: تعديل ما لقى شي ← إضافة، وإضافة مكررة ← تعديل.
 */
export async function saveReaction(target: ReactTarget, me: string, prev: ReactionKey | null, next: ReactionKey | null) {
  const [table, col] = TABLE[target.type];
  const update = () => supabase.from(table).update({ emoji: next }).eq(col, target.id).eq('user_id', me).select('user_id');
  const insert = () => supabase.from(table).insert({ [col]: target.id, user_id: me, emoji: next });
  if (!next) return supabase.from(table).delete().eq(col, target.id).eq('user_id', me);
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
