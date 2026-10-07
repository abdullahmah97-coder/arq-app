// ===================== المكتب ثلاثي الأبعاد (three.js من jsdelivr) =====================
// نفس فكرة مشهد التطبيق (officeScene.ts): أرضية مرتفعة، مكاتب بصناديق وأسطوانات، موظف ظهره للكاميرا وشاشته قدّامه،
// والشاشة تتلوّن بحالة المكتب (برتقالي = ينتظرك، كهرماني = يشتغل، أخضر = فاضي)، ويرفع يده لما فيه شي ينتظرك.
// اللوحات والأرقام عناصر DOM فوق المشهد بنفس الإسقاط (عشان العربي والخطوط واللمس ولوحة المفاتيح).
const GAP = 2.9;
const HX = GAP * 2.5 + 0.15;
const HZ = GAP * 1.5 + 0.15;
const SLAB = 0.55;
const SIGN_Y = 1.45;
const SIGN_Z = -0.24;
const SCREEN = { waiting: '#F1551D', working: '#FEA94F', idle: '#8FD19E' };
const FLOOR = { rug: '#E9CFA6', rugOn: '#FEA94F', top: '#F7DFBB', base: '#B5562E' };
const spot = (d) => [d.col * GAP, d.row * GAP];
/** ترتيب الرسم من الأبعد للأقرب (الكاميرا من جهة +x +z) */
const paintOrder = (list) => [...list].sort((a, b) => a.col + a.row - (b.col + b.row) || a.col - b.col);

