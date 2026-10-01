// تعليقات على حضور شخص في النادي: بطاقة «في النادي» أو «انتهى التمرين» (phase=out) — كل وحدة بتعليقاتها
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, Empty, Row, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { addCheckinComment, deleteCheckinComment, loadCheckinComments, type CheckinComment, type VisitPhase } from '@/lib/presence';
import { errorKey, publicUrl } from '@/lib/supabase';
import { brand, colors, fonts, radius, space } from '@/theme';

export default function CheckinComments() {
  const { id, name, phase: phaseParam } = useLocalSearchParams<{ id: string; name?: string; phase?: string }>();
  const phase: VisitPhase = phaseParam === 'out' ? 'out' : 'in';
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId } = useUser();
  const [list, setList] = useState<CheckinComment[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  // ارتفاع الشريط العلوي الفعلي عشان خانة التعليق تطلع فوق الكيبورد بالضبط
  const headerHeight = useHeaderHeight();
  const load = useCallback(() => loadCheckinComments(String(id), phase).then(setList), [id, phase]);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const { error } = await addCheckinComment(String(id), userId, text, phase);
    setBusy(false);
    if (error) return Alert.alert(t(errorKey(error)));
    setText(''); load();
  };

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: phase === 'out'
        ? (name ? t('presence.commentsOnOut', { name }) : t('presence.commentsOut'))
        : (name ? t('presence.commentsOn', { name }) : t('presence.comments')) }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
        <FlatList data={list ?? []} keyExtractor={(c) => c.id} contentContainerStyle={{ padding: space.lg, gap: space.md }}
          ListEmptyComponent={list ? <Empty icon="chatbubbles-outline" text={t('presence.noComments')} /> : null}
          renderItem={({ item: c }) => (
            <Row style={{ alignItems: 'flex-start' }}>
              <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: c.user_id } })}>
                <Avatar size={34} uri={publicUrl('avatars', c.profiles?.avatar_url)} name={c.profiles?.full_name ?? c.profiles?.username} />
              </Pressable>
              <View style={{ flex: 1, minWidth: 0, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: 2 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T size="sm" semibold>{c.profiles?.full_name || c.profiles?.username}</T>
                  <T size="xs" muted>{timeAgo(c.created_at, lng)}</T>
                </Row>
                <T style={{ flexShrink: 1 }}>{c.body}</T>
              </View>
              {c.user_id === userId ? (
                <Pressable hitSlop={10} onPress={async () => { await deleteCheckinComment(c.id); load(); }} accessibilityLabel={t('common.delete')}>
                  <Ionicons name="trash-outline" size={16} color={colors.muted} />
                </Pressable>
              ) : null}
            </Row>
          )} />
        <Row style={{ padding: space.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card }}>
          <TextInput value={text} onChangeText={setText} placeholder={t('presence.commentPh')} placeholderTextColor={colors.muted} maxLength={300}
            style={{ flex: 1, minWidth: 0, minHeight: 42, borderRadius: radius.pill, backgroundColor: colors.cardAlt, paddingHorizontal: 16, color: colors.text, fontFamily: fonts.regular, textAlign: 'auto' }} />
          <Pressable onPress={send} disabled={busy || !text.trim()} accessibilityLabel={t('presence.send')}
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center', opacity: busy || !text.trim() ? 0.5 : 1 }}>
            <Ionicons name="send" size={18} color={brand.cream} style={{ transform: [{ scaleX: lng === 'ar' ? -1 : 1 }] }} />
          </Pressable>
        </Row>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
