// رسم المجسّم بدون كرت الرسومات (بدون WebGL): نحسب الوضعية بنفس محرك الحركات ثم نسقط كل جزء على شاشة ثنائية الأبعاد
// كل جزء في المجسّم شكل محدّب (كرة/كبسولة/صندوق) فحدوده على الشاشة = الغلاف المحدّب لنقاطه بعد الإسقاط.
// نرسم الأبعد أولاً، ونضيف طبقة "مضيئة" من النقاط المواجهة للضوء عشان يبان المجسّم مجسّم.
import * as THREE from 'three';
import { MOTIONS, sampleMotion, type Motion } from './motions';
import { applyPose, createFloor, createProps, createRig, type Muscle, type Rig } from './rig';

export interface FlatShape { pts: string; fill: string; opacity?: number }
export interface FlatLine { pts: string; stroke: string }
export interface FlatFrame { shapes: FlatShape[]; lines: FlatLine[] }

interface Part {
  mesh: THREE.Mesh;
  pos: Float32Array;   // نقاط مختارة من الشكل (محلية)
  nrm: Float32Array;   // اتجاهات السطح لنفس النقاط
  center: THREE.Vector3;
  floor: boolean;
}

const MAX_POINTS = 44;

function sampleGeometry(g: THREE.BufferGeometry): { pos: Float32Array; nrm: Float32Array } {
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute | undefined;
  const step = Math.max(1, Math.ceil(p.count / MAX_POINTS));
  const count = Math.ceil(p.count / step);
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  for (let i = 0, k = 0; i < p.count && k < count; i += step, k++) {
    pos[k * 3] = p.getX(i); pos[k * 3 + 1] = p.getY(i); pos[k * 3 + 2] = p.getZ(i);
    if (n) { nrm[k * 3] = n.getX(i); nrm[k * 3 + 1] = n.getY(i); nrm[k * 3 + 2] = n.getZ(i); }
  }
  return { pos, nrm };
}

/** الغلاف المحدّب (Andrew monotone chain) — يرجع النقاط بالترتيب */
export function convexHull(xs: number[], ys: number[]): number[] {
  const idx = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b] || ys[a] - ys[b]);
  if (idx.length < 3) return idx;
  const cross = (o: number, a: number, b: number) => (xs[a] - xs[o]) * (ys[b] - ys[o]) - (ys[a] - ys[o]) * (xs[b] - xs[o]);
  const lower: number[] = [];
  for (const i of idx) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], i) <= 0) lower.pop();
    lower.push(i);
  }
  const upper: number[] = [];
  for (let j = idx.length - 1; j >= 0; j--) {
    const i = idx[j];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], i) <= 0) upper.pop();
    upper.push(i);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

const _m = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();
const _light = new THREE.Vector3();

export interface FlatScene {
  rig: Rig;
  motion: Motion;
  setHighlight(focus: Muscle | null): void;
  frame(t: number, yaw: number, w: number, h: number): FlatFrame;
}

