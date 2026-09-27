// محرك المجسّم ثلاثي الأبعاد — three.js خالص (بدون React) حتى يكون قابل للاختبار ويعمل على الجوال والويب
//
// الاتجاهات: Y للأعلى، المجسّم يواجه +Z، يساره +X.
// الزوايا بالدرجات وبمعنى تشريحي: flex = ثني للأمام، abd = إبعاد للجانب، twist = تدوير حول محور الطرف.
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// الألوان (هوية أرك)
// ---------------------------------------------------------------------------
export const RIG_COLORS = {
  body: '#E8D2AE',
  pad: '#DCBF93',
  primary: '#F1551D',   // العضلة المستهدفة
  secondary: '#FEA94F', // عضلات مساعدة
  metal: '#0A332D',
  plate: '#16211E',
  bench: '#2F4B3C',
  benchPad: '#1E3A30',
  cable: '#0A332D',
  floor: '#0A332D',
};

export type Muscle =
  | 'chest' | 'shoulders' | 'rearDelts' | 'triceps' | 'biceps' | 'forearms' | 'abs'
  | 'upperBack' | 'lats' | 'lowerBack' | 'glutes' | 'quads' | 'hamstrings' | 'calves';

// ---------------------------------------------------------------------------
// الوضعية
// ---------------------------------------------------------------------------
export type Joint3 = [number, number, number]; // flex, abd, twist

export interface Pose {
  /** موضع ودوران الحوض. إذا ground=true يُحسب الارتفاع تلقائياً ليلامس القدمان الأرض */
  root?: { x?: number; y?: number; z?: number; pitch?: number; yaw?: number; roll?: number };
  spine?: number;   // ثني أسفل الظهر للأمام
  chest?: number;   // ثني أعلى الظهر
  neck?: number;
  lShoulder?: Joint3; rShoulder?: Joint3;
  lElbow?: number; rElbow?: number;
  lWrist?: number; rWrist?: number;
  lHip?: Joint3; rHip?: Joint3;
  lKnee?: number; rKnee?: number;
  lAnkle?: number; rAnkle?: number; // موجب = رفع الكعب (وقوف على الأصابع)
}

const J0: Joint3 = [0, 0, 0];

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const n = (x?: number, y?: number) => (x ?? 0) + ((y ?? 0) - (x ?? 0)) * t;
  const j = (x?: Joint3, y?: Joint3): Joint3 => {
    const p = x ?? J0; const q = y ?? J0;
    return [n(p[0], q[0]), n(p[1], q[1]), n(p[2], q[2])];
  };
  const ra = a.root ?? {}; const rb = b.root ?? {};
  return {
    root: {
      x: n(ra.x, rb.x), y: ra.y == null && rb.y == null ? undefined : n(ra.y, rb.y), z: n(ra.z, rb.z),
      pitch: n(ra.pitch, rb.pitch), yaw: n(ra.yaw, rb.yaw), roll: n(ra.roll, rb.roll),
    },
    spine: n(a.spine, b.spine), chest: n(a.chest, b.chest), neck: n(a.neck, b.neck),
    lShoulder: j(a.lShoulder, b.lShoulder), rShoulder: j(a.rShoulder, b.rShoulder),
    lElbow: n(a.lElbow, b.lElbow), rElbow: n(a.rElbow, b.rElbow),
    lWrist: n(a.lWrist, b.lWrist), rWrist: n(a.rWrist, b.rWrist),
    lHip: j(a.lHip, b.lHip), rHip: j(a.rHip, b.rHip),
    lKnee: n(a.lKnee, b.lKnee), rKnee: n(a.rKnee, b.rKnee),
    lAnkle: n(a.lAnkle, b.lAnkle), rAnkle: n(a.rAnkle, b.rAnkle),
  };
}

