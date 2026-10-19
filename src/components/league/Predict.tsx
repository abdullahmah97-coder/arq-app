// توقعات المباريات: بطاقة «توقّع النتيجة» (قبل البداية تعدّل، بعدها تشوف توقعك والنتيجة ونقاطك)، توقعات الجمهور،
// أصدقاؤك (نتايجهم تنكشف مع صافرة البداية)، مقارنة الفريقين قبل المباراة، وبطاقة منشور التوقع في التايم لاين
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Text, View } from 'react-native';
import { FormDots, TeamBadge } from '@/components/league/LeagueParts';
import { Avatar, Button, Card, Row, T } from '@/components/ui';
import { useLocalized } from '@/lib/i18n';
import {
  crowdShares, formOf, lastResults, loadPostPrediction, predErrorKey, predict, predLocked, PRED_MAX_GOALS, resultFor, sharePrediction,
  stateOf, teamName, type LeagueData, type LeagueMatch, type LeagueTeam, type PostPrediction, type PredSummary, type Scorer,
} from '@/lib/league';
import { publicUrl } from '@/lib/supabase';
import { brand, colors, fonts, radius, space } from '@/theme';

const GREEN = '#1E9E5A';

function Score2({ h, a, size = 16, color = colors.text }: { h: number; a: number; size?: number; color?: string }) {
  const s = { color, fontFamily: fonts.title, fontSize: size };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.25 }}>
      <Text allowFontScaling={false} style={s}>{h}</Text>
      <Text allowFontScaling={false} style={[s, { opacity: 0.55 }]}>-</Text>
      <Text allowFontScaling={false} style={s}>{a}</Text>
    </View>
  );
}

/** شارة النقاط: +٣ بالضبط / +١ الفائز / ما ضبط */
export function PointsBadge({ points, small }: { points: number | null | undefined; small?: boolean }) {
  const { t } = useTranslation();
  if (points == null) return null;
  const bg = points >= 3 ? GREEN : points === 1 ? brand.amber : colors.cardAlt;
  const fg = points >= 3 ? '#FFFFFF' : points === 1 ? brand.deepGreen : colors.muted;
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: small ? 7 : 10, paddingVertical: small ? 1 : 3 }}>
      <Text allowFontScaling={false} style={{ color: fg, fontFamily: fonts.semibold, fontSize: small ? 11 : 12 }}>
        {t(`league.predPts_${points >= 3 ? 3 : points === 1 ? 1 : 0}`)}
      </Text>
    </View>
  );
}

function Stepper({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const btn = (icon: 'remove' | 'add', disabled: boolean, next: number) => (
    <Pressable onPress={() => onChange(next)} disabled={disabled} hitSlop={6} accessibilityRole="button"
      accessibilityLabel={`${label} ${icon === 'add' ? '+' : '−'}`}
      style={({ pressed }) => [{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
        backgroundColor: disabled ? colors.cardAlt : brand.deepGreen, opacity: disabled ? 0.5 : 1 }, pressed && { opacity: 0.8 }]}>
      <Ionicons name={icon} size={20} color={disabled ? colors.muted : brand.cream} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessible accessibilityRole="adjustable" accessibilityLabel={`${label}: ${value}`}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onChange(Math.max(0, Math.min(PRED_MAX_GOALS, value + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))}>
      {btn('remove', value <= 0, value - 1)}
      <Text allowFontScaling={false} style={{ fontFamily: fonts.title, fontSize: 34, minWidth: 30, textAlign: 'center', color: colors.text }}>{value}</Text>
      {btn('add', value >= PRED_MAX_GOALS, value + 1)}
    </View>
  );
}

/** توقعات الجمهور: فوز المستضيف / تعادل / فوز الضيف */
function CrowdBar({ s, home, away, lng }: { s: PredSummary; home?: LeagueTeam; away?: LeagueTeam; lng: string }) {
  const { t } = useTranslation();
  const sh = crowdShares(s);
  if (!sh) return null;
  const seg = (pct: number, bg: string) => (pct > 0 ? <View style={{ flex: pct, backgroundColor: bg }} /> : null);
  const lab = (pct: number, text: string, align: 'left' | 'center' | 'right') => (
    <View style={{ flex: 1 }}>
      <T size="sm" bold style={{ textAlign: align }}>{pct}%</T>
      <T size="xs" muted numberOfLines={1} style={{ textAlign: align }}>{text}</T>
    </View>
  );
  return (
    <View style={{ gap: 6 }} accessible
      accessibilityLabel={`${t('league.predCrowd')}: ${teamName(home, lng)} ${sh.home}%، ${t('league.predDraw')} ${sh.draw}%، ${teamName(away, lng)} ${sh.away}%`}>
      <Row gap={6}>
        <Ionicons name="people-outline" size={15} color={colors.muted} />
        <T size="sm" semibold style={{ flex: 1 }}>{t('league.predCrowd')}</T>
        <T size="xs" muted>{t('league.predCrowdN', { count: s.total })}</T>
      </Row>
      <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2, backgroundColor: colors.cardAlt }}>
        {seg(sh.home, brand.green)}{seg(sh.draw, '#9AA69E')}{seg(sh.away, brand.orange)}
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {lab(sh.home, teamName(home, lng), 'left')}
        {lab(sh.draw, t('league.predDraw'), 'center')}
        {lab(sh.away, teamName(away, lng), 'right')}
      </View>
    </View>
  );
}

