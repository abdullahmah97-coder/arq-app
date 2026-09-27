// لوحة المالك: تقارير المختبرين، طلبات المتاجر، وتوثيق المدربين (مفروضة في القاعدة بـ is_admin)
import type { Brand } from './brands';
import { supabase } from './supabase';

export type ReportStatus = 'new' | 'seen' | 'fixed' | 'wontfix';
export const STATUS_COLOR = { new: '#E8912D', seen: '#5B8DEF', fixed: '#2E9E6A', wontfix: '#8A8A8A' } as const;
export const REPORT_STATUSES: ReportStatus[] = ['new', 'seen', 'fixed', 'wontfix'];
export interface Report {
  id: string; user_id: string; category: 'bug' | 'idea' | 'design' | 'other'; message: string; screen: string | null;
  app_version: string | null; platform: string | null; variant: string | null; status: ReportStatus; admin_note: string | null;
  screenshot_path: string | null; created_at: string; updated_at: string | null;
  profiles?: { username: string; full_name: string | null } | null;
}

export async function isAdmin(): Promise<boolean> {
  const { data } = await supabase.rpc('is_admin');
  return data === true;
}

export async function ownerCounts(): Promise<{ reports: number; brands: number } | null> {
  const { data } = await supabase.rpc('owner_counts');
  const r = (data as any[] | null)?.[0];
  return r ? { reports: Number(r.new_reports), brands: Number(r.pending_brands) } : null;
}

export async function loadReports(status?: ReportStatus): Promise<Report[]> {
  let q = supabase.from('beta_feedback').select('*, profiles(username, full_name)').order('created_at', { ascending: false }).limit(200);
  if (status) q = q.eq('status', status);
  const { data } = await q;
  return (data ?? []) as Report[];
}

export const loadMyReports = async (me: string): Promise<Report[]> =>
  ((await supabase.from('beta_feedback').select('*').eq('user_id', me).order('created_at', { ascending: false }).limit(30)).data ?? []) as Report[];

export async function updateReport(id: string, patch: { status?: ReportStatus; admin_note?: string | null }) {
  const { error } = await supabase.from('beta_feedback').update(patch).eq('id', id);
  if (error) throw error;
}

export async function reportShotUrl(path: string) {
  const { data } = await supabase.storage.from('feedback').createSignedUrl(path, 60 * 30);
  return data?.signedUrl;
}

export async function uploadReportShot(me: string, uri: string, mimeType = 'image/jpeg') {
  const ext = mimeType.includes('png') ? 'png' : 'jpg';
  const path = `${me}/${Date.now()}.${ext}`;
  const body = await (await fetch(uri)).arrayBuffer();
  const { error } = await supabase.storage.from('feedback').upload(path, body, { contentType: mimeType });
  if (error) throw error;
  return path;
}

export async function loadBrandRequests(): Promise<Brand[]> {
  const { data } = await supabase.from('brands').select('*, brand_products(id, brand_id, name, description, price_sar, image_path, url, active, created_at)')
    .order('created_at', { ascending: false }).limit(100);
  return (data ?? []) as Brand[];
}

export async function reviewBrand(id: string, status: 'approved' | 'rejected' | 'pending', note?: string) {
  const { error } = await supabase.from('brands').update({ status, review_note: note?.trim() || null }).eq('id', id);
  if (error) throw error;
}

export async function setCoach(userId: string, value: boolean) {
  const { error } = await supabase.rpc('set_coach', { p_user: userId, p_value: value });
  if (error) throw error;
}
