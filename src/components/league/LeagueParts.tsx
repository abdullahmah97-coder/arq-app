// قطع الدوري السعودي: شارة الفريق (حرف بألوان النادي بدل الشعار)، نقطة «مباشر»، شكل الفريق، وسطر المباراة،
// وسطر مصدر البيانات (شروط SportScore تطلب «Powered by SportScore» ظاهر في كل شاشة تعرض بياناتهم)
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { T } from '@/components/ui';
import {
  kickoffClock, liveLabel, stateOf, teamColors, teamInitial, teamName, type LeagueMatch, type LeagueTeam,
} from '@/lib/leagueCore';
import { brand, colors, fonts, radius, space } from '@/theme';

export const LIVE_RED = '#E5322D';

export function TeamBadge({ team, size = 34, lng }: { team: LeagueTeam | undefined; size?: number; lng: string }) {
  const c = teamColors(team);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: 'rgba(255,255,255,0.75)' }} accessibilityElementsHidden importantForAccessibility="no">
      <Text allowFontScaling={false} style={{ color: c.fg, fontFamily: fonts.title, fontSize: size * 0.44, lineHeight: size * 0.62 }}>
        {teamInitial(team, lng)}
      </Text>
    </View>
  );
}

/** نقطة حمرا تنبض */
export function LiveDot({ size = 8, color = LIVE_RED }: { size?: number; color?: string }) {
  const a = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 0.25, duration: 650, useNativeDriver: true }),
      Animated.timing(a, { toValue: 1, duration: 650, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [a]);
  return <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: a }} />;
}

/** «مباشر 63'» */
export function LivePill({ m, small }: { m: Pick<LeagueMatch, 'status' | 'elapsed'>; small?: boolean }) {
  const { t } = useTranslation();
  const l = liveLabel(m);
  return (
    <View style={[styles.livePill, small && { paddingHorizontal: 6, paddingVertical: 1 }]}>
      <LiveDot size={small ? 6 : 7} color={brand.cream} />
      <Text allowFontScaling={false} style={{ color: brand.cream, fontFamily: fonts.semibold, fontSize: small ? 10 : 11 }}>
        {'minute' in l ? l.minute : t(l.key)}
      </Text>
    </View>
  );
}

const FORM_COLOR = { W: brand.green, D: '#9AA69E', L: '#C23A12' } as const;

/** آخر ٥ نتائج (الأحدث آخر شي): ف / ت / خ */
export function FormDots({ form, size = 18 }: { form: string[]; size?: number }) {
  const { t } = useTranslation();
  if (!form.length) return <T size="xs" muted>—</T>;
  return (
    <View style={{ flexDirection: 'row', gap: 3 }} accessible accessibilityLabel={form.map((f) => t(`league.form_${f}`)).join('، ')}>
      {form.map((f, i) => (
        <View key={i} style={{ width: size, height: size, borderRadius: 5, backgroundColor: FORM_COLOR[f as 'W'] ?? '#9AA69E', alignItems: 'center', justifyContent: 'center' }}>
          <Text allowFontScaling={false} style={{ color: '#fff', fontFamily: fonts.semibold, fontSize: size * 0.55 }}>{t(`league.formShort_${f}`)}</Text>
        </View>
      ))}
    </View>
  );
}

/** النتيجة: كل رقم بجهة فريقه (الصف ينقلب مع العربي، فرقم المستضيف جنب اسمه) */
export function Score({ m, size = 20, color = colors.text }: { m: Pick<LeagueMatch, 'home_goals' | 'away_goals'>; size?: number; color?: string }) {
  const s = { color, fontFamily: fonts.title, fontSize: size };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.3 }}>
      <Text allowFontScaling={false} style={s}>{m.home_goals ?? 0}</Text>
      <Text allowFontScaling={false} style={[s, { opacity: 0.6 }]}>-</Text>
      <Text allowFontScaling={false} style={s}>{m.away_goals ?? 0}</Text>
    </View>
  );
}

