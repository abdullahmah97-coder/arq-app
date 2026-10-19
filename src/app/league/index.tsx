// الدوري السعودي: المباريات القادمة (والمباشرة فوقها)، النتائج، جدول الترتيب، الهدافين، «فريقي» و«ذكّرني»
// البيانات من SportScore عبر الخادم (league-sync)، وتتحدث كل دقيقة وأنت فاتح الصفحة وقت المباريات
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, I18nManager, Pressable, View } from 'react-native';
import { BrandGradient, SaduPattern } from '@/brand/Brand';
import { DayHeader, FormDots, MatchRow, TeamBadge, SourceCredit } from '@/components/league/LeagueParts';
import { Button, Card, Empty, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { useLocalized } from '@/lib/i18n';
import {
  canRemind, finishedMatches, formOf, goalDiff, groupByDay, involves, loadLeague, loadPlayerNames, loadScorers, matchDayTitle, myReminders, myTeam, nameFor,
  setReminder, signed, sortStandings, stateOf, teamName, upcomingMatches, type LeagueData, type LeagueMatch, type Scorer,
} from '@/lib/league';
import { enablePush } from '@/lib/push';
import { brand, colors, radius, space } from '@/theme';

type Tab = 'next' | 'results' | 'table' | 'scorers';
const PAGE = 24;

export default function League() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [data, setData] = useState<LeagueData | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>('next');
  const [mine, setMine] = useState<number | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const [rem, setRem] = useState<Set<number>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const dataRef = useRef<LeagueData | null>(null);

  const load = useCallback(async (force: boolean) => {
    try {
      const [d, team, r] = await Promise.all([loadLeague(force), myTeam().catch(() => null), myReminders().catch(() => new Set<number>())]);
      dataRef.current = d;
      setData(d); setMine(team); setRem(r); setFailed(false);
    } catch {
      if (!dataRef.current) setFailed(true);
    }
  }, []);

  // وقت المباريات: نحدّث كل دقيقة (الخادم يجيب الجديد كل ٥ دقايق)
  useFocusEffect(useCallback(() => {
    load(true);
    const id = setInterval(() => {
      const d = dataRef.current;
      const now = Date.now();
      const busy = d?.matches.some((m) => stateOf(m, now) === 'live'
        || (stateOf(m, now) === 'upcoming' && Math.abs(Date.parse(m.kickoff) - now) < 10 * 60_000));
      if (busy) load(true);
    }, 60_000);
    return () => clearInterval(id);
  }, [load]));

  const lists = useMemo(() => {
    if (!data) return null;
    const keep = (m: LeagueMatch) => !onlyMine || involves(m, mine);
    return {
      next: upcomingMatches(data.matches).filter(keep),
      results: finishedMatches(data.matches).filter(keep),
      table: sortStandings(data.standings),
    };
  }, [data, onlyMine, mine]);

  if (failed) return <Screen edges={['bottom']}><Empty icon="cloud-offline-outline" text={t('league.loadFailed')} /></Screen>;
  if (!data || !lists) return <Loading />;

  const ready = data.settings.enabled && data.matches.length > 0;
  const myT = mine != null ? data.teams.get(mine) : undefined;

  const toggle = async (m: LeagueMatch) => {
    if (involves(m, mine)) { Alert.alert(t('league.autoRemindTitle'), t('league.autoRemindBody', { team: teamName(myT, lng) })); return; }
    const on = !rem.has(m.id);
    setRem((s) => { const n = new Set(s); if (on) n.add(m.id); else n.delete(m.id); return n; });
    try {
      await setReminder(m.id, on);
      if (on) enablePush(true).catch(() => {});
    } catch {
      setRem((s) => { const n = new Set(s); if (on) n.delete(m.id); else n.add(m.id); return n; });
      Alert.alert(t('errors.generic'));
    }
  };
  const openMatch = (m: LeagueMatch) => router.push({ pathname: '/league/[id]', params: { id: String(m.id) } });
  const list = tab === 'next' ? lists.next : lists.results;
  const shown = list.slice(0, limit);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('league.title') }} />
      <BrandGradient name="ember" style={{ borderRadius: radius.lg, overflow: 'hidden', padding: space.lg, gap: 6 }}>
        <SaduPattern variant="peaks" opacity={0.1} />
        <Row gap={6}>
          <Ionicons name="football" size={14} color={brand.amber} />
          <T size="xs" semibold color={brand.amber}>{data.season ? t('league.season', { a: data.season, b: data.season + 1 }) : t('league.eyebrow')}</T>
        </Row>
        <T size="xl" bold color={brand.cream}>{t('league.title')}</T>
        <T size="sm" color={brand.sand} style={{ lineHeight: 22 }}>{t('league.intro')}</T>
        {ready ? (
          <Pressable onPress={() => router.push('/league/team')} accessibilityRole="button"
            accessibilityLabel={myT ? t('league.myTeamIs', { team: teamName(myT, lng) }) : t('league.pickTeam')}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginTop: 6,
              backgroundColor: 'rgba(248,237,218,0.12)', borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12 }, pressed && { opacity: 0.8 }]}>
            {myT ? <TeamBadge team={myT} lng={lng} size={22} /> : <Ionicons name="star-outline" size={16} color={brand.amber} />}
            <T size="sm" semibold color={brand.cream}>{myT ? t('league.myTeamIs', { team: teamName(myT, lng) }) : t('league.pickTeam')}</T>
            <Ionicons name="create-outline" size={14} color={brand.sand} />
          </Pressable>
        ) : null}
      </BrandGradient>

      {!ready ? (
        <Empty icon="football-outline" text={data.settings.enabled ? t('league.noData') : t('league.soon')} />
      ) : (
        <>
          <Pressable onPress={() => router.push('/league/predictions')} accessibilityRole="button" accessibilityLabel={t('league.predTitle')}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, borderWidth: 1.5,
              borderColor: brand.amber, borderRadius: radius.lg, padding: space.md }, pressed && { opacity: 0.85 }]}>
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: brand.amber, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="trophy" size={20} color={brand.deepGreen} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T semibold>{t('league.predTitle')}</T>
              <T size="xs" muted style={{ lineHeight: 18 }}>{t('league.predBannerSub')}</T>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} style={{ transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }] }} />
          </Pressable>
          <Segmented<Tab> value={tab} onChange={(v) => { setTab(v); setLimit(PAGE); }}
            options={[{ value: 'next', label: t('league.tabNext') }, { value: 'results', label: t('league.tabResults') },
              { value: 'table', label: t('league.tabTable') }, { value: 'scorers', label: t('league.tabScorers') }]} />

          {(tab === 'next' || tab === 'results') && mine != null ? (
            <Segmented<'all' | 'mine'> wrap value={onlyMine ? 'mine' : 'all'} onChange={(v) => { setOnlyMine(v === 'mine'); setLimit(PAGE); }}
              options={[{ value: 'all', label: t('league.allMatches') }, { value: 'mine', label: t('league.onlyMine', { team: teamName(myT, lng) }) }]} />
          ) : null}

          {tab === 'table' ? (
            <StandingsTable data={data} mine={mine} lng={lng} />
          ) : tab === 'scorers' ? (
            <TopScorers data={data} mine={mine} lng={lng} />
          ) : shown.length ? (
            <View style={{ gap: space.sm }}>
              {groupByDay(shown).map((g, i) => (
                <View key={`${g.day}-${i}`} style={{ gap: space.sm }}>
                  <DayHeader title={matchDayTitle(g.day, lng)} />
                  {g.rows.map((m) => (
                    <MatchRow key={m.id} m={m} teams={data.teams} lng={lng} mine={mine} onPress={() => openMatch(m)}
                      reminded={rem.has(m.id) || involves(m, mine)} onRemind={canRemind(m) ? () => toggle(m) : undefined} />
                  ))}
                </View>
              ))}
              {list.length > shown.length ? (
                <Button variant="secondary" small icon="chevron-down" title={t('league.more')} onPress={() => setLimit((n) => n + PAGE)} />
              ) : null}
            </View>
          ) : (
            <Empty icon="football-outline" text={tab === 'next' ? t('league.noNext') : t('league.noResults')} />
          )}
        </>
      )}

      <T size="xs" muted center style={{ lineHeight: 19 }}>{t('league.sourceNote')}</T>
      <SourceCredit />
    </Screen>
  );
}

