// صفحة الحساب (لي أو لغيري): الخلفية، الرتبة، المتابعين، البرامج والنصائح والمنشورات
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, I18nManager, Pressable, View } from 'react-native';
import { Num } from '@/components/pulse/widgets';
import { Avatar, Button, Card, Empty, Row, Segmented, T } from '@/components/ui';
import type { CoverId } from '@/lib/cover';
import { useLocalized } from '@/lib/i18n';
import { canPublish, rankProgress, RANKS } from '@/lib/ranks';
import { deleteTip, likeTip, loadPrograms, loadTips, profileCounts, type PublicProfile, type Tip, type UserProgram } from '@/lib/social';
import { pickImage } from '@/lib/images';
import { errorKey, publicUrl, supabase, uploadImage } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';
import { Hideable } from '@/components/owner/Hideable';
import { useIsOwnerId } from '@/lib/appOwner';
import { ProgramCard, TipCard } from './cards';
import { CoachCheck, RankBadge } from './RankBadge';
import { CoverPicker, coverPhotoUrl, ProfileCover } from './Cover';

type Tab = 'programs' | 'tips' | 'posts';
/** المنشورات مثل انستقرام: شبكة الصور اللي نزّلها بالمنشورات بس (بدون لحظات التايم لاين: صباح الخير، تصبحون على خير، الكلام بدون صورة) */
type PostTile = { id: string; image_path: string; caption: string | null; created_at: string };
const POSTS_PAGE = 30;
const GRID_GAP = 3;
const loadPostTiles = async (uid: string, before?: string): Promise<PostTile[]> => {
  let q = supabase.from('posts').select('id, image_path, caption, created_at').eq('user_id', uid).eq('kind', 'post')
    .not('image_path', 'is', null).order('created_at', { ascending: false }).limit(POSTS_PAGE);
  if (before) q = q.lt('created_at', before);
  const { data } = await q;
  return (data ?? []) as PostTile[];
};

