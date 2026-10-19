// تفاصيل صفحة المباراة: الهدافين تحت النتيجة، شريط الأحداث، الإحصائيات بأشرطة، والتشكيلة على الملعب.
// البيانات من SportScore عبر الخادم (league_matches.events / stats / lineups)، وأسماء اللاعبين بالإنجليزي مثل ما يرسلها المزوّد.
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { TeamBadge } from '@/components/league/LeagueParts';
import { Card, Row, T } from '@/components/ui';
import {
  goalsWithSide, isGoal, lineupRows, minuteText, playerMarks, scorerLines, shortPlayer, statBars, teamColors, teamName,
  type LeagueTeam, type LineupPlayer, type Lineups, type MatchEvent,
} from '@/lib/leagueCore';
import { brand, colors, fonts, radius, space } from '@/theme';

const YELLOW = '#F5C518';
const RED = '#D7263D';
const SUB_IN = '#1E9E5A';
const HOME_BAR = brand.green;
const AWAY_BAR = brand.orange;

/** بطاقة صغيرة (صفرا / حمرا / إنذار ثاني) */
function CardIcon({ kind, size = 12 }: { kind: 'yc' | 'rc' | 'y2'; size?: number }) {
  const w = Math.round(size * 0.72);
  if (kind === 'y2') {
    return (
      <View style={{ width: w + 4, height: size }}>
        <View style={{ position: 'absolute', left: 0, top: 0, width: w, height: size, borderRadius: 2, backgroundColor: YELLOW }} />
        <View style={{ position: 'absolute', left: 4, top: 2, width: w, height: size - 2, borderRadius: 2, backgroundColor: RED }} />
      </View>
    );
  }
  return <View style={{ width: w, height: size, borderRadius: 2, backgroundColor: kind === 'yc' ? YELLOW : RED }} />;
}

/** نتيجة صغيرة (كل رقم بجهة فريقه مثل لوحة النتيجة) */
function MiniScore({ h, a, color = colors.text, size = 13 }: { h: number; a: number; color?: string; size?: number }) {
  const s = { color, fontFamily: fonts.semibold, fontSize: size };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Text allowFontScaling={false} style={s}>{h}</Text>
      <Text allowFontScaling={false} style={[s, { opacity: 0.6 }]}>-</Text>
      <Text allowFontScaling={false} style={s}>{a}</Text>
    </View>
  );
}

// ---------- تحت لوحة النتيجة ----------

/** نتيجة الشوط الأول */
export function HalfTime({ ht }: { ht: [number, number] }) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessible accessibilityLabel={`${t('league.htLabel')} ${ht[0]}-${ht[1]}`}>
      <T size="xs" color={brand.sand}>{t('league.htLabel')}</T>
      <MiniScore h={ht[0]} a={ht[1]} color={brand.sand} size={12} />
    </View>
  );
}

