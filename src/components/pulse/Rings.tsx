// حلقات النبض: الجاهزية (خارجية) + الإجهاد (وسطى) + النوم (داخلية) — ترسم نفسها عند الظهور.
// لها أكثر من شكل يختاره المستخدم من تخصيص الرئيسية: دوائر، عدّاد، مقطّعة (سدو)، معيّن (شعار أرك)، سداسي، وأعمدة.
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient as Fade } from 'expo-linear-gradient';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import type { IconName } from '@/components/ui';
import type { RingStyle } from '@/lib/ringStyle';
import { night } from '@/theme';
import { gaugeArc, litSegments, ringSegments, roundedPolygon, segmentCount } from './shapes';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

export interface Ring { value: number; color: string; color2?: string; track?: string; icon?: IconName }

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const DURATION = 1200;

export function Rings({ rings, size = 260, stroke = 16, gap = 8, children, variant = 'rings', animate = true }: {
  rings: Ring[]; size?: number; stroke?: number; gap?: number; children?: ReactNode;
  /** شكل الحلقات (الافتراضي دوائر) */
  variant?: RingStyle;
  /** false للمعاينات الصغيرة: ترسم مكتملة على طول */
  animate?: boolean;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  // قيمة الحركة في state (مو ref) عشان الرسم يقدر يقرأها بأمان
  const [anim] = useState(() => new Animated.Value(animate ? 0 : 1));
  const key = rings.map((r) => r.value.toFixed(3)).join('|');
  useEffect(() => {
    if (!animate) { anim.setValue(1); return; }
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: DURATION, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [key, anim, animate, variant]);

  if (variant === 'bars') return <Bars rings={rings} size={size} anim={anim}>{children}</Bars>;

  const polygon = variant === 'diamond' || variant === 'hexagon';
  // المضلعات مساحتها الداخلية أصغر من الدائرة: خط أنحف ومسافة أقل، والمحتوى يصغر شوي
  const sw = polygon ? stroke * (variant === 'diamond' ? 0.8 : 0.85) : stroke;
  const gp = polygon ? gap * (variant === 'diamond' ? 0.67 : 0.7) : gap;
  const scale = variant === 'diamond' ? 0.78 : variant === 'hexagon' ? 0.9 : 1;
  const c = size / 2;
  const radius = (i: number) => size / 2 - sw / 2 - i * (sw + gp);

  const defs = (
    <Defs>
      {rings.map((r, i) => (
        <LinearGradient key={i} id={`rg${uid}${i}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={r.color} />
          <Stop offset="1" stopColor={r.color2 ?? r.color} />
        </LinearGradient>
      ))}
    </Defs>
  );
  const fill = (i: number) => `url(#rg${uid}${i})`;

  let art: ReactNode;
  if (variant === 'rings') {
    art = (
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        {defs}
        {rings.map((r, i) => {
          const rad = radius(i);
          const len = 2 * Math.PI * rad;
          return (
            <GroupRing key={i} cx={c} rad={rad} c={len} stroke={sw} track={r.track ?? night.line}
              gradient={fill(i)} offset={anim.interpolate({ inputRange: [0, 1], outputRange: [len, len * (1 - clamp01(r.value))] })} />
          );
        })}
      </Svg>
    );
  } else if (variant === 'segments') {
    art = <Segments rings={rings} size={size} stroke={sw} radius={radius} anim={anim} start={animate ? 0 : 1} />;
  } else {
    art = (
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {defs}
        {rings.map((r, i) => {
          const rad = radius(i);
          const shape = variant === 'gauge' ? gaugeArc(c, c, rad)
            : roundedPolygon(c, c, rad, variant === 'diamond' ? 4 : 6, rad * (variant === 'diamond' ? 0.12 : 0.1));
          const L = shape.length;
          return (
            <PathRing key={i} d={shape.d} length={L} stroke={sw} track={r.track ?? night.line} gradient={fill(i)}
              offset={anim.interpolate({ inputRange: [0, 1], outputRange: [L, L * (1 - clamp01(r.value))] })} />
          );
        })}
      </Svg>
    );
  }

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {art}
      {scale === 1 ? children : <View style={{ transform: [{ scale }] }}>{children}</View>}
    </View>
  );
}

function GroupRing({ cx, rad, c, stroke, track, gradient, offset }: {
  cx: number; rad: number; c: number; stroke: number; track: string; gradient: string; offset: Animated.AnimatedInterpolation<number>;
}) {
  return (
    <>
      <Circle cx={cx} cy={cx} r={rad} stroke={track} strokeWidth={stroke} fill="none" />
      <AnimatedCircle cx={cx} cy={cx} r={rad} stroke={gradient} strokeWidth={stroke} fill="none"
        strokeLinecap="round" strokeDasharray={`${c} ${c}`} strokeDashoffset={offset} />
    </>
  );
}

function PathRing({ d, length, stroke, track, gradient, offset }: {
  d: string; length: number; stroke: number; track: string; gradient: string; offset: Animated.AnimatedInterpolation<number>;
}) {
  return (
    <>
      <Path d={d} stroke={track} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <AnimatedPath d={d} stroke={gradient} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={`${length} ${length}`} strokeDashoffset={offset} />
    </>
  );
}

/** حلقات مقطّعة مثل نقش السدو: القطع تنوّر وحدة ورا الثانية */
function Segments({ rings, size, stroke, radius, anim, start }: {
  rings: Ring[]; size: number; stroke: number; radius: (i: number) => number; anim: Animated.Value; start: number;
}) {
  // التقدم يمشي مع نفس الحركة (قيمتها منعّمة أصلاً)، ونعيد الرسم كل ما تقدمت خطوة واضحة
  const [p, setP] = useState(start);
  useEffect(() => {
    const id = anim.addListener(({ value }) => setP((old) => (Math.abs(old - value) >= 0.04 || value === 1 ? value : old)));
    return () => anim.removeListener(id);
  }, [anim]);
  const c = size / 2;
  return (
    <Svg width={size} height={size} style={{ position: 'absolute' }}>
      {rings.map((r, i) => {
        const rad = radius(i);
        // قطع قصيرة بمسافات واضحة (مع الأطراف المدوّرة)، ولونها يتدرج على طول الحلقة
        const count = segmentCount(rad, stroke * 2.2);
        const lit = litSegments(clamp01(r.value) * Math.min(1, p), count);
        return ringSegments(c, c, rad, count, 0.27).map((d, k) => (
          <Path key={`${i}-${k}`} d={d} stroke={k < lit ? mixColor(r.color, r.color2 ?? r.color, count > 1 ? k / (count - 1) : 0) : (r.track ?? night.line)}
            strokeWidth={stroke} strokeLinecap="round" fill="none" />
        ));
      })}
    </Svg>
  );
}

/** يمزج لونين hex (#RGB أو #RRGGBB). أي صيغة ثانية ترجع اللون الأول كما هو */
export function mixColor(a: string, b: string, t: number): string {
  const parse = (h: string) => {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(h.trim());
    if (!m) return null;
    const x = m[1].length === 3 ? m[1].split('').map((ch) => ch + ch).join('') : m[1];
    return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
  };
  const A = parse(a); const B = parse(b);
  if (!A || !B) return a;
  const k = Math.max(0, Math.min(1, t));
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
}

/** أعمدة: ثلاثة أعمدة تتعبى من تحت، والرقم الكبير فوقها */
function Bars({ rings, size, anim, children }: { rings: Ring[]; size: number; anim: Animated.Value; children?: ReactNode }) {
  const barW = Math.round(size * 0.17);
  const barH = Math.round(size * 0.58);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', transform: [{ scale: 0.8 }] }}>{children}</View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: Math.round(size * 0.09) }}>
        {rings.map((r, i) => (
          <View key={i} style={{ width: barW, height: barH, borderRadius: barW / 2, backgroundColor: r.track ?? night.line, overflow: 'hidden', justifyContent: 'flex-end' }}>
            <Animated.View style={{ width: '100%', borderRadius: barW / 2, overflow: 'hidden',
              height: anim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(r.value > 0 ? barW : 0, barH * clamp01(r.value))] }) }}>
              <Fade colors={[r.color2 ?? r.color, r.color]} style={{ flex: 1 }} />
            </Animated.View>
            {r.icon ? (
              <View style={{ position: 'absolute', bottom: Math.round(barW * 0.28), left: 0, right: 0, alignItems: 'center' }} pointerEvents="none">
                <Ionicons name={r.icon} size={Math.round(barW * 0.42)} color="rgba(6,31,27,0.72)" />
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

/** شريط تقدّم أفقي بأسلوب الشيفرون */
export function ChevronBar({ value, color, height = 10 }: { value: number; color: string; height?: number }) {
  const [w] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(w, { toValue: Math.max(0, Math.min(1, value)), duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [value, w]);
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: night.line, overflow: 'hidden' }}>
      <Animated.View style={{ height, borderRadius: height / 2, backgroundColor: color, width: w.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
    </View>
  );
}

/** أعمدة صغيرة لأيام الأسبوع */
export function MiniBars({ values, max, colors, labels, height = 56, highlightLast = true, labelColor = night.faint }: {
  values: (number | null)[]; max: number; colors: string | string[]; labels?: string[]; height?: number; highlightLast?: boolean; labelColor?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: height + (labels ? 18 : 0) }}>
      {values.map((v, i) => {
        const c = Array.isArray(colors) ? colors[i] : colors;
        const h = v == null ? 3 : Math.max(4, (Math.min(v, max) / max) * height);
        const last = highlightLast && i === values.length - 1;
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <View style={{ width: '100%', height: h, borderRadius: 3, backgroundColor: v == null ? night.line : c, opacity: last ? 1 : 0.55 }} />
            {labels ? <Animated.Text style={{ color: labelColor, fontSize: 10 }}>{labels[i]}</Animated.Text> : null}
          </View>
        );
      })}
    </View>
  );
}