export function ProfileView({ p, me, gymLabel, actions, reloadKey = 0, onProfileChanged }: {
  p: PublicProfile; me: string; gymLabel?: string | null; actions?: ReactNode; reloadKey?: number; onProfileChanged?: () => void;
}) {
  const { t } = useTranslation();
  const { L, lng } = useLocalized();
  const self = p.id === me;
  const ownerProfile = useIsOwnerId(p.id) || !!p.is_owner;
  const [tab, setTab] = useState<Tab>('programs');
  const [counts, setCounts] = useState({ posts: 0, programs: 0, tips: 0 });
  const [programs, setPrograms] = useState<UserProgram[] | null>(null);
  const [tips, setTips] = useState<Tip[] | null>(null);
  const [posts, setPosts] = useState<PostTile[] | null>(null);
  const [postsDone, setPostsDone] = useState(false);
  const [morePosts, setMorePosts] = useState(false);
  // ٣ صور بالصف بالضبط (نقيس عرض الشبكة)
  const [gridW, setGridW] = useState(0);
  const tile = gridW ? Math.floor((gridW - GRID_GAP * 2) / 3) : 0;

  const load = useCallback((alive: () => boolean = () => true) => Promise.all([
    profileCounts(p.id),
    loadPrograms({ author: p.id, limit: 20 }),
    loadTips(me, { author: p.id, limit: 30 }),
    loadPostTiles(p.id),
  ]).then(([c, pr, tp, po]) => {
    if (!alive()) return;
    setCounts(c); setPrograms(pr); setTips(tp); setPosts(po); setPostsDone(po.length < POSTS_PAGE);
    // أول تبويب فيه محتوى
    setTab((cur) => (cur === 'programs' && !pr.length ? (tp.length ? 'tips' : po.length ? 'posts' : cur) : cur));
  }, () => {}), [p.id, me]);
  // كل المنشورات: ٣٠ ٣٠ لين تخلص
  const loadMorePosts = async () => {
    const last = posts?.[posts.length - 1];
    if (!last || morePosts) return;
    setMorePosts(true);
    try {
      const rows = await loadPostTiles(p.id, last.created_at);
      setPosts((cur) => [...(cur ?? []), ...rows.filter((r) => !(cur ?? []).some((x) => x.id === r.id))]);
      setPostsDone(rows.length < POSTS_PAGE);
    } finally { setMorePosts(false); }
  };
  useEffect(() => {
    let alive = true;
    load(() => alive);
    return () => { alive = false; };
  }, [load, reloadKey]);

  const prog = rankProgress(p.points);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);
  // تغيير صورة الحساب مباشرة من الصفحة (لحسابي فقط)
  const changeAvatar = () => Alert.alert(t('profile.changePhoto'), '', [
    { text: t('social.fromLibrary'), onPress: () => pickAndUpload('library') },
    { text: t('social.fromCamera'), onPress: () => pickAndUpload('camera') },
    { text: t('common.cancel'), style: 'cancel' },
  ]);
  const pickAndUpload = async (src: 'library' | 'camera') => {
    const img = await pickImage(src, [1, 1]);
    if (!img) return;
    setLocalAvatar(img.uri); setAvatarBusy(true);
    try {
      const path = await uploadImage('avatars', me, img.uri, img.mimeType);
      const { error } = await supabase.from('profiles').update({ avatar_url: path }).eq('id', me);
      if (error) throw error;
      onProfileChanged?.();
    } catch (e) {
      setLocalAvatar(null); Alert.alert(t(errorKey(e)));
    } finally { setAvatarBusy(false); }
  };
  // خلفية الهيدر: لون أو صورة (صاحب الحساب يغيّرها من زر الألوان)
  // اختيار صاحب الحساب يبان فوراً، وبعدها يتحدّث من الخادم
  const [coverLocal, setCoverLocal] = useState<{ cover: CoverId; photoPath: string | null; localUri?: string } | null>(null);
  const cover = coverLocal ?? { cover: p.cover ?? 'auto', photoPath: p.cover_url ?? null };
  const [coverOpen, setCoverOpen] = useState(false);

  const like = async (x: Tip) => {
    setTips((ts) => ts?.map((y) => (y.id === x.id ? { ...y, liked: !y.liked, likes: y.likes + (y.liked ? -1 : 1) } : y)) ?? null);
    const { error } = await likeTip(x, me);
    if (error) load();
  };
  const removeTip = (x: Tip) => Alert.alert(t('social.deleteTip'), '', [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.delete'), style: 'destructive', onPress: async () => { await deleteTip(x.id); load(); } },
  ]);

  return (
    <View style={{ gap: space.lg }}>
      {/* الهيدر */}
      <ProfileCover cover={cover.cover} photo={cover.localUri ?? coverPhotoUrl(cover.photoPath)}
        style={{ borderRadius: radius.lg, overflow: 'hidden', padding: space.xl, alignItems: 'center', gap: space.sm }}>
        {self ? (
          <Pressable onPress={() => setCoverOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('profile.changeCover')}
            style={{ position: 'absolute', top: space.md, end: space.md, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(10,51,45,0.45)',
              borderWidth: 1, borderColor: 'rgba(248,237,218,0.35)', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
            <Ionicons name="color-palette-outline" size={18} color={brand.cream} />
          </Pressable>
        ) : null}
        <Pressable disabled={!self || avatarBusy} onPress={changeAvatar} accessibilityRole={self ? 'button' : undefined} accessibilityLabel={self ? t('profile.changePhoto') : undefined}
          style={{ borderWidth: 3, borderColor: prog.cur.level === 4 ? brand.amber : prog.cur.color, borderRadius: 60, padding: 3 }}>
          <Avatar size={92} uri={localAvatar ?? publicUrl('avatars', p.avatar_url)} name={p.full_name ?? p.username} />
          {self ? (
            <View style={{ position: 'absolute', bottom: 0, end: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: brand.orange, borderWidth: 2, borderColor: brand.cream, alignItems: 'center', justifyContent: 'center' }}>
              {avatarBusy ? <ActivityIndicator size="small" color={brand.cream} /> : <Ionicons name="camera" size={15} color={brand.cream} />}
            </View>
          ) : null}
        </Pressable>
        <Row gap={6}>
          <T size="xl" bold color={brand.cream}>{p.full_name || p.username}</T>
          {p.is_coach ? <CoachCheck size={20} /> : null}
        </Row>
        <T color={brand.sand}>@{p.username}{gymLabel ? ` · 📍 ${gymLabel}` : ''}</T>
        <RankBadge points={p.points} onDark userId={p.id} owner={p.is_owner} />
        {p.is_coach ? <T size="xs" color={brand.amber}>{t('social.verifiedCoach')}</T> : null}
        {p.bio ? <T center color={brand.cream} style={{ lineHeight: 24 }}>{p.bio}</T> : null}

        <View style={{ flexDirection: 'row', alignSelf: 'stretch', marginTop: space.md, backgroundColor: 'rgba(10,51,45,0.35)', borderRadius: 16, paddingVertical: space.md }}>
          <Count n={p.followers_count} label={t('social.followers')} onPress={() => router.push({ pathname: '/follows/[id]', params: { id: p.id, kind: 'followers' } })} />
          <Count n={p.following_count} label={t('social.following')} onPress={() => router.push({ pathname: '/follows/[id]', params: { id: p.id, kind: 'following' } })} />
          <Count n={p.points} label={t('social.points')} onPress={() => router.push('/ranks')} />
          <Count n={p.streak} label={t('home.streak')} icon="flame" />
        </View>
      </ProfileCover>
      {self ? (
        <CoverPicker visible={coverOpen} me={me} cover={cover.cover} photoPath={cover.photoPath} onClose={() => setCoverOpen(false)}
          onChanged={(next) => { setCoverLocal(next); if (!next.localUri) onProfileChanged?.(); }} />
      ) : null}

      {actions}

      {/* تقدم الرتبة (المالك ما عنده رتبة: شارته «المالك») */}
      {ownerProfile ? null : (
      <Hideable id="profile.rank" label={t('social.ranksTitle')}>
      <Card onPress={() => router.push('/ranks')} style={{ gap: space.sm }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={6}>
            <Ionicons name={prog.cur.icon} size={18} color={prog.cur.level === 4 ? brand.amber : prog.cur.color} />
            <T bold>{L(prog.cur.name)}</T>
            {prog.next ? <T size="sm" muted>{lng === 'ar' ? '←' : '→'} {L(prog.next.name)}</T> : null}
          </Row>
          <Row gap={2}>
            <T size="xs" semibold color={colors.primary}>{t('social.howToRank')}</T>
            <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={14} color={colors.primary} />
          </Row>
        </Row>
        <RankTrack points={p.points} />
        <T size="xs" muted>
          {prog.next ? t(self ? 'social.toNextSelf' : 'social.toNext', { n: prog.remaining, rank: L(prog.next.name) }) : t('social.maxRank')}
        </T>
      </Card>
      </Hideable>
      )}

      {self ? <Hideable id="profile.publish" label={`${t('social.newTip')} · ${t('social.newProgram')}`}><PublishRow p={p} /></Hideable> : null}

      <Hideable id="profile.content" label={`${t('social.programs')} · ${t('social.tips')} · ${t('social.posts')}`} style={{ gap: space.lg }}>
      <Segmented<Tab> value={tab} onChange={setTab} options={[
        { value: 'programs', label: `${t('social.programs')} ${counts.programs || ''}`.trim() },
        { value: 'tips', label: `${t('social.tips')} ${counts.tips || ''}`.trim() },
        { value: 'posts', label: `${t('social.posts')} ${counts.posts || ''}`.trim() },
      ]} />

      {tab === 'programs' ? (
        programs?.length ? programs.map((x) => <ProgramCard key={x.id} p={x} hideAuthor />)
          : <Empty icon="barbell-outline" text={self ? (canPublish('program', p) ? t('social.noProgramsSelf') : t('social.programsLocked', { rank: L(RANKS[3].name) })) : t('social.noPrograms')} />
      ) : null}
      {tab === 'tips' ? (
        tips?.length ? tips.map((x) => <TipCard key={x.id} tip={x} hideAuthor mine={self} onLike={like} onDelete={removeTip} />)
          : <Empty icon="bulb-outline" text={self ? (canPublish('tip', p) ? t('social.noTipsSelf') : t('social.tipsLocked', { rank: L(RANKS[2].name) })) : t('social.noTips')} />
      ) : null}
      {/* شبكة الصور مثل انستقرام (٣ بالصف)، كلها: ٣٠ ٣٠ مع «عرض منشورات أقدم» */}
      {tab === 'posts' ? (
        posts?.length ? (
          <View style={{ gap: space.md }}>
            <View onLayout={(e) => setGridW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, marginHorizontal: -space.sm }}>
              {posts.map((x) => (
                <Pressable key={x.id} onPress={() => router.push({ pathname: '/post/[id]', params: { id: x.id } })}
                  accessibilityRole="imagebutton" accessibilityLabel={x.caption || t('social.posts')}
                  style={({ pressed }) => ({ width: tile, height: tile, overflow: 'hidden', backgroundColor: colors.cardAlt, opacity: pressed ? 0.85 : 1 })}>
                  <Image source={{ uri: publicUrl('posts', x.image_path) ?? undefined }} style={{ flex: 1 }} contentFit="cover" transition={120} />
                </Pressable>
              ))}
            </View>
            {!postsDone ? <Button variant="secondary" small icon="chevron-down" title={t('social.morePosts')} loading={morePosts} onPress={loadMorePosts} /> : null}
          </View>
        ) : posts ? <Empty icon="images-outline" text={t('social.noPosts')} /> : null
      ) : null}
      </Hideable>
    </View>
  );
}

function Count({ n, label, onPress, icon }: { n: number; label: string; onPress?: () => void; icon?: 'flame' }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flex: 1, alignItems: 'center', gap: 2 }} accessibilityRole={onPress ? 'button' : undefined}>
      <Row gap={2}>
        {icon ? <Ionicons name={icon} size={16} color={brand.amber} /> : null}
        <Num size={24} color={brand.cream}>{fmtCount(n)}</Num>
      </Row>
      <T size="xs" color={brand.sand}>{label}</T>
    </Pressable>
  );
}

