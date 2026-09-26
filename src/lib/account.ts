// حذف الحساب نهائياً: الملفات أولاً ثم الحساب (البيانات تنحذف تلقائياً بالتسلسل)
import { supabase } from './supabase';

const BUCKETS = ['avatars', 'posts', 'body', 'inbody'] as const;

async function removeFolder(bucket: string, prefix: string) {
  const { data } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (!data?.length) return;
  const files = data.filter((f) => f.id).map((f) => `${prefix}/${f.name}`);
  const dirs = data.filter((f) => !f.id).map((f) => `${prefix}/${f.name}`);
  if (files.length) await supabase.storage.from(bucket).remove(files);
  for (const d of dirs) await removeFolder(bucket, d);
}

export async function deleteMyAccount(userId: string) {
  for (const b of BUCKETS) {
    try { await removeFolder(b, userId); } catch { /* نكمل حتى لو فشل حذف ملف */ }
  }
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
  await supabase.auth.signOut();
}
