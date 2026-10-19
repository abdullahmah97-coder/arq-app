// تحدي التوقعات: نقاطك وترتيبك بين أصدقائك (أو الكل)، المباريات الجاية تتوقعها، وتوقعاتك اللي خلصت بنقاطها.
// النقاط: النتيجة بالضبط = ٣، الفائز أو التعادل صح = ١ (تنحسب بالخادم من نتيجة المباراة)
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Share, Text, View } from 'react-native';
import { BrandGradient, SaduPattern } from '@/brand/Brand';
import { PointsBadge } from '@/components/league/Predict';
import { DayHeader, TeamBadge } from '@/components/league/LeagueParts';
import { Avatar, Button, Card, Empty, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useLocalized } from '@/lib/i18n';
import {
  finishedMatches, kickoffLabel, loadLeague, loadPredBoard, myPredictions, predPoints, stateOf, teamName, upcomingMatches,
  type LeagueData, type LeagueMatch, type PredBoardRow,
} from '@/lib/league';
import { publicUrl } from '@/lib/supabase';
import { brand, colors, fonts, radius, space } from '@/theme';

type Scope = 'friends' | 'all';

function Score2({ h, a, size = 15 }: { h: number; a: number; size?: number }) {
  const s = { color: colors.text, fontFamily: fonts.title, fontSize: size };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Text allowFontScaling={false} style={s}>{h}</Text>
      <Text allowFontScaling={false} style={[s, { opacity: 0.55 }]}>-</Text>
      <Text allowFontScaling={false} style={s}>{a}</Text>
    </View>
  );
}

