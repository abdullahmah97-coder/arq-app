// حذاء رياضي حقيقي لكل قدم بدل الحذاء المرسوم على جلد القدم (كانت تبان أصابع القدم مثل الصندل).
// نبنيه من مقاسات حذاء النموذج نفسه (رجل/امرأة) عشان يغطي القدم بالضبط، ونربطه بعظمة القدم فيتحرك معها.
import * as THREE from 'three';

const COLORS = { upper: '#1C2926', sole: '#EFEAE0', stripe: '#F1551D', clay: '#BCC3C7' };
const STATIONS = 22;
const ARC = 22;

export interface Sneakers {
  /** لون رمادي للعرض التشريحي */
  setClay(on: boolean): void;
}

type Slice = { z: number; xc: number; w: number; top: number };
/** أوزان العظام: القدم كامل، والجزء العلوي من الحذاء (فوق ٦ سم) يتبع الساق تدريجياً لين ٥٥٪ عند الحافة */
function weightsBlend(geo: THREE.BufferGeometry, foot: number, leg: number, y0: number) {
  const P = geo.attributes.position as THREE.BufferAttribute;
  const si = new Uint16Array(P.count * 4);
  const sw = new Float32Array(P.count * 4);
  for (let i = 0; i < P.count; i++) {
    const h = P.getY(i) - y0;
    const k = leg < 0 || !Number.isFinite(y0) ? 0 : Math.min(1, Math.max(0, (h - 0.055) / 0.05));
    const a = k * k * (3 - 2 * k) * 0.55;
    si[i * 4] = foot; si[i * 4 + 1] = Math.max(0, leg);
    sw[i * 4] = 1 - a; sw[i * 4 + 1] = a;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
}

/** شرائح القدم من الكعب لرأس الحذاء: المنتصف، نص العرض، وأعلى نقطة (بإحداثيات وضعية الربط = متر، X جنب، Y فوق، Z قدام) */
function slices(pts: THREE.Vector3[], yMin: number): Slice[] {
  let zMin = Infinity; let zMax = -Infinity;
  for (const p of pts) { zMin = Math.min(zMin, p.z); zMax = Math.max(zMax, p.z); }
  const len = zMax - zMin;
  const out: Slice[] = [];
  for (let i = 0; i < STATIONS; i++) {
    const t = i / (STATIONS - 1);
    const z = zMin + t * len;
    const band = len / (STATIONS - 1) * 0.9;
    let lo = Infinity; let hi = -Infinity; let top = -Infinity;
    for (const p of pts) {
      if (Math.abs(p.z - z) > band) continue;
      lo = Math.min(lo, p.x); hi = Math.max(hi, p.x);
      if (p.y < yMin + 0.1) top = Math.max(top, p.y);
    }
    if (!Number.isFinite(lo)) { lo = hi = out.length ? out[out.length - 1].xc : 0; top = yMin + 0.05; }
    out.push({ z, xc: (lo + hi) / 2, w: (hi - lo) / 2, top });
  }
  // تنعيم بسيط
  for (let k = 0; k < 2; k++) {
    for (let i = 1; i < out.length - 1; i++) {
      out[i].w = (out[i - 1].w + out[i].w * 2 + out[i + 1].w) / 4;
      out[i].top = (out[i - 1].top + out[i].top * 2 + out[i + 1].top) / 4;
      out[i].xc = (out[i - 1].xc + out[i].xc * 2 + out[i + 1].xc) / 4;
    }
  }
  return out;
}

/** الجزء العلوي: مقاطع نصف دائرية مربّعة شوي على طول القدم، مسكّرة عند الكعب ورأس الحذاء */
function upperGeometry(sl: Slice[], y0: number, margin: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const n = sl.length;
  const e = 2 / 2.8; // أس المقطع (أعلى من 1 = أقرب للمربّع)
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // تدوير رأس الحذاء والكعب
    const endR = t < 0.12 ? Math.sqrt(Math.max(0, 1 - Math.pow((0.12 - t) / 0.12, 2))) : t > 0.82 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.82) / 0.18, 2))) : 1;
    const s = sl[i];
    const w = (s.w + margin) * Math.max(0.05, endR);
    // ارتفاع الحذاء: يغطي ظهر القدم ولسان الحذاء قدام الكاحل، وينزل لمقدمة القدم
    const profile = t < 0.12 ? 0.092 : t < 0.42 ? 0.092 + (t - 0.12) * 0.07 : t < 0.8 ? 0.113 - (t - 0.42) * 0.16 : 0.052;
    const h = Math.max(s.top + margin - y0, profile) * Math.max(0.05, t > 0.82 ? endR : 1);
    for (let j = 0; j <= ARC; j++) {
      const a = (j / ARC) * Math.PI;
      const c = Math.cos(a); const sn = Math.sin(a);
      const x = s.xc + w * Math.sign(c) * Math.pow(Math.abs(c), e);
      const y = y0 + Math.max(0.004, h) * Math.pow(sn, e);
      pos.push(x, y, s.z);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < ARC; j++) {
    const a = i * (ARC + 1) + j; const b = a + ARC + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  // غطاء الكعب ورأس الحذاء (مروحة من المنتصف)
  const cap = (i: number, flip: boolean) => {
    const c = pos.length / 3;
    const s = sl[i];
    pos.push(s.xc, y0 + 0.01, s.z);
    for (let j = 0; j < ARC; j++) {
      const a = i * (ARC + 1) + j;
      if (flip) idx.push(c, a + 1, a); else idx.push(c, a, a + 1);
    }
  };
  cap(0, true); cap(n - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** النعل: شكل القدم من فوق + سماكة (أعرض شوي من الجزء العلوي) */
function soleGeometry(sl: Slice[], y0: number, margin: number, thick: number): THREE.BufferGeometry {
  const right: THREE.Vector2[] = []; const left: THREE.Vector2[] = [];
  const n = sl.length;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const endR = t < 0.1 ? Math.sqrt(Math.max(0.02, 1 - Math.pow((0.1 - t) / 0.1, 2))) : t > 0.85 ? Math.sqrt(Math.max(0.02, 1 - Math.pow((t - 0.85) / 0.15, 2))) : 1;
    const w = (sl[i].w + margin + 0.004) * endR;
    right.push(new THREE.Vector2(sl[i].xc - w, sl[i].z));
    left.push(new THREE.Vector2(sl[i].xc + w, sl[i].z));
  }
  const shape = new THREE.Shape([...right, ...left.reverse()]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 4 });
  // الشكل بمستوى XY والسماكة على Z → نقلبه لمستوى الأرض (XZ) والسماكة للأعلى
  g.rotateX(Math.PI / 2);
  g.translate(0, y0 + thick + 0.003, 0);
  return g;
}

