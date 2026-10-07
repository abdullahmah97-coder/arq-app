// مسرح مكتب أرك أب: المشهد ثلاثي الأبعاد + لوحات المكاتب فوقه (React Native عشان العربي والخطوط واللمس)،
// وبديل ثنائي الأبعاد (SVG بنفس الإسقاط) لو 3D طيّح التطبيق أو فشل — نفس حماية عارض التمارين بمفاتيح خاصة بالمكتب
import '@/polyfills/process';
import { Ionicons } from '@expo/vector-icons';
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, I18nManager, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Polygon } from 'react-native-svg';
import type * as THREE from 'three';
import { T } from '@/components/ui';
import { errorDetail, logEvent, setFatalGuard } from '@/lib/events';
import { DESKS, deskSpot, paintOrder, type DeskId, type DeskState } from '@/lib/officeCore';
import { brand, night } from '@/theme';
import { initial3DMode, mark3DDone, mark3DFailed, mark3DStart, reset3D, type Mode3D } from '../exercise/safe3d';
import { buildOffice, flatOffice, officeCamera, SIGN_Y, SIGN_Z, toScreen, type OfficeWorld } from './officeScene';

const SCOPE = 'office3d';
const READY_FRAMES = 30;
const SIGN_W = 96;
const SIGN_H = 22;

// الألوان تنقرا وقت الرسم (مو في StyleSheet) لأن ثيم التطبيق يتبدّل وقت التشغيل
// مكتبة الرسم ثلاثي الأبعاد نحمّلها وقت الحاجة داخل try/catch: لو فشل تحميلها نعرض 2D بدل ما ينقفل التطبيق
type R3F = typeof import('../exercise/r3f');
let r3f: R3F | null | undefined;
function loadR3F(): R3F | null {
  if (r3f === undefined) {
    try { r3f = require('../exercise/r3f') as R3F; } catch (e) { r3f = null; logEvent('office3d_import_error', errorDetail(e), { once: true }); }
  }
  return r3f;
}

/** ألوان الأرضية من الهوية (تنقرا وقت الرسم لأن ثيم التطبيق يتبدّل) */
const palette = () => ({ rug: '#E9CFA6', rugOn: brand.amber, top: brand.sand, base: '#B5562E', baseDark: '#8E4022' });

interface Live { states: DeskState[]; selected: DeskId | null }

function Scene({ cam, live, onFrame, onFail }: {
  cam: { current: THREE.Camera }; live: { current: Live }; onFrame: () => void; onFail: (where: string, e: unknown) => void;
}) {
  const { useFrame } = loadR3F()!;
  const world = useMemo<OfficeWorld>(() => buildOffice(palette()), []);
  useEffect(() => () => world.dispose(), [world]);
  const shown = useRef<Live | null>(null);
  const t = useRef(0);
  const dead = useRef(false);
  // أولوية 1: نرسم بنفسنا بكاميرتنا (نفس الكاميرا اللي تحسب أماكن اللوحات)
  useFrame(({ gl, scene }, dt) => {
    if (dead.current) return;
    try {
      if (shown.current !== live.current) { world.update(live.current.states, live.current.selected); shown.current = live.current; }
      t.current += Math.min(dt, 0.05);
      world.tick(t.current);
      gl.render(scene, cam.current);
      onFrame();
    } catch (e) {
      dead.current = true;
      onFail('frame', e);
    }
  }, 1);
  return <primitive object={world.group} />;
}

