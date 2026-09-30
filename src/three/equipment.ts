// أجهزة ومعدات النادي حول المجسّم (بنفس لغة التصميم: حديد رمادي فاتح، مساند داكنة، أوزان سوداء)
// الألوان مختارة لتتباين مع الخلفية الكريمية ومع ملابس اللاعب الداكنة، والأجهزة الثابتة (برج الأوزان، البكرات)
// توضع بعيداً عن جهة الكاميرا (+X = يسار اللاعب) حتى لا تغطي الحركة.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PropSpec, PropsRuntime, Rig, Support, SupportRole } from './rig';

export const EQUIP_COLORS = {
  steel: '#AEB8B4',
  steelDark: '#6E7B76',
  chrome: '#DDE2E0',
  pad: '#22302B',
  plate: '#1B2120',
  cable: '#2A3531',
  floor: '#0A332D',
  shadow: '#0A1F1A',
};

const D = THREE.MathUtils.degToRad;
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(); const _b = new THREE.Vector3(); const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();

type V3 = [number, number, number];

function mats() {
  const std = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, ...o });
  return {
    steel: std(EQUIP_COLORS.steel, { metalness: 0.12, roughness: 0.42 }),
    steelDark: std(EQUIP_COLORS.steelDark, { metalness: 0.1, roughness: 0.5 }),
    chrome: std(EQUIP_COLORS.chrome, { metalness: 0.35, roughness: 0.22 }),
    pad: std(EQUIP_COLORS.pad, { roughness: 0.75, metalness: 0 }),
    plate: std(EQUIP_COLORS.plate, { roughness: 0.5, metalness: 0.15 }),
    cable: std(EQUIP_COLORS.cable, { roughness: 0.6 }),
  };
}
type Mats = ReturnType<typeof mats>;

// ------------------------------------------------------------------ أشكال أساسية
function rbox(w: number, h: number, d: number, m: THREE.Material, pos: V3, r = 0.025) {
  const rr = Math.max(0.002, Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002));
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, rr), m);
  mesh.position.set(...pos);
  return mesh;
}
/** يعلّم مسند كسطح يرتكز عليه اللاعب (face = وجه المسند: y = الوجه العلوي، z = الوجه الأمامي) */
function support<T extends THREE.Mesh>(mesh: T, role: SupportRole, face: 'y' | 'z' = 'y'): T {
  mesh.userData.support = { role, face };
  return mesh;
}
function box(w: number, h: number, d: number, m: THREE.Material, pos: V3) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(...pos);
  return mesh;
}
/** أنبوب طوله 1 على محور Y — نمطّه بين نقطتين بـ setTube */
function tube(r: number, m: THREE.Material, seg = 12) {
  return new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, seg), m);
}
const _tubeD = new THREE.Vector3();
function setTube(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  // متغير خاص (a أو b ممكن يكونون من المتغيرات المؤقتة المشتركة _a/_b/_c)
  _tubeD.copy(b).sub(a);
  const len = Math.max(0.001, _tubeD.length());
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, _tubeD.multiplyScalar(1 / len));
  mesh.scale.set(1, len, 1);
}
function tubeAB(a: V3, b: V3, r: number, m: THREE.Material) {
  const t = tube(r, m);
  setTube(t, new THREE.Vector3(...a), new THREE.Vector3(...b));
  return t;
}
function disc(r: number, thick: number, m: THREE.Material, seg = 28) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, thick, seg), m);
  c.rotation.z = Math.PI / 2; // المحور على X
  return c;
}

// ------------------------------------------------------------------ أدوات حرة
export function makeBarbell(M: Mats, len = 1.9, plateR = 0.225) {
  const g = new THREE.Group();
  const shaft = tube(0.014, M.chrome); shaft.rotation.z = Math.PI / 2; shaft.scale.set(1, len, 1); g.add(shaft);
  for (const s of [1, -1]) {
    const x = s * (len / 2 - 0.26);
    const big = disc(plateR, 0.055, M.plate, 32); big.position.x = x; g.add(big);
    const small = disc(plateR * 0.62, 0.04, M.plate, 28); small.position.x = x + s * 0.05; g.add(small);
    const hub = disc(0.03, 0.14, M.chrome, 16); hub.position.x = x + s * 0.02; g.add(hub);
    const collar = disc(0.028, 0.03, M.steelDark, 16); collar.position.x = x - s * 0.06; g.add(collar);
    const sleeve = disc(0.025, 0.36, M.chrome, 14); sleeve.position.x = s * (len / 2 - 0.18); g.add(sleeve);
  }
  return g;
}

export function makeDumbbell(M: Mats, len = 0.34) {
  const g = new THREE.Group();
  const h = tube(0.016, M.chrome); h.rotation.z = Math.PI / 2; h.scale.set(1, len, 1); g.add(h);
  for (const s of [1, -1]) {
    // رؤوس سداسية (Hex) — شكل الدمبل المعروف
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.085, 6), M.plate);
    head.rotation.z = Math.PI / 2; head.position.x = s * (len / 2 - 0.02);
    g.add(head);
  }
  return g;
}

// ------------------------------------------------------------------ مقاعد وبنشات
function flatBench(M: Mats, w = 0.3, len = 1.15, h = 0.44, role: SupportRole = 'bench') {
  const g = new THREE.Group();
  g.add(support(rbox(w, 0.08, len, M.pad, [0, h - 0.04, 0], 0.03), role));
  g.add(tubeAB([0, h - 0.11, -len / 2 + 0.12], [0, h - 0.11, len / 2 - 0.12], 0.028, M.steel));
  for (const z of [-len / 2 + 0.12, len / 2 - 0.12]) {
    g.add(tubeAB([0, h - 0.11, z], [0, 0.03, z], 0.026, M.steel));
    g.add(tubeAB([-0.22, 0.025, z], [0.22, 0.025, z], 0.025, M.steelDark));
  }
  return g;
}

/**
 * بنش قابل للتعديل (مثل بنشات الأندية): مقعد مائل قليلاً للأمام، ومسند ظهر طويل يبدأ من ورا المقعد مباشرة
 * ويرتفع للخلف بزاوية `angle` من الأرض، وهيكل: عمود أرضي بقاعدتين، عمود تحت المقعد، ودعامة تحت المسند.
 * اللاعب يواجه +Z، فالمسند يرتفع باتجاه −Z (ورا ظهره). يرجع المقعد والمسند كسطوح جلوس/إسناد للاعب.
 */
function adjustableBench(M: Mats, angle = 38) {
  const g = new THREE.Group();
  const padW = 0.29, padT = 0.075, seatLen = 0.36, backLen = 0.88;
  const a = D(angle), st = D(5);
  // خط التقاء سطح المقعد بسطح المسند (المفصل) — ارتفاع يخلي القدمين على الأرض (رجل وامرأة)
  const H = new THREE.Vector3(0, 0.37, 0);
  const u = new THREE.Vector3(0, Math.sin(a), -Math.cos(a));   // على طول المسند للأعلى (للخلف)
  const n = new THREE.Vector3(0, Math.cos(a), Math.sin(a));    // وجه المسند (باتجاه ظهر اللاعب)
  const sDir = new THREE.Vector3(0, Math.sin(st), Math.cos(st)); // على طول المقعد للأمام (مرفوع قليلاً)
  const sN = new THREE.Vector3(0, Math.cos(st), -Math.sin(st));

  const seat = rbox(padW, padT, seatLen, M.pad, [0, 0, 0], 0.03);
  seat.position.copy(H).addScaledVector(sDir, 0.02 + seatLen / 2).addScaledVector(sN, -padT / 2);
  seat.rotation.x = -st;
  const back = rbox(padW, padT, backLen, M.pad, [0, 0, 0], 0.03);
  back.position.copy(H).addScaledVector(u, 0.025 + backLen / 2).addScaledVector(n, -padT / 2);
  back.rotation.x = a;
  g.add(support(seat, 'seat'), support(back, 'back'));

  // لوح حديد تحت كل مسند (مثل الأجهزة الحقيقية)
  const under = (pad: THREE.Mesh, len: number, nn: THREE.Vector3) => {
    const b = box(0.07, 0.025, len - 0.08, M.steelDark, [0, 0, 0]);
    b.position.copy(pad.position).addScaledVector(nn, -padT / 2 - 0.012);
    b.rotation.copy(pad.rotation);
    g.add(b);
  };
  under(seat, seatLen, sN);
  under(back, backLen, n);

  // الهيكل: عمود أرضي من القاعدة الأمامية للخلفية
  const zF = 0.24, zB = -0.86, yB = 0.1;
  g.add(box(0.075, 0.075, zF - zB, M.steel, [0, yB, (zF + zB) / 2]));
  for (const z of [zF, zB]) {
    g.add(tubeAB([-0.26, 0.035, z], [0.26, 0.035, z], 0.032, M.steelDark));
    for (const x of [-0.26, 0.26]) g.add(rbox(0.07, 0.03, 0.07, M.pad, [x, 0.015, z], 0.01));
  }
  g.add(tubeAB([0, yB, zF], [0, 0.035, zF], 0.03, M.steel));
  g.add(tubeAB([0, yB, zB], [0, 0.035, zB], 0.03, M.steel));
  // عمود المقعد والمفصل
  const seatUnder = seat.position.clone().addScaledVector(sN, -padT / 2 - 0.025);
  const hinge = H.clone().addScaledVector(n, -padT - 0.03).addScaledVector(sN, -0.01);
  g.add(tubeAB([0, yB, seatUnder.z], [0, seatUnder.y, seatUnder.z], 0.034, M.steel));
  g.add(tubeAB([0, seatUnder.y - 0.06, seatUnder.z], [0, hinge.y, hinge.z], 0.028, M.steel));
  const pin = tube(0.022, M.chrome); pin.rotation.z = Math.PI / 2; pin.scale.set(1, 0.12, 1); pin.position.copy(hinge); g.add(pin);
  // دعامة المسند من العمود الأرضي (سلّم التعديل) إلى تحت منتصف المسند
  const backUnder = H.clone().addScaledVector(u, 0.025 + backLen * 0.52).addScaledVector(n, -padT - 0.02);
  const foot = new THREE.Vector3(0, yB + 0.04, backUnder.z + 0.16);
  g.add(tubeAB([0, foot.y, foot.z], [0, backUnder.y, backUnder.z], 0.026, M.steel));
  g.add(box(0.05, 0.03, 0.42, M.steelDark, [0, yB + 0.05, foot.z - 0.02]));
  return { g, seat, back };
}

