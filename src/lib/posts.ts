import { isReaction, normalizeReactors } from './reactions';
import { supabase } from './supabase';
import type { FeedPost } from './types';

export async function setLike(post: FeedPost, userId: string) {
  if (post.liked_by_me) {
    return supabase.from('post_likes').delete().eq('post_id', post.id).eq('user_id', userId);
  }
  return supabase.from('post_likes').insert({ post_id: post.id, user_id: userId });
}

export async function deletePost(post: FeedPost) {
  await supabase.from('posts').delete().eq('id', post.id);
  if (post.image_path) await supabase.storage.from('posts').remove([post.image_path]);
}

export function normalizeFeed(rows: any[] | null): FeedPost[] {
  return (rows ?? []).map((r) => ({
    ...r,
    like_count: Number(r.like_count ?? 0),
    comment_count: Number(r.comment_count ?? 0),
    meta: r.meta && typeof r.meta === 'object' ? r.meta : {},
    // قبل التفاعل بالإيموجي كان فيه لايك بس (❤️)
    my_reaction: isReaction(r.my_reaction) ? r.my_reaction : r.liked_by_me ? 'love' : null,
    reactors: normalizeReactors(r.reactors),
  }));
}
