// عارض التمرين ثلاثي الأبعاد: شخصية ARQ (رجل/امرأة) تؤدي الحركة مع إضاءة العضلات العاملة
import '@/polyfills/process';
import { Ionicons } from '@expo/vector-icons';
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import * as THREE from 'three';
import { createHuman } from '@/three/human';
import { floorFor, motionDuration, MOTIONS, poseOpts } from '@/three/motions';
import { bakeStaticProps, createFloor, createProps } from '@/three/equipment';
import { fitMotion, fittedFrame, type Fit } from '@/three/fit';
import { motionBounds, placeCamera } from '@/three/framing';
import type { HumanStyle } from '@/three/human';
import { createStudio, enableShadows } from '@/three/studio';
import { applyPose, createRig, type Muscle } from '@/three/rig';
import { brand } from '@/theme';
import { ExerciseFigure2D, SPIN } from './ExerciseFigure2D';
import { initial3DMode, mark3DDone, mark3DFailed, mark3DStart, reset3D, type Mode3D } from './safe3d';
import './textDecoderPolyfill';
import { errorDetail, logEvent, setFatalGuard } from '@/lib/events';

export type Gender = 'male' | 'female';

// مكتبات الرسم ثلاثي الأبعاد نحمّلها وقت الحاجة داخل try/catch: لو فشل تحميلها نعرض 2D بدل ما ينقفل التطبيق
type Engine = typeof import('./r3f') & { GLTFLoader: typeof import('three/examples/jsm/loaders/GLTFLoader.js').GLTFLoader };
let engine: Engine | null | undefined;
function loadEngine(): Engine | null {
  if (engine === undefined) {
    try {
      const r3f = require('./r3f') as typeof import('./r3f');
      const { GLTFLoader } = require('three/examples/jsm/loaders/GLTFLoader.js') as typeof import('three/examples/jsm/loaders/GLTFLoader.js');
      engine = { ...r3f, GLTFLoader };
    } catch (e) {
      engine = null;
      logEvent('3d_import_error', errorDetail(e), { once: true });
    }
  }
  return engine;
}

const MODELS: Record<Gender, number> = {
  male: require('../../../assets/models/athlete_male.glb'),
  female: require('../../../assets/models/athlete_female.glb'),
};

interface Props {
  motion: keyof typeof MOTIONS;
  gender: Gender;
  /** تمييز عضلة محددة (عند الضغط على اسمها) بدل عضلات التمرين */
  focus?: Muscle | null;
  /** عضلات التمرين لو تختلف عن الحركة (تمارين المكتبة اللي تعرض خريطة العضلات) */
  muscles?: { primary: Muscle[]; secondary: Muscle[] };
  height?: number;
}

type SceneProps = Props & {
  playing: boolean; yaw: { current: number }; speed: number; bodyStyle: HumanStyle;
  onFrame: () => void; onFail: (where: string, e: unknown) => void;
};

