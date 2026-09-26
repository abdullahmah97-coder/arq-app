// مكتبة الحركات: لكل تمرين وضعيات مفتاحية + أدوات + العضلات + زاوية الكاميرا
import { lerpPose, sym, type Muscle, type Pose, type PropSpec } from './rig';

export interface Motion {
  keys: Pose[];            // تدور الحركة: 0 → 1 → … → 0
  tempo: number[];         // ثواني كل انتقال (بنفس طول keys)
  hold?: number[];         // ثبات عند كل وضعية
  ground?: boolean;        // حساب الارتفاع تلقائياً لتلامس القدمان الأرض
  props: PropSpec[];
  primary: Muscle[];
  secondary: Muscle[];
  view?: { yaw?: number; pitch?: number; dist?: number; y?: number };
}

// ---------------------------------------------------------------------------
// وضعيات أساسية
// ---------------------------------------------------------------------------
const STAND = sym({ shoulder: [0, 6, 0], elbow: 8, hip: [0, 4, 0] });
const armsHangFront = (flex = 6): Pose => sym({ shoulder: [flex, 4, 0], elbow: 4, hip: [0, 5, 0] });
const withHands = (p: Pose, h: Pose): Pose => ({ ...p, lShoulder: h.lShoulder, rShoulder: h.rShoulder, lElbow: h.lElbow, rElbow: h.rElbow });

// ---------------------------------------------------------------------------
// الحركات
// ---------------------------------------------------------------------------
const squatTop = (arms: Pose) => withHands(sym({ hip: [0, 10, 12], knee: 0 }), arms);
const squatBottom = (arms: Pose, lean = 30) => withHands(sym({ spine: lean, hip: [108, 18, 12], knee: 118, neck: -lean * 0.6 }), arms);
const GOBLET_ARMS = sym({ shoulder: [28, 22, 0], elbow: 142 });
const BACK_ARMS = sym({ shoulder: [-22, 78, 90], elbow: 142 });

const hinge = (pitch: number, thigh: number, knee: number, armFlexExtra = 0): Pose => ({
  ...sym({ root: { pitch }, hip: [pitch + thigh, 5, 0], knee, shoulder: [pitch + armFlexExtra, 5, 0], elbow: 3, neck: -pitch * 0.45 }),
});

const lunge = (depth: number): Pose => ({
  lHip: [25 + 65 * depth, 6, 0], lKnee: 10 + 85 * depth,
  rHip: [-25 + 10 * depth, 6, 0], rKnee: 15 + 80 * depth, rAnkle: 35 + 25 * depth,
  lShoulder: [4, 4, 0], rShoulder: [4, 4, 0], lElbow: 4, rElbow: 4,
});

const bulgarian = (depth: number): Pose => ({
  lHip: [30 + 60 * depth, 6, 0], lKnee: 10 + 80 * depth,
  rHip: [-40 + 5 * depth, 4, 0], rKnee: 70 + 25 * depth, rAnkle: 0,
  lShoulder: [4, 4, 0], rShoulder: [4, 4, 0], lElbow: 4, rElbow: 4,
});

// الاستلقاء على البنش: الحوض فوق البنش، الرأس باتجاه −Z
const SUPINE_ROOT = { y: 0.56, z: 0.1, pitch: -90 };
const supineLegs = { lHip: [-35, 22, 0] as [number, number, number], rHip: [-35, 22, 0] as [number, number, number], lKnee: 95, rKnee: 95 };
const pressTop = (abd = 12): Pose => ({ root: SUPINE_ROOT, ...supineLegs, ...sym({ shoulder: [90, abd, 0], elbow: 2 }) });
const pressBottom = (): Pose => ({ root: SUPINE_ROOT, ...supineLegs, ...sym({ shoulder: [-12, 66, 0], elbow: 88 }) });

const INCLINE_ROOT = { y: 0.52, z: 0.08, pitch: -52 };
const inclineLegs = { lHip: [52, 18, 0] as [number, number, number], rHip: [52, 18, 0] as [number, number, number], lKnee: 95, rKnee: 95 };

// الجلوس على كرسي
const SEATED_ROOT = { y: 0.58, z: 0 };
const seatedLegs = { lHip: [88, 14, 0] as [number, number, number], rHip: [88, 14, 0] as [number, number, number], lKnee: 88, rKnee: 88 };
const seated = (p: Pose): Pose => ({ root: SEATED_ROOT, ...seatedLegs, ...p, lHip: p.lHip ?? seatedLegs.lHip, rHip: p.rHip ?? seatedLegs.rHip, lKnee: p.lKnee ?? 88, rKnee: p.rKnee ?? 88 });