/** أصدقاؤك اللي توقّعوا: قبل البداية أسماء بس، بعدها توقعاتهم ونقاطهم */
function FriendsPicks({ s }: { s: PredSummary }) {
  const { t } = useTranslation();
  if (!s.friends.length) return <T size="xs" muted style={{ lineHeight: 19 }}>{t('league.predFriendsEmpty')}</T>;
  return (
    <View style={{ gap: 8 }}>
      <Row gap={6}>
        <Ionicons name="heart-outline" size={15} color={colors.muted} />
        <T size="sm" semibold style={{ flex: 1 }}>{t('league.predFriends', { count: s.friends.length })}</T>
        {!s.locked ? <Ionicons name="lock-closed-outline" size={13} color={colors.muted} /> : null}
      </Row>
      {!s.locked ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ flexDirection: 'row' }}>
            {s.friends.slice(0, 6).map((f, i) => (
              <View key={f.user_id} style={{ marginStart: i ? -8 : 0, borderWidth: 2, borderColor: colors.card, borderRadius: 16 }}>
                <Avatar uri={publicUrl('avatars', f.avatar_url)} name={f.full_name || f.username} size={28} />
              </View>
            ))}
          </View>
          <T size="xs" muted style={{ flex: 1, lineHeight: 18 }}>{t('league.predFriendsHidden')}</T>
        </View>
      ) : (
        s.friends.slice(0, 12).map((f) => (
          <Pressable key={f.user_id} onPress={() => router.push({ pathname: '/user/[id]', params: { id: f.user_id } })} accessibilityRole="link"
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Avatar uri={publicUrl('avatars', f.avatar_url)} name={f.full_name || f.username} size={30} />
            <T size="sm" numberOfLines={1} style={{ flex: 1 }}>{f.full_name || f.username}</T>
            {f.home != null && f.away != null ? <Score2 h={f.home} a={f.away} size={15} /> : null}
            <PointsBadge points={f.points} small />
          </Pressable>
        ))
      )}
    </View>
  );
}

