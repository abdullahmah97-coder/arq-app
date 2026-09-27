// المجسّم الواقعي: شخصية ARQ (رجل/امرأة من MakeHuman بملابس ARQ) بهيكل Mixamo تتحرك بنفس محرك الوضعيات
// الفكرة: الهيكل المبسّط في rig.ts يبقى "سائقاً" غير مرئي، ونحن ننسخ اتجاه كل عظمة منه إلى النموذج الحقيقي
// بعد معايرة الفرق بين محاور الهيكلين في وضعية T.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { applyPose, sym, type Muscle, type Rig } from './rig';

export const HUMAN_COLORS = {
  skin: '#EFD3B0',
  joints: '#D8B48C',
  primary: '#F1551D',
  secondary: '#FEA94F',
};

const B = (n: string) => `mixamorig${n}`;
const findBone = (root: THREE.Object3D, name: string) => {
  let hit: THREE.Bone | undefined;
  root.traverse((o) => {
    if (hit) return;
    const clean = o.name.replace(/[:_]/g, '');
    if ((o as THREE.Bone).isBone && clean === B(name)) hit = o as THREE.Bone;
  });
  return hit;
};

type Pair = { bone: THREE.Bone; driver: THREE.Object3D; offset: THREE.Quaternion };
type SkinLayer = { mesh: THREE.SkinnedMesh; base: Float32Array; colors: Float32Array; cloth: boolean };

export interface Human {
  object: THREE.Group;
  /** كائن بنفس شكل Rig لكن نقاطه على جسم النموذج الحقيقي (تستخدمه الأدوات) */
  propRig: Rig;
  sync(ground: boolean): void;
  setHighlight(primary: Muscle[], secondary: Muscle[]): void;
  /** قبضة الأصابع: 0 مفتوح … 1 مقفل */
  setGrip(amount: number): void;
}

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();

