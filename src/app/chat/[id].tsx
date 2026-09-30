// محادثة خاصة (مثل الواتساب): فقاعات بذيل، الوقت وعلامات القراءة داخل الفقاعة، وفواصل الأيام.
// ضغطة مطوّلة على رسالة: تعديل (رسالتي خلال ١٥ دقيقة) أو حذف (لدي، أو لدى الجميع خلال يومين).
// ⋮ فوق: عرض الملف أو حذف المحادثة من عندي. مفتوحة بين الأصدقاء (بعد قبول الطلب) أو المدرب ومتدربه —
// لو مقفلة: زر طلب الصداقة (أو قبوله). وفيها صور وفيديو (دقيقة كحد أقصى).
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator, Alert, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BUBBLE_SHADOW, Bubble, DayChip, uiIsRTL, type BubbleStatus } from '@/components/chat/Bubble';
import { ChatBackdrop } from '@/components/chat/ChatBackdrop';
import { ChatSheet, type SheetAction } from '@/components/chat/ChatSheet';
import { VideoViewer } from '@/components/chat/ChatVideo';
import { Avatar, Button, Row, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { dayKey, dayLabel } from '@/lib/chatFormat';
import { acceptRequest, relationTo, sendRequest, type Relation } from '@/lib/friends';
import { useLocalized } from '@/lib/i18n';
import { pickMedia } from '@/lib/images';
import {
  canDeleteForAll, canEditMessage, canMessage, chatMediaUrls, clearChat, deleteMessage, editMessage, loadThread, markRead,
  removeChatMedia, sendMessage, uploadChatMedia, useIncoming, useMessageUpdates, type Message,
} from '@/lib/messages';
import { clearChatNotifications, setOpenChat } from '@/lib/push';
import { errorKey, publicUrl, supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { brand, colors, fonts, space } from '@/theme';

/** رسالة في الشاشة (ممكن تكون لسا تنرسل) */
type UIMessage = Message & { sending?: boolean };
type Pending = { id: string; uri: string; type: 'image' | 'video'; w?: number; h?: number; dur?: number; at: string };
type Sheet = { kind: 'msg' | 'del'; m: UIMessage } | { kind: 'chat' | 'delChat' | 'attach' };

/** حد حجم الملف (حاوية chat) */
const MAX_BYTES = 50 * 1024 * 1024;
/** بعد ما تنقفل قائمة الخيارات (الآيفون ما يفتح شي فوق نافذة وهي تنقفل) */
const AFTER_SHEET = Platform.OS === 'ios' ? 450 : 60;
const later = (fn: () => void) => setTimeout(fn, AFTER_SHEET);
const statusOf = (m: UIMessage): BubbleStatus => (m.sending ? 'sending' : m.read_at ? 'read' : 'sent');

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const other = String(id);
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId } = useUser();
  const headerHeight = useHeaderHeight();
  const uiRTL = uiIsRTL();
  const [p, setP] = useState<Profile | null>(null);
  const [msgs, setMsgs] = useState<UIMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rel, setRel] = useState<{ relation: Relation; id?: string }>({ relation: 'none' });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [relBusy, setRelBusy] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Pending[]>([]);
  const [viewer, setViewer] = useState<string | null>(null);
  const [video, setVideo] = useState<string | null>(null);
  const [sheet, setSheetState] = useState<Sheet | null>(null);
  // قائمة الخيارات تطلع من تحت: نقفل الكيبورد عشان ما يغطيها
  const setSheet = useCallback((x: Sheet | null) => { if (x) Keyboard.dismiss(); setSheetState(x); }, []);
  const [editing, setEditing] = useState<UIMessage | null>(null);
  const [showDown, setShowDown] = useState(false);
  const list = useRef<FlatList<UIMessage>>(null);
  const input = useRef<TextInput>(null);
  /** اللي كان مكتوب قبل ما تبدأ تعدّل رسالة (يرجع بعد التعديل) */
  const draft = useRef('');

  const load = useCallback(async () => {
    try {
      const [prof, th, ok, r] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', other).maybeSingle(), loadThread(userId, other), canMessage(userId, other),
        relationTo(userId, other).catch(() => ({ relation: 'none' as Relation })),
      ]);
      setP((prof.data as Profile) ?? null); setAllowed(ok); setRel(r);
      // اللي لسا تنرسل تبقى بآخر المحادثة
      setMsgs((cur) => [...th, ...cur.filter((x) => x.sending)]);
      // بعد ما تنحفظ القراءة: نشيل إشعارات المحادثة من الجوال ونحدّث رقم الأيقونة
      markRead(userId, other).then(() => clearChatNotifications(other));
    } catch {
      setAllowed((a) => a ?? false);
    } finally {
      setLoaded(true);
    }
  }, [userId, other]);
  useFocusEffect(useCallback(() => {
    setOpenChat(other);
    load();
    return () => setOpenChat(null);
  }, [load, other]));
  useIncoming(userId, useCallback((m: Message) => {
    if (m.sender !== other) return;
    setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m]));
    markRead(userId, other).then(() => clearChatNotifications(other));
  }, [userId, other]));
  // تعديل أو حذف أو قراءة (✓✓) لحظياً
  useMessageUpdates(userId, useCallback((m: Message) => {
    const inThread = (m.sender === other && m.recipient === userId) || (m.sender === userId && m.recipient === other);
    if (!inThread) return;
    setMsgs((x) => (x.some((y) => y.id === m.id) ? x.map((y) => (y.id === m.id ? { ...y, ...m } : y)) : x));
  }, [userId, other]));

  // روابط الصور والفيديو الخاصة (مؤقتة) للي ما عندنا رابطها
  useEffect(() => {
    const missing = [...new Set(msgs.map((m) => m.media_path).filter((x): x is string => !!x && !urls[x]))];
    if (!missing.length) return;
    let alive = true;
    chatMediaUrls(missing).then((u) => { if (alive && Object.keys(u).length) setUrls((cur) => ({ ...cur, ...u })); }).catch(() => {});
    return () => { alive = false; };
  }, [msgs, urls]);

  const name = p ? p.full_name || p.username : '';
  const openProfile = () => router.push({ pathname: '/user/[id]', params: { id: other } });
  // الشريط العلوي: الصورة والاسم (يفتح الملف) و⋮ — ما يتغير مع كل حرف تكتبه
  const headerOptions = useMemo(() => {
    const nm = p ? p.full_name || p.username : '';
    return {
      headerTitle: () => (
        <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: other } })} accessibilityRole="button" accessibilityLabel={t('chat.viewProfile')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 250 }}>
          <Avatar size={36} uri={publicUrl('avatars', p?.avatar_url)} name={nm} />
          <View style={{ flexShrink: 1 }}>
            <T semibold numberOfLines={1} style={{ lineHeight: 22 }}>{nm}</T>
            <T size="xs" muted numberOfLines={1} style={{ fontSize: 11, lineHeight: 15 }}>{t('chat.tapProfile')}</T>
          </View>
        </Pressable>
      ),
      headerRight: () => (
        <Pressable onPress={() => setSheet({ kind: 'chat' })} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('chat.more')}
          style={({ pressed }) => ({ padding: 4, opacity: pressed ? 0.6 : 1 })}>
          <Ionicons name="ellipsis-vertical" size={21} color={colors.text} />
        </Pressable>
      ),
    };
  }, [p, other, t, setSheet]);

  // ---------- الإرسال (يبان على طول بساعة، ويتأكد لما يوصل) ----------
  const send = async () => {
    if (editing) return saveEdit();
    const body = text.trim();
    if (!body || !allowed) return;
    const tmp: UIMessage = {
      id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, sender: userId, recipient: other, body,
      created_at: new Date().toISOString(), read_at: null, sending: true,
    };
    setMsgs((x) => [...x, tmp]); setText('');
    list.current?.scrollToOffset({ offset: 0, animated: true });
    try {
      const m = await sendMessage(userId, other, body);
      // (لو وصلت من تحديث المحادثة قبل الرد: نشيل المؤقتة بس)
      setMsgs((x) => (x.some((y) => y.id === m.id) ? x.filter((y) => y.id !== tmp.id) : x.map((y) => (y.id === tmp.id ? m : y))));
    } catch (e) {
      setMsgs((x) => x.filter((y) => y.id !== tmp.id));
      setText((cur) => cur || body);
      Alert.alert(t(errorKey(e)));
      load();
    }
  };

  const sendMedia = async (source: 'library' | 'camera') => {
    const it = await pickMedia(source);
    if (!it) return;
    if (it.fileSize && it.fileSize > MAX_BYTES) { Alert.alert(t('chat.tooBig')); return; }
    // حد الدقيقة في الكاميرا بس؛ فيديو من الألبوم ممكن يكون أطول
    if (it.type === 'video' && it.duration && it.duration > 61) { Alert.alert(t('chat.tooBig')); return; }
    const tmp: Pending = { id: `tmp-${Date.now()}`, uri: it.uri, type: it.type, w: it.width, h: it.height, dur: it.duration, at: new Date().toISOString() };
    setPending((x) => [...x, tmp]);
    list.current?.scrollToOffset({ offset: 0, animated: true });
    try {
      const path = await uploadChatMedia(userId, other, it.uri, it.mimeType);
      const m = await sendMessage(userId, other, '', { path, type: it.type, width: it.width, height: it.height, duration: it.duration })
        .catch((e) => { removeChatMedia(path); throw e; });
      setUrls((u) => ({ ...u, [path]: it.uri })); // اللي أرسلته يبان من الجوال على طول
      setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m]));
    } catch (e) {
      Alert.alert(t(errorKey(e)));
    } finally {
      setPending((x) => x.filter((y) => y.id !== tmp.id));
    }
  };
  const pickAfterSheet = (source: 'library' | 'camera') => { setSheet(null); later(() => sendMedia(source)); };

  // ---------- تعديل رسالة ----------
  const startEdit = (m: UIMessage) => {
    setSheet(null);
    if (!editing) draft.current = text;
    setEditing(m); setText(m.body);
    later(() => input.current?.focus());
  };
  const cancelEdit = () => { setEditing(null); setText(draft.current); draft.current = ''; };
  const saveEdit = async () => {
    const m = editing;
    const body = text.trim();
    if (!m || !body) return;
    if (body === m.body.trim()) { cancelEdit(); return; }
    setBusy(true);
    try {
      const up = await editMessage(m.id, body);
      setMsgs((x) => x.map((y) => (y.id === up.id ? { ...y, ...up } : y)));
      setEditing(null); setText(draft.current); draft.current = '';
    } catch (e) {
      const k = errorKey(e);
      Alert.alert(t(k));
      if (k === 'srv.edit_window_passed' || k === 'srv.message_deleted') cancelEdit();
    } finally { setBusy(false); }
  };

  // ---------- حذف رسالة (لدي / لدى الجميع) ----------
  const removeMsg = async (m: UIMessage, everyone: boolean) => {
    setSheet(null);
    if (editing?.id === m.id) cancelEdit();
    setMsgs((x) => (everyone
      ? x.map((y) => (y.id === m.id ? { ...y, body: '', media_path: null, media_type: null, media_w: null, media_h: null, media_dur: null, edited_at: null, deleted_at: new Date().toISOString() } : y))
      : x.filter((y) => y.id !== m.id)));
    try {
      await deleteMessage(m.id, everyone);
    } catch (e) {
      later(() => Alert.alert(t(errorKey(e))));
      load();
    }
  };

  // ---------- حذف المحادثة من عندي ----------
  const deleteChat = async () => {
    setSheet(null);
    try {
      await clearChat(other);
      setMsgs([]);
      clearChatNotifications(other);
      if (router.canGoBack()) router.back(); else router.replace('/messages');
    } catch (e) {
      later(() => Alert.alert(t(errorKey(e))));
    }
  };

  const friendAction = async (fn: () => PromiseLike<{ error: any }>, sent?: boolean) => {
    setRelBusy(true);
    const { error } = await fn();
    setRelBusy(false);
    if (error) return Alert.alert(t(errorKey(error)));
    if (sent) Alert.alert(t('chat.requestSent', { name }));
    load();
  };

  // ---------- القائمة (مقلوبة: الأحدث تحت، وتفتح على آخر رسالة) ----------
  const data = useMemo(() => [...msgs].reverse(), [msgs]);
  const openMenu = useCallback((m: Message) => { if (!(m as UIMessage).sending) setSheet({ kind: 'msg', m }); }, [setSheet]);
  const openMedia = useCallback((m: Message) => {
    const u = m.media_path ? urls[m.media_path] : undefined;
    if (!u) return;
    Keyboard.dismiss();
    if (m.media_type === 'video') setVideo(u); else setViewer(u);
  }, [urls]);
  const renderItem = useCallback(({ item: m, index }: { item: UIMessage; index: number }) => {
    const prev = data[index + 1]; // الرسالة اللي قبلها
    const mine = m.sender === userId;
    const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
    const first = newDay || prev.sender !== m.sender;
    return (
      <View>
        {newDay ? <DayChip label={dayLabel(m.created_at, lng, t)} /> : null}
        <Bubble m={m} mine={mine} first={first} lng={lng} uiRTL={uiRTL} status={mine ? statusOf(m) : undefined}
          mediaUri={m.media_path ? urls[m.media_path] : undefined} onLongPress={openMenu} onOpenMedia={openMedia} />
      </View>
    );
  }, [data, userId, lng, t, uiRTL, urls, openMenu, openMedia]);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const far = e.nativeEvent.contentOffset.y > 480;
    setShowDown((s) => (s === far ? s : far));
  }, []);

  // ---------- قائمة الخيارات من تحت ----------
  let sheetView: { title?: string; subtitle?: string; preview?: ReactNode; actions: SheetAction[] } = { actions: [] };
  if (sheet?.kind === 'msg') {
    const m = sheet.m;
    const mine = m.sender === userId;
    sheetView = {
      preview: (
        <Bubble m={m} mine={mine} first lng={lng} uiRTL={uiRTL} status={mine ? statusOf(m) : undefined}
          mediaUri={m.media_path ? urls[m.media_path] : undefined} preview />
      ),
      actions: [
        ...(canEditMessage(m, userId) && m.body.trim() ? [{ key: 'edit', label: t('chat.edit'), icon: 'create-outline' as const, onPress: () => startEdit(m) }] : []),
        { key: 'delete', label: t('chat.delete'), icon: 'trash-outline', destructive: true, onPress: () => setSheet({ kind: 'del', m }) },
      ],
    };
  } else if (sheet?.kind === 'del') {
    const m = sheet.m;
    const all = canDeleteForAll(m, userId);
    sheetView = {
      title: t('chat.deleteMessageQ'),
      subtitle: all ? t('chat.deleteMessagesHint', { name }) : undefined,
      actions: [
        ...(all ? [{ key: 'all', label: t('chat.deleteForAll'), icon: 'trash-bin-outline' as const, destructive: true, onPress: () => removeMsg(m, true) }] : []),
        { key: 'me', label: t('chat.deleteForMe'), icon: 'trash-outline', destructive: true, onPress: () => removeMsg(m, false) },
      ],
    };
  } else if (sheet?.kind === 'chat') {
    sheetView = {
      title: name,
      actions: [
        { key: 'profile', label: t('chat.viewProfile'), icon: 'person-circle-outline', onPress: () => { setSheet(null); later(openProfile); } },
        { key: 'delChat', label: t('chat.deleteChat'), icon: 'trash-outline', destructive: true, onPress: () => setSheet({ kind: 'delChat' }) },
      ],
    };
  } else if (sheet?.kind === 'delChat') {
    sheetView = {
      title: t('chat.deleteChatQ', { name }),
      subtitle: t('chat.deleteChatBody', { name }),
      actions: [{ key: 'confirm', label: t('chat.deleteChat'), icon: 'trash-outline', destructive: true, onPress: deleteChat }],
    };
  } else if (sheet?.kind === 'attach') {
    sheetView = {
      title: t('chat.attachMedia'),
      actions: [
        { key: 'library', label: t('chat.fromLibrary'), icon: 'images-outline', onPress: () => pickAfterSheet('library') },
        { key: 'camera', label: t('chat.fromCamera'), icon: 'camera-outline', onPress: () => pickAfterSheet('camera') },
      ],
    };
  }

  const canSend = !!text.trim() && !!allowed && !busy;
  const empty = loaded && allowed && !msgs.length && !pending.length;

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ChatBackdrop />
      <Stack.Screen options={headerOptions} />
      {/* الإزاحة = ارتفاع الشريط العلوي، عشان خانة الكتابة تطلع فوق الكيبورد بالضبط */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
        <View style={{ flex: 1 }}>
          <FlatList ref={list} data={data} inverted keyExtractor={(m) => m.id} renderItem={renderItem}
            contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onScroll={onScroll}
            scrollEventThrottle={120}
            ListHeaderComponent={pending.length ? (
              <View>
                {pending.map((x, i) => {
                  const last = data[0];
                  const first = i > 0 ? false : !last || last.sender !== userId || dayKey(last.created_at) !== dayKey(x.at);
                  const m: Message = { id: x.id, sender: userId, recipient: other, body: '', created_at: x.at, read_at: null, media_type: x.type, media_w: x.w, media_h: x.h, media_dur: x.dur };
                  return <Bubble key={x.id} m={m} mine first={first} lng={lng} uiRTL={uiRTL} status="sending" mediaUri={x.uri} uploading />;
                })}
              </View>
            ) : null} />

          {!loaded ? (
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : empty ? (
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.xl }]}>
              <Avatar size={72} uri={publicUrl('avatars', p?.avatar_url)} name={name} />
              <View style={{ backgroundColor: colors.bubbleTheirs, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, boxShadow: BUBBLE_SHADOW }}>
                <T size="sm" center>{t('chat.sayHi', { name })}</T>
              </View>
            </View>
          ) : null}

          {showDown ? (
            <Pressable onPress={() => list.current?.scrollToOffset({ offset: 0, animated: true })} accessibilityRole="button" accessibilityLabel={t('chat.toLatest')}
              style={{ position: 'absolute', bottom: 10, end: 12, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bubbleTheirs, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 1px 3px rgba(11,20,26,0.25)' }}>
              <Ionicons name="chevron-down" size={22} color={colors.bubbleMeta} />
            </Pressable>
          ) : null}
        </View>

        {allowed === false ? (
          <View style={{ margin: space.sm, padding: space.lg, gap: space.sm, borderRadius: 14, backgroundColor: colors.bubbleTheirs, boxShadow: BUBBLE_SHADOW }}>
            <Row gap={6}><Ionicons name="lock-closed" size={16} color={colors.muted} /><T size="sm" style={{ flex: 1, lineHeight: 21 }}>{t('chat.locked', { name })}</T></Row>
            {rel.relation === 'none' ? (
              <Button small icon="person-add-outline" title={t('chat.sendFriendRequest')} loading={relBusy} onPress={() => friendAction(() => sendRequest(userId, other), true)} />
            ) : rel.relation === 'incoming' && rel.id ? (
              <Button small icon="checkmark" title={t('chat.acceptRequest')} loading={relBusy} onPress={() => friendAction(() => acceptRequest(rel.id!))} />
            ) : rel.relation === 'outgoing' ? (
              <Row gap={6}><Ionicons name="time-outline" size={15} color={brand.orange} /><T size="xs" muted style={{ flex: 1 }}>{t('chat.pendingOut', { name })}</T></Row>
            ) : null}
          </View>
        ) : (
          <View style={{ paddingHorizontal: 6, paddingTop: 4, paddingBottom: 6 }}>
            {editing ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.bubbleTheirs, borderRadius: 14, marginHorizontal: 2, marginBottom: 6, paddingVertical: 8, paddingHorizontal: 10, boxShadow: BUBBLE_SHADOW }}>
                <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: brand.orange }} />
                <Ionicons name="pencil" size={16} color={brand.orange} />
                <View style={{ flex: 1, gap: 1 }}>
                  <T size="sm" semibold color={brand.orange}>{t('chat.editing')}</T>
                  <T size="xs" muted numberOfLines={1}>{editing.body}</T>
                </View>
                <Pressable onPress={cancelEdit} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('chat.cancel')}>
                  <Ionicons name="close" size={22} color={colors.bubbleMeta} />
                </Pressable>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-end', backgroundColor: colors.bubbleTheirs, borderRadius: 24, paddingHorizontal: 4, boxShadow: BUBBLE_SHADOW }}>
                <TextInput ref={input} value={text} onChangeText={setText} placeholder={t('chat.placeholder')} placeholderTextColor={colors.bubbleMeta}
                  maxLength={1000} multiline editable={allowed !== null}
                  style={{ flex: 1, minWidth: 0, minHeight: 46, maxHeight: 130, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12, color: colors.text, fontFamily: fonts.regular, fontSize: 16, textAlign: 'auto' }} />
                {!editing ? (
                  <Pressable onPress={() => setSheet({ kind: 'attach' })} disabled={!allowed} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('chat.attachMedia')}
                    style={({ pressed }) => ({ width: 40, height: 46, alignItems: 'center', justifyContent: 'center', opacity: !allowed ? 0.4 : pressed ? 0.6 : 1 })}>
                    <Ionicons name="attach" size={25} color={colors.bubbleMeta} />
                  </Pressable>
                ) : null}
                {!editing && !text.trim() ? (
                  <Pressable onPress={() => sendMedia('camera')} disabled={!allowed} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('chat.camera')}
                    style={({ pressed }) => ({ width: 40, height: 46, alignItems: 'center', justifyContent: 'center', opacity: !allowed ? 0.4 : pressed ? 0.6 : 1 })}>
                    <Ionicons name="camera-outline" size={24} color={colors.bubbleMeta} />
                  </Pressable>
                ) : null}
              </View>
              <Pressable onPress={send} disabled={!canSend} accessibilityRole="button" accessibilityLabel={editing ? t('chat.saveEdit') : t('presence.send')}
                style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: !canSend ? 0.5 : pressed ? 0.8 : 1 })}>
                {busy ? <ActivityIndicator color={colors.onPrimary} /> : editing
                  ? <Ionicons name="checkmark" size={25} color={colors.onPrimary} />
                  : <Ionicons name="send" size={19} color={colors.onPrimary} style={{ marginStart: 3, transform: [{ scaleX: uiRTL ? -1 : 1 }] }} />}
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      <ChatSheet visible={!!sheet} onClose={() => setSheet(null)} {...sheetView} />
      <VideoViewer uri={video} onClose={() => setVideo(null)} />

      {/* عرض الصورة كاملة */}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable onPress={() => setViewer(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' }}>
          {viewer ? <Image source={{ uri: viewer }} style={{ width: '100%', height: '80%' }} contentFit="contain" /> : null}
          <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, right: 0, left: 0 }}>
            <Pressable onPress={() => setViewer(null)} hitSlop={12} accessibilityLabel={t('common.close')}
              style={{ alignSelf: 'flex-end', margin: space.lg, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>
          </SafeAreaView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
