// الرسائل الخاصة — فقط بين شخصين يتابعون بعض (مفروضة في القاعدة)
import { useEffect } from 'react';
import { supabase } from './supabase';

export interface Message { id: string; sender: string; recipient: string; body: string; created_at: string; read_at: string | null }
export interface InboxRow {
  other_id: string; username: string; full_name: string | null; avatar_url: string | null; points: number; is_coach: boolean;
  last_body: string; last_at: string; last_from_me: boolean; unread: number; can_message: boolean;
}
export interface Contact { id: string; username: string; full_name: string | null; avatar_url: string | null; points: number; is_coach: boolean }

export async function loadInbox(): Promise<InboxRow[]> {
  const { data } = await supabase.rpc('inbox');
  return ((data ?? []) as any[]).map((r) => ({ ...r, unread: Number(r.unread) }));
}

export async function loadContacts(): Promise<Contact[]> {
  const { data } = await supabase.rpc('mutual_followers');
  return (data ?? []) as Contact[];
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

export async function sendMessage(me: string, other: string, body: string): Promise<Message> {
  const { data, error } = await supabase.from('messages').insert({ sender: me, recipient: other, body: body.trim() }).select('*').single();
  if (error) throw error;
  return data as Message;
}

export const markRead = (me: string, other: string) =>
  supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('recipient', me).eq('sender', other).is('read_at', null);

export async function unreadCount(me: string): Promise<number> {
  const { count } = await supabase.from('messages').select('id', { count: 'exact', head: true }).eq('recipient', me).is('read_at', null);
  return count ?? 0;
}

/** استقبال الرسائل الجديدة لحظياً (Realtime) — RLS تضمن أن كل واحد يستقبل رسائله فقط */
export function useIncoming(me: string, onMessage: (m: Message) => void) {
  useEffect(() => {
    const ch = supabase.channel(`dm:${me}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient=eq.${me}` }, (p) => onMessage(p.new as Message))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [me, onMessage]);
}