function Scene({ motion, gender, focus, muscles, playing, yaw, speed, bodyStyle, onFrame, onFail }: SceneProps) {
  const { useLoader, useFrame, GLTFLoader } = loadEngine()!;
  const gltf = useLoader(GLTFLoader, MODELS[gender] as unknown as string);
  const m = MOTIONS[motion];
  const t = useRef(0);
  const dead = useRef(false);

  const rig = useMemo(() => {
    const driver = createRig();
    const human = createHuman(gltf.scene, driver);
    if (m.grip !== undefined) human.setGrip(m.grip);
    const props = createProps(human.propRig, m.props);
    const floor = createFloor();
    const world = new THREE.Group();
    world.add(human.object, props.group, floor);
    // الجسم يرتكز فعلاً على المقعد/المسند والقدمين على الأرض (تنحسب مرة لهذا النموذج)
    let fit: Fit | null = null;
    try { fit = fitMotion(human, driver, props, m); } catch (e) { logEvent('3d_fit_error', errorDetail(e), { once: true }); }
    const off = new THREE.Vector3();
    const frameAt = (time: number) => {
      const f = fittedFrame(m, fit, time, off);
      applyPose(driver, f.pose, poseOpts(m));
      human.sync(!!m.ground, floorFor(m), f.off);
    };
    // حدود اللاعب والجهاز خلال الحركة كلها: الكاميرا تقرّب عليها تلقائياً
    const bounds = motionBounds(driver, props, m, undefined, frameAt);
    // دمج أجزاء الأجهزة الثابتة (أسرع بالرسم)
    const dur = motionDuration(m);
    bakeStaticProps(props.group, [0, 0.21, 0.43, 0.62, 0.81].map((f) => () => {
      frameAt(f * dur);
      props.update();
    }));
    const center = bounds.getCenter(new THREE.Vector3());
    // الاستوديو: خلفية متدرجة + إضاءة ثلاثية + ظل حقيقي على الأرض
    try {
      world.add(createStudio(bounds, { shadows: true }).group);
      enableShadows(human.object);
      enableShadows(props.group);
    } catch (e) { logEvent('3d_studio_error', errorDetail(e), { once: true }); }
    return { driver, human, props, world, bounds, center, frameAt };
  }, [gltf, m]);
  const cam = useRef({ dist: 0 });
  const perf = useRef({ n: 0, t0: 0, sent: false });

  useEffect(() => {
    try { rig.human.setStyle(bodyStyle); } catch (e) { onFail('style', e); }
  }, [rig, bodyStyle, onFail]);
  useEffect(() => {
    try {
      const hl = muscles ?? m;
      if (focus) rig.human.setHighlight([focus], []);
      else rig.human.setHighlight(hl.primary, hl.secondary);
    } catch (e) { onFail('highlight', e); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rig, focus, m, onFail, muscles?.primary.join(), muscles?.secondary.join()]);

  // نرسم بأنفسنا (أولوية 1) داخل try/catch: أي خطأ في الرسم يحوّلنا للعرض ثنائي الأبعاد بدل ما ينقفل التطبيق
  useFrame(({ gl, scene, camera }, dt) => {
    if (dead.current) return;
    try {
      if (playing) t.current += Math.min(dt, 0.05) * speed;
      rig.frameAt(t.current);
      rig.props.update();
      // الكاميرا تدور حول اللاعب وتقرّب لأقصى حد يظهر فيه هو والجهاز
      // خريطة العضلات: دوران بطيء عشان تبان العضلات من قدام ومن ورا
      const spin = motion === 'muscle_map' ? t.current * SPIN : 0;
      placeCamera(camera as THREE.PerspectiveCamera, rig.bounds, rig.center, (m.view?.yaw ?? 35) + yaw.current + spin, cam.current);
      gl.render(scene, camera);
      onFrame();
      // قياس سلاسة الحركة مرة وحدة (عدد الإطارات بالثانية ودقة الرسم)
      const pf = perf.current;
      pf.n += 1;
      if (pf.n === 30) pf.t0 = Date.now();
      if (pf.n === 150 && !pf.sent) {
        pf.sent = true;
        const c = gl.getContext();
        logEvent('3d_perf', { motion, fps: Math.round(120000 / Math.max(1, Date.now() - pf.t0)), bufW: c.drawingBufferWidth, bufH: c.drawingBufferHeight, calls: gl.info.render.calls, tris: gl.info.render.triangles, dpr: gl.getPixelRatio() }, { once: true });
      }
    } catch (e) {
      dead.current = true;
      onFail('frame', e);
    }
  }, 1);

  return <primitive object={rig.world} />;
}

/** يلتقط أي خطأ في المشهد ثلاثي الأبعاد ويعرض البديل بدل شاشة فاضية */
class Guard extends Component<{ fallback: ReactNode; onError: (e: unknown) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { this.props.onError(e); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

const READY_FRAMES = 30;

export function ExerciseViewer({ motion, gender, focus, muscles, height = 420 }: Props) {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(true);
  const [slow, setSlow] = useState(false);
  // شكل الجسم: لاعب بملابس ARQ أو عرض تشريحي (جسم رمادي والعضلات الشغالة بالأحمر)
  const [bodyStyle, setBodyStyle] = useState<HumanStyle>(motion === 'muscle_map' ? 'anatomy' : 'athlete');
  // 3D (النموذج الواقعي) أو 2D (رسم بدون كرت الرسومات). نبدأ بالتحقق: هل طيّح 3D التطبيق قبل؟
  const [mode, setMode] = useState<'checking' | Mode3D>('checking');
  const failed = useRef(false);
  const frames = useRef(0);
  const started = useRef(Date.now());
  // الصفحة لسا مفتوحة؟ ما نكتب علامة "محاولة جارية" بعد ما تنقفل
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    initial3DMode().then(async (m) => {
      if (!alive.current) return;
      if (m === '3d' && !loadEngine()) { mark3DFailed({ where: 'import', motion }); m = '2d'; }
      if (m === '3d') await mark3DStart({ motion, gender });
      if (alive.current) { started.current = Date.now(); setMode(m); }
    });
    // عند الخروج نمسح العلامة دائماً حتى لو المشهد ما انفتح بعد:
    // أي كتابة انرسلت والصفحة مفتوحة تنمسح بعدها لأن AsyncStorage ينفذ الأوامر بالترتيب
    return () => { alive.current = false; mark3DDone(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fail = useCallback((where: string, e: unknown) => {
    if (failed.current) return;
    failed.current = true;
    const d = { where, motion, gender, frames: frames.current, ...errorDetail(e) };
    logEvent('3d_error', d);
    mark3DFailed(d);
    setMode('2d');
  }, [motion, gender]);

  const onFrame = useCallback(() => {
    frames.current += 1;
    if (frames.current === READY_FRAMES) {
      mark3DDone();
      logEvent('3d_human_ok', { motion, gender, ms: Date.now() - started.current }, { once: true });
    }
  }, [motion, gender]);

  // أثناء عرض 3D: أي خطأ قاتل نحوله للعرض 2D بدل إغلاق التطبيق، ولو ما اشتغل خلال ١٢ ثانية كذلك
  useEffect(() => {
    if (mode !== '3d') return;
    const off = setFatalGuard((e) => { fail('fatal', e); return true; });
    const id = setTimeout(() => {
      if (frames.current < READY_FRAMES) fail('timeout', new Error(`only ${frames.current} frames in 12s`));
    }, 12000);
    return () => { off(); clearTimeout(id); mark3DDone(); };
  }, [mode, fail]);

  const retry3D = async () => {
    if (!loadEngine()) return;
    await reset3D();
    if (!alive.current) return;
    failed.current = false; frames.current = 0;
    await mark3DStart({ motion, gender, retry: true });
    started.current = Date.now();
    setMode('3d');
  };

  const yaw = useRef(0);
  const start = useRef(0);
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4,
    onPanResponderGrant: () => { start.current = yaw.current; },
    onPanResponderMove: (_, g) => { yaw.current = start.current + g.dx * 0.6; },
  }), []);

  const speed = slow ? 0.45 : 1;
  const E = mode === '3d' ? loadEngine() : null;
  const flat = (
    <ExerciseFigure2D motion={motion} focus={focus} muscles={muscles} playing={playing} speed={speed} yaw={yaw}
      onError={(e) => logEvent('2d_error', { motion, ...errorDetail(e) }, { once: true })} />
  );

  return (
    <View style={[styles.wrap, { height }]} {...pan.panHandlers}>
      {mode === 'checking' ? (
        <View style={styles.center}><ActivityIndicator color={brand.orange} /></View>
      ) : mode === '2d' || !E ? flat : (
        <Guard key={gender} fallback={flat} onError={(e) => fail('render', e)}>
          <E.Canvas camera={{ fov: 30, near: 0.1, far: 50, position: [0, 1.3, 3.9] }} gl={{ antialias: true }}
            shadows={{ enabled: true, type: THREE.PCFShadowMap }}
            onCreated={({ gl }) => {
              try {
                const c = gl.getContext();
                logEvent('3d_gl', { webgl2: gl.capabilities.isWebGL2, version: String(c.getParameter(c.VERSION)) }, { once: true });
              } catch (e) { logEvent('3d_gl_error', errorDetail(e), { once: true }); }
            }}>
            <color attach="background" args={[brand.cream]} />
            <Suspense fallback={null}>
              <Scene motion={motion} gender={gender} focus={focus} muscles={muscles} playing={playing} yaw={yaw} speed={speed} bodyStyle={bodyStyle} onFrame={onFrame} onFail={fail} />
            </Suspense>
          </E.Canvas>
        </Guard>
      )}
      <View style={styles.controls} pointerEvents="box-none">
        <Pressable onPress={() => setPlaying((p) => !p)} style={styles.btn} accessibilityLabel={t(playing ? 'exercise.a11yPause' : 'exercise.a11yPlay')}>
          <Ionicons name={playing ? 'pause' : 'play'} size={18} color={brand.cream} />
        </Pressable>
        <Pressable onPress={() => setSlow((s) => !s)} style={[styles.btn, slow && { backgroundColor: brand.orange }]} accessibilityLabel={t('exercise.a11ySlow')}>
          <Ionicons name="speedometer-outline" size={18} color={brand.cream} />
        </Pressable>
        <Pressable onPress={() => { yaw.current += 90; }} style={styles.btn} accessibilityLabel={t('exercise.a11yRotate')}>
          <Ionicons name="sync" size={18} color={brand.cream} />
        </Pressable>
      </View>
      {mode === '3d' ? (
        <View style={styles.styleToggle}>
          {(['athlete', 'anatomy'] as const).map((st) => (
            <Pressable key={st} onPress={() => setBodyStyle(st)} style={[styles.styleOpt, bodyStyle === st && styles.styleOptOn]}
              accessibilityRole="button" accessibilityState={{ selected: bodyStyle === st }}>
              <Ionicons name={st === 'athlete' ? 'person' : 'body'} size={13} color={bodyStyle === st ? brand.cream : brand.green} />
              <Text style={[styles.styleTxt, bodyStyle === st && { color: brand.cream }]}>{t(st === 'athlete' ? 'exercise.styleAthlete' : 'exercise.styleMuscles')}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {mode === '2d' ? (
        <Pressable onPress={retry3D} style={styles.try3d} accessibilityLabel={t('exercise.a11y3d')}>
          <Ionicons name="cube-outline" size={14} color={brand.cream} />
          <Text style={styles.try3dText}>3D</Text>
        </Pressable>
      ) : null}
      <View style={styles.hint} pointerEvents="none">
        <Ionicons name="hand-left-outline" size={14} color={brand.green} />
      </View>
    </View>
  );
}

export function ViewerLoading({ height = 420 }: { height?: number }) {
  return <View style={[styles.wrap, { height, alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={brand.orange} /></View>;
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 20, overflow: 'hidden', backgroundColor: brand.cream },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  try3d: { position: 'absolute', bottom: 12, end: 12, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 30, borderRadius: 15, backgroundColor: 'rgba(10,51,45,0.85)' },
  try3dText: { color: brand.cream, fontSize: 12, fontWeight: '700' },
  styleToggle: { position: 'absolute', bottom: 12, start: 12, flexDirection: 'row', padding: 3, gap: 2, borderRadius: 16, backgroundColor: 'rgba(255,250,240,0.9)' },
  styleOpt: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 28, borderRadius: 14 },
  styleOptOn: { backgroundColor: 'rgba(10,51,45,0.9)' },
  styleTxt: { color: brand.green, fontSize: 12, fontWeight: '700' },
  controls: { position: 'absolute', top: 12, start: 12, gap: 8 },
  btn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(10,51,45,0.85)', alignItems: 'center', justifyContent: 'center' },
  hint: { position: 'absolute', top: 12, end: 12, opacity: 0.6 },
});
