// مكتبة الحركات: لكل تمرين وضعيات مفتاحية + أدوات + العضلات + زاوية الكاميرا
import { lerpPose, poseQuats, slerpQuats, sym, type FloorFn, type Muscle, type Pose, type PoseOpts, type PropSpec } from './rig';

export interface Motion {
  keys: Pose[];            // تدور الحركة: 0 → 1 → … → 0
  tempo: number[];         // ثواني كل انتقال (بنفس طول keys)
  hold?: number[];         // ثبات عند كل وضعية
  ground?: boolean;        // حساب الارتفاع تلقائياً لتلامس القدمان الأرض
  props: PropSpec[];
  primary: Muscle[];
  secondary: Muscle[];
  view?: { yaw?: number; pitch?: number; dist?: number; y?: number };
  /** حركة سريعة متصلة: انتقال خطي بدون توقف عند كل وضعية (متسلق الجبل مثلاً) */
  flow?: boolean;
  /**
   * القدم الثابتة بمكانها. الوقوف (ground): الافتراضي القدمين، none = القدمين تتحركان عمداً.
   * بدون ground: القدم تثبت بمكانها كامل (مع الارتفاع) — للقدمين على جهاز والجسم يدور (تمديد الظهر مثلاً)
   */
  plant?: 'both' | 'L' | 'R' | 'none';
  /**
   * وش يرتكز عليه الجسم (تنحسب بـ fit.ts لكل نموذج): bench = متمدد على بنش، seat = جالس على مقعد،
   * back = الظهر على المسند، floor = القدمين على الأرض (نعدّل ثني الركبة)، ground = الجسم على الأرض/المات (أوطى نقطة تلمسه)
   */
  rest?: ('bench' | 'seat' | 'back' | 'floor' | 'ground' | 'palms')[];
  /**
   * للتمارين الأرضية (rest: ground): جزأين لازم يلمسون الأرض مع بعض (مثل الكفين وأصابع القدم بالضغط).
   * نميل الجسم كامل شوي (حول الحوض) لين يلمس الاثنين — لأن طول الذراع والرجل يختلف بين النموذجين
   */
  contacts?: ('hands' | 'feet' | 'knees' | 'forearms')[];
  /** جزء يلمس شي فوق الأرض بارتفاع معيّن (مثل الكفين على مقبض عجلة البطن) */
  contactLift?: Partial<Record<'hands' | 'feet' | 'knees' | 'forearms', number>>;
  /**
   * false = القدم تتبع الساق (زاوية الكاحل نسبة للساق: 0 عمودية، موجب مشدودة) بدل ما تبقى مسطحة على الأرض —
   * للأرجل المعلقة أو الممدودة أو الجثو. 'L'/'R' = هذي القدم بس على الأرض والثانية بالهوا/على بنش
   */
  flatFeet?: boolean | 'L' | 'R';
  /** قفلة الأصابع: 1 = قبضة على مقبض رفيع (الافتراضي 0.85)، أقل = كف مفتوح أكثر (مسكة رأس دمبل كبير، كف على الأرض) */
  grip?: number;
  /**
   * الكفين ثابتة بمكانها طول الحركة (على حافة بنش أو بارات المتوازي): الملاءمة تعدّل ثني الكتف والكوع لكل نموذج
   * عشان القبضة تبقى بنفس مكانها بأول وضعية والجسم يتحرك. 'pelvis' = ثابتة بالنسبة للحوض (ماسكة دمبل عليه)
   */
  handsFixed?: boolean | 'pelvis';
  /** بار صلب بين اليدين: الملاءمة تحافظ على المسافة بين القبضتين طول الحركة (بثني الكوعين) */
  rigidGrip?: boolean;
}

// ---------------------------------------------------------------------------
// وضعيات أساسية
// ---------------------------------------------------------------------------
const STAND = sym({ shoulder: [0, 6, 0], elbow: 8, hip: [0, 4, 0] });
const withHands = (p: Pose, h: Pose): Pose => ({ ...p, lShoulder: h.lShoulder, rShoulder: h.rShoulder, lElbow: h.lElbow, rElbow: h.rElbow, lRoll: h.lRoll, rRoll: h.rRoll });

// ---------------------------------------------------------------------------
// الحركات
// ---------------------------------------------------------------------------
const squatTop = (arms: Pose) => withHands(sym({ hip: [0, 10, 12], knee: 0 }), arms);
const squatBottom = (arms: Pose, lean = 30) => withHands(sym({ spine: lean, hip: [108, 18, 12], knee: 118, neck: -lean * 0.6 }), arms);
// مسكة الجوبلت: الكفين مع بعض قدام أعلى الصدر ماسكة رأس الدمبل، والكوعين لتحت قريبة من الجسم
const GOBLET_HOLD = sym({ shoulder: [4, 10, -28], elbow: 137, roll: -30 });
// ضغط البار واقف: يبدأ عند مستوى الذقن قدام الرقبة (قبضة من فوق) وينتهي فوق الرأس والذراعين ممدودة
const OHP_BB_BOTTOM = sym({ shoulder: [15, 7, 22], elbow: 150, roll: -68 });
const OHP_BB_TOP = sym({ shoulder: [180, -6, -22], elbow: 4, roll: -68 });
const BACK_ARMS = sym({ shoulder: [-22, 78, 90], elbow: 142 });

const hinge = (pitch: number, thigh: number, knee: number, armFlexExtra = 0): Pose => ({
  ...sym({ root: { pitch }, hip: [pitch + thigh, 5, 0], knee, shoulder: [pitch + armFlexExtra, 5, 0], elbow: 3, neck: -pitch * 0.45 }),
});

const lunge = (depth: number): Pose => ({
  lHip: [25 + 65 * depth, 6, 0], lKnee: 10 + 85 * depth,
  rHip: [-25 + 10 * depth, 6, 0], rKnee: 15 + 80 * depth, rAnkle: 35 + 25 * depth,
  lShoulder: [4, 4, 0], rShoulder: [4, 4, 0], lElbow: 4, rElbow: 4,
});

// القدم الخلفية: ظهرها (الرباط) على البنش والكاحل مشدود — ثني الركبة الخلفية ينحسب بـ fit عشان تبقى القدم على سطح البنش
const bulgarian = (depth: number): Pose => ({
  lHip: [30 + 60 * depth, 6, 0], lKnee: 10 + 80 * depth,
  rHip: [-40 + 5 * depth, 4, 0], rKnee: 70 + 25 * depth, rAnkle: 50 - 3 * depth,
  // الذراعين مبعدة شوي عن الفخذين عشان الدمبل ما يحتك فيها
  lShoulder: [4, 10, 0], rShoulder: [4, 10, 0], lElbow: 4, rElbow: 4,
});

// الاستلقاء على البنش: الحوض فوق البنش، الرأس باتجاه −Z
const SUPINE_ROOT = { y: 0.56, z: 0.1, pitch: -90 };
const supineLegs = { lHip: [-8, 31, 0] as [number, number, number], rHip: [-8, 31, 0] as [number, number, number], lKnee: 106, rKnee: 106 };
// ضغط على بنش مستوي: الكفين باتجاه الرجلين طول الحركة (لفّ الساعد ثابت)، أسفل: الساعد عمودي والكوع عند مستوى البنش
const supine = (p: Pose): Pose => ({ root: SUPINE_ROOT, ...supineLegs, ...p });
const pressBottom = (): Pose => supine(sym({ shoulder: [-17, 61, 0], elbow: 107, roll: -29 }));

const INCLINE_ROOT = { y: 0.52, z: 0.08, pitch: -52 };
// بنش مائل للأسفل: الرأس أوطى من الحوض والرجلين مثبتة عند المسند
const DECLINE_ROOT = { y: 0.84, z: 0.05, pitch: -108 };
const declineLegs = { lHip: [22, 14, 0] as [number, number, number], rHip: [22, 14, 0] as [number, number, number], lKnee: 95, rKnee: 95 };
const inclineLegs = { lHip: [41, 14, 0] as [number, number, number], rHip: [41, 14, 0] as [number, number, number], lKnee: 90, rKnee: 90 };

// الجلوس على كرسي
const SEATED_ROOT = { y: 0.58, z: 0 };
const seatedLegs = { lHip: [88, 14, 0] as [number, number, number], rHip: [88, 14, 0] as [number, number, number], lKnee: 88, rKnee: 88 };
const seated = (p: Pose): Pose => ({ root: SEATED_ROOT, ...seatedLegs, ...p, lHip: p.lHip ?? seatedLegs.lHip, rHip: p.rHip ?? seatedLegs.rHip, lKnee: p.lKnee ?? 88, rKnee: p.rKnee ?? 88 });

// ضغط فوق الرأس بالدمبل/المكينة: أسفل العضد للجنب (مستوى لوح الكتف) والساعد عمودي، أعلى الذراع عمودية — الكف للأمام طول الحركة
const pressOverheadBottom = sym({ shoulder: [17, 87, 89], elbow: 93, roll: -17 });
const pressOverheadTop = sym({ shoulder: [177, 5, -73], elbow: 2, roll: -17 });


// ---------------------------------------------------------------------------
// حركات إضافية (مكتبة موسّعة)
// ---------------------------------------------------------------------------
const FRONT_ARMS = sym({ shoulder: [88, 28, 0], elbow: 150 });
const ARMS_DOWN = sym({ shoulder: [4, 8, 0], elbow: 6 });
const ARMS_FWD = sym({ shoulder: [88, 10, 0], elbow: 6 });
const HANDS_HEAD = sym({ shoulder: [150, 55, 0], elbow: 140 });
const sumoTop = (arms: Pose) => withHands(sym({ hip: [0, 17, 28], knee: 0 }), arms);
const PRONE = (y: number, pitch: number): Pose['root'] => ({ y, pitch });
// الاستلقاء على الأرض (ظهر)
const FLOOR_SUPINE = { y: 0.11, z: 0, pitch: -90 };
// الجثو على الركب
const kneel = (spine: number, chest: number, arms: Pose): Pose => ({ root: { y: 0.5 }, spine, chest, ...sym({ hip: [0, 8, 0], knee: 92, ankle: -30 }), ...arms });

// الجثو والانبطاح (مع flatFeet: false): ظهر القدم على المات والكاحل مشدود لين القدم تقريباً على امتداد الساق
const KNEEL_ANKLE = 72;
// بلانك متسلق الجبل (flatFeet: false): على أطراف الأصابع والكاحل مثني ٢٩° للأعلى
const MC_PLANK: Pose = { root: { y: 0.5, z: 0.04, pitch: 68 }, neck: -18, ...sym({ shoulder: [64, 10, 0], elbow: 2, roll: -80, wext: 92, hip: [0, 6, 0], knee: 0, ankle: -29 }) };