/** وضعية متماثلة: نفس القيم لليمين واليسار */
export function sym(p: {
  root?: Pose['root']; spine?: number; chest?: number; neck?: number;
  shoulder?: Joint3; elbow?: number; wrist?: number; hip?: Joint3; knee?: number; ankle?: number;
}): Pose {
  const out: Pose = {
    root: p.root, spine: p.spine, chest: p.chest, neck: p.neck,
    lShoulder: p.shoulder, rShoulder: p.shoulder, lElbow: p.elbow, rElbow: p.elbow,
    lWrist: p.wrist, rWrist: p.wrist,
    lHip: p.hip, rHip: p.hip, lKnee: p.knee, rKnee: p.knee, lAnkle: p.ankle, rAnkle: p.ankle,
  };
  // لا نرجع مفاتيح فارغة حتى لا تمسح قيم وضعية أخرى عند الدمج
  for (const k of Object.keys(out) as (keyof Pose)[]) if (out[k] === undefined) delete out[k];
  return out;
}

// ---------------------------------------------------------------------------
// بناء الهيكل
// ---------------------------------------------------------------------------
const D = THREE.MathUtils.degToRad;

function mat(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.02, ...opts });
}

function capsule(r: number, len: number, m: THREE.Material, y: number) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), m);
  mesh.position.y = y;
  return mesh;
}

function ellipsoid(sx: number, sy: number, sz: number, m: THREE.Material, pos: [number, number, number]) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), m);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(...pos);
  return mesh;
}

interface Side {
  hip: THREE.Group; knee: THREE.Group; ankle: THREE.Group; toe: THREE.Object3D; heel: THREE.Object3D;
  shoulder: THREE.Group; elbow: THREE.Group; wrist: THREE.Group; grip: THREE.Object3D;
}

export interface Rig {
  object: THREE.Group;          // يضاف للمشهد
  root: THREE.Group;            // الحوض
  spine: THREE.Group; chest: THREE.Group; neck: THREE.Group;
  L: Side; R: Side;
  barOnBack: THREE.Object3D;    // موضع البار على الظهر (سكوات)
  chestFront: THREE.Object3D;   // أمام الصدر (جوبلت)
  muscles: Record<Muscle, THREE.Mesh[]>;
  padMat: THREE.MeshStandardMaterial;
  setHighlight(primary: Muscle[], secondary: Muscle[]): void;
}

