// الحساب الاجتماعي: المتابعة، برامج المستخدمين، والنصائح
import type { Program } from '../content/programs';
import { getExercise } from '../three/catalog';
import type { UserProgramDay } from './ranks';
import { supabase } from './supabase';
import type { Profile } from './types';

export type PublicProfile = Profile;
export type Author = Pick<PublicProfile, 'id' | 'username' | 'full_name' | 'avatar_url' | 'points' | 'is_coach'>;
const AUTHOR = 'author_p:profiles!user_programs_author_fkey(id, username, full_name, avatar_url, points, is_coach)';
const TIP_AUTHOR = 'author_p:profiles!tips_author_fkey(id, username, full_name, avatar_url, points, is_coach)';

// ---------- المتابعة ----------
export async function isFollowing(me: string, other: string) {
  const { count } = await supabase.from('follows').select('follower', { count: 'exact', head: true }).eq('follower', me).eq('followee', other);
  return (count ?? 0) > 0;
}
export const follow = (me: string, other: string) => supabase.from('follows').insert({ follower: me, followee: other });
export const unfollow = (me: string, other: string) => supabase.from('follows').delete().eq('follower', me).eq('followee', other);

export async function loadFollows(userId: string, kind: 'followers' | 'following'): Promise<Author[]> {
  const col = kind === 'followers' ? 'followee' : 'follower';
  const rel = kind === 'followers' ? 'p:profiles!follows_follower_fkey' : 'p:profiles!follows_followee_fkey';
  const { data } = await supabase.from('follows').select(`created_at, ${rel}(id, username, full_name, avatar_url, points, is_coach)`)
    .eq(col, userId).order('created_at', { ascending: false }).limit(200);
  return ((data ?? []) as any[]).map((r) => r.p).filter(Boolean);
}

// ---------- البرامج ----------
export interface UserProgram {
  id: string;
  author: string;
  title: string;
  description: string | null;
  level: 'beginner' | 'intermediate' | 'advanced';
  goal: string | null;
  days: UserProgramDay[];
  created_at: string;
  adopts: number;
  author_p?: Author;
}

const PROG_SEL = `id, author, title, description, level, goal, days, created_at, program_adopts(count), ${AUTHOR}`;
const toProgram = (r: any): UserProgram => ({ ...r, adopts: r.program_adopts?.[0]?.count ?? 0 });

export async function loadPrograms(opts: { author?: string; limit?: number } = {}): Promise<UserProgram[]> {
  let q = supabase.from('user_programs').select(PROG_SEL).order('created_at', { ascending: false }).limit(opts.limit ?? 30);
  if (opts.author) q = q.eq('author', opts.author);
  const { data } = await q;
  return (data ?? []).map(toProgram);
}

export async function loadProgram(id: string): Promise<UserProgram | null> {
  const { data } = await supabase.from('user_programs').select(PROG_SEL).eq('id', id).maybeSingle();
  return data ? toProgram(data) : null;
}

export async function publishProgram(userId: string, p: Pick<UserProgram, 'title' | 'description' | 'level' | 'days'>) {
  const { data, error } = await supabase.from('user_programs')
    .insert({ author: userId, title: p.title.trim(), description: p.description?.trim() || null, level: p.level, days: p.days })
    .select('id').single();
  if (error) throw error;
  return data.id as string;
}

export const deleteProgram = (id: string) => supabase.from('user_programs').delete().eq('id', id);
export const adoptProgramRpc = (id: string) => supabase.rpc('adopt_program', { p_program: id });

/** يحوّل برنامج المستخدم لنفس شكل البرامج الجاهزة حتى نستخدم applyProgram */
export function toProgramShape(p: UserProgram): Program {
  const n = p.days.length;
  const SCHEDULES: Record<number, number[]> = { 1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6] };
  const txt = (s: string) => ({ ar: s, en: s });
  return {
    id: `user:${p.id}`,
    name: txt(p.title),
    summary: txt(p.description ?? ''),
    level: p.level,
    audience: 'all',
    daysPerWeek: n,
    schedule: SCHEDULES[n] ?? [0],
    credit: p.author_p ? `@${p.author_p.username}` : undefined,
    days: p.days.map((d) => ({
      title: txt(d.title),
      exercises: (d.exercises ?? []).map((e) => ({
        exercise_id: e.exercise_id,
        original: getExercise(e.exercise_id)?.name.en ?? e.exercise_id,
        target: txt(''),
        sets: e.sets,
        reps: e.reps,
        rest: [e.rest_sec / 60, e.rest_sec / 60] as [number, number],
        rir: e.rir ?? '',
      })),
    })),
  };
}

// ---------- النصائح ----------
export type TipTag = 'training' | 'nutrition' | 'recovery' | 'mindset';
export const TIP_TAGS: TipTag[] = ['training', 'nutrition', 'recovery', 'mindset'];

export interface Tip {
  id: string;
  author: string;
  body: string;
  tag: TipTag;
  created_at: string;
  likes: number;
  liked: boolean;
  author_p?: Author;
}

export async function loadTips(me: string, opts: { author?: string; limit?: number; before?: string } = {}): Promise<Tip[]> {
  let q = supabase.from('tips').select(`id, author, body, tag, created_at, tip_likes(user_id), ${TIP_AUTHOR}`)
    .order('created_at', { ascending: false }).limit(opts.limit ?? 30);
  if (opts.author) q = q.eq('author', opts.author);
  if (opts.before) q = q.lt('created_at', opts.before);
  const { data } = await q;
  return ((data ?? []) as any[]).map((r) => ({
    ...r, likes: r.tip_likes?.length ?? 0, liked: (r.tip_likes ?? []).some((l: any) => l.user_id === me),
  }));
}

export async function publishTip(userId: string, body: string, tag: TipTag) {
  const { error } = await supabase.from('tips').insert({ author: userId, body: body.trim(), tag });
  if (error) throw error;
}

export const likeTip = (tip: Tip, me: string) => tip.liked
  ? supabase.from('tip_likes').delete().eq('tip_id', tip.id).eq('user_id', me)
  : supabase.from('tip_likes').insert({ tip_id: tip.id, user_id: me });

export const deleteTip = (id: string) => supabase.from('tips').delete().eq('id', id);

/** عدّاد المنشورات والبرامج والنصائح لصفحة الحساب */
export async function profileCounts(userId: string) {
  const c = async (table: string, col: string) =>
    (await supabase.from(table).select('id', { count: 'exact', head: true }).eq(col, userId)).count ?? 0;
  const [posts, programs, tips] = await Promise.all([c('posts', 'user_id'), c('user_programs', 'author'), c('tips', 'author')]);
  return { posts, programs, tips };
}
