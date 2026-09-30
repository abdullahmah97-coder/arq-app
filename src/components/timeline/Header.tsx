// غلاف التايم لاين: خلفية حسابك (نفس صفحتك)، صورتك واسمك، وتحية اليوم — وكم واحد من أصدقائك بالنادي الحين
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { ProfileCover, coverPhotoUrl } from '@/components/social/Cover';
import { T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useLocalized } from '@/lib/i18n';
import { publicUrl } from '@/lib/supabase';
import type { TimelineItem } from '@/lib/timeline';
import { dateLine, greetingOf } from '@/lib/wakeCore';
import { brand, colors, pulse, radius, space } from '@/theme';
import { MomentAvatar } from './Moments';

/** كم صديق بالنادي الحين (حضور بدون خروج خلال ٦ ساعات) */
export function friendsAtGym(items: TimelineItem[], me: string | undefined, now: number): number {
  const ids = new Set<string>();
  for (const it of items) {
    if (it.item_type === 'checkin' && it.user_id !== me && !it.meta.out && now - Date.parse(it.at) < 6 * 3600_000) ids.add(it.user_id);
  }
  return ids.size;
}

export function TimelineHeader({ items, onSettings }: { items: TimelineItem[]; onSettings: () => void }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { session, profile } = useAuth();
  const me = session?.user.id;
  const [now] = useState(() => new Date());
  const name = profile?.full_name || profile?.username || '';
  const atGym = useMemo(() => friendsAtGym(items, me, now.getTime()), [items, me, now]);
  return (
    <View style={{ paddingHorizontal: space.lg, paddingTop: space.xs, paddingBottom: space.sm, gap: space.md }}>
      <ProfileCover cover={profile?.cover} photo={coverPhotoUrl(profile?.cover_url)}
        style={{ height: 150, borderRadius: radius.lg, overflow: 'hidden', justifyContent: 'flex-end', padding: space.lg }}>
        <Pressable onPress={onSettings} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('timeline.settingsTitle')}
          style={({ pressed }) => ({
            position: 'absolute', top: space.md, end: space.md, width: 36, height: 36, borderRadius: 18,
            backgroundColor: 'rgba(10,51,45,0.45)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1,
          })}>
          <Ionicons name="options-outline" size={18} color={brand.cream} />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Pressable onPress={() => me && router.push({ pathname: '/user/[id]', params: { id: me } })} accessibilityRole="link" accessibilityLabel={name}
            style={{ borderWidth: 3, borderColor: brand.cream, borderRadius: 19 }}>
            <MomentAvatar uri={publicUrl('avatars', profile?.avatar_url ?? null)} name={name} size={60} />
          </Pressable>
          <View style={{ flex: 1, gap: 2 }}>
            <T size="lg" bold color={brand.cream} numberOfLines={1}>{name}</T>
            <T size="sm" color={brand.sand} numberOfLines={1}>{t(`timeline.greet_${greetingOf(now)}`)} · {dateLine(now, lng)}</T>
          </View>
        </View>
      </ProfileCover>
      {atGym ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'flex-start', backgroundColor: colors.card,
          borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: pulse.green }} />
          <T size="xs" semibold>{t('timeline.atGymNow', { count: atGym })}</T>
        </View>
      ) : null}
    </View>
  );
}