function TopScorers({ data, mine, lng }: { data: LeagueData; mine: number | null; lng: string }) {
  const { t } = useTranslation();
  const [list, setList] = useState<Scorer[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [ar, setAr] = useState<ReadonlyMap<string, string> | null>(null);
  useEffect(() => {
    let live = true;
    if (data.season == null) { setList([]); return; }
    loadScorers(data.season).then((l) => {
      if (!live) return;
      setList(l);
      if (lng !== 'en') loadPlayerNames(l.map((x) => x.name)).then((m) => { if (live) setAr(m); }).catch(() => {});
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [data.season, lng]);
  const nm = nameFor(ar, lng);
  if (failed) return <Empty icon="cloud-offline-outline" text={t('league.loadFailed')} />;
  if (!list) return <Loading />;
  if (!list.length) return <Empty icon="football-outline" text={t('league.noScorers')} />;
  return (
    <View style={{ gap: space.sm }}>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.cardAlt }}>
          <T size="xs" muted style={{ width: 24, textAlign: 'center' }}>#</T>
          <T size="xs" muted style={{ flex: 1 }}>{t('league.player')}</T>
          <T size="xs" muted style={{ width: 44, textAlign: 'center' }}>{t('league.assists')}</T>
          <T size="xs" semibold style={{ width: 44, textAlign: 'center' }}>{t('league.goals')}</T>
        </View>
        {list.map((s, i) => {
          const team = s.team != null ? data.teams.get(s.team) : undefined;
          const me = s.team != null && s.team === mine;
          return (
            <View key={`${s.rank}-${s.name}`} accessible
              accessibilityLabel={`${s.rank}. ${nm(s.name)}، ${teamName(team, lng)}، ${s.goals} ${t('league.goals')}${s.assists != null ? `، ${s.assists} ${t('league.assists')}` : ''}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border,
                backgroundColor: me ? 'rgba(254,169,79,0.18)' : undefined }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: s.rank <= 3 ? brand.amber : 'transparent' }}>
                <T size="sm" bold color={s.rank <= 3 ? brand.deepGreen : colors.text}>{s.rank}</T>
              </View>
              <TeamBadge team={team} lng={lng} size={28} />
              <View style={{ flex: 1, gap: 1 }}>
                <T size="sm" semibold numberOfLines={1}>{nm(s.name)}</T>
                <T size="xs" muted numberOfLines={1}>{team ? teamName(team, lng) : '—'}{s.matches != null ? ` · ${t('league.matchesN', { n: s.matches })}` : ''}</T>
              </View>
              <T size="sm" muted style={{ width: 44, textAlign: 'center' }}>{s.assists ?? '—'}</T>
              <T size="lg" bold style={{ width: 44, textAlign: 'center' }}>{s.goals}</T>
            </View>
          );
        })}
      </Card>
      <T size="xs" muted center>{t('league.namesNote')}</T>
    </View>
  );
}

function StandingsTable({ data, mine, lng }: { data: LeagueData; mine: number | null; lng: string }) {
  const { t } = useTranslation();
  const rows = sortStandings(data.standings);
  if (!rows.length) return <Empty icon="podium-outline" text={t('league.noTable')} />;
  const num = { width: 30, textAlign: 'center' as const };
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.cardAlt }}>
        <T size="xs" muted style={{ width: 22, textAlign: 'center' }}>#</T>
        <T size="xs" muted style={{ flex: 1 }}>{t('league.team')}</T>
        <T size="xs" muted style={num}>{t('league.played')}</T>
        <T size="xs" muted style={[num, { width: 36 }]}>{t('league.gd')}</T>
        <T size="xs" semibold style={[num, { width: 34 }]}>{t('league.pts')}</T>
      </View>
      {rows.map((s, i) => {
        const team = data.teams.get(s.team_id);
        const me = s.team_id === mine;
        return (
          <View key={s.team_id} accessible accessibilityLabel={`${s.rank}. ${teamName(team, lng)}، ${s.points} ${t('league.pts')}`}
            style={{ paddingHorizontal: 10, paddingVertical: 9, gap: 6, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border,
              backgroundColor: me ? 'rgba(254,169,79,0.18)' : undefined }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <T size="sm" bold style={{ width: 22, textAlign: 'center' }}>{s.rank}</T>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TeamBadge team={team} lng={lng} size={24} />
                <T size="sm" semibold={me} numberOfLines={1} style={{ flexShrink: 1 }}>{teamName(team, lng)}</T>
                {me ? <Ionicons name="star" size={12} color={brand.orange} /> : null}
              </View>
              <T size="sm" style={num}>{s.played ?? '—'}</T>
              <T size="sm" muted style={[num, { width: 36 }]}>{signed(goalDiff(s))}</T>
              <T size="sm" bold style={[num, { width: 34 }]}>{s.points}</T>
            </View>
            <View style={{ paddingStart: 28 + 32 }}>
              <FormDots form={formOf(s.team_id, data.standings, data.matches)} size={14} />
            </View>
          </View>
        );
      })}
    </Card>
  );
}