export function createHuman(template: THREE.Object3D, driver: Rig, tposeClip?: THREE.AnimationClip | null): Human {
  const model = cloneSkinned(template) as THREE.Object3D;
  // بعض النماذج محفوظة بوضعية غير T؛ نطبّق مقطع TPose (إن وجد) قبل المعايرة
  if (tposeClip) {
    const mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(tposeClip).play();
    mixer.update(0);
    mixer.stopAllAction();
  }
  const object = new THREE.Group();
  object.add(model);

  // الشبكات: نموذج ARQ (MakeHuman) ألوانه في رؤوسه COLOR_0 (جلد + ملابس ARQ)، نحافظ عليها ونلوّن العضلات فوقها.
  // نموذج بدون ألوان (X Bot) يأخذ لون جلد موحّد.
  const skins: SkinLayer[] = [];
  model.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    m.frustumCulled = false;
    m.castShadow = true;
    if (/Eyes|Logo/i.test(m.name)) return;
    // النسخة تشارك الهندسة مع القالب: ننسخها حتى لا يتراكم التلوين بين المجسّمات
    const g = m.geometry = m.geometry.clone();
    const count = g.attributes.position.count;
    let base: Float32Array;
    const existing = g.attributes.color as THREE.BufferAttribute | undefined;
    if (existing) {
      base = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) { base[i * 3] = existing.getX(i); base[i * 3 + 1] = existing.getY(i); base[i * 3 + 2] = existing.getZ(i); }
    } else {
      const c = (m.material as any)?.map ? new THREE.Color(1, 1, 1) : new THREE.Color(HUMAN_COLORS.skin).convertSRGBToLinear();
      base = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) { base[i * 3] = c.r; base[i * 3 + 1] = c.g; base[i * 3 + 2] = c.b; }
      if (!(m.material as any)?.map) m.material = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.02 });
    }
    const mat = (m.material as THREE.MeshStandardMaterial).clone();
    mat.vertexColors = true;
    m.material = mat;
    const colors = new Float32Array(base);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    skins.push({ mesh: m, base, colors, cloth: /Cloth/i.test(m.name) });
  });

  const bone = (n: string) => {
    const b = findBone(model, n);
    if (!b) throw new Error(`bone ${n} not found`);
    return b;
  };

  // ------------------------------------------------------------------ المعايرة
  // وضعية T للسائق = وضعية الراحة للنموذج (الذراعان أفقياً والكفوف للأسفل)
  applyPose(driver, { ...sym({ shoulder: [0, 90, 0] }), root: { x: 0, y: 0.97, z: 0 } }, { flatFeet: false });
  model.updateMatrixWorld(true);

  // نماذج MakeHuman محفوظة بوضعية A (الذراعان مائلتان للأسفل): ندوّر أطراف النموذج لتطابق اتجاهات أطراف السائق
  // في وضعية T قبل حساب فروق المحاور (أقصر دوران = بدون لفّ حول محور العظمة).
  const swing: [string, string, THREE.Object3D, THREE.Object3D][] = [];
  for (const [S, d] of [['Left', driver.L], ['Right', driver.R]] as const) {
    swing.push([`${S}Arm`, `${S}ForeArm`, d.shoulder, d.elbow], [`${S}ForeArm`, `${S}Hand`, d.elbow, d.wrist],
      [`${S}UpLeg`, `${S}Leg`, d.hip, d.knee], [`${S}Leg`, `${S}Foot`, d.knee, d.ankle]);
  }
  for (const [bn, cn, d0, d1] of swing) {
    const b = bone(bn); const c = bone(cn);
    const from = c.getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())).normalize();
    const to = d1.getWorldPosition(new THREE.Vector3()).sub(d0.getWorldPosition(new THREE.Vector3())).normalize();
    const qw = new THREE.Quaternion().setFromUnitVectors(from, to);
    const wq = b.getWorldQuaternion(new THREE.Quaternion());
    const pq = b.parent!.getWorldQuaternion(new THREE.Quaternion());
    b.quaternion.copy(pq.invert().multiply(qw.multiply(wq)));
    b.updateMatrixWorld(true);
  }
  model.updateMatrixWorld(true);

  const hips = bone('Hips');
  const mapping: [string, THREE.Object3D][] = [
    ['Hips', driver.root], ['Spine', driver.spine], ['Spine2', driver.chest], ['Neck', driver.neck],
    ['LeftArm', driver.L.shoulder], ['LeftForeArm', driver.L.elbow], ['LeftHand', driver.L.wrist],
    ['RightArm', driver.R.shoulder], ['RightForeArm', driver.R.elbow], ['RightHand', driver.R.wrist],
    ['LeftUpLeg', driver.L.hip], ['LeftLeg', driver.L.knee], ['LeftFoot', driver.L.ankle],
    ['RightUpLeg', driver.R.hip], ['RightLeg', driver.R.knee], ['RightFoot', driver.R.ankle],
  ];
  const pairs: Pair[] = mapping.map(([n, d]) => {
    const b = bone(n);
    const qd = d.getWorldQuaternion(new THREE.Quaternion());
    const qm = b.getWorldQuaternion(new THREE.Quaternion());
    return { bone: b, driver: d, offset: qd.clone().invert().multiply(qm) };
  });
  // موضع الحوض بالنسبة لجذر السائق
  const rootQ = driver.root.getWorldQuaternion(new THREE.Quaternion());
  const hipsOffset = hips.getWorldPosition(new THREE.Vector3())
    .sub(driver.root.getWorldPosition(new THREE.Vector3()))
    .applyQuaternion(rootQ.clone().invert());

  // قبضة اليد: نثني كل إصبع باتجاه باطن الكف (المحور يُحسب من اتجاه الإصبع ونورمال الكف في وضعية T)
  model.updateMatrixWorld(true);
  const boneByName = new Map<string, THREE.Bone>();
  model.traverse((o) => { const b = o as THREE.Bone; if (b.isBone) boneByName.set(b.name.replace(/[:_]/g, ''), b); });
  type FingerJoint = { b: THREE.Bone; rest: THREE.Quaternion; axis: THREE.Vector3; max: number };
  const fingerJoints: FingerJoint[] = [];
  const wp = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
  for (const side of ['Left', 'Right'] as const) {
    const hand = boneByName.get(B(`${side}Hand`));
    const idx = boneByName.get(B(`${side}HandIndex1`));
    const pky = boneByName.get(B(`${side}HandPinky1`));
    if (!hand || !idx || !pky) continue;
    const h = wp(hand);
    const palm = new THREE.Vector3().crossVectors(wp(idx).sub(h), wp(pky).sub(h)).normalize();
    if (palm.y > 0) palm.negate(); // في وضعية T باطن الكف للأسفل
    for (const f of ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb'] as const) {
      const chain = [1, 2, 3].map((i) => boneByName.get(B(`${side}Hand${f}${i}`))).filter(Boolean) as THREE.Bone[];
      const thumb = f === 'Thumb';
      const angles = thumb ? [12, 28, 30] : [62, 82, 52];
      chain.forEach((b, i) => {
        const next = chain[i + 1] ?? (b.children[0] as THREE.Object3D | undefined);
        const along = next ? wp(next).sub(wp(b)) : wp(b).sub(wp(chain[i - 1] ?? hand));
        along.normalize();
        const axisW = new THREE.Vector3().crossVectors(along, palm).normalize();
        const qw = b.getWorldQuaternion(new THREE.Quaternion());
        fingerJoints.push({ b, rest: b.quaternion.clone(), axis: axisW.applyQuaternion(qw.invert()), max: THREE.MathUtils.degToRad(angles[i]) });
      });
    }
  }
  const _fq = new THREE.Quaternion();
  /** 0 = كف مفتوح، 1 = قبضة كاملة حول البار */
  const setGrip = (amount: number) => {
    for (const j of fingerJoints) {
      _fq.setFromAxisAngle(j.axis, j.max * amount);
      j.b.quaternion.copy(j.rest).multiply(_fq);
    }
  };
  setGrip(0.85);

  // ------------------------------------------------------------------ نقاط الأدوات على جسم النموذج
  const armature = hips.parent!;
  const scaleComp = 1 / armature.getWorldScale(new THREE.Vector3()).x;
  const frameFor = (p: Pair) => {
    const f = new THREE.Object3D();
    f.quaternion.copy(p.offset).invert();
    f.scale.setScalar(scaleComp);
    p.bone.add(f);
    return f;
  };
  const pairOf = (n: string) => pairs.find((p) => p.bone.name.replace(/[:_]/g, '') === B(n))!;
  const child = (parent: THREE.Object3D, pos: [number, number, number]) => {
    const o = new THREE.Object3D(); o.position.set(...pos); parent.add(o); return o;
  };
  const sideProxy = (s: 'Left' | 'Right') => {
    const wrist = frameFor(pairOf(`${s}Hand`));
    const ankle = frameFor(pairOf(`${s}Foot`));
    return {
      shoulder: frameFor(pairOf(`${s}Arm`)), elbow: frameFor(pairOf(`${s}ForeArm`)), wrist,
      grip: child(wrist, [0, -0.085, 0.015]),
      hip: frameFor(pairOf(`${s}UpLeg`)), knee: frameFor(pairOf(`${s}Leg`)), ankle,
      toe: child(ankle, [0, -0.085, 0.17]), heel: child(ankle, [0, -0.085, -0.06]),
    };
  };
  const spineF = frameFor(pairOf('Spine'));
  const chestF = frameFor(pairOf('Spine2'));
  const propRig = {
    ...driver,
    object,
    root: frameFor(pairOf('Hips')) as THREE.Group,
    spine: spineF as THREE.Group,
    chest: chestF as THREE.Group,
    barOnBack: child(chestF, [0, 0.2, -0.13]),
    chestFront: child(chestF, [0, 0.1, 0.2]),
    L: sideProxy('Left'),
    R: sideProxy('Right'),
  } as unknown as Rig;

  // ------------------------------------------------------------------ مناطق العضلات (على الجلد والملابس)
  const layers = skins.map((l) => ({ ...l, regions: paintRegions(l.mesh), adj: adjacency(l.mesh.geometry) }));
  const P = new THREE.Color(HUMAN_COLORS.primary).convertSRGBToLinear();
  const Sc = new THREE.Color(HUMAN_COLORS.secondary).convertSRGBToLinear();
  const setHighlight = (primary: Muscle[], secondary: Muscle[]) => {
    for (const l of layers) {
      const { muscle, weight } = l.regions;
      const n = muscle.length;
      // شدة الأساسي والثانوي لكل رأس، ثم تنعيمها على الجيران حتى تكون حدود العضلة ناعمة لا متقطعة
      let kp = new Float32Array(n), ks = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const m = muscle[i];
        const k = Math.min(0.85, (l.cloth ? 0.55 : 0.45) + weight[i] * 0.35);
        if (m && primary.includes(m)) kp[i] = k; else if (m && secondary.includes(m)) ks[i] = k;
      }
      for (let it = 0; it < 3; it++) { kp = smoothField(kp, l.adj); ks = smoothField(ks, l.adj); }
      for (let i = 0; i < n; i++) {
        const j = i * 3;
        let r = l.base[j], g = l.base[j + 1], b = l.base[j + 2];
        const a = Math.min(1, kp[i] * 1.25), c = Math.min(1, ks[i] * 1.25) * (1 - a);
        r += (Sc.r - r) * c; g += (Sc.g - g) * c; b += (Sc.b - b) * c;
        r += (P.r - r) * a; g += (P.g - g) * a; b += (P.b - b) * a;
        l.colors[j] = r; l.colors[j + 1] = g; l.colors[j + 2] = b;
      }
      (l.mesh.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }
  };
  setHighlight([], []);

  // ------------------------------------------------------------------ التحريك
  const sync = (ground: boolean) => {
    object.position.set(0, 0, 0);
    driver.object.updateMatrixWorld(true);
    object.updateMatrixWorld(true);

    // الحوض: الموضع
    driver.root.getWorldQuaternion(_q);
    const target = driver.root.getWorldPosition(new THREE.Vector3()).add(hipsOffset.clone().applyQuaternion(_q));
    hips.position.copy(hips.parent!.worldToLocal(target));

    // الدوران: من الأب للابن
    for (const p of pairs) {
      p.driver.getWorldQuaternion(_q).multiply(p.offset);                 // الاتجاه المطلوب عالمياً
      p.bone.parent!.getWorldQuaternion(_q2).invert();
      p.bone.quaternion.copy(_q2.multiply(_q));
      p.bone.updateMatrixWorld(true);
    }
    object.updateMatrixWorld(true);

    if (ground) {
      let min = Infinity;
      for (const o of [propRig.L.toe, propRig.L.heel, propRig.R.toe, propRig.R.heel]) min = Math.min(min, o.getWorldPosition(_v).y);
      object.position.y = -min;
      object.updateMatrixWorld(true);
    }
  };

  return { object, propRig, sync, setHighlight, setGrip };
}

