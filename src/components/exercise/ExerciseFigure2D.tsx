// عرض الحركة بدون كرت الرسومات: نفس المجسّم ونفس الحركة لكن مرسوم بـ SVG (يشتغل على أي جوال بدون ما ينهار)
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Polygon, Polyline, Rect } from 'react-native-svg';
import { createFlatScene, type FlatFrame } from '@/three/flat';
import type { MOTIONS } from '@/three/motions';
import type { Muscle } from '@/three/rig';
import { brand } from '@/theme';

interface Props {
  motion: keyof typeof MOTIONS;
  focus?: Muscle | null;
  /** عضلات التمرين (لو تختلف عن الحركة، مثل تمارين خريطة العضلات) */
  muscles?: { primary: Muscle[]; secondary: Muscle[] };
  playing: boolean;
  speed: number;
  yaw: { current: number };
  onError?: (e: unknown) => void;
}

const FRAME_MS = 1000 / 24;
/** سرعة دوران خريطة العضلات (درجة/ثانية) */
export const SPIN = 30;

export function ExerciseFigure2D({ motion, focus, muscles, playing, speed, yaw, onError }: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [frame, setFrame] = useState<FlatFrame | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const scene = useMemo(() => {
    try { return createFlatScene(motion, muscles); } catch (e) { onErrorRef.current?.(e); return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motion, muscles?.primary.join(), muscles?.secondary.join()]);
  const live = useRef({ playing, speed, focus });
  live.current = { playing, speed, focus };

  useEffect(() => { try { scene?.setHighlight(focus ?? null); } catch (e) { onErrorRef.current?.(e); } }, [scene, focus]);

  useEffect(() => {
    if (!scene || !size.w || !size.h) return;
    let raf = 0; let last = 0; let t = 0; let stopped = false; let lastYaw = NaN; let lastFocus: unknown = undefined; let drawnPaused = false;
    const tick = (now: number) => {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      if (last && now - last < FRAME_MS) return;
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      const { playing: p, speed: s, focus: f } = live.current;
      // الحركة موقفة والزاوية والعضلة ما تغيّرت: لا نعيد الرسم
      if (!p && drawnPaused && lastYaw === yaw.current && lastFocus === f) return;
      if (p) t += dt * s;
      try {
        // خريطة العضلات: دوران بطيء عشان تبان العضلات من قدام ومن ورا
        setFrame(scene.frame(t, yaw.current + (motion === 'muscle_map' ? t * SPIN : 0), size.w, size.h));
        lastYaw = yaw.current; lastFocus = f; drawnPaused = !p;
      } catch (e) {
        stopped = true;
        onErrorRef.current?.(e);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }, [scene, size.w, size.h, yaw, motion]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - size.w) > 1 || Math.abs(height - size.h) > 1) setSize({ w: width, h: height });
  };

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      {size.w > 0 && frame ? (
        <Svg width={size.w} height={size.h}>
          <Rect x={0} y={0} width={size.w} height={size.h} fill={brand.cream} />
          {frame.shapes.map((s, i) => (
            <Polygon key={i} points={s.pts} fill={s.fill} fillOpacity={s.opacity ?? 1}
              stroke={s.fill} strokeOpacity={s.opacity ?? 1} strokeWidth={0.6} strokeLinejoin="round" />
          ))}
          {frame.lines.map((l, i) => (
            <Polyline key={`l${i}`} points={l.pts} stroke={l.stroke} strokeWidth={2} fill="none" />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}
