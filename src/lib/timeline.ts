// التايم لاين: أنت وأصدقاؤك — المنشورات (صورة أو رسالة)، «صحى ☀️»، والحضور في النادي، مع اللايك والتعليق
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from './i18n';
import { parseHm, sanitizeSleep } from './sleep/core';
import { supabase } from './supabase';
import type { FeedPost, WakeMeta } from './types';
import { localDayKey, wakeMoment } from './wakeCore';

export type TimelineType = 'post' | 'wake' | 'checkin';

export interface TimelineItem {
  item_type: TimelineType;
  /** رقم المنشور أو رقم الحضور */
  id: string;
  user_id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  is_coach: boolean;
  image_path: string | null;
  caption: string | null;
  gym_id: string | null;
  gym_name: string | null;
  meta: WakeMeta & { out?: string | null };
  at: string;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
}

export const TIMELINE_PAGE = 20;

export async function loadTimeline(before?: string): Promise<TimelineItem[]> {
  const { data, error } = await supabase.rpc('timeline', {
    p_before: before ?? new Date(Date.now() + 60_000).toISOString(), p_limit: TIMELINE_PAGE,
  });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r, meta: r.meta ?? {}, like_count: Number(r.like_count ?? 0), comment_count: Number(r.comment_count ?? 0),
  }));
}

/** منشور أو «صحى» بشكل بطاقة المنشورات (نفس اللايك والتعليق وصفحة المنشور) */
export const asFeedPost = (it: TimelineItem): FeedPost => ({
  id: it.id, user_id: it.user_id, username: it.username, full_name: it.full_name, avatar_url: it.avatar_url,
  image_path: it.image_path, caption: it.caption, check_in_id: null, gym_name: it.gym_name, created_at: it.at,
  like_count: it.like_count, comment_count: it.comment_count, liked_by_me: it.liked_by_me,
  kind: it.item_type === 'wake' ? 'wake' : 'post', meta: it.meta,
});

export const toggledLike = <T extends { liked_by_me: boolean; like_count: number }>(x: T): T =>
  ({ ...x, liked_by_me: !x.liked_by_me, like_count: Math.max(0, x.like_count + (x.liked_by_me ? -1 : 1)) });

/** لايك: الحضور له تصفيقه الخاص (نفس اللي في صفحة النادي)، والمنشورات و«صحى» لايك المنشورات */
export function setTimelineLike(it: TimelineItem, me: string) {
  if (it.item_type === 'checkin') {
    return it.liked_by_me
      ? supabase.from('checkin_likes').delete().eq('check_in_id', it.id).eq('user_id', me)
      : supabase.from('checkin_likes').insert({ check_in_id: it.id, user_id: me });
  }
  return it.liked_by_me
    ? supabase.from('post_likes').delete().eq('post_id', it.id).eq('user_id', me)
    : supabase.from('post_likes').insert({ post_id: it.id, user_id: me });
}

/** وش أشارك مع أصدقائي */
export const setSharing = (me: string, patch: { share_wake?: boolean; share_checkins?: boolean }) =>
  supabase.from('profiles').update(patch).eq('id', me);

// ---------- «صحى ☀️» ----------
const WAKE_KEY = (uid: string) => `arq.wake.v1:${uid}`;
let posting = false;

/** نص بديل للنسخ القديمة من التطبيق (تعرضه كمنشور عادي) */
function wakeCaption(at: Date, src: 'alarm' | 'open') {
  const lng = i18n.language === 'en' ? 'en' : 'ar';
  let time = `${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}`;
  try { time = at.toLocaleTimeString(lng === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { hour: 'numeric', minute: '2-digit' }); } catch { /* نخليه */ }
  return i18n.t(src === 'alarm' ? 'timeline.captionWoke' : 'timeline.captionMorning', { lng, time });
}

/**
 * لو ما نشرنا «صحى» اليوم وهذا وقته (الصبح)، ننشره. مرة باليوم على الجهاز، والخادم بعد يمنع التكرار.
 * يحترم إعداد المشاركة في الخادم (لو طفاه ما ينشر شي).
 */
export async function postWakeIfDue(uid: string, now = new Date()) {
  if (posting) return;
  const today = localDayKey(now);
  if ((await AsyncStorage.getItem(WAKE_KEY(uid)).catch(() => null)) === today) return;
  let alarm = null;
  try {
    const raw = await AsyncStorage.getItem(`arq.sleep.v1:${uid}`);
    if (raw) { const s = sanitizeSleep(JSON.parse(raw)); alarm = { on: s.alarm, wakeMin: parseHm(s.wake), days: s.days }; }
  } catch { /* بدون منبّه */ }
  const m = wakeMoment(now, alarm);
  if (!m) return;
  posting = true;
  try {
    const { error } = await supabase.rpc('post_wake', { p_at: m.at.toISOString(), p_src: m.src, p_caption: wakeCaption(m.at, m.src) });
    // نجح، أو اليوم عند الخادم غير (سفر بتوقيت ثاني): ما نعيد المحاولة اليوم. خطأ شبكة: نحاول المرة الجاية
    if (!error || /bad_time|bad_input/.test(error.message)) await AsyncStorage.setItem(WAKE_KEY(uid), today).catch(() => {});
  } finally {
    posting = false;
  }
}
