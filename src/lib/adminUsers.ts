// لوحة إدارة التطبيق ← المتدربين: الأرقام، القائمة بالإيميل، التعديل، والحذف (مفروضة في القاعدة بـ is_admin)
import { removeFolder } from './account';
import { supabase } from './supabase';

export type UserKind = 'trainee' | 'partner' | 'all';

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  account_type: string;
  gender: 'male' | 'female' | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  points: number;
  gym_name: string | null;
  gym_name_en: string | null;
  is_admin: boolean;
}

export interface AdminUserStats { total: number; trainees: number; partners: number; new7d: number; active7d: number; unconfirmed: number }

export const PAGE_SIZE = 50;

/** ملفات الحساب اللي تنحذف معه (نفس مجلدات حذف الحساب من التطبيق + لقطات الملاحظات) */
const USER_BUCKETS = ['avatars', 'posts', 'body', 'inbody', 'feedback'] as const;

export async function adminUserStats(): Promise<AdminUserStats> {
  const { data, error } = await supabase.rpc('admin_user_stats');
  if (error) throw error;
  const r = (data as any[] | null)?.[0] ?? {};
  return {
    total: Number(r.total ?? 0), trainees: Number(r.trainees ?? 0), partners: Number(r.partners ?? 0),
    new7d: Number(r.new_7d ?? 0), active7d: Number(r.active_7d ?? 0), unconfirmed: Number(r.unconfirmed ?? 0),
  };
}

export async function adminUserList(opts: { search?: string; kind?: UserKind; offset?: number; limit?: number } = {}): Promise<{ rows: AdminUser[]; total: number }> {
  const { data, error } = await supabase.rpc('admin_user_list', {
    p_search: opts.search?.trim() || null, p_kind: opts.kind ?? 'trainee', p_limit: opts.limit ?? PAGE_SIZE, p_offset: opts.offset ?? 0,
  });
  if (error) throw error;
  const rows = (data ?? []) as any[];
  return {
    rows: rows.map((r) => ({ ...r, points: Number(r.points ?? 0) }) as AdminUser),
    total: rows.length ? Number(rows[0].total) : 0,
  };
}

export async function adminUpdateUser(id: string, fullName: string, username: string) {
  const { error } = await supabase.rpc('admin_update_user', { p_user: id, p_full_name: fullName, p_username: username });
  if (error) throw error;
}

/** حذف نهائي: نفتح نافذة الحذف، نحذف ملفاته من التخزين، ثم الحساب وكل بياناته */
export async function adminDeleteUser(id: string) {
  const prep = await supabase.rpc('admin_prepare_user_delete', { p_user: id });
  if (prep.error) throw prep.error;
  for (const b of USER_BUCKETS) {
    try { await removeFolder(b, id); } catch { /* نكمل حتى لو فشل حذف ملف */ }
  }
  const { error } = await supabase.rpc('admin_delete_user', { p_user: id });
  if (error) throw error;
}

/** اسم الحساب للعرض */
export const displayName = (u: Pick<AdminUser, 'full_name' | 'username'>) => u.full_name?.trim() || u.username;