/** خط برتقالي على جوانب الحذاء */
function stripeGeometry(sl: Slice[], y0: number, margin: number): THREE.BufferGeometry {
  const pos: number[] = []; const idx: number[] = [];
  const i0 = Math.round(sl.length * 0.25); const i1 = Math.round(sl.length * 0.72);
  for (const side of [1, -1]) {
    const start = pos.length / 3;
    for (let i = i0; i <= i1; i++) {
      const s = sl[i];
      const k = (i - i0) / (i1 - i0);
      const yc = y0 + 0.018 + 0.022 * Math.sin(k * Math.PI * 0.5);
      const x = s.xc + side * (s.w + margin + 0.0015);
      pos.push(x, yc - 0.006, s.z, x, yc + 0.006, s.z);
    }
    for (let i = 0; i < i1 - i0; i++) {
      const a = start + i * 2;
      if (side > 0) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * يبني حذاء لكل قدم من مقاسات "Cloth_sneakers" بالنموذج ويخفي الحذاء المرسوم.
 * null لو النموذج ما فيه حذاء (نخليه على حاله).
 */
/** الأشكال تنحسب مرة لكل نموذج (رجل/امرأة) وتنعاد لكل تمرين */
const cache = new WeakMap<object, Record<string, [THREE.BufferGeometry, 'upper' | 'sole' | 'stripe'][]>>();

export function makeSneakers(model: THREE.Object3D, template: object = model): Sneakers | null {
  let cloth: THREE.SkinnedMesh | undefined;
  let body: THREE.SkinnedMesh | undefined;
  model.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    if (!cloth && /sneaker/i.test(o.name)) cloth = m;
    if (!body && /^Body$/i.test(o.name)) body = m;
  });
  if (!cloth) return null;
  const skel = cloth.skeleton;
  const names = skel.bones.map((b) => b.name.replace(/[:_]/g, '').replace('mixamorig', ''));
  const upperMat = new THREE.MeshStandardMaterial({ color: COLORS.upper, roughness: 0.62, metalness: 0.02 });
  const soleMat = new THREE.MeshStandardMaterial({ color: COLORS.sole, roughness: 0.7, metalness: 0 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: COLORS.stripe, roughness: 0.5, metalness: 0, side: THREE.DoubleSide });
  const orig = { upper: upperMat.color.clone(), sole: soleMat.color.clone(), stripe: stripeMat.color.clone() };
  const v = new THREE.Vector3();
  const mats = { upper: upperMat, sole: soleMat, stripe: stripeMat };

  let built = cache.get(template);
  if (!built) {
    built = {};
    for (const side of ['Left', 'Right'] as const) {
      if (names.indexOf(`${side}Foot`) < 0) continue;
      // نقاط القدم والكاحل من الحذاء المرسوم ومن الجلد نفسه (عشان يغطيها كلها)
      const pts: THREE.Vector3[] = [];
      for (const mesh of [cloth, body]) {
        if (!mesh) continue;
        const mNames = mesh.skeleton.bones.map((b) => b.name.replace(/[:_]/g, '').replace('mixamorig', ''));
        const mf = mNames.indexOf(`${side}Foot`); const mt = mNames.indexOf(`${side}ToeBase`); const ml = mNames.indexOf(`${side}Leg`);
        const P = mesh.geometry.attributes.position as THREE.BufferAttribute;
        const SI = mesh.geometry.attributes.skinIndex as THREE.BufferAttribute;
        const SW = mesh.geometry.attributes.skinWeight as THREE.BufferAttribute;
        for (let i = 0; i < P.count; i++) {
          let best = 0; let bi = -1;
          for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w > best) { best = w; bi = SI.getComponent(i, k); } }
          if (bi !== mf && bi !== mt && bi !== ml) continue;
          const p = v.fromBufferAttribute(P, i).applyMatrix4(mesh.bindMatrix).clone();
          if (bi === ml && p.y > 0.24) continue;
          pts.push(p);
        }
      }
      if (pts.length < 20) continue;
      let yMin = Infinity;
      for (const p of pts) yMin = Math.min(yMin, p.y);
      const sl = slices(pts, yMin);
      const margin = 0.004;
      const soleT = 0.018;
      const y0 = yMin + soleT;
      const list: [THREE.BufferGeometry, 'upper' | 'sole' | 'stripe'][] = [
        [upperGeometry(sl, y0, margin), 'upper'],
        [soleGeometry(sl, yMin - 0.003, margin, soleT), 'sole'],
        [stripeGeometry(sl, y0, margin), 'stripe'],
      ];
      const fIdx = names.indexOf(`${side}Foot`); const lIdx = names.indexOf(`${side}Leg`);
      for (const [geo, kind] of list) {
        // الحذاء ثابت على القدم، وحافته العلوية تميل شوي مع الساق (نعومة بدون تمزق)
        weightsBlend(geo, fIdx, lIdx, kind === 'upper' ? y0 : Infinity);
        geo.applyMatrix4(cloth.bindMatrixInverse);
        geo.computeVertexNormals();
      }
      built[side] = list;
    }
    cache.set(template, built);
  }

  let made = 0;
  for (const side of Object.keys(built)) {
    for (const [geo, kind] of built[side]) {
      const mesh = new THREE.SkinnedMesh(geo, mats[kind]);
      mesh.name = `ARQ_Sneaker_${side}_${kind}`;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      cloth.parent!.add(mesh);
      mesh.bind(skel, cloth.bindMatrix);
    }
    made++;
  }
  if (!made) return null;
  cloth.visible = false;
  return {
    setClay(on: boolean) {
      upperMat.color.set(on ? COLORS.clay : orig.upper);
      soleMat.color.set(on ? COLORS.clay : orig.sole);
      stripeMat.color.set(on ? COLORS.clay : orig.stripe);
    },
  };
}
