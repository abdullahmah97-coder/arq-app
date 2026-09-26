// عارض التمرين ثلاثي الأبعاد: شخصية ARQ (رجل/امرأة) تؤدي الحركة مع إضاءة العضلات العاملة
import { Ionicons } from '@expo/vector-icons';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createHuman } from '@/three/human';
import { MOTIONS, sampleMotion } from '@/three/motions';
import { applyPose, createFloor, createProps, createRig, type Muscle } from '@/three/rig';
import { brand } from '@/theme';
import { Canvas, useFrame, useLoader, useThree } from './r3f';

export type Gender = 'male' | 'female';

const MODELS: Record<Gender, number> = {
  male: require('../../../assets/models/athlete_male.glb'),
  female: require('../../../assets/models/athlete_female.glb'),
};

interface Props {
  motion: keyof typeof MOTIONS;
  gender: Gender;
  /** تمييز عضلة محددة (عند الضغط على اسمها) بدل عضلات التمرين */
  focus?: Muscle | null;
  height?: number;
}

function Scene({ motion, gender, focus, playing, yaw, speed }: Props & { playing: boolean; yaw: { current: number }; speed: number }) {
  const gltf = useLoader(GLTFLoader, MODELS[gender] as unknown as string);
  const m = MOTIONS[motion];
  const { camera } = useThree();
  const t = useRef(0);

  const rig = useMemo(() => {
    const driver = createRig();
    const human = createHuman(gltf.scene, driver);
    const props = createProps(human.propRig, m.props);
    const floor = createFloor();
    const world = new THREE.Group();
    world.add(human.object, props.group, floor);
    return { driver, human, props, world };
  }, [gltf, m]);

  useEffect(() => {
    if (focus) rig.human.setHighlight([focus], []);
    else rig.human.setHighlight(m.primary, m.secondary);
  }, [rig, focus, m]);


  useFrame((_, dt) => {
    if (playing) t.current += Math.min(dt, 0.05) * speed;
    applyPose(rig.driver, sampleMotion(m, t.current), { ground: m.ground });
    rig.human.sync(!!m.ground);
    rig.props.update();
    // الكاميرا تدور حول المجسّم (المجسّم والأدوات محسوبة بإحداثيات العالم فلا ندوّرها)
    const a = -THREE.MathUtils.degToRad((m.view?.yaw ?? 35) + yaw.current);
    const dist = m.view?.dist ?? 3.9; const y = m.view?.y ?? 0.9;
    camera.position.set(Math.sin(a) * dist, y + 0.4, Math.cos(a) * dist);
    camera.lookAt(0, y, 0);
  });

  return <primitive object={rig.world} />;
}

export function ExerciseViewer({ motion, gender, focus, height = 380 }: Props) {
  const [playing, setPlaying] = useState(true);
  const [slow, setSlow] = useState(false);
  const yaw = useRef(0);
  const start = useRef(0);
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4,
    onPanResponderGrant: () => { start.current = yaw.current; },
    onPanResponderMove: (_, g) => { yaw.current = start.current + g.dx * 0.6; },
  }), []);

  return (
    <View style={[styles.wrap, { height }]} {...pan.panHandlers}>
      <Canvas camera={{ fov: 30, near: 0.1, far: 50, position: [0, 1.3, 3.9] }} gl={{ antialias: true }}>
        <color attach="background" args={[brand.cream]} />
        <hemisphereLight args={['#fff7ea', '#b89a74', 1.3]} />
        <directionalLight position={[2, 4, 3]} intensity={2.2} />
        <directionalLight position={[-3, 2, -3]} intensity={0.8} color={brand.amber} />
        <Suspense fallback={null}>
          <Scene motion={motion} gender={gender} focus={focus} playing={playing} yaw={yaw} speed={slow ? 0.45 : 1} />
        </Suspense>
      </Canvas>
      <View style={styles.controls} pointerEvents="box-none">
        <Pressable onPress={() => setPlaying((p) => !p)} style={styles.btn} accessibilityLabel={playing ? 'Pause' : 'Play'}>
          <Ionicons name={playing ? 'pause' : 'play'} size={18} color={brand.cream} />
        </Pressable>
        <Pressable onPress={() => setSlow((s) => !s)} style={[styles.btn, slow && { backgroundColor: brand.orange }]} accessibilityLabel="Slow motion">
          <Ionicons name="speedometer-outline" size={18} color={brand.cream} />
        </Pressable>
        <Pressable onPress={() => { yaw.current += 90; }} style={styles.btn} accessibilityLabel="Rotate">
          <Ionicons name="sync" size={18} color={brand.cream} />
        </Pressable>
      </View>
      <View style={styles.hint} pointerEvents="none">
        <Ionicons name="hand-left-outline" size={14} color={brand.green} />
      </View>
    </View>
  );
}

export function ViewerLoading({ height = 380 }: { height?: number }) {
  return <View style={[styles.wrap, { height, alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={brand.orange} /></View>;
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 20, overflow: 'hidden', backgroundColor: brand.cream },
  controls: { position: 'absolute', top: 12, start: 12, gap: 8 },
  btn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(10,51,45,0.85)', alignItems: 'center', justifyContent: 'center' },
  hint: { position: 'absolute', top: 12, end: 12, opacity: 0.6 },
});
