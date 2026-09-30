// في النادي (مثل Swarm): مين موجود الآن ومين حضر اليوم، مع «كفو» وتعليقات، وأوقات الذروة والخدمات، وإعداد الخصوصية
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, I18nManager, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandGradient, SaduPattern } from '@/brand/Brand';
import { GymServices } from '@/components/clubs/GymServices';
import { gymName } from '@/components/GymPicker';
import { Num } from '@/components/pulse/widgets';
import { RankBadge } from '@/components/social/RankBadge';
import { PeakTimes } from '@/components/trust/PeakTimes';
import { Avatar, Card, Empty, Row, Segmented, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { durationLabel } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { isHere, loadPresence, setPresenceVisibility, toggleHighFive, type PresenceRow } from '@/lib/presence';
import { errorKey, publicUrl, supabase } from '@/lib/supabase';
import type { Gym, PresenceVisibility } from '@/lib/types';
import { brand, colors, radius, space } from '@/theme';

export default function GymPresence() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId, profile, refreshProfile } = useUser();
  const [gym, setGym] = useState<Gym | null>(null);
  const [rows, setRows] = useState<PresenceRow[] | null>(null);
  const [presentNow, setPresentNow] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [g, p] = await Promise.all([supabase.from('gyms').select('*').eq('id', id).single(), loadPresence(String(id))]);
    setGym(g.data as Gym); setRows(p.rows); setPresentNow(p.presentNow);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const me = rows?.find((r) => r.is_me);
  const iAmHere = !!me && isHere(me);
  const now = (rows ?? []).filter((r) => isHere(r));
  const earlier = (rows ?? []).filter((r) => !isHere(r));
  const hiddenCount = Math.max(0, presentNow - now.length);

  const five = async (r: PresenceRow) => {
    setRows((rs) => rs?.map((x) => (x.check_in_id === r.check_in_id ? { ...x, liked_by_me: !x.liked_by_me, likes: x.likes + (x.liked_by_me ? -1 : 1) } : x)) ?? null);
    const { error } = await toggleHighFive(r, userId);
    if (error) { Alert.alert(t(errorKey(error))); load(); }
  };

  const setVis = async (v: PresenceVisibility) => {
    const { error } = await setPresenceVisibility(userId, v);
    if (error) return Alert.alert(t(errorKey(error)));
    await refreshProfile();
  };

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: t('presence.title') }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}>
        <BrandGradient name="ember" style={{ borderRadius: radius.lg, overflow: 'hidden', padding: space.xl, gap: space.sm }}>
          <SaduPattern variant="peaks" opacity={0.1} />
          <Row gap={6}><Ionicons name="location" size={16} color={brand.amber} /><T semibold color={brand.sand}>{gym ? gymName(gym, lng) : ' '}</T></Row>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.xl }}>
            <View><Num size={46} color={brand.cream}>{presentNow}</Num><T size="xs" color={brand.sand}>{t('presence.nowLabel')}</T></View>
            <View><Num size={30} color={brand.amber}>{earlier.length}</Num><T size="xs" color={brand.sand}>{t('presence.earlierLabel')}</T></View>
          </View>
          <T size="sm" color={brand.cream} style={{ lineHeight: 22 }}>{iAmHere ? t('presence.youAreHere') : t('presence.notHere')}</T>
          <Pressable onPress={() => router.push({ pathname: '/clubs/[id]', params: { id: String(id) } })} accessibilityRole="link" hitSlop={6}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
            <T size="xs" semibold color={brand.amber}>{t('presence.clubPage')}</T>
            <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={13} color={brand.amber} />
          </Pressable>
        </BrandGradient>

        {/* أوقات الذروة: متى يكون النادي زحمة */}
        <PeakTimes gymId={String(id)} />

        <T size="lg" bold>{t('presence.now')}</T>
        {rows === null ? null : now.length ? now.map((r) => <PersonRow key={r.check_in_id} r={r} onFive={five} />)
          : <Empty icon="barbell-outline" text={iAmHere ? t('presence.onlyYou') : t('presence.emptyNow')} />}
        {hiddenCount > 0 ? <T size="xs" muted center>{t('presence.hiddenCount', { count: hiddenCount })}</T> : null}

        {earlier.length ? (
          <>
            <T size="lg" bold>{t('presence.earlier')}</T>
            {earlier.map((r) => <PersonRow key={r.check_in_id} r={r} onFive={five} />)}
          </>
        ) : null}

        {/* خدمات الفرع */}
        <GymServices gymId={String(id)} />

        <Card style={{ gap: space.sm }}>
          <Row gap={6}><Ionicons name="eye-outline" size={18} color={colors.primary} /><T bold>{t('presence.whoSeesMe')}</T></Row>
          <Segmented<PresenceVisibility> value={profile.presence_visibility ?? 'gym'} onChange={setVis} options={[
            { value: 'gym', label: t('presence.vis_gym') }, { value: 'friends', label: t('presence.vis_friends') }, { value: 'hidden', label: t('presence.vis_hidden') },
          ]} />
          <T size="xs" muted style={{ lineHeight: 20 }}>{t(`presence.visHint_${profile.presence_visibility ?? 'gym'}`)}</T>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function PersonRow({ r, onFive }: { r: PresenceRow; onFive: (r: PresenceRow) => void }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const here = isHere(r);
  const when = here
    ? t('presence.since', { time: durationLabel(r.checked_in_at, lng) })
    : t('presence.was', { time: new Date(r.checked_in_at).toLocaleTimeString(lng === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { hour: 'numeric', minute: '2-digit' }), dur: durationLabel(r.checked_in_at, lng, Date.parse(r.checked_out_at!)) });
  return (
    <Card style={{ gap: space.md }}>
      <Row>
        <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: r.user_id } })}
          style={{ borderWidth: 2, borderColor: here ? brand.orange : 'transparent', borderRadius: 26, padding: 1 }}>
          <Avatar size={44} uri={publicUrl('avatars', r.avatar_url)} name={r.full_name ?? r.username} />
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <Row gap={6}>
            <T semibold numberOfLines={1} style={{ flexShrink: 1 }}>{r.is_me ? t('presence.you') : r.full_name || r.username}</T>
            <RankBadge points={r.points} coach={r.is_coach} small userId={r.user_id} />
          </Row>
          <Row gap={6}>
            {here ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success }} /> : null}
            <T size="xs" muted>{when}</T>
            {r.is_friend ? <T size="xs" semibold color={colors.primary}>· {t('presence.friend')}</T> : null}
          </Row>
        </View>
      </Row>
      <Row gap={space.sm}>
        <Pressable onPress={() => onFive(r)} disabled={r.is_me} accessibilityRole="button" accessibilityLabel={t('presence.five')}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: radius.md,
            backgroundColor: r.liked_by_me ? brand.orange : colors.cardAlt, opacity: r.is_me ? 0.6 : 1 }}>
          <Ionicons name={r.liked_by_me ? 'flame' : 'flame-outline'} size={17} color={r.liked_by_me ? brand.cream : brand.orange} />
          <T size="sm" semibold color={r.liked_by_me ? brand.cream : colors.text}>{t('presence.five')}{r.likes ? ` · ${r.likes}` : ''}</T>
        </Pressable>
        <Pressable onPress={() => router.push({ pathname: '/checkin/[id]', params: { id: r.check_in_id, name: r.is_me ? '' : r.full_name || r.username } })}
          accessibilityRole="button" accessibilityLabel={t('presence.comment')}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.cardAlt }}>
          <Ionicons name="chatbubble-outline" size={16} color={colors.primary} />
          <T size="sm" semibold>{t('presence.comment')}{r.comments ? ` · ${r.comments}` : ''}</T>
        </Pressable>
      </Row>
    </Card>
  );
}
