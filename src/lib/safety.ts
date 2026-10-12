// أمان المجتمع: الحظر والإبلاغ وفحص صور المنشورات وإرشادات المجتمع (شرط App Store رقم 1.2)
import { supabase } from './supabase';

export type ReportTarget = 'post' | 'comment' | 'checkin_comment' | 'message' | 'user';
export const REPORT_REASONS = ['harassment', 'hate', 'sexual', 'violence', 'self_harm', 'spam', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** بلاغ عن محتوى. hidden = انخفى الحين (وصل ٣ بلاغات من ناس مختلفين) */
export async function reportContent(type: ReportTarget, id: string, reason: ReportReason, note?: string) {
  const { data, error } = await supabase.rpc('report_content', { p_type: type, p_id: id, p_reason: reason, p_note: note?.trim() || null });
  if (error) throw error;
  return (data ?? { ok: true, hidden: false }) as { ok: boolean; hidden: boolean };
}

export async function blockUser(userId: string) {
  const { error } = await supabase.rpc('block_user', { p_user: userId });
  if (error) throw error;
}

export async function unblockUser(userId: string) {
  const { error } = await supabase.rpc('unblock_user', { p_user: userId });
  if (error) throw error;
}

/** هل أنا حاظره؟ (ما نعرض إذا هو حاظرني) */
export async function isBlockedByMe(me: string, other: string): Promise<boolean> {
  const { data } = await supabase.from('user_blocks').select('blocked').eq('blocker', me).eq('blocked', other).maybeSingle();
  return !!data;
}

export interface BlockedUser { user_id: string; username: string; full_name: string | null; avatar_url: string | null; blocked_at: string }
export async function listBlocks(): Promise<BlockedUser[]> {
  const { data, error } = await supabase.rpc('my_blocks');
  if (error) throw error;
  return (data ?? []) as BlockedUser[];
}

export async function acceptGuidelines() {
  const { error } = await supabase.rpc('accept_guidelines');
  if (error) throw error;
}

/** موقوف عن النشر لين متى (أو null) */
export async function mySuspension(): Promise<string | null> {
  const { data } = await supabase.rpc('my_suspension');
  return (data as string | null) ?? null;
}

// ---------- فحص صورة المنشور ----------
export type ScreenResult =
  | { screen: 'ok' }
  | { screen: 'blocked'; category?: string; reason?: { ar: string; en: string } }
  | { screen: 'pending'; error: string };

/** يفحص منشور فيه صورة (قيد الفحص). لو تعطّل يرجع pending مع رمز الخطأ، والمنشور يبقى مخفي عن الناس */
export async function screenPost(postId: string): Promise<ScreenResult> {
  const { data, error } = await supabase.functions.invoke('moderate-post', { body: { post_id: postId } });
  if (!error && (data?.screen === 'ok' || data?.screen === 'blocked')) return data as ScreenResult;
  let code = data?.error as string | undefined;
  try { code = code ?? (await (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context?.json?.())?.error; } catch { /* ignore */ }
  if (!code && error && /Failed to send|fetch|network/i.test(String((error as Error).message))) code = 'network';
  return { screen: 'pending', error: code ?? 'ai_failed' };
}

/** منشوراتي اللي علقت «قيد الفحص» (انقطع النت مثلاً): نحاول مرة ثانية بهدوء */
export async function rescreenMine(userId: string) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data } = await supabase.from('posts').select('id').eq('user_id', userId).eq('screen', 'pending')
    .gte('created_at', since).order('created_at', { ascending: false }).limit(3);
  for (const p of data ?? []) await screenPost(p.id).catch(() => null);
}

// ---------- المراجعة (المشرف) ----------
export interface SafetyItem {
  target_type: ReportTarget; target_id: string; target_user: string | null;
  username: string | null; full_name: string | null; avatar_url: string | null;
  reports: number; reasons: string[]; notes: string[];
  snapshot: { caption?: string | null; body?: string | null; image_path?: string | null; media_path?: string | null; media_type?: string | null;
              username?: string; full_name?: string | null; bio?: string | null; kind?: string; post_id?: string; check_in_id?: string };
  first_at: string; last_at: string; hidden: boolean | null; screen: string | null; suspended_until: string | null;
  status: 'open' | 'actioned' | 'dismissed';
}
export type SafetyAction = 'hide' | 'restore' | 'approve' | 'suspend' | 'unsuspend' | 'dismiss';

export async function safetyQueue(status: 'open' | 'all' = 'open'): Promise<SafetyItem[]> {
  const { data, error } = await supabase.rpc('admin_safety_queue', { p_status: status, p_limit: 100 });
  if (error) throw error;
  return ((data ?? []) as SafetyItem[]).map((r) => ({ ...r, reports: Number(r.reports ?? 0), reasons: r.reasons ?? [], notes: r.notes ?? [] }));
}

export async function safetyCounts(): Promise<{ open: number; unscreened: number }> {
  const { data, error } = await supabase.rpc('admin_safety_counts');
  if (error) throw error;
  const r = (Array.isArray(data) ? data[0] : data) ?? {};
  return { open: Number(r.open_targets ?? 0), unscreened: Number(r.unscreened ?? 0) };
}

export async function safetyAct(type: ReportTarget, id: string, action: SafetyAction, days?: number, note?: string) {
  const { error } = await supabase.rpc('admin_safety_act', { p_type: type, p_id: id, p_action: action, p_days: days ?? null, p_note: note?.trim() || null });
  if (error) throw error;
}

export async function listTerms(): Promise<string[]> {
  const { data, error } = await supabase.from('moderation_terms').select('term').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: { term: string }) => r.term);
}
export async function addTerm(term: string) {
  const { error } = await supabase.from('moderation_terms').insert({ term: term.trim() });
  if (error) throw error;
}
export async function removeTerm(term: string) {
  const { error } = await supabase.from('moderation_terms').delete().eq('term', term);
  if (error) throw error;
}
