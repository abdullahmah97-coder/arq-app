// التايم لاين: أنت وأصدقاؤك — المنشورات (صورة أو كلام)، «صباح الخير ☀️»، «تصبحون على خير 🌙»، والحضور في النادي،
// مع التفاعل بالإيموجي والتعليق
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from './i18n';
import { isReaction, normalizeReactors, type Reactable } from './reactions';
import { parseHm, sanitizeSleep } from './sleep/core';
import { supabase } from './supabase';
import type { MomentMeta } from './types';
import { localDayKey, sleepStillOpen, wakePlan, type AlarmInfo } from './wakeCore';

export type TimelineType = 'post' | 'wake' | 'sleep' | 'checkin';

export interface TimelineItem extends Reactable {
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
  meta: MomentMeta;
  at: string;
  comment_count: number;
}

export const TIMELINE_PAGE = 20;
export const itemKey = (it: Pick<TimelineItem, 'item_type' | 'id'>) => `${it.item_type}:${it.id}`;

export async function loadTimeline(before?: string): Promise<TimelineItem[]> {
  const { data, error } = await supabase.rpc('timeline', {
    p_before: before ?? new Date(Date.now() + 60_000).toISOString(), p_limit: TIMELINE_PAGE,
  });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    meta: r.meta && typeof r.meta === 'object' ? r.meta : {},
    like_count: Number(r.like_count ?? 0),
    comment_count: Number(r.comment_count ?? 0),
    my_reaction: isReaction(r.my_reaction) ? r.my_reaction : null,
    reactors: normalizeReactors(r.reactors),
  }));
}

/** وش أشارك مع أصدقائي */
export const setSharing = (me: string, patch: { share_wake?: boolean; share_checkins?: boolean }) =>
  supabase.from('profiles').update(patch).eq('id', me);

// ---------- تنبيه داخلي: انضاف شي للتايم لاين (صباح الخير / تصبحون على خير) عشان الصفحة تتحدث ----------
const changed = new Set<() => void>();
export const onTimelineChanged = (fn: () => void) => { changed.add(fn); return () => { changed.delete(fn); }; };
const emitChanged = () => changed.forEach((fn) => fn());

// سجّل دخول النادي من زر ＋ ← نرجع للتايم لاين ونعرض «سجّلت دخولك في …»
const checkedIn = new Set<(gym: string, points: number) => void>();
export const onCheckedIn = (fn: (gym: string, points: number) => void) => { checkedIn.add(fn); return () => { checkedIn.delete(fn); }; };
export function emitCheckedIn(gym: string, points: number) {
  checkedIn.forEach((fn) => fn(gym, points));
  emitChanged();
}

// ---------- «صباح الخير ☀️» و«تصبحون على خير 🌙» ----------
const WAKE_KEY = (uid: string) => `arq.wake.v1:${uid}`;
const SLEEP_KEY = (uid: string) => `arq.sleepAt.v1:${uid}`;
let posting = false;

function clock(at: Date) {
  const lng = i18n.language === 'en' ? 'en' : 'ar';
  try { return at.toLocaleTimeString(lng === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { hour: 'numeric', minute: '2-digit' }); }
  catch { return `${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}`; }
}
/** نص بديل للنسخ القديمة من التطبيق (تعرضه كمنشور عادي) — بلغة اللي نشر */
const wakeCaption = (at: Date, src: 'alarm' | 'open' | 'manual') =>
  i18n.t(src === 'alarm' ? 'timeline.captionWoke' : 'timeline.captionMorning', { lng: i18n.language === 'en' ? 'en' : 'ar', time: clock(at) });
const sleepCaption = (at: Date) => i18n.t('timeline.captionSleep', { lng: i18n.language === 'en' ? 'en' : 'ar', time: clock(at) });