/** هدافين المباراة: كل فريق تحت اسمه */
export function ScorerColumns({ events }: { events: MatchEvent[] }) {
  const { t } = useTranslation();
  const lines = useMemo(() => scorerLines(events), [events]);
  if (!lines.h.length && !lines.a.length) return null;
  const col = (side: 'h' | 'a') => (
    <View style={{ flex: 1, gap: 3, alignItems: 'center' }}>
      {lines[side].slice(0, 6).map((x) => (
        <View key={x.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
          <Ionicons name="football" size={11} color={brand.amber} />
          <T size="xs" color={brand.cream} numberOfLines={1} style={{ flexShrink: 1 }}>
            {x.name} {x.mins.map((g) => minuteText(g.min) + (g.kind === 'pen' ? ` ${t('league.penShort')}` : g.kind === 'og' ? ` ${t('league.ogShort')}` : '')).join('، ')}
          </T>
        </View>
      ))}
      {lines[side].length > 6 ? <T size="xs" color={brand.sand}>+{lines[side].length - 6}</T> : null}
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', gap: space.sm, paddingTop: 2 }}>
      {col('h')}
      <View style={{ width: 92 }} />
      {col('a')}
    </View>
  );
}

// ---------- الأحداث ----------

type Item = { type: 'event'; e: MatchEvent; key: string } | { type: 'mark'; label: string; score?: [number, number]; key: string };

/** الأحداث من الأحدث للأقدم، ومعها «نهاية المباراة» و«الاستراحة» و«البداية» */
function timeline(events: MatchEvent[], finished: boolean, ft: [number, number] | null, ht: [number, number] | null, live: boolean, t: (k: string) => string): Item[] {
  // تبديلات الدقيقة ٤٥ تصير بين الشوطين، فنحطها مع الشوط الثاني
  const second = (e: MatchEvent) => e.min > 45 || (e.min === 45 && e.kind === 'sub');
  const ev = events.map((e, i) => ({ type: 'event' as const, e, key: `e${i}` }));
  const h2 = ev.filter((x) => second(x.e)).reverse();
  const h1 = ev.filter((x) => !second(x.e)).reverse();
  const out: Item[] = [];
  if (finished) out.push({ type: 'mark', label: t('league.ftMark'), score: ft ?? undefined, key: 'ft' });
  out.push(...h2);
  if (h2.length || ht || finished || !live) out.push({ type: 'mark', label: t('league.htMark'), score: ht ?? undefined, key: 'ht' });
  out.push(...h1);
  out.push({ type: 'mark', label: t('league.kickoffMark'), key: 'ko' });
  return out;
}

function EventText({ e, align }: { e: MatchEvent; align: 'left' | 'right' }) {
  const { t } = useTranslation();
  const row = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, justifyContent: (align === 'right' ? 'flex-end' : 'flex-start') as 'flex-end' | 'flex-start' };
  const name = (s: string | undefined, bold = false, muted = false) => (
    <T size="sm" semibold={bold} muted={muted} numberOfLines={1} style={{ flexShrink: 1, textAlign: align }}>{s ?? '—'}</T>
  );
  // الأيقونة جهة الوسط (جنب الدقيقة)
  const line = (icon: ReactNode, body: ReactNode, key?: string) => (
    <View key={key} style={row}>{align === 'right' ? <>{body}{icon}</> : <>{icon}{body}</>}</View>
  );
  if (e.kind === 'goal' || e.kind === 'pen' || e.kind === 'og') {
    return (
      <View style={{ gap: 2 }}>
        {line(<Ionicons name="football" size={16} color={e.kind === 'og' ? RED : colors.text} />, name(e.p, true))}
        <View style={row}>
          {e.kind !== 'goal' ? <T size="xs" muted>{t(e.kind === 'pen' ? 'league.ev_pen' : 'league.ev_og')}</T> : null}
          {e.hs != null && e.as != null ? <MiniScore h={e.hs} a={e.as} color={colors.muted} size={12} /> : null}
        </View>
      </View>
    );
  }
  if (e.kind === 'yc' || e.kind === 'rc' || e.kind === 'y2') return line(<CardIcon kind={e.kind} size={14} />, name(e.p));
  if (e.kind === 'sub') {
    return (
      <View style={{ gap: 2 }}>
        {line(<Ionicons name="arrow-up" size={14} color={SUB_IN} />, name(e.in, true), 'in')}
        {line(<Ionicons name="arrow-down" size={14} color={RED} />, name(e.out, false, true), 'out')}
      </View>
    );
  }
  if (e.kind === 'pmiss') {
    return (
      <View style={{ gap: 2 }}>
        {line(<Ionicons name="close-circle-outline" size={16} color={RED} />, name(e.p))}
        <T size="xs" muted style={{ textAlign: align }}>{t('league.ev_pmiss')}</T>
      </View>
    );
  }
  return line(<Ionicons name="tv-outline" size={15} color={colors.muted} />, name(e.p ?? t('league.ev_var')));
}

const kindLabel = (k: MatchEvent['kind']) => `league.ev_${k}`;

