// صفحة المباراة: لوحة النتيجة (مباشرة بالدقيقة)، الموعد والملعب والعد التنازلي، «احجز تذكرتك» من المنصة الرسمية،
// «ذكّرني»، ترتيب الفريقين وشكلهم، ومواجهاتهم هالموسم
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Share, StyleSheet, View } from 'react-native';
import { SaduPattern } from '@/brand/Brand';
import { FormDots, LivePill, MatchRow, Score, TeamBadge } from '@/components/league/LeagueParts';
import { Button, Card, Empty, Loading, Row, Screen, T } from '@/components/ui';
import { useLocalized } from '@/lib/i18n';
import {
  canBuyTickets, canRemind, countdown, formOf, headToHead, involves, kickoffClock, kickoffLabel, leagueCached, loadLeague, loadMatch,
  matchState, myReminders, myTeam, roundNumber, setReminder, teamName, type LeagueData, type LeagueMatch,
} from '@/lib/league';
import { enablePush } from '@/lib/push';
import { brand, colors, radius, space } from '@/theme';

const hostOf = (url: string) => /^https:\/\/(?:www\.)?([^/?#]+)/i.exec(url)?.[1] ?? url;

export default function MatchPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const mid = Number(id);
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [data, setData] = useState<LeagueData | null>(leagueCached());
  const [m, setM] = useState<LeagueMatch | null | undefined>(() => leagueCached()?.matches.find((x) => x.id === mid));
  const [mine, setMine] = useState<number | null>(null);
  const [reminded, setReminded] = useState(false);
  const [busy, setBusy] = useState(false);
  const mRef = useRef(m);
  mRef.current = m;

  const load = useCallback(async (force: boolean) => {
    try {
      const [d, team, r] = await Promise.all([loadLeague(force), myTeam().catch(() => null), myReminders().catch(() => new Set<number>())]);
      // من إشعار لمباراة موسم ثاني: نجيبها لحالها
      const found = d.matches.find((x) => x.id === mid) ?? (Number.isFinite(mid) ? await loadMatch(mid) : null);
      setData(d); setM(found); setMine(team); setReminded(r.has(mid));
    } catch {
      if (mRef.current === undefined) setM(null);
    }
  }, [mid]);

  useFocusEffect(useCallback(() => {
    load(false);
    const timer = setInterval(() => {
      const x = mRef.current;
      if (x && (matchState(x.status) === 'live' || (matchState(x.status) === 'upcoming' && Math.abs(Date.parse(x.kickoff) - Date.now()) < 10 * 60_000))) load(true);
    }, 60_000);
    return () => clearInterval(timer);
  }, [load]));

  if (m === undefined || !data) return <Loading />;
  if (!m) return <Screen edges={['bottom']}><Empty icon="football-outline" text={t('league.notFound')} /></Screen>;

  const st = matchState(m.status);
  const home = data.teams.get(m.home_id);
  const away = data.teams.get(m.away_id);
  const hn = teamName(home, lng);
  const an = teamName(away, lng);
  const round = roundNumber(m.round);
  const cd = st === 'upcoming' ? countdown(m.kickoff) : null;
  const myMatch = involves(m, mine);
  const tickets = canBuyTickets(m, data.settings.tickets_url) ? data.settings.tickets_url! : null;
  const h2h = headToHead(data.matches, m);
  const standing = (teamId: number) => data.standings.find((s) => s.team_id === teamId);

  const toggle = async () => {
    setBusy(true);
    try {
      await setReminder(m.id, !reminded);
      setReminded(!reminded);
      if (!reminded) enablePush(true).catch(() => {});
    } catch { Alert.alert(t('errors.generic')); } finally { setBusy(false); }
  };
  const share = () => {
    const score = st === 'live' || st === 'finished' ? `${hn} ${m.home_goals ?? 0} - ${m.away_goals ?? 0} ${an}` : `${hn} ${t('league.vs')} ${an}`;
    const when = st === 'upcoming' ? kickoffLabel(m.kickoff, lng) : '';
    Share.share({ message: [`⚽ ${score}`, when, m.venue].filter(Boolean).join('\n') }).catch(() => {});
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: round ? t('league.round', { n: round }) : t('league.title') }} />

      {/* لوحة النتيجة */}
      <View style={styles.hero}>
        <LinearGradient colors={['#0E4A36', brand.deepGreen]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <SaduPattern variant="peaks" opacity={0.08} />
        <View pointerEvents="none" style={styles.pitchCircle} />
        <View style={{ alignItems: 'center', gap: 4 }}>
          {st === 'live' ? <LivePill m={m} /> : (
            <T size="xs" semibold color={brand.amber}>
              {st === 'finished' ? t(m.status === 'PEN' ? 'league.st_PEN' : m.status === 'AET' ? 'league.st_AET' : 'league.ftLong')
                : st === 'off' ? t(`league.st_${m.status}`, { defaultValue: t('league.st_off') }) : kickoffLabel(m.kickoff, lng)}
            </T>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <TeamCol name={hn} sub={standing(m.home_id) ? t('league.rankShort', { rank: standing(m.home_id)!.rank }) : null} badge={<TeamBadge team={home} lng={lng} size={62} />} />
          <View style={{ alignItems: 'center', minWidth: 92, gap: 4 }}>
            {st === 'live' || st === 'finished' ? <Score m={m} size={38} color={brand.cream} />
              : <T bold color={brand.cream} style={{ fontSize: 26, lineHeight: 34 }}>{kickoffClock(m.kickoff, lng)}</T>}
            {m.status === 'TBD' ? <T size="xs" color={brand.sand}>{t('league.tbd')}</T> : null}
          </View>
          <TeamCol name={an} sub={standing(m.away_id) ? t('league.rankShort', { rank: standing(m.away_id)!.rank }) : null} badge={<TeamBadge team={away} lng={lng} size={62} />} />
        </View>
        {cd ? (
          <View style={styles.countdown} accessible accessibilityLabel={t('league.startsIn', { d: cd.d, h: cd.h, m: cd.m })}>
            {cd.d ? <Unit n={cd.d} label={t('league.days')} /> : null}
            <Unit n={cd.h} label={t('league.hours')} />
            <Unit n={cd.m} label={t('league.minutes')} />
          </View>
        ) : null}
      </View>

      <Card style={{ gap: space.sm }}>
        <Info icon="calendar-outline" label={t('league.when')} value={kickoffLabel(m.kickoff, lng)} />
        {m.venue || m.city ? <Info icon="location-outline" label={t('league.where')} value={[m.venue, m.city].filter(Boolean).join(' · ')} /> : null}
        {round ? <Info icon="flag-outline" label={t('league.roundLabel')} value={t('league.round', { n: round })} /> : null}
      </Card>

      {tickets ? (
        <View style={{ gap: 6 }}>
          <Button icon="ticket-outline" title={t('league.tickets')} onPress={() => Linking.openURL(tickets).catch(() => {})} />
          <T size="xs" muted center style={{ lineHeight: 18 }}>{t('league.ticketsNote', { site: hostOf(tickets) })}</T>
        </View>
      ) : null}

      <Row gap={space.sm}>
        {canRemind(m) ? (
          <View style={{ flex: 1 }}>
            {myMatch ? (
              <Button variant="secondary" icon="notifications" title={t('league.autoRemindShort')} onPress={() => router.push('/league/team')} />
            ) : (
              <Button variant="secondary" icon={reminded ? 'notifications' : 'notifications-outline'} loading={busy}
                title={reminded ? t('league.reminded') : t('league.remind')} onPress={toggle} />
            )}
          </View>
        ) : null}
        <View style={{ flex: 1 }}><Button variant="secondary" icon="share-outline" title={t('league.share')} onPress={share} /></View>
      </Row>
      {reminded && canRemind(m) && !myMatch ? <T size="xs" muted center>{t('league.remindedHint', { n: data.settings.remind_minutes })}</T> : null}

      {data.standings.length ? (
        <Card style={{ gap: space.md }}>
          <T semibold>{t('league.formTitle')}</T>
          {[m.home_id, m.away_id].map((tid) => {
            const s = standing(tid);
            const team = data.teams.get(tid);
            return (
              <Row key={tid} gap={space.sm}>
                <TeamBadge team={team} lng={lng} size={26} />
                <View style={{ flex: 1, gap: 4 }}>
                  <T size="sm" semibold numberOfLines={1}>{teamName(team, lng)}</T>
                  <FormDots form={formOf(tid, data.standings, data.matches)} size={16} />
                </View>
                {s ? (
                  <View style={{ alignItems: 'center' }}>
                    <T bold>{s.points}</T>
                    <T size="xs" muted>{t('league.rankPts', { rank: s.rank })}</T>
                  </View>
                ) : null}
              </Row>
            );
          })}
        </Card>
      ) : null}

      {h2h.length ? (
        <View style={{ gap: space.sm }}>
          <T semibold>{t('league.h2h')}</T>
          {h2h.map((x) => (
            <MatchRow key={x.id} m={x} teams={data.teams} lng={lng} onPress={() => router.push({ pathname: '/league/[id]', params: { id: String(x.id) } })} />
          ))}
        </View>
      ) : null}

      <T size="xs" muted center style={{ lineHeight: 19 }}>{t('league.sourceNote')}</T>
    </Screen>
  );
}

function TeamCol({ name, sub, badge }: { name: string; sub: string | null; badge: ReactNode }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
      {badge}
      <T bold color={brand.cream} center numberOfLines={2} style={{ lineHeight: 22 }}>{name}</T>
      {sub ? <T size="xs" color={brand.sand}>{sub}</T> : null}
    </View>
  );
}

function Unit({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ alignItems: 'center', minWidth: 54 }}>
      <T bold color={brand.amber} style={{ fontSize: 22, lineHeight: 28 }}>{n}</T>
      <T size="xs" color={brand.sand}>{label}</T>
    </View>
  );
}

function Info({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={17} color={colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T size="xs" muted>{label}</T>
        <T semibold>{value}</T>
      </View>
    </Row>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, overflow: 'hidden', padding: space.lg, gap: space.md },
  pitchCircle: { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 1, borderColor: 'rgba(248,237,218,0.08)', left: '50%', top: '50%', marginLeft: -80, marginTop: -80 },
  countdown: { flexDirection: 'row', justifyContent: 'center', gap: space.md, backgroundColor: 'rgba(248,237,218,0.08)', borderRadius: radius.md, paddingVertical: 8 },
});