const pressOverheadBottom = sym({ shoulder: [0, 82, 90], elbow: 100 });
const pressOverheadTop = sym({ shoulder: [0, 168, 90], elbow: 6 });

export const MOTIONS: Record<string, Motion> = {
  // ---------------- أرجل ----------------
  goblet_squat: {
    keys: [squatTop(GOBLET_ARMS), squatBottom(GOBLET_ARMS, 18)], tempo: [1.7, 1.2], hold: [0.3, 0.2], ground: true,
    props: [{ kind: 'goblet' }], primary: ['quads', 'glutes'], secondary: ['hamstrings', 'abs', 'lowerBack'],
  },
  back_squat: {
    keys: [squatTop(BACK_ARMS), squatBottom(BACK_ARMS, 34)], tempo: [1.8, 1.3], hold: [0.3, 0.2], ground: true,
    props: [{ kind: 'barbellBack' }], primary: ['quads', 'glutes'], secondary: ['hamstrings', 'lowerBack', 'abs'],
  },
  leg_press: {
    keys: [
      { root: { y: 0.52, z: -0.25, pitch: -40 }, ...sym({ hip: [58, 14, 0], knee: 25, shoulder: [10, 20, 0], elbow: 30 }) },
      { root: { y: 0.52, z: -0.25, pitch: -40 }, ...sym({ hip: [118, 20, 0], knee: 100, shoulder: [10, 20, 0], elbow: 30 }) },
    ], tempo: [1.8, 1.3], hold: [0.2, 0.2],
    props: [{ kind: 'legPress', pos: [0, 0, 0] }], primary: ['quads', 'glutes'], secondary: ['hamstrings'], view: { yaw: 80 },
  },
  hack_squat: {
    keys: [
      { root: { pitch: -18 }, ...sym({ hip: [10, 12, 8], knee: 12, shoulder: [-10, 30, 90], elbow: 125 }) },
      { root: { pitch: -18 }, ...sym({ hip: [100, 16, 8], knee: 112, shoulder: [-10, 30, 90], elbow: 125 }) },
    ], tempo: [1.8, 1.3], ground: true,
    props: [{ kind: 'backPad' }], primary: ['quads'], secondary: ['glutes'], view: { yaw: 75 },
  },
  leg_extension: {
    keys: [seated({ lKnee: 90, rKnee: 90, ...sym({ shoulder: [15, 18, 0], elbow: 20 }) }), seated({ lKnee: 5, rKnee: 5, ...sym({ shoulder: [15, 18, 0], elbow: 20 }) })],
    tempo: [1.2, 1.8], hold: [0.1, 0.5], props: [{ kind: 'legExtension', pos: [0, 0, -0.05] }],
    primary: ['quads'], secondary: [], view: { yaw: 75 },
  },
  leg_curl_lying: {
    keys: [
      { root: { y: 0.76, z: 0.05, pitch: 90 }, ...sym({ hip: [8, 4, 0], knee: 5, shoulder: [160, 25, 0], elbow: 70 }), neck: -30 },
      { root: { y: 0.76, z: 0.05, pitch: 90 }, ...sym({ hip: [8, 4, 0], knee: 115, shoulder: [160, 25, 0], elbow: 70 }), neck: -30 },
    ], tempo: [1.2, 1.8], hold: [0.1, 0.4], props: [{ kind: 'legCurlLying', pos: [0, 0, -0.35] }],
    primary: ['hamstrings'], secondary: ['calves', 'glutes'], view: { yaw: 80, y: 0.7 },
  },
  leg_curl_seated: {
    keys: [
      { root: { y: 0.6 }, ...sym({ hip: [88, 12, 0], knee: 5, shoulder: [15, 18, 0], elbow: 20 }) },
      { root: { y: 0.6 }, ...sym({ hip: [88, 12, 0], knee: 105, shoulder: [15, 18, 0], elbow: 20 }) },
    ], tempo: [1.2, 1.8], hold: [0.1, 0.4], props: [{ kind: 'legCurlSeated', pos: [0, 0, -0.05] }],
    primary: ['hamstrings'], secondary: ['calves'], view: { yaw: 75 },
  },
  split_squat: {
    keys: [lunge(0.15), lunge(1)], tempo: [1.6, 1.2], ground: true,
    props: [], primary: ['quads', 'glutes'], secondary: ['hamstrings', 'calves'], view: { yaw: 70 },
  },
  walking_lunge: {
    keys: [lunge(0.15), lunge(1)], tempo: [1.6, 1.2], ground: true,
    props: [{ kind: 'dumbbells' }], primary: ['quads', 'glutes'], secondary: ['hamstrings', 'calves', 'forearms'], view: { yaw: 70 },
  },
  bulgarian_split_squat: {
    keys: [bulgarian(0.1), bulgarian(1)], tempo: [1.7, 1.2], ground: true,
    props: [{ kind: 'dumbbells' }, { kind: 'benchBehind', pos: [-0.09, 0, -0.95] }],
    primary: ['quads', 'glutes'], secondary: ['hamstrings'], view: { yaw: 70 },
  },
  rdl_db: {
    keys: [armsHangFront(4), hinge(72, 8, 20)], tempo: [1.9, 1.3], hold: [0.3, 0.2], ground: true,
    props: [{ kind: 'dumbbells' }], primary: ['hamstrings', 'glutes'], secondary: ['lowerBack', 'forearms'], view: { yaw: 75 },
  },
  rdl_bb: {
    keys: [armsHangFront(4), hinge(72, 8, 20)], tempo: [1.9, 1.3], hold: [0.3, 0.2], ground: true,
    props: [{ kind: 'barbell' }], primary: ['hamstrings', 'glutes'], secondary: ['lowerBack', 'forearms'], view: { yaw: 75 },
  },
  deadlift: {
    keys: [hinge(52, 42, 72), armsHangFront(4)], tempo: [1.4, 1.8], hold: [0.4, 0.3], ground: true,
    props: [{ kind: 'barbell' }], primary: ['glutes', 'hamstrings', 'lowerBack'], secondary: ['quads', 'upperBack', 'forearms'], view: { yaw: 70 },
  },
  glute_bridge: {
    keys: [
      { root: { y: 0.1, z: 0, pitch: -90 }, ...sym({ hip: [60, 10, 0], knee: 110, shoulder: [10, 20, 0], elbow: 0 }) },
      { root: { y: 0.36, z: 0, pitch: -115 }, ...sym({ hip: [22, 10, 0], knee: 110, shoulder: [10, 20, 0], elbow: 0 }), spine: 25 },
    ], tempo: [1.1, 1.6], hold: [0.1, 0.6], props: [{ kind: 'mat' }], primary: ['glutes'], secondary: ['hamstrings', 'lowerBack'], view: { yaw: 80, y: 0.35 },
  },
  hip_thrust_db: {
    keys: [
      { root: { y: 0.18, z: 0.1, pitch: -45 }, ...sym({ hip: [90, 12, 0], knee: 55, shoulder: [14, 22, 0], elbow: 25 }), spine: -10 },
      { root: { y: 0.5, z: 0.1, pitch: -90 }, ...sym({ hip: [0, 12, 0], knee: 95, shoulder: [14, 22, 0], elbow: 25 }) },
    ], tempo: [1.1, 1.6], hold: [0.1, 0.6], props: [{ kind: 'goblet' }, { kind: 'benchBehind', pos: [0, 0, -0.75] }],
    primary: ['glutes'], secondary: ['hamstrings', 'quads'], view: { yaw: 80, y: 0.4 },
  },
  hip_thrust_bb: {
    keys: [
      { root: { y: 0.18, z: 0.1, pitch: -45 }, ...sym({ hip: [90, 12, 0], knee: 55, shoulder: [14, 30, 0], elbow: 22 }), spine: -10 },
      { root: { y: 0.5, z: 0.1, pitch: -90 }, ...sym({ hip: [0, 12, 0], knee: 95, shoulder: [14, 30, 0], elbow: 22 }) },
    ], tempo: [1.1, 1.6], hold: [0.1, 0.6], props: [{ kind: 'barbell' }, { kind: 'benchBehind', pos: [0, 0, -0.75] }],
    primary: ['glutes'], secondary: ['hamstrings', 'quads'], view: { yaw: 80, y: 0.4 },
  },
  calf_raise: {
    keys: [sym({ shoulder: [0, 8, 0], elbow: 5, hip: [0, 4, 0], ankle: 0 }), sym({ shoulder: [0, 8, 0], elbow: 5, hip: [0, 4, 0], ankle: 38 })],
    tempo: [0.9, 1.4], hold: [0.1, 0.6], ground: true, props: [{ kind: 'dumbbells' }], primary: ['calves'], secondary: [], view: { yaw: 70 },
  },

  // ---------------- صدر ----------------
  bench_bb: {
    keys: [pressTop(14), pressBottom()], tempo: [1.8, 1.2], hold: [0.2, 0.2],
    props: [{ kind: 'barbell' }, { kind: 'bench', pos: [0, 0, -0.3] }], primary: ['chest'], secondary: ['triceps', 'shoulders'], view: { yaw: 60, y: 0.7 },
  },
  bench_db: {
    keys: [pressTop(10), pressBottom()], tempo: [1.8, 1.2], hold: [0.2, 0.2],
    props: [{ kind: 'dumbbells' }, { kind: 'bench', pos: [0, 0, -0.3] }], primary: ['chest'], secondary: ['triceps', 'shoulders'], view: { yaw: 60, y: 0.7 },
  },
  chest_press_machine: {
    keys: [
      seated({ ...sym({ shoulder: [-10, 66, 0], elbow: 88 }) }),
      seated({ ...sym({ shoulder: [88, 18, 0], elbow: 5 }) }),
    ], tempo: [1.2, 1.8], hold: [0.1, 0.3], props: [{ kind: 'seatBack', pos: [0, 0, -0.05] }],
    primary: ['chest'], secondary: ['triceps', 'shoulders'], view: { yaw: 55 },
  },
  incline_db_press: {
    keys: [
      { root: INCLINE_ROOT, ...inclineLegs, ...sym({ shoulder: [100, 14, 0], elbow: 2 }) },
      { root: INCLINE_ROOT, ...inclineLegs, ...sym({ shoulder: [-8, 64, 0], elbow: 90 }) },
    ], tempo: [1.8, 1.2], hold: [0.2, 0.2], props: [{ kind: 'dumbbells' }, { kind: 'inclineBench', pos: [0, 0, -0.05] }],
    primary: ['chest', 'shoulders'], secondary: ['triceps'], view: { yaw: 60 },
  },
  pec_deck: {
    keys: [seated(sym({ shoulder: [0, 88, 90], elbow: 88 })), seated(sym({ shoulder: [80, 30, 90], elbow: 88 }))],
    tempo: [1.8, 1.2], hold: [0.1, 0.5], props: [{ kind: 'pecDeck', pos: [0, 0, -0.05] }], primary: ['chest'], secondary: ['shoulders'], view: { yaw: 35 },
  },
  cable_fly: {
    keys: [
      { ...sym({ shoulder: [10, 85, 0], elbow: 18, hip: [0, 6, 0], spine: 12 }), lHip: [18, 6, 0], lKnee: 18, rHip: [-12, 6, 0], rKnee: 10 },
      { ...sym({ shoulder: [70, 12, 0], elbow: 18, hip: [0, 6, 0], spine: 12 }), lHip: [18, 6, 0], lKnee: 18, rHip: [-12, 6, 0], rKnee: 10 },
    ], tempo: [1.8, 1.2], hold: [0.1, 0.5], ground: true, props: [{ kind: 'cableFly' }], primary: ['chest'], secondary: ['shoulders'], view: { yaw: 35 },
  },
  dips: {
    keys: [
      { root: { y: 1.32, z: 0.1 }, spine: 8, ...sym({ shoulder: [-8, 16, 0], elbow: 4, hip: [10, 4, 0], knee: 70 }) },
      { root: { y: 1.08, z: 0.1 }, spine: 18, ...sym({ shoulder: [-50, 20, 0], elbow: 95, hip: [10, 4, 0], knee: 70 }) },
    ], tempo: [1.6, 1.2], props: [{ kind: 'dipBars' }], primary: ['triceps', 'chest'], secondary: ['shoulders'], view: { yaw: 65, y: 1.0 },
  },

  // ---------------- أكتاف ----------------
  ohp_standing: {
    keys: [withHands(STAND, pressOverheadBottom), withHands(STAND, pressOverheadTop)], tempo: [1.2, 1.8], hold: [0.2, 0.2], ground: true,
    props: [{ kind: 'barbell' }], primary: ['shoulders'], secondary: ['triceps', 'upperBack', 'abs'], view: { yaw: 35, y: 1.1 },
  },
  shoulder_press_db_seated: {
    keys: [seated(pressOverheadBottom), seated(pressOverheadTop)], tempo: [1.2, 1.8], hold: [0.2, 0.2],
    props: [{ kind: 'dumbbells' }, { kind: 'seatBack', pos: [0, 0, -0.05] }], primary: ['shoulders'], secondary: ['triceps'], view: { yaw: 35, y: 1.0 },
  },
  shoulder_press_machine: {
    keys: [seated(pressOverheadBottom), seated(pressOverheadTop)], tempo: [1.2, 1.8], hold: [0.2, 0.2],
    props: [{ kind: 'seatBack', pos: [0, 0, -0.05] }], primary: ['shoulders'], secondary: ['triceps'], view: { yaw: 35, y: 1.0 },
  },
  lateral_raise: {
    keys: [sym({ shoulder: [8, 10, 0], elbow: 15, hip: [0, 5, 0] }), sym({ shoulder: [8, 86, 0], elbow: 15, hip: [0, 5, 0] })],
    tempo: [1.2, 1.8], hold: [0.1, 0.3], ground: true, props: [{ kind: 'dumbbells' }], primary: ['shoulders'], secondary: ['upperBack'], view: { yaw: 15, y: 1.1 },
  },
  lateral_raise_cable: {
    keys: [
      { ...sym({ hip: [0, 5, 0] }), lShoulder: [10, 5, 0], lElbow: 12, rShoulder: [15, -25, 0], rElbow: 12 },
      { ...sym({ hip: [0, 5, 0] }), lShoulder: [10, 5, 0], lElbow: 12, rShoulder: [8, 84, 0], rElbow: 12 },
    ], tempo: [1.2, 1.8], hold: [0.1, 0.3], ground: true, props: [{ kind: 'cableLow', pos: [0.45, 0.15, 0.05] }], primary: ['shoulders'], secondary: [], view: { yaw: 10, y: 1.1 },
  },
  rear_delt_raise: {
    keys: [
      { ...sym({ root: { pitch: 60 }, hip: [70, 6, 0], knee: 20, shoulder: [60, 10, 0], elbow: 12 }), neck: -25 },
      { ...sym({ root: { pitch: 60 }, hip: [70, 6, 0], knee: 20, shoulder: [60, 85, 0], elbow: 12 }), neck: -25 },
    ], tempo: [1.2, 1.8], hold: [0.1, 0.3], ground: true, props: [{ kind: 'dumbbells' }], primary: ['rearDelts', 'shoulders'], secondary: ['upperBack'], view: { yaw: 20 },
  },

  // ---------------- ظهر ----------------
  lat_pulldown: {
    keys: [seated(sym({ shoulder: [170, 30, 0], elbow: 5, spine: -8 })), seated({ ...sym({ shoulder: [15, 55, 90], elbow: 115 }), spine: -12 })],
    tempo: [1.2, 1.8], hold: [0.1, 0.3], props: [{ kind: 'latBar' }, { kind: 'seat', pos: [0, 0, -0.02] }],
    primary: ['lats'], secondary: ['biceps', 'upperBack', 'rearDelts'], view: { yaw: 150, y: 1.2 },
  },
  lat_pulldown_close: {
    keys: [seated(sym({ shoulder: [168, 10, 0], elbow: 5, spine: -8 })), seated({ ...sym({ shoulder: [35, 12, 0], elbow: 110 }), spine: -14 })],
    tempo: [1.2, 1.8], hold: [0.1, 0.3], props: [{ kind: 'latBar' }, { kind: 'seat', pos: [0, 0, -0.02] }],
    primary: ['lats'], secondary: ['biceps', 'upperBack'], view: { yaw: 150, y: 1.2 },
  },
  pullup: {
    keys: [
      { root: { y: 1.05, z: 0 }, ...sym({ shoulder: [172, 26, 0], elbow: 4, hip: [10, 4, 0], knee: 40 }) },
      { root: { y: 1.5, z: 0 }, ...sym({ shoulder: [45, 55, 90], elbow: 120, hip: [10, 4, 0], knee: 40 }), spine: -10 },
    ], tempo: [1.3, 1.8], hold: [0.2, 0.3], props: [{ kind: 'pullupBar' }], primary: ['lats'], secondary: ['biceps', 'upperBack', 'forearms'], view: { yaw: 150, y: 1.4, dist: 3.8 },
  },
  row_cable_seated: {
    keys: [
      { root: { y: 0.2, z: -0.2 }, spine: 18, ...sym({ hip: [85, 10, 0], knee: 30, shoulder: [85, 10, 0], elbow: 4 }) },
      { root: { y: 0.2, z: -0.2 }, spine: 0, chest: -8, ...sym({ hip: [85, 10, 0], knee: 30, shoulder: [-20, 12, 0], elbow: 100 }) },
    ], tempo: [1.2, 1.8], hold: [0.1, 0.4], props: [{ kind: 'cableLow', pos: [0, 0.3, 1.05] }, { kind: 'mat', pos: [0, 0, 0.2] }],
    primary: ['upperBack', 'lats'], secondary: ['biceps', 'rearDelts'], view: { yaw: 75, y: 0.6 },
  },
  row_db_one_arm: {
    keys: [
      { root: { pitch: 80, y: 0.72 }, lHip: [80, 6, 0], lKnee: 90, rHip: [70, 8, 0], rKnee: 18, lShoulder: [80, 8, 0], lElbow: 2, rShoulder: [80, 6, 0], rElbow: 2, neck: -35 },
      { root: { pitch: 80, y: 0.72 }, lHip: [80, 6, 0], lKnee: 90, rHip: [70, 8, 0], rKnee: 18, lShoulder: [80, 8, 0], lElbow: 2, rShoulder: [8, 10, 0], rElbow: 95, neck: -35 },
    ], tempo: [1.2, 1.8], hold: [0.1, 0.4], props: [{ kind: 'dumbbellR' }, { kind: 'benchSideRow', pos: [0.12, 0, 0.25] }],
    primary: ['lats', 'upperBack'], secondary: ['biceps', 'rearDelts'], view: { yaw: -60, y: 0.8 },
  },
  row_bb: {
    keys: [
      { ...sym({ root: { pitch: 55 }, hip: [65, 6, 0], knee: 22, shoulder: [55, 16, 0], elbow: 3 }), neck: -25 },
      { ...sym({ root: { pitch: 55 }, hip: [65, 6, 0], knee: 22, shoulder: [-12, 28, 0], elbow: 95 }), neck: -25 },
    ], tempo: [1.2, 1.8], hold: [0.1, 0.3], ground: true, props: [{ kind: 'barbell' }],
    primary: ['upperBack', 'lats'], secondary: ['biceps', 'lowerBack', 'rearDelts'], view: { yaw: 70 },
  },

  // ---------------- ذراعين ----------------
  curl_db: {
    keys: [sym({ shoulder: [2, 8, 0], elbow: 5, hip: [0, 5, 0] }), sym({ shoulder: [12, 8, 0], elbow: 138, hip: [0, 5, 0] })],
    tempo: [1.1, 1.8], hold: [0.1, 0.3], ground: true, props: [{ kind: 'dumbbells' }], primary: ['biceps'], secondary: ['forearms'], view: { yaw: 45, y: 1.1 },
  },
  curl_hammer: {
    keys: [sym({ shoulder: [2, 8, 0], elbow: 5, hip: [0, 5, 0] }), sym({ shoulder: [12, 8, 0], elbow: 135, hip: [0, 5, 0] })],
    tempo: [1.1, 1.8], hold: [0.1, 0.3], ground: true, props: [{ kind: 'hammerDumbbells' }], primary: ['biceps', 'forearms'], secondary: [], view: { yaw: 45, y: 1.1 },
  },
  upright_row: {
    keys: [sym({ shoulder: [6, 12, 0], elbow: 6, hip: [0, 5, 0] }), sym({ shoulder: [22, 80, -25], elbow: 118, hip: [0, 5, 0] })],
    tempo: [1.1, 1.8], hold: [0.1, 0.4], ground: true, props: [{ kind: 'barbell' }], primary: ['upperBack', 'shoulders'], secondary: ['biceps', 'forearms'], view: { yaw: 30, y: 1.15 },
  },
  curl_bb: {
    keys: [sym({ shoulder: [4, 14, 0], elbow: 5, hip: [0, 5, 0] }), sym({ shoulder: [14, 14, 0], elbow: 135, hip: [0, 5, 0] })],
    tempo: [1.1, 1.8], hold: [0.1, 0.3], ground: true, props: [{ kind: 'barbell' }], primary: ['biceps'], secondary: ['forearms'], view: { yaw: 45, y: 1.1 },
  },
  triceps_pushdown: {
    keys: [
      { ...sym({ spine: 12, shoulder: [-2, 10, 0], elbow: 100, hip: [8, 5, 0], knee: 8 }) },
      { ...sym({ spine: 12, shoulder: [-2, 10, 0], elbow: 5, hip: [8, 5, 0], knee: 8 }) },
    ], tempo: [1.1, 1.8], hold: [0.1, 0.4], ground: true, props: [{ kind: 'cableHigh', pos: [0, 2.1, 0.42] }],
    primary: ['triceps'], secondary: ['forearms'], view: { yaw: 70, y: 1.1 },
  },
  triceps_overhead_db: {
    keys: [
      sym({ shoulder: [170, 12, 0], elbow: 140, hip: [0, 5, 0] }),
      sym({ shoulder: [170, 12, 0], elbow: 8, hip: [0, 5, 0] }),
    ], tempo: [1.2, 1.8], hold: [0.1, 0.3], ground: true, props: [{ kind: 'goblet' }], primary: ['triceps'], secondary: [], view: { yaw: 70, y: 1.2 },
  },

  // ---------------- بطن ----------------
  plank: {
    keys: [
      { root: { y: 0.34, pitch: 80 }, ...sym({ hip: [0, 6, 0], knee: 0, shoulder: [80, 10, 0], elbow: 90, ankle: -20 }), neck: -20 },
      { root: { y: 0.35, pitch: 79 }, ...sym({ hip: [0, 6, 0], knee: 0, shoulder: [81, 10, 0], elbow: 90, ankle: -20 }), neck: -20 },
    ], tempo: [1.6, 1.6], props: [{ kind: 'mat' }], primary: ['abs'], secondary: ['shoulders', 'glutes', 'lowerBack'], view: { yaw: 80, y: 0.35 },
  },
  hanging_knee_raise: {
    keys: [
      { root: { y: 1.12 }, ...sym({ shoulder: [172, 26, 0], elbow: 4, hip: [4, 4, 0], knee: 10 }) },
      { root: { y: 1.12 }, ...sym({ shoulder: [172, 26, 0], elbow: 4, hip: [100, 8, 0], knee: 95 }), spine: 10 },
    ], tempo: [1.2, 1.6], hold: [0.1, 0.3], props: [{ kind: 'pullupBar' }], primary: ['abs'], secondary: ['forearms', 'lats'], view: { yaw: 70, y: 1.4, dist: 3.8 },
  },
  ab_wheel: {
    keys: [
      { root: { y: 0.52, z: -0.35, pitch: 30 }, ...sym({ hip: [30, 8, 0], knee: 90, shoulder: [72, 10, 0], elbow: 2 }), spine: 38, neck: -25 },
      { root: { y: 0.4, z: -0.3, pitch: 58 }, ...sym({ hip: [26, 8, 0], knee: 58, shoulder: [112, 10, 0], elbow: 2 }), spine: 10, neck: -15 },
    ], tempo: [1.8, 1.5], hold: [0.2, 0.2], props: [{ kind: 'abWheel' }, { kind: 'mat' }], primary: ['abs'], secondary: ['lats', 'shoulders'], view: { yaw: 80, y: 0.35 },
  },
};

export const DEFAULT_MOTION = 'goblet_squat';

/** مدة دورة كاملة (ثوانٍ) */
export function motionDuration(m: Motion): number {
  return m.keys.reduce((s, _, i) => s + (m.tempo[i] ?? 1) + (m.hold?.[i] ?? 0), 0);
}

const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

/** الوضعية عند الزمن t (تدور الحركة: 0 → 1 → … → 0 مع ثبات اختياري عند كل وضعية) */
export function sampleMotion(m: Motion, t: number): Pose {
  const n = m.keys.length;
  if (n === 1) return m.keys[0];
  let x = t % motionDuration(m);
  for (let i = 0; i < n; i++) {
    const hold = m.hold?.[i] ?? 0;
    if (x < hold) return m.keys[i];
    x -= hold;
    const dur = m.tempo[i] ?? 1;
    if (x < dur) return lerpPose(m.keys[i], m.keys[(i + 1) % n], ease(x / dur));
    x -= dur;
  }
  return m.keys[0];
}