export const MOTIONS: Record<string, Motion> = {
  // ---------------- أرجل ----------------
  goblet_squat: {
    keys: [
      { root: { z: 0 }, ...sym({ hip: [0, 10, 12], knee: 0, hipOut: 20 }), ...GOBLET_HOLD },
      { root: { z: -0.15 }, spine: 21, neck: -11, ...sym({ hip: [90, 23, 12], knee: 126, hipOut: 32 }), ...GOBLET_HOLD },
    ], tempo: [1.7, 1.2], hold: [0.3, 0.2], ground: true,
    props: [{ kind: 'goblet' }], primary: ['quads', 'glutes'], secondary: ['hamstrings', 'abs', 'lowerBack'],
  },
  back_squat: {
    keys: [
      { root: { z: 0 }, ...sym({ shoulder: [-22, 78, 90], elbow: 142, hip: [0, 10, 12], knee: 0, hipOut: 20 }) },
      { root: { z: -0.2 }, spine: 25, neck: -20, ...sym({ shoulder: [-22, 78, 90], elbow: 142, hip: [92, 19, 12], knee: 121, hipOut: 32 }) },
    ], tempo: [1.8, 1.3], hold: [0.3, 0.2], ground: true,
    props: [{ kind: 'barbellBack' }], primary: ['quads', 'glutes'], secondary: ['hamstrings', 'lowerBack', 'abs'],
  },
  leg_press: {
    keys: [
      // القدمين على لوح مائل ٤٥° (باطن القدم باتجاه القضبان)، والجسم على المقعد والمسند
      // الظهر مائل ٥٢° والرجلين تدفع باتجاه ٤٥° (على خط المزلقة): فوق الرجلين شبه ممدودة، تحت الركبة ٩٠° والفخذ قريب من الصدر.
      // القدمين مسطحة على اللوح (عمودي على خط الدفع) طول الحركة
      { root: { y: 0.52, z: -0.25, pitch: -52 }, ...sym({ hip: [85, 3, 0], knee: 10, ankle: -130, shoulder: [10, 20, 0], elbow: 30 }) },
      { root: { y: 0.52, z: -0.25, pitch: -52 }, ...sym({ hip: [125, 3, 0], knee: 88, ankle: -130, shoulder: [10, 20, 0], elbow: 30 }) },
    ], tempo: [1.8, 1.3], hold: [0.2, 0.2],
    props: [{ kind: 'legPress', pos: [0, 0, 0] }], rest: ['seat', 'back'], primary: ['quads', 'glutes'], secondary: ['hamstrings'], view: { yaw: 80 },
  },
  hack_squat: {
    keys: [
      { root: { pitch: -18 }, ...sym({ shoulder: [-10, 30, 90], elbow: 125, hip: [10, 12, 8], knee: 12 }) },
      // الحوض ينزل على خط المسند المائل ١٨° (زي مزلقة الجهاز)، والقدمين ثابتة
      { root: { pitch: -18 }, ...sym({ shoulder: [-10, 30, 90], elbow: 125, hip: [77, 30, 10], knee: 132, hipOut: 6 }) },
    ], tempo: [1.8, 1.3], ground: true,
    props: [{ kind: 'backPad' }], primary: ['quads'], secondary: ['glutes'], view: { yaw: 75 },
  },
  leg_extension: {
    keys: [seated({ lKnee: 90, rKnee: 90, ...sym({ shoulder: [15, 18, 0], elbow: 20 }) }), seated({ lKnee: 5, rKnee: 5, ...sym({ shoulder: [15, 18, 0], elbow: 20 }) })],
    tempo: [1.2, 1.8], hold: [0.1, 0.5], props: [{ kind: 'legExtension', pos: [0, 0, -0.05] }], rest: ['seat', 'back'], flatFeet: false,
    primary: ['quads'], secondary: [], view: { yaw: 75 },
  },
  leg_curl_lying: {
    keys: [
      { root: { y: 0.76, z: 0.05, pitch: 90 }, ...sym({ hip: [8, 4, 0], knee: 5, shoulder: [160, 25, 0], elbow: 70 }), neck: -30 },
      { root: { y: 0.76, z: 0.05, pitch: 90 }, ...sym({ hip: [8, 4, 0], knee: 115, shoulder: [160, 25, 0], elbow: 70 }), neck: -30 },
    ], tempo: [1.2, 1.8], hold: [0.1, 0.4], props: [{ kind: 'legCurlLying', pos: [0, 0, -0.35] }], rest: ['bench'], flatFeet: false,
    primary: ['hamstrings'], secondary: ['calves', 'glutes'], view: { yaw: 80, y: 0.7 },
  },
  leg_curl_seated: {
    keys: [
      { root: { y: 0.6 }, ...sym({ hip: [88, 12, 0], knee: 5, shoulder: [15, 18, 0], elbow: 20 }) },
      { root: { y: 0.6 }, ...sym({ hip: [88, 12, 0], knee: 105, shoulder: [15, 18, 0], elbow: 20 }) },
    ], tempo: [1.2, 1.8], hold: [0.1, 0.4], props: [{ kind: 'legCurlSeated', pos: [0, 0, -0.05] }], rest: ['seat', 'back'], flatFeet: false,
    primary: ['hamstrings'], secondary: ['calves'], view: { yaw: 75 },
  },
  split_squat: {
    keys: [
      { ...sym({ shoulder: [4, 4, 0], elbow: 4 }), lHip: [35, 6, 0], rHip: [-24, 6, 0], lKnee: 23, rKnee: 27, rAnkle: 39 },
      { root: { z: 0.03 }, ...sym({ shoulder: [4, 4, 0], elbow: 4 }), lHip: [89, 6, 0], rHip: [-7, 6, 0], lKnee: 105, rKnee: 97, rAnkle: 64 },
    ], tempo: [1.6, 1.2], ground: true, plant: 'L',
    props: [], primary: ['quads', 'glutes'], secondary: ['hamstrings', 'calves'], view: { yaw: 70 },
  },
  walking_lunge: {
    keys: [
      { ...sym({ shoulder: [4, 12, 0], elbow: 4 }), lHip: [35, 6, 0], rHip: [-24, 6, 0], lKnee: 23, rKnee: 27, rAnkle: 39 },
      { root: { z: 0.03 }, ...sym({ shoulder: [4, 12, 0], elbow: 4 }), lHip: [89, 6, 0], rHip: [-7, 6, 0], lKnee: 105, rKnee: 97, rAnkle: 64 },
    ], tempo: [1.6, 1.2], ground: true, plant: 'L',
    props: [{ kind: 'dumbbells' }], primary: ['quads', 'glutes'], secondary: ['hamstrings', 'calves', 'forearms'], view: { yaw: 70 },
  },
  bulgarian_split_squat: {
    keys: [bulgarian(0.1), bulgarian(1)], tempo: [1.7, 1.2], ground: true, plant: 'L', flatFeet: 'L', rest: ['floor'],
    props: [{ kind: 'dumbbells' }, { kind: 'benchRear', pos: [-0.09, 0, -1.295] }],
    primary: ['quads', 'glutes'], secondary: ['hamstrings'], view: { yaw: 70 },
  },
  rdl_db: {
    keys: [
      // قبضة من فوق (الكفين للخلف) والدمبل قدام الفخذين طول الحركة
      { ...sym({ shoulder: [17, 9, 0], elbow: 4, hip: [0, 5, 0], roll: -90 }) },
      { root: { z: 0.05, pitch: 72 }, neck: -32, ...sym({ shoulder: [74, 6, 0], elbow: 3, hip: [80, 4, 2], knee: 20, hipOut: 4, roll: -90 }) },
    ], tempo: [1.9, 1.3], hold: [0.3, 0.2], ground: true,
    props: [{ kind: 'dumbbells' }], primary: ['hamstrings', 'glutes'], secondary: ['lowerBack', 'forearms'], view: { yaw: 75 },
  },
  rdl_bb: {
    keys: [
      { ...sym({ shoulder: [4, 4, 0], elbow: 4, hip: [0, 5, 0] }) },
      { root: { z: 0.05, pitch: 72 }, neck: -32, ...sym({ shoulder: [72, 5, 0], elbow: 3, hip: [80, 4, 2], knee: 20, hipOut: 4 }) },
    ], tempo: [1.9, 1.3], hold: [0.3, 0.2], ground: true,
    props: [{ kind: 'barbell' }], primary: ['hamstrings', 'glutes'], secondary: ['lowerBack', 'forearms'], view: { yaw: 75 },
  },
  deadlift: {
    keys: [
      { root: { z: -0.26, pitch: 60 }, neck: -23, ...sym({ shoulder: [53, 5, 0], elbow: 3, hip: [133, 1, -3], knee: 90, hipOut: 4 }) },
      { ...sym({ shoulder: [4, 4, 0], elbow: 4, hip: [0, 5, 0] }) },
    ], tempo: [1.4, 1.8], hold: [0.4, 0.3], ground: true,
    props: [{ kind: 'barbell' }], primary: ['glutes', 'hamstrings', 'lowerBack'], secondary: ['quads', 'upperBack', 'forearms'], view: { yaw: 70 },
  },
  glute_bridge: {
    keys: [
      // الذراعين على الأرض جنب الجسم (الكفين للأسفل)، وفوق: الرأس وأعلى الظهر على المات والذقن للداخل
      { root: { y: 0.1, z: 0, pitch: -90 }, neck: -8, ...sym({ shoulder: [-3, 20, 0], elbow: 0, roll: -90, hip: [60, 10, 0], knee: 110 }) },
      { root: { y: 0.32, z: -0.06, pitch: -116 }, spine: -2, neck: 22, ...sym({ shoulder: [-27, 20, 0], elbow: 0, roll: -90, hip: [-2, 10, 0], knee: 108 }) },
    ], tempo: [1.1, 1.6], hold: [0.1, 0.6], props: [{ kind: 'mat' }], rest: ['ground', 'floor', 'palms'], grip: 0.3, primary: ['glutes'], secondary: ['hamstrings', 'lowerBack'], view: { yaw: 80, y: 0.35 },
  },
  hip_thrust_db: {
    // أعلى الظهر (لوحي الكتف) على حافة البنش الطويلة والقدمين ثابتة على الأرض: تحت الحوض نازل والجذع مائل ٤٥°،
    // فوق الجذع أفقي على البنش والفخذين على امتداده والساقين عمودية (الركبة ٩٠°). الدمبل على مفصل الحوض
    keys: [
      { root: { y: 0.27, z: 0.05, pitch: -45 }, ...sym({ shoulder: [-6, 31, -37], elbow: 109, roll: -40, hip: [74, 8, 0], knee: 94 }) },
      { root: { y: 0.52, z: 0.175, pitch: -90 }, neck: 8, ...sym({ shoulder: [45, 23, -108], elbow: 52, roll: 45, hip: [0, 8, 0], knee: 90 }) },
    ], tempo: [1.1, 1.6], hold: [0.1, 0.6], props: [{ kind: 'dumbbellHips' }, { kind: 'benchBehind', pos: [0, 0, -0.325] }], rest: ['bench', 'floor'], plant: 'both', grip: 0.55, handsFixed: 'pelvis',
    primary: ['glutes'], secondary: ['hamstrings', 'quads'], view: { yaw: 80, y: 0.4 },
  },
  hip_thrust_bb: {
    keys: [
      // البار على مفصل الحوض والكفين عليه برا الحوض (قبضة من فوق)
      { root: { y: 0.27, z: 0.05, pitch: -45 }, ...sym({ shoulder: [-10, 67, -49], elbow: 103, roll: -23, hip: [74, 8, 0], knee: 94 }) },
      { root: { y: 0.52, z: 0.175, pitch: -90 }, neck: 8, ...sym({ shoulder: [50, 42, -129], elbow: 65, roll: 59, hip: [0, 8, 0], knee: 90 }) },
    ], tempo: [1.1, 1.6], hold: [0.1, 0.6], props: [{ kind: 'barbell' }, { kind: 'benchBehind', pos: [0, 0, -0.325] }], rest: ['bench', 'floor'], plant: 'both',
    primary: ['glutes'], secondary: ['hamstrings', 'quads'], view: { yaw: 80, y: 0.4 },
  },
  calf_raise: {
    keys: [sym({ shoulder: [0, 8, 0], elbow: 5, hip: [0, 4, 0], ankle: 0 }), sym({ shoulder: [0, 8, 0], elbow: 5, hip: [0, 4, 0], ankle: 38 })],
    tempo: [0.9, 1.4], hold: [0.1, 0.6], ground: true, props: [{ kind: 'dumbbells' }], primary: ['calves'], secondary: [], view: { yaw: 70 },
  },

  // ---------------- صدر ----------------
  bench_bb: {
    // البار: نفس عرض القبضة فوق وتحت (الذراعين مايلة للخارج فوق)
    keys: [supine(sym({ shoulder: [66, 83, 22], elbow: 16, roll: -29 })), pressBottom()], tempo: [1.8, 1.2], hold: [0.2, 0.2],
    props: [{ kind: 'barbell' }, { kind: 'benchPress', pos: [0, 0, -0.3] }], rest: ['bench', 'floor'],
    primary: ['chest'], secondary: ['triceps', 'shoulders'], view: { yaw: 60, y: 0.7 },
  },
  bench_db: {
    keys: [supine(sym({ shoulder: [91, 16, -45], elbow: 1, roll: -29 })), pressBottom()], tempo: [1.8, 1.2], hold: [0.2, 0.2],
    props: [{ kind: 'dumbbells' }, { kind: 'bench', pos: [0, 0, -0.3] }], rest: ['bench', 'floor'],
    primary: ['chest'], secondary: ['triceps', 'shoulders'], view: { yaw: 60, y: 0.7 },
  },
  chest_press_machine: {
    keys: [
      // مقابض عمودية (الكفين متقابلين)
      seated(sym({ shoulder: [-27, 67, 0], elbow: 117, roll: 67 })),
      seated(sym({ shoulder: [83, 67, 0], elbow: 8, roll: 67 })),
    ], tempo: [1.2, 1.8], hold: [0.1, 0.3], props: [{ kind: 'chestPress', pos: [0, 0, -0.05] }], rest: ['seat', 'back', 'floor'],
    primary: ['chest'], secondary: ['triceps', 'shoulders'], view: { yaw: 55 },
  },
  incline_db_press: {
    // أعلى: الذراعين عمودية بالعالم فوق أعلى الصدر. أسفل: الكوع تحت مستوى الصدر والساعد عمودي (الدمبل جنب أعلى الصدر)
    keys: [
      { root: INCLINE_ROOT, ...inclineLegs, ...sym({ shoulder: [128, 6, -72], elbow: 2, roll: -13 }) },
      { root: INCLINE_ROOT, ...inclineLegs, ...sym({ shoulder: [-17, 61, 38], elbow: 121, roll: -13 }) },
    ], tempo: [1.8, 1.2], hold: [0.2, 0.2], props: [{ kind: 'dumbbells' }, { kind: 'inclineBench', pos: [0, 0, -0.05] }],
    rest: ['seat', 'back', 'floor'],
    primary: ['chest', 'shoulders'], secondary: ['triceps'], view: { yaw: 60 },
  },
  pec_deck: {
    keys: [seated(sym({ shoulder: [0, 88, 90], elbow: 88 })), seated(sym({ shoulder: [80, 30, 90], elbow: 88 }))],
    tempo: [1.8, 1.2], hold: [0.1, 0.5], props: [{ kind: 'pecDeck', pos: [0, 0, -0.05] }], rest: ['seat', 'back', 'floor'], primary: ['chest'], secondary: ['shoulders'], view: { yaw: 35 },
  },
  cable_fly: {
    keys: [
      { ...sym({ shoulder: [10, 85, 0], elbow: 18, hip: [0, 6, 0], spine: 12 }), lHip: [18, 6, 0], lKnee: 18, rHip: [-12, 6, 0], rKnee: 10 },
      { ...sym({ shoulder: [70, 12, 0], elbow: 18, hip: [0, 6, 0], spine: 12 }), lHip: [18, 6, 0], lKnee: 18, rHip: [-12, 6, 0], rKnee: 10 },
    ], tempo: [1.8, 1.2], hold: [0.1, 0.5], ground: true, props: [{ kind: 'cableFly' }], primary: ['chest'], secondary: ['shoulders'], view: { yaw: 35 },
  },
  dips: {
    keys: [
      { root: { y: 1.32, z: 0.1 }, spine: 8, ...sym({ shoulder: [-8, 16, 0], elbow: 4, hip: [10, 4, 0], knee: 70, ankle: 25 }) },
      { root: { y: 1.08, z: 0.1 }, spine: 18, ...sym({ shoulder: [-50, 20, 0], elbow: 95, hip: [10, 4, 0], knee: 70, ankle: 25 }) },
    ], tempo: [1.6, 1.2], flatFeet: false, handsFixed: true, props: [{ kind: 'dipBars' }], primary: ['triceps', 'chest'], secondary: ['shoulders'], view: { yaw: 65, y: 1.0 },
  },

  // ---------------- أكتاف ----------------
  ohp_standing: {
    keys: [withHands(STAND, OHP_BB_BOTTOM), withHands(STAND, OHP_BB_TOP)], tempo: [1.2, 1.8], hold: [0.2, 0.2], ground: true,
    props: [{ kind: 'barbell' }], primary: ['shoulders'], secondary: ['triceps', 'upperBack', 'abs'], view: { yaw: 35, y: 1.1 },
  },
  shoulder_press_db_seated: {
    keys: [seated(pressOverheadBottom), seated(pressOverheadTop)], tempo: [1.2, 1.8], hold: [0.2, 0.2],
    props: [{ kind: 'dumbbells' }, { kind: 'seatBack', pos: [0, 0, -0.05] }], rest: ['seat', 'back', 'floor'], primary: ['shoulders'], secondary: ['triceps'], view: { yaw: 35, y: 1.0 },
  },
  shoulder_press_machine: {
    keys: [seated(pressOverheadBottom), seated(pressOverheadTop)], tempo: [1.2, 1.8], hold: [0.2, 0.2],
    props: [{ kind: 'shoulderPress', pos: [0, 0, -0.05] }], rest: ['seat', 'back', 'floor'], primary: ['shoulders'], secondary: ['triceps'], view: { yaw: 35, y: 1.0 },
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
    keys: [
      // فوق: الذراعين ممدودة والبار فوق وقدام الوجه شوي (ينزل قدام الوجه مو ورا الرأس)
      { root: { y: 0.58, z: 0 }, spine: -10, ...sym({ shoulder: [22, 155, 90], elbow: 10, roll: 0, hip: [88, 14, 0], knee: 88 }) },
      // تحت: البار على أعلى الصدر (قبضة من فوق، الكفين للأمام) والكوعين تحت وللخلف، والجذع مايل للخلف شوي
      seated({ ...sym({ shoulder: [-25, 26, 42], elbow: 137, roll: -34 }), spine: -20, chest: -5 }),
    ],
    tempo: [1.2, 1.8], hold: [0.1, 0.3], props: [{ kind: 'latBar' }, { kind: 'latMachine', pos: [0, 0, -0.02] }], rest: ['seat', 'floor'], rigidGrip: true,
    primary: ['lats'], secondary: ['biceps', 'upperBack', 'rearDelts'], view: { yaw: 150, y: 1.2 },
  },
  lat_pulldown_close: {
    keys: [seated(sym({ shoulder: [155, 10, 0], elbow: 5, spine: -8 })), seated({ ...sym({ shoulder: [35, 12, 0], elbow: 110 }), spine: -18, chest: -4 })],
    tempo: [1.2, 1.8], hold: [0.1, 0.3], props: [{ kind: 'latBar' }, { kind: 'latMachine', pos: [0, 0, -0.02] }], rest: ['seat', 'floor'], rigidGrip: true,
    primary: ['lats'], secondary: ['biceps', 'upperBack'], view: { yaw: 150, y: 1.2 },
  },
  pullup: {
    keys: [
      { root: { y: 1.05, z: 0 }, ...sym({ shoulder: [176, -17, 0], elbow: 4, hip: [10, 4, 0], knee: 40, ankle: 20 }) },
      // فوق: الذقن فوق البار والجسم ورا البار شوي (البار قدام الرقبة مو داخل الوجه)، واليدين ثابتة على البار
      { root: { y: 1.39, z: -0.12 }, spine: -14, neck: -12, ...sym({ shoulder: [32, 63, 89], elbow: 121, hip: [10, 4, 0], knee: 40, ankle: 20 }) },
    ], tempo: [1.3, 1.8], hold: [0.2, 0.3], flatFeet: false, handsFixed: true, rigidGrip: true, props: [{ kind: 'pullupBar' }], primary: ['lats'], secondary: ['biceps', 'upperBack', 'forearms'], view: { yaw: 150, y: 1.4, dist: 3.8 },
  },
  row_cable_seated: {
    keys: [
      // الركب مفتوحة شوي (hipOut) بدون لف الفخذ، فباطن القدمين مسطّح على اللوح
      { root: { y: 0.55, z: -0.2 }, spine: 18, ...sym({ hip: [82, 0, 0], hipOut: 7, knee: 34, ankle: -10, shoulder: [80, 10, 0], elbow: 4 }) },
      { root: { y: 0.55, z: -0.2 }, spine: 0, chest: -8, ...sym({ hip: [82, 0, 0], hipOut: 7, knee: 34, ankle: -10, shoulder: [-20, 12, 0], elbow: 100 }) },
    ], tempo: [1.2, 1.8], hold: [0.1, 0.4], props: [{ kind: 'rowStation', pos: [0, 0, 0] }], rest: ['seat'], flatFeet: false,
    primary: ['upperBack', 'lats'], secondary: ['biceps', 'rearDelts'], view: { yaw: 75, y: 0.6 },
  },
  row_db_one_arm: {
    keys: [
      { root: { y: 0.93, pitch: 71 }, neck: -35, ...sym({ elbow: 2 }), lShoulder: [85, 8, 0], rShoulder: [80, 6, 0], lHip: [74, 6, 0], rHip: [68, 8, 0], lKnee: 96, rKnee: 20, lAnkle: 45 },
      { root: { y: 0.93, pitch: 71 }, neck: -35, lShoulder: [85, 8, 0], rShoulder: [-12, 12, 0], lElbow: 2, rElbow: 78, lHip: [74, 6, 0], rHip: [68, 8, 0], lKnee: 96, rKnee: 20, lAnkle: 45 },
    ], tempo: [1.2, 1.8], hold: [0.1, 0.4], flatFeet: 'R', props: [{ kind: 'dumbbellR' }, { kind: 'benchSideRow', pos: [0.15, 0, 0.07] }],
    primary: ['lats', 'upperBack'], secondary: ['biceps', 'rearDelts'], view: { yaw: -60, y: 0.8 },
  },
  row_bb: {
    keys: [
      { root: { pitch: 55 }, neck: -25, ...sym({ shoulder: [55, 16, 0], elbow: 3, hip: [65, 6, 0], knee: 22 }) },
      { root: { pitch: 55 }, neck: -25, ...sym({ shoulder: [-12, 28, 0], elbow: 95, hip: [65, 8, 2], knee: 22, hipOut: -1 }) },
    ], tempo: [1.2, 1.8], hold: [0.1, 0.3], ground: true, props: [{ kind: 'barbell' }],
    primary: ['upperBack', 'lats'], secondary: ['biceps', 'lowerBack', 'rearDelts'], view: { yaw: 70 },
  },

  // ---------------- ذراعين ----------------
  curl_db: {
    // الكفين للأمام من تحت وللكتف فوق (قبضة من تحت)
    // الذراعين مبعدة شوي عن الجسم عشان رأس الدمبل الداخلي يعدّي جنب الفخذ
    keys: [sym({ shoulder: [6, 18, 0], elbow: 5, hip: [0, 5, 0], roll: 90 }), sym({ shoulder: [12, 12, 0], elbow: 138, hip: [0, 5, 0], roll: 90 })],
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
      // الكفين مع بعض ماسكة رأس الدمبل: تحت = ورا الرأس والكوعين للسقف، فوق = الذراعين ممدودة فوق الرأس
      sym({ shoulder: [163, 5, -24], elbow: 141, roll: -22, hip: [0, 5, 0] }),
      sym({ shoulder: [169, 11, 17], elbow: 14, roll: -22, hip: [0, 5, 0] }),
    ], tempo: [1.2, 1.8], hold: [0.1, 0.3], ground: true, props: [{ kind: 'dumbbellOverhead' }], primary: ['triceps'], secondary: [], view: { yaw: 70, y: 1.2 },
  },

  // ---------------- بطن ----------------
  plank: {
    keys: [
      { root: { y: 0.27, z: 0.07, pitch: 83 }, neck: -20, ...sym({ shoulder: [83, 10, 0], elbow: 86, roll: -88, wext: 4, hip: [0, 6, 0], knee: 0, ankle: 40 }) },
      { root: { y: 0.28, z: 0.07, pitch: 82 }, neck: -20, ...sym({ shoulder: [83, 10, 0], elbow: 86, roll: -88, wext: 4, hip: [0, 6, 0], knee: 0, ankle: 40 }) },
    ], tempo: [1.6, 1.6], props: [{ kind: 'mat' }], rest: ['ground'], contacts: ['hands', 'feet'], grip: 0.4, primary: ['abs'], secondary: ['shoulders', 'glutes', 'lowerBack'], view: { yaw: 80, y: 0.35 },
  },
  hanging_knee_raise: {
    keys: [
      { root: { y: 1.12 }, ...sym({ shoulder: [176, -3, 0], elbow: 4, hip: [4, 4, 0], knee: 10, ankle: 20 }) },
      { root: { y: 1.13, z: -0.1 }, spine: 10, ...sym({ shoulder: [182, -3, 0], elbow: 4, hip: [100, 8, 0], knee: 95, ankle: 20 }) },
    ], tempo: [1.2, 1.6], hold: [0.1, 0.3], flatFeet: false, props: [{ kind: 'pullupBar' }], primary: ['abs'], secondary: ['forearms', 'lats'], view: { yaw: 70, y: 1.4, dist: 3.8 },
  },
  ab_wheel: {
    keys: [
      { root: { y: 0.52, z: -0.35, pitch: 30 }, spine: 38, neck: -25, ...sym({ shoulder: [72, 10, 0], elbow: 2, hip: [30, 8, 0], knee: 90, ankle: KNEEL_ANKLE }) },
      { root: { y: 0.43, z: -0.1, pitch: 60 }, spine: 10, neck: -15, ...sym({ shoulder: [107, 10, 0], elbow: 2, hip: [26, 8, 0], knee: 58, ankle: KNEEL_ANKLE }) },
    ], tempo: [1.8, 1.5], hold: [0.2, 0.2], props: [{ kind: 'abWheel' }, { kind: 'mat' }], rest: ['ground'], contacts: ['knees', 'hands'], contactLift: { hands: 0.066 }, flatFeet: false, primary: ['abs'], secondary: ['lats', 'shoulders'], view: { yaw: 80, y: 0.35 },
  },

  // ---------------- أرجل (إضافية) ----------------
  front_squat: {
    keys: [
      { root: { z: 0 }, ...sym({ shoulder: [88, 28, 0], elbow: 150, hip: [0, 10, 12], knee: 0, hipOut: 20 }) },
      { root: { z: -0.14 }, spine: 17, neck: -8, ...sym({ shoulder: [88, 28, 0], elbow: 150, hip: [89, 24, 12], knee: 127, hipOut: 32 }) },
    ], tempo: [1.8, 1.3], hold: [0.3, 0.2], ground: true,
    props: [{ kind: 'barbell' }], primary: ['quads', 'glutes'], secondary: ['abs', 'upperBack', 'lowerBack'],
  },
  sumo_squat: {
    keys: [
      { ...sym({ hip: [0, 17, 28], knee: 0 }), ...GOBLET_HOLD },
      { root: { z: -0.05 }, spine: 12, neck: -6, ...sym({ hip: [82, 45, 30], knee: 110, hipOut: 43 }), ...GOBLET_HOLD },
    ], tempo: [1.8, 1.3], hold: [0.3, 0.2], ground: true,
    props: [{ kind: 'goblet' }], primary: ['glutes', 'quads'], secondary: ['hamstrings'], view: { yaw: 25 },
  },
  sumo_deadlift: {
    keys: [
      { root: { z: -0.08, pitch: 27 }, neck: -18, ...sym({ shoulder: [19, 5, 0], elbow: 3, hip: [108, 8, 15], knee: 113, hipOut: 52 }) },
      { ...sym({ shoulder: [4, 4, 0], elbow: 4, hip: [0, 17, 28], knee: 0 }) },
    ], tempo: [1.4, 1.8], hold: [0.4, 0.3], ground: true,
    props: [{ kind: 'barbell' }], primary: ['glutes', 'hamstrings', 'quads'], secondary: ['lowerBack', 'upperBack', 'forearms'], view: { yaw: 30 },
  },
  step_up: {
    keys: [
      { root: { y: 0.97, z: 0 }, lHip: [60, 6, 0], lKnee: 75, rHip: [0, 6, 0], rKnee: 3, rAnkle: -3, ...ARMS_DOWN },
      { root: { y: 1.16, z: 0.24 }, lHip: [2, 6, 0], lKnee: 2, rHip: [30, 6, 0], rKnee: 75, rAnkle: 12, ...ARMS_DOWN },
    ], tempo: [1.2, 1.6], hold: [0.2, 0.3], flatFeet: 'L', props: [{ kind: 'dumbbells' }, { kind: 'step', pos: [0.2, 0, 0.26] }],
    primary: ['quads', 'glutes'], secondary: ['hamstrings', 'calves'], view: { yaw: 70 },
  },
  good_morning: {
    keys: [
      { ...sym({ shoulder: [-22, 78, 90], elbow: 142, hip: [0, 10, 12], knee: 0 }) },
      { root: { z: 0.1, pitch: 68 }, neck: -31, ...sym({ shoulder: [-22, 78, 90], elbow: 142, hip: [72, 0, 7], knee: 18, hipOut: 12 }) },
    ], tempo: [1.9, 1.4], hold: [0.3, 0.2], ground: true,
    props: [{ kind: 'barbellBack' }], primary: ['hamstrings', 'glutes', 'lowerBack'], secondary: [], view: { yaw: 75 },
  },
  donkey_kick: {
    keys: [
      { root: { y: 0.49, z: 0, pitch: 67 }, neck: -30, ...sym({ shoulder: [64, 8, 0], elbow: 2, roll: -82, wext: 91, hip: [67, 6, 0], knee: 92, ankle: KNEEL_ANKLE }) },
      { root: { y: 0.49, z: 0, pitch: 67 }, neck: -30, ...sym({ shoulder: [64, 8, 0], elbow: 2, roll: -82, wext: 91, knee: 92 }), lHip: [67, 6, 0], rHip: [-10, 6, 0], lAnkle: KNEEL_ANKLE, rAnkle: -8 },
    ], tempo: [1.1, 1.5], hold: [0.1, 0.5], props: [{ kind: 'mat' }], rest: ['ground'], contacts: ['hands', 'knees'], flatFeet: false, grip: 0.12, primary: ['glutes'], secondary: ['hamstrings'], view: { yaw: 80, y: 0.5 },
  },
  hip_abduction: {
    // الفخذ المثني ينفتح أفقياً (دوران حول المحور العمودي: hipOut) — الركبتين تتباعد والقدمين معها على مساند الجهاز
    keys: [seated({ lHip: [88, 4, 0], rHip: [88, 4, 0], lKnee: 80, rKnee: 80, ...sym({ shoulder: [-14, 20, 0], elbow: 22, hipOut: 3 }) }), seated({ lHip: [88, 4, 0], rHip: [88, 4, 0], lKnee: 80, rKnee: 80, ...sym({ shoulder: [-14, 20, 0], elbow: 22, hipOut: 36 }) })],
    // القدمين على مساند الجهاز (تتحرك مع الرجلين) مو على الأرض
    tempo: [1.2, 1.8], hold: [0.1, 0.5], props: [{ kind: 'hipAbduction', pos: [0, 0, -0.05] }], rest: ['seat', 'back'], flatFeet: false, primary: ['glutes'], secondary: [], view: { yaw: 20, y: 0.8 },
  },
  seated_calf_raise: {
    keys: [
      // الدمبل بالعرض فوق الركب والكفين عليه
      { root: { y: 0.58, z: 0 }, ...sym({ shoulder: [35, 4, -1], elbow: 42, roll: -86, hip: [88, 14, 0], knee: 88, ankle: 0 }) },
      { root: { y: 0.58, z: 0 }, ...sym({ shoulder: [35, 4, -1], elbow: 42, roll: -86, hip: [98, 14, 0], knee: 88, ankle: 26 }) },
    ],
    tempo: [0.9, 1.4], hold: [0.1, 0.6], props: [{ kind: 'seat' }, { kind: 'dumbbells' }], rest: ['seat', 'floor'], primary: ['calves'], secondary: [], view: { yaw: 75, y: 0.6 },
  },
  single_leg_rdl: {
    keys: [
      // الدمبل قدام الفخذين (قبضة من فوق) والرجل الحرة قدمها محايدة
      sym({ shoulder: [17, 9, 0], elbow: 4, hip: [0, 5, 0], roll: -90 }),
      { root: { pitch: 74 }, lHip: [80, 5, 0], lKnee: 14, rHip: [0, 5, 0], rKnee: 10, rAnkle: -12, ...sym({ shoulder: [76, 6, 0], elbow: 3, roll: -90 }), neck: -30 },
    ], tempo: [1.9, 1.4], hold: [0.3, 0.2], ground: true, plant: 'L', flatFeet: 'L', props: [{ kind: 'dumbbells' }], primary: ['hamstrings', 'glutes'], secondary: ['lowerBack', 'abs'], view: { yaw: 75 },
  },
  kb_swing: {
    keys: [
      { root: { z: -0.01, pitch: 62 }, neck: -28, ...sym({ shoulder: [30, 6, 0], elbow: 2, hip: [80, 8, 4], knee: 34, hipOut: 7 }) },
      { ...sym({ shoulder: [92, 6, 0], elbow: 2, hip: [0, 8, 0], knee: 2 }) },
    ], tempo: [0.7, 0.8], hold: [0.05, 0.15], ground: true, props: [{ kind: 'goblet' }], primary: ['glutes', 'hamstrings'], secondary: ['lowerBack', 'shoulders', 'abs'], view: { yaw: 75 },
  },
  wall_sit: {
    keys: [
      { root: { y: 0.55, z: -0.05 }, ...sym({ shoulder: [4, 10, 0], elbow: 6, hip: [90, 10, 0], knee: 90 }) },
      { root: { y: 0.56, z: -0.05 }, ...sym({ shoulder: [4, 10, 0], elbow: 6, hip: [89, 10, 0], knee: 89 }) },
    ], tempo: [2, 2], props: [{ kind: 'backPad' }], primary: ['quads'], secondary: ['glutes'], view: { yaw: 80, y: 0.6 },
  },
  air_squat: {
    keys: [
      { root: { z: 0 }, ...sym({ shoulder: [4, 8, 0], elbow: 6, hip: [0, 10, 12], knee: 0, hipOut: 20 }) },
      { root: { z: -0.19 }, spine: 21, neck: -14, ...sym({ shoulder: [88, 10, 0], elbow: 6, hip: [94, 20, 12], knee: 124, hipOut: 33 }) },
    ], tempo: [1.5, 1.1], hold: [0.2, 0.2], ground: true,
    props: [], primary: ['quads', 'glutes'], secondary: ['hamstrings', 'abs'],
  },

  // ---------------- صدر (إضافية) ----------------
  incline_bench_bb: {
    keys: [
      { root: INCLINE_ROOT, ...inclineLegs, ...sym({ shoulder: [133, -30, -100], elbow: 11, roll: -13 }) },
      { root: INCLINE_ROOT, ...inclineLegs, ...sym({ shoulder: [-17, 61, 39], elbow: 121, roll: -13 }) },
    ], tempo: [1.8, 1.2], hold: [0.2, 0.2], props: [{ kind: 'barbell' }, { kind: 'inclineBench', pos: [0, 0, -0.05] }], rest: ['seat', 'back', 'floor'],
    primary: ['chest', 'shoulders'], secondary: ['triceps'], view: { yaw: 60 },
  },
  close_grip_bench: {
    // قبضة بعرض الكتفين والكوع قريب من الجسم
    keys: [supine(sym({ shoulder: [95, -30, -57], elbow: 0, roll: -63 })), supine(sym({ shoulder: [-21, 27, 0], elbow: 111, roll: -63 }))], tempo: [1.8, 1.2], hold: [0.2, 0.2],
    props: [{ kind: 'barbell' }, { kind: 'benchPress', pos: [0, 0, -0.3] }], rest: ['bench', 'floor'], primary: ['triceps', 'chest'], secondary: ['shoulders'], view: { yaw: 60, y: 0.7 },
  },
  push_up: {
    keys: [
      // الكفين مفرودة على الأرض (الأصابع للأمام) والرسغ مثني للخلف
      { root: { y: 0.5, z: 0.04, pitch: 68 }, neck: -18, ...sym({ shoulder: [64, 10, 0], elbow: 2, roll: -80, wext: 92, hip: [0, 6, 0], knee: 0, ankle: 39 }) },
      { root: { y: 0.36, z: 0.05, pitch: 77 }, neck: -15, ...sym({ shoulder: [9, 21, 0], elbow: 95, roll: -68, wext: 64, hip: [0, 6, 0], knee: 0, ankle: 31 }) },
    ], tempo: [1.5, 1.1], hold: [0.1, 0.2], props: [{ kind: 'mat' }], rest: ['ground'], contacts: ['hands', 'feet'], grip: 0.12, primary: ['chest', 'triceps'], secondary: ['shoulders', 'abs'], view: { yaw: 70, y: 0.4 },
  },
  knee_push_up: {
    keys: [
      { root: { y: 0.36, z: 0.03, pitch: 47 }, neck: -15, ...sym({ shoulder: [44, 5, 0], elbow: 2, roll: -86, wext: 91, hip: [0, 6, 0], knee: 65, ankle: 30 }) },
      { root: { y: 0.25, z: 0.11, pitch: 65 }, neck: -12, ...sym({ shoulder: [-16, 8, 0], elbow: 95, roll: -82, wext: 76, hip: [0, 6, 0], knee: 65, ankle: 30 }) },
    ], tempo: [1.5, 1.1], hold: [0.1, 0.2], props: [{ kind: 'mat' }], rest: ['ground'], contacts: ['hands', 'knees'], flatFeet: false, grip: 0.12, primary: ['chest', 'triceps'], secondary: ['shoulders'], view: { yaw: 70, y: 0.4 },
  },
  db_fly: {
    keys: [
      // الكفين متقابلين فوق، ولما تنفتح الذراعين الكفين للسقف
      supine(sym({ shoulder: [83, 74, 0], elbow: 8, roll: 74 })),
      supine(sym({ shoulder: [-6, 86, 16], elbow: 14, roll: 74 })),
    ], tempo: [1.8, 1.3], hold: [0.2, 0.2], props: [{ kind: 'dumbbells' }, { kind: 'bench', pos: [0, 0, -0.3] }], rest: ['bench', 'floor'],
    primary: ['chest'], secondary: ['shoulders'], view: { yaw: 25, y: 0.7 },
  },
  incline_db_fly: {
    keys: [
      { root: INCLINE_ROOT, ...inclineLegs, ...sym({ shoulder: [128, -6, 0], elbow: 6, roll: -5 }) },
      { root: INCLINE_ROOT, ...inclineLegs, ...sym({ shoulder: [-6, 86, 17], elbow: 14, roll: 72 }) },
    ], tempo: [1.8, 1.3], hold: [0.2, 0.2], props: [{ kind: 'dumbbells' }, { kind: 'inclineBench', pos: [0, 0, -0.05] }], rest: ['seat', 'back', 'floor'],
    primary: ['chest'], secondary: ['shoulders'], view: { yaw: 30 },
  },

  // ---------------- أكتاف (إضافية) ----------------
  arnold_press: {
    keys: [
      // البداية: الدمبل قدام الأكتاف والكفين للوجه، وخلال الضغط يلفّ الكف للأمام
      seated(sym({ shoulder: [34, 14, 18], elbow: 128, roll: 104 })),
      seated(pressOverheadTop),
    ], tempo: [1.4, 1.8], hold: [0.2, 0.2],
    props: [{ kind: 'dumbbells' }, { kind: 'seatBack', pos: [0, 0, -0.05] }], rest: ['seat', 'back', 'floor'], primary: ['shoulders'], secondary: ['triceps'], view: { yaw: 35, y: 1.0 },
  },
  front_raise: {
    // الكفين للأسفل (قبضة من فوق) والدمبل أفقي فوق
    keys: [sym({ shoulder: [15, 13, 0], elbow: 8, hip: [0, 5, 0], roll: -90 }), sym({ shoulder: [90, 8, 0], elbow: 8, hip: [0, 5, 0], roll: -90 })],
    tempo: [1.2, 1.8], hold: [0.1, 0.3], ground: true, props: [{ kind: 'dumbbells' }], primary: ['shoulders'], secondary: ['chest'], view: { yaw: 70, y: 1.1 },
  },
  face_pull: {
    keys: [
      { ...sym({ shoulder: [86, 14, 0], elbow: 4, hip: [0, 6, 0] }), lHip: [12, 6, 0], lKnee: 12, rHip: [-10, 6, 0], rKnee: 6 },
      { ...sym({ shoulder: [80, 82, 90], elbow: 105, hip: [0, 6, 0] }), lHip: [12, 6, 0], lKnee: 12, rHip: [-10, 6, 0], rKnee: 6 },
    ], tempo: [1.1, 1.7], hold: [0.1, 0.5], ground: true, props: [{ kind: 'cableHigh', pos: [0, 1.62, 1.0] }],
    primary: ['rearDelts', 'upperBack'], secondary: ['shoulders', 'biceps'], view: { yaw: 150, y: 1.2 },
  },
  reverse_pec_deck: {
    // الذراعين أفقية على مستوى الكتف: من قدام (الكفين متقابلة على المقابض العمودية) للجنب (الكفين للأمام)
    keys: [seated(sym({ shoulder: [88, 90, 0], elbow: 10, roll: 90 })), seated(sym({ shoulder: [-4, 90, 0], elbow: 10, roll: 90 }))],
    tempo: [1.2, 1.8], hold: [0.1, 0.5], props: [{ kind: 'reversePecDeck', pos: [0, 0, -0.02] }], rest: ['seat', 'back', 'floor'], primary: ['rearDelts'], secondary: ['upperBack'], view: { yaw: 160, y: 1.0 },
  },

  // ---------------- ظهر (إضافية) ----------------
  t_bar_row: {
    keys: [
      { ...sym({ root: { pitch: 45 }, hip: [62, 8, 0], knee: 30, shoulder: [45, 4, 0], elbow: 3 }), neck: -18 },
      { ...sym({ root: { pitch: 45 }, hip: [62, 8, 0], knee: 30, shoulder: [-18, 8, 0], elbow: 100 }), neck: -18 },
    ], tempo: [1.2, 1.8], hold: [0.1, 0.3], ground: true, props: [{ kind: 'goblet' }],
    primary: ['upperBack', 'lats'], secondary: ['biceps', 'lowerBack', 'rearDelts'], view: { yaw: 70 },
  },
  chin_up: {
    keys: [
      { root: { y: 1.05, z: 0 }, ...sym({ shoulder: [176, 2, 0], elbow: 4, hip: [10, 4, 0], knee: 40, ankle: 20 }) },
      { root: { y: 1.42, z: -0.14 }, spine: -10, neck: -12, ...sym({ shoulder: [59, 4, 0], elbow: 125, hip: [10, 4, 0], knee: 40, ankle: 20 }) },
    ], tempo: [1.3, 1.8], hold: [0.2, 0.3], flatFeet: false, handsFixed: true, rigidGrip: true, props: [{ kind: 'pullupBar' }], primary: ['lats', 'biceps'], secondary: ['upperBack', 'forearms'], view: { yaw: 70, y: 1.4, dist: 3.8 },
  },
  straight_arm_pulldown: {
    keys: [
      { ...sym({ root: { pitch: 22 }, hip: [26, 8, 0], knee: 12, shoulder: [125, 12, 0], elbow: 8 }), neck: -10 },
      { ...sym({ root: { pitch: 22 }, hip: [26, 8, 0], knee: 12, shoulder: [10, 12, 0], elbow: 8 }), neck: -10 },
    ], tempo: [1.2, 1.8], hold: [0.1, 0.4], ground: true, props: [{ kind: 'latBar' }],
    primary: ['lats'], secondary: ['triceps', 'abs'], view: { yaw: 75, y: 1.1 },
  },
  superman: {
    keys: [
      { root: { y: 0.13, pitch: 90 }, ...sym({ hip: [0, 8, 0], knee: 0, shoulder: [168, 22, 0], elbow: 4, roll: -86, wext: 9, ankle: KNEEL_ANKLE }), neck: -40 },
      { root: { y: 0.13, pitch: 90 }, chest: -14, spine: -10, ...sym({ hip: [-16, 8, 0], knee: 0, shoulder: [176, 22, 0], elbow: 4, roll: -90, wext: -24, ankle: 50 }), neck: -50 },
    ], tempo: [1.2, 1.6], hold: [0.1, 0.8], props: [{ kind: 'mat' }], rest: ['ground'], flatFeet: false, grip: 0.3, primary: ['lowerBack', 'glutes'], secondary: ['upperBack', 'hamstrings'], view: { yaw: 80, y: 0.3 },
  },
  db_pullover: {
    keys: [
      // الرأس عند طرف البنش: الدمبل ينزل ورا الرأس تحت مستوى البنش (الذراعين جنب الأذنين والكوع مثني شوي)
      // القدمين مفتوحة على الأرض برا قاعدة البنش الأمامية
      { root: SUPINE_ROOT, ...supineLegs, ...sym({ shoulder: [92, 10, 0], elbow: 12, hip: [-8, 46, 0] }) },
      { root: SUPINE_ROOT, ...supineLegs, ...sym({ shoulder: [186, 10, 0], elbow: 16, hip: [-8, 46, 0] }) },
    ], tempo: [1.8, 1.4], hold: [0.2, 0.2], props: [{ kind: 'dumbbellPullover' }, { kind: 'bench', pos: [0, 0, -0.06] }], rest: ['bench', 'floor'],
    primary: ['lats', 'chest'], secondary: ['triceps'], view: { yaw: 80, y: 0.7 },
  },

  // ---------------- ذراعين (إضافية) ----------------
  concentration_curl: {
    keys: [
      // جالس والركبتين مفتوحة والجذع مايل للأمام: خلف العضد اليمين على باطن الفخذ قرب الركبة، والذراع معلّقة بين الرجلين
      // والكف للأمام (كيرل)، واليسار على الركبة
      seated({ root: { ...SEATED_ROOT, pitch: 18 }, spine: 36, chest: 10, neck: -35, lHip: [104, 0, 0], rHip: [104, 0, 0], lHipOut: 31, rHipOut: 31, lShoulder: [45, 20, 0], lElbow: 40, rShoulder: [68, -24, 0], rElbow: 3, rRoll: 92 }),
      seated({ root: { ...SEATED_ROOT, pitch: 18 }, spine: 36, chest: 10, neck: -35, lHip: [104, 0, 0], rHip: [104, 0, 0], lHipOut: 31, rHipOut: 31, lShoulder: [45, 20, 0], lElbow: 40, rShoulder: [69, -20, -30], rElbow: 102, rRoll: 92 }),
    ], tempo: [1.1, 1.8], hold: [0.1, 0.4], props: [{ kind: 'dumbbellR' }, { kind: 'seat', pos: [0, 0.04, 0] }], rest: ['seat', 'floor'], primary: ['biceps'], secondary: ['forearms'], view: { yaw: -40, y: 0.8 },
  },
  cable_curl: {
    keys: [sym({ shoulder: [8, 14, 0], elbow: 6, hip: [0, 5, 0] }), sym({ shoulder: [16, 14, 0], elbow: 135, hip: [0, 5, 0] })],
    tempo: [1.1, 1.8], hold: [0.1, 0.3], ground: true, props: [{ kind: 'cableLow', pos: [0, 0.1, 0.55] }],
    primary: ['biceps'], secondary: ['forearms'], view: { yaw: 60, y: 1.0 },
  },
  incline_db_curl: {
    keys: [
      // الذراع معلّقة عمودي ورا الجذع، والكفين للأمام (كيرل عادي)
      // الذراعين مبعدة شوي للجنب عشان الدمبل (قبضة من تحت) يعدّي جنب الحوض والمقعد
      { root: INCLINE_ROOT, ...inclineLegs, ...sym({ shoulder: [-52, 30, 0], elbow: 3, roll: 87 }) },
      { root: INCLINE_ROOT, ...inclineLegs, ...sym({ shoulder: [-52, 30, 0], elbow: 122, roll: 87 }) },
    ], tempo: [1.1, 1.8], hold: [0.1, 0.3], props: [{ kind: 'dumbbells' }, { kind: 'inclineBench', pos: [0, 0, -0.05] }], rest: ['seat', 'back', 'floor'],
    primary: ['biceps'], secondary: ['forearms'], view: { yaw: 70 },
  },
  skull_crusher: {
    keys: [
      supine(sym({ shoulder: [97, 5, 6], elbow: 0, roll: -91 })),
      supine(sym({ shoulder: [110, 4, 4], elbow: 115, roll: -91 })),
    ], tempo: [1.1, 1.7], hold: [0.1, 0.2], props: [{ kind: 'ezbar' }, { kind: 'bench', pos: [0, 0, -0.3] }], rest: ['bench', 'floor'],
    primary: ['triceps'], secondary: [], view: { yaw: 70, y: 0.7 },
  },
  triceps_kickback: {
    keys: [
      { root: { y: 0.93, pitch: 71 }, neck: -35, lShoulder: [85, 8, 0], rShoulder: [-8, 10, 0], lElbow: 2, rElbow: 88, lHip: [74, 6, 0], rHip: [68, 8, 0], lKnee: 96, rKnee: 20, lAnkle: 45 },
      { root: { y: 0.93, pitch: 71 }, neck: -35, lShoulder: [85, 8, 0], rShoulder: [-12, 10, 0], lElbow: 2, rElbow: 4, lHip: [74, 6, 0], rHip: [68, 8, 0], lKnee: 96, rKnee: 20, lAnkle: 45 },
    ], tempo: [1.1, 1.7], hold: [0.1, 0.5], flatFeet: 'R', props: [{ kind: 'dumbbellR' }, { kind: 'benchSideRow', pos: [0.15, 0, 0.07] }],
    primary: ['triceps'], secondary: [], view: { yaw: -70, y: 0.8 },
  },
  bench_dips: {
    keys: [
      // الكفين على حافة البنش (ثابتة) والحوض ينزل قدام الحافة مباشرة (الظهر قريب منها)
      // الكعبين على الأرض والأصابع للأعلى (الكاحل محايد)، والقدمين ثابتة
      { root: { y: 0.62, z: 0.0 }, ...sym({ shoulder: [-18, 14, 0], elbow: 4, hip: [70, 8, 0], knee: 34, ankle: 8 }) },
      { root: { y: 0.43, z: -0.05 }, ...sym({ shoulder: [-64, 22, 0], elbow: 95, hip: [90, 8, 0], knee: 47, ankle: 8 }) },
    ], tempo: [1.5, 1.2], hold: [0.1, 0.2], handsFixed: true, rest: ['floor'], plant: 'both', flatFeet: false, props: [{ kind: 'benchBehind', pos: [0, 0, -0.27] }],
    primary: ['triceps'], secondary: ['chest', 'shoulders'], view: { yaw: 75, y: 0.5 },
  },

  // ---------------- بطن (إضافية) ----------------
  crunch: {
    keys: [
      { root: { y: 0.11, z: 0, pitch: -90 }, ...sym({ shoulder: [51, 55, 0], elbow: 155, hip: [60, 10, 0], knee: 110 }) },
      { root: { y: 0.11, z: 0, pitch: -90 }, spine: 22, chest: 20, neck: 10, ...sym({ shoulder: [51, 55, 0], elbow: 155, hip: [60, 10, 0], knee: 110 }) },
    ], tempo: [1.0, 1.4], hold: [0.1, 0.4], props: [{ kind: 'mat' }], rest: ['ground', 'floor'], primary: ['abs'], secondary: [], view: { yaw: 80, y: 0.3 },
  },
  lying_leg_raise: {
    keys: [
      { root: FLOOR_SUPINE, neck: -8, ...sym({ hip: [6, 6, 0], knee: 2, ankle: 20, shoulder: [-4, 18, 0], elbow: 0, roll: -90 }) },
      { root: FLOOR_SUPINE, neck: -8, ...sym({ hip: [88, 6, 0], knee: 4, ankle: 20, shoulder: [-4, 18, 0], elbow: 0, roll: -90 }) },
    ], tempo: [1.3, 1.6], hold: [0.1, 0.3], props: [{ kind: 'mat' }], rest: ['ground', 'palms'], flatFeet: false, grip: 0.3, primary: ['abs'], secondary: [], view: { yaw: 80, y: 0.3 },
  },
  mountain_climber: {
    // الركبة ترتفع أول (القدم فوق الأرض) ثم تتقدم للصدر — بدون توقف بين الوضعيات
    keys: [
      { ...MC_PLANK },
      { ...MC_PLANK, lHip: [34, 6, 0], lKnee: 82, lAnkle: -5 },
      { ...MC_PLANK, lHip: [85, 6, 0], lKnee: 113, lAnkle: 5 },
      { ...MC_PLANK, lHip: [34, 6, 0], lKnee: 82, lAnkle: -5 },
      { ...MC_PLANK },
      { ...MC_PLANK, rHip: [34, 6, 0], rKnee: 82, rAnkle: -5 },
      { ...MC_PLANK, rHip: [85, 6, 0], rKnee: 113, rAnkle: 5 },
      { ...MC_PLANK, rHip: [34, 6, 0], rKnee: 82, rAnkle: -5 },
    ], tempo: [0.16, 0.16, 0.16, 0.16, 0.16, 0.16, 0.16, 0.16], flow: true, props: [{ kind: 'mat' }], rest: ['ground'], contacts: ['hands', 'feet'], flatFeet: false, grip: 0.12, primary: ['abs'], secondary: ['shoulders', 'quads'], view: { yaw: 75, y: 0.45 },
  },
  dead_bug: {
    keys: [
      { root: FLOOR_SUPINE, neck: -8, ...sym({ hip: [90, 8, 0], knee: 90, shoulder: [90, 10, 0], elbow: 2 }) },
      { root: FLOOR_SUPINE, neck: -8, lHip: [90, 8, 0], lKnee: 90, rHip: [12, 8, 0], rKnee: 4, lShoulder: [170, 10, 0], lElbow: 2, rShoulder: [90, 10, 0], rElbow: 2 },
      { root: FLOOR_SUPINE, neck: -8, ...sym({ hip: [90, 8, 0], knee: 90, shoulder: [90, 10, 0], elbow: 2 }) },
      { root: FLOOR_SUPINE, neck: -8, rHip: [90, 8, 0], rKnee: 90, lHip: [12, 8, 0], lKnee: 4, rShoulder: [170, 10, 0], rElbow: 2, lShoulder: [90, 10, 0], lElbow: 2 },
    ], tempo: [1.1, 1.1, 1.1, 1.1], hold: [0, 0.3, 0, 0.3], props: [{ kind: 'mat' }], rest: ['ground'], flatFeet: false, primary: ['abs'], secondary: ['lowerBack'], view: { yaw: 70, y: 0.35 },
  },
  cable_crunch: {
    keys: [
      { root: { y: 0.54 }, spine: 8, ...sym({ shoulder: [150, 55, 0], elbow: 140, hip: [0, 8, 0], knee: 92, ankle: KNEEL_ANKLE }) },
      { root: { y: 0.54 }, spine: 58, chest: 28, ...sym({ shoulder: [150, 55, 0], elbow: 140, hip: [0, 8, 0], knee: 92, ankle: KNEEL_ANKLE }) },
    ], tempo: [1.1, 1.6], hold: [0.1, 0.4],
    props: [{ kind: 'mat' }, { kind: 'cableHigh', pos: [0, 2.0, 0.5] }], rest: ['ground'], contacts: ['knees', 'feet'], flatFeet: false, primary: ['abs'], secondary: [], view: { yaw: 75, y: 0.7 },
  },

  // ---------------- كارديو ----------------
  jumping_jack: {
    keys: [sym({ shoulder: [0, 8, 0], elbow: 4, hip: [0, 4, 0] }), sym({ shoulder: [0, 165, 0], elbow: 8, hip: [0, 20, 0] })],
    tempo: [0.35, 0.35], ground: true, plant: 'none', props: [], primary: ['calves', 'shoulders'], secondary: ['quads', 'glutes'], view: { yaw: 10, y: 1.0 },
  },
  high_knees: {
    keys: [
      { ...sym({ hip: [0, 5, 0], knee: 4 }), lHip: [85, 5, 0], lKnee: 95, rAnkle: 20, lShoulder: [-30, 10, 0], rShoulder: [45, 10, 0], lElbow: 90, rElbow: 90 },
      { ...sym({ hip: [0, 5, 0], knee: 4 }), rHip: [85, 5, 0], rKnee: 95, lAnkle: 20, rShoulder: [-30, 10, 0], lShoulder: [45, 10, 0], lElbow: 90, rElbow: 90 },
    ], tempo: [0.3, 0.3], ground: true, plant: 'none', props: [], primary: ['quads', 'calves'], secondary: ['abs', 'glutes'], view: { yaw: 70, y: 1.0 },
  },
  burpee: {
    keys: [
      { root: { y: 0.98 }, ...sym({ shoulder: [170, 12, 0], elbow: 6, hip: [0, 6, 0], knee: 2, ankle: -2 }) },
      { root: { y: 0.27, z: -0.09 }, spine: 51, neck: -20, ...sym({ shoulder: [71, 12, 0], elbow: 4, roll: -78, wext: 66, hip: [116, 14, 0], knee: 157, ankle: -31 }) },
      { root: { y: 0.43, z: -0.33, pitch: 61 }, spine: 15, neck: -20, ...sym({ shoulder: [107, 12, 0], elbow: 4, roll: -78, wext: 55, hip: [113, 14, 0], knee: 154, ankle: -15 }) },
      { root: { y: 0.5, z: 0.02, pitch: 69 }, neck: -18, ...sym({ shoulder: [65, 14, 0], elbow: 2, roll: -76, wext: 91, hip: [0, 6, 0], knee: 0, ankle: -26 }) },
      { root: { y: 0.43, z: -0.33, pitch: 61 }, spine: 15, neck: -20, ...sym({ shoulder: [107, 12, 0], elbow: 4, roll: -78, wext: 55, hip: [113, 14, 0], knee: 154, ankle: -15 }) },
      { root: { y: 0.27, z: -0.09 }, spine: 51, neck: -20, ...sym({ shoulder: [71, 12, 0], elbow: 4, roll: -78, wext: 66, hip: [116, 14, 0], knee: 157, ankle: -31 }) },
    ], tempo: [0.5, 0.2, 0.2, 0.2, 0.2, 0.5], hold: [0.1, 0, 0, 0.1, 0, 0], props: [{ kind: 'mat' }], rest: ['ground'], flatFeet: false, grip: 0.3, primary: ['quads', 'chest'], secondary: ['shoulders', 'abs', 'glutes'], view: { yaw: 70, y: 0.7 },
  },

  // ================= حركات جديدة (من قاعدة بيانات التمارين المفتوحة) =================
  // ---------------- صدر ----------------
  decline_bench_bb: {
    keys: [
      { root: { y: 0.84, z: 0.05, pitch: -108 }, ...sym({ shoulder: [59, 51, -10], elbow: 16, roll: -32, hip: [22, 14, 0], knee: 95 }) },
      { root: { y: 0.84, z: 0.05, pitch: -108 }, ...sym({ shoulder: [-17, 61, -15], elbow: 98, roll: -32, hip: [22, 14, 0], knee: 95 }) },
    ], tempo: [1.8, 1.2], hold: [0.2, 0.2], props: [{ kind: 'barbell' }, { kind: 'declineBench', pos: [0, 0, -0.15] }], rest: ['bench'],
    primary: ['chest'], secondary: ['triceps', 'shoulders'], view: { yaw: 60, y: 0.8 },
  },
  incline_push_up: {
    keys: [
      // الكفين مفرودة على سطح الصندوق (الأصابع للأمام) والرسغ مثني للخلف، والقدمين على الأرض
      { root: { y: 0.83, z: -0.09, pitch: 44 }, neck: -12, ...sym({ shoulder: [53, 7, 0], elbow: 2, roll: -80, wext: 86, hip: [0, 6, 0], knee: 0, ankle: 70 }) },
      { root: { y: 0.7, z: -0.03, pitch: 55 }, neck: -10, ...sym({ shoulder: [-3, 13, 0], elbow: 95, roll: -72, wext: 88, hip: [0, 6, 0], knee: 0, ankle: 56 }) },
    ], tempo: [1.5, 1.1], hold: [0.1, 0.2], props: [{ kind: 'plyoBox', pos: [0, 0, 0.5] }], rest: ['ground'], contacts: ['hands', 'feet'], grip: 0.12,
    primary: ['chest', 'triceps'], secondary: ['shoulders', 'abs'], view: { yaw: 70, y: 0.6 },
  },
  decline_push_up: {
    keys: [
      { root: { y: 0.67, z: 0.04, pitch: 91 }, neck: -18, ...sym({ shoulder: [83, 70, 0], elbow: 2, roll: -20, wext: 93, hip: [0, 6, 0], knee: 0, ankle: 52 }) },
      { root: { y: 0.53, z: 0.1, pitch: 99 }, neck: -15, ...sym({ shoulder: [25, 59, 0], elbow: 95, roll: -34, wext: 83, hip: [0, 6, 0], knee: 0, ankle: 71 }) },
    ], tempo: [1.5, 1.1], hold: [0.1, 0.2], props: [{ kind: 'plyoBox', pos: [0, 0, -0.95] }, { kind: 'mat', pos: [0, 0, 0.3] }], rest: ['ground'], contacts: ['hands', 'feet'], grip: 0.12,
    primary: ['chest', 'shoulders'], secondary: ['triceps', 'abs'], view: { yaw: 70, y: 0.45 },
  },
  diamond_push_up: {
    keys: [
      { root: { y: 0.49, z: 0.04, pitch: 69 }, neck: -18, ...sym({ shoulder: [60, -33, -15], elbow: 2, roll: -110, wext: 86, hip: [0, 6, 0], knee: 0, ankle: 38 }) },
      { root: { y: 0.31, z: 0.16, pitch: 81 }, neck: -15, ...sym({ shoulder: [-14, -34, 5], elbow: 100, roll: -110, wext: 88, hip: [0, 6, 0], knee: 0, ankle: 59 }) },
    ], tempo: [1.5, 1.1], hold: [0.1, 0.2], props: [{ kind: 'mat' }], rest: ['ground'], contacts: ['hands', 'feet'], grip: 0.12, primary: ['triceps', 'chest'], secondary: ['shoulders', 'abs'], view: { yaw: 60, y: 0.4 },
  },
  wide_push_up: {
    keys: [
      { root: { y: 0.47, z: 0.04, pitch: 70 }, neck: -18, ...sym({ shoulder: [56, 47, 0], elbow: 2, roll: -32, wext: 87, hip: [0, 6, 0], knee: 0, ankle: 37 }) },
      { root: { y: 0.36, z: 0.07, pitch: 78 }, neck: -15, ...sym({ shoulder: [3, 57, 0], elbow: 80, roll: -18, wext: 81, hip: [0, 6, 0], knee: 0, ankle: 36 }) },
    ], tempo: [1.5, 1.1], hold: [0.1, 0.2], props: [{ kind: 'mat' }], rest: ['ground'], contacts: ['hands', 'feet'], grip: 0.12, primary: ['chest'], secondary: ['shoulders', 'triceps', 'abs'], view: { yaw: 50, y: 0.4 },
  },
  low_cable_crossover: {
    keys: [
      { ...sym({ shoulder: [-8, 62, 0], elbow: 16, hip: [0, 6, 0] }), lHip: [16, 6, 0], lKnee: 16, rHip: [-12, 6, 0], rKnee: 10 },
      { ...sym({ shoulder: [80, 16, 0], elbow: 16, hip: [0, 6, 0] }), lHip: [16, 6, 0], lKnee: 16, rHip: [-12, 6, 0], rKnee: 10 },
    ], tempo: [1.6, 1.3], hold: [0.1, 0.5], ground: true, props: [{ kind: 'cableFlyLow' }], primary: ['chest', 'shoulders'], secondary: [], view: { yaw: 30 },
  },
  // ---------------- ظهر ----------------
  inverted_row: {
    keys: [
      { root: { y: 0.37, z: 0.19, pitch: -74 }, neck: 10, ...sym({ shoulder: [80, 46, 0], elbow: 2, hip: [0, 6, 0], knee: 0, ankle: -34 }) },
      { root: { y: 0.61, z: 0.29, pitch: -56 }, neck: 10, ...sym({ shoulder: [18, -31, 0], elbow: 140, hip: [0, 6, 0], knee: 0, ankle: -41 }) },
    ], tempo: [1.2, 1.7], hold: [0.1, 0.4], props: [{ kind: 'lowBar', pos: [0, 0, -0.2] }],
    primary: ['upperBack', 'lats'], secondary: ['biceps', 'rearDelts', 'abs'], view: { yaw: 80, y: 0.6 },
  },
  row_db_bent: {
    keys: [
      { ...sym({ root: { pitch: 55 }, hip: [65, 6, 0], knee: 22, shoulder: [55, 8, 0], elbow: 3 }), neck: -25 },
      { ...sym({ root: { pitch: 55 }, hip: [65, 6, 0], knee: 22, shoulder: [-28, 16, 0], elbow: 88 }), neck: -25 },
    ], tempo: [1.2, 1.8], hold: [0.1, 0.3], ground: true, props: [{ kind: 'hammerDumbbells' }],
    primary: ['upperBack', 'lats'], secondary: ['biceps', 'lowerBack', 'rearDelts'], view: { yaw: 70 },
  },
  rack_pull: {
    keys: [
      { root: { z: -0.03, pitch: 38 }, neck: -17, ...sym({ shoulder: [20, 5, 0], elbow: 3, hip: [54, 6, 2], knee: 26, hipOut: 2 }) },
      { ...sym({ shoulder: [4, 4, 0], elbow: 4, hip: [0, 5, 0] }) },
    ], tempo: [1.2, 1.6], hold: [0.3, 0.3], ground: true,
    props: [{ kind: 'barbell' }, { kind: 'rackPins', pos: [0, 0.655, 0] }], primary: ['lowerBack', 'upperBack', 'glutes'], secondary: ['hamstrings', 'forearms'], view: { yaw: 65 },
  },
  hyperextension: {
    keys: [
      // الرجلين متوازية (بدون إبعاد: الإبعاد مع ثني الحوض يحرك القدمين) وثابتة، والجذع بس ينثني عند الحوض
      { root: { y: 0.98, z: 0.28, pitch: 45 }, neck: -10, ...sym({ shoulder: [40, 12, 0], elbow: 140, hip: [0, 0, 0], knee: 0, ankle: 5 }) },
      { root: { y: 0.98, z: 0.28, pitch: 118 }, neck: -30, ...sym({ shoulder: [40, 12, 0], elbow: 140, hip: [73, 0, 0], knee: 0, ankle: 5 }) },
    ], tempo: [1.4, 1.6], hold: [0.2, 0.3], flatFeet: false, plant: 'both', props: [{ kind: 'hyperBench' }],
    primary: ['lowerBack', 'glutes'], secondary: ['hamstrings'], view: { yaw: 80, y: 0.8 },
  },
  // ---------------- أكتاف ----------------
  band_pull_apart: {
    keys: [sym({ shoulder: [88, 90, 0], elbow: 6, hip: [0, 5, 0] }), sym({ shoulder: [4, 90, 0], elbow: 6, hip: [0, 5, 0] })],
    tempo: [1.1, 1.5], hold: [0.1, 0.4], ground: true, props: [{ kind: 'band' }], primary: ['rearDelts', 'upperBack'], secondary: [], view: { yaw: 25, y: 1.2 },
  },
  push_press: {
    keys: [
      { ...sym({ shoulder: [0, 82, 90], elbow: 100, hip: [0, 4, 0] }) },
      { root: { z: 0.07 }, spine: 2, ...sym({ shoulder: [0, 82, 90], elbow: 100, hip: [22, 6, 0], knee: 55, ankle: -5 }) },
      { ...sym({ shoulder: [0, 168, 90], elbow: 6, hip: [0, 4, 0] }) },
    ], tempo: [0.5, 0.35, 1.4], hold: [0.3, 0, 0.3], ground: true, props: [{ kind: 'barbell' }],
    primary: ['shoulders', 'triceps'], secondary: ['quads', 'glutes', 'upperBack'], view: { yaw: 35, y: 1.1 },
  },
  // ---------------- ذراعين ----------------
  preacher_curl: {
    keys: [
      // العضد ممدود قدام على المسند (٣٠° تحت الأفقي) والإبط فوق طرفه، والكفين للأعلى
      { root: { y: 0.66, z: -0.05 }, spine: 14, neck: -8, ...sym({ shoulder: [74, 11, 0], elbow: 14, roll: 88, hip: [88, 14, 0], knee: 88 }) },
      { root: { y: 0.66, z: -0.05 }, spine: 14, neck: -8, ...sym({ shoulder: [74, 11, 0], elbow: 120, roll: 88, hip: [88, 14, 0], knee: 88 }) },
    ], tempo: [1.1, 1.9], hold: [0.1, 0.4], props: [{ kind: 'ezbar' }, { kind: 'preacherBench' }], rest: ['seat', 'floor'],
    primary: ['biceps'], secondary: ['forearms'], view: { yaw: 70, y: 0.9 },
  },
  wrist_curl: {
    keys: [
      // الساعد على الفخذ والكف للأعلى، والرسغ بس يتحرك
      seated({ spine: 32, neck: -20, ...sym({ shoulder: [54, 9, 3], elbow: 51, roll: 97, wrist: -40 }) }),
      seated({ spine: 32, neck: -20, ...sym({ shoulder: [54, 9, 3], elbow: 51, roll: 97, wrist: 45 }) }),
    ], tempo: [0.9, 1.3], hold: [0.1, 0.3], props: [{ kind: 'dumbbells' }, { kind: 'seat' }], rest: ['seat', 'floor'],
    primary: ['forearms'], secondary: [], view: { yaw: 70, y: 0.7 },
  },
  overhead_cable_triceps: {
    keys: [
      { ...sym({ shoulder: [168, 12, 0], elbow: 140, spine: 22 }), lHip: [30, 6, 0], lKnee: 20, rHip: [-18, 6, 0], rKnee: 8 },
      { ...sym({ shoulder: [168, 12, 0], elbow: 8, spine: 22 }), lHip: [30, 6, 0], lKnee: 20, rHip: [-18, 6, 0], rKnee: 8 },
    ], tempo: [1.2, 1.8], hold: [0.1, 0.3], ground: true, props: [{ kind: 'cableLow', pos: [0, 0.25, -0.75] }],
    primary: ['triceps'], secondary: [], view: { yaw: 75, y: 1.1 },
  },
  // ---------------- أرجل ----------------
  smith_squat: {
    keys: [
      { root: { z: 0 }, ...sym({ shoulder: [-22, 78, 90], elbow: 142, hip: [0, 10, 12], knee: 0, hipOut: 20 }) },
      { root: { z: -0.18 }, spine: 23, neck: -16, ...sym({ shoulder: [-22, 78, 90], elbow: 142, hip: [90, 21, 12], knee: 122, hipOut: 32 }) },
    ], tempo: [1.8, 1.3], hold: [0.3, 0.2], ground: true,
    props: [{ kind: 'smithBar', pos: [0, 0, -0.18] }], primary: ['quads', 'glutes'], secondary: ['hamstrings', 'abs'], view: { yaw: 40 },
  },
  db_squat: {
    keys: [
      { root: { z: 0 }, ...sym({ shoulder: [2, 16, 0], elbow: 4, hip: [0, 10, 12], knee: 0, hipOut: 20 }) },
      // الذراعين متدلية عمودية (الدمبل أفقي جنب الساقين) = ثني الكتف يعادل ميلان الجذع، ومبعدة شوي برا الركب
      { root: { z: -0.17 }, spine: 40, neck: -13, ...sym({ shoulder: [40, 37, 0], elbow: 4, hip: [92, 16, 12], knee: 125, hipOut: 14 }) },
    ], tempo: [1.7, 1.2], hold: [0.3, 0.2], ground: true,
    props: [{ kind: 'hammerDumbbells' }], primary: ['quads', 'glutes'], secondary: ['hamstrings', 'forearms'],
  },
  box_jump: {
    keys: [
      { root: { y: 0.98, z: 0.15 }, ...sym({ shoulder: [10, 8, 0], elbow: 10, hip: [0, 6, 0], knee: 2, ankle: -2 }) },
      { root: { y: 0.72, z: -0.14 }, spine: 30, neck: -15, ...sym({ shoulder: [-45, 8, 0], elbow: 8, hip: [66, 8, 0], knee: 80, ankle: -10 }) },
      { root: { y: 1.37, z: 0.04 }, spine: 10, ...sym({ shoulder: [125, 10, 0], elbow: 10, hip: [78, 8, 0], knee: 95, ankle: 5 }) },
      { root: { y: 1.31, z: 0.38 }, spine: 22, neck: -8, ...sym({ shoulder: [70, 10, 0], elbow: 12, hip: [52, 8, 0], knee: 62, ankle: -10 }) },
      { root: { y: 1.48, z: 0.65 }, ...sym({ shoulder: [8, 8, 0], elbow: 12, hip: [0, 6, 0], knee: 2, ankle: -2 }) },
      { root: { y: 1.48, z: 0.7 }, ...sym({ shoulder: [8, 8, 0], elbow: 12 }), lHip: [0, 6, 0], rHip: [-20, 6, 0], lKnee: 8, rKnee: 50, lAnkle: -8, rAnkle: 10 },
      { root: { y: 0.98, z: 0.17 }, spine: 8, neck: -12, ...sym({ shoulder: [14, 10, 0], elbow: 15 }), lHip: [100, 6, 0], rHip: [-1, 6, 0], lKnee: 95, rKnee: 3, lAnkle: 5, rAnkle: -2 },
      { root: { y: 0.98, z: 0.17 }, spine: 4, ...sym({ shoulder: [10, 10, 0], elbow: 12 }), lHip: [73, 6, 0], rHip: [0, 6, 0], lKnee: 138, rKnee: 4, lAnkle: 10, rAnkle: -4 },
    ], tempo: [0.6, 0.25, 0.3, 0.6, 0.35, 0.5, 0.35, 0.4], hold: [0.3, 0, 0, 0.1, 0.1, 0, 0, 0], flatFeet: false, props: [{ kind: 'plyoBox', pos: [0, 0, 0.64] }],
    primary: ['quads', 'glutes'], secondary: ['calves', 'hamstrings'], view: { yaw: 80, y: 0.9 },
  },
  jump_squat: {
    keys: [
      { root: { y: 0.98 }, ...sym({ shoulder: [10, 10, 0], elbow: 60, hip: [0, 8, 0], knee: 2 }) },
      { root: { y: 0.54, z: -0.17 }, spine: 37, neck: -14, ...sym({ shoulder: [50, 10, 0], elbow: 70, hip: [81, 16, 10], knee: 118 }) },
      { root: { y: 1.22, z: 0 }, ...sym({ shoulder: [-20, 12, 0], elbow: 30, hip: [0, 8, 0], knee: 4, ankle: 18 }) },
    ], tempo: [0.9, 0.35, 0.45], hold: [0.2, 0.05, 0], props: [], primary: ['quads', 'glutes'], secondary: ['calves', 'hamstrings'], view: { yaw: 40, y: 1.0 },
  },
  hip_adduction: {
    // الفخذ المثني يتقفل أفقياً (hipOut)، ومغلق: الركبتين تضغط المسندين لين يتلامسون (ما تقدر تقفل أكثر من سماكتهم)
    keys: [seated({ lHip: [88, 4, 0], rHip: [88, 4, 0], lKnee: 80, rKnee: 80, ...sym({ shoulder: [-14, 20, 0], elbow: 22, hipOut: 36 }) }), seated({ lHip: [88, 4, 0], rHip: [88, 4, 0], lKnee: 80, rKnee: 80, ...sym({ shoulder: [-14, 20, 0], elbow: 22, hipOut: 13 }) })],
    tempo: [1.2, 1.8], hold: [0.1, 0.5], props: [{ kind: 'hipAdduction', pos: [0, 0, -0.05] }], rest: ['seat', 'back'], flatFeet: false, primary: ['quads'], secondary: ['glutes'], view: { yaw: 20, y: 0.8 },
  },
  single_leg_bridge: {
    keys: [
      // الرجل المرفوعة ممدودة والقدم مرتخية (تتبع الساق)
      { root: { y: 0.1, z: 0, pitch: -90 }, neck: -8, ...sym({ shoulder: [-3, 20, 0], elbow: 0, roll: -90 }), lHip: [60, 10, 0], rHip: [45, 8, 0], lKnee: 110, rKnee: 2, rAnkle: 15 },
      { root: { y: 0.32, z: -0.05, pitch: -116 }, spine: -2, neck: 22, ...sym({ shoulder: [-27, 20, 0], elbow: 0, roll: -90 }), lHip: [-2, 10, 0], rHip: [6, 8, 0], lKnee: 108, rKnee: 2, rAnkle: 15 },
    ], tempo: [1.1, 1.6], hold: [0.1, 0.6], props: [{ kind: 'mat' }], rest: ['ground', 'palms'], flatFeet: 'L', grip: 0.3, primary: ['glutes'], secondary: ['hamstrings', 'lowerBack'], view: { yaw: 80, y: 0.35 },
  },
  cable_kickback: {
    keys: [
      // الرجل الشغالة ركبتها مثنية أكثر من الواقفة، فتمر فوق الأرض بدون ما تلمسها (القدم الواقفة ثابتة على الأرض)
      // واقف قدام برج الكيبل ماسك البار بقبضة من فوق
      { root: { pitch: 18 }, spine: 6, lHip: [26, 6, 0], lKnee: 34, lAnkle: -18, rHip: [18, 6, 0], rKnee: 8, ...sym({ shoulder: [62, 12, 0], elbow: 8, roll: -90 }), neck: -8 },
      { root: { pitch: 18 }, spine: 6, lHip: [-22, 6, 0], lKnee: 10, lAnkle: 0, rHip: [18, 6, 0], rKnee: 8, ...sym({ shoulder: [62, 12, 0], elbow: 8, roll: -90 }), neck: -8 },
    ], tempo: [1.1, 1.6], hold: [0.1, 0.5], ground: true, plant: 'R', flatFeet: 'R', props: [{ kind: 'cableAnkle', pos: [0.1, 0.12, 0.75] }],
    primary: ['glutes'], secondary: ['hamstrings'], view: { yaw: 80, y: 0.8 },
  },
  pull_through: {
    keys: [
      { root: { z: 0.01, pitch: 66 }, neck: -25, ...sym({ shoulder: [19, -15, 0], elbow: 3, hip: [97, 31, 35], knee: 60, hipOut: 20 }) },
      { ...sym({ shoulder: [14, 2, 0], elbow: 3, hip: [0, 12, 10], knee: 3 }) },
    ], tempo: [1.3, 1.4], hold: [0.2, 0.4], ground: true, props: [{ kind: 'cableLow', pos: [0, 0.15, -0.95] }],
    primary: ['glutes', 'hamstrings'], secondary: ['lowerBack'], view: { yaw: 80 },
  },
  // ---------------- بطن ----------------
  russian_twist: {
    keys: [
      // الكرة بين الكفين قدام الصدر (فوق الفخذين): الكفين مسطّحة على جنبيها والأصابع للأمام (الرسغ مثني للخلف شوي
      // عشان الأصابع تمشي على سطح الكرة بدل ما تدخل فيها)، والكوعين برا الجذع
      { root: { y: 0.14, pitch: -40 }, neck: 8, twist: 38, ...sym({ shoulder: [4, 8, -16], elbow: 110, roll: 3, wext: 18, hip: [95, 10, 0], knee: 85 }) },
      { root: { y: 0.14, pitch: -40 }, neck: 8, twist: -38, ...sym({ shoulder: [4, 8, -16], elbow: 110, roll: 3, wext: 18, hip: [95, 10, 0], knee: 85 }) },
    ], tempo: [0.8, 0.8], hold: [0.1, 0.1], props: [{ kind: 'medBall' }, { kind: 'mat' }], rest: ['ground'], grip: 0.12, primary: ['abs'], secondary: ['lowerBack'], view: { yaw: 30, y: 0.4 },
  },
  side_plank: {
    keys: [
      { root: { y: 0.41, roll: -75 }, ...sym({ hip: [0, 0, 0], knee: 0, ankle: 0 }), lShoulder: [0, 75, 42], rShoulder: [0, 88, 0], lElbow: 86, rElbow: 4, lRoll: -92, lWext: 5 },
      { root: { y: 0.42, roll: -75 }, ...sym({ hip: [0, 0, 0], knee: 0, ankle: 0 }), lShoulder: [0, 75, 42], rShoulder: [0, 88, 0], lElbow: 86, rElbow: 4, lRoll: -92, lWext: 5 },
    ], tempo: [1.6, 1.6], props: [{ kind: 'matSide', pos: [-0.2, 0, 0.12] }], rest: ['ground'], contacts: ['hands', 'feet'], grip: 0.4, primary: ['abs'], secondary: ['shoulders', 'glutes'], view: { yaw: 10, y: 0.4 },
  },
  bicycle_crunch: {
    keys: [
      { root: FLOOR_SUPINE, spine: 20, chest: 18, twist: 28, lHip: [98, 8, 0], lKnee: 100, rHip: [28, 8, 0], rKnee: 8, lAnkle: 15, rAnkle: 20, ...HANDS_HEAD },
      { root: FLOOR_SUPINE, spine: 20, chest: 18, twist: -28, rHip: [98, 8, 0], rKnee: 100, lHip: [28, 8, 0], lKnee: 8, lAnkle: 20, rAnkle: 15, ...HANDS_HEAD },
    ], tempo: [0.7, 0.7], hold: [0.15, 0.15], props: [{ kind: 'mat' }], rest: ['ground'], flatFeet: false, primary: ['abs'], secondary: [], view: { yaw: 70, y: 0.3 },
  },
  reverse_crunch: {
    keys: [
      { root: { y: 0.11, z: 0, pitch: -90 }, neck: -8, ...sym({ shoulder: [-4, 18, 0], elbow: 0, roll: -90, hip: [90, 8, 0], knee: 95, ankle: 20 }) },
      { root: { y: 0.19, z: 0, pitch: -107 }, spine: 8, neck: 4, ...sym({ shoulder: [-27, 18, 0], elbow: 0, roll: -90, hip: [118, 8, 0], knee: 100, ankle: 20 }) },
    ], tempo: [1.0, 1.5], hold: [0.1, 0.3], props: [{ kind: 'mat' }], rest: ['ground', 'palms'], flatFeet: false, grip: 0.3, primary: ['abs'], secondary: [], view: { yaw: 80, y: 0.3 },
  },
  sit_up: {
    keys: [
      { root: FLOOR_SUPINE, ...sym({ hip: [60, 10, 0], knee: 110, shoulder: [40, 30, 0], elbow: 150 }) },
      { root: { y: 0.15, z: 0.02, pitch: -22 }, spine: 12, ...sym({ hip: [128, 10, 0], knee: 110, shoulder: [40, 30, 0], elbow: 150 }) },
    ], tempo: [1.1, 1.5], hold: [0.1, 0.2], props: [{ kind: 'mat' }], rest: ['ground', 'floor'], primary: ['abs'], secondary: [], view: { yaw: 80, y: 0.35 },
  },
  v_up: {
    keys: [
      { root: FLOOR_SUPINE, ...sym({ hip: [4, 6, 0], knee: 2, ankle: 25, shoulder: [175, 10, 0], elbow: 4 }) },
      { root: { y: 0.12, pitch: -48 }, spine: 12, ...sym({ hip: [96, 6, 0], knee: 4, ankle: 30, shoulder: [110, 10, 0], elbow: 4 }) },
    ], tempo: [0.9, 1.3], hold: [0.1, 0.2], props: [{ kind: 'mat' }], rest: ['ground'], flatFeet: false, primary: ['abs'], secondary: [], view: { yaw: 80, y: 0.35 },
  },
  hanging_leg_raise: {
    keys: [
      { root: { y: 1.12 }, ...sym({ shoulder: [176, -3, 0], elbow: 4, hip: [4, 4, 0], knee: 4, ankle: 20 }) },
      { root: { y: 1.13, z: -0.13 }, spine: 14, ...sym({ shoulder: [185, -3, 0], elbow: 4, hip: [98, 6, 0], knee: 6, ankle: 25 }) },
    ], tempo: [1.3, 1.7], hold: [0.1, 0.3], flatFeet: false, props: [{ kind: 'pullupBar' }], primary: ['abs'], secondary: ['forearms', 'lats'], view: { yaw: 70, y: 1.4 },
  },
  pallof_press: {
    keys: [
      { ...sym({ hip: [8, 12, 0], knee: 14, shoulder: [28, 22, 0], elbow: 118 }) },
      { ...sym({ hip: [8, 12, 0], knee: 14, shoulder: [88, 8, 0], elbow: 4 }) },
    ], tempo: [1.0, 1.4], hold: [0.1, 0.8], ground: true, props: [{ kind: 'cableSide', pos: [0.95, 1.18, 0.25] }],
    primary: ['abs'], secondary: ['shoulders', 'glutes'], view: { yaw: 20, y: 1.0 },
  },
  woodchop: {
    keys: [
      { neck: 10, twist: 45, ...sym({ elbow: 8, hip: [6, 14, 0], knee: 8 }), lShoulder: [122, 5, 4], rShoulder: [128, 44, -5] },
      { spine: 16, twist: -42, ...sym({ elbow: 8, hip: [26, 14, 0], knee: 34 }), lShoulder: [42, -16, -4], rShoulder: [38, -24, -8] },
    ], tempo: [1.0, 1.4], hold: [0.1, 0.3], ground: true, props: [{ kind: 'cableSide', pos: [0.95, 1.95, 0.1] }],
    primary: ['abs'], secondary: ['shoulders', 'glutes'], view: { yaw: 20, y: 1.1 },
  },
  side_bend_db: {
    keys: [
      { lean: 22, ...sym({ elbow: 4, hip: [0, 8, 0] }), lShoulder: [-2, -19, 0], rShoulder: [-2, 25, 0] },
      { lean: -24, ...sym({ elbow: 4, hip: [0, 8, 0] }), lShoulder: [-2, 27, 0], rShoulder: [-2, -21, 0] },
    ], tempo: [1.2, 1.4], hold: [0.1, 0.3], ground: true, props: [{ kind: 'dumbbellR' }], primary: ['abs'], secondary: ['lowerBack'], view: { yaw: 5, y: 1.0 },
  },
  flutter_kicks: {
    keys: [
      { root: FLOOR_SUPINE, spine: 8, neck: 18, lHip: [28, 6, 0], rHip: [10, 6, 0], lKnee: 2, rKnee: 2, ...sym({ shoulder: [-12, 18, 0], elbow: 0, roll: -90, ankle: 30 }) },
      { root: FLOOR_SUPINE, spine: 8, neck: 18, lHip: [10, 6, 0], rHip: [28, 6, 0], lKnee: 2, rKnee: 2, ...sym({ shoulder: [-12, 18, 0], elbow: 0, roll: -90, ankle: 30 }) },
    ], tempo: [0.4, 0.4], props: [{ kind: 'mat' }], rest: ['ground', 'palms'], flatFeet: false, grip: 0.3, primary: ['abs'], secondary: ['quads'], view: { yaw: 75, y: 0.3 },
  },
  // ---------------- خريطة العضلات (للتمارين اللي ما لها حركة خاصة بعد) ----------------
  muscle_map: {
    keys: [sym({ shoulder: [2, 14, 0], elbow: 8, hip: [0, 5, 0] }), { ...sym({ shoulder: [2, 15, 0], elbow: 9, hip: [0, 5, 0] }), chest: -2 }],
    tempo: [2.2, 2.2], ground: true, props: [], primary: [], secondary: [], view: { yaw: 20, y: 1.0 },
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
    if (x < dur) {
      const a = m.keys[i]; const b = m.keys[(i + 1) % n];
      const f = m.flow ? x / dur : ease(x / dur);
      const p = lerpPose(a, b, f);
      // الكتف والرسغ: أقصر دوران بين الوضعيتين (حركة طبيعية بدون لفّ زايد)
      p.q = slerpQuats(poseQuats(a), poseQuats(b), f);
      return p;
    }
    x -= dur;
  }
  return m.keys[0];
}

