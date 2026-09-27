// أجهزة ومعدات النادي حول المجسّم (بنفس لغة التصميم: حديد رمادي فاتح، مساند داكنة، أوزان سوداء)
// الألوان مختارة لتتباين مع الخلفية الكريمية ومع ملابس اللاعب الداكنة، والأجهزة الثابتة (برج الأوزان، البكرات)
// توضع بعيداً عن جهة الكاميرا (+X = يسار اللاعب) حتى لا تغطي الحركة.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PropSpec, PropsRuntime, Rig } from './rig';

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
function box(w: number, h: number, d: number, m: THREE.Material, pos: V3) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(...pos);
  return mesh;
}
/** أنبوب طوله 1 على محور Y — نمطّه بين نقطتين بـ setTube */
function tube(r: number, m: THREE.Material, seg = 12) {
  return new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, seg), m);
}
function setTube(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  _c.copy(b).sub(a);
  const len = Math.max(0.001, _c.length());
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, _c.multiplyScalar(1 / len));
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
function flatBench(M: Mats, w = 0.3, len = 1.15, h = 0.44) {
  const g = new THREE.Group();
  g.add(rbox(w, 0.08, len, M.pad, [0, h - 0.04, 0], 0.03));
  g.add(tubeAB([0, h - 0.11, -len / 2 + 0.12], [0, h - 0.11, len / 2 - 0.12], 0.028, M.steel));
  for (const z of [-len / 2 + 0.12, len / 2 - 0.12]) {
    g.add(tubeAB([0, h - 0.11, z], [0, 0.03, z], 0.026, M.steel));
    g.add(tubeAB([-0.22, 0.025, z], [0.22, 0.025, z], 0.025, M.steelDark));
  }
  return g;
}

function inclineBench(M: Mats, angle = 38) {
  const g = new THREE.Group();
  g.add(rbox(0.32, 0.08, 0.36, M.pad, [0, 0.44, 0.25], 0.03));
  const back = rbox(0.32, 0.08, 0.9, M.pad, [0, 0.72, -0.18], 0.03); back.rotation.x = D(-angle); g.add(back);
  g.add(tubeAB([0, 0.38, 0.3], [0, 0.03, 0.3], 0.026, M.steel));
  g.add(tubeAB([0, 0.62, -0.28], [0, 0.03, -0.45], 0.026, M.steel));
  g.add(tubeAB([0, 0.05, 0.4], [0, 0.05, -0.55], 0.028, M.steel));
  for (const z of [0.4, -0.55]) g.add(tubeAB([-0.22, 0.025, z], [0.22, 0.025, z], 0.025, M.steelDark));
  return g;
}

/** مقعد بمسند ظهر (للدمبل جلوس ولأجهزة الضغط) */
function seatUnit(M: Mats, o: { h?: number; back?: boolean; backH?: number; tilt?: number } = {}) {
  const h = o.h ?? 0.46;
  const g = new THREE.Group();
  g.add(rbox(0.38, 0.08, 0.38, M.pad, [0, h, 0], 0.035));
  g.add(tubeAB([0, h - 0.04, 0], [0, 0.04, 0], 0.03, M.steel));
  g.add(rbox(0.5, 0.04, 0.46, M.steelDark, [0, 0.02, -0.02], 0.012));
  if (o.back !== false) {
    const bh = o.backH ?? 0.7;
    const back = rbox(0.36, bh, 0.08, M.pad, [0, h + 0.05 + bh / 2, -0.22], 0.035);
    back.rotation.x = D(-(o.tilt ?? 8));
    g.add(back);
    g.add(tubeAB([0, h - 0.05, -0.02], [0, h + 0.2, -0.3], 0.026, M.steel));
  }
  return g;
}

