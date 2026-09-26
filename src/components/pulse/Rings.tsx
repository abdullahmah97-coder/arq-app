// حلقات النبض: الجاهزية (خارجية) + الإجهاد (وسطى) + النوم (داخلية) — ترسم نفسها عند الظهور
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { night } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface Ring { value: number; color: string; color2?: string; track?: string }

export function Rings({ rings, size = 260, stroke = 16, gap = 8, children }: {
  rings: Ring[]; size?: number; stroke?: number; gap?: number; children?: ReactNode;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const anim = useRef(new Animated.Value(0)).current;
  const key = rings.map((r) => r.value.toFixed(3)).join('|');
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [key, anim]);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Defs>
          {rings.map((r, i) => (
            <LinearGradient key={i} id={`rg${uid}${i}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={r.color} />
              <Stop offset="1" stopColor={r.color2 ?? r.color} />
            </LinearGradient>
          ))}
        </Defs>
        {rings.map((r, i) => {
          const rad = size / 2 - stroke / 2 - i * (stroke + gap);
          const c = 2 * Math.PI * rad;
          const v = Math.max(0, Math.min(1, r.value));
          return (
            <GroupRing key={i} cx={size / 2} rad={rad} c={c} stroke={stroke} track={r.track ?? night.line}
              gradient={`url(#rg${uid}${i})`} offset={anim.interpolate({ inputRange: [0, 1], outputRange: [c, c * (1 - v)] })} />
          );
        })}
      </Svg>
      {children}
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

/** شريط تقدّم أفقي بأسلوب الشيفرون */
export function ChevronBar({ value, color, height = 10 }: { value: number; color: string; height?: number }) {
  const w = useRef(new Animated.Value(0)).current;
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
