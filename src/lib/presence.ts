// الموجودين في النادي (مثل Swarm): من حضر الآن/اليوم + كفو وتعليقات على الحضور
import { supabase } from './supabase';
import type { PresenceVisibility } from './types';

export interface PresenceRow {
  check_in_id: string;
  user_id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  points: number;
  is_coach: boolean;
  checked_in_at: string;
  checked_out_at: string | null;
  is_friend: boolean;
  is_me: boolean;
  likes: number;
  comments: number;
  liked_by_me: boolean;
}

export async function loadPresence(gymId: string): Promise<{ rows: PresenceRow[]; presentNow: number }> {
  const [a, b] = await Promise.all([
    supabase.rpc('gym_presence', { p_gym: gymId }),
    supabase.rpc('gym_present_count', { p_gym: gymId }),
  ]);
  const rows = ((a.data ?? []) as any[]).map((r) => ({ ...r, likes: Number(r.likes), comments: Number(r.comments) })) as PresenceRow[];
  return { rows, presentNow: Number(b.data ?? 0) };
}

export const isHere = (r: Pick<PresenceRow, 'checked_out_at'>) => !r.checked_out_at;

export function toggleHighFive(r: PresenceRow, me: string) {
  return r.liked_by_me
    ? supabase.from('checkin_likes').delete().eq('check_in_id', r.check_in_id).eq('user_id', me)
    : supabase.from('checkin_likes').insert({ check_in_id: r.check_in_id, user_id: me });
}

export interface CheckinComment {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  profiles?: { username: string; full_name: string | null; avatar_url: string | null };
}

export async function loadCheckinComments(checkInId: string): Promise<CheckinComment[]> {
  const { data } = await supabase.from('checkin_comments')
    .select('id, user_id, body, created_at, profiles(username, full_name, avatar_url)')
    .eq('check_in_id', checkInId).order('created_at', { ascending: true }).limit(200);
  return (data ?? []) as any;
}

export const addCheckinComment = (checkInId: string, me: string, body: string) =>
  supabase.from('checkin_comments').insert({ check_in_id: checkInId, user_id: me, body: body.trim() });
export const deleteCheckinComment = (id: string) => supabase.from('checkin_comments').delete().eq('id', id);

export const setPresenceVisibility = (me: string, v: PresenceVisibility) =>
  supabase.from('profiles').update({ presence_visibility: v }).eq('id', me);