// ------------------------------------------------------------------ برج الأوزان والكيبل
/** برج أوزان (صفائح + قضبان توجيه) — facing: اتجاه وجه الصفائح */
function weightStack(M: Mats, pos: V3, height = 2.1, rotY = 0) {
  const g = new THREE.Group();
  g.position.set(...pos); g.rotation.y = rotY;
  for (const x of [-0.22, 0.22]) g.add(tubeAB([x, 0.02, 0], [x, height, 0], 0.03, M.steel));
  g.add(tubeAB([-0.22, height, 0], [0.22, height, 0], 0.03, M.steel));
  g.add(rbox(0.56, 0.05, 0.36, M.steelDark, [0, 0.025, 0], 0.015));
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
      _b.set(_a.x, _a.y + 0.09, _a.z); _c.set(_a.x, _a.y - 0.09, _a.z);
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
        for (const S of sides) {
          const db = makeDumbbell(M); group.add(db);
          const hammer = s.kind === 'hammerDumbbells';
          updaters.push(() => {
            grip(S, _a); db.position.copy(_a);
            S.wrist.getWorldQuaternion(_q); db.quaternion.copy(_q);
            if (hammer) db.rotateY(Math.PI / 2);
          });
        }
        break;
      }
      case 'goblet': {
        const db = makeDumbbell(M, 0.3); group.add(db);
        updaters.push(() => {
          midHands(_a); db.position.copy(_a); db.position.y -= 0.17; db.position.addScaledVector(new THREE.Vector3(0, 0, 1), 0.03);
          db.rotation.set(0, 0, Math.PI / 2);
        });
        break;
      }
      case 'bench': case 'benchBehind': case 'benchSideRow': {
        const b = flatBench(M); b.position.set(...pos); group.add(b); break;
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
        group.add(rbox(0.5, 0.2, 0.42, M.pad, [pos[0], 0.1, pos[2]], 0.03)); break;
      }
      case 'inclineBench': { const g = inclineBench(M); g.position.set(...pos); group.add(g); break; }
      case 'seat': case 'seatBack': {
        const g = seatUnit(M, { back: s.kind === 'seatBack' }); g.position.set(...pos); group.add(g); break;
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
      case 'hipAbduction': {
        const g = seatUnit(M, { backH: 0.7, tilt: 14 }); g.position.set(...pos); group.add(g);
        group.add(weightStack(M, [pos[0], 0, pos[2] - 0.6], 1.6));
        for (const S of [rig.L, rig.R]) {
          const padM = rbox(0.07, 0.22, 0.26, M.pad, [0, 0, 0], 0.03); group.add(padM);
          const arm = tube(0.025, M.steel); group.add(arm);
          const piv = new THREE.Vector3(pos[0], 0.3, pos[2] + 0.1);
          updaters.push(() => {
            S.knee.getWorldPosition(_a);
            const out = Math.sign(_a.x - pos[0]) || 1;
            padM.position.set(_a.x + out * 0.1, _a.y, _a.z - 0.05);
            _b.set(padM.position.x, 0.3, padM.position.z);
            setTube(arm, piv, _b);
          });
        }
        break;
      }
      case 'latMachine': {
        const g = seatUnit(M, { back: false }); g.position.set(...pos); group.add(g);
        // مساند الفخذ فوق الركب
        for (const x of [-0.12, 0.12]) {
          const roll = disc(0.055, 0.16, M.pad, 16); roll.position.set(pos[0] + x, 0.7, pos[2] + 0.2); group.add(roll);
        }
        group.add(tubeAB([pos[0], 0.7, pos[2] + 0.2], [pos[0], 0.04, pos[2] + 0.2], 0.026, M.steel));
        group.add(tubeAB([pos[0] - 0.12, 0.7, pos[2] + 0.2], [pos[0] + 0.12, 0.7, pos[2] + 0.2], 0.018, M.steel));
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
          for (const x of [-0.27, 0.27]) {
            const b = tube(0.024, M.chrome); b.rotation.x = Math.PI / 2; b.scale.set(1, 0.7, 1); b.position.set(x, 1.25, 0.1); g.add(b);
            g.add(tubeAB([x, 0.03, -0.2], [x, 1.25, -0.2], 0.03, M.steel));
            g.add(tubeAB([x, 0.03, 0.35], [x, 1.25, 0.35], 0.03, M.steel));
            g.add(tubeAB([x, 0.03, -0.35], [x, 0.03, 0.5], 0.028, M.steelDark));
          }
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
        group.add(rbox(0.34, 0.08, 0.9, M.pad, [0, 0.42, z0 - 0.35], 0.03));
        group.add(tubeAB([0, 0.36, z0 - 0.75], [0, 0.36, z0 + 0.15], 0.03, M.steel));
        for (const z of [z0 - 0.7, z0 + 0.05]) group.add(tubeAB([0, 0.36, z], [0, 0.03, z], 0.03, M.steel));
        group.add(rbox(0.16, 0.06, 2.1, M.steelDark, [0, 0.03, z0 + 0.1], 0.015));
        const plate = rbox(0.46, 0.34, 0.05, M.steel, [0, 0.3, z0 + 0.62], 0.02); plate.rotation.x = D(-28); group.add(plate);
        for (const x of [-0.12, 0.12]) group.add(rbox(0.1, 0.03, 0.16, M.pad, [x, 0.25, z0 + 0.57], 0.012));
        group.add(tubeAB([0, 0.2, z0 + 0.66], [0, 0.03, z0 + 0.62], 0.028, M.steel));
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
          const padV = rbox(0.07, 0.3, 0.07, M.pad, [0, 0, 0], 0.025); group.add(padV);
          const arm = tube(0.024, M.steel); group.add(arm);
          const piv = new THREE.Vector3(0, 1.55, zb + 0.05);
          updaters.push(() => {
            grip(S, _a);
            padV.position.set(_a.x, _a.y - 0.05, _a.z);
            piv.x = pos[0] + Math.sign(_a.x - pos[0]) * 0.2;
            _b.set(_a.x, 1.55, _a.z);
            setTube(arm, piv, _b);
          });
        }
        break;
      }
      case 'legExtension': case 'legCurlSeated': {
        const g = seatUnit(M, { h: 0.52, backH: 0.62, tilt: 6 }); g.position.set(...pos); group.add(g);
        group.add(weightStack(M, [pos[0] + 0.55, 0, pos[2] - 0.1], 1.4, Math.PI / 2));
        const roller = disc(0.055, 0.38, M.pad, 16); group.add(roller);
        const arm = tube(0.024, M.steel); group.add(arm);
        const piv = new THREE.Vector3(pos[0] + 0.24, 0.5, pos[2] + 0.2);
        const hub = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), M.steelDark); hub.position.copy(piv); group.add(hub);
        const front = s.kind === 'legExtension';
        updaters.push(() => {
          rig.L.ankle.getWorldPosition(_a); rig.R.ankle.getWorldPosition(_b);
          roller.position.copy(_a).add(_b).multiplyScalar(0.5);
          rig.L.knee.getWorldQuaternion(_q);
          roller.position.add(new THREE.Vector3(0, 0.02, front ? 0.07 : -0.07).applyQuaternion(_q));
          _c.set(pos[0] + 0.24, roller.position.y, roller.position.z);
          setTube(arm, piv, _c);
        });
        break;
      }
      case 'legCurlLying': {
        const g = new THREE.Group(); g.position.set(...pos);
        g.add(rbox(0.38, 0.08, 1.25, M.pad, [0, 0.62, -0.1], 0.03));
        g.add(tubeAB([0, 0.55, -0.6], [0, 0.55, 0.45], 0.028, M.steel));
        for (const z of [-0.6, 0.4]) { g.add(tubeAB([0, 0.55, z], [0, 0.03, z], 0.028, M.steel)); g.add(tubeAB([-0.24, 0.025, z], [0.24, 0.025, z], 0.025, M.steelDark)); }
        group.add(g);
        group.add(weightStack(M, [pos[0] + 0.55, 0, pos[2] + 0.4], 1.3, Math.PI / 2));
        const roller = disc(0.055, 0.38, M.pad, 16); group.add(roller);
        updaters.push(() => {
          rig.L.ankle.getWorldPosition(_a); rig.R.ankle.getWorldPosition(_b);
          roller.position.copy(_a).add(_b).multiplyScalar(0.5);
          rig.L.knee.getWorldQuaternion(_q);
          roller.position.add(new THREE.Vector3(0, 0, -0.07).applyQuaternion(_q));
        });
        break;
      }
      case 'legPress': case 'hackSquat': {
        const g = new THREE.Group(); g.position.set(...pos);
        g.add(rbox(0.46, 0.08, 0.5, M.pad, [0, 0.35, -0.2], 0.03));
        const back = rbox(0.46, 0.08, 0.8, M.pad, [0, 0.7, -0.55], 0.03); back.rotation.x = D(s.kind === 'legPress' ? -55 : -70); g.add(back);
        g.add(tubeAB([0, 0.3, -0.2], [0, 0.03, -0.2], 0.03, M.steel));
        g.add(rbox(0.7, 0.05, 1.9, M.steelDark, [0, 0.025, 0.25], 0.015));
        group.add(g);
        // المزلقة: لوح القدمين مع قرون الأوزان
        const sled = new THREE.Group(); group.add(sled);
        sled.add(rbox(0.62, 0.55, 0.05, M.steel, [0, 0, 0], 0.02));
        for (const x of [-0.42, 0.42]) {
          const horn = tube(0.022, M.chrome); horn.rotation.z = Math.PI / 2; horn.scale.set(1, 0.22, 1); horn.position.set(x, 0, -0.08); sled.add(horn);
          const p = disc(0.2, 0.05, M.plate, 28); p.position.set(x + Math.sign(x) * 0.03, 0, -0.08); sled.add(p);
        }
        const rails: THREE.Mesh[] = [];
        for (let i = 0; i < 2; i++) { const r = tube(0.025, M.steelDark); rails.push(r); group.add(r); }
        let railDir: THREE.Vector3 | null = null;
        updaters.push(() => {
          rig.L.toe.getWorldPosition(_a); rig.R.toe.getWorldPosition(_b);
          const toe = _a.clone().add(_b).multiplyScalar(0.5);
          rig.L.heel.getWorldPosition(_a);
          const mid = toe.clone().add(_a).multiplyScalar(0.5);
          const n = toe.clone().sub(_a).normalize();
          sled.position.copy(mid).add(new THREE.Vector3(0, 0, 0.03));
          sled.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
          // القضبان: اتجاه ثابت (عمودي على لوح القدمين في أول إطار)
          if (!railDir) {
            railDir = new THREE.Vector3(0, 0, 1).applyQuaternion(sled.quaternion).normalize();
            if (railDir.y < 0) railDir.negate();
          }
          for (let i = 0; i < 2; i++) {
            const x = i === 0 ? -0.36 : 0.36;
            const c = mid.clone().add(new THREE.Vector3(x, 0, 0));
            setTube(rails[i], c.clone().addScaledVector(railDir, -0.9), c.clone().addScaledVector(railDir, 0.5));
          }
        });
        break;
      }
      case 'backPad': {
        const padG = new THREE.Group(); group.add(padG);
        padG.add(rbox(0.42, 0.9, 0.07, M.pad, [0, 0.1, -0.16], 0.03));
        for (const x of [-0.16, 0.16]) padG.add(rbox(0.09, 0.07, 0.16, M.pad, [x, 0.52, -0.06], 0.025));
        const rail = tube(0.035, M.steel); group.add(rail);
        group.add(rbox(0.7, 0.05, 0.6, M.steelDark, [0, 0.025, 0.1], 0.015));
        updaters.push(() => {
          rig.spine.getWorldPosition(_a); padG.position.copy(_a);
          rig.spine.getWorldQuaternion(_q); padG.quaternion.copy(_q);
          _b.copy(_a).add(new THREE.Vector3(0, 0.2, -0.24).applyQuaternion(_q));
          const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(_q);
          setTube(rail, _b.clone().addScaledVector(dir, -1.1), _b.clone().addScaledVector(dir, 1.1));
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
        // بنش مائل للأسفل (الرأس أوطى من الحوض) مع مسند للرجلين
        const g = new THREE.Group(); g.position.set(...pos);
        const pad = rbox(0.3, 0.08, 1.15, M.pad, [0, 0.62, 0], 0.03); pad.rotation.x = D(-18); g.add(pad);
        g.add(tubeAB([0, 0.5, 0.35], [0, 0.03, 0.4], 0.028, M.steel));
        g.add(tubeAB([0, 0.28, -0.4], [0, 0.03, -0.45], 0.028, M.steel));
        g.add(tubeAB([0, 0.03, 0.55], [0, 0.03, -0.6], 0.028, M.steelDark));
        for (const z of [0.55, -0.6]) g.add(tubeAB([-0.22, 0.025, z], [0.22, 0.025, z], 0.025, M.steelDark));
        // مسند الرجلين أمام أسفل الساق (فوق الكاحل)
        const roll = disc(0.055, 0.34, M.pad, 16); roll.position.set(0, 0.84, 0.86); g.add(roll);
        g.add(tubeAB([0, 0.84, 0.86], [0, 0.5, 0.42], 0.022, M.steel));
        group.add(g); break;
      }
      case 'preacherBench': {
        // مقعد بريتشر: مسند مائل للذراعين أمام الصدر
        const g = new THREE.Group(); g.position.set(...pos);
        g.add(rbox(0.36, 0.07, 0.34, M.pad, [0, 0.5, -0.05], 0.03));
        g.add(tubeAB([0, 0.46, -0.05], [0, 0.03, -0.05], 0.03, M.steel));
        // المسند تحت العضد مباشرة (مائل 45°) والكوع عند طرفه
        const armPad = rbox(0.46, 0.07, 0.25, M.pad, [0, 0.89, 0.12], 0.03); armPad.rotation.x = D(45); g.add(armPad);
        g.add(tubeAB([0, 0.84, 0.17], [0, 0.03, 0.3], 0.03, M.steel));
        g.add(rbox(0.5, 0.04, 0.8, M.steelDark, [0, 0.02, 0.15], 0.012));
        group.add(g); break;
      }
      case 'hyperBench': {
        // جهاز تمديد الظهر 45°: مسند للحوض ومسند للكاحل
        const g = new THREE.Group(); g.position.set(...pos);
        // مسند الحوض أمام أعلى الفخذ، ومسند الكاحل خلف أسفل الساق، ولوح للقدمين
        const hipPad = rbox(0.36, 0.08, 0.34, M.pad, [0, 0.82, 0.32], 0.03); hipPad.rotation.x = D(-45); g.add(hipPad);
        g.add(tubeAB([0, 0.03, -0.45], [0, 0.75, 0.27], 0.032, M.steel));
        g.add(tubeAB([0, 0.75, 0.27], [0, 0.03, 0.45], 0.03, M.steel));
        for (const x of [-0.1, 0.1]) { const r = disc(0.05, 0.12, M.pad, 14); r.position.set(x, 0.46, -0.39); g.add(r); }
        g.add(tubeAB([0, 0.24, -0.34], [0, 0.46, -0.39], 0.022, M.steel));
        g.add(tubeAB([0, 0.03, -0.3], [0, 0.23, -0.3], 0.026, M.steel));
        g.add(tubeAB([0, 0.03, -0.65], [0, 0.03, 0.55], 0.03, M.steelDark));
        const plate = rbox(0.46, 0.03, 0.3, M.steelDark, [0, 0.235, -0.29], 0.01); plate.rotation.x = D(-10); g.add(plate);
        group.add(g); break;
      }
      case 'plyoBox': {
        group.add(rbox(0.6, 0.5, 0.5, M.pad, [pos[0], 0.25, pos[2]], 0.035)); break;
      }
      case 'smithBar': {
        // سميث مشين: البار على الظهر يتحرك على قضبان ثابتة (pos[2] = موضع القضبان للأمام/الخلف)
        const zb = pos[2] || -0.12;
        for (const x of [-0.72, 0.72]) {
          group.add(tubeAB([x, 0.03, zb], [x, 2.25, zb], 0.028, M.steel));
          group.add(tubeAB([x - 0.08, 0.03, zb], [x + 0.08, 0.03, zb], 0.03, M.steelDark));
        }
        group.add(tubeAB([-0.72, 2.25, zb], [0.72, 2.25, zb], 0.03, M.steel));
        group.add(rbox(1.7, 0.04, 0.7, M.steelDark, [0, 0.02, zb + 0.07], 0.012));
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
        // كيبل من البكرة السفلية إلى سوار الكاحل
        const S = pos[0] >= 0 ? rig.L : rig.R;
        const strap = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 8, 16), M.pad); group.add(strap);
        cable(new THREE.Vector3(pos[0], pos[1] || 0.12, pos[2] || 0.7), () => S.ankle.getWorldPosition(new THREE.Vector3()), { handle: false, offset: 0.45 });
        updaters.push(() => { S.ankle.getWorldPosition(_a); strap.position.copy(_a); strap.rotation.set(Math.PI / 2, 0, 0); });
        break;
      }
      case 'cableSide': {
        // كيبل من الجنب على ارتفاع الصدر (بالوف برس / وود تشوب)
        cable(new THREE.Vector3(pos[0] || 0.9, pos[1] || 1.2, pos[2] || 0), () => midHands(new THREE.Vector3()), { side: (pos[0] || 0.9) > 0 ? 1 : -1, offset: 0.12 });
        break;
      }
      case 'hipAdduction': {
        const g = seatUnit(M, { backH: 0.7, tilt: 14 }); g.position.set(...pos); group.add(g);
        group.add(weightStack(M, [pos[0], 0, pos[2] - 0.6], 1.6));
        for (const S of [rig.L, rig.R]) {
          const padM = rbox(0.07, 0.22, 0.26, M.pad, [0, 0, 0], 0.03); group.add(padM);
          const arm = tube(0.025, M.steel); group.add(arm);
          const piv = new THREE.Vector3(pos[0], 0.3, pos[2] + 0.1);
          updaters.push(() => {
            S.knee.getWorldPosition(_a);
            const out = Math.sign(_a.x - pos[0]) || 1;
            padM.position.set(_a.x - out * 0.09, _a.y, _a.z - 0.05);
            _b.set(padM.position.x, 0.3, padM.position.z);
            setTube(arm, piv, _b);
          });
        }
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
        updaters.push(() => { midHands(_a); ball.position.copy(_a); ball.position.addScaledVector(new THREE.Vector3(0, 0, 1), 0.06); });
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
        group.add(rbox(0.7, 0.018, 1.9, M.pad, [pos[0], 0.009, pos[2]], 0.008)); break;
      }
      case 'matSide': {
        // مات بالعرض (للتمارين على الجنب مثل البلانك الجانبي)
        group.add(rbox(1.9, 0.018, 0.7, M.pad, [pos[0], 0.009, pos[2]], 0.008)); break;
      }
    }
  }
  return { group, update: () => updaters.forEach((u) => u()) };
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
