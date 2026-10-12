// موافقة الإدارة على الحسابات الجديدة: الحساب الجديد «بانتظار الموافقة» لين يقبله المشرف من لوحة إدارة التطبيق
import { supabase } from './supabase';
import type { Profile } from './types';

export type Approval = 'pending' | 'approved' | 'rejected';

/** الحساب مقبول؟ (قبل ترحيل قاعدة البيانات ما فيه العمود: نعتبره مقبول) */
export const isApproved = (p: Pick<Profile, 'approval'> | null | undefined) => !p || !p.approval || p.approval === 'approved';

export interface SignupRow {
  id: string; username: string; full_name: string | null; avatar_url: string | null; email: string | null; gender: 'male' | 'female' | null;
  account_type: string | null; created_at: string; approval: Approval; approval_at: string | null; last_sign_in_at: string | null;
}

export async function listSignups(status: Approval = 'pending'): Promise<SignupRow[]> {
  const { data, error } = await supabase.rpc('admin_signups', { p_status: status, p_limit: 200 });
  if (error) throw error;
  return (data ?? []) as SignupRow[];
}

export async function signupCount(): Promise<number> {
  const { data, error } = await supabase.rpc('admin_signup_counts');
  if (error) throw error;
  return Number(data ?? 0);
}

/** يقبل أو يرفض (أو يرجّع للانتظار). يرجع كم حساب تغيّر */
export async function setApproval(ids: string[], approval: Approval, note?: string): Promise<number> {
  const { data, error } = await supabase.rpc('admin_set_approval', { p_users: ids, p_approval: approval, p_note: note?.trim() || null });
  if (error) throw error;
  return Number(data ?? 0);
}

const KEY = 'signup_approval';
/** مفتاح التشغيل (افتراضياً مفعّل) */
export async function loadApprovalSetting(): Promise<boolean> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', KEY).maybeSingle();
  const v = (data as { value?: { enabled?: unknown } } | null)?.value?.enabled;
  return v !== false;
}
export async function saveApprovalSetting(enabled: boolean): Promise<void> {
  const { error } = await supabase.from('app_settings').upsert({ key: KEY, value: { enabled } });
  if (error) throw error;
}
