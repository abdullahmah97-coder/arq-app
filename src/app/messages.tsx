// صندوق الرسائل (مثل الواتساب): المحادثات بالصورة والاسم ووقت آخر رسالة، وعلامات القراءة وعدد غير المقروء.
// ضغطة مطوّلة على محادثة: عرض الملف أو حذف المحادثة من عندي. وفوق: طلبات الصداقة وأصدقاؤك للبدء بسرعة.
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { uiIsRTL } from '@/components/chat/Bubble';
import { ChatSheet, type SheetAction } from '@/components/chat/ChatSheet';
import { RankBadge } from '@/components/social/RankBadge';
import { Avatar, Button, Row, T, type IconName } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { inboxTime } from '@/lib/chatFormat';
import { useLocalized } from '@/lib/i18n';
import { loadFriends } from '@/lib/friends';
import { clearChat, loadContacts, loadInbox, useIncoming, useMessageUpdates, type Contact, type InboxRow } from '@/lib/messages';
import { clearChatNotifications } from '@/lib/push';
import { errorKey, publicUrl } from '@/lib/supabase';
import { brand, colors, fonts, radius, space } from '@/theme';

type Sheet = { kind: 'row' | 'del'; r: InboxRow };
const AFTER_SHEET = Platform.OS === 'ios' ? 450 : 60;

/** سطر آخر رسالة: ✓/✓✓ لرسالتي، وأيقونة للصورة والفيديو والمحذوفة */
function Preview({ r }: { r: InboxRow }) {
  const { t } = useTranslation();
  const unread = r.unread > 0;
  const c = unread ? colors.text : colors.muted;
  const type = r.last_type ?? (r.last_body === '📷' ? 'image' : r.last_body === '🎥' ? 'video' : 'text');
  const deleted = r.last_deleted ?? r.last_body === '🚫';
  let icon: IconName | null = null;
  let body = r.last_body;
  if (deleted) { icon = 'ban'; body = t(r.last_from_me ? 'chat.deletedMine' : 'chat.deletedTheirs'); }
  else if (type === 'image') { icon = 'camera'; if (r.last_body === '📷') body = t('chat.photoShort'); }
  else if (type === 'video') { icon = 'videocam'; if (r.last_body === '🎥') body = t('chat.videoShort'); }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1, minWidth: 0 }}>
      {r.last_from_me && !deleted ? (
        <Ionicons name={r.last_read ? 'checkmark-done' : 'checkmark'} size={17} color={r.last_read ? colors.readTick : colors.bubbleMeta} />
      ) : null}
      {icon ? <Ionicons name={icon} size={15} color={colors.bubbleMeta} /> : null}
      {/* بعرض النص بس (مو ممتد): يبقى جنب العلامات حتى لو النص إنجليزي والواجهة عربية */}
      <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: unread ? fonts.semibold : fonts.regular, fontSize: 14, lineHeight: 20, color: deleted ? colors.bubbleMeta : c }}>
        {body}
      </Text>
    </View>
  );
}

function InboxItem({ r, lng, onOpen, onMenu }: { r: InboxRow; lng: 'ar' | 'en'; onOpen: (r: InboxRow) => void; onMenu: (r: InboxRow) => void }) {
  const { t } = useTranslation();
  const unread = r.unread > 0;
  const name = r.full_name || r.username;
  return (
    <Pressable onPress={() => onOpen(r)} onLongPress={() => onMenu(r)} delayLongPress={300} accessibilityRole="button"
      accessibilityLabel={unread ? [name, r.unread].join(lng === 'ar' ? '، ' : ', ') : name}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, backgroundColor: pressed ? colors.cardAlt : 'transparent' })}>
      <View style={{ paddingVertical: 10 }}>
        <Avatar size={52} uri={publicUrl('avatars', r.avatar_url)} name={name} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T semibold numberOfLines={1} style={{ flexShrink: 1, lineHeight: 23 }}>{name}</T>
            <RankBadge points={r.points} coach={r.is_coach} small userId={r.other_id} />
          </View>
          <Text style={{ fontSize: 12, lineHeight: 17, fontFamily: unread ? fonts.semibold : fonts.regular, color: unread ? brand.orange : colors.bubbleMeta }}>
            {inboxTime(r.last_at, lng, t)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Preview r={r} />
          {unread ? (
            <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 12, lineHeight: 16, fontFamily: fonts.semibold, color: brand.cream }}>{r.unread > 99 ? '99+' : r.unread}</Text>
            </View>
          ) : !r.can_message ? <Ionicons name="lock-closed" size={14} color={colors.muted} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

