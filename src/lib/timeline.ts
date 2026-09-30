// التايم لاين: أنت وأصدقاؤك — المنشورات (صورة أو كلام)، «صباح الخير ☀️»، «تصبحون على خير 🌙»، ودخول النادي
// و«انتهى التمرين 💪» لما تسجّل خروجك، مع التفاعل بالإيموجي والتعليق.
// وأنت نايم (بعد «تصبحون على خير») التايم لاين يتقفل بشاشة النوم لين تضغط «صباح الخير».
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from './i18n';
import { isReaction, normalizeReactors, type Reactable } from './reactions';
import { parseHm, sanitizeSleep } from './sleep/core';
import { supabase } from './supabase';
import type { MomentMeta } from './types';
import { localDayKey, sleepStillOpen, wakePlan, wakePromptDue, type AlarmInfo } from './wakeCore';

/** checkout = «انتهى التمرين» (نفس زيارة النادي بوقت الخروج: التفاعل والتعليقات حقها واحد) */
export type TimelineType = 'post' | 'wake' | 'sleep' | 'checkin' | 'checkout';

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
/** حضور النادي ودخوله وخروجه لحظتين لنفس الزيارة */
export const isVisit = (t: TimelineType) => t === 'checkin' || t === 'checkout';

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

// ---------- وأنت نايم: «تصبحون على خير» مفتوحة (ما بعدها «صباح الخير») ----------
/** النومة المفتوحة: رقم منشور «تصبحون على خير» (لو نعرفه) ووقتها */
export interface OpenSleep { id: string | null; at: string }

const WAKE_KEY = (uid: string) => `arq.wake.v1:${uid}`;
const SLEEP_KEY = (uid: string) => `arq.sleepAt.v1:${uid}`;
const PROMPT_KEY = (uid: string) => `arq.wakePrompt.v1:${uid}`;

const sleepSubs = new Set<(uid: string, s: OpenSleep | null) => void>();
/** نمت أو صحيت (من هالجهاز أو عرفناها من الخادم) */
export const onSleepChanged = (fn: (uid: string, s: OpenSleep | null) => void) => { sleepSubs.add(fn); return () => { sleepSubs.delete(fn); }; };
let last: { uid: string; s: OpenSleep | null } | null = null;
/** رقم يزيد مع كل «تصبحون على خير» أو «صباح الخير» من هالجهاز: رد الخادم الأقدم منها ما نعتمده */
let sleepVer = 0;
function emitSleep(uid: string, s: OpenSleep | null) {
  last = { uid, s };
  sleepSubs.forEach((fn) => fn(uid, s));
}
/** آخر حالة نعرفها (undefined = للحين ما نعرف) */
export const knownSleep = (uid: string): OpenSleep | null | undefined => (last?.uid === uid ? last.s : undefined);
export const sameSleep = (a: OpenSleep | null | undefined, b: OpenSleep | null | undefined) =>
  a === b || (!!a && !!b && a.id === b.id && a.at === b.at);

async function readLocalSleep(uid: string, now: Date): Promise<OpenSleep | null> {
  const raw = await AsyncStorage.getItem(SLEEP_KEY(uid)).catch(() => null);
  if (!raw) return null;
  let s: OpenSleep = { id: null, at: raw }; // النسخ القديمة تحفظ الوقت بس
  try {
    const j = JSON.parse(raw);
    if (j && typeof j.at === 'string') s = { id: typeof j.id === 'string' ? j.id : null, at: j.at };
  } catch { /* وقت بس */ }
  const d = new Date(s.at);
  if (!Number.isNaN(d.getTime()) && sleepStillOpen(now, d)) return s;
  AsyncStorage.removeItem(SLEEP_KEY(uid)).catch(() => {});
  return null;
}
const writeLocalSleep = (uid: string, s: OpenSleep | null) =>
  (s ? AsyncStorage.setItem(SLEEP_KEY(uid), JSON.stringify(s)) : AsyncStorage.removeItem(SLEEP_KEY(uid))).catch(() => {});

/** نايم؟ من الخادم (يعرف لو نمت من جهاز ثاني)، وبدون نت من الجهاز. تنبّه اللي يسمعون onSleepChanged */
export async function loadOpenSleep(uid: string, now = new Date()): Promise<OpenSleep | null> {
  const v = sleepVer;
  let s: OpenSleep | null = null;
  let fromServer = false;
  try {
    const { data, error } = await supabase.rpc('my_open_sleep');
    if (!error) {
      fromServer = true;
      const row = (Array.isArray(data) ? data[0] : data) as { id?: string; at?: string } | null | undefined;
      s = row?.id && row.at ? { id: String(row.id), at: String(row.at) } : null;
    }
  } catch { /* بدون نت */ }
  if (!fromServer) s = await readLocalSleep(uid, now);
  // نمت أو صحيت من هالجهاز وحنا ننتظر الرد: الأحدث هو اللي عندنا
  if (v !== sleepVer) return knownSleep(uid) ?? null;
  if (fromServer) await writeLocalSleep(uid, s);
  emitSleep(uid, s);
  return s;
}

