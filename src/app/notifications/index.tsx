// التنبيهات (الجرس): جديد / سابقاً — كل تنبيه يودّيك للمكان المناسب لما تضغطه
// وتقدر تحذف تنبيه (⋯ أو ضغطة مطوّلة) أو تعلّمه مقروء، ومن فوق: تعليم الكل كمقروء أو حذف الكل
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, IconButton, T } from '@/components/ui';
import { showActions } from '@/lib/actionSheet';
import { useUser } from '@/lib/auth';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { openHref } from '@/lib/nav';
import {
  deleteAllNotifications, deleteNotifications, loadNotifications, markNotificationsRead, notifHref, setUnreadBadge, type NotifKind, type NotifRow,
} from '@/lib/notifications';
import { clearFeedNotifications } from '@/lib/push';
import { RANKS } from '@/lib/ranks';
import { isReaction, REACTION_EMOJI } from '@/lib/reactions';
import { errorKey, publicUrl } from '@/lib/supabase';
import { brand, colors, space } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;
const PAGE = 40;

const KIND_ICON: Record<NotifKind, { icon: IconName; color: string }> = {
  follow: { icon: 'person-add', color: brand.green },
  friend_request: { icon: 'people', color: brand.green },
  friend_accept: { icon: 'people', color: brand.green },
  post_like: { icon: 'heart', color: brand.orange },
  post_comment: { icon: 'chatbubble', color: brand.deepGreen },
  checkin_like: { icon: 'flame', color: brand.orange },
  checkin_comment: { icon: 'chatbubble', color: brand.deepGreen },
  friend_here: { icon: 'location', color: brand.orange },
  challenge_invite: { icon: 'flash', color: brand.amber },
  challenge_win: { icon: 'trophy', color: brand.amber },
  rank_up: { icon: 'arrow-up-circle', color: brand.orange },
  program_adopt: { icon: 'barbell', color: brand.green },
  gym_offer: { icon: 'pricetag', color: brand.orange },
  nudge: { icon: 'flame', color: brand.orange },
  notice: { icon: 'notifications', color: brand.deepGreen },
  promo: { icon: 'pricetag', color: brand.orange },
};

type Item = { type: 'label'; key: string; text: string } | { type: 'row'; key: string; n: NotifRow; fresh: boolean };

export default function Notifications() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId } = useUser();
  const [rows, setRows] = useState<NotifRow[] | null>(null);
  const [unreadIds, setUnreadIds] = useState<Set<number>>(new Set());
  const [more, setMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const busy = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await loadNotifications(undefined, PAGE);
      setRows(r);
      setMore(r.length === PAGE);
      // نخلي «جديد» ظاهر في هذي الزيارة، ونعلّمها مقروءة في الخادم
      setUnreadIds(new Set(r.filter((x) => !x.read_at).map((x) => x.id)));
      if (r.some((x) => !x.read_at)) await markNotificationsRead(r[0].id);
      setUnreadBadge(0);
      void clearFeedNotifications();
    } catch {
      setRows((cur) => cur ?? []);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadOlder = async () => {
    if (!more || busy.current || !rows?.length) return;
    busy.current = true; setLoadingMore(true);
    try {
      const r = await loadNotifications(rows[rows.length - 1].id, PAGE);
      setRows([...rows, ...r]);
      setMore(r.length === PAGE);
    } catch { /* نحاول مرة ثانية لما يوصل لآخر القائمة */ }
    busy.current = false; setLoadingMore(false);
  };

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const dropFresh = (ids: number[]) => setUnreadIds((cur) => {
    const next = new Set(cur);
    ids.forEach((id) => next.delete(id));
    return next;
  });

  /** حذف تنبيه (يختفي على طول، ولو فشل الحذف يرجع) */
  const remove = async (ids: number[]) => {
    const before = rows;
    setRows((cur) => (cur ?? []).filter((x) => !ids.includes(x.id)));
    dropFresh(ids);
    try { await deleteNotifications(ids); } catch (e) { setRows(before); Alert.alert(t(errorKey(e))); }
  };

  const markAllRead = async () => {
    setUnreadIds(new Set());
    setUnreadBadge(0);
    try { await markNotificationsRead(); } catch { /* الصفحة أصلاً تعلّمها مقروءة لما تنفتح */ }
    void clearFeedNotifications();
  };

  const removeAll = () => Alert.alert(t('notif.deleteAllTitle'), t('notif.deleteAllBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    {
      text: t('notif.deleteAll'), style: 'destructive', onPress: async () => {
        if (!userId) return;
        const before = rows;
        setRows([]); setUnreadIds(new Set()); setMore(false);
        try {
          await deleteAllNotifications(userId);
          setUnreadBadge(0);
          void clearFeedNotifications();
        } catch (e) { setRows(before); setMore(true); Alert.alert(t(errorKey(e))); }
      },
    },
  ]);

  const openMenu = () => showActions(undefined, [
    { label: t('notif.markAllRead'), onPress: () => void markAllRead() },
    { label: t('notif.deleteAll'), onPress: removeAll, destructive: true },
  ], t('common.cancel'));

  const itemMenu = (n: NotifRow, fresh: boolean) => showActions(undefined, [
    ...(fresh ? [{ label: t('notif.markRead'), onPress: () => dropFresh([n.id]) }] : []),
    { label: t('notif.delete'), onPress: () => void remove([n.id]), destructive: true },
  ], t('common.cancel'));

  const items: Item[] = [];
  const fresh = (rows ?? []).filter((n) => unreadIds.has(n.id));
  const old = (rows ?? []).filter((n) => !unreadIds.has(n.id));
  if (fresh.length) {
    items.push({ type: 'label', key: 'l-new', text: t('notif.new') });
    fresh.forEach((n) => items.push({ type: 'row', key: `n${n.id}`, n, fresh: true }));
  }
  if (old.length) {
    if (fresh.length) items.push({ type: 'label', key: 'l-old', text: t('notif.earlier') });
    old.forEach((n) => items.push({ type: 'row', key: `n${n.id}`, n, fresh: false }));
  }

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            {rows?.length ? <IconButton icon="ellipsis-horizontal-circle-outline" onPress={openMenu} /> : null}
            <IconButton icon="settings-outline" onPress={() => router.push('/notifications/settings')} />
          </View>
        ),
      }} />
      {rows === null ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.key}
          contentContainerStyle={{ padding: space.lg, gap: space.sm, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.4}
          renderItem={({ item }) => item.type === 'label'
            ? <T size="sm" bold muted style={{ marginTop: space.sm }}>{item.text}</T>
            : <NotifItem n={item.n} fresh={item.fresh} lng={lng} onMore={() => itemMenu(item.n, item.fresh)} />}
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, paddingHorizontal: space.xl }}>
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="notifications-outline" size={34} color={colors.primary} />
              </View>
              <T bold center>{t('notif.empty')}</T>
              <T size="sm" muted center style={{ lineHeight: 22 }}>{t('notif.emptyHint')}</T>
            </View>
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: space.lg }} /> : null}
        />
      )}
    </SafeAreaView>
  );
}

