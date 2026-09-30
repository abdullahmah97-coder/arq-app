// ملاءمة الحركة لجسم النموذج والأجهزة: الجسم يرتكز فعلاً على المقعد/المسند/البنش (بدون ما يطفو أو يدخل فيه)،
// والقدمين على الأرض في تمارين الجلوس والاستلقاء، والجسم على المات في التمارين الأرضية. تنحسب مرة وحدة عند فتح
// التمرين لكل نموذج (رجل/امرأة) لأن مقاسات الجسمين تختلف، وبعدها كل إطار ياخذ القيم الجاهزة
// (إزاحة الجسم + تعديل الركبة + ميلان الجسم + ثني الكتف).
import * as THREE from 'three';
import { GroundPart, type ContactRegion, type Human } from './human';
import { floorFor, motionDuration, poseOpts, sampleMotion, type Motion } from './motions';
import { applyPose, poseQuats, type Pose, type PropsRuntime, type Rig, type Support, type SupportRole } from './rig';

const REGION_OF: Record<Exclude<SupportRole, 'mat'>, ContactRegion> = { bench: 'back', seat: 'seat', back: 'back' };
/** فراغ بسيط بين الجسم والإسفنج (ما يبان، بس يمنع التداخل بالرسم) */
const GAP = 0.004;
/** فراغ بين أوطى نقطة بالجسم والأرض/المات */
const GROUND_GAP = 0.001;
const D = THREE.MathUtils.degToRad;

export interface Fit {
  dur: number;
  /** أوقات العينات داخل الدورة (تصاعدي) */
  times: number[];
  off: THREE.Vector3[];
  kneeL: number[];
  kneeR: number[];
  /** ميلان إضافي للجسم كامل (درجات) عشان يلمس جزأين الأرض مع بعض */
  pitch: number[];
  /** ثني إضافي للكتفين (درجات) عشان الكفين على الأرض (تمارين الاستلقاء) */
  arm: number[];
  /** إبعاد إضافي للفخذين (درجات، نفس الشي للجهتين) عشان القدمين تبقى بمكانها بالوقوف */
  abd: number[];
  /** ثني إضافي للورك (درجات) — القدم ثابتة بمكانها والجسم على جهاز (هيب ثرست) */
  hipL: number[];
  hipR: number[];
  /** ثني إضافي للكوعين (درجات) — الكفين ثابتة بمكانها (ديبس) */
  elbow: number[];
  /** إبعاد الكتفين (بار صلب بين اليدين المعلّقة) */
  armAbd: number[];
}

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _t = new THREE.Vector3();

// ------------------------------------------------------------------ حساب مواضع رؤوس الجسم (Skinning على المعالج)
type Prepared = { mesh: THREE.SkinnedMesh; idx: Uint32Array; base: Float32Array; si: THREE.BufferAttribute; sw: THREE.BufferAttribute; part?: Uint8Array; mats: THREE.Matrix4[] };
const prepared = new WeakMap<Human, Record<ContactRegion, Prepared[]>>();

function prep(human: Human): Record<ContactRegion, Prepared[]> {
  let p = prepared.get(human);
  if (p) return p;
  const make = (list: Human['contact'][ContactRegion]) => list.map(({ mesh, idx, part }) => {
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
    const base = new Float32Array(idx.length * 3);
    for (let k = 0; k < idx.length; k++) {
      _v.fromBufferAttribute(pos, idx[k]).applyMatrix4(mesh.bindMatrix);
      base[k * 3] = _v.x; base[k * 3 + 1] = _v.y; base[k * 3 + 2] = _v.z;
    }
    return { mesh, idx, base, part, si: mesh.geometry.attributes.skinIndex as THREE.BufferAttribute, sw: mesh.geometry.attributes.skinWeight as THREE.BufferAttribute,
      mats: mesh.skeleton.bones.map(() => new THREE.Matrix4()) };
  });
  const all = {} as Record<ContactRegion, Prepared[]>;
  for (const r of Object.keys(human.contact) as ContactRegion[]) all[r] = make(human.contact[r]);
  p = all;
  prepared.set(human, p);
  return p;
}