export const fmtCount = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}K` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K` : String(n));

/** شريط الرتب الخمس مع موقع المستخدم */
export function RankTrack({ points }: { points: number }) {
  const { cur, pct } = rankProgress(points);
  return (
    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
      {RANKS.map((r) => {
        const fill = r.level < cur.level ? 1 : r.level === cur.level ? (cur.level === 4 ? 1 : pct) : 0;
        return (
          <View key={r.id} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.cardAlt, overflow: 'hidden' }}>
            <View style={{ width: `${Math.max(fill > 0 ? 6 : 0, fill * 100)}%`, height: '100%', backgroundColor: r.level === cur.level ? brand.orange : brand.amber, borderRadius: 4 }} />
          </View>
        );
      })}
    </View>
  );
}

function PublishRow({ p }: { p: PublicProfile }) {
  const { t } = useTranslation();
  const { L } = useLocalized();
  const tip = canPublish('tip', p);
  const program = canPublish('program', p);
  const locked = (rank: number) => Alert.alert(t('social.lockedTitle'), t('social.lockedBody', { rank: L(RANKS[rank].name), n: RANKS[rank].min - p.points }));
  return (
    <Row gap={space.md}>
      <PubButton icon="bulb-outline" label={t('social.newTip')} locked={!tip} onPress={() => (tip ? router.push('/tip/new') : locked(2))} />
      <PubButton icon="barbell-outline" label={t('social.newProgram')} locked={!program} onPress={() => (program ? router.push('/program/new') : locked(3))} />
    </Row>
  );
}

function PubButton({ icon, label, locked, onPress }: { icon: 'bulb-outline' | 'barbell-outline'; label: string; locked: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, borderRadius: radius.md,
      backgroundColor: locked ? colors.cardAlt : brand.orange, opacity: pressed ? 0.8 : 1, borderWidth: 1, borderColor: locked ? colors.border : brand.orange,
    })}>
      <Ionicons name={locked ? 'lock-closed' : icon} size={18} color={locked ? colors.muted : brand.cream} />
      <T semibold color={locked ? colors.muted : brand.cream}>{label}</T>
    </Pressable>
  );
}