export default function Predictions() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const [scope, setScope] = useState<Scope>('friends');
  const [board, setBoard] = useState<PredBoardRow[] | null>(null);
  const [data, setData] = useState<LeagueData | null>(null);
  const [mine, setMine] = useState<Map<number, { home: number; away: number }>>(new Map());
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (sc: Scope) => {
    try {
      const [b, d, p] = await Promise.all([loadPredBoard(sc), loadLeague(), uid ? myPredictions(uid) : Promise.resolve(new Map())]);
      setBoard(b); setData(d); setMine(p); setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [uid]);

  useFocusEffect(useCallback(() => { load(scope); }, [load, scope]));

  if (failed && !board) return <Screen edges={['bottom']}><Empty icon="cloud-offline-outline" text={t('league.loadFailed')} /></Screen>;
  if (!board || !data) return <Loading />;

  const me = board.find((r) => r.user_id === uid);
  const openMatch = (m: LeagueMatch) => router.push({ pathname: '/league/[id]', params: { id: String(m.id) } });
  const next = upcomingMatches(data.matches).filter((m) => stateOf(m) === 'upcoming').slice(0, 6);
  const done = finishedMatches(data.matches).filter((m) => mine.has(m.id) && stateOf(m) === 'finished').slice(0, 15);
  const invite = () => Share.share({ message: t('league.predInviteMsg') }).catch(() => {});

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('league.predTitle') }} />

      <BrandGradient name="ember" style={{ borderRadius: radius.lg, overflow: 'hidden', padding: space.lg, gap: space.md }}>
        <SaduPattern variant="peaks" opacity={0.1} />
        <Row gap={6}>
          <Ionicons name="trophy" size={14} color={brand.amber} />
          <T size="xs" semibold color={brand.amber}>{t('league.predTitle')}</T>
        </Row>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.lg }}>
          <View>
            <Text allowFontScaling={false} style={{ color: brand.cream, fontFamily: fonts.title, fontSize: 44, lineHeight: 52 }}>{me?.points ?? 0}</Text>
            <T size="sm" color={brand.sand}>{t('league.predMyPoints')}</T>
          </View>
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: space.lg }}>
            <Stat value={me && me.played ? `#${me.rank}` : '—'} label={t(scope === 'friends' ? 'league.predRankFriends' : 'league.predRankAll')} />
            <Stat value={String(me?.exact ?? 0)} label={t('league.predExact')} />
            <Stat value={String(me?.played ?? 0)} label={t('league.predPlayed')} />
          </View>
        </View>
        <T size="xs" color={brand.sand} style={{ lineHeight: 18 }}>{t('league.predRules')}</T>
      </BrandGradient>

      <Segmented<Scope> value={scope} onChange={setScope}
        options={[{ value: 'friends', label: t('league.predScopeFriends') }, { value: 'all', label: t('league.predScopeAll') }]} />

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {board.map((r, i) => {
          const isMe = r.user_id === uid;
          const name = r.full_name || r.username || '—';
          return (
            <Pressable key={r.user_id} onPress={() => router.push({ pathname: '/user/[id]', params: { id: r.user_id } })} accessibilityRole="link"
              accessibilityLabel={`${r.rank}. ${name}، ${r.points} ${t('league.pts')}`}
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: 12, paddingVertical: 10,
                borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, backgroundColor: isMe ? 'rgba(254,169,79,0.18)' : undefined }, pressed && { opacity: 0.85 }]}>
              <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: r.rank <= 3 && r.points > 0 ? brand.amber : 'transparent' }}>
                <T size="sm" bold color={r.rank <= 3 && r.points > 0 ? brand.deepGreen : colors.text}>{r.rank}</T>
              </View>
              <Avatar uri={publicUrl('avatars', r.avatar_url)} name={name} size={34} />
              <View style={{ flex: 1 }}>
                <T size="sm" semibold numberOfLines={1}>{isMe ? t('league.predMe', { name }) : name}</T>
                <T size="xs" muted>{t('league.predRowSub', { exact: r.exact, played: r.played })}</T>
              </View>
              <Text allowFontScaling={false} style={{ fontFamily: fonts.title, fontSize: 20, color: colors.text }}>{r.points}</Text>
            </Pressable>
          );
        })}
      </Card>
      {board.length <= 1 ? (
        <View style={{ gap: space.sm }}>
          <T size="sm" muted center style={{ lineHeight: 21 }}>{t('league.predEmptyBoard')}</T>
          <Button variant="secondary" icon="person-add-outline" title={t('league.predInvite')} onPress={invite} />
        </View>
      ) : null}
      {scope === 'all' ? <T size="xs" muted center style={{ lineHeight: 18 }}>{t('league.predAllNote')}</T> : null}

      {next.length ? (
        <View style={{ gap: space.sm }}>
          <DayHeader title={t('league.predUpcoming')} />
          {next.map((m) => {
            const p = mine.get(m.id);
            return (
              <Pressable key={m.id} onPress={() => openMatch(m)} accessibilityRole="button"
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.card, borderWidth: 1,
                  borderColor: p ? colors.border : brand.amber, borderRadius: radius.lg, padding: 10 }, pressed && { opacity: 0.85 }]}>
                <TeamBadge team={data.teams.get(m.home_id)} lng={lng} size={26} />
                <View style={{ flex: 1 }}>
                  <T size="sm" semibold numberOfLines={1}>{teamName(data.teams.get(m.home_id), lng)} {t('league.vs')} {teamName(data.teams.get(m.away_id), lng)}</T>
                  <T size="xs" muted>{kickoffLabel(m.kickoff, lng)}</T>
                </View>
                <TeamBadge team={data.teams.get(m.away_id)} lng={lng} size={26} />
                {p ? <Score2 h={p.home} a={p.away} /> : (
                  <View style={{ backgroundColor: brand.deepGreen, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <T size="xs" semibold color={brand.cream}>{t('league.predGo')}</T>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {done.length ? (
        <View style={{ gap: space.sm }}>
          <DayHeader title={t('league.predHistory')} />
          {done.map((m) => {
            const p = mine.get(m.id)!;
            const pts = predPoints(p.home, p.away, m.home_goals, m.away_goals);
            return (
              <Pressable key={m.id} onPress={() => openMatch(m)} accessibilityRole="button"
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.card, borderWidth: 1,
                  borderColor: colors.border, borderRadius: radius.lg, padding: 10 }, pressed && { opacity: 0.85 }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T size="sm" semibold numberOfLines={1}>{teamName(data.teams.get(m.home_id), lng)} {t('league.vs')} {teamName(data.teams.get(m.away_id), lng)}</T>
                  <Row gap={6}>
                    <T size="xs" muted>{t('league.predYours')}</T>
                    <Score2 h={p.home} a={p.away} size={12} />
                    <T size="xs" muted>· {t('league.predFinalLabel')}</T>
                    <Score2 h={m.home_goals ?? 0} a={m.away_goals ?? 0} size={12} />
                  </Row>
                </View>
                <PointsBadge points={pts} small />
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text allowFontScaling={false} style={{ color: brand.amber, fontFamily: fonts.title, fontSize: 22, lineHeight: 28 }}>{value}</Text>
      <T size="xs" color={brand.sand}>{label}</T>
    </View>
  );
}
