// مربع «الدوري السعودي» في الرئيسية تحت المتاجر والبطولات: مباراة مباشرة بنتيجتها ودقيقتها، أو مباراة فريقك الجاية،
// أو أقرب مباراة. يختفي لين يشغّل المالك الدوري وتوصل أول بيانات. واللي ما اختار فريقه يشوف سطر «اختر فريقك» (يقدر يخفيه)
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { NT } from '@/components/pulse/widgets';
import { LONG_PRESS_MS, useHomeLongPress } from '@/lib/homeLayout';
import { useLocalized } from '@/lib/i18n';
import { kickoffLabel, loadLeague, myTeam, spotlight, stateOf, teamName, type LeagueData, type LeagueMatch } from '@/lib/league';
import { brand } from '@/theme';
import { LivePill, Score, SourceCredit, TeamBadge } from './LeagueParts';
import { TeamInviteRow } from './TeamInvite';

export function HomeLeagueTile() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const longPress = useHomeLongPress();
  const [data, setData] = useState<LeagueData | null>(null);
  // undefined = ما ندري للحين (ما نعرض دعوة «اختر فريقك»)، null = بدون فريق
  const [mine, setMine] = useState<number | null | undefined>(undefined);

  useFocusEffect(useCallback(() => {
    let dead = false;
    Promise.all([loadLeague(), myTeam().catch(() => undefined)])
      .then(([d, team]) => { if (!dead) { setData(d); if (team !== undefined) setMine(team); } })
      .catch(() => {});
    return () => { dead = true; };
  }, []));

  if (!data || !data.settings.enabled || !data.matches.length) return null;
  const m: LeagueMatch | null = spotlight(data.matches, mine ?? null);
  const st = m ? stateOf(m) : null;
  const home = m ? data.teams.get(m.home_id) : undefined;
  const away = m ? data.teams.get(m.away_id) : undefined;
  const open = () => (m ? router.push({ pathname: '/league/[id]', params: { id: String(m.id) } }) : router.push('/league'));

  return (
    <Pressable onPress={() => router.push('/league')} onLongPress={longPress} delayLongPress={LONG_PRESS_MS}
      accessibilityRole="button" accessibilityLabel={t('league.title')} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.92 }]}>
      <LinearGradient colors={['#0E4A36', brand.deepGreen]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* خطوط الملعب */}
      <View pointerEvents="none" style={styles.pitchLine} />
      <View pointerEvents="none" style={styles.pitchCircle} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={styles.icon}><Ionicons name="football" size={18} color={brand.deepGreen} /></View>
        <View style={{ flex: 1 }}>
          <NT size={15} bold color={brand.cream}>{t('league.title')}</NT>
          <NT size={11} color={brand.sand} numberOfLines={1}>{t('league.homeSub')}</NT>
        </View>
        {st === 'live' ? <LivePill m={m!} /> : <Ionicons name="chevron-back" size={18} color={brand.sand} style={{ transform: [{ scaleX: lng === 'en' ? -1 : 1 }] }} />}
      </View>

      {m ? (
        <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${teamName(home, lng)} ${t('league.vs')} ${teamName(away, lng)}`} style={styles.match}>
          <View style={styles.side}>
            <TeamBadge team={home} lng={lng} size={36} />
            <NT size={13} semibold color={brand.cream} numberOfLines={1} style={{ flexShrink: 1 }}>{teamName(home, lng)}</NT>
          </View>
          <View style={{ alignItems: 'center', minWidth: 70 }}>
            {st === 'live' || st === 'finished' ? <Score m={m} size={22} color={brand.amber} /> : <NT size={18} bold color={brand.amber}>{t('league.vs')}</NT>}
          </View>
          <View style={[styles.side, { flexDirection: 'row-reverse' }]}>
            <TeamBadge team={away} lng={lng} size={36} />
            <NT size={13} semibold color={brand.cream} numberOfLines={1} style={{ flexShrink: 1 }}>{teamName(away, lng)}</NT>
          </View>
        </Pressable>
      ) : null}

      {m && st !== 'live' ? (
        <View style={styles.foot}>
          <Ionicons name={mine != null && (m.home_id === mine || m.away_id === mine) ? 'star' : 'time-outline'} size={13} color={brand.deepGreen} />
          <NT size={11} semibold color={brand.deepGreen} numberOfLines={1} style={{ flex: 1 }}>
            {mine != null && (m.home_id === mine || m.away_id === mine) ? t('league.myTeamNext', { when: kickoffLabel(m.kickoff, lng) }) : kickoffLabel(m.kickoff, lng)}
          </NT>
        </View>
      ) : null}
      <TeamInviteRow mine={mine} />
      {m ? <SourceCredit color={brand.sand} size={10} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: 20, overflow: 'hidden', padding: 14, gap: 12 },
  icon: { width: 34, height: 34, borderRadius: 17, backgroundColor: brand.amber, alignItems: 'center', justifyContent: 'center' },
  pitchLine: { position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, backgroundColor: 'rgba(248,237,218,0.08)' },
  pitchCircle: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 1, borderColor: 'rgba(248,237,218,0.08)', left: '50%', top: '50%', marginLeft: -60, marginTop: -60 },
  match: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(248,237,218,0.07)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(248,237,218,0.12)', paddingVertical: 12, paddingHorizontal: 10 },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: brand.amber, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
});
