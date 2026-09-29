// محادثة خاصة: مفتوحة بين الأصدقاء (بعد قبول طلب الصداقة) أو المدرب ومتدربه — المتابعة ما تفتحها.
// لو مقفلة: زر طلب الصداقة (أو قبوله) بدل ما يعلق المستخدم. وفيها إرسال صور وفيديو (دقيقة كحد أقصى).
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VideoBubble, VideoViewer } from '@/components/chat/ChatVideo';
import { Avatar, Button, Row, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { acceptRequest, relationTo, sendRequest, type Relation } from '@/lib/friends';
import { useLocalized } from '@/lib/i18n';
import { pickMedia } from '@/lib/images';
import { canMessage, chatMediaUrls, loadThread, markRead, sendMessage, uploadChatMedia, useIncoming, type Message } from '@/lib/messages';
import { clearChatNotifications, setOpenChat } from '@/lib/push';
import { errorKey, publicUrl, supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { brand, colors, fonts, radius, space } from '@/theme';

/** يوم الرسالة بتوقيت الجوال (للفواصل بين الأيام) */
const dayKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

/** مقاس الصورة في الفقاعة: عرض ثابت والارتفاع حسب نسبة الصورة (بحدود) */
function photoSize(w?: number | null, h?: number | null) {
  const W = 230;
  const ratio = w && h ? h / w : 1.25;
  return { width: W, height: Math.round(Math.min(320, Math.max(150, W * ratio))) };
}

type Pending = { id: string; uri: string; type: 'image' | 'video'; w?: number; h?: number; dur?: number };

/** حد حجم الملف (حاوية chat) */
const MAX_BYTES = 50 * 1024 * 1024;

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const other = String(id);
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId } = useUser();
  const headerHeight = useHeaderHeight();
  const [p, setP] = useState<Profile | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rel, setRel] = useState<{ relation: Relation; id?: string }>({ relation: 'none' });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [relBusy, setRelBusy] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Pending[]>([]);
  const [viewer, setViewer] = useState<string | null>(null);
  const [video, setVideo] = useState<string | null>(null);
  const list = useRef<FlatList<Message>>(null);

  const load = useCallback(async () => {
    try {
      const [prof, th, ok, r] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', other).maybeSingle(), loadThread(userId, other), canMessage(userId, other),
        relationTo(userId, other).catch(() => ({ relation: 'none' as Relation })),
      ]);
      setP((prof.data as Profile) ?? null); setMsgs(th); setAllowed(ok); setRel(r);
      // بعد ما تنحفظ القراءة: نشيل إشعارات المحادثة من الجوال ونحدّث رقم الأيقونة
      markRead(userId, other).then(() => clearChatNotifications(other));
    } catch {
      setAllowed((a) => a ?? false);
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

  // روابط الصور والفيديو الخاصة (مؤقتة) للي ما عندنا رابطها
  useEffect(() => {
    const missing = [...new Set(msgs.map((m) => m.media_path).filter((x): x is string => !!x && !urls[x]))];
    if (!missing.length) return;
    let alive = true;
    chatMediaUrls(missing).then((u) => { if (alive && Object.keys(u).length) setUrls((cur) => ({ ...cur, ...u })); }).catch(() => {});
    return () => { alive = false; };
  }, [msgs, urls]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      const m = await sendMessage(userId, other, body);
      setMsgs((x) => [...x, m]); setText('');
    } catch (e) {
      Alert.alert(t(errorKey(e)));
      load();
    } finally { setBusy(false); }
  };

  const sendMedia = async (source: 'library' | 'camera') => {
    const it = await pickMedia(source);
    if (!it) return;
    if (it.fileSize && it.fileSize > MAX_BYTES) { Alert.alert(t('chat.tooBig')); return; }
    const tmp: Pending = { id: `tmp-${Date.now()}`, uri: it.uri, type: it.type, w: it.width, h: it.height, dur: it.duration };
    setPending((x) => [...x, tmp]);
    try {
      const path = await uploadChatMedia(userId, other, it.uri, it.mimeType);
      const m = await sendMessage(userId, other, '', { path, type: it.type, width: it.width, height: it.height, duration: it.duration });
      setUrls((u) => ({ ...u, [path]: it.uri })); // اللي أرسلته يبان من الجوال على طول
      setMsgs((x) => [...x, m]);
    } catch (e) {
      Alert.alert(t(errorKey(e)));
    } finally {
      setPending((x) => x.filter((y) => y.id !== tmp.id));
    }
  };
  const attach = () => Alert.alert(t('chat.attachMedia'), undefined, [
    { text: t('chat.fromLibrary'), onPress: () => sendMedia('library') },
    { text: t('chat.fromCamera'), onPress: () => sendMedia('camera') },
    { text: t('common.cancel'), style: 'cancel' },
  ]);

  const friendAction = async (fn: () => PromiseLike<{ error: any }>, sent?: boolean) => {
    setRelBusy(true);
    const { error } = await fn();
    setRelBusy(false);
    if (error) return Alert.alert(t(errorKey(error)));
    if (sent) Alert.alert(t('chat.requestSent', { name }));
    load();
  };

  const name = p ? p.full_name || p.username : '';
  const time = (iso: string) => {
    try { return new Date(iso).toLocaleTimeString(lng === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { hour: 'numeric', minute: '2-digit' }); }
    catch { return iso.slice(11, 16); }
  };
  const dayLabel = (iso: string) => {
    const today = new Date(); const y = new Date(); y.setDate(y.getDate() - 1);
    const k = dayKey(iso);
    if (k === dayKey(today.toISOString())) return t('chat.today');
    if (k === dayKey(y.toISOString())) return t('chat.yesterday');
    try { return new Date(iso).toLocaleDateString(lng === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US', { day: 'numeric', month: 'long' }); }
    catch { return iso.slice(0, 10); }
  };
  const toEnd = () => list.current?.scrollToEnd({ animated: false });

  const photo = (uri: string | undefined, w?: number | null, h?: number | null, uploading?: boolean) => {
    const size = photoSize(w, h);
    return (
      <Pressable onPress={() => uri && !uploading && setViewer(uri)} accessibilityRole="imagebutton" accessibilityLabel={t('chat.photo')}
        style={{ borderRadius: 18, overflow: 'hidden', backgroundColor: colors.cardAlt, ...size }}>
        {uri ? <Image source={{ uri }} style={size} contentFit="cover" transition={150} /> : null}
        {uploading || !uri ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: uploading ? 'rgba(10,51,45,0.35)' : 'transparent' }}>
            <ActivityIndicator color={uploading ? brand.cream : colors.muted} />
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerTitle: () => (
        <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: other } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Avatar size={30} uri={publicUrl('avatars', p?.avatar_url)} name={name} />
          <T semibold numberOfLines={1}>{name}</T>
        </Pressable>
      ) }} />
      {/* الإزاحة = ارتفاع الشريط العلوي، عشان خانة الكتابة تطلع فوق الكيبورد بالضبط */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
        <FlatList ref={list} data={msgs} keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: space.lg, gap: 6, flexGrow: 1, justifyContent: 'flex-end' }}
          onContentSizeChange={toEnd}
          onLayout={toEnd}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          ListEmptyComponent={allowed && !pending.length ? (
            <View style={{ alignItems: 'center', gap: space.sm, marginBottom: space.xl }}>
              <Avatar size={64} uri={publicUrl('avatars', p?.avatar_url)} name={name} />
              <T muted center>{t('chat.sayHi', { name })}</T>
            </View>
          ) : null}
          ListFooterComponent={pending.length ? (
            <View style={{ gap: 6, alignItems: 'flex-end', marginTop: 6 }}>
              {pending.map((x) => <View key={x.id}>{x.type === 'video'
                ? <VideoBubble uploading width={x.w} height={x.h} duration={x.dur} />
                : photo(x.uri, x.w, x.h, true)}</View>)}
            </View>
          ) : null}
          renderItem={({ item: m, index }) => {
            const mine = m.sender === userId;
            const last = index === msgs.length - 1 || msgs[index + 1].sender !== m.sender;
            const newDay = index === 0 || dayKey(msgs[index - 1].created_at) !== dayKey(m.created_at);
            return (
              <View>
                {newDay ? (
                  <View style={{ alignSelf: 'center', backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 3, marginVertical: space.sm }}>
                    <T size="xs" muted>{dayLabel(m.created_at)}</T>
                  </View>
                ) : null}
                <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 4 }}>
                  {m.media_path && m.media_type === 'video' ? (
                    <VideoBubble uri={urls[m.media_path]} width={m.media_w} height={m.media_h} duration={m.media_dur}
                      onOpen={() => setVideo(urls[m.media_path!] ?? null)} />
                  ) : m.media_path ? photo(urls[m.media_path], m.media_w, m.media_h) : null}
                  {m.body ? (
                    <View style={{ maxWidth: '80%', backgroundColor: mine ? brand.deepGreen : colors.card, borderWidth: mine ? 0 : 1, borderColor: colors.border,
                      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderBottomEndRadius: mine && last ? 4 : 18, borderBottomStartRadius: !mine && last ? 4 : 18 }}>
                      <T color={mine ? brand.cream : colors.text} style={{ lineHeight: 23 }}>{m.body}</T>
                    </View>
                  ) : null}
                  {last ? (
                    <Row gap={4} style={{ paddingHorizontal: 6 }}>
                      <T size="xs" muted style={{ fontSize: 10 }}>{time(m.created_at)}</T>
                      {mine ? <Ionicons name={m.read_at ? 'checkmark-done' : 'checkmark'} size={12} color={m.read_at ? brand.orange : colors.muted} /> : null}
                    </Row>
                  ) : null}
                </View>
              </View>
            );
          }} />

        {allowed === false ? (
          <View style={{ padding: space.lg, gap: space.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card }}>
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
          <Row gap={8} style={{ padding: space.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card }}>
            <Pressable onPress={attach} disabled={!allowed} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('chat.attachMedia')}
              style={({ pressed }) => ({ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center', opacity: !allowed ? 0.4 : pressed ? 0.7 : 1 })}>
              <Ionicons name="image-outline" size={21} color={colors.primary} />
            </Pressable>
            <TextInput value={text} onChangeText={setText} placeholder={t('chat.placeholder')} placeholderTextColor={colors.muted} maxLength={1000} multiline
              editable={allowed !== null} onFocus={() => setTimeout(toEnd, 250)}
              style={{ flex: 1, minWidth: 0, minHeight: 42, maxHeight: 120, borderRadius: radius.lg, backgroundColor: colors.cardAlt, paddingHorizontal: 16, paddingVertical: 10, color: colors.text, fontFamily: fonts.regular, textAlign: 'auto' }} />
            <Pressable onPress={send} disabled={busy || !text.trim() || !allowed} accessibilityLabel={t('presence.send')}
              style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center', opacity: busy || !text.trim() ? 0.5 : 1 }}>
              <Ionicons name="send" size={18} color={brand.cream} style={{ transform: [{ scaleX: lng === 'ar' ? -1 : 1 }] }} />
            </Pressable>
          </Row>
        )}
      </KeyboardAvoidingView>

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