// ---------------------------------------------------------------------------
// الأرضية: للحركات اللي ما تستخدم ground (قفز، بيربي، ...) نمنع القدم تدخل الأرض أو سطح الصندوق
// ---------------------------------------------------------------------------
const floors = new WeakMap<Motion, FloorFn>();
export function floorFor(m: Motion): FloorFn | undefined {
  if (m.ground) return undefined;
  let f = floors.get(m);
  if (!f) {
    const tops: { x: number; z: number; hx: number; hz: number; top: number }[] = [];
    for (const p of m.props) {
      if (p.kind === 'plyoBox') tops.push({ x: p.pos?.[0] ?? 0, z: p.pos?.[2] ?? 0, hx: 0.3, hz: 0.25, top: 0.5 });
      if (p.kind === 'step') tops.push({ x: p.pos?.[0] ?? 0, z: p.pos?.[2] ?? 0, hx: 0.25, hz: 0.21, top: 0.2 });
      // المات (سماكته ١.٨ سم): القدم ما تغوص فيه بين عينات الملاءمة
      if (p.kind === 'mat') tops.push({ x: p.pos?.[0] ?? 0, z: p.pos?.[2] ?? 0, hx: 0.35, hz: 0.95, top: 0.018 });
      if (p.kind === 'matSide') tops.push({ x: p.pos?.[0] ?? 0, z: p.pos?.[2] ?? 0, hx: 0.95, hz: 0.35, top: 0.018 });
    }
    f = (x, z) => {
      let h = 0;
      for (const b of tops) if (Math.abs(x - b.x) <= b.hx && Math.abs(z - b.z) <= b.hz) h = Math.max(h, b.top);
      return h;
    };
    floors.set(m, f);
  }
  return f;
}

const opts = new WeakMap<Motion, PoseOpts>();
/** خيارات تطبيق الوضعية لهذه الحركة (محفوظة لكل حركة) */
export function poseOpts(m: Motion): PoseOpts {
  let o = opts.get(m);
  if (!o) {
    // الوقوف: القدمين ثابتة بشكل افتراضي. بدون ground (قدمين على جهاز) بس إذا انكتب plant — وإذا القدمين على الأرض
    // والجسم على جهاز (هيب ثرست) الملاءمة تحل الرجلين بدل ما يتحرك الجسم كامل (يخرّب ارتكازه)
    const side = m.plant === 'none' ? undefined : m.ground ? m.plant ?? 'both' : m.rest?.includes('floor') ? undefined : m.plant;
    const plant = side ? { side, key0: m.keys[0] } as const : undefined;
    o = { ground: m.ground, flatFeet: m.flatFeet, plant: plant ? { ...plant } : undefined };
    opts.set(m, o);
  }
  return o;
}