export function createRig(): Rig {
  const bodyMat = mat(RIG_COLORS.body);
  const padMat = mat(RIG_COLORS.pad);
  const muscles = {} as Record<Muscle, THREE.Mesh[]>;
  const reg = (k: Muscle, m: THREE.Mesh) => { (muscles[k] ??= []).push(m); return m; };
  const pad = (k: Muscle, sx: number, sy: number, sz: number, pos: [number, number, number]) =>
    reg(k, ellipsoid(sx, sy, sz, padMat.clone(), pos));

  const object = new THREE.Group();
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  object.add(root);

  // الحوض والأرداف
  root.add(ellipsoid(0.16, 0.1, 0.105, bodyMat, [0, -0.02, 0]));
  root.add(pad('glutes', 0.075, 0.08, 0.06, [0.07, -0.04, -0.07]));
  root.add(pad('glutes', 0.075, 0.08, 0.06, [-0.07, -0.04, -0.07]));

  // الجذع
  const spine = new THREE.Group(); spine.position.set(0, 0.05, 0); root.add(spine);
  spine.add(ellipsoid(0.14, 0.14, 0.095, bodyMat, [0, 0.11, 0]));
  spine.add(pad('abs', 0.085, 0.11, 0.035, [0, 0.11, 0.07]));
  spine.add(pad('lowerBack', 0.1, 0.1, 0.035, [0, 0.1, -0.07]));

  const chest = new THREE.Group(); chest.position.set(0, 0.22, 0); spine.add(chest);
  chest.add(ellipsoid(0.185, 0.17, 0.115, bodyMat, [0, 0.15, 0]));
  chest.add(pad('chest', 0.08, 0.065, 0.04, [0.075, 0.2, 0.09]));
  chest.add(pad('chest', 0.08, 0.065, 0.04, [-0.075, 0.2, 0.09]));
  chest.add(pad('upperBack', 0.13, 0.08, 0.04, [0, 0.23, -0.09]));
  chest.add(pad('lats', 0.075, 0.12, 0.04, [0.1, 0.1, -0.08]));
  chest.add(pad('lats', 0.075, 0.12, 0.04, [-0.1, 0.1, -0.08]));

  const neck = new THREE.Group(); neck.position.set(0, 0.31, 0); chest.add(neck);
  neck.add(capsule(0.045, 0.06, bodyMat, 0.04));
  neck.add(ellipsoid(0.095, 0.115, 0.105, bodyMat, [0, 0.15, 0.01]));

  const barOnBack = new THREE.Object3D(); barOnBack.position.set(0, 0.3, -0.1); chest.add(barOnBack);
  const chestFront = new THREE.Object3D(); chestFront.position.set(0, 0.2, 0.2); chest.add(chestFront);

  const buildArm = (s: 1 | -1) => {
    const shoulder = new THREE.Group(); shoulder.rotation.order = 'ZXY';
    shoulder.position.set(0.2 * s, 0.27, 0); chest.add(shoulder);
    shoulder.add(pad(s > 0 ? 'shoulders' : 'shoulders', 0.07, 0.07, 0.07, [0.012 * s, -0.02, 0.012]));
    shoulder.add(pad('rearDelts', 0.05, 0.05, 0.04, [0.012 * s, -0.025, -0.035]));
    shoulder.add(capsule(0.046, 0.2, bodyMat, -0.145));
    shoulder.add(pad('biceps', 0.036, 0.09, 0.032, [0, -0.14, 0.032]));
    shoulder.add(pad('triceps', 0.038, 0.1, 0.034, [0, -0.13, -0.033]));
    const elbow = new THREE.Group(); elbow.position.set(0, -0.29, 0); shoulder.add(elbow);
    elbow.add(reg('forearms', capsule(0.04, 0.17, padMat.clone(), -0.125)));
    const wrist = new THREE.Group(); wrist.position.set(0, -0.26, 0); elbow.add(wrist);
    wrist.add(ellipsoid(0.03, 0.05, 0.045, bodyMat, [0, -0.04, 0]));
    const grip = new THREE.Object3D(); grip.position.set(0, -0.055, 0.01); wrist.add(grip);
    return { shoulder, elbow, wrist, grip };
  };

  const buildLeg = (s: 1 | -1) => {
    const hip = new THREE.Group(); hip.rotation.order = 'ZXY';
    hip.position.set(0.09 * s, -0.05, 0); root.add(hip);
    hip.add(capsule(0.068, 0.3, bodyMat, -0.21));
    hip.add(pad('quads', 0.055, 0.15, 0.04, [0, -0.2, 0.045]));
    hip.add(pad('hamstrings', 0.052, 0.14, 0.038, [0, -0.21, -0.043]));
    const knee = new THREE.Group(); knee.position.set(0, -0.44, 0); hip.add(knee);
    knee.add(capsule(0.05, 0.32, bodyMat, -0.21));
    knee.add(pad('calves', 0.045, 0.1, 0.04, [0, -0.13, -0.035]));
    const ankle = new THREE.Group(); ankle.position.set(0, -0.43, 0); knee.add(ankle);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.055, 0.23), bodyMat);
    foot.position.set(0, -0.035, 0.065); ankle.add(foot);
    const toe = new THREE.Object3D(); toe.position.set(0, -0.062, 0.18); ankle.add(toe);
    const heel = new THREE.Object3D(); heel.position.set(0, -0.062, -0.05); ankle.add(heel);
    return { hip, knee, ankle, toe, heel };
  };

  const L = { ...buildArm(1), ...buildLeg(1) };
  const R = { ...buildArm(-1), ...buildLeg(-1) };

  const setHighlight = (primary: Muscle[], secondary: Muscle[]) => {
    for (const [k, list] of Object.entries(muscles) as [Muscle, THREE.Mesh[]][]) {
      const c = primary.includes(k) ? RIG_COLORS.primary : secondary.includes(k) ? RIG_COLORS.secondary : RIG_COLORS.pad;
      for (const m of list) {
        const mm = m.material as THREE.MeshStandardMaterial;
        mm.color.set(c);
        mm.emissive.set(primary.includes(k) ? '#5a1a05' : '#000000');
      }
    }
  };

  return { object, root, spine, chest, neck, L, R, barOnBack, chestFront, muscles, padMat, setHighlight };
}