/** مقعد بمسند ظهر (للدمبل جلوس ولأجهزة الضغط) */
function seatUnit(M: Mats, o: { h?: number; back?: boolean; backH?: number; tilt?: number } = {}) {
  // سطح المقعد على ٤١ سم: القدمين على الأرض والفخذ أفقي تقريباً (للنموذجين)
  const h = o.h ?? 0.37;
  const g = new THREE.Group();
  g.add(support(rbox(0.38, 0.08, 0.38, M.pad, [0, h, 0], 0.035), 'seat'));
  g.add(tubeAB([0, h - 0.04, 0], [0, 0.04, 0], 0.03, M.steel));
  // قاعدة على شكل T (ضيقة قدام عشان القدمين على الأرض مو فوق الحديد)
  g.add(rbox(0.44, 0.04, 0.08, M.steelDark, [0, 0.02, -0.02], 0.012));
  g.add(rbox(0.08, 0.04, 0.34, M.steelDark, [0, 0.02, -0.17], 0.012));
  if (o.back !== false) {
    const bh = o.backH ?? 0.7;
    const back = rbox(0.36, bh, 0.08, M.pad, [0, h + 0.05 + bh / 2, -0.22], 0.035);
    back.rotation.x = D(-(o.tilt ?? 8));
    g.add(support(back, 'back', 'z'));
    g.add(tubeAB([0, h - 0.05, -0.02], [0, h + 0.2, -0.3], 0.026, M.steel));
  }
  return g;
}

// ------------------------------------------------------------------ برج الأوزان والكيبل
/** برج أوزان (صفائح + قضبان توجيه) — facing: اتجاه وجه الصفائح */
function weightStack(M: Mats, pos: V3, height = 2.1, rotY = 0, halfW = 0.22) {
  const g = new THREE.Group();
  g.position.set(...pos); g.rotation.y = rotY;
  for (const x of [-halfW, halfW]) g.add(tubeAB([x, 0.02, 0], [x, height, 0], 0.03, M.steel));
  g.add(tubeAB([-halfW, height, 0], [halfW, height, 0], 0.03, M.steel));
  g.add(rbox(halfW * 2 + 0.12, 0.05, 0.36, M.steelDark, [0, 0.025, 0], 0.015));
  for (const x of [-0.08, 0.08]) g.add(tubeAB([x, 0.05, 0], [x, height - 0.05, 0], 0.008, M.chrome));
  const n = 12;
  for (let i = 0; i < n; i++) g.add(box(0.3, 0.036, 0.12, M.plate, [0, 0.09 + i * 0.042, 0]));
  g.add(box(0.3, 0.03, 0.12, M.chrome, [0, 0.09 + n * 0.042 + 0.01, 0]));
  return g;
}

/** محطة كيبل: عمود بأوزان بجانب نقطة الكيبل (بعيد عن الكاميرا) + ذراع أفقي + بكرة */
function cableStation(M: Mats, anchor: THREE.Vector3, side: 1 | -1 = 1, offset = 0.5) {
  const g = new THREE.Group();
  const colX = anchor.x + side * offset;
  const h = Math.max(2.15, anchor.y + 0.25);
  g.add(weightStack(M, [colX, 0, anchor.z], h, Math.PI / 2));
  if (offset > 0.15) {
    // ذراع من العمود إلى البكرة
    g.add(tubeAB([colX, anchor.y, anchor.z], [anchor.x, anchor.y, anchor.z], 0.03, M.steel));
  }
  const pulley = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 8, 18), M.steelDark);
  pulley.position.copy(anchor); pulley.rotation.y = Math.PI / 2;
  g.add(pulley);
  return g;
}

// ------------------------------------------------------------------ الأرضية والظل
function shadowTexture() {
  const s = 64; const data = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (x + 0.5) / s * 2 - 1; const dy = (y + 0.5) / s * 2 - 1;
    const r = Math.sqrt(dx * dx + dy * dy);
    const a = Math.max(0, 1 - r); const i = (y * s + x) * 4;
    data[i] = 10; data[i + 1] = 31; data[i + 2] = 26; data[i + 3] = Math.round(255 * a * a * 0.55);
  }
  const t = new THREE.DataTexture(data, s, s, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
}

/** أرضية دائرية بلون الهوية */
export function createFloor() {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 48),
    new THREE.MeshStandardMaterial({ color: EQUIP_COLORS.floor, transparent: true, opacity: 0.09 }),
  );
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.001;
  g.add(disc);
  return g;
}

