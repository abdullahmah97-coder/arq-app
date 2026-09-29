// مؤشرات الساعة الإضافية: مراقبة الصحة، مراقبة التوتر، الإجهاد والجاهزية (٧ أيام)، لوحتي، والعمر الرياضي
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useId, useMemo, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useAuth } from '@/lib/auth';
import { useHealth } from '@/lib/health';
import {
  dashboardRows, fitnessAge, healthMonitor, stressSeries, stressSummary,
  type DashRow, type MonitorItem, type MonitorKey, type StressLevel, type StressPoint,
} from '@/lib/health/insights';
import { useLocalized } from '@/lib/i18n';
import { LONG_PRESS_MS, useHomeLongPress } from '@/lib/homeLayout';
import { brand, fonts, night, pulse } from '@/theme';
import { NCard, NT, Num, zoneColor } from './widgets';

type MciName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const LEVEL_COLOR: Record<StressLevel, string> = { low: pulse.green, medium: brand.amber, high: brand.orange };
const hm = (ms: number, lng: string) => new Date(ms).toLocaleTimeString(lng === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
const dur = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`;

/** كل الحسابات في مكان واحد (تتحدّث مع بيانات الساعة) */
export function useInsights() {
  const h = useHealth();
  const { health } = useAuth();
  const age = health?.birth_year ? new Date().getFullYear() - health.birth_year : null;
  return useMemo(() => {
    const today = h.today;
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const series = today ? stressSeries(today.hr_series, {
      restingHr: today.resting_hr ?? h.scores?.baseline.resting_hr ?? null, age: age ?? 30, sleep: today.sleep, dayStart: dayStart.getTime(),
    }) : [];
    return {
      connected: h.status === 'connected',
      series,
      stress: stressSummary(series),
      monitor: healthMonitor(today, h.days),
      rows: dashboardRows(h.history),
      week: h.history.slice(-7),
      fitness: fitnessAge(h.days, { age, gender: health?.gender ?? null }),
      realAge: age,
    };
  }, [h.today, h.days, h.history, h.status, h.scores, age, health?.gender]);
}

// ---------------------------------------------------------------- بطاقتا الرئيسية
export function MonitorCards() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const x = useInsights();
  if (!x.connected) return null;
  const m = x.monitor;
  const allOk = m.measured > 0 && m.inRange === m.measured;
  const calibrating = m.measured === 0 && m.nightsNeeded > 0;
  const s = x.stress;
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <NCard style={{ flex: 1, padding: 14, gap: 8 }} onPress={() => router.push('/health')}>
        <Row title={t('insight.healthMonitor')} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <StatusBox status={calibrating || m.measured === 0 ? 'none' : allOk ? 'ok' : 'out'} size={26} />
          <View style={{ flex: 1 }}>
            <NT size={12} bold color={calibrating || m.measured === 0 ? night.muted : allOk ? pulse.green : brand.amber} numberOfLines={1}>
              {calibrating ? t('insight.calibrating') : m.measured === 0 ? t('insight.noData') : allOk ? t('insight.withinRange') : t('insight.outOfRange')}
            </NT>
            <NT size={11} faint numberOfLines={1}>
              {calibrating ? t('insight.nightsLeft', { n: m.nightsNeeded, count: m.nightsNeeded }) : m.measured ? t('insight.metricsCount', { a: m.inRange, b: m.measured }) : '—'}
            </NT>
          </View>
        </View>
      </NCard>
      <NCard style={{ flex: 1, padding: 14, gap: 8 }} onPress={() => router.push('/health')}>
        <Row title={t('insight.stressMonitor')} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ minWidth: 34, height: 26, borderRadius: 7, paddingHorizontal: 5, backgroundColor: s.level ? `${LEVEL_COLOR[s.level]}26` : night.card, alignItems: 'center', justifyContent: 'center' }}>
            <Num size={15} color={s.level ? LEVEL_COLOR[s.level] : night.muted}>{s.current != null ? s.current.toFixed(1) : '—'}</Num>
          </View>
          <View style={{ flex: 1 }}>
            <NT size={12} bold color={s.level ? LEVEL_COLOR[s.level] : night.muted} numberOfLines={1}>{s.level ? t(`insight.level_${s.level}`) : t('insight.noData')}</NT>
            <NT size={11} faint numberOfLines={1}>{s.at ? hm(s.at, lng) : t('insight.needWatch')}</NT>
          </View>
        </View>
      </NCard>
    </View>
  );
}

function Row({ title }: { title: string }) {
  const { lng } = useLocalized();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <NT size={11} semibold muted numberOfLines={1} style={{ flex: 1 }}>{title}</NT>
      <Ionicons name={lng === 'ar' ? 'chevron-back' : 'chevron-forward'} size={14} color={night.faint} />
    </View>
  );
}

function StatusBox({ status, size = 22 }: { status: MonitorItem['status']; size?: number }) {
  const c = status === 'ok' ? pulse.green : status === 'out' ? brand.amber : night.faint;
  const icon = status === 'ok' ? 'checkmark' : status === 'out' ? 'alert' : 'ellipse';
  return (
    <View style={{ width: size, height: size, borderRadius: 6, backgroundColor: status === 'ok' || status === 'out' ? `${c}26` : night.card, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={status === 'ok' || status === 'out' ? size * 0.62 : size * 0.3} color={c} />
    </View>
  );
}

// ---------------------------------------------------------------- مراقبة التوتر (رسم)
export function StressCard({ onPress }: { onPress?: () => void }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const x = useInsights();
  if (!x.connected) return null;
  const s = x.stress;
  return (
    <NCard onPress={onPress}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ gap: 2 }}>
          <NT size={12} semibold muted>{t('insight.stressMonitor')}</NT>
          <NT size={11} faint>{s.at ? t('insight.updated', { time: hm(s.at, lng) }) : t('insight.needWatch')}</NT>
        </View>
        {s.level ? (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <NT size={12} bold color={LEVEL_COLOR[s.level]}>{t(`insight.level_${s.level}`)}</NT>
            <Num size={24}>{s.current!.toFixed(1)}</Num>
          </View>
        ) : null}
      </View>
      {x.series.length ? <StressChart series={x.series} /> : <NT size={12} muted style={{ lineHeight: 20 }}>{t('insight.stressEmpty')}</NT>}
      {x.series.length ? (
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <View>
            <NT size={10} faint>{t('insight.highStress')}</NT>
            <Num size={18}>{dur(s.highMin)} <NT size={11} faint>{t('insight.hrs')}</NT></Num>
          </View>
          {s.avg != null ? (
            <View>
              <NT size={10} faint>{t('insight.avgStress')}</NT>
              <Num size={18} color={LEVEL_COLOR[s.avg < 1 ? 'low' : s.avg < 2 ? 'medium' : 'high']}>{s.avg.toFixed(1)}</Num>
            </View>
          ) : null}
        </View>
      ) : null}
    </NCard>
  );
}

function StressChart({ series }: { series: StressPoint[] }) {
  const { lng } = useLocalized();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [w, setW] = useState(0);
  const H = 150, top = 8, bottom = 22, left = 26;
  const t0 = series[0].t, t1 = series[series.length - 1].t;
  const span = Math.max(1, t1 - t0);
  const X = (t: number) => left + ((t - t0) / span) * (w - left - 6);
  const Y = (v: number) => top + (1 - v / 3) * (H - top - bottom);
  // المسار ينقطع عند الفجوات والتمرين
  let d = '';
  let pen = false;
  for (const p of series) {
    if (p.v == null) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)} `;
    pen = true;
  }
  // فترات النوم (مظللة)
  const bands: [number, number][] = [];
  for (const p of series) {
    if (!p.asleep) continue;
    const last = bands[bands.length - 1];
    if (last && p.t - last[1] <= (series[1]?.t ?? p.t) - series[0].t + 1) last[1] = p.t;
    else bands.push([p.t, p.t]);
  }
  const mid = t0 + span / 2;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: H }}>
      {w > 0 ? (
        <Svg width={w} height={H}>
          <Defs>
            <LinearGradient id={`st${uid}`} x1="0" y1="1" x2="0" y2="0">
              <Stop offset="0" stopColor={pulse.green} />
              <Stop offset="0.55" stopColor={brand.amber} />
              <Stop offset="1" stopColor={brand.orange} />
            </LinearGradient>
          </Defs>
          {bands.map(([a, b], i) => (
            <Rect key={i} x={X(a)} y={top} width={Math.max(2, X(b) - X(a))} height={H - top - bottom} fill={night.line} opacity={0.55} />
          ))}
          {[0, 1, 2, 3].map((v) => (
            <G key={v}>
              <Line x1={left} x2={w - 6} y1={Y(v)} y2={Y(v)} stroke={night.line} strokeWidth={1} />
              <SvgText x={2} y={Y(v) + 4} fill={night.faint} fontSize={10} fontFamily={fonts.regular}>{v.toFixed(1)}</SvgText>
            </G>
          ))}
          {series.filter((p) => p.activity).map((p) => (
            <Circle key={p.t} cx={X(p.t)} cy={H - bottom - 3} r={2.2} fill={brand.orange} opacity={0.8} />
          ))}
          <Path d={d} stroke={`url(#st${uid})`} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {[t0, mid, t1].map((t, i) => (
            <SvgText key={i} x={X(t)} y={H - 6} fill={i === 2 ? night.text : night.faint} fontSize={10} fontFamily={fonts.regular}
              textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>{hm(t, lng)}</SvgText>
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------- الإجهاد والجاهزية (٧ أيام)
export function StrainRecoveryChart() {
  const { t } = useTranslation();
  const x = useInsights();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [w, setW] = useState(0);
  if (!x.connected || x.week.length < 2) return null;
  const weekdays = t('weekdaysShort', { returnObjects: true }) as string[];
  const H = 190, top = 22, bottom = 34, side = 26;
  const n = x.week.length;
  const X = (i: number) => side + (i / Math.max(1, n - 1)) * (w - side * 2);
  const Ys = (v: number) => top + (1 - v / 21) * (H - top - bottom);
  const Yr = (v: number) => top + (1 - v / 100) * (H - top - bottom);
  const strainPts = x.week.map((d, i) => [X(i), Ys(d.scores.strain)] as const);
  const rec = x.week.map((d, i) => (d.scores.recovery != null ? [X(i), Yr(d.scores.recovery), d.scores.recovery, d.scores.zone] as const : null));
  const line = (pts: (readonly [number, number] | null)[]) => {
    let s = ''; let pen = false;
    for (const p of pts) { if (!p) { pen = false; continue; } s += `${pen ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)} `; pen = true; }
    return s;
  };
  return (
    <NCard>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <NT size={12} semibold muted>{t('insight.strainRecovery')}</NT>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Legend color={night.text} label={t('health.strain')} />
          <Legend color={pulse.green} label={t('health.recovery')} />
        </View>
      </View>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: H }}>
        {w > 0 ? (
          <Svg width={w} height={H}>
            <Defs>
              <LinearGradient id={`sr${uid}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={night.text} stopOpacity={0.22} />
                <Stop offset="1" stopColor={night.text} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {[0, 7, 14, 21].map((v) => (
              <G key={v}>
                <Line x1={side} x2={w - side} y1={Ys(v)} y2={Ys(v)} stroke={night.line} strokeWidth={1} />
                <SvgText x={2} y={Ys(v) + 4} fill={night.faint} fontSize={10} fontFamily={fonts.regular}>{v}</SvgText>
                <SvgText x={w - 2} y={Ys(v) + 4} fill={night.faint} fontSize={10} fontFamily={fonts.regular} textAnchor="end">{Math.round((v / 21) * 100)}%</SvgText>
              </G>
            ))}
            <Rect x={X(n - 1) - 16} y={top - 16} width={32} height={H - top - bottom + 30} rx={8} fill={night.card} />
            <Path d={`${line(strainPts)} L${strainPts[n - 1][0]},${Ys(0)} L${strainPts[0][0]},${Ys(0)} Z`} fill={`url(#sr${uid})`} />
            <Path d={line(strainPts)} stroke={night.text} strokeWidth={2} fill="none" strokeLinejoin="round" />
            <Path d={line(rec.map((r) => (r ? [r[0], r[1]] as const : null)))} stroke={night.faint} strokeWidth={1.5} fill="none" strokeDasharray="4 4" />
            {strainPts.map(([cx, cy], i) => (
              <G key={`s${i}`}>
                <Circle cx={cx} cy={cy} r={4} fill={night.bg} stroke={night.text} strokeWidth={2} />
                <SvgText x={cx} y={x.week[i].scores.strain < 5 ? cy - 9 : cy + 16} fill={night.text} fontSize={10} fontFamily={fonts.semibold} textAnchor="middle">{x.week[i].scores.strain.toFixed(1)}</SvgText>
              </G>
            ))}
            {rec.map((r, i) => (r ? (
              <G key={`r${i}`}>
                <Circle cx={r[0]} cy={r[1]} r={4.5} fill={night.bg} stroke={zoneColor(r[3])} strokeWidth={2.5} />
                <SvgText x={r[0]} y={r[1] - 9} fill={zoneColor(r[3])} fontSize={10} fontFamily={fonts.semibold} textAnchor="middle">{r[2]}%</SvgText>
              </G>
            ) : null))}
            {x.week.map((d, i) => {
              const dt = new Date(d.day.day + 'T12:00:00');
              return (
                <G key={`l${i}`}>
                  <SvgText x={X(i)} y={H - 18} fill={i === n - 1 ? night.text : night.faint} fontSize={10} fontFamily={fonts.regular} textAnchor="middle">{weekdays[dt.getDay()]}</SvgText>
                  <SvgText x={X(i)} y={H - 5} fill={i === n - 1 ? night.text : night.faint} fontSize={10} fontFamily={fonts.regular} textAnchor="middle">{dt.getDate()}</SvgText>
                </G>
              );
            })}
          </Svg>
        ) : null}
      </View>
    </NCard>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <NT size={10} faint>{label}</NT>
    </View>
  );
}

// ---------------------------------------------------------------- لوحتي
const DASH_ICON: Record<DashRow['key'], MciName> = {
  hrv: 'heart-flash', rhr: 'heart-minus', avg_hr: 'heart-outline', steps: 'shoe-print', kcal: 'fire', sleep: 'sleep',
  restorative_h: 'weather-night', restorative_pct: 'weather-night', resp: 'lungs', spo2: 'water-percent',
  zones13: 'heart-pulse', zones45: 'heart-pulse', vo2max: 'speedometer', recovery: 'battery-heart-variant', strain: 'arm-flex',
};

function fmt(v: number | null, f: DashRow['format']) {
  if (v == null) return '—';
  if (f === 'dur') return dur(v);
  if (f === 'pct') return `${Math.round(v)}%`;
  if (f === 'dec1') return v.toFixed(1);
  if (f === 'thousands') return Math.round(v).toLocaleString('en-US');
  return String(Math.round(v));
}

export function DashboardList({ limit }: { limit?: number }) {
  const { t } = useTranslation();
  const x = useInsights();
  if (!x.connected || !x.rows.length) return null;
  const rows = limit ? x.rows.slice(0, limit) : x.rows;
  return (
    <View style={{ gap: 8 }}>
      {rows.map((r) => {
        const good = r.trend == null || r.trend === 'flat' || r.better === 'none' ? null : (r.trend === r.better);
        const arrowColor = good == null ? night.faint : good ? pulse.green : brand.amber;
        return (
          <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: night.card, borderRadius: 16, borderWidth: 1, borderColor: night.line, paddingVertical: 12, paddingHorizontal: 14 }}>
            <MaterialCommunityIcons name={DASH_ICON[r.key]} size={20} color={night.muted} />
            <NT size={12} semibold style={{ flex: 1 }} numberOfLines={2}>{t(`insight.dash_${r.key}`)}</NT>
            <View style={{ alignItems: 'flex-end' }}>
              <Num size={20}>{fmt(r.value, r.format)}</Num>
              <NT size={10} faint>{r.base != null ? fmt(r.base, r.format) : ''}</NT>
            </View>
            <Ionicons name={r.trend === 'up' ? 'caret-up' : r.trend === 'down' ? 'caret-down' : 'ellipse'} size={r.trend === 'up' || r.trend === 'down' ? 12 : 6} color={arrowColor} style={{ width: 12 }} />
          </View>
        );
      })}
      <NT size={10} faint center>{t('insight.dashHint')}</NT>
    </View>
  );
}

// ---------------------------------------------------------------- مراقبة الصحة (تفصيل)
const MON_ICON: Record<MonitorKey, MciName> = { resp: 'lungs', spo2: 'water-percent', rhr: 'heart-minus', hrv: 'heart-flash', temp: 'thermometer' };
const monFmt = (i: MonitorItem) => {
  if (i.value == null) return '—';
  if (i.key === 'temp') return i.base != null ? `${i.value - i.base >= 0 ? '+' : ''}${(i.value - i.base).toFixed(1)}°` : `${i.value.toFixed(1)}°`;
  if (i.key === 'spo2') return `${Math.round(i.value)}%`;
  if (i.key === 'resp') return i.value.toFixed(1);
  return String(Math.round(i.value));
};

export function HealthMonitorCard() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const x = useInsights();
  if (!x.connected) return null;
  const m = x.monitor;
  const out = m.items.filter((i) => i.status === 'out');
  return (
    <NCard>
      <NT size={12} semibold muted>{t('insight.healthMonitor')}</NT>
      <View style={{ flexDirection: 'row' }}>
        {m.items.map((i, k) => (
          <View key={i.key} style={{ flex: 1, alignItems: 'center', gap: 6, borderStartWidth: k ? 1 : 0, borderColor: night.line }}>
            <MaterialCommunityIcons name={MON_ICON[i.key]} size={22} color={night.muted} />
            <NT size={10} semibold>{t(`insight.mon_${i.key}`)}</NT>
            <StatusBox status={i.status} />
            <NT size={11} muted>{monFmt(i)}</NT>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: night.card, borderRadius: 12, padding: 12 }}>
        <StatusBox status={m.measured === 0 ? 'none' : out.length ? 'out' : 'ok'} />
        <NT size={12} style={{ flex: 1, lineHeight: 19 }}>
          {m.nightsNeeded > 0 && m.measured === 0
            ? t('insight.calibratingLong', { n: m.nightsNeeded, count: m.nightsNeeded })
            : m.measured === 0 ? t('insight.monitorNoData', { source: t(Platform.OS === 'android' ? 'health.source_health_connect' : 'health.source_apple_health') })
            : out.length ? t('insight.monitorOut', { list: out.map((i) => t(`insight.mon_${i.key}`)).join(lng === 'ar' ? '، ' : ', ') })
            : t('insight.monitorOk', { a: m.inRange, b: m.measured })}
        </NT>
      </View>
    </NCard>
  );
}

// ---------------------------------------------------------------- العمر الرياضي
export function FitnessAgeCard() {
  const { t } = useTranslation();
  const x = useInsights();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (!x.connected) return null;
  const f = x.fitness;
  const size = 210;
  const younger = f && f.diff < 0;
  const gap = f ? Number(Math.abs(f.diff).toFixed(1)) : 0; // 3.0 → 3 عشان «3 سنوات» مو «3.0»
  const c1 = younger ? pulse.green : brand.amber;
  return (
    <NCard style={{ alignItems: 'center' }}>
      <NT size={12} semibold muted>{t('insight.fitnessAge')}</NT>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={{ position: 'absolute' }}>
          <Defs>
            <RadialGradient id={`fa${uid}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0.55" stopColor={night.bg} stopOpacity={1} />
              <Stop offset="0.85" stopColor={c1} stopOpacity={0.35} />
              <Stop offset="1" stopColor={c1} stopOpacity={0.9} />
            </RadialGradient>
          </Defs>
          <Circle cx={size / 2} cy={size / 2} r={size / 2 - 4} fill={`url(#fa${uid})`} />
          {Array.from({ length: 28 }, (_, i) => {
            const a = (i * 137.5 * Math.PI) / 180, r = (size / 2 - 18) * Math.sqrt(((i * 37) % 28) / 28);
            return <Circle key={i} cx={size / 2 + r * Math.cos(a)} cy={size / 2 + r * Math.sin(a)} r={1.2} fill={c1} opacity={0.55} />;
          })}
        </Svg>
        {f ? (
          <>
            <Num size={48}>{f.age.toFixed(1)}</Num>
            <NT size={11} semibold muted>{t('insight.fitnessAgeShort')}</NT>
            <NT size={13} bold color={c1} style={{ marginTop: 4 }}>
              {Math.abs(f.diff) < 0.5 ? t('insight.sameAge') : t(younger ? 'insight.younger' : 'insight.older', { n: gap, count: gap })}
            </NT>
          </>
        ) : (
          <NT size={12} muted center style={{ paddingHorizontal: 34, lineHeight: 19 }}>{x.realAge ? t('insight.fitnessNeedData') : t('insight.fitnessNeedAge')}</NT>
        )}
      </View>
      {f ? (
        <NT size={11} faint center style={{ lineHeight: 18 }}>
          {f.basis === 'vo2max' ? t('insight.fitnessBasisVo2') : t('insight.fitnessBasisVitals')} {t('insight.fitnessNote')}
        </NT>
      ) : null}
    </NCard>
  );
}

/** زر «كل المؤشرات» */
export function MoreInsights() {
  const { t } = useTranslation();
  const longPress = useHomeLongPress();
  const { lng } = useLocalized();
  return (
    <Pressable onPress={() => router.push('/health')} onLongPress={longPress} delayLongPress={LONG_PRESS_MS} style={({ pressed }) => ({ flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 4, padding: 6, opacity: pressed ? 0.6 : 1 })}>
      <NT size={12} semibold color={night.accent}>{t('insight.allMetrics')}</NT>
      <Ionicons name={lng === 'ar' ? 'chevron-back' : 'chevron-forward'} size={14} color={night.accent} />
    </Pressable>
  );
}
