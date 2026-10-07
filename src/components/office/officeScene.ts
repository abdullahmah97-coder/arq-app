// مشهد مكتب أرك أب: أرضية مرتفعة عليها ٩ مكاتب (شبكة ٣×٣، المدير في النص) وعلى كل مكتب موظف وشاشة.
// كله أشكال بسيطة (صناديق وأسطوانات) بدون ملفات GLB ولا نصوص داخل 3D — اللوحات والأرقام تنرسم فوق المشهد بـ React Native.
// نفس الكاميرا ونفس الإسقاط يستخدمها المشهد ثلاثي الأبعاد واللوحات والرسم ثنائي الأبعاد البديل، عشان يتطابقون بالبكسل.
import * as THREE from 'three';
import { DESK_GAP, DESKS, deskSpot, paintOrder, type DeskId, type DeskState } from '@/lib/officeCore';

/** نص طول الأرضية */
export const HALF = DESK_GAP * 1.5 + 0.15;
const SLAB = 0.55;
/** نقطة اللوحة: فوق شاشة المكتب مباشرة (أسفل اللوحة عندها)، عشان كل لوحة تجلس على مكتبها مو على اللي وراه */
export const SIGN_Y = 1.45;
export const SIGN_Z = -0.24;
/** الكاميرا: زاوية أيزومترية من جهة +x +z */
const EYE = new THREE.Vector3(10, 9.2, 10);

const SCREEN = { waiting: '#F1551D', working: '#FEA94F', idle: '#8FD19E' };

/** كاميرا متعامدة تحوّط الأرضية واللوحات بالضبط داخل مساحة w×h (بالبكسل) */
export function officeCamera(w: number, h: number): THREE.OrthographicCamera {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  cam.position.copy(EYE);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  const inv = cam.matrixWorldInverse;
  const v = new THREE.Vector3();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const fit = (x: number, y: number, z: number) => {
    v.set(x, y, z).applyMatrix4(inv);
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
  };
  for (const sx of [-HALF, HALF]) for (const sz of [-HALF, HALF]) { fit(sx, 0, sz); fit(sx, -SLAB, sz); }
  // مساحة للوحات فوق المكاتب (المكتب الأبعد هو اللي يحدد أعلى الصورة)
  for (const d of DESKS) { const [x, z] = deskSpot(d); fit(x, SIGN_Y + 1.0, z + SIGN_Z); }
  const pad = 0.25;
  x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  let hw = (x1 - x0) / 2, hh = (y1 - y0) / 2;
  const aspect = w / Math.max(1, h);
  if (hw / hh > aspect) hh = hw / aspect; else hw = hh * aspect;
  cam.left = cx - hw; cam.right = cx + hw; cam.top = cy + hh; cam.bottom = cy - hh;
  cam.updateProjectionMatrix();
  return cam;
}

const _p = new THREE.Vector3();
/** نقطة في المشهد → بكسل داخل مساحة الرسم (من فوق-يسار) */
export function toScreen(cam: THREE.Camera, x: number, y: number, z: number, w: number, h: number) {
  _p.set(x, y, z).project(cam);
  return { x: ((_p.x + 1) / 2) * w, y: ((1 - _p.y) / 2) * h };
}

type Lam = THREE.MeshLambertMaterial;
interface DeskRig {
  id: DeskId;
  screens: THREE.MeshBasicMaterial[];
  rug: Lam;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  head: THREE.Object3D;
  phase: number;
  state: DeskState | null;
  selected: boolean;
}

export interface OfficeWorld {
  group: THREE.Group;
  update: (states: DeskState[], selected: DeskId | null) => void;
  tick: (t: number) => void;
  dispose: () => void;
}