// ---------- «صباح الخير ☀️» و«تصبحون على خير 🌙» ----------
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

async function markWoke(uid: string, now: Date) {
  await AsyncStorage.setItem(WAKE_KEY(uid), localDayKey(now)).catch(() => {});
  await writeLocalSleep(uid, null);
}

export interface WakeTick {
  /** نايم من التطبيق (التايم لاين مقفل بشاشة النوم) */
  sleep: OpenSleep | null;
  /** صار له ساعتين وأكثر والحين صبح (أو بعد قيلولة): وقت شاشة «صباح الخير» */
  due: boolean;
}

let ticking: Promise<WakeTick> | null = null;
/**
 * كل ما انفتح التطبيق: نايم؟ نرجّع النومة (ولو حان وقت «صباح الخير»).
 * مو نايم: ننشر «صباح الخير» التلقائي مرة باليوم الصبح لو المشاركة شغّالة (auto)؛ والخادم بعد يمنع التكرار.
 */
export function wakeTick(uid: string, auto: boolean, now = new Date()): Promise<WakeTick> {
  if (!ticking) ticking = runTick(uid, auto, now).finally(() => { ticking = null; });
  return ticking;
}

async function runTick(uid: string, auto: boolean, now: Date): Promise<WakeTick> {
  const sleep = await loadOpenSleep(uid, now);
  if (sleep) return { sleep, due: wakePromptDue(now, new Date(sleep.at)) };
  if (!auto) return { sleep: null, due: false };
  const [done, alarm] = await Promise.all([AsyncStorage.getItem(WAKE_KEY(uid)).catch(() => null), readAlarm(uid)]);
  const plan = wakePlan(now, alarm, null, done === localDayKey(now));
  if (plan) {
    const { data, error } = await supabase.rpc('post_wake', { p_at: plan.at.toISOString(), p_src: plan.src, p_caption: wakeCaption(plan.at, plan.src) });
    // نجح، أو الخادم رفض الوقت (سفر بتوقيت ثاني): ما نعيد المحاولة اليوم. خطأ شبكة: نحاول المرة الجاية
    if (!error || /bad_time|bad_input/.test(error.message)) await markWoke(uid, now);
    if (!error && data) emitChanged();
  }
  return { sleep: null, due: false };
}

/** شاشة «صباح الخير» تنفتح لحالها مرة وحدة لكل نومة */
export async function claimWakePrompt(uid: string, sleepId: string): Promise<boolean> {
  const seen = await AsyncStorage.getItem(PROMPT_KEY(uid)).catch(() => null);
  if (seen === sleepId) return false;
  await AsyncStorage.setItem(PROMPT_KEY(uid), sleepId).catch(() => {});
  return true;
}

/** زر ＋ ← 🌙: «تصبحون على خير» الحين (والتايم لاين يتقفل بشاشة النوم) */
export async function postSleepNow(uid: string): Promise<string> {
  const now = new Date();
  const { data, error } = await supabase.rpc('post_sleep', { p_caption: sleepCaption(now) });
  if (error) throw error;
  const id = String(data);
  // ضغطها مرة ثانية وهو نايم (خلال ٣ ساعات): الخادم يرجع نفس النومة، فنخلي وقتها الأول
  const prev = knownSleep(uid);
  const s: OpenSleep = { id, at: prev?.id === id ? prev.at : now.toISOString() };
  sleepVer++;
  await writeLocalSleep(uid, s);
  emitSleep(uid, s);
  emitChanged();
  return id;
}

/**
 * شاشة النوم ← «صباح الخير ☀️»: الخادم يحسب كم نمت من «تصبحون على خير».
 * لو الخادم يقول إنك مو نايم أصلاً وقبل ٣ الفجر (bad_time) نفتح التايم لاين بدون منشور (null)
 */
export async function postWakeNow(uid: string): Promise<string | null> {
  const now = new Date();
  const { data, error } = await supabase.rpc('post_wake', { p_at: now.toISOString(), p_src: 'manual', p_caption: wakeCaption(now, 'manual') });
  if (error && !/bad_time/.test(error.message)) throw error;
  sleepVer++;
  await markWoke(uid, now);
  emitSleep(uid, null);
  emitChanged();
  return error || !data ? null : String(data);
}

/**
 * تراجع عن لحظة نشرتها الحين: «تصبحون على خير» تنشال كأنها ما صارت (والتايم لاين ينفتح)،
 * و«صباح الخير» تنشال فترجع نايم لو نومتك للحين مفتوحة (ويبقى اليوم محسوب، ما ننشره تلقائي من جديد)
 */
export async function undoMoment(uid: string, id: string, kind: 'wake' | 'sleep') {
  const { error } = await supabase.from('posts').delete().eq('id', id).eq('user_id', uid);
  if (error) throw error;
  sleepVer++;
  if (kind === 'sleep') {
    await writeLocalSleep(uid, null);
    emitSleep(uid, null);
  } else {
    await loadOpenSleep(uid);
  }
  emitChanged();
}