export function EventsTimeline({ events, finished, live, ft, ht }: {
  events: MatchEvent[]; finished: boolean; live: boolean; ft: [number, number] | null; ht: [number, number] | null;
}) {
  const { t } = useTranslation();
  const items = useMemo(() => {
    // الأهداف بجهة الفريق اللي استفاد (الهدف العكسي عند الخصم)، مثل لوحة النتيجة
    const gs = goalsWithSide(events);
    let gi = 0;
    const placed = events.map((e) => (isGoal(e) ? { ...e, side: gs[gi++]?.for ?? e.side } : e));
    return timeline(placed, finished, ft, ht, live, t);
  }, [events, finished, ft, ht, live, t]);
  if (!events.length) return <T muted center>{t('league.noEvents')}</T>;
  return (
    <Card style={{ gap: 0, paddingVertical: space.sm }}>
      {items.map((it) => {
        if (it.type === 'mark') {
          return (
            <View key={it.key} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 8 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.cardAlt, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
                <T size="xs" semibold>{it.label}</T>
                {it.score ? <MiniScore h={it.score[0]} a={it.score[1]} size={12} /> : null}
              </View>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            </View>
          );
        }
        const e = it.e;
        const label = `${minuteText(e.min)} ${t(kindLabel(e.kind))} ${e.kind === 'sub' ? `${e.in ?? ''} ${e.out ?? ''}` : e.p ?? ''}`;
        return (
          <View key={it.key} accessible accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 7 }}>
            <View style={{ flex: 1, minWidth: 0 }}>{e.side === 'h' ? <EventText e={e} align="right" /> : null}</View>
            <View style={{ minWidth: 46, alignItems: 'center', backgroundColor: e.kind === 'goal' || e.kind === 'pen' || e.kind === 'og' ? brand.deepGreen : 'transparent',
              borderRadius: radius.pill, paddingVertical: 2, paddingHorizontal: 6 }}>
              <Text allowFontScaling={false} style={{ fontFamily: fonts.semibold, fontSize: 12,
                color: e.kind === 'goal' || e.kind === 'pen' || e.kind === 'og' ? brand.cream : colors.muted }}>{minuteText(e.min)}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>{e.side === 'a' ? <EventText e={e} align="left" /> : null}</View>
          </View>
        );
      })}
    </Card>
  );
}

// ---------- الإحصائيات ----------