/** رؤوس منطقة معيّنة بعد الـ skinning (fn لكل رأس بإحداثيات العالم + رقم جزئه) */
function eachVertex(human: Human, region: ContactRegion, fn: (v: THREE.Vector3, part: number) => void) {
  for (const P of prep(human)[region]) {
    const bones = P.mesh.skeleton.bones;
    const inv = P.mesh.skeleton.boneInverses;
    const mats = P.mats;
    for (let i = 0; i < bones.length; i++) mats[i].multiplyMatrices(bones[i].matrixWorld, inv[i]);
    const post = _m.multiplyMatrices(P.mesh.matrixWorld, P.mesh.bindMatrixInverse);
    for (let k = 0; k < P.idx.length; k++) {
      const i = P.idx[k];
      _v.set(0, 0, 0);
      for (let c = 0; c < 4; c++) {
        const w = P.sw.getComponent(i, c);
        if (!w) continue;
        _t.set(P.base[k * 3], P.base[k * 3 + 1], P.base[k * 3 + 2]).applyMatrix4(mats[P.si.getComponent(i, c)]);
        _v.addScaledVector(_t, w);
      }
      fn(_v.applyMatrix4(post), P.part ? P.part[k] : 0);
    }
  }
}

/** أقرب مسافة بين الجسم وسطح الإسناد داخل حدوده (موجبة = فراغ، سالبة = داخل الإسفنج). Infinity = ما فوقه شي */
function gapTo(human: Human, s: Support): number {
  let best = Infinity;
  eachVertex(human, REGION_OF[s.role as Exclude<SupportRole, 'mat'>], (v) => {
    _d.copy(v).sub(s.c);
    if (Math.abs(_d.dot(s.u)) > s.hu || Math.abs(_d.dot(s.v)) > s.hv) return;
    const g = _d.dot(s.n);
    if (g > -0.2 && g < best) best = g;
  });
  return best;
}

type FloorAt = (x: number, z: number) => number;
const PARTS = 5;
/** مسح واحد: أقرب فراغ للأرض/المات لكل جزء من الجسم (0 باقي الجسم، 1 كفين، 2 قدمين، 3 ركب/أفخاذ، 4 ساعدين) */
function scanGround(human: Human, floorAt: FloorAt, out: Float64Array): Float64Array {
  out.fill(Infinity);
  eachVertex(human, 'ground', (v, part) => { const g = v.y - floorAt(v.x, v.z); if (g < out[part]) out[part] = g; });
  return out;
}

/** إزاحة تخلي الجسم يلمس كل الأسطح (أقل مربعات على اتجاهات أعمدتها) */
function solve(ds: number[], ns: THREE.Vector3[]): THREE.Vector3 {
  const r = ds.map((d) => GAP - d);
  if (ns.length === 1) return ns[0].clone().multiplyScalar(r[0]);
  const [n1, n2] = ns;
  const g = n1.dot(n2);
  const det = 1 - g * g;
  if (Math.abs(det) < 1e-3) return n1.clone().multiplyScalar(Math.max(r[0], r[1]));
  const a = (r[0] - r[1] * g) / det;
  const b = (r[1] - r[0] * g) / det;
  return n1.clone().multiplyScalar(a).addScaledVector(n2, b);
}

/**
 * أوقات العينات: كل وضعية مفتاحية + منتصف كل انتقال (وربعه وثلاث أرباعه للتمارين الأرضية: الجسم يدور كثير،
 * وكل سدس للكفين الثابتة: الذراع تنثني كثير والقبضة لازم تبقى بمكانها بين العينات)
 */
function sampleTimes(m: Motion, dense: 0 | 1 | 2): number[] {
  const out: number[] = [];
  let t = 0;
  const fr = dense === 2 ? [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6] : dense ? [0.25, 0.5, 0.75] : [0.5];
  m.keys.forEach((_, i) => {
    const hold = m.hold?.[i] ?? 0;
    const dur = m.tempo[i] ?? 1;
    // بداية ونهاية الثبات (الوضعية نفسها طول الثبات، فالملاءمة تبقى ثابتة بينهم بالضبط)
    out.push(t);
    if (hold > 0.02) out.push(t + hold);
    t += hold;
    if (m.keys.length > 1) for (const f of fr) out.push(t + dur * f);
    t += dur;
  });
  return out;
}

