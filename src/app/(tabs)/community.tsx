import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NotificationBell } from '@/components/NotificationBell';
import { PostCard } from '@/components/PostCard';
import { ProgramCard, TipCard } from '@/components/social/cards';
import { CheckinItemCard, SharingNotice, TimelineComposer, TimelineSettings } from '@/components/timeline/Timeline';
import { Button, Empty, H, IconButton, ProfileButton, Row, Segmented } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { useLocalized } from '@/lib/i18n';
import { deletePost } from '@/lib/posts';
import { canPublish, RANKS } from '@/lib/ranks';
import { deleteTip, likeTip, loadPrograms, loadTips, type Tip, type UserProgram } from '@/lib/social';
import { asFeedPost, loadTimeline, setTimelineLike, TIMELINE_PAGE, toggledLike, type TimelineItem } from '@/lib/timeline';
import type { FeedPost } from '@/lib/types';
import { colors, space, TAB_BAR_SPACE } from '@/theme';

const PAGE = 20;

export default function Community() {
  const { t } = useTranslation();
  const { L } = useLocalized();
  const { userId, profile } = useUser();
  const [tab, setTab] = useState<'posts' | 'tips' | 'programs'>('posts');
  const [tips, setTips] = useState<Tip[]>([]);
  const [tipsDone, setTipsDone] = useState(false);
  const [programs, setPrograms] = useState<UserProgram[]>([]);
  // التايم لاين: أنا وأصدقائي (منشورات، «صحى ☀️»، والحضور)
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [done, setDone] = useState(false);
  const [sharingOpen, setSharingOpen] = useState(false);

  const load = useCallback(async (before?: string) => {
    try {
      const rows = await loadTimeline(before);
      setDone(rows.length < TIMELINE_PAGE);
      setItems((prev) => (before ? [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))] : rows));
    } catch (e) {
      if (!before) setItems([]);
      console.warn('timeline', e);
    }
  }, []);

  const loadT = useCallback(async (before?: string) => {
    const rows = await loadTips(userId, { before, limit: PAGE });
    setTipsDone(rows.length < PAGE);
    setTips((prev) => (before ? [...prev, ...rows] : rows));
  }, [userId]);
  const loadP = useCallback(async () => setPrograms(await loadPrograms({ limit: 40 })), []);
  const loadTab = useCallback(() => (tab === 'posts' ? load() : tab === 'tips' ? loadT() : loadP()), [tab, load, loadT, loadP]);

  useFocusEffect(useCallback(() => { loadTab(); }, [loadTab]));

  const refresh = async () => { setRefreshing(true); await loadTab(); setRefreshing(false); };

  const likeT = useCallback(async (x: Tip) => {
    setTips((ts) => ts.map((y) => (y.id === x.id ? { ...y, liked: !y.liked, likes: y.likes + (y.liked ? -1 : 1) } : y)));
    const { error } = await likeTip(x, userId);
    if (error) setTips((ts) => ts.map((y) => (y.id === x.id ? x : y)));
  }, [userId]);
  const removeT = useCallback((x: Tip) => Alert.alert(t('social.deleteTip'), '', [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.delete'), style: 'destructive', onPress: async () => { await deleteTip(x.id); setTips((ts) => ts.filter((y) => y.id !== x.id)); } },
  ]), [t]);

  const compose = () => {
    if (tab === 'posts') return router.push('/post/new');
    const kind = tab === 'tips' ? 'tip' : 'program';
    if (canPublish(kind, profile)) return router.push(kind === 'tip' ? '/tip/new' : '/program/new');
    const r = RANKS[kind === 'tip' ? 2 : 3];
    Alert.alert(t('social.lockedTitle'), t('social.lockedBody', { rank: L(r.name), n: r.min - profile.points }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('social.ranksTitle'), onPress: () => router.push('/ranks') },
    ]);
  };

  const like = useCallback(async (it: TimelineItem) => {
    setItems((xs) => xs.map((x) => (x.id === it.id ? toggledLike(x) : x)));
    const { error } = await setTimelineLike(it, userId);
    if (error) setItems((xs) => xs.map((x) => (x.id === it.id ? it : x)));
  }, [userId]);

  const remove = useCallback((p: FeedPost) => {
    Alert.alert(t('feed.deletePost'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: async () => {
        await deletePost(p);
        setItems((xs) => xs.filter((x) => x.id !== p.id));
      } },
    ]);
  }, [t]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.sm }}>
        <H>{t('feed.title')}</H>
        <Row gap={space.md}>
          <NotificationBell />
          <IconButton icon="chatbubbles-outline" onPress={() => router.push('/messages')} />
          <IconButton icon="person-add-outline" onPress={() => router.push('/friends')} />
          <ProfileButton />
        </Row>
      </Row>
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'posts', label: t('timeline.tab') },
          { value: 'tips', label: t('social.tips') },
          { value: 'programs', label: t('social.programs') },
        ]} />
      </View>
      {tab === 'posts' ? (
        <FlatList
          data={items}
          keyExtractor={(x) => `${x.item_type}:${x.id}`}
          contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: TAB_BAR_SPACE }}
          ListHeaderComponent={
            <View style={{ gap: space.md }}>
              <TimelineComposer onSettings={() => setSharingOpen(true)} />
              <SharingNotice onSettings={() => setSharingOpen(true)} />
            </View>
          }
          renderItem={({ item }) => item.item_type === 'checkin'
            ? <CheckinItemCard it={item} onLike={like} />
            : <PostCard post={asFeedPost(item)} onLike={() => like(item)} onDelete={remove} isMine={item.user_id === userId} verified={item.is_coach} />}
          ListEmptyComponent={
            <View style={{ gap: space.md, alignItems: 'center' }}>
              <Empty text={t('timeline.empty')} icon="people-outline" />
              <Button small icon="person-add-outline" title={t('timeline.addFriends')} onPress={() => router.push('/friends')} />
            </View>
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => { if (!done && items.length) load(items[items.length - 1].at); }}
        />
      ) : tab === 'tips' ? (
        <FlatList
          data={tips}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: TAB_BAR_SPACE }}
          renderItem={({ item }) => <TipCard tip={item} mine={item.author === userId} onLike={likeT} onDelete={removeT} />}
          ListEmptyComponent={<Empty text={t('social.noTipsYet')} icon="bulb-outline" />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => { if (!tipsDone && tips.length) loadT(tips[tips.length - 1].created_at); }}
        />
      ) : (
        <FlatList
          data={programs}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: TAB_BAR_SPACE }}
          renderItem={({ item }) => <ProgramCard p={item} />}
          ListEmptyComponent={<Empty text={t('social.noCommunityPrograms')} icon="barbell-outline" />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        />
      )}
      <View style={{ position: 'absolute', bottom: space.xl, end: space.xl }}>
        <Pressable
          onPress={compose}
          accessibilityLabel={t(tab === 'posts' ? 'feed.newPost' : tab === 'tips' ? 'social.newTip' : 'social.newProgram')}
          style={({ pressed }) => ({
            width: 58, height: 58, borderRadius: 29, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
            opacity: pressed ? 0.8 : 1, elevation: 6, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
          })}
        >
          <Ionicons name={tab === 'posts' ? 'add' : tab === 'tips' ? 'bulb' : 'barbell'} size={tab === 'posts' ? 30 : 24} color={colors.onPrimary} />
        </Pressable>
      </View>
      {sharingOpen ? <TimelineSettings onClose={() => setSharingOpen(false)} /> : null}
    </SafeAreaView>
  );
}
