// التنبيهات داخل التطبيق (الجرس): الخادم يكتبها تلقائياً (متابعة، إعجاب، تعليق، تحدي، عرض ناديك…) وكل واحد يشوف تنبيهاته فقط
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export type NotifKind =
  | 'follow' | 'friend_request' | 'friend_accept'
  | 'post_like' | 'post_comment' | 'checkin_like' | 'checkin_comment' | 'friend_here'
  | 'challenge_invite' | 'challenge_win' | 'rank_up' | 'program_adopt' | 'gym_offer';

export interface NotifRow {
  id: number;
  kind: NotifKind;
  target_id: string | null;
  data: Record<string, any>;
  created_at: string;
  read_at: string | null;
  actor_id: string | null;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

/** أنواع التنبيهات في الإعدادات (نفس مفاتيح notify_prefs في القاعدة) */
export const NOTIFY_CATEGORIES = ['messages', 'social', 'activity', 'progress', 'offers'] as const;
export type NotifyCategory = (typeof NOTIFY_CATEGORIES)[number];
export type NotifyPrefs = Record<NotifyCategory, boolean>;
export const DEFAULT_PREFS: NotifyPrefs = { messages: true, social: true, activity: true, progress: true, offers: true };

export async function loadNotifications(before?: number, limit = 40): Promise<NotifRow[]> {
  const { data, error } = await supabase.rpc('my_notifications', { p_before: before ?? null, p_limit: limit });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({ ...r, id: Number(r.id), data: r.data ?? {} }));
}

export async function unreadNotifications(): Promise<number> {
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  return count ?? 0;
}

export async function markNotificationsRead(upto?: number) {
  await supabase.rpc('mark_notifications_read', { p_upto: upto ?? null });
}

export async function loadNotifyPrefs(userId: string): Promise<NotifyPrefs> {
  const { data } = await supabase.from('profiles').select('notify_prefs').eq('id', userId).maybeSingle();
  return { ...DEFAULT_PREFS, ...((data?.notify_prefs as Partial<NotifyPrefs>) ?? {}) };
}

export async function saveNotifyPrefs(userId: string, prefs: NotifyPrefs) {
  const { error } = await supabase.from('profiles').update({ notify_prefs: prefs }).eq('id', userId);
  if (error) throw error;
}

/** وين يودّي التنبيه لما تضغطه (نفس روابط إشعار الجوال) */
export function notifHref(n: Pick<NotifRow, 'kind' | 'target_id' | 'actor_id' | 'data'>): string | null {
  switch (n.kind) {
    case 'follow': return n.actor_id ? `/user/${n.actor_id}` : null;
    case 'friend_request': return '/friends';
    case 'friend_accept': return n.actor_id ? `/user/${n.actor_id}` : '/friends';
    case 'post_like':
    case 'post_comment': return n.target_id ? `/post/${n.target_id}` : null;
    case 'checkin_like':
    case 'checkin_comment':
    case 'friend_here': return n.target_id ? `/checkin/${n.target_id}` : null;
    case 'challenge_invite':
    case 'challenge_win': return n.target_id ? `/challenge/${n.target_id}` : null;
    case 'rank_up': return '/ranks';
    case 'program_adopt': return n.target_id ? `/program/${n.target_id}` : null;
    case 'gym_offer':
      if (n.data?.gym_id) return `/clubs/${n.data.gym_id}`;
      if (n.data?.chain_id) return `/clubs/chain/${n.data.chain_id}`;
      return '/clubs';
    default: return null;
  }
}

// عدّاد الجرس: يتحدّث لما ترجع للشاشة، ولحظياً لما يوصل تنبيه جديد، ولما تقرأ التنبيهات
const listeners = new Set<(n: number) => void>();
let lastCount = 0;
export function setUnreadBadge(n: number) {
  lastCount = n;
  listeners.forEach((l) => l(n));
}
export async function refreshUnreadBadge() {
  try { setUnreadBadge(await unreadNotifications()); } catch { /* بدون اتصال: نخلي العدد كما هو */ }
}

// اشتراك لحظي واحد مشترك بين كل الأجراس (الرئيسية والمجتمع مفتوحين مع بعض في التبويبات)
let live: { userId: string; users: number; ch: ReturnType<typeof supabase.channel> } | null = null;
function retainLive(userId: string) {
  if (live && live.userId !== userId) { supabase.removeChannel(live.ch); live = null; }
  if (!live) {
    const ch = supabase.channel(`notif:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => refreshUnreadBadge())
      .subscribe();
    live = { userId, users: 0, ch };
  }
  live.users += 1;
}
function releaseLive(userId: string) {
  if (!live || live.userId !== userId) return;
  live.users -= 1;
  if (live.users <= 0) { supabase.removeChannel(live.ch); live = null; }
}

export function useUnreadNotifications(userId: string | null | undefined) {
  const [n, setN] = useState(lastCount);
  useEffect(() => {
    listeners.add(setN);
    return () => { listeners.delete(setN); };
  }, []);
  useFocusEffect(useCallback(() => { if (userId) refreshUnreadBadge(); }, [userId]));
  useEffect(() => {
    if (!userId) return;
    retainLive(userId);
    return () => releaseLive(userId);
  }, [userId]);
  return n;
}