/** نص التنبيه مع اسم الشخص بخط عريض */
function useNotifText() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  return (n: NotifRow): { parts: string[]; name: string } => {
    const name = n.full_name?.trim() || n.username || t('notif.someone');
    if (n.kind === 'nudge' || n.kind === 'notice' || n.kind === 'promo') return { parts: [], name }; // نصه جاهز من الخادم
    const d = n.data ?? {};
    // التفاعل بالإيموجي: «فيصل تفاعل 🔥 مع صباحك ☀️» (التنبيهات القديمة بدون إيموجي تبقى «أعجبه منشورك»)
    const emoji = isReaction(d.emoji) ? REACTION_EMOJI[d.emoji] : '';
    const key = n.kind === 'follow' && d.mutual ? 'notif.followMutual'
      : emoji && n.kind === 'post_like' ? (d.post_kind === 'wake' ? 'notif.post_react_wake' : d.post_kind === 'sleep' ? 'notif.post_react_sleep' : 'notif.post_react')
      : emoji && n.kind === 'checkin_like' ? 'notif.checkin_react'
      : `notif.${n.kind}`;
    const rank = n.kind === 'rank_up' ? RANKS[Number(d.level) || 0]?.name[lng] : undefined;
    const MARK = '\u2063'; // علامة غير مرئية نقسم عندها النص عشان نكتب الاسم بخط عريض
    const s = t(key, { name: MARK, preview: d.preview ?? '', title: d.title ?? '', gym: d.gym ?? '', price: d.price ?? '', points: d.points ?? 50, rank: rank ?? '', emoji });
    return { parts: s.split(MARK), name };
  };
}

function NotifItem({ n, fresh, lng, onMore }: { n: NotifRow; fresh: boolean; lng: 'ar' | 'en'; onMore: () => void }) {
  const { t } = useTranslation();
  const text = useNotifText();
  const { parts, name } = text(n);
  const k = KIND_ICON[n.kind] ?? { icon: 'notifications' as IconName, color: colors.primary };
  const href = notifHref(n);
  const system = !n.actor_id;
  return (
    <Pressable
      onPress={() => { if (href) openHref(href); }}
      onLongPress={onMore}
      delayLongPress={350}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: 16,
        backgroundColor: fresh ? colors.cardAlt : colors.card, borderWidth: 1, borderColor: fresh ? brand.amber : colors.border,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View>
        {system ? (
          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: brand.deepGreen, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={k.icon} size={22} color={brand.amber} />
          </View>
        ) : (
          <Avatar size={46} uri={publicUrl('avatars', n.avatar_url)} name={name} />
        )}
        {!system ? (
          <View style={{ position: 'absolute', bottom: -2, end: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: k.color, borderWidth: 2, borderColor: fresh ? colors.cardAlt : colors.card, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={k.icon} size={11} color={brand.cream} />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        {n.kind === 'nudge' ? (
          // تنبيه تحفيزي: عنوانه ونصه مكتوبين من المالك
          <>
            <T size="sm" bold>{n.data?.title ?? ''}</T>
            <T size="sm" style={{ lineHeight: 22 }}>{n.data?.body ?? ''}</T>
          </>
        ) : n.kind === 'notice' || n.kind === 'promo' ? (
          // تنبيه بنص جاهز بالعربي والإنجليزي (اشتراك، حصة، رد النادي، عرض…)
          <>
            <T size="sm" bold>{(lng === 'en' && n.data?.title_en) || n.data?.title_ar || ''}</T>
            <T size="sm" style={{ lineHeight: 22 }}>{(lng === 'en' && n.data?.body_en) || n.data?.body_ar || ''}</T>
          </>
        ) : (
          <T size="sm" style={{ lineHeight: 22 }}>
            {parts.map((p, i) => (
              <T key={i} size="sm">{p}{i < parts.length - 1 ? <T size="sm" bold>{name}</T> : null}</T>
            ))}
          </T>
        )}
        <T size="xs" muted>{timeAgo(n.created_at, lng)}</T>
      </View>
      {fresh ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} /> : null}
      {/* خيارات التنبيه: مقروء / حذف */}
      <Pressable onPress={onMore} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('notif.options')}
        style={({ pressed }) => ({ padding: 4, opacity: pressed ? 0.5 : 1 })}>
        <Ionicons name="ellipsis-vertical" size={18} color={colors.muted} />
      </Pressable>
    </Pressable>
  );
}