const withKnees = (p: Pose, kL: number, kR: number): Pose => (kL || kR ? { ...p, lKnee: (p.lKnee ?? 0) + kL, rKnee: (p.rKnee ?? 0) + kR } : p);
const withPitch = (p: Pose, d: number): Pose => (d ? { ...p, root: { ...p.root, pitch: (p.root?.pitch ?? 0) + d } } : p);
const abdHip = (h: Pose['lHip'], d: number): [number, number, number] => [h?.[0] ?? 0, (h?.[1] ?? 0) + d, h?.[2] ?? 0];
const withAbd = (p: Pose, d: number): Pose => (d ? { ...p, lHip: abdHip(p.lHip, d), rHip: abdHip(p.rHip, d) } : p);
const flexHip = (h: Pose['lHip'], d: number): [number, number, number] => [(h?.[0] ?? 0) + d, h?.[1] ?? 0, h?.[2] ?? 0];
const withHips = (p: Pose, dL: number, dR: number): Pose => (dL || dR ? { ...p, lHip: flexHip(p.lHip, dL), rHip: flexHip(p.rHip, dR) } : p);
const withElbows = (p: Pose, d: number): Pose => (d ? { ...p, lElbow: (p.lElbow ?? 0) + d, rElbow: (p.rElbow ?? 0) + d } : p);
const _X = new THREE.Vector3(1, 0, 0);
const _Z = new THREE.Vector3(0, 0, 1);
/** ثني الكتفين (الذراع كاملة حول محور الصدر الجانبي) بدون ما يتغير باقي دورانها */
function withArmFlex(p: Pose, d: number): Pose {
  if (!d) return p;
  const q = p.q ?? poseQuats(p);
  const r = new THREE.Quaternion().setFromAxisAngle(_X, D(-d));
  return { ...p, q: { ...q, lShoulder: r.clone().multiply(q.lShoulder), rShoulder: r.clone().multiply(q.rShoulder) } };
}

/** إبعاد الكتفين للجنب (بإطار الصدر، نفس الشي للجهتين): موجب = الذراعين تبتعد عن الجسم */
function withArmAbd(p: Pose, d: number): Pose {
  if (!d) return p;
  const q = p.q ?? poseQuats(p);
  const rl = new THREE.Quaternion().setFromAxisAngle(_Z, D(d)); const rr = new THREE.Quaternion().setFromAxisAngle(_Z, D(-d));
  return { ...p, q: { ...q, lShoulder: rl.multiply(q.lShoulder), rShoulder: rr.multiply(q.rShoulder) } };
}

/** بحث عن جذر f(d)=0 الأقرب للصفر: خطوات للخارج (بالترتيب المعطى) ثم تنصيف. يرجع null لو ما لقى */
function nearestRoot(f: (d: number) => number, steps: number[], tol = 0.0015): number | null {
  const f0 = f(0);
  if (!Number.isFinite(f0)) return null;
  if (Math.abs(f0) <= tol) return 0;
  let lo: [number, number] = [0, f0]; let hi: [number, number] | null = null;
  const prev: Record<string, [number, number]> = { p: [0, f0], n: [0, f0] };
  for (const d of steps) {
    const fd = f(d);
    if (!Number.isFinite(fd)) continue;
    const s = d > 0 ? 'p' : 'n';
    if (Math.sign(fd) !== Math.sign(prev[s][1])) { lo = prev[s]; hi = [d, fd]; break; }
    prev[s] = [d, fd];
  }
  if (!hi) return null;
  for (let i = 0; i < 6; i++) {
    const mid: number = (lo[0] + hi[0]) / 2; const fm: number = f(mid);
    if (Math.sign(fm) === Math.sign(lo[1])) lo = [mid, fm]; else hi = [mid, fm];
  }
  return lo[0] + (hi[0] - lo[0]) * (lo[1] / (lo[1] - hi[1]));
}

/** جذر f(d)=0 لدالة شبه خطية (ميلان الجسم، ثني الكتف): قاطع (secant) من الصفر، وإذا ما نفع نرجع للبحث بالخطوات */
function secantRoot(f: (d: number) => number, step: number, limit: number, tol = 0.0015): number | null {
  let a = 0; let fa = f(0);
  if (!Number.isFinite(fa)) return null;
  if (Math.abs(fa) <= tol) return 0;
  let b = step; let fb = f(b);
  for (let i = 0; i < 6 && Number.isFinite(fb); i++) {
    if (Math.abs(fb) <= tol) return b;
    if (fb === fa) break;
    const c = b - fb * (b - a) / (fb - fa);
    if (!Number.isFinite(c) || Math.abs(c) > limit) break;
    a = b; fa = fb; b = c; fb = f(c);
  }
  if (Number.isFinite(fb) && Math.abs(fb) <= tol * 3) return b;
  const steps: number[] = [];
  for (const d of [step, step * 2, step * 3.5, step * 5]) if (Math.abs(d) <= limit) steps.push(d, -d);
  return nearestRoot(f, steps, tol);
}

