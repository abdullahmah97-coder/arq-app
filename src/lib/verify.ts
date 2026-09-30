// لوحة إدارة التطبيق ← التوثيق: الحساب الموثّق تطلع على ملفه علامة «مدرب موثّق من ARQ ✓»
// وينشر برامج ونصائح في المجتمع بدون شرط الرتبة. التوثيق نفسه بـ set_coach (للإدارة بس، مفروض في القاعدة).
import { adminUserList, type AdminUser } from './adminUsers';
import { setCoach } from './owner';
import { supabase } from './supabase';

export interface VerifiedUser { id: string; username: string; full_name: string | null; avatar_url: string | null }
export type VerifyCandidate = AdminUser & { verified: boolean };

/** الحسابات الموثّقة الحين */
export async function loadVerified(): Promise<VerifiedUser[]> {
  const { data, error } = await supabase.from('profiles').select('id, username, full_name, avatar_url')
    .eq('is_coach', true).order('username').limit(500);
  if (error) throw error;
  return (data ?? []) as VerifiedUser[];
}

export async function verifiedCount(): Promise<number> {
  const { count, error } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_coach', true);
  if (error) throw error;
  return count ?? 0;
}

/** بحث بالاسم أو اسم المستخدم أو الإيميل (كل الحسابات) مع حالة التوثيق */
export async function searchForVerify(q: string): Promise<VerifyCandidate[]> {
  const { rows } = await adminUserList({ kind: 'all', search: q, limit: 30 });
  if (!rows.length) return [];
  const { data, error } = await supabase.from('profiles').select('id, is_coach').in('id', rows.map((r) => r.id));
  if (error) throw error;
  const verified = new Set(((data ?? []) as { id: string; is_coach: boolean }[]).filter((r) => r.is_coach).map((r) => r.id));
  return rows.map((r) => ({ ...r, verified: verified.has(r.id) }));
}

export const setVerified = (userId: string, value: boolean) => setCoach(userId, value);
