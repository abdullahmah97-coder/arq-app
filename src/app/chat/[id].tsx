// محادثة خاصة: مفتوحة بين الأصدقاء، أو اللي يتابعون بعض، أو المدرب ومتدربه.
// لو مقفلة: زر طلب الصداقة (أو قبوله) بدل ما يعلق المستخدم.
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, Button, Row, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { acceptRequest, relationTo, sendRequest, type Relation } from '@/lib/friends';
import { useLocalized } from '@/lib/i18n';
import { canMessage, loadThread, markRead, sendMessage, useIncoming, type Message } from '@/lib/messages';
import { errorKey, publicUrl, supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { brand, colors, fonts, radius, space } from '@/theme';

/** يوم الرسالة بتوقيت الجوال (للفواصل بين الأيام) */
const dayKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const other = String(id);
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId } = useUser();
  const [p, setP] = useState<Profile | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rel, setRel] = useState<{ relation: Relation; id?: string }>({ relation: 'none' });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [relBusy, setRelBusy] = useState(false);
  const list = useRef<FlatList<Message>>(null);

  const load = useCallback(async () => {
    try {
      const [prof, th, ok, r] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', other).maybeSingle(), loadThread(userId, other), canMessage(userId, other),
        relationTo(userId, other).catch(() => ({ relation: 'none' as Relation })),
      ]);
      setP((prof.data as Profile) ?? null); setMsgs(th); setAllowed(ok); setRel(r);
      markRead(userId, other);
    } catch {
      setAllowed((a) => a ?? false);
    }
  }, [userId, other]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useIncoming(userId, useCallback((m: Message) => {
    if (m.sender !== other) return;
    setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m]));
    markRead(userId, other);
  }, [userId, other]));

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

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerTitle: () => (
        <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: other } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Avatar size={30} uri={publicUrl('avatars', p?.avatar_url)} name={name} />
          <T semibold numberOfLines={1}>{name}</T>
        </Pressable>
      ) }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <FlatList ref={list} data={msgs} keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: space.lg, gap: 6, flexGrow: 1, justifyContent: 'flex-end' }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={allowed ? (
            <View style={{ alignItems: 'center', gap: space.sm, marginBottom: space.xl }}>
              <Avatar size={64} uri={publicUrl('avatars', p?.avatar_url)} name={name} />
              <T muted center>{t('chat.sayHi', { name })}</T>
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
                <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
                  <View style={{ maxWidth: '80%', backgroundColor: mine ? brand.deepGreen : colors.card, borderWidth: mine ? 0 : 1, borderColor: colors.border,
                    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderBottomEndRadius: mine && last ? 4 : 18, borderBottomStartRadius: !mine && last ? 4 : 18 }}>
                    <T color={mine ? brand.cream : colors.text} style={{ lineHeight: 23 }}>{m.body}</T>
                  </View>
                  {last ? (
                    <Row gap={4} style={{ marginTop: 2, paddingHorizontal: 6 }}>
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
          <Row style={{ padding: space.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card }}>
            <TextInput value={text} onChangeText={setText} placeholder={t('chat.placeholder')} placeholderTextColor={colors.muted} maxLength={1000} multiline
              editable={allowed !== null}
              style={{ flex: 1, minWidth: 0, minHeight: 42, maxHeight: 120, borderRadius: radius.lg, backgroundColor: colors.cardAlt, paddingHorizontal: 16, paddingVertical: 10, color: colors.text, fontFamily: fonts.regular, textAlign: 'auto' }} />
            <Pressable onPress={send} disabled={busy || !text.trim() || !allowed} accessibilityLabel={t('presence.send')}
              style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center', opacity: busy || !text.trim() ? 0.5 : 1 }}>
              <Ionicons name="send" size={18} color={brand.cream} style={{ transform: [{ scaleX: lng === 'ar' ? -1 : 1 }] }} />
            </Pressable>
          </Row>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
