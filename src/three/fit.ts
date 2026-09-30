// ملاءمة الحركة لجسم النموذج والأجهزة: الجسم يرتكز فعلاً على المقعد/المسند/البنش (بدون ما يطفو أو يدخل فيه)،
// والقدمين على الأرض في تمارين الجلوس والاستلقاء. تنحسب مرة وحدة عند فتح التمرين لكل نموذج (رجل/امرأة)
// لأن مقاسات الجسمين تختلف، وبعدها كل إطار ياخذ القيم الجاهزة (إزاحة الجسم + تعديل الركبة).
import * as THREE from 'three';
import type { ContactRegion, Human } from './human';
import { floorFor, motionDuration, poseOpts, sampleMotion, type Motion } from './motions';
import { applyPose, type Pose, type PropsRuntime, type Rig, type Support, type SupportRole } from './rig';

const REGION_OF: Record<SupportRole, ContactRegion> = { bench: 'back', seat: 'seat', back: 'back' };
/** فراغ بسيط بين الجسم والإسفنج (ما يبان، بس يمنع التداخل بالرسم) */
const GAP = 0.004;

export interface Fit {
  dur: number;
  /** أوقات العينات داخل الدورة (تصاعدي) */
  times: number[];
  off: THREE.Vector3[];
  kneeL: number[];
  kneeR: number[];
}

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Matrix4();

// ------------------------------------------------------------------ حساب مواضع رؤوس الجسم (Skinning على المعالج)
type Prepared = { mesh: THREE.SkinnedMesh; idx: Uint32Array; base: Float32Array; si: THREE.BufferAttribute; sw: THREE.BufferAttribute };
const prepared = new WeakMap<Human, Record<ContactRegion, Prepared[]>>();

function prep(human: Human): Record<ContactRegion, Prepared[]> {
  let p = prepared.get(human);
  if (p) return p;
  const make = (list: Human['contact'][ContactRegion]) => list.map(({ mesh, idx }) => {
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
    const base = new Float32Array(idx.length * 3);
    for (let k = 0; k < idx.length; k++) {
      _v.fromBufferAttribute(pos, idx[k]).applyMatrix4(mesh.bindMatrix);
      base[k * 3] = _v.x; base[k * 3 + 1] = _v.y; base[k * 3 + 2] = _v.z;
    }
    return { mesh, idx, base, si: mesh.geometry.attributes.skinIndex as THREE.BufferAttribute, sw: mesh.geometry.attributes.skinWeight as THREE.BufferAttribute };
  });
  p = { back: make(human.contact.back), seat: make(human.contact.seat) };
  prepared.set(human, p);
  return p;
}

/** أقرب مسافة بين الجسم وسطح الإسناد داخل حدوده (موجبة = فراغ، سالبة = داخل الإسفنج). Infinity = ما فوقه شي */
function gapTo(human: Human, s: Support): number {
  let best = Infinity;
  const tmp = new THREE.Vector3();
  for (const P of prep(human)[REGION_OF[s.role]]) {
    const bones = P.mesh.skeleton.bones;
    const inv = P.mesh.skeleton.boneInverses;
    const mats = bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, inv[i]));
    const post = _m.multiplyMatrices(P.mesh.matrixWorld, P.mesh.bindMatrixInverse);
    for (let k = 0; k < P.idx.length; k++) {
      const i = P.idx[k];
      _v.set(0, 0, 0);
      for (let c = 0; c < 4; c++) {
        const w = P.sw.getComponent(i, c);
        if (!w) continue;
        tmp.set(P.base[k * 3], P.base[k * 3 + 1], P.base[k * 3 + 2]).applyMatrix4(mats[P.si.getComponent(i, c)]);
        _v.addScaledVector(tmp, w);
      }
      _v.applyMatrix4(post);
      _d.copy(_v).sub(s.c);
      if (Math.abs(_d.dot(s.u)) > s.hu || Math.abs(_d.dot(s.v)) > s.hv) continue;
      const g = _d.dot(s.n);
      if (g > -0.2 && g < best) best = g;
    }
  }
  return best;
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

/** أوقات العينات: كل وضعية مفتاحية + منتصف كل انتقال */
function sampleTimes(m: Motion): number[] {
  const out: number[] = [];
  let t = 0;
  m.keys.forEach((_, i) => {
    const hold = m.hold?.[i] ?? 0;
    const dur = m.tempo[i] ?? 1;
    out.push(t + hold * 0.5);
    t += hold;
    if (m.keys.length > 1) out.push(t + dur * 0.5);
    t += dur;
  });
  return out;
}