export function StatsBars({ stats, home, away, lng }: { stats: { k: string; h: number; a: number }[]; home?: LeagueTeam; away?: LeagueTeam; lng: string }) {
  const { t } = useTranslation();
  const rows = useMemo(() => statBars(stats), [stats]);
  if (!rows.length) return <T muted center>{t('league.noStats')}</T>;
  return (
    <Card style={{ gap: space.md }}>
      <Row gap={space.sm}>
        <TeamBadge team={home} lng={lng} size={26} />
        <T semibold center style={{ flex: 1 }}>{t('league.statsTitle')}</T>
        <TeamBadge team={away} lng={lng} size={26} />
      </Row>
      {rows.map((s) => {
        const pct = s.k === 'possession' ? '%' : '';
        const label = t(`league.stat_${s.k}`, { defaultValue: s.k });
        return (
          <View key={s.k} style={{ gap: 5 }} accessible accessibilityLabel={`${label}: ${teamName(home, lng)} ${s.h}${pct}، ${teamName(away, lng)} ${s.a}${pct}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <T size="sm" bold={s.h > s.a} muted={s.h < s.a} style={{ minWidth: 44 }}>{`${s.h}${pct}`}</T>
              <T size="sm" muted center style={{ flex: 1 }}>{label}</T>
              <T size="sm" bold={s.a > s.h} muted={s.a < s.h} style={{ minWidth: 44, textAlign: 'right' }}>{`${s.a}${pct}`}</T>
            </View>
            <View style={{ flexDirection: 'row', gap: 4, height: 6 }}>
              <View style={{ flex: Math.max(0.02, s.share), borderRadius: 3, backgroundColor: s.h >= s.a ? HOME_BAR : withLow(HOME_BAR) }} />
              <View style={{ flex: Math.max(0.02, 1 - s.share), borderRadius: 3, backgroundColor: s.a >= s.h ? AWAY_BAR : withLow(AWAY_BAR) }} />
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const withLow = (hex: string) => `${hex}66`;

// ---------- التشكيلة ----------

function Pitch({ width, height }: { width: number; height: number }) {
  const w = width; const h = height; const m = 6;
  const line = { stroke: 'rgba(255,255,255,0.55)', strokeWidth: 1.5, fill: 'none' } as const;
  const stripes = 8;
  const boxW = w * 0.6; const boxH = h * 0.17; const goalW = w * 0.3; const goalH = h * 0.065;
  const r = w * 0.14;
  return (
    <Svg width={w} height={h} style={{ position: 'absolute', top: 0, left: 0 }}>
      {Array.from({ length: stripes }, (_, i) => (
        <Rect key={i} x={0} y={(h / stripes) * i} width={w} height={h / stripes} fill={i % 2 ? '#1E7445' : '#22804C'} />
      ))}
      <Rect x={m} y={m} width={w - m * 2} height={h - m * 2} {...line} />
      {/* خط المنتصف ونص الدائرة فوق */}
      <Path d={`M ${w / 2 - r} ${m} A ${r} ${r} 0 0 0 ${w / 2 + r} ${m}`} {...line} />
      <Circle cx={w / 2} cy={m} r={2.5} fill="rgba(255,255,255,0.7)" />
      {/* منطقة الجزاء تحت */}
      <Rect x={(w - boxW) / 2} y={h - m - boxH} width={boxW} height={boxH} {...line} />
      <Rect x={(w - goalW) / 2} y={h - m - goalH} width={goalW} height={goalH} {...line} />
      <Circle cx={w / 2} cy={h - m - boxH * 0.68} r={2.5} fill="rgba(255,255,255,0.7)" />
      <Path d={`M ${w / 2 - w * 0.1} ${h - m - boxH} A ${w * 0.12} ${w * 0.12} 0 0 1 ${w / 2 + w * 0.1} ${h - m - boxH}`} {...line} />
      <Line x1={(w - goalW * 0.55) / 2} y1={h - m + 2} x2={(w + goalW * 0.55) / 2} y2={h - m + 2} stroke="rgba(255,255,255,0.75)" strokeWidth={3} />
    </Svg>
  );
}

function PlayerDot({ p, team, side, events, width }: { p: LineupPlayer; team?: LeagueTeam; side: 'h' | 'a'; events: MatchEvent[]; width: number }) {
  const c = teamColors(team);
  const mk = playerMarks(p.n, side, events);
  const size = 34;
  return (
    <View style={{ width, alignItems: 'center', gap: 3 }} accessible accessibilityLabel={`${p.no ?? ''} ${p.n}`}>
      <View style={{ width: size, height: size }}>
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.bg, borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)',
          alignItems: 'center', justifyContent: 'center' }}>
          <Text allowFontScaling={false} style={{ color: c.fg, fontFamily: fonts.semibold, fontSize: 13 }}>{p.no ?? ''}</Text>
        </View>
        {mk.goals || mk.og ? (
          <View style={{ position: 'absolute', top: -5, right: -8, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 9, paddingHorizontal: 2, height: 17 }}>
            <Ionicons name="football" size={13} color={mk.og && !mk.goals ? RED : '#111111'} />
            {mk.goals + mk.og > 1 ? <Text allowFontScaling={false} style={{ fontSize: 10, fontFamily: fonts.semibold, color: '#111111' }}>{mk.goals + mk.og}</Text> : null}
          </View>
        ) : null}
        {mk.red || mk.yellow ? <View style={{ position: 'absolute', top: -4, left: -6 }}><CardIcon kind={mk.red ? 'rc' : 'yc'} size={13} /></View> : null}
        {mk.outMin != null ? (
          <View style={{ position: 'absolute', bottom: -4, left: -8, backgroundColor: '#FFFFFF', borderRadius: 8, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="arrow-down" size={12} color={RED} />
          </View>
        ) : null}
        {p.c ? (
          <View style={{ position: 'absolute', bottom: -4, right: -7, backgroundColor: brand.amber, borderRadius: 8, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
            <Text allowFontScaling={false} style={{ fontSize: 10, fontFamily: fonts.semibold, color: brand.deepGreen }}>C</Text>
          </View>
        ) : null}
      </View>
      <Text allowFontScaling={false} numberOfLines={1}
        style={{ color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 11, maxWidth: width - 2, textAlign: 'center',
          textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } }}>
        {shortPlayer(p.n)}{mk.outMin != null ? ` ${minuteText(mk.outMin)}` : ''}
      </Text>
    </View>
  );
}

export function LineupView({ lineups, events, home, away, lng }: { lineups: Lineups; events: MatchEvent[]; home?: LeagueTeam; away?: LeagueTeam; lng: string }) {
  const { t } = useTranslation();
  const [side, setSide] = useState<'h' | 'a'>(lineups.h.length ? 'h' : 'a');
  const [w, setW] = useState(0);
  const xi = side === 'h' ? lineups.h : lineups.a;
  const subs = side === 'h' ? lineups.hs : lineups.as;
  const formation = side === 'h' ? lineups.hf : lineups.af;
  const coach = side === 'h' ? lineups.hc : lineups.ac;
  const team = side === 'h' ? home : away;
  const rows = useMemo(() => lineupRows(xi, formation), [xi, formation]);
  const h = Math.round(w * 1.22);
  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));

  // الحارس تحت، والهجوم فوق
  const yOf = (i: number) => {
    if (i === 0) return h * 0.86;
    const n = rows.length - 1;
    if (n <= 1) return h * 0.45;
    return h * 0.67 - ((i - 1) * (h * 0.55)) / (n - 1);
  };

  const chip = (s: 'h' | 'a', tm?: LeagueTeam, f?: string | null) => {
    const active = s === side;
    return (
      <Pressable key={s} onPress={() => setSide(s)} accessibilityRole="tab" accessibilityState={{ selected: active }}
        style={({ pressed }) => [{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 10,
          borderRadius: radius.pill, borderWidth: 1, borderColor: active ? brand.deepGreen : colors.border, backgroundColor: active ? brand.deepGreen : colors.card },
          pressed && { opacity: 0.85 }]}>
        <TeamBadge team={tm} lng={lng} size={22} />
        <View style={{ flex: 1 }}>
          <T size="sm" semibold numberOfLines={1} color={active ? brand.cream : colors.text}>{teamName(tm, lng)}</T>
          {f ? <T size="xs" color={active ? brand.sand : colors.muted}>{f}</T> : null}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={{ gap: space.sm }}>
      <Row gap={space.sm}>
        {chip('h', home, lineups.hf)}
        {chip('a', away, lineups.af)}
      </Row>

      <View onLayout={onLayout} style={{ borderRadius: radius.lg, overflow: 'hidden', height: h || undefined, minHeight: 300, backgroundColor: '#22804C' }}>
        {w > 0 ? (
          <>
            <Pitch width={w} height={h} />
            {rows.map((r, i) => {
              const cell = Math.min(84, w / Math.max(r.length, 1));
              return (
                <View key={i} style={{ position: 'absolute', left: 0, right: 0, top: yOf(i) - 22, flexDirection: 'row', justifyContent: 'space-evenly' }}>
                  {r.map((p) => <PlayerDot key={`${p.n}-${p.no}`} p={p} team={team} side={side} events={events} width={cell} />)}
                </View>
              );
            })}
          </>
        ) : null}
      </View>

      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name={lineups.ok ? 'checkmark-circle' : 'help-circle-outline'} size={14} color={lineups.ok ? SUB_IN : colors.muted} />
          <T size="xs" muted>{t(lineups.ok ? 'league.lineupConfirmed' : 'league.lineupExpected')}</T>
        </View>
        {formation ? <T size="xs" muted>· {t('league.formation', { f: formation })}</T> : null}
        {coach ? <T size="xs" muted>· {t('league.coach', { name: coach })}</T> : null}
      </Row>

      {subs.length ? (
        <Card style={{ gap: 0, paddingVertical: space.xs }}>
          <T semibold style={{ paddingVertical: 6 }}>{t('league.subs')}</T>
          {subs.map((p, i) => {
            const mk = playerMarks(p.n, side, events);
            return (
              <View key={`${p.n}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.border }}>
                <T size="sm" bold muted style={{ width: 26, textAlign: 'center' }}>{p.no ?? '—'}</T>
                <T size="sm" semibold={mk.inMin != null} numberOfLines={1} style={{ flex: 1 }}>{p.n}</T>
                {mk.goals ? <Ionicons name="football" size={14} color={colors.text} /> : null}
                {mk.red || mk.yellow ? <CardIcon kind={mk.red ? 'rc' : 'yc'} size={12} /> : null}
                {mk.inMin != null ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <Ionicons name="arrow-up" size={13} color={SUB_IN} />
                    <T size="xs" semibold color={SUB_IN}>{minuteText(mk.inMin)}</T>
                  </View>
                ) : null}
                {p.pos ? <T size="xs" muted style={{ minWidth: 34, textAlign: 'right' }}>{t(`league.pos_${p.pos}`)}</T> : null}
              </View>
            );
          })}
        </Card>
      ) : null}
    </View>
  );
}
