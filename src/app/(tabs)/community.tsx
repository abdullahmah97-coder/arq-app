import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NotificationBell } from '@/components/NotificationBell';
import { ProgramCard, TipCard } from '@/components/social/cards';
import { TimelineHeader } from '@/components/timeline/Header';
import { MomentRow } from '@/components/timeline/Moments';
import { fabBottom, PlusMenu } from '@/components/timeline/PlusMenu';
import { ReactionsSheet } from '@/components/timeline/ReactionsSheet';
import { SleepScreen, WokeToast, type Woke } from '@/components/timeline/SleepScreen';
import { SharingNotice, TimelineSettings } from '@/components/timeline/Timeline';
import { Button, Empty, H, IconButton, ProfileButton, Row, Segmented } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { useLocalized } from '@/lib/i18n';
import { deletePost } from '@/lib/posts';
import { canPublish, RANKS } from '@/lib/ranks';
import { saveReaction, withReaction, type ReactionKey, type ReactTarget } from '@/lib/reactions';
import { deleteTip, likeTip, loadPrograms, loadTips, type Tip, type UserProgram } from '@/lib/social';
import {
  isVisit, itemKey, knownSleep, loadOpenSleep, loadTimeline, onSleepChanged, onTimelineChanged, sameSleep, TIMELINE_PAGE, type OpenSleep, type TimelineItem,
} from '@/lib/timeline';
import type { FeedPost } from '@/lib/types';
import { colors, space, TAB_BAR_SPACE } from '@/theme';

const PAGE = 20;
// دخول النادي و«انتهى التمرين» نفس الزيارة: التفاعل على الحضور
const target = (it: TimelineItem): ReactTarget => ({ type: isVisit(it.item_type) ? 'checkin' : 'post', id: it.id });
const sameTarget = (a: TimelineItem, b: TimelineItem) => a.id === b.id && isVisit(a.item_type) === isVisit(b.item_type);