function createOffice3D(canvas) {
  if (typeof THREE === 'undefined') throw new Error('three_missing');
  const T3 = THREE;
  const renderer = new T3.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  const scene = new T3.Scene();
  const group = new T3.Group();
  scene.add(group);
  const geos = [], mats = [];
  const geo = (g) => { geos.push(g); return g; };
  const lam = (c) => { const m = new T3.MeshLambertMaterial({ color: c }); mats.push(m); return m; };
  const basic = (c) => { const m = new T3.MeshBasicMaterial({ color: c }); mats.push(m); return m; };
  const mesh = (g, m, x, y, z, parent) => { const o = new T3.Mesh(g, m); o.position.set(x, y, z); parent.add(o); return o; };

  group.add(new T3.HemisphereLight('#fff7ea', '#5a4a3a', 1.7));
  const sun = new T3.DirectionalLight('#ffffff', 1.5);
  sun.position.set(4, 10, 6);
  group.add(sun);

  // الأرضية المرتفعة
  mesh(geo(new T3.BoxGeometry(HX * 2, SLAB, HZ * 2)), lam(FLOOR.base), 0, -SLAB / 2 - 0.03, 0, group);
  mesh(geo(new T3.BoxGeometry(HX * 2, 0.06, HZ * 2)), lam(FLOOR.top), 0, 0, 0, group);

  const g = {
    rug: geo(new T3.BoxGeometry(2.3, 0.02, 2.2)),
    top: geo(new T3.BoxGeometry(1.6, 0.07, 0.85)),
    side: geo(new T3.BoxGeometry(0.06, 0.72, 0.8)),
    back: geo(new T3.BoxGeometry(1.5, 0.4, 0.04)),
    frame: geo(new T3.BoxGeometry(0.62, 0.4, 0.04)),
    screen: geo(new T3.PlaneGeometry(0.55, 0.33)),
    stand: geo(new T3.CylinderGeometry(0.03, 0.05, 0.18, 8)),
    keys: geo(new T3.BoxGeometry(0.46, 0.02, 0.15)),
    mug: geo(new T3.CylinderGeometry(0.05, 0.045, 0.1, 10)),
    seat: geo(new T3.BoxGeometry(0.5, 0.07, 0.48)),
    seatBack: geo(new T3.BoxGeometry(0.5, 0.32, 0.06)),
    chairLeg: geo(new T3.CylinderGeometry(0.035, 0.035, 0.42, 8)),
    torso: geo(new T3.CylinderGeometry(0.16, 0.2, 0.46, 14)),
    head: geo(new T3.SphereGeometry(0.15, 16, 12)),
    hair: geo(new T3.SphereGeometry(0.158, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55)),
    arm: geo(new T3.BoxGeometry(0.08, 0.34, 0.08)),
    pot: geo(new T3.CylinderGeometry(0.22, 0.17, 0.32, 12)),
    leaf: geo(new T3.IcosahedronGeometry(0.36, 0)),
    sofa: geo(new T3.BoxGeometry(1.7, 0.36, 0.7)),
    sofaBack: geo(new T3.BoxGeometry(1.7, 0.42, 0.18)),
    sofaArm: geo(new T3.BoxGeometry(0.18, 0.5, 0.7)),
    table: geo(new T3.CylinderGeometry(0.42, 0.42, 0.05, 20)),
    tableLeg: geo(new T3.CylinderGeometry(0.05, 0.08, 0.4, 8)),
    stool: geo(new T3.CylinderGeometry(0.18, 0.18, 0.42, 12)),
    cooler: geo(new T3.BoxGeometry(0.36, 0.9, 0.36)),
    bottle: geo(new T3.CylinderGeometry(0.15, 0.15, 0.36, 14)),
  };
  const m = {
    desk: lam('#D9A86C'), panel: lam('#B98953'), dark: lam('#22312C'), keys: lam('#EDE6DA'), chair: lam('#33433D'),
    skin: lam('#E2B48C'), hair: lam('#2B1D14'), pot: lam('#C1683C'), leaf: lam('#3E7D4F'), sofa: lam('#2F4B3C'),
    wood: lam('#C79559'), white: lam('#F3EEE6'), water: lam('#8EC9E8'),
  };

  const rigs = [];
  for (const d of paintOrder(DESKS)) {
    const [x, z] = spot(d);
    const lead = d.id === 'lead';
    const root = new T3.Group();
    root.position.set(x, 0, z);
    group.add(root);
    const rug = lam(FLOOR.rug);
    mesh(g.rug, rug, 0, 0.04, 0.3, root);
    mesh(g.top, m.desk, 0, 0.75, 0, root);
    mesh(g.side, m.panel, -0.76, 0.37, 0, root);
    mesh(g.side, m.panel, 0.76, 0.37, 0, root);
    mesh(g.back, m.panel, 0, 0.5, -0.38, root);
    const screens = [];
    for (const sx of lead ? [-0.33, 0.33] : [0]) {
      mesh(g.stand, m.dark, sx, 0.86, -0.22, root);
      mesh(g.frame, m.dark, sx, 1.1, -0.24, root);
      const s = basic(SCREEN.idle);
      screens.push(s);
      mesh(g.screen, s, sx, 1.1, -0.215, root);
    }
    mesh(g.keys, m.keys, 0, 0.795, 0.12, root);
    mesh(g.mug, lam(d.shirt), 0.6, 0.835, 0.1, root);
    const cz = 0.72;
    mesh(g.seat, m.chair, 0, 0.46, cz, root);
    mesh(g.seatBack, m.chair, 0, 0.66, cz + 0.24, root);
    mesh(g.chairLeg, m.chair, 0, 0.22, cz, root);
    const shirt = lam(d.shirt);
    mesh(g.torso, shirt, 0, 0.73, cz, root);
    const head = new T3.Group();
    head.position.set(0, 1.12, cz);
    root.add(head);
    mesh(g.head, m.skin, 0, 0, 0, head);
    const hair = mesh(g.hair, m.hair, 0, 0.02, 0.015, head);
    hair.rotation.x = 0.35;
    const arm = (side) => {
      const pivot = new T3.Group();
      pivot.position.set(0.22 * side, 0.92, cz);
      root.add(pivot);
      mesh(g.arm, shirt, 0, -0.16, 0, pivot);
      return pivot;
    };
    const armL = arm(-1), armR = arm(1);
    rigs.push({ id: d.id, screens, rug, armL, armR, head, phase: rigs.length * 0.9, state: null });
  }

  // جلسة الاستراحة في الزاوية القريبة (٢،١): كنبة وطاولة ونبتة
  const lx = 2 * GAP, lz = GAP;
  mesh(g.sofa, m.sofa, lx, 0.22, lz - 0.2, group);
  mesh(g.sofaBack, m.sofa, lx, 0.5, lz - 0.5, group);
  mesh(g.sofaArm, m.sofa, lx - 0.85, 0.28, lz - 0.2, group);
  mesh(g.sofaArm, m.sofa, lx + 0.85, 0.28, lz - 0.2, group);
  mesh(g.table, m.wood, lx, 0.42, lz + 0.65, group);
  mesh(g.tableLeg, m.wood, lx, 0.2, lz + 0.65, group);
  mesh(g.mug, lam('#F1551D'), lx + 0.12, 0.49, lz + 0.6, group);
  // طاولة اجتماعات صغيرة يمين المدير، وبرّادة موية يساره
  mesh(g.table, m.wood, GAP, 0.62, 0, group);
  mesh(g.tableLeg, m.wood, GAP, 0.32, 0, group);
  for (const [sx, sz] of [[-0.6, 0.2], [0.6, -0.2], [0, 0.65]]) mesh(g.stool, m.chair, GAP + sx, 0.21, sz, group);
  mesh(g.cooler, m.white, -GAP, 0.45, -0.2, group);
  mesh(g.bottle, m.water, -GAP, 1.08, -0.2, group);
  // نباتات في الزوايا
  for (const [px, pz] of [[-HX + 0.35, -HZ + 0.35], [HX - 0.35, -HZ + 0.35], [-HX + 0.35, HZ - 0.35], [HX - 0.35, HZ - 0.35], [-GAP + 0.75, 0.75], [GAP - 0.05, -0.95]]) {
    mesh(g.pot, m.pot, px, 0.19, pz, group);
    mesh(g.leaf, m.leaf, px, 0.62, pz, group).scale.set(1, 1.25, 1);
  }

  let cam = null, W = 1, H = 1;
  const EYE = new T3.Vector3(10, 11, 10);
  const v = new T3.Vector3();
  /** كاميرا متعامدة تحوّط الأرضية واللوحات بالضبط داخل w×h */
  function fit(w, h) {
    W = Math.max(1, w); H = Math.max(1, h);
    const c = new T3.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    c.position.copy(EYE);
    c.lookAt(0, 0, 0);
    c.updateMatrixWorld(true);
    const inv = c.matrixWorldInverse;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const add = (x, y, z) => { v.set(x, y, z).applyMatrix4(inv); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); };
    for (const sx of [-HX, HX]) for (const sz of [-HZ, HZ]) { add(sx, 0, sz); add(sx, -SLAB, sz); }
    for (const d of DESKS) { const [x, z] = spot(d); add(x, SIGN_Y + 1.0, z + SIGN_Z); }
    const pad = 0.3;
    x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let hw = (x1 - x0) / 2, hh = (y1 - y0) / 2;
    const aspect = W / H;
    if (hw / hh > aspect) hh = hw / aspect; else hw = hh * aspect;
    c.left = cx - hw; c.right = cx + hw; c.top = cy + hh; c.bottom = cy - hh;
    c.updateProjectionMatrix();
    cam = c;
    renderer.setSize(W, H, false);
  }
  const p = new T3.Vector3();
  const toScreen = (x, y, z) => { p.set(x, y, z).project(cam); return { x: ((p.x + 1) / 2) * W, y: ((1 - p.y) / 2) * H }; };

  function update(states, selected) {
    for (const r of rigs) {
      r.state = states[r.id] || null;
      const c = r.state && r.state.waiting ? SCREEN.waiting : r.state && r.state.working ? SCREEN.working : SCREEN.idle;
      for (const s of r.screens) s.color.set(c);
      r.rug.color.set(selected === r.id ? FLOOR.rugOn : FLOOR.rug);
    }
  }
  function tick(time) {
    for (const r of rigs) {
      const tt = time + r.phase;
      const waiting = !!(r.state && r.state.waiting);
      const working = !!(r.state && r.state.working);
      r.head.position.y = 1.12 + Math.sin(tt * 1.6) * 0.012;
      // الذراع معلّقة من الكتف: يكتب لو عنده شغل، ويرفع يده لو فيه شي ينتظر موافقتك
      const typing = working || waiting ? Math.sin(tt * 14) * 0.08 : 0;
      r.armL.rotation.set(1.15 + typing, 0, 0);
      if (waiting) r.armR.rotation.set(Math.PI - 0.25, 0, Math.sin(tt * 5) * 0.35);
      else r.armR.rotation.set(1.15 - typing, 0, 0);
    }
  }
  return {
    resize: fit,
    update,
    frame(time) { if (!cam) return; tick(time); renderer.render(scene, cam); },
    /** أماكن اللوحات ومناطق الضغط بالبكسل (من الأبعد للأقرب: الأقرب يغطي) */
    spots() {
      if (!cam) return [];
      const a = toScreen(0, 0, 0), b = toScreen(1, 0, -1);
      const ppu = Math.hypot(b.x - a.x, b.y - a.y) / Math.SQRT2;
      const w = Math.max(56, Math.round(ppu * 2.1));
      return paintOrder(DESKS).map((d) => {
        const [x, z] = spot(d);
        const s = toScreen(x, SIGN_Y, z + SIGN_Z);
        const base = toScreen(x, 0.3, z + 0.95);
        const top = s.y - 30;
        return { id: d.id, left: Math.round(s.x - w / 2), top: Math.round(top), w, h: Math.max(44, Math.round(base.y - top)) };
      });
    },
    ppu() { const a = toScreen(0, 0, 0), b = toScreen(1, 0, -1); return Math.hypot(b.x - a.x, b.y - a.y) / Math.SQRT2; },
    dispose() { for (const x of geos) x.dispose(); for (const x of mats) x.dispose(); renderer.dispose(); },
  };
}