export function buildOffice(palette: { rug: string; rugOn: string; top: string; base: string }): OfficeWorld {
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const geo = <G extends THREE.BufferGeometry>(g: G) => { geos.push(g); return g; };
  const lam = (color: string) => { const m = new THREE.MeshLambertMaterial({ color }); mats.push(m); return m; };
  const basic = (color: string) => { const m = new THREE.MeshBasicMaterial({ color }); mats.push(m); return m; };
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) => {
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); parent.add(o); return o;
  };

  // الإضاءة جزء من المجموعة عشان ما نعتمد على عناصر JSX
  group.add(new THREE.HemisphereLight('#fff7ea', '#5a4a3a', 1.7));
  const sun = new THREE.DirectionalLight('#ffffff', 1.5);
  sun.position.set(4, 10, 6);
  group.add(sun);

  // الأرضية المرتفعة
  const size = HALF * 2;
  mesh(geo(new THREE.BoxGeometry(size, SLAB, size)), lam(palette.base), 0, -SLAB / 2 - 0.03, 0, group);
  mesh(geo(new THREE.BoxGeometry(size, 0.06, size)), lam(palette.top), 0, 0, 0, group);

  // قطع مشتركة
  const g = {
    rug: geo(new THREE.BoxGeometry(2.3, 0.02, 2.2)),
    top: geo(new THREE.BoxGeometry(1.6, 0.07, 0.85)),
    side: geo(new THREE.BoxGeometry(0.06, 0.72, 0.8)),
    back: geo(new THREE.BoxGeometry(1.5, 0.4, 0.04)),
    frame: geo(new THREE.BoxGeometry(0.62, 0.4, 0.04)),
    screen: geo(new THREE.PlaneGeometry(0.55, 0.33)),
    stand: geo(new THREE.CylinderGeometry(0.03, 0.05, 0.18, 8)),
    keys: geo(new THREE.BoxGeometry(0.46, 0.02, 0.15)),
    mug: geo(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 10)),
    seat: geo(new THREE.BoxGeometry(0.5, 0.07, 0.48)),
    seatBack: geo(new THREE.BoxGeometry(0.5, 0.32, 0.06)),
    chairLeg: geo(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 8)),
    torso: geo(new THREE.CylinderGeometry(0.16, 0.2, 0.46, 14)),
    head: geo(new THREE.SphereGeometry(0.15, 16, 12)),
    hair: geo(new THREE.SphereGeometry(0.158, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55)),
    arm: geo(new THREE.BoxGeometry(0.08, 0.34, 0.08)),
    pot: geo(new THREE.CylinderGeometry(0.22, 0.17, 0.32, 12)),
    leaf: geo(new THREE.IcosahedronGeometry(0.36, 0)),
  };
  const m = {
    desk: lam('#D9A86C'),
    panel: lam('#B98953'),
    dark: lam('#22312C'),
    keys: lam('#EDE6DA'),
    chair: lam('#33433D'),
    skin: lam('#E2B48C'),
    hair: lam('#2B1D14'),
    pot: lam('#C1683C'),
    leaf: lam('#3E7D4F'),
  };

  const rigs: DeskRig[] = [];
  for (const d of paintOrder(DESKS)) {
    const [x, z] = deskSpot(d);
    const lead = d.id === 'lead';
    const root = new THREE.Group();
    root.position.set(x, 0, z);
    group.add(root);

    const rug = lam(palette.rug);
    mesh(g.rug, rug, 0, 0.04, 0.3, root);

    // المكتب: سطح وجانبين ولوح خلفي، والشاشة تقابل الموظف (والكاميرا تشوفها من فوق كتفه)
    mesh(g.top, m.desk, 0, 0.75, 0, root);
    mesh(g.side, m.panel, -0.76, 0.37, 0, root);
    mesh(g.side, m.panel, 0.76, 0.37, 0, root);
    mesh(g.back, m.panel, 0, 0.5, -0.38, root);
    const screens: THREE.MeshBasicMaterial[] = [];
    for (const sx of lead ? [-0.33, 0.33] : [0]) {
      mesh(g.stand, m.dark, sx, 0.86, -0.22, root);
      mesh(g.frame, m.dark, sx, 1.1, -0.24, root);
      const s = basic(SCREEN.idle);
      screens.push(s);
      mesh(g.screen, s, sx, 1.1, -0.215, root);
    }
    mesh(g.keys, m.keys, 0, 0.795, 0.12, root);
    mesh(g.mug, lam(d.shirt), 0.6, 0.835, 0.1, root);

    // الكرسي والموظف (ظهره للكاميرا مثل المكاتب الحقيقية)
    const cz = 0.72;
    mesh(g.seat, m.chair, 0, 0.46, cz, root);
    mesh(g.seatBack, m.chair, 0, 0.66, cz + 0.24, root);
    mesh(g.chairLeg, m.chair, 0, 0.22, cz, root);
    const shirt = lam(d.shirt);
    mesh(g.torso, shirt, 0, 0.73, cz, root);
    const head = new THREE.Group();
    head.position.set(0, 1.12, cz);
    root.add(head);
    mesh(g.head, m.skin, 0, 0, 0, head);
    // الشعر يغطي أعلى الراس ومؤخرته (اللي تشوفه الكاميرا)
    const hair = mesh(g.hair, m.hair, 0, 0.02, 0.015, head);
    hair.rotation.x = 0.35;
    const arm = (side: 1 | -1) => {
      const pivot = new THREE.Group();
      pivot.position.set(0.22 * side, 0.92, cz);
      root.add(pivot);
      mesh(g.arm, shirt, 0, -0.16, 0, pivot);
      return pivot;
    };
    const armL = arm(-1);
    const armR = arm(1);

    rigs.push({ id: d.id, screens, rug, armL, armR, head, phase: rigs.length * 0.9, state: null, selected: false });
  }

  // نباتات في الزوايا البعيدة عشان ما تغطي المكاتب
  const c = HALF - 0.3;
  for (const [px, pz] of [[-c, -c], [-c, c], [c, -c]]) {
    mesh(g.pot, m.pot, px, 0.19, pz, group);
    const leaf = mesh(g.leaf, m.leaf, px, 0.62, pz, group);
    leaf.scale.set(1, 1.25, 1);
  }

  const update = (states: DeskState[], selected: DeskId | null) => {
    for (const r of rigs) {
      r.state = states.find((s) => s.id === r.id) ?? null;
      r.selected = selected === r.id;
      const c = r.state?.waiting ? SCREEN.waiting : r.state?.inProgress ? SCREEN.working : SCREEN.idle;
      for (const s of r.screens) s.color.set(c);
      r.rug.color.set(r.selected ? palette.rugOn : palette.rug);
    }
  };

  const tick = (t: number) => {
    for (const r of rigs) {
      const tt = t + r.phase;
      const waiting = !!r.state?.waiting;
      const working = !!r.state?.inProgress;
      r.head.position.y = 1.12 + Math.sin(tt * 1.6) * 0.012;
      // الذراع معلّقة من الكتف: دوران موجب حول x يمدّها لقدّام (للكيبورد). يكتب لو عنده شغل، وإلا يدينه مرتاحة
      const typing = working || waiting ? Math.sin(tt * 14) * 0.08 : 0;
      r.armL.rotation.set(1.15 + typing, 0, 0);
      if (waiting) {
        // يرفع يده (وشاشته برتقالية): عنده شي يبي موافقتك
        r.armR.rotation.set(Math.PI - 0.25, 0, Math.sin(tt * 5) * 0.35);
      } else {
        r.armR.rotation.set(1.15 - typing, 0, 0);
      }
    }
  };

  const dispose = () => {
    for (const x of geos) x.dispose();
    for (const x of mats) x.dispose();
  };

  return { group, update, tick, dispose };
}