// ------------------------------------------------------------------ الأدوات حسب التمرين
/** ينشئ الأدوات. الأدوات الممسوكة والأجزاء المتحركة تتبع جسم اللاعب في كل إطار */
export function createProps(rig: Rig, specs: PropSpec[]): PropsRuntime {
  const M = mats();
  const group = new THREE.Group();
  const updaters: (() => void)[] = [];

  // ظل ناعم تحت اللاعب (يعطي إحساس بالعمق والأرض)
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 32),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.003; shadow.renderOrder = -1;
  shadow.userData.shadow = true;
  group.add(shadow);
  updaters.push(() => {
    rig.root.getWorldPosition(_a);
    shadow.position.x = _a.x; shadow.position.z = _a.z;
    const hgt = Math.max(0, _a.y);
    shadow.scale.setScalar(1 + Math.min(0.6, Math.max(0, hgt - 0.9) * 0.4));
  });

  const grip = (S: Rig['L'], out: THREE.Vector3) => S.grip.getWorldPosition(out);
  const midHands = (out: THREE.Vector3) => {
    grip(rig.L, _a); grip(rig.R, _b);
    return out.copy(_a).add(_b).multiplyScalar(0.5);
  };

  /** كيبل متحرك من بكرة ثابتة إلى اليد + محطة الكيبل + مقبض */
  const cable = (anchor: THREE.Vector3, target: () => THREE.Vector3, o: { side?: 1 | -1; offset?: number; handle?: boolean; station?: boolean; bar?: boolean } = {}) => {
    if (o.station !== false) group.add(cableStation(M, anchor, o.side ?? 1, o.offset ?? 0.5));
    const wire = tube(0.0065, M.cable, 6);
    group.add(wire);
    const handle = o.handle === false || o.bar ? null : new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.013, 8, 16), M.steelDark);
    if (handle) group.add(handle);
    // بار قصير بين اليدين (للبوش داون والكيرل بالكيبل)
    const bar = o.bar ? tube(0.015, M.chrome) : null;
    const grips = o.bar ? [tube(0.02, M.pad), tube(0.02, M.pad)] : [];
    if (bar) group.add(bar, ...grips);
    updaters.push(() => {
      const p = target();
      setTube(wire, anchor, p);
      if (handle) { handle.position.copy(p); handle.lookAt(anchor); }
      if (bar) {
        grip(rig.L, _a); grip(rig.R, _b);
        _c.copy(_b).sub(_a).normalize();
        const e1 = _a.clone().addScaledVector(_c, -0.07); const e2 = _b.clone().addScaledVector(_c, 0.07);
        setTube(bar, e1, e2);
        setTube(grips[0], _a.clone().addScaledVector(_c, -0.06), _a.clone().addScaledVector(_c, 0.06));
        setTube(grips[1], _b.clone().addScaledVector(_c, -0.06), _b.clone().addScaledVector(_c, 0.06));
      }
    });
  };

  /** ذراع جهاز (رافعة) من محور ثابت خارج جسم اللاعب إلى مقبض في يده */
  const leverArm = (S: Rig['L'], pivot: THREE.Vector3) => {
    const arm = tube(0.028, M.steel); group.add(arm);
    const link = tube(0.022, M.steel); group.add(link);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), M.steelDark); hub.position.copy(pivot); group.add(hub);
    const handle = tube(0.021, M.pad); group.add(handle);
    const j = new THREE.Vector3();
    updaters.push(() => {
      grip(S, _a);
      const out = Math.sign(pivot.x) || 1;
      j.set(_a.x + out * 0.13, _a.y, _a.z);
      setTube(arm, pivot, j);
      setTube(link, j, _a);
      // المقبض على عرض الكف (يتبع اتجاه القبضة)
      S.wrist.getWorldQuaternion(_q);
      _b.set(0, 0, 0.09).applyQuaternion(_q).add(_a); _c.set(0, 0, -0.09).applyQuaternion(_q).add(_a);
      setTube(handle, _c, _b);
    });
  };

  for (const s of specs) {
    const pos: V3 = s.pos ?? [0, 0, 0];
    switch (s.kind) {
      case 'barbell':
      case 'ezbar':
      case 'latBar': {
        const bar = s.kind === 'barbell' ? makeBarbell(M) : s.kind === 'ezbar' ? makeBarbell(M, 1.25, 0.14) : (() => {
          const g = new THREE.Group();
          const b = tube(0.016, M.chrome); b.rotation.z = Math.PI / 2; b.scale.set(1, 1.2, 1); g.add(b);
          for (const x of [-0.6, 0.6]) { const e = tube(0.02, M.pad); e.rotation.z = Math.PI / 2 + (x > 0 ? -0.35 : 0.35); e.scale.set(1, 0.18, 1); e.position.set(x * 0.92, -0.03, 0); g.add(e); }
          return g;
        })();
        group.add(bar);
        updaters.push(() => {
          grip(rig.L, _a); grip(rig.R, _b);
          bar.position.copy(_a).add(_b).multiplyScalar(0.5);
          _c.copy(_b).sub(_a).normalize();
          _q.setFromUnitVectors(new THREE.Vector3(-1, 0, 0), _c);
          bar.quaternion.copy(_q);
        });
        if (s.kind === 'latBar') cable(new THREE.Vector3(0, 2.35, 0.1), () => midHands(new THREE.Vector3()), { offset: 0.55, handle: false });
        break;
      }
      case 'barbellBack': {
        const bar = makeBarbell(M); group.add(bar);
        updaters.push(() => {
          rig.barOnBack.getWorldPosition(_a); bar.position.copy(_a);
          rig.chest.getWorldQuaternion(_q); bar.quaternion.copy(_q);
        });
        break;
      }
      case 'dumbbells':
      case 'hammerDumbbells':
      case 'dumbbellR': {
        const sides = s.kind === 'dumbbellR' ? [rig.R] : [rig.L, rig.R];
        // المقبض يمر بعرض الكف داخل القبضة (محور Z للرسغ). اتجاه الكف (متقابلين/للأمام/للخلف) من لفّ الساعد بالوضعية
        for (const S of sides) {
          const db = makeDumbbell(M); group.add(db);
          updaters.push(() => {
            grip(S, _a); db.position.copy(_a);
            S.wrist.getWorldQuaternion(_q); db.quaternion.copy(_q);
            db.rotateY(Math.PI / 2);
          });
        }
        break;
      }
      case 'goblet': {
        const db = makeDumbbell(M, 0.3); group.add(db);
        updaters.push(() => {
          midHands(_a); db.position.copy(_a); db.position.y -= 0.15; db.position.addScaledVector(new THREE.Vector3(0, 0, 1), 0.03);
          db.rotation.set(0, 0, Math.PI / 2);
        });
        break;
      }
      case 'dumbbellOverhead': {
        // ترايسبس فوق الرأس: دمبل واحد عمودي، رأسه العلوي بين الكفين وجسمه متدلي تحتها (أقصر شوي عشان يعدّي فوق الرأس)
        const len = 0.22;
        const db = makeDumbbell(M, len); group.add(db);
        updaters.push(() => {
          midHands(_a); db.position.copy(_a); db.position.y += 0.035 - (len / 2 - 0.02);
          db.rotation.set(0, 0, Math.PI / 2);
        });
        break;
      }
      case 'dumbbellHips': {
        // دمبل على مفصل الحوض (هيب ثرست): بالعرض والكفين على رأسيه من فوق
        const db = makeDumbbell(M, 0.3); group.add(db);
        const X1 = new THREE.Vector3(1, 0, 0);
        updaters.push(() => {
          grip(rig.L, _a); grip(rig.R, _b);
          _c.copy(_a).sub(_b).normalize();
          db.position.copy(_a).add(_b).multiplyScalar(0.5); db.position.y -= 0.08;
          db.quaternion.setFromUnitVectors(X1, _c);
        });
        break;
      }
      case 'dumbbellPullover': {
        // دمبل واحد بالكفين (بول أوفر / ترايسبس فوق الرأس): الكفين حول المقبض تحت الرأس العلوي مباشرة (يسندونه من تحت)،
        // والدمبل على امتداد الساعدين. دمبل أقصر شوي: رأسه الثاني يعدّي فوق الوجه والرأس بدل ما يلمسها
        const db = makeDumbbell(M, 0.25); group.add(db);
        const X1 = new THREE.Vector3(1, 0, 0);
        updaters.push(() => {
          midHands(_a);
          rig.L.elbow.getWorldPosition(_b); rig.R.elbow.getWorldPosition(_c);
          _b.add(_c).multiplyScalar(0.5).sub(_a).normalize();
          db.position.copy(_a).addScaledVector(_b, 0.042);
          db.quaternion.setFromUnitVectors(X1, _b);
        });
        break;
      }
      case 'bench': case 'benchSideRow': {
        const b = flatBench(M); b.position.set(...pos); group.add(b); break;
      }
      case 'benchBehind': {
        // بنش بالعرض ورا اللاعب (جنبه الطويل ورا ظهره): أعلى الظهر على حافته بالهيب ثرست، والكفين على حافته بالديبس
        const b = flatBench(M); b.position.set(...pos); b.rotation.y = Math.PI / 2; group.add(b); break;
      }
      case 'benchRear': {
        // بنش ورا اللاعب للقدم الخلفية (سكوات بلغاري): سطحه أرضية مرتفعة ينحط عليها ظهر القدم
        const b = flatBench(M, 0.3, 1.15, 0.44, 'mat'); b.position.set(...pos); group.add(b); break;
      }
      case 'benchPress': {
        // بنش + حامل البار عند جهة الرأس
        const b = flatBench(M); b.position.set(...pos); group.add(b);
        const zr = pos[2] - 0.42;
        for (const x of [-0.56, 0.56]) {
          group.add(tubeAB([x, 0.03, zr], [x, 1.18, zr], 0.03, M.steel));
          group.add(tubeAB([x - 0.16, 0.025, zr], [x + 0.16, 0.025, zr], 0.028, M.steelDark));
          group.add(rbox(0.05, 0.05, 0.1, M.steelDark, [x, 1.02, zr + 0.05], 0.01));
        }
        break;
      }
      case 'step': {
        group.add(support(rbox(0.5, 0.2, 0.42, M.pad, [pos[0], 0.1, pos[2]], 0.03), 'mat')); break;
      }
      case 'inclineBench': { const { g } = adjustableBench(M); g.position.set(...pos); group.add(g); break; }
      case 'seat': case 'seatBack': {
        // pos[1] = رفع سطح المقعد (المقعد نفسه على الأرض)
        const g = seatUnit(M, { back: s.kind === 'seatBack', h: 0.37 + pos[1] }); g.position.set(pos[0], 0, pos[2]); group.add(g); break;
      }
      case 'chestPress': case 'shoulderPress': {
        const g = seatUnit(M, { backH: 0.78, tilt: s.kind === 'chestPress' ? 12 : 6 }); g.position.set(...pos); group.add(g);
        // هيكل خلفي + برج أوزان خلف المسند
        const zb = pos[2] - 0.5;
        group.add(weightStack(M, [pos[0], 0, zb - 0.1], 1.85));
        for (const x of [-0.5, 0.5]) {
          group.add(tubeAB([x, 0.03, zb], [x, 1.55, zb], 0.034, M.steel));
          group.add(tubeAB([x, 0.03, zb], [x, 0.03, pos[2] + 0.35], 0.03, M.steelDark));
        }
        group.add(tubeAB([-0.5, 1.55, zb], [0.5, 1.55, zb], 0.034, M.steel));
        const py = s.kind === 'chestPress' ? 1.42 : 0.95;
        leverArm(rig.L, new THREE.Vector3(pos[0] + 0.5, py, zb + 0.04));
        leverArm(rig.R, new THREE.Vector3(pos[0] - 0.5, py, zb + 0.04));
        break;
      }
      case 'hipAbduction': case 'hipAdduction': {
        // المساند على جنب الركبة (برا للإبعاد، جوا للتقريب)، موازية للفخذ وتلف معه
        // المقعد أعلى شوي: القدمين على مساند الجهاز فوق الأرض
        const g = seatUnit(M, { h: 0.5, backH: 0.7, tilt: 14 }); g.position.set(...pos); group.add(g);
        group.add(weightStack(M, [pos[0], 0, pos[2] - 0.6], 1.6));
        const inner = s.kind === 'hipAdduction';
        // مقابض على جنب المقعد تحت الكفين
        const grips = [tube(0.018, M.pad), tube(0.018, M.pad)]; const gripPosts = [tube(0.02, M.steel), tube(0.02, M.steel)];
        group.add(...grips, ...gripPosts);
        let gripsSet = false;
        updaters.push(() => {
          if (gripsSet) return;
          gripsSet = true;
          [rig.L, rig.R].forEach((S, i) => {
            grip(S, _a);
            setTube(grips[i], _a.clone().add(new THREE.Vector3(0, 0, -0.07)), _a.clone().add(new THREE.Vector3(0, 0, 0.07)));
            setTube(gripPosts[i], _a.clone().add(new THREE.Vector3(0, -0.02, -0.06)), new THREE.Vector3(Math.sign(_a.x) * 0.17 + pos[0], 0.47, _a.z - 0.06));
          });
        });
        for (const S of [rig.L, rig.R]) {
          const padM = rbox(0.07, 0.18, 0.2, M.pad, [0, 0, 0], 0.03); group.add(padM);
          const arm = tube(0.025, M.steel); group.add(arm);
          const piv = new THREE.Vector3(pos[0], 0.28, pos[2] + 0.1);
          const dir = new THREE.Vector3(); const side = new THREE.Vector3();
          updaters.push(() => {
            S.knee.getWorldPosition(_a); S.hip.getWorldPosition(_b);
            dir.copy(_a).sub(_b).setY(0).normalize();                    // الفخذ على الأرض (أفقي)
            side.set(dir.z, 0, -dir.x);                                   // عمودي عليه أفقياً
            const out = Math.sign(_a.x - pos[0]) || 1;
            if (Math.sign(side.x) !== out) side.negate();                 // برا الجسم
            if (inner) side.negate();
            // على جنب الركبة (أنحف مكان بالرجل): نص قطر الركبة + نص سماكة المسند
            padM.position.copy(_a).addScaledVector(dir, -0.01).addScaledVector(side, 0.1);
            padM.position.y += 0.03;
            padM.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
            setTube(arm, piv, new THREE.Vector3(padM.position.x, 0.28, padM.position.z));
          });
          // مسند القدم على ذراع الجهاز (يتحرك مع الرجل): لوح تحت النعل وعمود من الذراع
          const foot = rbox(0.11, 0.025, 0.26, M.steelDark, [0, 0, 0], 0.008); group.add(foot);
          const footPost = tube(0.02, M.steel); const footLink = tube(0.02, M.steel); group.add(footPost, footLink);
          updaters.push(() => {
            S.toe.getWorldPosition(_a); S.heel.getWorldPosition(_b);
            foot.position.copy(_a).add(_b).multiplyScalar(0.5);
            S.ankle.getWorldQuaternion(_q);
            foot.quaternion.copy(_q);
            foot.position.add(_c.set(0, -0.0145, 0.02).applyQuaternion(_q));
            // عمود من تحت المسند للأسفل، ووصلة قريبة من الأرض لمحور الجهاز تحت المقعد (تلف معه)
            const under = foot.position.clone().add(_c.set(0, -0.012, -0.03).applyQuaternion(_q));
            const low = new THREE.Vector3(under.x, 0.035, under.z);
            setTube(footPost, under, low);
            setTube(footLink, low, new THREE.Vector3(pos[0], 0.035, pos[2] + 0.1));
          });
        }
        break;
      }
      case 'latMachine': {
        const g = seatUnit(M, { back: false }); g.position.set(...pos); group.add(g);
        // مساند الفخذ فوق الركب (على الفخذ نفسه)، وعمودها قدام الركب
        const rolls = [disc(0.055, 0.16, M.pad, 16), disc(0.055, 0.16, M.pad, 16)]; group.add(...rolls);
        const postT = tube(0.026, M.steel); const axle = tube(0.018, M.steel); group.add(postT, axle);
        let setL = false;
        updaters.push(() => {
          if (setL) return;
          setL = true;
          [rig.L, rig.R].forEach((S, i) => {
            S.knee.getWorldPosition(_a); S.hip.getWorldPosition(_b);
            const along = _a.clone().sub(_b).normalize();
            rolls[i].position.copy(_a).addScaledVector(along, -0.1).add(new THREE.Vector3(0, 0.135, 0));
          });
          const c = rolls[0].position.clone().add(rolls[1].position).multiplyScalar(0.5);
          setTube(axle, rolls[0].position, rolls[1].position);
          setTube(postT, new THREE.Vector3(c.x, 0.04, c.z + 0.16), new THREE.Vector3(c.x, c.y, c.z + 0.02));
        });
        break;
      }
      case 'pullupBar': case 'dipBars': {
        const g = new THREE.Group(); g.position.set(...pos);
        if (s.kind === 'pullupBar') {
          const b = tube(0.018, M.chrome); b.rotation.z = Math.PI / 2; b.scale.set(1, 1.4, 1); b.position.y = 2.3; g.add(b);
          // البار على ارتفاع قبضة اللاعب (اليدين ثابتة على البار أثناء السحب)
          updaters.push(() => { midHands(_a); b.position.y = Math.min(2.36, Math.max(1.6, _a.y + 0.01 - pos[1])); });
          for (const x of [-0.7, 0.7]) {
            g.add(tubeAB([x, 0.03, 0], [x, 2.38, 0], 0.035, M.steel));
            g.add(tubeAB([x, 0.03, -0.35], [x, 0.03, 0.35], 0.03, M.steelDark));
            g.add(tubeAB([x, 2.38, 0], [x, 2.38, -0.3], 0.03, M.steel));
          }
        } else {
          // بارين متوازيين تحت الكفين بالضبط (الكفين ثابتة عليها طول الحركة)، على عرض قبضة كل نموذج
          [rig.L, rig.R].forEach((S, i) => {
            const b = tube(0.024, M.chrome); b.rotation.x = Math.PI / 2; b.scale.set(1, 0.7, 1); g.add(b);
            const posts = [tube(0.03, M.steel), tube(0.03, M.steel)]; const foot = tube(0.028, M.steelDark); g.add(...posts, foot);
            updaters.push(() => {
              grip(S, _a); _a.sub(g.position);
              const x = _a.x + (i === 0 ? 0.004 : -0.004);
              b.position.set(x, _a.y, 0.1);
              setTube(posts[0], new THREE.Vector3(x, 0.03, -0.2), new THREE.Vector3(x, _a.y, -0.2));
              setTube(posts[1], new THREE.Vector3(x, 0.03, 0.35), new THREE.Vector3(x, _a.y, 0.35));
              setTube(foot, new THREE.Vector3(x, 0.03, -0.35), new THREE.Vector3(x, 0.03, 0.5));
            });
          });
        }
        group.add(g); break;
      }
      case 'cableLow': cable(new THREE.Vector3(pos[0], pos[1] || 0.15, pos[2] || 1.0), () => midHands(new THREE.Vector3()), { side: 1, offset: pos[0] > 0.2 ? 0.3 : 0.5, bar: Math.abs(pos[0]) < 0.2 }); break;
      case 'cableHigh': cable(new THREE.Vector3(pos[0], pos[1] || 2.1, pos[2] || 0.45), () => midHands(new THREE.Vector3()), { bar: true }); break;
      case 'cableFly': {
        cable(new THREE.Vector3(1.0, 1.9, -0.3), () => grip(rig.L, new THREE.Vector3()), { side: 1, offset: 0.12 });
        cable(new THREE.Vector3(-1.0, 1.9, -0.3), () => grip(rig.R, new THREE.Vector3()), { side: -1, offset: 0.12 });
        break;
      }
      case 'rowStation': {
        // جهاز السحب الأرضي: مقعد طويل منخفض + مسند قدمين + برج أوزان أمام القدمين
        const z0 = pos[2];
        group.add(support(rbox(0.34, 0.08, 0.9, M.pad, [0, 0.42, z0 - 0.35], 0.03), 'seat'));
        group.add(tubeAB([0, 0.36, z0 - 0.75], [0, 0.36, z0 + 0.15], 0.03, M.steel));
        for (const z of [z0 - 0.7, z0 + 0.05]) group.add(tubeAB([0, 0.36, z], [0, 0.03, z], 0.03, M.steel));
        group.add(rbox(0.16, 0.06, 2.1, M.steelDark, [0, 0.03, z0 + 0.1], 0.015));
        // لوح القدمين على باطن القدمين (يتبع زاوية القدم)، وعموده للأرض
        const plate = rbox(0.46, 0.34, 0.05, M.steel, [0, 0, 0], 0.02); group.add(plate);
        const plateP = tube(0.028, M.steel); group.add(plateP);
        let plateSet = false;
        updaters.push(() => {
          if (plateSet) return;
          plateSet = true;
          // اللوح متماثل بين القدمين: اتجاهه متوسط اتجاه باطن القدمين (لو الأصابع مفتوحة شوي ما يميل لجهة)،
          // ومكانه قدّام أبعد نقطة من الكعبين والأصابع — ما تدخل أي قدم فيه
          const sole = new THREE.Vector3(); const nrm = new THREE.Vector3(); const up = new THREE.Vector3();
          const pts: THREE.Vector3[] = [];
          for (const S of [rig.L, rig.R]) {
            pts.push(S.toe.getWorldPosition(new THREE.Vector3()), S.heel.getWorldPosition(new THREE.Vector3()));
            S.ankle.getWorldQuaternion(_q);
            nrm.add(_a.set(0, -1, 0).applyQuaternion(_q)); up.add(_a.set(0, 0, 1).applyQuaternion(_q));
          }
          for (const p of pts) sole.add(p);
          sole.multiplyScalar(1 / pts.length);
          nrm.normalize(); up.addScaledVector(nrm, -up.dot(nrm)).normalize();
          const side = new THREE.Vector3().crossVectors(up, nrm);
          plate.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, up, nrm));
          let reach = -Infinity; for (const p of pts) reach = Math.max(reach, _a.subVectors(p, sole).dot(nrm));
          plate.position.copy(sole).addScaledVector(nrm, reach + 0.025 + 0.001);
          setTube(plateP, new THREE.Vector3(0, 0.03, plate.position.z + 0.05), plate.position.clone().addScaledVector(nrm, 0.04));
        });
        const anc = new THREE.Vector3(0, 0.36, z0 + 1.0);
        group.add(weightStack(M, [0, 0, z0 + 1.2], 1.75));
        const pul = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 8, 18), M.steelDark); pul.position.copy(anc); pul.rotation.y = Math.PI / 2; group.add(pul);
        group.add(tubeAB([0, 0.36, z0 + 1.0], [0, 0.36, z0 + 1.2], 0.03, M.steel));
        // مقبض V يتبع اليدين
        const vh = new THREE.Group(); group.add(vh);
        vh.add(tubeAB([-0.07, 0, 0], [0.07, 0, 0], 0.016, M.pad));
        vh.add(tubeAB([-0.07, 0, 0], [0, 0, 0.12], 0.012, M.steelDark));
        vh.add(tubeAB([0.07, 0, 0], [0, 0, 0.12], 0.012, M.steelDark));
        updaters.push(() => { midHands(_a); vh.position.copy(_a); vh.lookAt(anc.x, _a.y, anc.z); });
        cable(anc, () => midHands(new THREE.Vector3()).add(new THREE.Vector3(0, 0, 0.12)), { station: false, handle: false });
        break;
      }
      case 'pecDeck': {
        const g = seatUnit(M, { backH: 0.8, tilt: 4 }); g.position.set(...pos); group.add(g);
        const zb = pos[2] - 0.48;
        group.add(weightStack(M, [pos[0], 0, zb - 0.12], 1.9));
        group.add(tubeAB([-0.3, 1.62, zb], [0.3, 1.62, zb], 0.03, M.steel));
        for (const x of [-0.3, 0.3]) group.add(tubeAB([x, 0.03, zb], [x, 1.62, zb], 0.03, M.steel));
        for (const S of [rig.L, rig.R]) {
          // المسند قدام الساعد (جهة باطن الكف اللي يدفع)، موازي للساعد
          const padV = rbox(0.07, 0.3, 0.07, M.pad, [0, 0, 0], 0.025); group.add(padV);
          const arm = tube(0.024, M.steel); group.add(arm);
          const piv = new THREE.Vector3(0, 1.55, zb + 0.05);
          const sgn = S === rig.L ? -1 : 1;
          const fore = new THREE.Vector3(); const palm = new THREE.Vector3(); const top = new THREE.Vector3();
          updaters.push(() => {
            S.elbow.getWorldPosition(_a); S.wrist.getWorldPosition(_b);
            fore.copy(_b).sub(_a).normalize();
            S.wrist.getWorldQuaternion(_q); palm.set(sgn, 0, 0).applyQuaternion(_q);
            padV.position.copy(_a).add(_b).multiplyScalar(0.5).addScaledVector(palm, 0.075);
            padV.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), fore);
            top.copy(padV.position).addScaledVector(fore, 0.15);
            piv.x = pos[0] + Math.sign(top.x - pos[0]) * 0.2;
            setTube(arm, piv, new THREE.Vector3(top.x, 1.55, top.z));
          });
        }
        break;
      }
      case 'reversePecDeck': {
        // ريفرس بيك ديك: مقعد بدون ظهر، ومسند صدر قدامه، ومقابض عمودية على أذرع من محور فوق المسند
        const g = seatUnit(M, { back: false }); g.position.set(...pos); group.add(g);
        const zc = pos[2] + 0.3;
        // مسند الصدر تحت مستوى الذراعين (حافته العلوية عند الإبط) وأضيق من الكتفين، عشان الذراعين تمر فوقه وجنبه
        const chest = rbox(0.3, 0.27, 0.08, M.pad, [pos[0], 0.75, zc], 0.03); chest.rotation.y = Math.PI; group.add(support(chest, 'back', 'z'));
        // عمود المسند مايل للأمام (يمر بين الركبتين)، وبرج الأوزان قدام اللاعب ورا المقابض (ما يعترض الذراعين وهي مفتوحة)
        group.add(tubeAB([pos[0], 0.64, zc + 0.05], [pos[0], 0.03, zc + 0.26], 0.034, M.steel));
        group.add(tubeAB([pos[0], 0.84, zc + 0.06], [pos[0], 1.55, zc + 0.12], 0.034, M.steel));
        group.add(weightStack(M, [pos[0], 0, zc + 0.87], 1.7));
        group.add(tubeAB([pos[0], 1.55, zc + 0.12], [pos[0], 1.7, zc + 0.87], 0.03, M.steel));
        for (const S of [rig.L, rig.R]) {
          const h = tube(0.018, M.pad); const arm = tube(0.024, M.steel); group.add(h, arm);
          const hub = new THREE.Vector3(pos[0] + (S === rig.L ? 0.06 : -0.06), 1.55, zc + 0.12);
          updaters.push(() => {
            grip(S, _a);
            setTube(h, _a.clone().add(new THREE.Vector3(0, -0.07, 0)), _a.clone().add(new THREE.Vector3(0, 0.07, 0)));
            setTube(arm, hub, _a.clone().add(new THREE.Vector3(0, 0.07, 0)));
          });
        }
        break;
      }
      case 'legExtension': case 'legCurlSeated': {
        const g = seatUnit(M, { h: 0.52, backH: 0.62, tilt: 6 }); g.position.set(...pos); group.add(g);
        group.add(weightStack(M, [pos[0] + 0.55, 0, pos[2] - 0.1], 1.4, Math.PI / 2));
        const roller = disc(0.055, 0.38, M.pad, 16); group.add(roller);
        const arm = tube(0.026, M.steel); group.add(arm);
        const hub = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), M.steelDark); group.add(hub);
        const post = tube(0.03, M.steel); group.add(post);
        const front = s.kind === 'legExtension';
        // الكرل جلوس: مسند فوق الفخذين قرب الركبة يثبتها
        const thighPad = front ? null : disc(0.05, 0.4, M.pad, 16);
        if (thighPad) group.add(thighPad);
        const piv = new THREE.Vector3(); let pivSet = false;
        const up = new THREE.Vector3(); const fw = new THREE.Vector3();
        updaters.push(() => {
          // محور الذراع على خط مفصل الركبة (جنب الركبة)، والأسطوانة على أسفل الساق: قدامها (فرد) أو ورا السمانة (كرل)
          rig.L.knee.getWorldPosition(_a); rig.R.knee.getWorldPosition(_b);
          const knee = _a.clone().add(_b).multiplyScalar(0.5);
          if (!pivSet) {
            pivSet = true;
            piv.set(pos[0] + 0.36, knee.y, knee.z);
            hub.position.copy(piv);
            setTube(post, new THREE.Vector3(piv.x, 0.03, piv.z - 0.2), piv);
          }
          rig.L.ankle.getWorldPosition(_a); rig.R.ankle.getWorldPosition(_b);
          const ank = _a.clone().add(_b).multiplyScalar(0.5);
          rig.L.knee.getWorldQuaternion(_q);
          up.set(0, 1, 0).applyQuaternion(_q); fw.set(0, 0, 1).applyQuaternion(_q);
          roller.position.copy(ank).addScaledVector(up, front ? 0.105 : 0.1).addScaledVector(fw, front ? 0.088 : -0.103);
          setTube(arm, piv, new THREE.Vector3(piv.x, roller.position.y, roller.position.z));
          if (thighPad) {
            rig.L.hip.getWorldPosition(_a); rig.R.hip.getWorldPosition(_b);
            const hipC = _a.add(_b).multiplyScalar(0.5);
            const along = knee.clone().sub(hipC).normalize();
            thighPad.position.copy(knee).addScaledVector(along, -0.12).add(new THREE.Vector3(0, 0.142, 0));
          }
        });
        break;
      }
      case 'legCurlLying': {
        // مسند من الصدر لين فوق الركبة بشوي (الركبة برا الطرف عشان الساق تنثني)، والأسطوانة ورا الكاحل، ومقابض قدام
        const g = new THREE.Group(); g.position.set(...pos);
        g.add(support(rbox(0.38, 0.08, 1.08, M.pad, [0, 0.58, 0.56], 0.03), 'bench'));
        g.add(tubeAB([0, 0.5, 0.1], [0, 0.5, 1.02], 0.028, M.steel));
        for (const z of [0.12, 1.0]) { g.add(tubeAB([0, 0.5, z], [0, 0.03, z], 0.028, M.steel)); g.add(tubeAB([-0.24, 0.025, z], [0.24, 0.025, z], 0.025, M.steelDark)); }
        group.add(g);
        group.add(weightStack(M, [pos[0] + 0.55, 0, pos[2] - 0.1], 1.3, Math.PI / 2));
        const roller = disc(0.055, 0.38, M.pad, 16); group.add(roller);
        const arm = tube(0.024, M.steel); group.add(arm);
        const handles = [tube(0.018, M.pad), tube(0.018, M.pad)]; group.add(...handles);
        const up = new THREE.Vector3(); const back = new THREE.Vector3();
        updaters.push(() => {
          rig.L.ankle.getWorldPosition(_a); rig.R.ankle.getWorldPosition(_b);
          roller.position.copy(_a).add(_b).multiplyScalar(0.5);
          rig.L.knee.getWorldQuaternion(_q);
          up.set(0, 1, 0).applyQuaternion(_q); back.set(0, 0, -1).applyQuaternion(_q);
          roller.position.addScaledVector(up, 0.12).addScaledVector(back, 0.11);
          // ذراع الجهاز من محور جنب الركبة للأسطوانة
          rig.L.knee.getWorldPosition(_a);
          setTube(arm, new THREE.Vector3(pos[0] + 0.3, _a.y, _a.z), new THREE.Vector3(pos[0] + 0.3, roller.position.y, roller.position.z));
          // مقابض تحت الكفين (عرض القبضة)
          [rig.L, rig.R].forEach((S, i) => {
            grip(S, _a);
            setTube(handles[i], _a.clone().add(new THREE.Vector3(-0.06, 0, 0)), _a.clone().add(new THREE.Vector3(0.06, 0, 0)));
          });
        });
        break;
      }
      case 'legPress': case 'hackSquat': {
        // ليق برس ٤٥°: مقعد ومسند مائل (سطوح إسناد)، ولوح القدمين تحت باطن القدمين بالضبط، والمزلقة على قضبان ثابتة
        const g = new THREE.Group(); g.position.set(...pos);
        g.add(support(rbox(0.46, 0.08, 0.5, M.pad, [0, 0.35, -0.2], 0.03), 'seat'));
        // المسند موازي للجذع المائل للخلف ٤٠°: وجهه (+Y المحلي) باتجاه ظهر اللاعب
        const back = rbox(0.46, 0.08, 0.8, M.pad, [0, 0.62, -0.6], 0.03); back.rotation.x = D(s.kind === 'legPress' ? 38 : 20); g.add(support(back, 'back'));
        g.add(tubeAB([0, 0.3, -0.2], [0, 0.03, -0.2], 0.03, M.steel));
        g.add(tubeAB([0, 0.4, -0.5], [0, 0.03, -0.62], 0.03, M.steel));
        g.add(rbox(0.7, 0.05, 1.9, M.steelDark, [0, 0.025, 0.25], 0.015));
        group.add(g);
        // المزلقة: لوح القدمين مع قرون الأوزان
        const sled = new THREE.Group(); group.add(sled);
        sled.add(rbox(0.62, 0.55, 0.05, M.steel, [0, 0.1, 0], 0.02));
        for (const x of [-0.42, 0.42]) {
          const horn = tube(0.022, M.chrome); horn.rotation.z = Math.PI / 2; horn.scale.set(1, 0.22, 1); horn.position.set(x, 0.1, 0.08); sled.add(horn);
          const p = disc(0.2, 0.05, M.plate, 28); p.position.set(x + Math.sign(x) * 0.03, 0.1, 0.08); sled.add(p);
        }
        // العربة: وصلتين من أسفل اللوح لجلبتين تنزلق على القضبان
        for (const x of [-0.2, 0.2]) {
          sled.add(tubeAB([x, -0.15, 0.03], [x, -0.32, 0.03], 0.02, M.steel));
          sled.add(tubeAB([x, -0.33, -0.06], [x, -0.33, 0.12], 0.036, M.steelDark));
        }
        // القضبان تحت العربة (بين اللوح والأرض) على خط حركته، من قاعدة الجهاز على الأرض لفوق أعلى نقطة، وعمود يسندها من فوق
        const rails: THREE.Mesh[] = []; const posts: THREE.Mesh[] = [];
        for (let i = 0; i < 2; i++) { const r = tube(0.025, M.steelDark); rails.push(r); group.add(r); }
        for (let i = 0; i < 2; i++) { const q = tube(0.028, M.steel); posts.push(q); group.add(q); }
        const toFoot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
        const sole = new THREE.Vector3(); const nrm = new THREE.Vector3();
        let p0: THREE.Vector3 | null = null; const p1 = new THREE.Vector3(); let far = 0; const n0 = new THREE.Vector3();
        const setRails = () => {
          const dir = far > 0.08 ? p1.clone().sub(p0!).normalize() : n0.clone();
          if (dir.y < 0) dir.negate();
          if (dir.y < 0.2) dir.set(0, 0.7, 0.7).normalize();
          const hi = far > 0.08 && p1.y > p0!.y ? p1 : p0!;
          const below = new THREE.Vector3(1, 0, 0).cross(dir).normalize();                // عمودي على خط الحركة باتجاه الأرض
          if (below.y > 0) below.negate();
          for (let i = 0; i < 2; i++) {
            const b = hi.clone().addScaledVector(below, 0.33).add(new THREE.Vector3(i === 0 ? -0.2 : 0.2, 0, 0)).addScaledVector(dir, 0.25);
            const a = b.clone().addScaledVector(dir, -(b.y - 0.05) / dir.y);
            setTube(rails[i], a, b);
            setTube(posts[i], b, new THREE.Vector3(b.x, 0.03, b.z));
          }
        };
        updaters.push(() => {
          // منتصف باطن القدمين (نقاط الكعب والأصابع على مستوى النعل) + اتجاه النعل للخارج (−Y للقدم)
          sole.set(0, 0, 0);
          for (const S of [rig.L, rig.R]) { sole.add(S.toe.getWorldPosition(_a)); sole.add(S.heel.getWorldPosition(_a)); }
          sole.multiplyScalar(0.25);
          rig.L.ankle.getWorldQuaternion(_q);
          nrm.set(0, -1, 0).applyQuaternion(_q);
          // اللوح: سطحه على النعل (نص سماكته + فراغ بسيط للخارج)، وطوله على طول القدم
          sled.quaternion.copy(_q).multiply(toFoot);
          sled.position.copy(sole).addScaledVector(nrm, 0.03);
          if (!p0) { p0 = sled.position.clone(); n0.copy(nrm); setRails(); return; }
          const d = sled.position.distanceTo(p0);
          if (d > far + 0.02) { far = d; p1.copy(sled.position); setRails(); }
        });
        break;
      }
      case 'backPad': {
        const padG = new THREE.Group(); group.add(padG);
        padG.add(rbox(0.42, 0.9, 0.07, M.pad, [0, 0.1, -0.16], 0.03));
        for (const x of [-0.16, 0.16]) padG.add(rbox(0.09, 0.07, 0.16, M.pad, [x, 0.52, -0.06], 0.025));
        const rail = tube(0.035, M.steel); group.add(rail);
        const railFoot = rbox(0.34, 0.04, 0.3, M.steelDark, [0, 0.02, 0], 0.012); group.add(railFoot);
        // لوح رفيع تحت القدمين (سطحه تقريباً على الأرض عشان النعل ما يدخل فيه)
        group.add(rbox(0.7, 0.008, 0.6, M.steelDark, [0, 0.002, 0.1], 0.003));
        // القضيب على خط حركة المسند نفسه (من أول وضعية لأبعد نقطة يوصلها)، فالمسند ينزلق عليه بدون ما يدخل الجسم فيه
        let p0: THREE.Vector3 | null = null; const p1 = new THREE.Vector3(); let far = 0;
        const setRail = (q: THREE.Quaternion) => {
          const dir = far > 0.08 ? p1.clone().sub(p0!).normalize() : new THREE.Vector3(0, 1, 0).applyQuaternion(q);
          if (dir.y < 0) dir.negate();
          if (dir.y < 0.3) dir.set(0, 1, 0);
          _b.copy(p0!).add(new THREE.Vector3(0, 0.2, -0.3).applyQuaternion(q));
          const lo = _b.clone().addScaledVector(dir, -(_b.y - 0.04) / dir.y);
          const hi = _b.clone().addScaledVector(dir, (2.1 - _b.y) / dir.y);
          setTube(rail, lo, hi);
          railFoot.position.set(lo.x, 0.02, lo.z);
        };
        updaters.push(() => {
          rig.spine.getWorldPosition(_a); padG.position.copy(_a);
          rig.spine.getWorldQuaternion(_q); padG.quaternion.copy(_q);
          if (!p0) { p0 = _a.clone(); setRail(_q); return; }
          const d = _a.distanceTo(p0);
          if (d > far + 0.02) { far = d; p1.copy(_a); setRail(_q); }
        });
        break;
      }
      case 'abWheel': {
        const w = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.028, 10, 24), M.plate);
        const axle = tube(0.012, M.chrome); axle.rotation.z = Math.PI / 2; axle.scale.set(1, 0.32, 1);
        group.add(w, axle);
        updaters.push(() => { midHands(_a); w.position.set(_a.x, 0.108, _a.z); w.rotation.set(0, Math.PI / 2, 0); axle.position.set(_a.x, 0.108, _a.z); });
        break;
      }
      case 'declineBench': {
        // بنش مائل للأسفل (الرأس أوطى من الحوض ١٨°): المسند على قائمين يوصلون له، ومسند رجلين عند الطرف العالي
        const g = new THREE.Group(); g.position.set(...pos); group.add(g);
        const ang = D(18); const padT = 0.075; const len = 1.2;
        const c = new THREE.Vector3(0, 0.6, 0);                                    // منتصف سطح المسند
        const along = new THREE.Vector3(0, Math.sin(ang), Math.cos(ang));          // على طول المسند باتجاه الرجلين (للأعلى)
        const nrm = new THREE.Vector3(0, Math.cos(ang), -Math.sin(ang));           // وجه المسند
        const pad = rbox(0.3, padT, len, M.pad, [0, 0, 0], 0.03);
        pad.position.copy(c).addScaledVector(nrm, -padT / 2);
        pad.rotation.x = -ang;
        g.add(support(pad, 'bench'));
        const under = (t: number) => c.clone().addScaledVector(along, t).addScaledVector(nrm, -padT - 0.012);
        const plate = box(0.07, 0.025, len - 0.1, M.steelDark, [0, 0, 0]);
        plate.position.copy(c).addScaledVector(nrm, -padT - 0.012); plate.rotation.x = -ang; g.add(plate);
        g.add(box(0.075, 0.075, 1.3, M.steel, [0, 0.07, 0.02]));
        for (const z of [-0.62, 0.66]) {
          g.add(tubeAB([-0.25, 0.035, z], [0.25, 0.035, z], 0.032, M.steelDark));
          for (const x of [-0.25, 0.25]) g.add(rbox(0.07, 0.03, 0.07, M.pad, [x, 0.015, z], 0.01));
        }
        for (const t of [-0.42, 0.34]) { const u = under(t); g.add(tubeAB([0, 0.07, u.z], [0, u.y, u.z], 0.032, M.steel)); }
        // مسند الرجلين: الساق مثبتة تحت أسطوانتين (تتبع مكان الكاحل)
        const top = under(len / 2 - 0.08).add(g.position);
        const post = tube(0.028, M.steel); group.add(post);
        const rollers = [disc(0.055, 0.2, M.pad, 16), disc(0.055, 0.2, M.pad, 16)];
        group.add(...rollers);
        const axle = tube(0.016, M.chrome); axle.rotation.z = Math.PI / 2; group.add(axle);
        updaters.push(() => {
          rig.L.ankle.getWorldPosition(_a); rig.R.ankle.getWorldPosition(_b);
          const mid = _a.clone().add(_b).multiplyScalar(0.5);
          rig.L.knee.getWorldQuaternion(_q);
          // قدام الساق (فوق مشط القدم) بشوي
          mid.add(new THREE.Vector3(0, 0.07, 0.07).applyQuaternion(_q));
          rollers[0].position.set(mid.x + 0.11, mid.y, mid.z);
          rollers[1].position.set(mid.x - 0.11, mid.y, mid.z);
          axle.position.copy(mid); axle.scale.set(1, 0.44, 1);
          setTube(post, top, new THREE.Vector3(mid.x, mid.y - 0.03, mid.z));
        });
        break;
      }
      case 'preacherBench': {
        // مقعد بريتشر: مسند مائل للذراعين أمام الصدر
        const g = new THREE.Group(); g.position.set(...pos);
        g.add(support(rbox(0.36, 0.07, 0.34, M.pad, [0, 0.385, -0.05], 0.03), 'seat'));
        g.add(tubeAB([0, 0.345, -0.05], [0, 0.03, -0.05], 0.03, M.steel));
        // مسندين للعضدين (واحد تحت كل عضد) بنفس ميلانهم: الكوع عند طرفه والإبط فوق طرفه الثاني.
        // مسند لكل ذراع بدل مسند عريض عشان ما يدخل في البطن (العضد قصير نسبة لعمق الجذع)
        const armPads = [rbox(0.12, 0.06, 0.15, M.pad, [0, 0, 0], 0.025), rbox(0.12, 0.06, 0.15, M.pad, [0, 0, 0], 0.025)];
        group.add(...armPads);
        const padPost = tube(0.03, M.steel); const padBar = tube(0.022, M.steel); group.add(padPost, padBar);
        let padSet = false;
        updaters.push(() => {
          if (padSet) return;
          padSet = true;
          const under: THREE.Vector3[] = [];
          [rig.L, rig.R].forEach((S, i) => {
            const sh = S.shoulder.getWorldPosition(new THREE.Vector3());
            const el = S.elbow.getWorldPosition(new THREE.Vector3());
            const dir = el.clone().sub(sh).normalize();
            const down = new THREE.Vector3(1, 0, 0).cross(dir).normalize();
            if (down.y > 0) down.negate();
            // قريب من الكوع وبرا شوي عن الصدر (صدر المرأة أقرب للعضد)
            armPads[i].position.copy(sh).lerp(el, 0.8).addScaledVector(down, 0.075);
            armPads[i].position.x += Math.sign(sh.x) * 0.012;
            armPads[i].quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
            under.push(armPads[i].position.clone().addScaledVector(down, 0.035));
          });
          setTube(padBar, under[0], under[1]);
          const mid = under[0].clone().add(under[1]).multiplyScalar(0.5);
          setTube(padPost, mid, new THREE.Vector3(mid.x, 0.03, mid.z + 0.25));
        });
        g.add(rbox(0.1, 0.04, 0.8, M.steelDark, [0, 0.02, 0.15], 0.012));
        g.add(rbox(0.44, 0.04, 0.08, M.steelDark, [0, 0.02, -0.05], 0.012));
        group.add(g); break;
      }
      case 'hyperBench': {
        // جهاز تمديد الظهر ٤٥°: مسند الحوض قدام أعلى الفخذين (حافته العليا عند مفصل الحوض عشان الجذع ينثني بحرية)،
        // أسطوانتين ورا أسفل الساقين فوق الكاحل، ولوح القدمين عمودي على الرجلين تحت النعل.
        // الرجلين ثابتة طول التمرين، فالجهاز يتركّب على مقاس اللاعب (رجل/امرأة) أول إطار
        const hipPad = rbox(0.36, 0.08, 0.34, M.pad, [0, 0, 0], 0.03);
        const hipPlate = box(0.08, 0.025, 0.28, M.steelDark, [0, 0, 0]);
        const footPlate = rbox(0.46, 0.03, 0.3, M.steelDark, [0, 0, 0], 0.01);
        const rollers = [disc(0.05, 0.13, M.pad, 14), disc(0.05, 0.13, M.pad, 14)];
        const axle = tube(0.016, M.chrome);
        const hipPost = tube(0.032, M.steel); const hipBrace = tube(0.028, M.steel); const rollPost = tube(0.024, M.steel); const platePost = tube(0.026, M.steel);
        const base = tube(0.03, M.steelDark); const feet = [tube(0.028, M.steelDark), tube(0.028, M.steelDark)];
        group.add(hipPad, hipPlate, footPlate, ...rollers, axle, hipPost, hipBrace, rollPost, platePost, base, ...feet);
        let built = false;
        updaters.push(() => {
          if (built) return;
          built = true;
          const w = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
          const hipL = w(rig.L.hip); const hipR = w(rig.R.hip);
          const hip = hipL.clone().add(hipR).multiplyScalar(0.5);
          const ankle = w(rig.L.ankle).add(w(rig.R.ankle)).multiplyScalar(0.5);
          const leg = hip.clone().sub(ankle).setX(0).normalize();                       // من القدم للحوض
          const front = new THREE.Vector3(1, 0, 0).cross(leg).normalize();               // قدام الفخذ (ولاتجاه الأصابع)
          if (front.z < 0) front.negate();
          const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), front.clone().negate(), leg));
          // مسند الحوض: سطحه على أعرض نقطة بقدام الفخذ (سماكة الفخذ ≈ ١.١ × نص المسافة بين مفصلي الحوض)
          const thigh = hipL.distanceTo(hipR) * 0.55 + 0.004;
          hipPad.position.copy(hip).addScaledVector(leg, -0.28).addScaledVector(front, thigh + 0.04); hipPad.quaternion.copy(q);
          hipPlate.position.copy(hipPad.position).addScaledVector(front, 0.052); hipPlate.quaternion.copy(q);
          // الأسطوانتين: ورا الساق فوق الكاحل بـ ١٣ سم، وحدة على كل رجل
          const back = front.clone().negate();
          const roll = ankle.clone().addScaledVector(leg, 0.13).addScaledVector(back, 0.052 + 0.05 + 0.003);
          [rig.L, rig.R].forEach((S, i) => { rollers[i].position.set(w(S.ankle).x, roll.y, roll.z); });
          setTube(axle, rollers[0].position.clone().setX(rollers[0].position.x + 0.07), rollers[1].position.clone().setX(rollers[1].position.x - 0.07));
          // لوح القدمين: سطحه تحت النعل (نقاط الكعب والأصابع) وعمودي على الرجلين
          const sole = new THREE.Vector3();
          for (const S of [rig.L, rig.R]) sole.add(w(S.toe)).add(w(S.heel));
          sole.multiplyScalar(0.25);
          footPlate.position.copy(sole).setX(0).addScaledVector(leg, -0.018);
          footPlate.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), leg, front));
          // الهيكل: قاعدة على الأرض، عمود لمسند الحوض، دعامة للأسطوانات، وعمود للوح
          const zB = footPlate.position.z - 0.2; const zF = hipPad.position.z + 0.25;
          setTube(base, new THREE.Vector3(0, 0.03, zB), new THREE.Vector3(0, 0.03, zF));
          setTube(feet[0], new THREE.Vector3(-0.28, 0.028, zB + 0.03), new THREE.Vector3(0.28, 0.028, zB + 0.03));
          setTube(feet[1], new THREE.Vector3(-0.28, 0.028, zF - 0.03), new THREE.Vector3(0.28, 0.028, zF - 0.03));
          const padUnder = hipPlate.position.clone().addScaledVector(front, 0.01);
          setTube(hipPost, new THREE.Vector3(0, 0.03, zF - 0.06), padUnder);
          setTube(hipBrace, new THREE.Vector3(0, 0.03, zB + 0.12), padUnder.clone().addScaledVector(leg, -0.12));
          const axleMid = rollers[0].position.clone().add(rollers[1].position).multiplyScalar(0.5);
          setTube(rollPost, axleMid, new THREE.Vector3(0, 0.03, zB + 0.12).lerp(padUnder.clone().addScaledVector(leg, -0.12), 0.35));
          setTube(platePost, footPlate.position.clone().addScaledVector(leg, -0.02), new THREE.Vector3(0, 0.03, footPlate.position.z - 0.02));
        });
        break;
      }
      case 'plyoBox': {
        // سطحه العلوي أرضية مرتفعة (القدمين عليه في الضغط المنحدر مثلاً)
        group.add(support(rbox(0.6, 0.5, 0.5, M.pad, [pos[0], 0.25, pos[2]], 0.035), 'mat')); break;
      }
      case 'smithBar': {
        // سميث مشين: البار على الظهر يتحرك على قضبان ثابتة (pos[2] = موضع القضبان للأمام/الخلف)
        const zb = pos[2] || -0.12;
        for (const x of [-0.72, 0.72]) {
          group.add(tubeAB([x, 0.03, zb], [x, 2.25, zb], 0.028, M.steel));
          group.add(tubeAB([x - 0.08, 0.03, zb], [x + 0.08, 0.03, zb], 0.03, M.steelDark));
        }
        group.add(tubeAB([-0.72, 2.25, zb], [0.72, 2.25, zb], 0.03, M.steel));
        group.add(rbox(1.7, 0.008, 0.7, M.steelDark, [0, 0.002, zb + 0.07], 0.003));
        const bar = makeBarbell(M, 1.6, 0.2); group.add(bar);
        const sleeves = [tube(0.03, M.steelDark), tube(0.03, M.steelDark)]; group.add(...sleeves);
        updaters.push(() => {
          rig.barOnBack.getWorldPosition(_a);
          bar.position.set(0, _a.y, zb);
          bar.rotation.set(0, 0, 0);
          setTube(sleeves[0], new THREE.Vector3(-0.72, _a.y - 0.06, zb), new THREE.Vector3(-0.72, _a.y + 0.06, zb));
          setTube(sleeves[1], new THREE.Vector3(0.72, _a.y - 0.06, zb), new THREE.Vector3(0.72, _a.y + 0.06, zb));
        });
        break;
      }
      case 'lowBar': {
        // بار منخفض للسحب المقلوب: البار على ارتفاع قبضة اللاعب بين قائمين
        const b = tube(0.018, M.chrome); b.rotation.z = Math.PI / 2; b.scale.set(1, 1.3, 1); group.add(b);
        for (const x of [-0.65, 0.65]) {
          const up = tube(0.032, M.steel); group.add(up);
          group.add(tubeAB([x, 0.03, pos[2] - 0.3], [x, 0.03, pos[2] + 0.3], 0.03, M.steelDark));
          updaters.push(() => { midHands(_a); setTube(up, new THREE.Vector3(x, 0.03, _a.z), new THREE.Vector3(x, _a.y + 0.08, _a.z)); });
        }
        updaters.push(() => { midHands(_a); b.position.copy(_a); });
        break;
      }
      case 'band': {
        // مطاط مقاومة بين اليدين
        const bandM = new THREE.MeshStandardMaterial({ color: '#F1551D', roughness: 0.7 });
        const t1 = tube(0.012, bandM, 8); group.add(t1);
        updaters.push(() => { grip(rig.L, _a); grip(rig.R, _b); setTube(t1, _a, _b); });
        break;
      }
      case 'cableAnkle': {
        // كيك باك بالكيبل: البرج قدام اللاعب ويمسك بيديه بار أفقي عليه (قبضة من فوق)، والكيبل من البكرة السفلية
        // لسوار الكاحل. البار والبرج يتحددون أول إطار من مكان اليدين (مقاس الرجل والمرأة يختلف).
        // السوار يلف أسفل الساق (فوق الكاحل) وعمودي عليها، والسلك يشبك فيه من الجهة اللي تواجه البكرة
        const S = pos[0] >= 0 ? rig.L : rig.R;
        const strap = new THREE.Mesh(new THREE.TorusGeometry(0.063, 0.014, 8, 20), M.pad); group.add(strap);
        const anchor = new THREE.Vector3(0, pos[1] || 0.12, pos[2] || 0.7);
        const frame = new THREE.Group(); group.add(frame);
        let frameSet = false;
        updaters.push(() => {
          if (frameSet) return;
          frameSet = true;
          grip(rig.L, _a); grip(rig.R, _b);
          const y = (_a.y + _b.y) / 2; const z = (_a.z + _b.z) / 2;
          const half = Math.max(0.26, Math.abs(_a.x - _b.x) / 2 + 0.07);
          const zt = z + 0.12;
          frame.add(weightStack(M, [0, 0, zt], 2.15, 0, half));
          frame.add(tubeAB([-half - 0.03, y, z], [half + 0.03, y, z], 0.019, M.pad));
          for (const x of [-half, half]) frame.add(tubeAB([x, y, z], [x, y, zt], 0.022, M.steel));
          anchor.set(0, pos[1] || 0.12, zt - 0.09);
          const pul = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 8, 18), M.steelDark);
          pul.position.copy(anchor); frame.add(pul);
          frame.add(tubeAB([0, anchor.y, anchor.z], [0, anchor.y, zt], 0.025, M.steel));
        });
        const axis = new THREE.Vector3(); const hook = new THREE.Vector3(); const zAxis = new THREE.Vector3(0, 0, 1);
        cable(anchor, () => {
          S.ankle.getWorldPosition(_a); S.knee.getWorldPosition(_b);
          axis.subVectors(_b, _a).normalize();
          strap.position.copy(_a).addScaledVector(axis, 0.075);
          strap.quaternion.setFromUnitVectors(zAxis, axis);
          hook.subVectors(anchor, strap.position); hook.addScaledVector(axis, -hook.dot(axis)).normalize();
          return hook.multiplyScalar(0.077).add(strap.position).clone();
        }, { handle: false, station: false });
        break;
      }
      case 'cableSide': {
        // كيبل من الجنب على ارتفاع الصدر (بالوف برس / وود تشوب)
        cable(new THREE.Vector3(pos[0] || 0.9, pos[1] || 1.2, pos[2] || 0), () => midHands(new THREE.Vector3()), { side: (pos[0] || 0.9) > 0 ? 1 : -1, offset: 0.12 });
        break;
      }
      case 'kettlebell': {
        // كيتل بل بين اليدين
        const kb = new THREE.Group(); group.add(kb);
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 12), M.plate); body.position.y = -0.13; kb.add(body);
        const h = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.014, 8, 16, Math.PI), M.plate); h.position.y = -0.04; kb.add(h);
        updaters.push(() => { midHands(_a); kb.position.copy(_a); });
        break;
      }
      case 'medBall': {
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), new THREE.MeshStandardMaterial({ color: '#2B3A35', roughness: 0.8 }));
        group.add(ball);
        // الكرة بين الكفين بالضبط: حجمها يتبع المسافة بين الكفين (مقاس يدين الرجل والمرأة يختلف)
        updaters.push(() => {
          grip(rig.L, _a); grip(rig.R, _b);
          const r = Math.min(0.14, Math.max(0.09, _a.distanceTo(_b) / 2 - 0.012));
          ball.position.copy(_a).add(_b).multiplyScalar(0.5);
          ball.scale.setScalar(r / 0.12);
        });
        break;
      }
      case 'cableFlyLow': {
        cable(new THREE.Vector3(1.0, 0.25, -0.2), () => grip(rig.L, new THREE.Vector3()), { side: 1, offset: 0.12 });
        cable(new THREE.Vector3(-1.0, 0.25, -0.2), () => grip(rig.R, new THREE.Vector3()), { side: -1, offset: 0.12 });
        break;
      }
      case 'rackPins': {
        // قفص باور رَك مختصر: قوائم أمامية وخلفية ومساند (بنز) على ارتفاع الركبة
        for (const x of [-0.72, 0.72]) {
          for (const z of [-0.35, 0.35]) group.add(tubeAB([x, 0.03, z], [x, 2.1, z], 0.028, M.steel));
          group.add(tubeAB([x, 0.03, -0.45], [x, 0.03, 0.45], 0.03, M.steelDark));
          group.add(tubeAB([x, pos[1] || 0.5, -0.45], [x, pos[1] || 0.5, 0.45], 0.02, M.chrome));
          group.add(tubeAB([x, 2.1, -0.35], [x, 2.1, 0.35], 0.028, M.steel));
        }
        break;
      }
      case 'mat': {
        group.add(support(rbox(0.7, 0.018, 1.9, M.pad, [pos[0], 0.009, pos[2]], 0.008), 'mat')); break;
      }
      case 'matSide': {
        // مات بالعرض (للتمارين على الجنب مثل البلانك الجانبي)
        group.add(support(rbox(1.9, 0.018, 0.7, M.pad, [pos[0], 0.009, pos[2]], 0.008), 'mat')); break;
      }
    }
  }
  // سطوح الإسناد (المقاعد والمساند الثابتة) بإحداثيات المشهد
  group.updateMatrixWorld(true);
  const supports: Support[] = [];
  group.traverse((o) => {
    const tag = o.userData.support as { role: SupportRole; face: 'y' | 'z' } | undefined;
    const mesh = o as THREE.Mesh;
    if (!tag || !mesh.isMesh) return;
    mesh.geometry.computeBoundingBox();
    const size = mesh.geometry.boundingBox!.getSize(new THREE.Vector3());
    const q = mesh.getWorldQuaternion(new THREE.Quaternion());
    const X = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const Y = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const Z = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const c = mesh.getWorldPosition(new THREE.Vector3());
    supports.push(tag.face === 'y'
      ? { role: tag.role, c: c.addScaledVector(Y, size.y / 2), n: Y, u: X, v: Z, hu: size.x / 2, hv: size.z / 2 }
      : { role: tag.role, c: c.addScaledVector(Z, size.z / 2), n: Z, u: X, v: Y, hu: size.x / 2, hv: size.y / 2 });
  });
  return { group, update: () => updaters.forEach((u) => u()), supports };
}