// ---------------------------------------------------------------------------
// تقسيم رؤوس الجلد إلى عضلات حسب العظمة المسيطرة واتجاه السطح في وضعية T
// ---------------------------------------------------------------------------
export function paintRegions(mesh: THREE.SkinnedMesh) {
  const g = mesh.geometry;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const si = g.attributes.skinIndex as THREE.BufferAttribute;
  const sw = g.attributes.skinWeight as THREE.BufferAttribute;
  const bones = mesh.skeleton.bones;
  const names = bones.map((b) => b.name.replace(/[:_]/g, '').replace('mixamorig', ''));
  // كل شيء في فضاء وضعية الربط (bind pose): الرؤوس بمصفوفة الربط، والمفاصل من مقلوب مصفوفات العظام
  const bind = mesh.bindMatrix;
  const nm = new THREE.Matrix3().getNormalMatrix(bind);
  const inv = mesh.skeleton.boneInverses;
  const wp = (n: string) => {
    const i = names.indexOf(n);
    return i < 0 ? new THREE.Vector3() : new THREE.Vector3().setFromMatrixPosition(inv[i].clone().invert());
  };
  const hipsY = wp('Hips').y;
  const chestLow = wp('Spine2').y;
  const arm = { Left: wp('LeftArm'), Right: wp('RightArm') };
  const fore = { Left: wp('LeftForeArm'), Right: wp('RightForeArm') };

  const muscle: (Muscle | null)[] = new Array(pos.count).fill(null);
  const weight = new Float32Array(pos.count);
  const p = new THREE.Vector3(); const n = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    let best = 0; let bi = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      if (w > best) { best = w; bi = si.getComponent(i, k); }
    }
    const b = names[bi] ?? '';
    p.fromBufferAttribute(pos, i).applyMatrix4(bind);
    n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
    let m: Muscle | null = null;

    if (b === 'Spine2') {
      if (n.z > 0.3 && p.y > chestLow + 0.02) m = 'chest';
      else if (n.z < -0.25) m = Math.abs(p.x) < 0.1 ? 'upperBack' : 'lats';
      else if (n.z < 0.1 && Math.abs(n.x) > 0.5) m = 'lats';
    } else if (b === 'Spine1') {
      if (n.z > 0.3) m = 'abs';
      else if (n.z < -0.2) m = Math.abs(p.x) < 0.08 ? 'lowerBack' : 'lats';
    } else if (b === 'Spine') {
      if (n.z > 0.3) m = 'abs';
      else if (n.z < -0.3) m = 'lowerBack';
    } else if (b === 'Hips') {
      if (n.z < -0.25 && p.y < hipsY + 0.02) m = 'glutes';
      else if (n.z > 0.4 && p.y > hipsY - 0.02) m = 'abs';
    } else if (b === 'Neck' || /Shoulder$/.test(b)) {
      if (n.z < -0.15 || n.y > 0.6) m = 'upperBack';
    } else if (/(Left|Right)Arm$/.test(b)) {
      const side = b.startsWith('Left') ? 'Left' : 'Right';
      const axis = fore[side].clone().sub(arm[side]);
      const len = axis.length();
      const t = p.clone().sub(arm[side]).dot(axis.normalize()) / Math.max(len, 0.01);
      if (t < 0.38) m = n.z < -0.35 ? 'rearDelts' : 'shoulders';
      else m = n.z > -0.15 ? 'biceps' : 'triceps';
    } else if (/ForeArm$/.test(b)) {
      m = 'forearms';
    } else if (/UpLeg$/.test(b)) {
      if (n.z < -0.2 && p.y > hipsY - 0.16) m = 'glutes';
      else m = n.z > -0.15 ? 'quads' : 'hamstrings';
    } else if (/Leg$/.test(b)) {
      if (n.z < -0.05) m = 'calves';
    }
    muscle[i] = m;
    weight[i] = best;
  }
  return { muscle, weight };
}

/** جيران كل رأس (من مثلثات الشبكة) */
function adjacency(g: THREE.BufferGeometry): Uint32Array[] {
  const n = g.attributes.position.count;
  const sets: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  const idx = g.index;
  const tri = (a: number, b: number, c: number) => { sets[a].add(b).add(c); sets[b].add(a).add(c); sets[c].add(a).add(b); };
  if (idx) for (let i = 0; i < idx.count; i += 3) tri(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
  else for (let i = 0; i < n; i += 3) tri(i, i + 1, i + 2);
  return sets.map((s) => Uint32Array.from(s));
}

function smoothField(f: Float32Array<ArrayBuffer>, adj: Uint32Array[]): Float32Array<ArrayBuffer> {
  const out = new Float32Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const nb = adj[i];
    let s = 0;
    for (let k = 0; k < nb.length; k++) s += f[nb[k]];
    out[i] = nb.length ? f[i] * 0.4 + (s / nb.length) * 0.6 : f[i];
  }
  return out;
}