/** بطاقة «توقّع النتيجة»: قبل البداية تختار وتثبّت وتنشر، وبعدها تشوف توقعك والنتيجة ونقاطك، والجمهور وأصدقاؤك */
export function PredictCard({ m, home, away, lng, summary, onChanged }: {
  m: LeagueMatch; home?: LeagueTeam; away?: LeagueTeam; lng: string; summary: PredSummary | null; onChanged: () => void;
}) {
  const { t } = useTranslation();
  const locked = predLocked(m) || summary?.locked === true;
  const mine = summary?.mine ?? null;
  const [h, setH] = useState(mine?.home ?? 0);
  const [a, setA] = useState(mine?.away ?? 0);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  useEffect(() => { if (mine) { setH(mine.home); setA(mine.away); } }, [mine?.home, mine?.away]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = stateOf(m);
  const same = !!mine && mine.home === h && mine.away === a;

  const save = async () => {
    setBusy(true);
    try { await predict(m.id, h, a); onChanged(); } catch (e) { Alert.alert(t(predErrorKey((e as Error)?.message))); } finally { setBusy(false); }
  };
  const share = async () => {
    setSharing(true);
    try { await sharePrediction(m.id); onChanged(); } catch (e) { Alert.alert(t(predErrorKey((e as Error)?.message))); } finally { setSharing(false); }
  };

  return (
    <Card style={{ gap: space.md }}>
      <Row gap={8}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: brand.amber, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="trophy" size={16} color={brand.deepGreen} />
        </View>
        <View style={{ flex: 1 }}>
          <T semibold>{t(locked ? 'league.predYours' : 'league.predCardTitle')}</T>
          <T size="xs" muted>{t('league.predRules')}</T>
        </View>
      </Row>

      {!locked ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
            {[{ team: home, v: h, set: setH }, { team: away, v: a, set: setA }].map((x, i) => (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
                <TeamBadge team={x.team} lng={lng} size={44} />
                <T size="sm" semibold center numberOfLines={1}>{teamName(x.team, lng)}</T>
                <Stepper value={x.v} onChange={x.set} label={teamName(x.team, lng)} />
              </View>
            ))}
          </View>
          <Button icon={same ? 'checkmark-circle' : 'football-outline'} loading={busy} disabled={same}
            title={same ? t('league.predSaved') : mine ? t('league.predUpdate') : t('league.predSave')} onPress={save} />
          <T size="xs" muted center>{t('league.predLockNote')}</T>
          {mine ? (
            mine.shared ? (
              <Row gap={6} style={{ justifyContent: 'center' }}>
                <Ionicons name="checkmark-circle" size={15} color={GREEN} />
                <T size="sm" color={GREEN}>{t('league.predShared')}</T>
              </Row>
            ) : (
              <Button variant="secondary" small icon="share-social-outline" loading={sharing} title={t('league.predShare')} onPress={share} />
            )
          ) : null}
        </>
      ) : mine ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: colors.cardAlt, borderRadius: radius.md, paddingVertical: space.md }}>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <T size="xs" muted>{t('league.predYours')}</T>
            <Score2 h={mine.home} a={mine.away} size={26} />
          </View>
          {st === 'live' || st === 'finished' ? (
            <View style={{ alignItems: 'center', gap: 4 }}>
              <T size="xs" muted>{t(st === 'live' ? 'league.predNowLabel' : 'league.predFinalLabel')}</T>
              <Score2 h={m.home_goals ?? 0} a={m.away_goals ?? 0} size={26} color={st === 'live' ? '#E5322D' : colors.text} />
            </View>
          ) : null}
          {mine.points != null ? <PointsBadge points={mine.points} /> : null}
        </View>
      ) : (
        <T size="sm" muted center>{t('league.predNone')}</T>
      )}

      {summary ? <CrowdBar s={summary} home={home} away={away} lng={lng} /> : null}
      {summary ? <FriendsPicks s={summary} /> : null}

      <Pressable onPress={() => router.push('/league/predictions')} accessibilityRole="link"
        style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 }, pressed && { opacity: 0.7 }]}>
        <Ionicons name="podium-outline" size={15} color={colors.primary} />
        <T size="sm" semibold color={colors.primary}>{t('league.predBoardLink')}</T>
      </Pressable>
    </Card>
  );
}

// ---------- قبل المباراة: مقارنة الفريقين ----------