/**
 * للرسم ثلاثي الأبعاد: يدمج أجزاء الأجهزة الثابتة (اللي ما تتحرك خلال التمرين) في شبكة وحدة لكل خامة،
 * عشان يقل عدد أوامر الرسم ويبقى التحريك سلس على الجوال. poses: دوال تطبّق وضعيات مختلفة من الحركة.
 */
export function bakeStaticProps(group: THREE.Group, poses: (() => void)[]): number {
  const meshes: THREE.Mesh[] = [];
  group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !m.userData.shadow) meshes.push(m); });
  const first = new Map<THREE.Mesh, number[]>();
  const moving = new Set<THREE.Mesh>();
  poses.forEach((apply, i) => {
    apply();
    group.updateMatrixWorld(true);
    for (const m of meshes) {
      const e = m.matrixWorld.elements;
      if (i === 0) first.set(m, e.slice());
      else if (e.some((v, k) => Math.abs(v - first.get(m)![k]) > 1e-5)) moving.add(m);
    }
  });
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const rel = new THREE.Matrix4();
  for (const m of meshes) {
    if (moving.has(m) || Array.isArray(m.material)) continue;
    rel.multiplyMatrices(inv, m.matrixWorld);
    let g = m.geometry.clone().applyMatrix4(rel);
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    (byMat.get(m.material) ?? byMat.set(m.material, []).get(m.material)!).push(g);
    m.parent?.remove(m);
  }
  let n = 0;
  for (const [mat, list] of byMat) {
    const merged = mergeGeometries(list, false);
    if (!merged) continue;
    group.add(new THREE.Mesh(merged, mat));
    n++;
  }
  return n;
}
