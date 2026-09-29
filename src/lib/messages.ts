// الرسائل الخاصة: بين الأصدقاء (بعد قبول طلب الصداقة) أو المدرب ومتدربه — مفروضة في القاعدة. وفيها صور وفيديو.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { supabase } from './supabase';

export interface Message {
  id: string; sender: string; recipient: string; body: string; created_at: string; read_at: string | null;
  /** صورة أو فيديو الرسالة (حاوية chat الخاصة): <المرسل>/<المستلم>/<ملف> */
  media_path?: string | null; media_type?: 'image' | 'video' | null; media_w?: number | null; media_h?: number | null;
  /** مدة الفيديو بالثواني */
  media_dur?: number | null;
}
export interface ChatMedia { path: string; type: 'image' | 'video'; width?: number; height?: number; duration?: number }
export interface InboxRow {
  other_id: string; username: string; full_name: string | null; avatar_url: string | null; points: number; is_coach: boolean;
  last_body: string; last_at: string; last_from_me: boolean; unread: number; can_message: boolean;
}
export type ContactRelation = 'friend' | 'mutual' | 'coach';
export interface Contact { id: string; username: string; full_name: string | null; avatar_url: string | null; points: number; is_coach: boolean; relation?: ContactRelation }

export async function loadInbox(): Promise<InboxRow[]> {
  const { data } = await supabase.rpc('inbox');
  return ((data ?? []) as any[]).map((r) => ({ ...r, unread: Number(r.unread) }));
}

/** اللي تقدر تراسلهم: الأصدقاء أولاً (وقبل تحديث القاعدة نرجع للقائمة القديمة) */
export async function loadContacts(): Promise<Contact[]> {
  const { data, error } = await supabase.rpc('message_contacts');
  if (!error) return (data ?? []) as Contact[];
  const old = await supabase.rpc('mutual_followers');
  return (old.data ?? []) as Contact[];
}

export async function canMessage(me: string, other: string): Promise<boolean> {
  const { data } = await supabase.rpc('mutual_follow', { a: me, b: other });
  return data === true;
}

export async function loadThread(me: string, other: string, limit = 200): Promise<Message[]> {
  const { data } = await supabase.from('messages').select('*')
    .or(`and(sender.eq.${me},recipient.eq.${other}),and(sender.eq.${other},recipient.eq.${me})`)
    .order('created_at', { ascending: false }).limit(limit);
  return ((data ?? []) as Message[]).reverse();
}

export async function sendMessage(me: string, other: string, body: string, media?: ChatMedia): Promise<Message> {
  const row: Record<string, string | number | null> = { sender: me, recipient: other, body: body.trim() };
  if (media) {
    row.media_path = media.path; row.media_type = media.type;
    row.media_w = media.width ? Math.round(media.width) : null; row.media_h = media.height ? Math.round(media.height) : null;
    if (media.type === 'video' && media.duration != null) row.media_dur = Math.round(media.duration * 10) / 10;
  }
  const { data, error } = await supabase.from('messages').insert(row).select('*').single();
  if (error) throw error;
  return data as Message;
}

/** رفع صورة أو فيديو للمحادثة: مجلد المرسل ثم المستلم (الحاوية خاصة، يشوفها الطرفين بس) */
export async function uploadChatMedia(me: string, other: string, uri: string, mimeType = 'image/jpeg'): Promise<string> {
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : mimeType.includes('hei') ? 'heic'
    : mimeType.includes('quicktime') ? 'mov' : mimeType.startsWith('video/') ? 'mp4' : 'jpg';
  const path = `${me}/${other}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const body = await (await fetch(uri)).arrayBuffer();
  const { error } = await supabase.storage.from('chat').upload(path, body, { contentType: mimeType, upsert: false });
  if (error) throw error;
  return path;
}

/** روابط مؤقتة (ساعة) لصور وفيديوهات المحادثة */
export async function chatMediaUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await supabase.storage.from('chat').createSignedUrls(paths, 60 * 60);
  const out: Record<string, string> = {};
  for (const r of data ?? []) if (r.path && r.signedUrl) out[r.path] = r.signedUrl;
  return out;
}

/**
 * يعلّم رسائل هالشخص كمقروءة. لازم await: طلب supabase ما ينرسل إلا لما ننتظره (then)،
 * وقبل كانت تنادى بدون انتظار فما تنحفظ القراءة وتبقى الرسالة «غير مقروءة» للأبد.
 */
export async function markRead(me: string, other: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('messages').update({ read_at: new Date().toISOString() })
      .eq('recipient', me).eq('sender', other).is('read_at', null);
    return !error;
  } catch {
    return false;
  }
}

export async function unreadCount(me: string): Promise<number> {
  const { count } = await supabase.from('messages').select('id', { count: 'exact', head: true }).eq('recipient', me).is('read_at', null);
  return count ?? 0;
}

/**
 * استقبال الرسائل الجديدة لحظياً (Realtime). RLS تضمن إن كل واحد يستقبل رسائله بس.
 * اشتراك واحد مشترك: صندوق الرسائل والمحادثة يكونون مفتوحين مع بعض، ولو كل واحد فتح قناة بنفس الاسم
 * ترجع نفس القناة وتنقفل الصفحة بخطأ «cannot add postgres_changes callbacks after subscribe()».
 */
type Listener = (m: Message) => void;
let live: { me: string; ch: RealtimeChannel; listeners: Set<Listener> } | null = null;
let seq = 0;

function retainIncoming(me: string, fn: Listener) {
  if (live && live.me !== me) { supabase.removeChannel(live.ch); live = null; }
  if (!live) {
    const listeners = new Set<Listener>();
    // اسم جديد لكل قناة: القناة القديمة ممكن تكون لسا تنقفل
    const ch = supabase.channel(`dm:${me}:${++seq}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient=eq.${me}` }, (p) => {
        for (const l of listeners) { try { l(p.new as Message); } catch { /* مستمع واحد ما يوقف الباقي */ } }
      })
      .subscribe();
    live = { me, ch, listeners };
  }
  live.listeners.add(fn);
}

function releaseIncoming(me: string, fn: Listener) {
  if (!live || live.me !== me) return;
  live.listeners.delete(fn);
  if (!live.listeners.size) { supabase.removeChannel(live.ch); live = null; }
}

export function useIncoming(me: string, onMessage: Listener) {
  useEffect(() => {
    if (!me) return;
    retainIncoming(me, onMessage);
    return () => releaseIncoming(me, onMessage);
  }, [me, onMessage]);
}