export default function Community() {
  const { t } = useTranslation();
  const { L } = useLocalized();
  const insets = useSafeAreaInsets();
  const { userId, profile } = useUser();
  const [tab, setTab] = useState<'posts' | 'tips' | 'programs'>('posts');
  // شاشة «صباح الخير» تنفتح لحالها الصبح (tl): نرجع لتبويب التايم لاين
  const { tl } = useLocalSearchParams<{ tl?: string }>();
  const [tlSeen, setTlSeen] = useState(tl);
  if (tl !== tlSeen) {
    setTlSeen(tl);
    setTab('posts');
  }
  const [tips, setTips] = useState<Tip[]>([]);
  const [tipsDone, setTipsDone] = useState(false);
  const [programs, setPrograms] = useState<UserProgram[]>([]);
  // التايم لاين: أنا وأصدقائي (منشورات، صباح الخير ☀️، تصبحون على خير 🌙، والحضور)
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [done, setDone] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sharingOpen, setSharingOpen] = useState(false);
  const [picker, setPicker] = useState<string | null>(null);
  const [reactorsOf, setReactorsOf] = useState<ReactTarget | null>(null);
  // نايم (بعد «تصبحون على خير»)؟ التايم لاين يتقفل بشاشة النوم لين «صباح الخير». undefined = للحين ما نعرف
  const [sleep, setSleep] = useState<OpenSleep | null | undefined>(() => knownSleep(userId));
  const [woke, setWoke] = useState<Woke | null>(null);
  const clearWoke = useCallback(() => setWoke(null), []);
  useEffect(() => onSleepChanged((u, s) => { if (u === userId) setSleep((p) => (sameSleep(p, s) ? p : s)); }), [userId]);

  const load = useCallback(async (before?: string) => {
    if (!before) void loadOpenSleep(userId);
    try {
      const rows = await loadTimeline(before);
      setDone(rows.length < TIMELINE_PAGE);
      setItems((prev) => (before ? [...prev, ...rows.filter((r) => !prev.some((p) => itemKey(p) === itemKey(r)))] : rows));
    } catch (e) {
      if (!before) setItems([]);
      console.warn('timeline', e);
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  const loadT = useCallback(async (before?: string) => {
    const rows = await loadTips(userId, { before, limit: PAGE });
    setTipsDone(rows.length < PAGE);
    setTips((prev) => (before ? [...prev, ...rows] : rows));
  }, [userId]);
  const loadP = useCallback(async () => setPrograms(await loadPrograms({ limit: 40 })), []);
  const loadTab = useCallback(() => (tab === 'posts' ? load() : tab === 'tips' ? loadT() : loadP()), [tab, load, loadT, loadP]);

  useFocusEffect(useCallback(() => { loadTab(); }, [loadTab]));
  // «صباح الخير» أو «تصبحون على خير» انضافت (من زر ＋ أو تلقائياً) → نحدّث
  useEffect(() => onTimelineChanged(() => { load(); }), [load]);

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
    const kind = tab === 'tips' ? 'tip' : 'program';
    if (canPublish(kind, profile)) return router.push(kind === 'tip' ? '/tip/new' : '/program/new');
    const r = RANKS[kind === 'tip' ? 2 : 3];
    Alert.alert(t('social.lockedTitle'), t('social.lockedBody', { rank: L(r.name), n: r.min - profile.points }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('social.ranksTitle'), onPress: () => router.push('/ranks') },
    ]);
  };

  // التفاعل بالإيموجي: تحديث متفائل، ولو فشل نرجع زي ما كان
  const react = useCallback(async (it: TimelineItem, next: ReactionKey | null) => {
    setPicker(null);
    const me = { id: userId, name: profile.full_name || profile.username, avatar: profile.avatar_url ?? null };
    // دخول النادي و«انتهى التمرين» يتحدثون مع بعض
    setItems((xs) => xs.map((x) => (sameTarget(x, it) ? withReaction(x, me, next) : x)));
    const { error } = await saveReaction(target(it), userId, it.my_reaction, next);
    if (error) {
      setItems((xs) => xs.map((x) => (sameTarget(x, it) ? { ...x, like_count: it.like_count, my_reaction: it.my_reaction, reactors: it.reactors } : x)));
      console.warn('reaction', error.message);
    }
  }, [userId, profile.full_name, profile.username, profile.avatar_url]);

  const openReactors = useCallback((it: TimelineItem) => { setPicker(null); setReactorsOf(target(it)); }, []);

  const remove = useCallback((it: TimelineItem) => {
    setPicker(null);
    Alert.alert(t('timeline.deleteMoment'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: async () => {
        await deletePost({ id: it.id, image_path: it.image_path } as FeedPost);
        setItems((xs) => xs.filter((x) => itemKey(x) !== itemKey(it)));
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
        <Segmented value={tab} onChange={(v) => { setPicker(null); setTab(v); }} options={[
          { value: 'posts', label: t('timeline.tab') },
          { value: 'tips', label: t('social.tips') },
          { value: 'programs', label: t('social.programs') },
        ]} />
      </View>
      {tab === 'posts' ? (sleep === undefined ? <View style={{ flex: 1 }} /> : sleep ? (
        <SleepScreen uid={userId} sleep={sleep} onWoke={setWoke} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={itemKey}
          contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + 40 }}
          ListHeaderComponent={
            <View>
              <TimelineHeader items={items} onSettings={() => setSharingOpen(true)} />
              <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
                <SharingNotice onSettings={() => setSharingOpen(true)} />
              </View>
            </View>
          }
          renderItem={({ item, index }) => (
            <MomentRow it={item} mine={item.user_id === userId} pickerOpen={picker === itemKey(item)} last={done && index === items.length - 1}
              onPicker={setPicker} onReact={react} onReactors={openReactors} onLongPress={remove} />
          )}
          ListEmptyComponent={loaded ? (
            <View style={{ gap: space.md, alignItems: 'center', padding: space.lg }}>
              <Empty text={t('timeline.empty')} icon="people-outline" />
              <Button small icon="person-add-outline" title={t('timeline.addFriends')} onPress={() => router.push('/friends')} />
            </View>
          ) : null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
          onScrollBeginDrag={() => setPicker(null)}
          keyboardShouldPersistTaps="handled"
          onEndReachedThreshold={0.5}
          onEndReached={() => { if (!done && items.length) load(items[items.length - 1].at); }}
        />
      )) : tab === 'tips' ? (
        <FlatList
          data={tips}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: TAB_BAR_SPACE + 40 }}
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
          contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: TAB_BAR_SPACE + 40 }}
          renderItem={({ item }) => <ProgramCard p={item} />}
          ListEmptyComponent={<Empty text={t('social.noCommunityPrograms')} icon="barbell-outline" />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        />
      )}
      {tab === 'posts' && woke && sleep === null ? <WokeToast uid={userId} woke={woke} onDone={clearWoke} /> : null}
      {tab === 'posts' ? (sleep === null ? <PlusMenu /> : null) : (
        <View style={{ position: 'absolute', bottom: fabBottom(insets.bottom), end: 16 }}>
          <Pressable
            onPress={compose}
            accessibilityLabel={t(tab === 'tips' ? 'social.newTip' : 'social.newProgram')}
            style={({ pressed }) => ({
              width: 58, height: 58, borderRadius: 29, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
              opacity: pressed ? 0.8 : 1, elevation: 6, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
            })}
          >
            <Ionicons name={tab === 'tips' ? 'bulb' : 'barbell'} size={24} color={colors.onPrimary} />
          </Pressable>
        </View>
      )}
      {sharingOpen ? <TimelineSettings onClose={() => setSharingOpen(false)} /> : null}
      {reactorsOf ? <ReactionsSheet target={reactorsOf} onClose={() => setReactorsOf(null)} /> : null}
    </SafeAreaView>
  );
}