export function PreviewCompare({ data, m, lng, scorers, nm }: {
  data: LeagueData; m: LeagueMatch; lng: string; scorers: Scorer[]; nm: (n: string) => string;
}) {
  const { t } = useTranslation();
  const home = data.teams.get(m.home_id);
  const away = data.teams.get(m.away_id);
  const sh = data.standings.find((s) => s.team_id === m.home_id);
  const sa = data.standings.find((s) => s.team_id === m.away_id);
  const top = (id: number) => scorers.find((s) => s.team === id);
  const th = top(m.home_id);
  const ta = top(m.away_id);
  const rows: { label: string; h: string; a: string; better?: 'h' | 'a' | null }[] = [];
  const cmp = (x: number | null | undefined, y: number | null | undefined, lowerBetter = false): 'h' | 'a' | null =>
    x == null || y == null || x === y ? null : (lowerBetter ? x < y : x > y) ? 'h' : 'a';
  if (sh || sa) {
    rows.push({ label: t('league.cmpRank'), h: sh ? `#${sh.rank}` : '—', a: sa ? `#${sa.rank}` : '—', better: cmp(sh?.rank, sa?.rank, true) });
    rows.push({ label: t('league.cmpPoints'), h: String(sh?.points ?? '—'), a: String(sa?.points ?? '—'), better: cmp(sh?.points, sa?.points) });
    // «٧ف · ٠ت · ١خ»: الحرف جنب الرقم عشان يقرا صح بالعربي والإنجليزي
    const wdl = (x: typeof sh) => (x ? `${x.win ?? 0}${t('league.formShort_W')} · ${x.draw ?? 0}${t('league.formShort_D')} · ${x.lose ?? 0}${t('league.formShort_L')}` : '—');
    rows.push({ label: t('league.cmpWDL'), h: wdl(sh), a: wdl(sa) });
    rows.push({ label: t('league.cmpGF'), h: String(sh?.goals_for ?? '—'), a: String(sa?.goals_for ?? '—'), better: cmp(sh?.goals_for, sa?.goals_for) });
    rows.push({ label: t('league.cmpGA'), h: String(sh?.goals_against ?? '—'), a: String(sa?.goals_against ?? '—'), better: cmp(sh?.goals_against, sa?.goals_against, true) });
  }
  const last = (id: number) => lastResults(data.matches, id, 3);
  const ResultsCol = ({ id }: { id: number }) => (
    <View style={{ flex: 1, gap: 6 }}>
      {last(id).map((x) => {
        const opp = data.teams.get(x.home_id === id ? x.away_id : x.home_id);
        const r = resultFor(x, id);
        const mineG = x.home_id === id ? x.home_goals : x.away_goals;
        const theirG = x.home_id === id ? x.away_goals : x.home_goals;
        return (
          <Pressable key={x.id} onPress={() => router.push({ pathname: '/league/[id]', params: { id: String(x.id) } })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityRole="link"
            accessibilityLabel={`${teamName(opp, lng)} ${mineG}-${theirG}`}>
            <View style={{ width: 18, height: 18, borderRadius: 5, alignItems: 'center', justifyContent: 'center',
              backgroundColor: r === 'W' ? brand.green : r === 'L' ? '#C23A12' : '#9AA69E' }}>
              <Text allowFontScaling={false} style={{ color: '#fff', fontFamily: fonts.semibold, fontSize: 10 }}>{t(`league.formShort_${r ?? 'D'}`)}</Text>
            </View>
            <TeamBadge team={opp} lng={lng} size={18} />
            <T size="xs" numberOfLines={1} style={{ flex: 1 }}>{teamName(opp, lng)}</T>
            <Score2 h={mineG ?? 0} a={theirG ?? 0} size={12} />
          </Pressable>
        );
      })}
      {!last(id).length ? <T size="xs" muted>—</T> : null}
    </View>
  );

  return (
    <Card style={{ gap: space.md }}>
      <Row gap={space.sm}>
        <TeamBadge team={home} lng={lng} size={28} />
        <T semibold center style={{ flex: 1 }}>{t('league.preview')}</T>
        <TeamBadge team={away} lng={lng} size={28} />
      </Row>
      {rows.map((r) => (
        <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
          <T size="sm" bold={r.better === 'h'} muted={r.better === 'a'} style={{ minWidth: 64 }}>{r.h}</T>
          <T size="xs" muted center style={{ flex: 1 }}>{r.label}</T>
          <T size="sm" bold={r.better === 'a'} muted={r.better === 'h'} style={{ minWidth: 64, textAlign: 'right' }}>{r.a}</T>
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
        <View style={{ minWidth: 64, alignItems: 'flex-start' }}><FormDots form={formOf(m.home_id, data.standings, data.matches)} size={14} /></View>
        <T size="xs" muted center style={{ flex: 1 }}>{t('league.cmpForm')}</T>
        <View style={{ minWidth: 64, alignItems: 'flex-end' }}><FormDots form={formOf(m.away_id, data.standings, data.matches)} size={14} /></View>
      </View>
      {th || ta ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 6 }}>
          <View style={{ flex: 1 }}>
            {th ? <T size="sm" semibold numberOfLines={1}>{nm(th.name)}</T> : <T size="sm" muted>—</T>}
            {th ? <T size="xs" muted>{t('league.goalsN', { count: th.goals })}</T> : null}
          </View>
          <T size="xs" muted center style={{ width: 80 }}>{t('league.cmpTopScorer')}</T>
          <View style={{ flex: 1 }}>
            {ta ? <T size="sm" semibold numberOfLines={1} style={{ textAlign: 'right' }}>{nm(ta.name)}</T> : <T size="sm" muted style={{ textAlign: 'right' }}>—</T>}
            {ta ? <T size="xs" muted style={{ textAlign: 'right' }}>{t('league.goalsN', { count: ta.goals })}</T> : null}
          </View>
        </View>
      ) : null}
      <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 8 }}>
        <T size="xs" muted center>{t('league.lastMatches')}</T>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <ResultsCol id={m.home_id} />
          <View style={{ width: 1, backgroundColor: colors.border }} />
          <ResultsCol id={m.away_id} />
        </View>
      </View>
    </Card>
  );
}