/** يلتقط أي خطأ في المشهد ثلاثي الأبعاد ويعرض البديل بدل شاشة فاضية */
class Guard extends Component<{ fallback: ReactNode; onError: (e: unknown) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { this.props.onError(e); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

interface Props {
  states: DeskState[];
  selected: DeskId | null;
  onPick: (id: DeskId) => void;
  /** اسم قصير لكل مكتب (اللوحة) */
  label: (id: DeskId) => string;
  /** الشاشة مو ظاهرة (فتحت قسم فوقها): نوقف الرسم */
  paused: boolean;
}

export function OfficeStage({ states, selected, onPick, label, paused }: Props) {
  const { t } = useTranslation();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [mode, setMode] = useState<'checking' | Mode3D>('checking');
  const failed = useRef(false);
  const frames = useRef(0);
  const started = useRef(Date.now());

  const cam = useMemo(() => (size ? officeCamera(size.w, size.h) : null), [size]);
  const camRef = useRef<THREE.Camera>(null!);
  if (cam) camRef.current = cam;
  const live = useRef<Live>({ states, selected });
  // كائن جديد مع كل تغيير: المشهد يقارن بالمرجع ويحدّث الشاشات والعلامات مرة وحدة
  if (live.current.states !== states || live.current.selected !== selected) live.current = { states, selected };

  useEffect(() => {
    let alive = true;
    initial3DMode(SCOPE).then(async (m) => {
      if (m === '3d' && !loadR3F()) { mark3DFailed({ where: 'import' }, SCOPE); m = '2d'; }
      if (m === '3d') await mark3DStart({ screen: 'office' }, SCOPE);
      if (alive) { started.current = Date.now(); setMode(m); }
    });
    return () => { alive = false; };
  }, []);

  const fail = useCallback((where: string, e: unknown) => {
    if (failed.current) return;
    failed.current = true;
    const d = { where, frames: frames.current, ...errorDetail(e) };
    logEvent('office3d_error', d);
    mark3DFailed(d, SCOPE);
    setMode('2d');
  }, []);

  const onFrame = useCallback(() => {
    frames.current += 1;
    if (frames.current === READY_FRAMES) {
      mark3DDone(SCOPE);
      logEvent('office3d_ok', { ms: Date.now() - started.current }, { once: true });
    }
  }, []);

  // أثناء عرض 3D والشاشة ظاهرة: أي خطأ قاتل نحوله لـ 2D بدل إغلاق التطبيق، ولو ما اشتغل خلال ١٢ ثانية كذلك
  useEffect(() => {
    if (mode !== '3d' || paused) return;
    const off = setFatalGuard((e) => { fail('fatal', e); return true; });
    const id = setTimeout(() => {
      if (frames.current < READY_FRAMES) fail('timeout', new Error(`only ${frames.current} frames in 12s`));
    }, 12000);
    return () => { off(); clearTimeout(id); };
  }, [mode, paused, fail]);
  // خرج من الشاشة بدون مشاكل: نمسح علامة "محاولة جارية"
  useEffect(() => () => mark3DDone(SCOPE), []);

  const retry3D = async () => {
    if (!loadR3F()) return;
    await reset3D(SCOPE);
    failed.current = false; frames.current = 0;
    await mark3DStart({ screen: 'office', retry: true }, SCOPE);
    started.current = Date.now();
    setMode('3d');
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const w = Math.round(width), h = Math.round(height);
    if (w > 0 && h > 0 && (w !== size?.w || h !== size?.h)) setSize({ w, h });
  };

  const E = mode === '3d' ? loadR3F() : null;
  const flat = cam && size ? <Flat cam={cam} w={size.w} h={size.h} states={states} selected={selected} /> : null;

  return (
    <View style={[styles.wrap, { backgroundColor: night.bg }]} onLayout={onLayout}>
      {!cam || !size || mode === 'checking' ? (
        <View style={styles.center}><ActivityIndicator color={brand.amber} /></View>
      ) : mode === '2d' || !E ? flat : (
        <Guard fallback={flat} onError={(e) => fail('render', e)}>
          <E.Canvas style={StyleSheet.absoluteFill} flat frameloop={paused ? 'never' : 'always'} gl={{ antialias: true }}
            onCreated={({ gl }) => {
              try {
                const c = gl.getContext();
                logEvent('office3d_gl', { webgl2: gl.capabilities.isWebGL2, version: String(c.getParameter(c.VERSION)) }, { once: true });
              } catch (e) { logEvent('office3d_gl_error', errorDetail(e), { once: true }); }
            }}>
            <color attach="background" args={[night.bg]} />
            <Suspense fallback={null}>
              <Scene cam={camRef} live={live} onFrame={onFrame} onFail={fail} />
            </Suspense>
          </E.Canvas>
        </Guard>
      )}

      {/* اللوحات: أماكنها محسوبة بالبكسل، فنثبّت الاتجاه LTR للتموضع ونرجّع اتجاه اللغة داخل كل لوحة */}
      {cam && size ? (
        <View style={[StyleSheet.absoluteFill, { direction: 'ltr' }]} pointerEvents="box-none">
          {paintOrder(DESKS).map((d) => {
            // الجوالات الصغيرة: لوحات أضيق عشان ما تتراكب
            const signW = Math.min(SIGN_W, Math.round(size.w * 0.27));
            const [x, z] = deskSpot(d);
            // اللوحة فوق الشاشة، ومنطقة اللمس تنزل لين الكرسي (المكتب كله يتضغط)
            const sign = toScreen(cam, x, SIGN_Y, z + SIGN_Z, size.w, size.h);
            const base = toScreen(cam, x, 0.3, z + 0.95, size.w, size.h);
            const st = states.find((s) => s.id === d.id);
            const on = selected === d.id;
            const top = sign.y - SIGN_H;
            return (
              <Pressable key={d.id} onPress={() => onPick(d.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
                accessibilityLabel={t('office.a11yDesk', { name: label(d.id), n: st?.waiting ?? 0 })}
                style={{ position: 'absolute', left: sign.x - signW / 2, top, width: signW, height: Math.max(SIGN_H * 2, base.y - top), alignItems: 'center' }}>
                <View style={[styles.sign, { maxWidth: signW }, on && { backgroundColor: brand.amber, borderColor: brand.amber }, { direction: I18nManager.isRTL ? 'rtl' : 'ltr' }]}>
                  <Ionicons name={d.icon as never} size={11} color={on ? brand.deepGreen : brand.amber} />
                  <T size="xs" bold color={on ? brand.deepGreen : brand.cream} numberOfLines={1} style={styles.signText}>{label(d.id)}</T>
                  {st?.waiting ? (
                    <View style={[styles.badge, { backgroundColor: brand.orange }]}><Text style={[styles.badgeText, { color: brand.cream }]}>{st.waiting > 99 ? '99+' : st.waiting}</Text></View>
                  ) : (
                    <Ionicons name="checkmark-circle" size={12} color={on ? brand.deepGreen : '#8FD19E'} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {mode === '2d' ? (
        <Pressable onPress={retry3D} style={styles.try3d} accessibilityRole="button" accessibilityLabel={t('office.try3d')}>
          <Ionicons name="cube-outline" size={14} color={brand.cream} />
          <Text style={[styles.try3dText, { color: brand.cream }]}>3D</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Flat({ cam, w, h, states, selected }: { cam: THREE.Camera; w: number; h: number; states: DeskState[]; selected: DeskId | null }) {
  const shapes = useMemo(() => {
    try { return flatOffice(cam, w, h, states, selected, palette()); } catch (e) {
      logEvent('office2d_error', errorDetail(e), { once: true });
      return [];
    }
  }, [cam, w, h, states, selected]);
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      {shapes.map((s, i) => (s.kind === 'poly'
        ? <Polygon key={i} points={s.points} fill={s.fill} />
        : <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} />))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', aspectRatio: 1 / 0.8, borderRadius: 16, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sign: {
    flexDirection: 'row', alignItems: 'center', gap: 3, height: SIGN_H, paddingHorizontal: 6, borderRadius: 6,
    backgroundColor: 'rgba(6,31,27,0.88)', borderWidth: 1, borderColor: 'rgba(248,237,218,0.18)',
  },
  signText: { flexShrink: 1, fontSize: 10, lineHeight: 14 },
  badge: { minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, fontWeight: '800' },
  try3d: { position: 'absolute', bottom: 10, end: 10, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 30, borderRadius: 15, backgroundColor: 'rgba(248,237,218,0.16)' },
  try3dText: { fontSize: 12, fontWeight: '700' },
});
