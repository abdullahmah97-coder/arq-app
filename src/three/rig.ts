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
  twist?: number;   // لف الجذع (موجب = الكتف الأيسر للأمام) — يتوزع على أسفل وأعلى الظهر
  lean?: number;    // ميل الجذع للجنب (موجب = لليسار)
  lShoulder?: Joint3; rShoulder?: Joint3;
  lElbow?: number; rElbow?: number;
  lWrist?: number; rWrist?: number;
  /** لفّ الساعد (موجب = الكف يلتف للأمام/للأعلى مثل الكيرل، سالب = للخلف/للأسفل). 0 = الكفين متقابلين */
  lRoll?: number; rRoll?: number;
  /** ثني الرسغ للخلف (موجب = ظهر الكف باتجاه الساعد مثل الكف على الأرض بالضغط، سالب = ثني الكف للداخل) */
  lWext?: number; rWext?: number;
  lHip?: Joint3; rHip?: Joint3;
  lKnee?: number; rKnee?: number;
  lAnkle?: number; rAnkle?: number; // موجب = رفع الكعب (وقوف على الأصابع)
  /** فتح الركبة للخارج حول المحور العمودي للحوض (مهم بالسكوات العميق: الركبة فوق أصابع القدم) */
  lHipOut?: number; rHipOut?: number;
  /** بين وضعيتين: دوران الكتف والرسغ بأقصر طريق (بدل خلط الزوايا اللي يلف الذراع بشكل غريب) */
  q?: PoseQuats;
}

export interface PoseQuats { lShoulder: THREE.Quaternion; rShoulder: THREE.Quaternion; lWrist: THREE.Quaternion; rWrist: THREE.Quaternion }

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
    twist: n(a.twist, b.twist), lean: n(a.lean, b.lean),
    lShoulder: j(a.lShoulder, b.lShoulder), rShoulder: j(a.rShoulder, b.rShoulder),
    lElbow: n(a.lElbow, b.lElbow), rElbow: n(a.rElbow, b.rElbow),
    lWrist: n(a.lWrist, b.lWrist), rWrist: n(a.rWrist, b.rWrist),
    lRoll: n(a.lRoll, b.lRoll), rRoll: n(a.rRoll, b.rRoll),
    lWext: n(a.lWext, b.lWext), rWext: n(a.rWext, b.rWext),
    lHip: j(a.lHip, b.lHip), rHip: j(a.rHip, b.rHip),
    lKnee: n(a.lKnee, b.lKnee), rKnee: n(a.rKnee, b.rKnee),
    lAnkle: n(a.lAnkle, b.lAnkle), rAnkle: n(a.rAnkle, b.rAnkle),
    lHipOut: n(a.lHipOut, b.lHipOut), rHipOut: n(a.rHipOut, b.rHipOut),
  };
}

const _e = new THREE.Euler();
const quatCache = new WeakMap<Pose, PoseQuats>();
/** دوران الكتفين والرسغين من زوايا الوضعية (نفس ترتيب المحاور في applyPose) */
export function poseQuats(p: Pose): PoseQuats {
  let q = quatCache.get(p);
  if (q) return q;
  const sh = (a: Joint3 | undefined, s: 1 | -1) => {
    const j = a ?? J0;
    return new THREE.Quaternion().setFromEuler(_e.set(D(-j[0]), D(j[2] * s), D(j[1] * s), 'ZXY'));
  };
  const wr = (w: number | undefined, r: number | undefined, x: number | undefined, s: 1 | -1) =>
    new THREE.Quaternion().setFromEuler(_e.set(D(-(w ?? 0)), D((r ?? 0) * s), D((x ?? 0) * s), 'YXZ'));
  q = { lShoulder: sh(p.lShoulder, 1), rShoulder: sh(p.rShoulder, -1), lWrist: wr(p.lWrist, p.lRoll, p.lWext, 1), rWrist: wr(p.rWrist, p.rRoll, p.rWext, -1) };
  quatCache.set(p, q);
  return q;
}
/** بين وضعيتين: أقصر دوران للكتف والرسغ */
export function slerpQuats(a: PoseQuats, b: PoseQuats, t: number): PoseQuats {
  return {
    lShoulder: a.lShoulder.clone().slerp(b.lShoulder, t), rShoulder: a.rShoulder.clone().slerp(b.rShoulder, t),
    lWrist: a.lWrist.clone().slerp(b.lWrist, t), rWrist: a.rWrist.clone().slerp(b.rWrist, t),
  };
}