async function readAlarm(uid: string): Promise<AlarmInfo | null> {
  try {
    const raw = await AsyncStorage.getItem(`arq.sleep.v1:${uid}`);
    if (!raw) return null;
    const s = sanitizeSleep(JSON.parse(raw));
    return { on: s.alarm, wakeMin: parseHm(s.wake), days: s.days };
  } catch { return null; }
}

/** «تصبحون على خير» اللي نشرتها من هالجهاز وما صحيت منها للحين (null لو ما فيه أو قدمت) */
export async function openSleep(uid: string, now = new Date()): Promise<Date | null> {
  const raw = await AsyncStorage.getItem(SLEEP_KEY(uid)).catch(() => null);
  const d = raw ? new Date(raw) : null;
  if (d && sleepStillOpen(now, d)) return d;
  if (raw) AsyncStorage.removeItem(SLEEP_KEY(uid)).catch(() => {});
  return null;
}

async function markWoke(uid: string, now: Date) {
  await AsyncStorage.setItem(WAKE_KEY(uid), localDayKey(now)).catch(() => {});
  await AsyncStorage.removeItem(SLEEP_KEY(uid)).catch(() => {});
}

/**
 * لو هذا وقت «صباح الخير» ننشره: مرة باليوم الصبح، أو أول فتح بعد «تصبحون على خير» بساعتين.
 * يحترم إعداد المشاركة في الخادم (لو طفاه ما ينشر شي)، والخادم بعد يمنع التكرار.
 */
export async function postWakeIfDue(uid: string, now = new Date()) {
  if (posting) return;
  posting = true;
  try {
    const [done, sleepAt, alarm] = await Promise.all([
      AsyncStorage.getItem(WAKE_KEY(uid)).catch(() => null), openSleep(uid, now), readAlarm(uid),
    ]);
    const plan = wakePlan(now, alarm, sleepAt, done === localDayKey(now));
    if (!plan) return;
    const { data, error } = await supabase.rpc('post_wake', { p_at: plan.at.toISOString(), p_src: plan.src, p_caption: wakeCaption(plan.at, plan.src) });
    // نجح، أو الخادم رفض الوقت (سفر بتوقيت ثاني): ما نعيد المحاولة اليوم. too_soon أو خطأ شبكة: نحاول المرة الجاية
    if (!error || /bad_time|bad_input/.test(error.message)) await markWoke(uid, now);
    if (!error && data) emitChanged();
  } finally {
    posting = false;
  }
}

/** زر ＋ ← 🌙: «تصبحون على خير» الحين */
export async function postSleepNow(uid: string): Promise<string> {
  const now = new Date();
  const { data, error } = await supabase.rpc('post_sleep', { p_caption: sleepCaption(now) });
  if (error) throw error;
  await AsyncStorage.setItem(SLEEP_KEY(uid), now.toISOString()).catch(() => {});
  emitChanged();
  return String(data);
}

/** زر ＋ ← ☀️: «صباح الخير» الحين (حتى لو المشاركة التلقائية طافية) */
export async function postWakeNow(uid: string): Promise<string> {
  const now = new Date();
  const { data, error } = await supabase.rpc('post_wake', { p_at: now.toISOString(), p_src: 'manual', p_caption: wakeCaption(now, 'manual') });
  if (error) throw error;
  await markWoke(uid, now);
  emitChanged();
  return String(data);
}

/**
 * تراجع عن لحظة نشرتها الحين من زر ＋. «صباح الخير» يبقى اليوم محسوب (ما ننشره تلقائي من جديد)،
 * و«تصبحون على خير» تنشال من الجهاز كأنها ما صارت.
 */
export async function undoMoment(uid: string, id: string, kind: 'wake' | 'sleep') {
  const { error } = await supabase.from('posts').delete().eq('id', id).eq('user_id', uid);
  if (error) throw error;
  if (kind === 'sleep') await AsyncStorage.removeItem(SLEEP_KEY(uid)).catch(() => {});
  emitChanged();
}
