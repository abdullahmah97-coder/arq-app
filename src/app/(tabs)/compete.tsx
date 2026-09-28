import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { BrandGradient, SaduPattern } from '@/brand/Brand';
import { Num } from '@/components/pulse/widgets';
import { Avatar, Button, Card, Empty, H, ProfileButton, Row, Screen, SectionTitle, Segmented, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { addDays, daysBetween, isoDate, startOfWeek } from '@/lib/dates';
import { publicUrl, supabase } from '@/lib/supabase';
import type { Challenge, LeaderboardScope } from '@/lib/types';
import { brand, colors, space } from '@/theme';

type MyChallenge = Challenge & { my_status: 'invited' | 'joined' };
type Kind = 'points' | 'steps';
interface Row_ { user_id: string; username: string; full_name: string | null; avatar_url: string | null; value: number; rank: number; streak?: number }

const MEDAL = [brand.amber, brand.sand, '#D98B4F'];

export default function Compete() {
  const { t } = useTranslation();
  const { userId, profile } = useUser();
  const [kind, setKind] = useState<Kind>('points');
  const [scope, setScope] = useState<LeaderboardScope>('friends');
  const [rows, setRows] = useState<Row_[]>([]);
  const [challenges, setChallenges] = useState<MyChallenge[]>([]);

  const loadBoard = useCallback(async (k: Kind, s: LeaderboardScope) => {
    if (k === 'steps') {
      const from = startOfWeek();
      const { data } = await supabase.rpc('steps_leaderboard', { p_from: isoDate(from), p_to: isoDate(addDays(from, 6)) });
      setRows(((data ?? []) as any[]).map((r) => ({ ...r, value: Number(r.steps), rank: Number(r.rank) })));
    } else {
      const { data } = await supabase.rpc('leaderboard', { p_scope: s, p_since: startOfWeek().toISOString(), p_limit: 50 });
      setRows(((data ?? []) as any[]).map((r) => ({ ...r, value: Number(r.points), rank: Number(r.rank) })));
    }
  }, []);

  const loadChallenges = useCallback(async () => {
    const { data } = await supabase.from('challenge_members').select('status, challenges(*)').eq('user_id', userId);
    const list = (data ?? [])
      .filter((r: any) => r.challenges)
      .map((r: any) => ({ ...(r.challenges as Challenge), my_status: r.status }))
      .sort((a: MyChallenge, b: MyChallenge) => (a.my_status === 'invited' ? -1 : 0) - (b.my_status === 'invited' ? -1 : 0) || b.ends_on.localeCompare(a.ends_on));
    setChallenges(list);
  }, [userId]);

  useFocusEffect(useCallback(() => { loadBoard(kind, scope); loadChallenges(); }, [kind, scope, loadBoard, loadChallenges]));

  const fmt = (v: number) => v.toLocaleString('en-US');
  const podium = rows.filter((r) => r.value > 0).slice(0, 3);
  const rest = rows.slice(podium.length);
  const order = [podium[1], podium[0], podium[2]]; // الثاني، الأول، الثالث
  const heights = [96, 128, 76];
  const noGym = kind === 'points' && scope === 'gym' && !profile.gym_id;

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <H>{t('compete.title')}</H>
        <ProfileButton />
      </Row>
      <Segmented value={kind} onChange={setKind} options={[{ value: 'points', label: t('compete.pointsTab') }, { value: 'steps', label: t('compete.stepsTab') }]} />
      {kind === 'points' ? (
        <Segmented value={scope} onChange={setScope}
          options={(['friends', 'gym', 'global'] as const).map((s) => ({ value: s, label: t(`compete.scope_${s}`) }))} />
      ) : null}

      {/* منصة التتويج */}
      <BrandGradient name="ember" style={styles.podiumWrap}>
        <SaduPattern variant="chevron" opacity={0.1} />
        <T size="sm" semibold color={brand.sand} center>{t('compete.leaderboard')} · {t('compete.thisWeek')}</T>
        {noGym ? <Empty text={t('home.noGym')} icon="barbell-outline" /> : podium.length === 0 ? (
          <T color={brand.sand} center style={{ paddingVertical: space.xl }}>{t('common.empty')}</T>
        ) : (
          <View style={styles.podium}>
            {order.map((r, i) => r ? (
              <Pressable key={r.user_id} style={{ flex: 1, alignItems: 'center', gap: 6 }}
                onPress={() => r.user_id !== userId && router.push({ pathname: '/user/[id]', params: { id: r.user_id } })}>
                <View style={[styles.avatarRing, { borderColor: MEDAL[r.rank - 1] ?? brand.sand }]}>
                  <Avatar size={i === 1 ? 58 : 46} uri={publicUrl('avatars', r.avatar_url)} name={r.full_name ?? r.username} />
                </View>
                <T size="xs" semibold color={brand.cream} numberOfLines={1}>{r.user_id === userId ? t('common.you') : r.full_name || r.username}</T>
                <View style={[styles.step, { height: heights[i], backgroundColor: i === 1 ? 'rgba(254,169,79,0.95)' : 'rgba(248,237,218,0.18)' }]}>
                  <Num size={i === 1 ? 34 : 26} color={i === 1 ? brand.deepGreen : brand.cream}>{r.rank}</Num>
                  <Num size={14} color={i === 1 ? brand.deepGreen : brand.sand}>{fmt(r.value)}</Num>
                </View>
              </Pressable>
            ) : <View key={i} style={{ flex: 1 }} />)}
          </View>
        )}
      </BrandGradient>

      {rest.length ? (
        <Card style={{ padding: space.sm }}>
          {rest.map((r) => {
            const me = r.user_id === userId;
            return (
              <Pressable key={r.user_id} onPress={() => !me && router.push({ pathname: '/user/[id]', params: { id: r.user_id } })}>
                <Row style={{ padding: space.sm, borderRadius: 12, backgroundColor: me ? colors.cardAlt : 'transparent' }} gap={space.md}>
                  <Num size={18} color={colors.muted} style={{ width: 28, textAlign: 'center' }}>{r.rank}</Num>
                  <Avatar size={36} uri={publicUrl('avatars', r.avatar_url)} name={r.full_name ?? r.username} />
                  <View style={{ flex: 1 }}>
                    <T bold numberOfLines={1}>{me ? t('common.you') : r.full_name || r.username}</T>
                    {r.streak != null ? <T size="xs" muted>{t('home.streak')}: {r.streak} 🔥</T> : null}
                  </View>
                  <Num size={18} color={colors.primary}>{fmt(r.value)}</Num>
                </Row>
              </Pressable>
            );
          })}
        </Card>
      ) : null}

      <SectionTitle title={t('compete.challenges')} action={t('compete.newChallenge')} onAction={() => router.push('/challenge/new')} />
      {challenges.length === 0 ? (
        <Card style={{ gap: space.md }}>
          <Empty text={t('compete.noChallenges')} icon="flash-outline" />
          <Button title={t('compete.newChallenge')} icon="add" onPress={() => router.push('/challenge/new')} />
        </Card>
      ) : challenges.map((c) => {
        const left = daysBetween(c.ends_on);
        const starts = daysBetween(c.starts_on);
        return (
          <Card key={c.id} onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: c.id } })}
            style={{ gap: space.xs, borderColor: c.my_status === 'invited' ? colors.fire : colors.border }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row style={{ flex: 1 }}>
                <Ionicons name={c.metric === 'steps' ? 'footsteps' : c.metric === 'checkins' ? 'location' : c.metric === 'workouts' ? 'barbell' : 'star'} size={16} color={colors.primary} />
                <T bold style={{ flex: 1 }}>{c.title}</T>
              </Row>
              {c.my_status === 'invited' ? <T size="xs" bold style={{ color: colors.fire }}>{t('compete.pendingInvite')}</T> : null}
            </Row>
            <T size="sm" muted>
              {t(`compete.metric_${c.metric}`)} · {left < 0 ? t('compete.ended') : starts > 0 ? t('compete.startsIn', { days: starts, count: starts }) : t('compete.endsIn', { days: left + 1, count: left + 1 })}
            </T>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  podiumWrap: { borderRadius: 20, padding: space.lg, paddingBottom: 0, overflow: 'hidden', gap: space.md },
  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  avatarRing: { borderWidth: 2, borderRadius: 999, padding: 2 },
  step: { width: '100%', borderTopLeftRadius: 12, borderTopRightRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 2 },
});