/** الرسم ثنائي الأبعاد البديل: أشكال بالبكسل بنفس الإسقاط، مرتبة من الأبعد للأقرب */
export type FlatShape =
  | { kind: 'poly'; points: string; fill: string }
  | { kind: 'circle'; cx: number; cy: number; r: number; fill: string };
export interface FlatPalette { rug: string; rugOn: string; top: string; base: string; baseDark: string }

export function flatOffice(cam: THREE.Camera, w: number, h: number, states: DeskState[], selected: DeskId | null, palette: FlatPalette): FlatShape[] {
  const out: FlatShape[] = [];
  const poly = (corners: [number, number, number][], fill: string) => out.push({
    kind: 'poly', fill,
    points: corners.map(([x, y, z]) => { const p = toScreen(cam, x, y, z, w, h); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' '),
  });
  const circle = (x: number, y: number, z: number, r: number, fill: string) => {
    const p = toScreen(cam, x, y, z, w, h);
    out.push({ kind: 'circle', cx: p.x, cy: p.y, r: r * pxPerUnit, fill });
  };
  const quadY = (cx: number, cz: number, hx: number, hz: number, y: number): [number, number, number][] =>
    [[cx - hx, y, cz - hz], [cx + hx, y, cz - hz], [cx + hx, y, cz + hz], [cx - hx, y, cz + hz]];
  // كم بكسل لكل وحدة على خط أفقي في الشاشة (اتجاه +x -z)
  const a = toScreen(cam, 0, 0, 0, w, h), b = toScreen(cam, 1, 0, -1, w, h);
  const pxPerUnit = Math.hypot(b.x - a.x, b.y - a.y) / Math.SQRT2;

  // جوانب الأرضية الظاهرة (+z و +x) ثم سطحها
  const H = HALF, S = SLAB;
  poly([[-H, 0, H], [H, 0, H], [H, -S, H], [-H, -S, H]], palette.base);
  poly([[H, 0, H], [H, 0, -H], [H, -S, -H], [H, -S, H]], palette.baseDark);
  poly(quadY(0, 0, H, H, 0), palette.top);

  for (const d of paintOrder(DESKS)) {
    const [x, z] = deskSpot(d);
    const st = states.find((s) => s.id === d.id);
    poly(quadY(x, z + 0.3, 1.15, 1.1, 0.04), selected === d.id ? palette.rugOn : palette.rug);
    // المكتب (الجانب والوجه الأمامي والسطح)، ثم الشاشة واقفة على آخره، ثم الموظف قدّامه
    poly([[x + 0.8, 0.78, z + 0.42], [x + 0.8, 0.78, z - 0.42], [x + 0.8, 0, z - 0.42], [x + 0.8, 0, z + 0.42]], '#A87A47');
    poly([[x - 0.8, 0.78, z + 0.42], [x + 0.8, 0.78, z + 0.42], [x + 0.8, 0, z + 0.42], [x - 0.8, 0, z + 0.42]], '#B98953');
    poly(quadY(x, z, 0.8, 0.42, 0.78), '#D9A86C');
    const scr = st?.waiting ? SCREEN.waiting : st?.inProgress ? SCREEN.working : SCREEN.idle;
    poly([[x - 0.3, 1.3, z - 0.22], [x + 0.3, 1.3, z - 0.22], [x + 0.3, 0.9, z - 0.22], [x - 0.3, 0.9, z - 0.22]], '#22312C');
    poly([[x - 0.26, 1.27, z - 0.21], [x + 0.26, 1.27, z - 0.21], [x + 0.26, 0.93, z - 0.21], [x - 0.26, 0.93, z - 0.21]], scr);
    circle(x, 0.75, z + 0.72, 0.2, d.shirt);
    circle(x, 1.12, z + 0.72, 0.15, '#2B1D14');
  }
  return out;
}