/**
 * يحسب الملاءمة للحركة (null لو الحركة ما تحتاج: وقوف أو بدون أسطح).
 * rest في الحركة: أي أسطح يرتكز عليها (bench / seat / back)، floor = القدمين على الأرض،
 * ground = الجسم على الأرض/المات، palms = الكفين على الأرض جنب الجسم (تمارين الاستلقاء).
 */
export function fitMotion(human: Human, driver: Rig, props: PropsRuntime, m: Motion): Fit | null {
  const rest = m.rest ?? [];
  const sups = props.supports.filter((s) => s.role !== 'mat' && (rest as string[]).includes(s.role));
  const feet = rest.includes('floor');
  const ground = rest.includes('ground');
  const palms = ground && rest.includes('palms');
  const opts = poseOpts(m);
  // القدم الثابتة بمكانها (الوقوف، أو القدمين على جهاز): السائق يثبّتها تقريباً، بس عظام النموذج أطوالها غير فنصححها عليه
  const plantSide = m.plant === 'none' ? null : m.ground ? m.plant ?? 'both' : m.plant ?? null;
  if (!sups.length && !feet && !ground && !plantSide && !m.handsFixed && !m.rigidGrip) return null;
  // ارتفاع الأرض تحت نقطة: سطح المات/الصندوق إذا فوقه، وإلا الأرض (صفر)
  const floors = props.supports.filter((s) => s.role === 'mat');
  const _p = new THREE.Vector3();
  const floorAt: FloorAt = (x, z) => {
    let h = 0;
    for (const s of floors) {
      _p.set(x - s.c.x, 0, z - s.c.z);
      if (Math.abs(_p.dot(s.u)) <= s.hu && Math.abs(_p.dot(s.v)) <= s.hv) h = Math.max(h, s.c.y);
    }
    return h;
  };
  const flatSide = (side: 'L' | 'R') => m.flatFeet === undefined || m.flatFeet === true || m.flatFeet === side;
  // عينات أكثف للتمارين الأرضية القصيرة (الجسم يدور كثير بين وضعيتين) وللقدم اللي على ظهرها فوق بنش (تتدحرج عليه)،
  // والحركات المتصلة الطويلة تكفيها المنتصفات
  const times = sampleTimes(m, m.keys.length > 6 ? 0 : m.handsFixed && m.keys.length <= 3 ? 2 : ground || plantSide || m.rigidGrip || (feet && !(flatSide('L') && flatSide('R'))) ? 1 : 0);
  // الكفين الثابتة: مكان القبضتين بأول عينة (أول وضعية)
  const gripAt = { L: new THREE.Vector3(), R: new THREE.Vector3() }; let gripSet = false;
  // البار الصلب: المسافة بين القبضتين بأول عينة
  let gripW0 = -1;
  const fit: Fit = { dur: motionDuration(m), times, off: [], kneeL: [], kneeR: [], pitch: [], arm: [], abd: [], hipL: [], hipR: [], elbow: [], armAbd: [] };

  // حماية الأرض (القدم ما تدخل الأرض) نفس وقت الرسم، إلا إذا الملاءمة نفسها تحط القدمين/الجسم على الأرض بالضبط
  const guard = feet || ground ? undefined : floorFor(m);
  const frame = (p: Pose, off: THREE.Vector3) => {
    applyPose(driver, p, opts);
    human.sync(!!m.ground, guard, off);
  };
  // القدم المسطحة: أوطى نقطة بالنعل (الكعب أو الأصابع). القدم اللي تتبع ساقها (على ظهرها فوق بنش مثلاً): أوطى رأس فيها
  const footLow = (side: 'L' | 'R') => {
    if (!flatSide(side)) {
      let g = Infinity;
      eachVertex(human, side === 'L' ? 'footL' : 'footR', (v) => { const d = v.y - floorAt(v.x, v.z); if (d < g) g = d; });
      if (Number.isFinite(g)) return g;
    }
    const S = human.propRig[side];
    S.toe.getWorldPosition(_v); const t = _v.y - floorAt(_v.x, _v.z);
    S.heel.getWorldPosition(_v); return Math.min(t, _v.y - floorAt(_v.x, _v.z));
  };

  // الأرض: فراغ كل جزء ناقص رفعته المطلوبة (مثلاً الكفين على عجلة البطن فوق الأرض)
  const lift = new Float64Array(PARTS);
  for (const [n, h] of Object.entries(m.contactLift ?? {})) lift[GroundPart[n as keyof typeof GroundPart]] = h ?? 0;
  const pair = ground && m.contacts?.length === 2 ? m.contacts.map((n) => GroundPart[n]) : null;
  const scan = new Float64Array(PARTS);
  const eff = (i: number) => scan[i] - lift[i];
  const lowest = (skipHands: boolean) => {
    let b = Infinity;
    for (let i = 0; i < PARTS; i++) if (!(skipHands && i === GroundPart.hands)) b = Math.min(b, eff(i));
    return b;
  };
  // منتصف كل قدم (بين الكعب والأصابع) على النموذج، ومكانها بأول وضعية (المرجع)
  const fL = new THREE.Vector3(); const fR = new THREE.Vector3(); const fC = new THREE.Vector3();
  const feetMid = () => {
    const { L, R } = human.propRig;
    L.toe.getWorldPosition(fL).add(L.heel.getWorldPosition(_v)).multiplyScalar(0.5);
    R.toe.getWorldPosition(fR).add(R.heel.getWorldPosition(_v)).multiplyScalar(0.5);
    return fC.copy(plantSide === 'L' ? fL : plantSide === 'R' ? fR : _v.copy(fL).add(fR).multiplyScalar(0.5));
  };
  const plantAt = new THREE.Vector3(); let width0 = 0;
  const at0 = { L: new THREE.Vector3(), R: new THREE.Vector3() };
  if (plantSide) {
    frame(m.keys[0], new THREE.Vector3());
    plantAt.copy(feetMid()); width0 = fL.x - fR.x;
    at0.L.copy(fL); at0.R.copy(fR);
    for (const side of ['L', 'R'] as const) if (!flatSide(side)) human.propRig[side].heel.getWorldPosition(at0[side]);
  }
  // القدمين ثابتة على الأرض والجسم مرتكز على جهاز (هيب ثرست): كل رجل نحل وركها وركبتها (القدم على الأرض وبمكانها)
  // بدل ما نحرك الجسم كامل (يخرّب ارتكاز الظهر)
  const legIK = !m.ground && !!plantSide && feet;

  /** الجسم على الأرض: أوطى جزء (بعد الرفع) يلمس السطح بالضبط */
  const settle = (p: Pose, off: THREE.Vector3, skipHands = false) => {
    frame(p, off);
    scanGround(human, floorAt, scan);
    const g = lowest(skipHands);
    if (Number.isFinite(g)) off.y -= g - GROUND_GAP;
  };

  for (const t of times) {
    const pose0 = sampleMotion(m, t);
    let pose = pose0;
    const off = new THREE.Vector3();
    let dp = 0; let da = 0; let ab = 0;
    let kL = 0; let kR = 0; let hL = 0; let hR = 0;
    // سلسلة مقفلة بدون حل الرجلين (القدم ثابتة والجسم على مقعد مثلاً): نكرر تثبيت القدم والأسطح والركب لين تتفق
    const closed = !!plantSide && !legIK && (sups.length > 0 || feet);
    const plantStep = (p: Pose, withY: boolean) => {
      frame(p, off);
      _d.copy(feetMid()).sub(plantAt);
      off.x -= _d.x; off.z -= _d.z;
      if (withY) off.y -= _d.y;
    };
    // ٠) القدم الثابتة: عرض الوقفة يبقى نفسه (إبعاد الفخذين)، ومكان القدم نفسه (إزاحة الجسم كامل)
    if (plantSide && !legIK) {
      if (plantSide === 'both' && m.ground) {
        ab = secantRoot((d) => { frame(withAbd(pose0, d), off); feetMid(); return (fL.x - fR.x) - width0; }, 2, 25, 0.001) ?? 0;
        pose = withAbd(pose0, ab);
      }
      plantStep(pose, !m.ground && !closed);
    }
    for (let pass = 0; pass < (closed ? 3 : 1); pass++) {
      if (pass) plantStep(withKnees(pose, kL, kR), false);
      // ١) الجسم على الأسطح (مقعد/مسند/بنش)
      for (let it = 0; it < 4 && sups.length; it++) {
        frame(pose, off);
        const ds = sups.map((s) => gapTo(human, s));
        const ok = ds.map((d) => Number.isFinite(d));
        const use = sups.filter((_, i) => ok[i]);
        if (!use.length) break;
        const T = solve(ds.filter((_, i) => ok[i]), use.map((s) => s.n));
        off.add(T);
        if (T.length() < 0.0008) break;
      }
      if (ground && !pass) {
        // ٢) أوطى نقطة على المات (بدون الكفين لو بتنزل بثني الكتف)
        settle(pose, off, palms);
        // ٣) جزأين على الأرض مع بعض (الكفين وأصابع القدم بالضغط): نميل الجسم كامل حول الحوض لين يتساوى فراغهم
        if (pair) {
          const [a, b] = pair;
          dp = secantRoot((d) => { frame(withPitch(pose0, d), off); scanGround(human, floorAt, scan); return eff(a) - eff(b); }, 3, 18) ?? 0;
          pose = withPitch(pose0, dp);
          settle(pose, off, palms);
        }
        // ٤) الكفين على الأرض جنب الجسم: نثني الكتفين لين الكف يوصل للأرض (نفس مستوى أوطى نقطة بالجسم)
        if (palms) {
          const base = pose;
          da = secantRoot((d) => {
            frame(withArmFlex(base, d), off); scanGround(human, floorAt, scan);
            return eff(GroundPart.hands) - lowest(true);
          }, -5, 40) ?? 0;
          pose = withArmFlex(base, da);
        }
      }
      // ٥) القدمين على الأرض: نعدّل ثني الركبة (أقرب زاوية للمكتوبة اللي تخلي القدم على الأرض)
      //    نبحث من الصفر للخارج بخطوات ١٠° (الفرد قبل الثني: القدم تنزل قدام مو تحت المقعد)، وبعدها تنصيف داخل المجال
      if (legIK) {
        // نيوتن بمتغيرين لكل رجل (ثني الورك والركبة): القدم على الأرض (ارتفاع صفر) وبنفس مكانها الأفقي بأول وضعية
        for (const side of ['L', 'R'] as const) {
          if (plantSide !== 'both' && plantSide !== side) continue;
          const S = human.propRig[side]; const goal = at0[side];
          const res = (h: number, k: number): [number, number] => {
            frame(side === 'L' ? withHips(withKnees(pose, k, kR), h, hR) : withHips(withKnees(pose, kL, k), hL, h), off);
            // القدم المسطحة: منتصفها ثابت، والقدم اللي تتبع ساقها (الكعب على الأرض والأصابع للأعلى): الكعب ثابت وهي تدور عليه
            S.toe.getWorldPosition(_v); const tz = _v.z; S.heel.getWorldPosition(_v);
            return [footLow(side), (flatSide(side) ? (tz + _v.z) / 2 : _v.z) - goal.z];
          };
          let h = 0; let k = 0;
          for (let it = 0; it < 8; it++) {
            const r = res(h, k);
            if (Math.abs(r[0]) < 5e-4 && Math.abs(r[1]) < 1e-3) break;
            const rh = res(h + 1.5, k); const rk = res(h, k + 1.5);
            const a = (rh[0] - r[0]) / 1.5; const b = (rk[0] - r[0]) / 1.5; const c = (rh[1] - r[1]) / 1.5; const d = (rk[1] - r[1]) / 1.5;
            const det = a * d - b * c;
            if (Math.abs(det) < 1e-9) break;
            let dh = -(d * r[0] - b * r[1]) / det; let dk = -(-c * r[0] + a * r[1]) / det;
            const big = Math.max(Math.abs(dh), Math.abs(dk));
            if (big > 12) { dh *= 12 / big; dk *= 12 / big; }
            h += dh; k += dk;
          }
          if (side === 'L') { hL = h; kL = k; } else { hR = h; kR = k; }
        }
      } else if (feet) {
        for (const side of ['L', 'R'] as const) {
          const at = (d: number) => { frame(side === 'L' ? withKnees(pose, d, kR) : withKnees(pose, kL, d), off); return footLow(side); };
          let k = nearestRoot(at, [-10, 10, -20, 20, -30, 30, -40, 40, -50, 50], 1e-4);
          if (k === null) {
            // ما وصلت (المقعد عالي مثلاً): أقرب زاوية للأرض
            let best = 0; let bestAbs = Math.abs(at(0));
            for (const d of [-10, 10, -20, 20, -30, 30]) { const f = Math.abs(at(d)); if (f < bestAbs - 0.002) { bestAbs = f; best = d; } }
            k = best;
          }
          if (side === 'L') kL = k; else kR = k;
        }
      }
    }
    if (ground) settle(withKnees(pose, kL, kR), off);
    // ٦) الكفين ثابتة بمكانها: نيوتن بمتغيرين (ثني الكتفين والكوعين، نفس الشي للجهتين) لين القبضة ترجع لمكانها (ارتفاع وقدام/ورا)
    let de = 0; let sa = 0;
    if (m.handsFixed) {
      const base0 = withHips(withKnees(pose, kL, kR), hL, hR);
      const base = base0;
      const { L, R } = human.propRig;
      // 'pelvis' = الكفين ماسكة شي على الحوض (دمبل الهيب ثرست): ثابتة بالنسبة للحوض مو للعالم
      const onPelvis = m.handsFixed === 'pelvis';
      const gripOf = (S: typeof L, out: THREE.Vector3) => (onPelvis ? human.propRig.root.worldToLocal(S.grip.getWorldPosition(out)) : S.grip.getWorldPosition(out));
      if (!gripSet) {
        frame(base, off); gripOf(L, gripAt.L); gripOf(R, gripAt.R); gripSet = true;
        if (m.rigidGrip) gripW0 = gripAt.L.distanceTo(gripAt.R);
      } else {
        const res = (a: number, e: number): [number, number] => {
          frame(withElbows(withArmFlex(base, a), e), off);
          gripOf(L, _v); const ly = _v.y - gripAt.L.y; const lz = _v.z - gripAt.L.z;
          gripOf(R, _v);
          return [(ly + _v.y - gripAt.R.y) / 2, (lz + _v.z - gripAt.R.z) / 2];
        };
        let a = 0; let e = 0;
        if (!m.rigidGrip) {
          for (let it = 0; it < 8; it++) {
            const r = res(a, e);
            if (Math.abs(r[0]) < 1e-3 && Math.abs(r[1]) < 1e-3) break;
            const ra = res(a + 1.5, e); const re = res(a, e + 1.5);
            const j11 = (ra[0] - r[0]) / 1.5; const j12 = (re[0] - r[0]) / 1.5; const j21 = (ra[1] - r[1]) / 1.5; const j22 = (re[1] - r[1]) / 1.5;
            const det = j11 * j22 - j12 * j21;
            if (Math.abs(det) < 1e-9) break;
            let s1 = -(j22 * r[0] - j12 * r[1]) / det; let s2 = -(-j21 * r[0] + j11 * r[1]) / det;
            const big = Math.max(Math.abs(s1), Math.abs(s2));
            if (big > 12) { s1 *= 12 / big; s2 *= 12 / big; }
            a += s1; e += s2;
          }
        } else {
          // بار صلب (عقلة): نيوتن بثلاث متغيرات (ثني الكتف، الكوع، إبعاد الكتف) لثلاث شروط: ارتفاع القبضة، مكانها قدام/ورا، وعرضها
          const res3 = (x: number[]): number[] => {
            frame(withElbows(withArmFlex(withArmAbd(base0, x[2]), x[0]), x[1]), off);
            gripOf(L, _v); const ly = _v.y - gripAt.L.y; const lz = _v.z - gripAt.L.z;
            const w = _v.distanceTo(gripOf(R, _d));
            return [(ly + _d.y - gripAt.R.y) / 2, (lz + _d.z - gripAt.R.z) / 2, (w - gripW0) / 2];
          };
          const x = [0, 0, 0];
          for (let it = 0; it < 10; it++) {
            const r = res3(x);
            if (Math.max(Math.abs(r[0]), Math.abs(r[1]), Math.abs(r[2])) < 1e-3) break;
            const J = [0, 1, 2].map((c) => { const y = [...x]; y[c] += 1.5; const rc = res3(y); return rc.map((v, k) => (v - r[k]) / 1.5); });
            // J[c][k] = d r_k / d x_c → نحل J^T · dx = -r
            const A = [0, 1, 2].map((k) => [J[0][k], J[1][k], J[2][k], -r[k]]);
            let ok = true;
            for (let c = 0; c < 3 && ok; c++) {
              let p = c; for (let k = c + 1; k < 3; k++) if (Math.abs(A[k][c]) > Math.abs(A[p][c])) p = k;
              if (Math.abs(A[p][c]) < 1e-9) { ok = false; break; }
              [A[c], A[p]] = [A[p], A[c]];
              for (let k = 0; k < 3; k++) if (k !== c) { const f = A[k][c] / A[c][c]; for (let j = c; j < 4; j++) A[k][j] -= f * A[c][j]; }
            }
            if (!ok) break;
            const dx = [0, 1, 2].map((c) => A[c][3] / A[c][c]);
            const big = Math.max(...dx.map(Math.abs));
            const k = big > 12 ? 12 / big : 1;
            for (let c = 0; c < 3; c++) x[c] += dx[c] * k;
          }
          a = x[0]; e = x[1]; sa = x[2];
        }
        da = a; de = e;
      }
    }
    // ٧) بار صلب بين اليدين (لات بول داون/عقلة): المسافة بين القبضتين ثابتة طول الحركة — نعدّل ثني الكوعين
    //    (بين وضعيتين، الكتف يلف أقصر طريق والكوع يتغير خطياً فاليدين تتباعد بالنص كأنها تزحلق على البار)
    if (m.rigidGrip && !m.handsFixed) {
      const base = withArmFlex(withHips(withKnees(pose, kL, kR), hL, hR), da);
      const { L, R } = human.propRig;
      const width = (e: number) => { frame(withElbows(base, e), off); L.grip.getWorldPosition(_v); return _v.distanceTo(R.grip.getWorldPosition(_d)); };
      if (gripW0 < 0) gripW0 = width(0);
      else de = secantRoot((e) => width(e) - gripW0, 6, 60, 0.002) ?? 0;
    }
    fit.off.push(off);
    fit.kneeL.push(kL);
    fit.kneeR.push(kR);
    fit.pitch.push(dp);
    fit.arm.push(da);
    fit.abd.push(ab);
    fit.hipL.push(hL);
    fit.hipR.push(hR);
    fit.elbow.push(de);
    fit.armAbd.push(sa);
  }
  return fit;
}