// ---------------------------------------------------------------------------
// تطبيق الوضعية
// ---------------------------------------------------------------------------
const _v = new THREE.Vector3();

export function applyPose(rig: Rig, p: Pose, opts: { ground?: boolean; flatFeet?: boolean } = {}) {
  const r = p.root ?? {};
  rig.root.position.set(r.x ?? 0, r.y ?? 0.97, r.z ?? 0);
  rig.root.rotation.set(D(r.pitch ?? 0), D(r.yaw ?? 0), D(r.roll ?? 0));
  rig.spine.rotation.x = D(p.spine ?? 0);
  rig.chest.rotation.x = D(p.chest ?? 0);
  rig.neck.rotation.x = D(p.neck ?? 0);

  const side = (S: Side, s: 1 | -1, sh?: Joint3, el?: number, wr?: number, hp?: Joint3, kn?: number, an?: number) => {
    const a = sh ?? J0;
    S.shoulder.rotation.set(D(-a[0]), D(a[2] * s), D(a[1] * s));
    S.elbow.rotation.x = D(-(el ?? 0));
    S.wrist.rotation.x = D(-(wr ?? 0));
    const h = hp ?? J0;
    S.hip.rotation.set(D(-h[0]), D(h[2] * s), D(h[1] * s));
    S.knee.rotation.x = D(kn ?? 0);
    // القدم: بشكل افتراضي مسطحة بالنسبة للأرض (تعويض ميل الساق والحوض)
    const chain = -(h[0]) + (kn ?? 0) + (r.pitch ?? 0);
    S.ankle.rotation.x = opts.flatFeet === false ? D(an ?? 0) : D(-chain + (an ?? 0));
  };
  side(rig.L, 1, p.lShoulder, p.lElbow, p.lWrist, p.lHip, p.lKnee, p.lAnkle);
  side(rig.R, -1, p.rShoulder, p.rElbow, p.rWrist, p.rHip, p.rKnee, p.rAnkle);

  if (opts.ground) {
    rig.object.updateMatrixWorld(true);
    let min = Infinity;
    for (const o of [rig.L.toe, rig.L.heel, rig.R.toe, rig.R.heel]) {
      min = Math.min(min, o.getWorldPosition(_v).y);
    }
    rig.root.position.y -= min;
  }
  rig.object.updateMatrixWorld(true);
}

// ---------------------------------------------------------------------------
// الأدوات
// ---------------------------------------------------------------------------
export type PropKind =
  | 'barbell' | 'barbellBack' | 'ezbar' | 'dumbbells' | 'dumbbellR' | 'goblet' | 'hammerDumbbells'
  | 'bench' | 'inclineBench' | 'seat' | 'seatBack' | 'pullupBar' | 'dipBars' | 'cableLow' | 'cableHigh'
  | 'cableFly' | 'pecDeck' | 'legExtension' | 'legCurlLying' | 'legCurlSeated' | 'legPress' | 'hackSquat'
  | 'abWheel' | 'mat' | 'step' | 'benchBehind' | 'benchSideRow' | 'latBar' | 'backPad'
  | 'benchPress' | 'chestPress' | 'shoulderPress' | 'hipAbduction' | 'latMachine';

export interface PropSpec { kind: PropKind; pos?: [number, number, number]; }

export interface PropsRuntime { group: THREE.Group; update(): void; }

// الأدوات والأرضية انتقلت إلى equipment.ts
export { createFloor, createProps } from './equipment';
