import { supabase } from './supabase';
import type { Friendship, Profile } from './types';

export type MiniProfile = Pick<Profile, 'id' | 'username' | 'full_name' | 'avatar_url'>;

export interface FriendState {
  friends: MiniProfile[];
  incoming: (Friendship & { other: MiniProfile })[];
  outgoing: (Friendship & { other: MiniProfile })[];
}

const SEL = 'id, requester, addressee, status, created_at, r:profiles!friendships_requester_fkey(id, username, full_name, avatar_url), a:profiles!friendships_addressee_fkey(id, username, full_name, avatar_url)';

export async function loadFriends(userId: string): Promise<FriendState> {
  const { data } = await supabase.from('friendships').select(SEL);
  const out: FriendState = { friends: [], incoming: [], outgoing: [] };
  for (const f of (data ?? []) as any[]) {
    const other: MiniProfile = f.requester === userId ? f.a : f.r;
    if (!other) continue;
    if (f.status === 'accepted') out.friends.push(other);
    else if (f.addressee === userId) out.incoming.push({ ...f, other });
    else out.outgoing.push({ ...f, other });
  }
  out.friends.sort((x, y) => (x.full_name ?? x.username).localeCompare(y.full_name ?? y.username));
  return out;
}

export type Relation = 'self' | 'none' | 'friends' | 'outgoing' | 'incoming';

export async function relationTo(userId: string, otherId: string): Promise<{ relation: Relation; id?: string }> {
  if (userId === otherId) return { relation: 'self' };
  const { data } = await supabase.from('friendships').select('id, requester, status')
    .or(`and(requester.eq.${userId},addressee.eq.${otherId}),and(requester.eq.${otherId},addressee.eq.${userId})`)
    .maybeSingle();
  if (!data) return { relation: 'none' };
  if (data.status === 'accepted') return { relation: 'friends', id: data.id };
  return { relation: data.requester === userId ? 'outgoing' : 'incoming', id: data.id };
}

export const sendRequest = (userId: string, otherId: string) =>
  supabase.from('friendships').insert({ requester: userId, addressee: otherId });

export const acceptRequest = (id: string) =>
  supabase.from('friendships').update({ status: 'accepted' }).eq('id', id);

export const removeFriendship = (id: string) =>
  supabase.from('friendships').delete().eq('id', id);
