// البطولات والفعاليات: القائمة للمستخدمين، التذكير قبل الموعد، وأدوات لوحة إدارة التطبيق (إضافة، تعديل، صورة)
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { reminderTime, type LocalEvent } from './eventsCore';
import { publicUrl, supabase } from './supabase';

export * from './eventsCore';

export const eventImageUrl = (path: string | null | undefined) => publicUrl('events', path);

// نحتفظ بالقائمة ١٠ دقايق عشان مربع الرئيسية ما يطلبها كل ما رجع المستخدم لها
let cache: { at: number; rows: LocalEvent[] } | null = null;
const CACHE_MS = 10 * 60_000;
const dropCache = () => { cache = null; };

export async function loadEvents(): Promise<LocalEvent[]> {
  const { data, error } = await supabase.from('local_events').select('*').eq('active', true).order('starts_on', { ascending: true, nullsFirst: false });
  if (error) throw error;
  const rows = (data ?? []) as LocalEvent[];
  cache = { at: Date.now(), rows };
  return rows;
}

/** للرئيسية: من الذاكرة لو عمرها أقل من ١٠ دقايق */
export async function loadEventsCached(): Promise<LocalEvent[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  return loadEvents();
}

export async function loadEvent(id: string): Promise<LocalEvent | null> {
  const { data } = await supabase.from('local_events').select('*').eq('id', id).maybeSingle();
  return (data as LocalEvent | null) ?? null;
}

// ---------- التذكير قبل الموعد بيوم (إشعار محلي على الجوال) ----------
const REM_KEY = 'arq.eventReminders';
type RemMap = Record<string, string>;
const readRem = async (): Promise<RemMap> => {
  try { return JSON.parse((await AsyncStorage.getItem(REM_KEY)) ?? '{}') as RemMap; } catch { return {}; }
};
const writeRem = (m: RemMap) => AsyncStorage.setItem(REM_KEY, JSON.stringify(m)).catch(() => {});

export async function hasReminder(id: string) { return !!(await readRem())[id]; }

/** يشغّل أو يطفي التذكير. يرجع الحالة الجديدة، أو 'denied' لو الإشعارات مقفلة، أو 'unavailable' لو فات الوقت */
export async function toggleReminder(e: LocalEvent, text: { title: string; body: string }): Promise<'on' | 'off' | 'denied' | 'unavailable'> {
  const m = await readRem();
  if (m[e.id]) {
    if (Platform.OS !== 'web') await Notifications.cancelScheduledNotificationAsync(m[e.id]).catch(() => {});
    delete m[e.id];
    await writeRem(m);
    return 'off';
  }
  const at = reminderTime(e);
  if (!at || Platform.OS === 'web') return 'unavailable';
  let p = await Notifications.getPermissionsAsync();
  if (!p.granted && p.canAskAgain) p = await Notifications.requestPermissionsAsync();
  if (!p.granted && p.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL) return 'denied';
  const nid = await Notifications.scheduleNotificationAsync({
    content: { title: text.title, body: text.body, sound: 'default', interruptionLevel: 'active', data: { kind: 'event', url: `/events/${e.id}` } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: 'default' },
  });
  m[e.id] = nid;
  await writeRem(m);
  return 'on';
}

// ---------- لوحة إدارة التطبيق ----------
export type EventInput = Omit<LocalEvent, 'id' | 'created_at' | 'updated_at'>;

export async function listAllEvents(): Promise<LocalEvent[]> {
  const { data, error } = await supabase.from('local_events').select('*').order('starts_on', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as LocalEvent[];
}

const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

export async function saveEvent(input: EventInput, id?: string): Promise<string> {
  const row = {
    ...input,
    title: input.title.trim(),
    title_en: clean(input.title_en), city: clean(input.city), city_en: clean(input.city_en), venue: clean(input.venue), venue_en: clean(input.venue_en),
    date_note: clean(input.date_note), date_note_en: clean(input.date_note_en), summary: clean(input.summary), summary_en: clean(input.summary_en), url: clean(input.url),
  };
  const { data, error } = id
    ? await supabase.from('local_events').update(row).eq('id', id).select('id').single()
    : await supabase.from('local_events').insert(row).select('id').single();
  if (error) throw error;
  dropCache();
  return (data as { id: string }).id;
}

export async function setEventActive(id: string, active: boolean) {
  const { error } = await supabase.from('local_events').update({ active }).eq('id', id);
  if (error) throw error;
  dropCache();
}

export async function deleteEvent(e: Pick<LocalEvent, 'id' | 'image_path'>) {
  const { error } = await supabase.from('local_events').delete().eq('id', e.id);
  if (error) throw error;
  dropCache();
  if (e.image_path) supabase.storage.from('events').remove([e.image_path]).then(() => {}, () => {});
}

/** الصورة القديمة بعد ما تتبدّل (ما يوقف الحفظ لو فشل) */
export function removeEventImage(path: string | null | undefined) {
  if (path) supabase.storage.from('events').remove([path]).then(() => {}, () => {});
}

/** صورة الفعالية: ٥ ميقا بالكثير */
export async function uploadEventImage(uri: string, mimeType: string): Promise<string> {
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const body = await (await fetch(uri)).arrayBuffer();
  if (body.byteLength > 5 * 1024 * 1024) throw new Error('file_too_big');
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('events').upload(path, body, { contentType: mimeType, cacheControl: '31536000' });
  if (error) throw error;
  return path;
}
