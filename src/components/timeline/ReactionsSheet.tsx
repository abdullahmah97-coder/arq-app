// «مين تفاعل»: كل اللي تفاعلوا مع اللحظة وإيموجي كل واحد (تنفتح من صور المتفاعلين)
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CoachCheck } from '@/components/social/RankBadge';
import { Avatar, Row, T } from '@/components/ui';
import { loadReactions, REACTION_EMOJI, REACTIONS, type ReactionRow, type ReactTarget } from '@/lib/reactions';
import { publicUrl } from '@/lib/supabase';
import { colors, radius, space } from '@/theme';

export function ReactionsSheet({ target, onClose }: { target: ReactTarget; onClose: () => void }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ReactionRow[] | null>(null);
  const { type, id } = target;
  useEffect(() => {
    let alive = true;
    loadReactions({ type, id }).then((r) => { if (alive) setRows(r); }, () => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [type, id]);
  // ملخص: ❤️ 3 · 🔥 2 …
  const summary = rows ? REACTIONS.map((k) => [k, rows.filter((r) => r.emoji === k).length] as const).filter(([, n]) => n > 0) : [];
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onClose} accessibilityLabel={t('common.close')} />
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%', paddingTop: space.lg }}>
        <Row style={{ justifyContent: 'space-between', paddingHorizontal: space.lg, paddingBottom: space.sm }}>
          <T size="lg" bold>{t('timeline.whoReacted')}</T>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </Row>
        {summary.length ? (
          <Row gap={space.sm} style={{ paddingHorizontal: space.lg, paddingBottom: space.sm, flexWrap: 'wrap' }}>
            {summary.map(([k, n]) => (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 15 }}>{REACTION_EMOJI[k]}</Text>
                <T size="xs" semibold>{n}</T>
              </View>
            ))}
          </Row>
        ) : null}
        {!rows ? <ActivityIndicator color={colors.primary} style={{ margin: space.xl }} /> : (
          <FlatList data={rows} keyExtractor={(r) => r.user_id} contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.sm }}
            ListEmptyComponent={<T muted center style={{ padding: space.xl }}>{t('timeline.noReactions')}</T>}
            renderItem={({ item: r }) => (
              <Pressable onPress={() => { onClose(); router.push({ pathname: '/user/[id]', params: { id: r.user_id } }); }} accessibilityRole="link"
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 6, opacity: pressed ? 0.7 : 1 })}>
                <View>
                  <Avatar size={42} uri={publicUrl('avatars', r.avatar_url)} name={r.full_name ?? r.username} />
                  <Text style={{ position: 'absolute', bottom: -4, end: -6, fontSize: 16 }}>{REACTION_EMOJI[r.emoji]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Row gap={4}>
                    <T semibold numberOfLines={1} style={{ flexShrink: 1 }}>{r.full_name || r.username}</T>
                    {r.is_coach ? <CoachCheck size={14} /> : null}
                  </Row>
                  <T size="xs" muted>@{r.username}</T>
                </View>
              </Pressable>
            )} />
        )}
      </SafeAreaView>
    </Modal>
  );
}