/** قيم الملاءمة عند الزمن t (خطي بين العينات، والحركة تدور) */
export function fitAt(fit: Fit, t: number, out = new THREE.Vector3()): { off: THREE.Vector3; kL: number; kR: number; dp: number; da: number; ab: number; hL: number; hR: number; de: number; sa: number } {
  const { times, dur } = fit;
  const n = times.length;
  const x = ((t % dur) + dur) % dur;
  let i = n - 1;
  for (let k = 0; k < n; k++) if (times[k] <= x) i = k;
  const j = (i + 1) % n;
  const t0 = times[i];
  let t1 = times[j];
  let xx = x;
  if (j <= i) { t1 += dur; if (xx < t0) xx += dur; }
  const f = t1 > t0 ? Math.min(1, Math.max(0, (xx - t0) / (t1 - t0))) : 0;
  out.copy(fit.off[i]).lerp(fit.off[j], f);
  const lin = (a: number[]) => a[i] + (a[j] - a[i]) * f;
  return { off: out, kL: lin(fit.kneeL), kR: lin(fit.kneeR), dp: lin(fit.pitch), da: lin(fit.arm), ab: lin(fit.abd), hL: lin(fit.hipL), hR: lin(fit.hipR), de: lin(fit.elbow), sa: lin(fit.armAbd) };
}

/** الوضعية والإزاحة الجاهزة للرسم عند الزمن t */
export function fittedFrame(m: Motion, fit: Fit | null, t: number, out = new THREE.Vector3()): { pose: Pose; off: THREE.Vector3 | null } {
  const pose = sampleMotion(m, t);
  if (!fit) return { pose, off: null };
  const f = fitAt(fit, t, out);
  return { pose: withElbows(withArmFlex(withArmAbd(withPitch(withKnees(withHips(withAbd(pose, f.ab), f.hL, f.hR), f.kL, f.kR), f.dp), f.sa), f.da), f.de), off: f.off };
}
