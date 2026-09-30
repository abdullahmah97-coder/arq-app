// التفاعل بالإيموجي (منطق بحت عشان يتختبر): ❤️ 💪 🔥 😂 👏
export const REACTIONS = ['love', 'strong', 'fire', 'laugh', 'clap'] as const;
export type ReactionKey = (typeof REACTIONS)[number];
export const REACTION_EMOJI: Record<ReactionKey, string> = { love: '❤️', strong: '💪', fire: '🔥', laugh: '😂', clap: '👏' };
export const isReaction = (x: unknown): x is ReactionKey => typeof x === 'string' && (REACTIONS as readonly string[]).includes(x);

/** واحد من آخر اللي تفاعلوا (u = رقمه، n = اسمه، a = صورته، e = الإيموجي) */
export interface Reactor { u: string; n: string; a: string | null; e: ReactionKey }
export interface Reactable { like_count: number; my_reaction: ReactionKey | null; reactors: Reactor[] }
export interface Me { id: string; name: string; avatar: string | null }
export type ReactTarget = { type: 'post' | 'checkin'; id: string };

export function normalizeReactors(v: unknown): Reactor[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((r) => r && typeof r.u === 'string' && isReaction(r.e))
    .map((r) => ({ u: r.u, n: String(r.n ?? ''), a: typeof r.a === 'string' ? r.a : null, e: r.e as ReactionKey }));
}

/** تحديث متفائل: تفاعلي الجديد (null = شلته) — العدد والقائمة وتفاعلي */
export function withReaction<T extends Reactable>(x: T, me: Me, next: ReactionKey | null): T {
  const had = !!x.my_reaction;
  const rest = x.reactors.filter((r) => r.u !== me.id);
  return {
    ...x,
    my_reaction: next,
    like_count: Math.max(0, x.like_count + (next && !had ? 1 : !next && had ? -1 : 0)),
    reactors: next ? [{ u: me.id, n: me.name, a: me.avatar, e: next }, ...rest].slice(0, 6) : rest,
  };
}