// ---------- منشور التوقع في التايم لاين ----------

const postTeam = (p: PostPrediction, side: 'home' | 'away'): LeagueTeam => ({
  id: side === 'home' ? p.home_id : p.away_id,
  name: side === 'home' ? p.home_name : p.away_name,
  name_ar: side === 'home' ? p.home_ar : p.away_ar,
  logo_url: side === 'home' ? p.home_logo : p.away_logo,
});

export function PredictionPostCard({ postId }: { postId: string }) {
  const { t } = useTranslation();
  const [p, setP] = useState<PostPrediction | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    loadPostPrediction(postId).then((v) => { if (live) setP(v); }).catch(() => { if (live) setP(null); });
    return () => { live = false; };
  }, [postId]);
  const { lng } = useLocalized();
  if (!p) return null;
  const home = postTeam(p, 'home');
  const away = postTeam(p, 'away');
  const st = stateOf({ status: p.status, kickoff: p.kickoff });
  return (
    <Pressable onPress={() => router.push({ pathname: '/league/[id]', params: { id: String(p.match) } })} accessibilityRole="link"
      accessibilityLabel={`${teamName(home, lng)} ${t('league.vs')} ${teamName(away, lng)}: ${p.pred_home}-${p.pred_away}`}
      style={({ pressed }) => [{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: space.md, gap: 8 },
        pressed && { opacity: 0.85 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <TeamBadge team={home} lng={lng} size={34} />
          <T size="xs" semibold center numberOfLines={1}>{teamName(home, lng)}</T>
        </View>
        <View style={{ alignItems: 'center', gap: 2, minWidth: 80 }}>
          <T size="xs" muted>{t('league.predPostTitle')}</T>
          <Score2 h={p.pred_home} a={p.pred_away} size={24} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <TeamBadge team={away} lng={lng} size={34} />
          <T size="xs" semibold center numberOfLines={1}>{teamName(away, lng)}</T>
        </View>
      </View>
      {st === 'live' || st === 'finished' ? (
        <Row gap={8} style={{ justifyContent: 'center' }}>
          <T size="xs" muted>{t(st === 'live' ? 'league.predNowLabel' : 'league.predFinalLabel')}</T>
          <Score2 h={p.home_goals ?? 0} a={p.away_goals ?? 0} size={14} />
          {p.points != null ? <PointsBadge points={p.points} small /> : null}
        </Row>
      ) : (
        <Row gap={6} style={{ justifyContent: 'center' }}>
          <Ionicons name="trophy-outline" size={13} color={colors.primary} />
          <T size="xs" semibold color={colors.primary}>{t('league.predChallenge')}</T>
        </Row>
      )}
    </Pressable>
  );
}
