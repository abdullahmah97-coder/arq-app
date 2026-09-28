// مدربين النادي في صفحة النادي (المعتمدين من إدارة النادي)
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { STAR } from '@/components/clubs/parts';
import { Avatar, Row, T } from '@/components/ui';
import { loadGymCoaches, type GymCoach } from '@/lib/coaching';
import { publicUrl } from '@/lib/supabase';
import { colors, radius, space } from '@/theme';

export function GymCoaches({ gymId }: { gymId: string }) {
  const { t } = useTranslation();
  const [list, setList] = useState<GymCoach[]>([]);
  useEffect(() => { loadGymCoaches(gymId).then((l) => setList(l.filter((c) => c.status === 'approved'))); }, [gymId]);
  if (!list.length) return null;
  return (
    <View style={{ gap: space.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T size="lg" bold>{t('coaching.gymCoaches')}</T>
        <Pressable onPress={() => router.push({ pathname: '/coaches', params: { gym: gymId } })}><T size="xs" semibold color={colors.primary}>{t('coaching.seeAll')}</T></Pressable>
      </Row>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {list.map((c) => (
          <Pressable key={c.user_id} onPress={() => router.push({ pathname: '/coaches/[id]', params: { id: c.user_id } })}
            style={{ width: 150, padding: space.md, gap: 4, alignItems: 'center', borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
            <Avatar size={52} uri={publicUrl('avatars', c.avatar_url)} name={c.full_name ?? c.username} />
            <Row gap={3}><T size="sm" semibold numberOfLines={1} style={{ flexShrink: 1 }}>{c.full_name || c.username}</T>{c.verified ? <Ionicons name="checkmark-circle" size={13} color={colors.success} /> : null}</Row>
            {c.specialties[0] ? <T size="xs" muted numberOfLines={1}>{t(`coaching.sp_${c.specialties[0]}`)}</T> : null}
            {c.rating ? <Row gap={2}><Ionicons name="star" size={11} color={STAR} /><T size="xs">{c.rating.toFixed(1)}</T></Row> : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