/** سطر مباراة في القائمة: المستضيف — الوقت أو النتيجة — الضيف، وجرس التذكير للقادمة */
export function MatchRow({ m, teams, lng, mine, reminded, onRemind, onPress }: {
  m: LeagueMatch; teams: Map<number, LeagueTeam>; lng: string; mine?: number | null;
  reminded?: boolean; onRemind?: () => void; onPress: () => void;
}) {
  const { t } = useTranslation();
  const st = stateOf(m);
  const home = teams.get(m.home_id);
  const away = teams.get(m.away_id);
  const done = st === 'finished';
  const hw = done && (m.home_goals ?? 0) > (m.away_goals ?? 0);
  const aw = done && (m.away_goals ?? 0) > (m.home_goals ?? 0);
  const label = `${teamName(home, lng)} ${t('league.vs')} ${teamName(away, lng)}`;
  const highlight = mine != null && (m.home_id === mine || m.away_id === mine);

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [styles.row, { backgroundColor: colors.card, borderColor: st === 'live' ? LIVE_RED : highlight ? brand.amber : colors.border },
        st === 'live' && { borderWidth: 1.5 }, pressed && { opacity: 0.85 }]}>
      <View style={styles.side}>
        <TeamBadge team={home} lng={lng} size={30} />
        <T size="sm" semibold={!aw} muted={aw} numberOfLines={2} style={{ flexShrink: 1, lineHeight: 20 }}>{teamName(home, lng)}</T>
      </View>

      <View style={styles.center}>
        {st === 'upcoming' ? (
          <>
            <T bold size="md">{kickoffClock(m.kickoff, lng)}</T>
            {m.status === 'TBD' ? <T size="xs" muted>{t('league.tbd')}</T> : null}
          </>
        ) : st === 'off' ? (
          <T size="xs" semibold color={colors.danger}>{t(`league.st_${m.status}`, { defaultValue: t('league.st_off') })}</T>
        ) : (
          <>
            <Score m={m} size={19} color={st === 'live' ? LIVE_RED : colors.text} />
            {st === 'live' ? <LivePill m={m} small /> : <T size="xs" muted>{t(m.status === 'PEN' ? 'league.st_PEN' : m.status === 'AET' ? 'league.st_AET' : 'league.ft')}</T>}
          </>
        )}
      </View>

      <View style={[styles.side, { flexDirection: 'row-reverse' }]}>
        <TeamBadge team={away} lng={lng} size={30} />
        <T size="sm" semibold={!hw} muted={hw} numberOfLines={2} style={{ flexShrink: 1, lineHeight: 20 }}>{teamName(away, lng)}</T>
      </View>

      {onRemind ? (
        <Pressable onPress={onRemind} hitSlop={10} accessibilityRole="switch" accessibilityState={{ checked: !!reminded }}
          accessibilityLabel={t('league.remind')} style={styles.bell}>
          <Ionicons name={reminded ? 'notifications' : 'notifications-outline'} size={18} color={reminded ? brand.orange : colors.muted} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

/** عنوان اليوم في القائمة */
export function DayHeader({ title }: { title: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs }}>
      <View style={{ width: 4, height: 16, borderRadius: 2, backgroundColor: brand.orange }} />
      <T semibold size="sm">{title}</T>
    </View>
  );
}

/** مصدر البيانات: «Powered by SportScore» برابط لموقعهم (شرط الخطة المجانية، ما يتشال ولا يتغير نصه) */
export const SOURCE_URL = 'https://sportscore.com';
export function SourceCredit({ color = colors.muted, size = 12 }: { color?: string; size?: number }) {
  return (
    <Pressable onPress={() => Linking.openURL(SOURCE_URL).catch(() => {})} accessibilityRole="link" accessibilityLabel="Powered by SportScore"
      hitSlop={8} style={{ alignSelf: 'center', paddingVertical: 2 }}>
      <Text allowFontScaling={false} style={{ color, fontSize: size, fontFamily: fonts.body, textDecorationLine: 'underline' }}>Powered by SportScore</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.lg, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 10 },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  center: { minWidth: 76, alignItems: 'center', gap: 2 },
  bell: { width: 28, alignItems: 'center' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: LIVE_RED, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
});