export function createFlatScene(motionId: keyof typeof MOTIONS): FlatScene {
  const motion = MOTIONS[motionId];
  const rig = createRig();
  const props = createProps(rig, motion.props);
  const world = new THREE.Group();
  const floor = createFloor();
  world.add(floor, rig.object, props.group);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);

  const parts: Part[] = [];
  const lines: THREE.Line[] = [];
  const cache = new Map<THREE.BufferGeometry, { pos: Float32Array; nrm: Float32Array }>();
  world.traverse((o) => {
    if ((o as THREE.Line).isLine) { lines.push(o as THREE.Line); return; }
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    let s = cache.get(mesh.geometry);
    if (!s) { s = sampleGeometry(mesh.geometry); cache.set(mesh.geometry, s); }
    mesh.geometry.computeBoundingSphere();
    parts.push({ mesh, ...s, center: new THREE.Vector3(), floor: floor.children.includes(mesh) });
  });

  const setHighlight = (focus: Muscle | null) => {
    if (focus) rig.setHighlight([focus], []);
    else rig.setHighlight(motion.primary, motion.secondary);
  };
  setHighlight(null);

  const hex = (m: THREE.Material | THREE.Material[], k: number) => {
    const mat = (Array.isArray(m) ? m[0] : m) as THREE.MeshStandardMaterial;
    _c.copy(mat.color ?? _c.set('#888888')).multiplyScalar(k);
    return `#${_c.getHexString()}`;
  };

  const frame = (t: number, yaw: number, w: number, h: number): FlatFrame => {
    applyPose(rig, sampleMotion(motion, t), { ground: motion.ground });
    props.update();
    world.updateMatrixWorld(true);

    const a = -THREE.MathUtils.degToRad((motion.view?.yaw ?? 35) + yaw);
    const dist = motion.view?.dist ?? 3.9; const y = motion.view?.y ?? 0.9;
    camera.aspect = w / h;
    camera.position.set(Math.sin(a) * dist, y + 0.4, Math.cos(a) * dist);
    camera.lookAt(0, y, 0);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    // الضوء ثابت بالنسبة للكاميرا: من فوق ويسار وقدّام
    _light.set(-0.45, 0.75, 0.5).normalize().transformDirection(camera.matrixWorld);

    const view = camera.matrixWorldInverse;
    const order: { part: Part; depth: number }[] = [];
    for (const part of parts) {
      if (!part.mesh.visible) continue;
      const bs = part.mesh.geometry.boundingSphere!;
      part.center.copy(bs.center).applyMatrix4(part.mesh.matrixWorld);
      _v.copy(part.center).applyMatrix4(view);
      order.push({ part, depth: part.floor ? -1e9 : _v.z });
    }
    order.sort((p, q) => p.depth - q.depth); // الأبعد (z أصغر) أولاً

    const shapes: FlatShape[] = [];
    const xs: number[] = []; const ys: number[] = [];
    const lx: number[] = []; const ly: number[] = [];
    for (const { part } of order) {
      const mesh = part.mesh;
      _m.multiplyMatrices(camera.projectionMatrix, view).multiply(mesh.matrixWorld);
      _nm.getNormalMatrix(mesh.matrixWorld);
      xs.length = 0; ys.length = 0; lx.length = 0; ly.length = 0;
      const count = part.pos.length / 3;
      for (let i = 0; i < count; i++) {
        _v.set(part.pos[i * 3], part.pos[i * 3 + 1], part.pos[i * 3 + 2]).applyMatrix4(_m);
        const sx = ((_v.x + 1) / 2) * w; const sy = ((1 - _v.y) / 2) * h;
        xs.push(sx); ys.push(sy);
        _n.set(part.nrm[i * 3], part.nrm[i * 3 + 1], part.nrm[i * 3 + 2]).applyMatrix3(_nm).normalize();
        if (_n.dot(_light) > 0.35) { lx.push(sx); ly.push(sy); }
      }
      const hull = convexHull(xs, ys);
      if (hull.length < 3) continue;
      const pts = hull.map((i) => `${xs[i].toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (part.floor) { shapes.push({ pts, fill: hex(mat, 1), opacity: mat.opacity ?? 1 }); continue; }
      shapes.push({ pts, fill: hex(mat, 0.62) });
      if (lx.length >= 3) {
        const lh = convexHull(lx, ly);
        if (lh.length >= 3) shapes.push({ pts: lh.map((i) => `${lx[i].toFixed(1)},${ly[i].toFixed(1)}`).join(' '), fill: hex(mat, 1) });
      }
    }

    const outLines: FlatLine[] = [];
    for (const line of lines) {
      const p = line.geometry.attributes.position as THREE.BufferAttribute;
      _m.multiplyMatrices(camera.projectionMatrix, view).multiply(line.matrixWorld);
      const pts: string[] = [];
      for (let i = 0; i < p.count; i++) {
        _v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(_m);
        pts.push(`${(((_v.x + 1) / 2) * w).toFixed(1)},${(((1 - _v.y) / 2) * h).toFixed(1)}`);
      }
      outLines.push({ pts: pts.join(' '), stroke: hex(line.material as THREE.Material, 1) });
    }
    return { shapes, lines: outLines };
  };

  return { rig, motion, setHighlight, frame };
}