export default function Messages() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId } = useUser();
  const [rows, setRows] = useState<InboxRow[] | null>(null);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [requests, setRequests] = useState(0);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const reloadInbox = useCallback(() => { loadInbox().then(setRows).catch(() => {}); }, []);
  const load = useCallback(() => {
    loadInbox().then(setRows).catch(() => setRows([]));
    loadContacts().then(setContacts).catch(() => setContacts([]));
    loadFriends(userId).then((f) => setRequests(f.incoming.length)).catch(() => {});
  }, [userId]);
  useFocusEffect(load);
  // رسالة جديدة، أو تعديل/حذف/قراءة: نحدّث القائمة
  useIncoming(userId, reloadInbox);
  useMessageUpdates(userId, reloadInbox);

  const open = useCallback((r: InboxRow | string) => router.push({ pathname: '/chat/[id]', params: { id: typeof r === 'string' ? r : r.other_id } }), []);
  const menu = useCallback((r: InboxRow) => setSheet({ kind: 'row', r }), []);
  const compose = () => router.push('/chat/new');

  const deleteChat = async (r: InboxRow) => {
    setSheet(null);
    setRows((x) => (x ?? []).filter((y) => y.other_id !== r.other_id));
    try {
      await clearChat(r.other_id);
      clearChatNotifications(r.other_id);
    } catch (e) {
      setTimeout(() => Alert.alert(t(errorKey(e))), AFTER_SHEET);
      reloadInbox();
    }
  };

  // اللي ما بدأت معهم محادثة أول، وبعدهم الباقي
  const started = new Set((rows ?? []).map((r) => r.other_id));
  const quick = [...(contacts ?? [])].sort((a, b) => Number(started.has(a.id)) - Number(started.has(b.id))).slice(0, 20);
  const chevron = uiIsRTL() ? 'chevron-back' : 'chevron-forward';

  let sheetView: { title?: string; subtitle?: string; actions: SheetAction[] } = { actions: [] };
  if (sheet) {
    const r = sheet.r;
    const name = r.full_name || r.username;
    sheetView = sheet.kind === 'row' ? {
      title: name,
      actions: [
        { key: 'open', label: t('chat.openChat'), icon: 'chatbubble-outline', onPress: () => { setSheet(null); setTimeout(() => open(r), AFTER_SHEET); } },
        { key: 'profile', label: t('chat.viewProfile'), icon: 'person-circle-outline', onPress: () => { setSheet(null); setTimeout(() => router.push({ pathname: '/user/[id]', params: { id: r.other_id } }), AFTER_SHEET); } },
        { key: 'delete', label: t('chat.deleteChat'), icon: 'trash-outline', destructive: true, onPress: () => setSheet({ kind: 'del', r }) },
      ],
    } : {
      title: t('chat.deleteChatQ', { name }),
      subtitle: t('chat.deleteChatBody', { name }),
      actions: [{ key: 'confirm', label: t('chat.deleteChat'), icon: 'trash-outline', destructive: true, onPress: () => deleteChat(r) }],
    };
  }

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{
        title: t('chat.title'),
        headerRight: () => (
          <Pressable onPress={compose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('chat.newMessage')}
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="create-outline" size={20} color={brand.cream} />
          </Pressable>
        ),
      }} />
      <FlatList
        data={rows ?? []}
        keyExtractor={(r) => r.other_id}
        contentContainerStyle={{ paddingBottom: space.xxl }}
        renderItem={({ item }) => <InboxItem r={item} lng={lng} onOpen={open} onMenu={menu} />}
        ListHeaderComponent={
          <View style={{ gap: space.md, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xs }}>
            {/* «رسالة جديدة» كبيرة لين تبدأ أول محادثة (بعدها زر الكتابة فوق يكفي) */}
            {rows && !rows.length ? (
              <Pressable onPress={compose} accessibilityRole="button"
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: brand.deepGreen, borderRadius: radius.lg, padding: space.lg, opacity: pressed ? 0.9 : 1 })}>
                <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="chatbubble-ellipses" size={22} color={brand.cream} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T bold color={brand.cream}>{t('chat.newMessage')}</T>
                  <T size="xs" color={brand.sand}>{t('chat.newMessageSub')}</T>
                </View>
                <Ionicons name={chevron} size={18} color={brand.cream} />
              </Pressable>
            ) : null}

            {requests ? (
              <Pressable onPress={() => router.push('/friends')} accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: '#FDEBDD', borderRadius: radius.md, padding: space.md }}>
                <Ionicons name="person-add" size={18} color={brand.orange} />
                <T size="sm" semibold style={{ flex: 1 }}>{t('chat.requestsWaiting', { count: requests })}</T>
                <Ionicons name={chevron} size={16} color={colors.muted} />
              </Pressable>
            ) : null}

            {contacts === null ? null : quick.length ? (
              <View style={{ gap: space.sm }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T size="sm" bold>{t('chat.friendsTitle')}</T>
                  <Pressable onPress={compose} hitSlop={8}><T size="sm" semibold color={colors.primary}>{t('chat.seeAll')}</T></Pressable>
                </Row>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md }}>
                  {quick.map((c) => (
                    <Pressable key={c.id} onPress={() => open(c.id)} accessibilityRole="button" accessibilityLabel={c.full_name || c.username}
                      style={{ alignItems: 'center', gap: 4, width: 66 }}>
                      <View style={{ borderWidth: 2, borderColor: started.has(c.id) ? colors.border : brand.orange, borderRadius: 30, padding: 2 }}>
                        <Avatar size={50} uri={publicUrl('avatars', c.avatar_url)} name={c.full_name ?? c.username} />
                      </View>
                      <T size="xs" numberOfLines={1}>{(c.full_name || c.username).split(' ')[0]}</T>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : (
              <View style={{ gap: space.sm, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, alignItems: 'center' }}>
                <Ionicons name="people-outline" size={28} color={colors.primary} />
                <T bold center>{t('chat.noContactsTitle')}</T>
                <T size="sm" muted center style={{ lineHeight: 21 }}>{t('chat.noContactsBody')}</T>
                <Button small icon="person-add-outline" title={t('chat.addFriends')} onPress={() => router.push('/friends')} />
              </View>
            )}

            {rows?.length ? <T size="sm" bold style={{ marginTop: space.xs }}>{t('chat.conversations')}</T> : null}
          </View>
        }
        ListEmptyComponent={rows && contacts?.length ? (
          <View style={{ alignItems: 'center', gap: 6, paddingVertical: space.xl, paddingHorizontal: space.lg }}>
            <Ionicons name="chatbubbles-outline" size={34} color={colors.muted} />
            <T muted center>{t('chat.emptyWithContacts')}</T>
          </View>
        ) : null}
        ListFooterComponent={
          <Row gap={6} style={{ marginTop: space.lg, paddingHorizontal: space.lg }}>
            <Ionicons name="lock-closed-outline" size={14} color={colors.muted} />
            <T size="xs" muted style={{ flex: 1, lineHeight: 18 }}>{t('chat.ruleLong')}</T>
          </Row>
        }
      />
      <ChatSheet visible={!!sheet} onClose={() => setSheet(null)} {...sheetView} />
    </SafeAreaView>
  );
}