/** وضعية متماثلة: نفس القيم لليمين واليسار */
export function sym(p: {
  root?: Pose['root']; spine?: number; chest?: number; neck?: number; twist?: number; lean?: number;
  shoulder?: Joint3; elbow?: number; wrist?: number; roll?: number; wext?: number; hip?: Joint3; knee?: number; ankle?: number; hipOut?: number;
}): Pose {
  const out: Pose = {
    root: p.root, spine: p.spine, chest: p.chest, neck: p.neck, twist: p.twist, lean: p.lean,
    lShoulder: p.shoulder, rShoulder: p.shoulder, lElbow: p.elbow, rElbow: p.elbow,
    lWrist: p.wrist, rWrist: p.wrist, lRoll: p.roll, rRoll: p.roll, lWext: p.wext, rWext: p.wext,
    lHip: p.hip, rHip: p.hip, lKnee: p.knee, rKnee: p.knee, lAnkle: p.ankle, rAnkle: p.ankle,
    lHipOut: p.hipOut, rHipOut: p.hipOut,
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
    // الرسغ: لفّ حول محور الساعد أول (YXZ) ثم ثني الكف
    const wrist = new THREE.Group(); wrist.rotation.order = 'YXZ'; wrist.position.set(0, -0.26, 0); elbow.add(wrist);
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

const _qOut = new THREE.Quaternion();
const _Y = new THREE.Vector3(0, 1, 0);
export type FloorFn = (x: number, z: number) => number;
/**
 * تثبيت القدمين بمكانهما (بين الوضعيات ما تنزلق القدم): المرجع = منتصف القدم في الوضعية الأولى.
 * مع ground الارتفاع من الأرض، وبدونه (القدمين على لوح جهاز مثلاً) نثبّت الارتفاع كمان
 */
export interface Plant { side: 'both' | 'L' | 'R'; key0: Pose; anchor?: { x: number; y: number; z: number } }
/** flatFeet: true (الافتراضي) = القدمين مسطحة نسبة للأرض، false = تتبع الساق، 'L'/'R' = هذي القدم بس مسطحة والثانية تتبع ساقها */
export interface PoseOpts { ground?: boolean; flatFeet?: boolean | 'L' | 'R'; plant?: Plant }

function midfoot(rig: Rig, side: Plant['side'], out: THREE.Vector3) {
  const pts = side === 'L' ? [rig.L.toe, rig.L.heel] : side === 'R' ? [rig.R.toe, rig.R.heel] : [rig.L.toe, rig.L.heel, rig.R.toe, rig.R.heel];
  out.set(0, 0, 0);
  for (const o of pts) out.add(o.getWorldPosition(_v));
  return out.multiplyScalar(1 / pts.length);
}
const _mf = new THREE.Vector3();
const _U = new THREE.Vector3(); const _Lw = new THREE.Vector3(); const _Yw = new THREE.Vector3(); const _Fw = new THREE.Vector3();
const _qf = new THREE.Quaternion(); const _qc = new THREE.Quaternion(); const _qk = new THREE.Quaternion();
/** أقصى لفّ للقدم حول محورها الطولي (مدى مفصل تحت الكاحل تقريباً) */
const MAX_FOOT_ROLL = D(25);
const flatFoot = (opts: PoseOpts, s: 1 | -1) => opts.flatFeet === undefined || opts.flatFeet === true || opts.flatFeet === (s === 1 ? 'L' : 'R');

export function applyPose(rig: Rig, p: Pose, opts: PoseOpts = {}) {
  if (opts.plant && !opts.plant.anchor) {
    applyPose(rig, opts.plant.key0, { ground: opts.ground, flatFeet: opts.flatFeet });
    midfoot(rig, opts.plant.side, _mf);
    opts.plant.anchor = { x: _mf.x, y: _mf.y, z: _mf.z };
  }
  const r = p.root ?? {};
  rig.root.position.set(r.x ?? 0, r.y ?? 0.97, r.z ?? 0);
  rig.root.rotation.set(D(r.pitch ?? 0), D(r.yaw ?? 0), D(r.roll ?? 0));
  rig.spine.rotation.set(D(p.spine ?? 0), D((p.twist ?? 0) * 0.45), D((p.lean ?? 0) * 0.55));
  rig.chest.rotation.set(D(p.chest ?? 0), D((p.twist ?? 0) * 0.55), D((p.lean ?? 0) * 0.45));
  rig.neck.rotation.x = D(p.neck ?? 0);

  const side = (S: Side, s: 1 | -1, sh?: Joint3, el?: number, wr?: number, hp?: Joint3, kn?: number, an?: number, out?: number, roll?: number, wext?: number) => {
    const a = sh ?? J0;
    S.shoulder.rotation.set(D(-a[0]), D(a[2] * s), D(a[1] * s));
    S.elbow.rotation.x = D(-(el ?? 0));
    // ترتيب YXZ: لفّ الساعد، ثم ميلان الكف للجنب، ثم ثني الرسغ للخلف/للأمام (حول محور عرض الكف)
    S.wrist.rotation.set(D(-(wr ?? 0)), D((roll ?? 0) * s), D((wext ?? 0) * s));
    const h = hp ?? J0;
    S.hip.rotation.set(D(-h[0]), D(h[2] * s), D(h[1] * s));
    if (out) S.hip.quaternion.premultiply(_qOut.setFromAxisAngle(_Y, D(out * s)));
    S.knee.rotation.x = D(kn ?? 0);
    // القدم: بشكل افتراضي مسطحة بالنسبة للأرض (تعويض ميل الساق والحوض). القدم اللي بالهوا أو على ظهرها تتبع الساق
    // (زاوية الكاحل نسبة للساق: 0 = عمودية عليها، موجب = مشدودة للأسفل)
    const chain = -(h[0]) + (kn ?? 0) + (r.pitch ?? 0);
    S.ankle.rotation.set(flatFoot(opts, s) ? D(-chain + (an ?? 0)) : D(an ?? 0), 0, 0);
  };
  side(rig.L, 1, p.lShoulder, p.lElbow, p.lWrist, p.lHip, p.lKnee, p.lAnkle, p.lHipOut, p.lRoll, p.lWext);
  side(rig.R, -1, p.rShoulder, p.rElbow, p.rWrist, p.rHip, p.rKnee, p.rAnkle, p.rHipOut, p.rRoll, p.rWext);
  if (p.q) {
    rig.L.shoulder.quaternion.copy(p.q.lShoulder); rig.R.shoulder.quaternion.copy(p.q.rShoulder);
    rig.L.wrist.quaternion.copy(p.q.lWrist); rig.R.wrist.quaternion.copy(p.q.rWrist);
  }
  // القدم المسطحة مسطحة بالعرض كمان (ما تميل على حافتها الداخلية أو الخارجية): إبعاد أو لفّ الفخذ مع ثني الحوض يميّل الساق
  // للجنب، فنلفّ القدم حول محورها الطولي (مفصل تحت الكاحل) لين محورها الجانبي أفقي — بإطار ميلان الجذع للجنب
  // (البلانك الجانبي: القدمين على جنبها مع الجسم)
  const fl = flatFoot(opts, 1); const fr = flatFoot(opts, -1);
  if (fl || fr) {
    rig.object.updateMatrixWorld(true);
    const rr = D(r.roll ?? 0); const ry = D(r.yaw ?? 0);
    _U.set(-Math.sin(rr) * Math.cos(ry), Math.cos(rr), Math.sin(rr) * Math.sin(ry));
    for (const [S, on] of [[rig.L, fl], [rig.R, fr]] as const) {
      if (!on) continue;
      S.ankle.getWorldQuaternion(_qf);
      _Lw.set(1, 0, 0).applyQuaternion(_qf); _Yw.set(0, 1, 0).applyQuaternion(_qf); _Fw.set(0, 0, 1).applyQuaternion(_qf);
      // أصغر لفّة تخلي المحور الجانبي أفقي (القدم ممكن تكون مقلوبة: ليق برس، بلانك)
      const a = _Lw.dot(_U); const b = _Yw.dot(_U);
      if (Math.abs(a) < 1e-4) continue;
      const phi = THREE.MathUtils.clamp(Math.atan(-a / b), -MAX_FOOT_ROLL, MAX_FOOT_ROLL);
      _qc.setFromAxisAngle(_Fw, phi).multiply(_qf);
      S.knee.getWorldQuaternion(_qk).invert();
      S.ankle.quaternion.copy(_qk.multiply(_qc));
    }
  }

  if (opts.ground) {
    rig.object.updateMatrixWorld(true);
    let min = Infinity;
    for (const o of [rig.L.toe, rig.L.heel, rig.R.toe, rig.R.heel]) {
      min = Math.min(min, o.getWorldPosition(_v).y);
    }
    rig.root.position.y -= min;
  }
  if (opts.plant?.anchor) {
    rig.object.updateMatrixWorld(true);
    midfoot(rig, opts.plant.side, _mf);
    rig.root.position.x += opts.plant.anchor.x - _mf.x;
    rig.root.position.z += opts.plant.anchor.z - _mf.z;
    if (!opts.ground) rig.root.position.y += opts.plant.anchor.y - _mf.y;
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
  | 'abWheel' | 'mat' | 'matSide' | 'step' | 'benchBehind' | 'benchSideRow' | 'latBar' | 'backPad'
  | 'benchPress' | 'chestPress' | 'shoulderPress' | 'hipAbduction' | 'latMachine' | 'rowStation'
  | 'declineBench' | 'preacherBench' | 'hyperBench' | 'plyoBox' | 'smithBar' | 'lowBar' | 'band'
  | 'cableAnkle' | 'cableSide' | 'hipAdduction' | 'kettlebell' | 'medBall' | 'cableFlyLow' | 'rackPins'
  | 'dumbbellPullover' | 'dumbbellOverhead' | 'reversePecDeck' | 'benchRear' | 'dumbbellHips';

export interface PropSpec { kind: PropKind; pos?: [number, number, number]; }

/** دور السطح: bench = بنش مستوي يتمدد عليه، seat = مقعد، back = مسند ظهر */
export type SupportRole = 'bench' | 'seat' | 'back' | 'mat';
/** سطح يرتكز عليه اللاعب (مستطيل): المركز، العمودي باتجاه اللاعب، محورا السطح ونصف الطول بكل اتجاه */
export interface Support { role: SupportRole; c: THREE.Vector3; n: THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3; hu: number; hv: number }

export interface PropsRuntime { group: THREE.Group; update(): void; supports: Support[] }

// الأدوات والأرضية انتقلت إلى equipment.ts
export { createFloor, createProps } from './equipment';