const withKnees = (p: Pose, kL: number, kR: number): Pose => (kL || kR ? { ...p, lKnee: (p.lKnee ?? 0) + kL, rKnee: (p.rKnee ?? 0) + kR } : p);

/**
 * يحسب الملاءمة للحركة (null لو الحركة ما تحتاج: وقوف أو بدون أسطح).
 * rest في الحركة: أي أسطح يرتكز عليها (bench / seat / back) و floor = القدمين على الأرض.
 */
export function fitMotion(human: Human, driver: Rig, props: PropsRuntime, m: Motion): Fit | null {
  const rest = m.rest ?? [];
  const sups = props.supports.filter((s) => (rest as string[]).includes(s.role));
  const feet = rest.includes('floor');
  if (!sups.length && !feet) return null;
  const opts = poseOpts(m);
  const floor = floorFor(m);
  const times = sampleTimes(m);
  const fit: Fit = { dur: motionDuration(m), times, off: [], kneeL: [], kneeR: [] };

  const frame = (p: Pose, off: THREE.Vector3) => {
    applyPose(driver, p, opts);
    human.sync(!!m.ground, floor, off);
  };
  const footLow = (S: Rig['L']) => Math.min(S.toe.getWorldPosition(_v).y, S.heel.getWorldPosition(_v).y);

  for (const t of times) {
    const pose = sampleMotion(m, t);
    const off = new THREE.Vector3();
    // ١) الجسم على الأسطح
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
    // ٢) القدمين على الأرض: نعدّل ثني الركبة (أقرب زاوية للمكتوبة اللي تخلي القدم على الأرض)
    //    نبحث من الصفر للخارج بخطوات ١٠° (الأقرب للزاوية المكتوبة أولاً، والفرد قبل الثني: القدم تنزل قدام مو تحت المقعد)،
    //    وبعدها تنصيف داخل المجال
    let kL = 0; let kR = 0;
    if (feet) {
      for (const side of ['L', 'R'] as const) {
        const S = human.propRig[side];
        const at = (d: number) => { frame(side === 'L' ? withKnees(pose, d, kR) : withKnees(pose, kL, d), off); return footLow(S); };
        const f0 = at(0);
        let best = 0; let bestAbs = Math.abs(f0);
        let lo: [number, number] | null = null; // [d, f] على طرف، والطرف الثاني الصفر أو الخطوة السابقة
        let hi: [number, number] | null = null;
        if (bestAbs > 1e-4) {
          const prevP: [number, number] = [0, f0]; const prevN: [number, number] = [0, f0];
          for (let d = 10; d <= 50 && !lo; d += 10) {
            for (const [dd, prev] of [[-d, prevN], [d, prevP]] as const) {
              const f = at(dd);
              if (Math.abs(f) < bestAbs) { bestAbs = Math.abs(f); best = dd; }
              if (!lo && Math.sign(f) !== Math.sign(prev[1])) { lo = [prev[0], prev[1]]; hi = [dd, f]; }
              prev[0] = dd; prev[1] = f;
            }
          }
        }
        let k = best;
        if (lo && hi) {
          for (let i = 0; i < 5; i++) {
            const mid: number = (lo[0] + hi[0]) / 2; const fm: number = at(mid);
            if (Math.sign(fm) === Math.sign(lo[1])) lo = [mid, fm]; else hi = [mid, fm];
          }
          k = lo[0] + (hi[0] - lo[0]) * (lo[1] / (lo[1] - hi[1]));
        }
        if (side === 'L') kL = k; else kR = k;
      }
    }
    fit.off.push(off);
    fit.kneeL.push(kL);
    fit.kneeR.push(kR);
  }
  return fit;
}

/** قيم الملاءمة عند الزمن t (خطي بين العينات، والحركة تدور) */
export function fitAt(fit: Fit, t: number, out = new THREE.Vector3()): { off: THREE.Vector3; kL: number; kR: number } {
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
  return { off: out, kL: fit.kneeL[i] + (fit.kneeL[j] - fit.kneeL[i]) * f, kR: fit.kneeR[i] + (fit.kneeR[j] - fit.kneeR[i]) * f };
}

/** الوضعية والإزاحة الجاهزة للرسم عند الزمن t */
export function fittedFrame(m: Motion, fit: Fit | null, t: number, out = new THREE.Vector3()): { pose: Pose; off: THREE.Vector3 | null } {
  const pose = sampleMotion(m, t);
  if (!fit) return { pose, off: null };
  const f = fitAt(fit, t, out);
  return { pose: withKnees(pose, f.kL, f.kR), off: f.off };
}
