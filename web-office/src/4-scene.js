// ===================== مبنى «نظام تشغيل الشركة» ثلاثي الأبعاد (three.js r158 الأساسي من jsdelivr) =====================
// مقطع معماري لمبنى أبيض: كل دور فريق وكل غرفة مكتب. قشرة بيضاء سميكة، داخل غامق دافي، إضاءة سقف، شاشات حائط مرسومة
// على CanvasTexture بنصوص الخطة (العربي مشكّل من اليمين والأرقام لاتينية)، ناس بهوديز سود ظهرهم للكاميرا،
// وشاشات المكاتب تتلوّن بالحالة (برتقالي = ينتظرك، كهرماني = يشتغل، أبيض/أخضر = هادي) واللي ينتظرك يرفع يده ويأشّر.
// الإحداثيات «القانونية»: الجدار المصمت على -x والزجاج على +x والكاميرا من جهة الزجاج. بالعربي نعكس x (M = -1)
// فيصير الجدار المصمت يمين الشاشة جنب عمود النص. الوحدات بالمتر. الملف مستقل: THREE العام وواجهات المتصفح بس.
function createCompanyOS(canvas, opts) {
  if (typeof THREE === 'undefined') throw new Error('three_missing');
  const T3 = THREE;
  const O0 = opts || {};
  let theme = O0.theme === 'dark' ? 'dark' : 'light';
  let dir = O0.dir === 'rtl' ? 'rtl' : 'ltr';
  let M = dir === 'rtl' ? -1 : 1;
  let disposed = false;
  const PI = Math.PI;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const str = (v, max) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim().slice(0, max || 140);
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  /** نص مقصوص بـ «…» (بدل ما ينقطع بنص الكلمة بدون علامة) */
  const strE = (v, max) => { const a = Array.from(str(v, 400)); return a.length > max ? `${a.slice(0, max - 1).join('').trimEnd()}…` : a.join(''); };

  // ---------- الألوان ----------
  const C = {
    orange: '#F1551D', amber: '#FEA94F', idle: '#DDF3E6', red: '#FF3B30', info: '#6E9BFF',
    wall: '#3A332D', wallSide: '#312C27', ceil: '#2A2622', part: '#292622', walnut: '#7A5236', walnutDk: '#4F3424',
    metal: '#141414', chair: '#161618', hood: '#1D1D20', pants: '#27272C', hair: '#1C1410', skin: '#B9835F', shoe: '#2B2B2E',
    leaves: ['#2E6B39', '#3B7F44', '#23552E', '#4A8C4C', '#2A6034'], potW: '#EEEEEA', potD: '#2B2926', soil: '#3B2C21',
    monitor: '#0C0C0D', rack: '#141516', rug: '#CFC5B5', marble: '#2E2D2B', led: '#FFE6C2', spot: '#FFF2DE',
    recess: '#2A2928',
  };
  const THEMES = {
    light: { shell: '#FAFAF7', sky: '#FFFFFF', ground: '#D6D1C7', hemi: 2.2, sun: 2.7, exposure: 1.02, shadow: 0.1, blob: 0.38, glow: 0.7 },
    dark: { shell: '#E2E2DC', sky: '#F3F1EC', ground: '#8C877D', hemi: 1.75, sun: 2.3, exposure: 1.0, shadow: 0.42, blob: 0.75, glow: 0.95 },
  };

  // ---------- المحرّك ----------
  const renderer = new T3.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = T3.SRGBColorSpace;
  renderer.toneMapping = T3.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T3.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // الظل يتحدّث مع البناء/الثيم بس (الأذرع ما ترمي ظل)
  const ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new T3.Scene();
  const camera = new T3.PerspectiveCamera(28, 1, 0.5, 500);
  const hemi = new T3.HemisphereLight('#FFFFFF', '#D6D1C7', 2);
  const sun = new T3.DirectionalLight('#FFF5E8', 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  scene.add(hemi, sun, sun.target);
  // أضواء الغرف: عدد ثابت طول عمر المشهد (تغيّر عدد الأضواء يعيد تجميع كل الـ shaders مع كل شريحة) — كل بناء يوزّعها
  const LPOOL = 6;
  const lamps = [];
  for (let i = 0; i < LPOOL; i++) { const l = new T3.PointLight('#FFC690', 0, 10, 1.6); l.position.set(0, -100, 0); scene.add(l); lamps.push(l); }

  // ---------- قوالب الأشكال (للدمج بس — ما تنرفع للكرت) ----------
  const TPL = {
    box: new T3.BoxGeometry(1, 1, 1),
    cyl: new T3.CylinderGeometry(1, 1, 1, 18),
    cylLo: new T3.CylinderGeometry(1, 1, 1, 8),
    pot: new T3.CylinderGeometry(1, 0.8, 1, 16),
    sphLo: new T3.SphereGeometry(1, 10, 7),
    sph: new T3.SphereGeometry(1, 14, 10),
    leaf: new T3.SphereGeometry(1, 6, 4),
    ico: new T3.IcosahedronGeometry(1, 1),
    plane: new T3.PlaneGeometry(1, 1),
    disc: new T3.CircleGeometry(1, 20),
  };
  const capCache = new Map();
  const capsule = (r, len) => {
    const k = `${r}|${len}`;
    if (!capCache.has(k)) capCache.set(k, new T3.CapsuleGeometry(r, len, r > 0.1 ? 3 : 2, r > 0.1 ? 12 : 8));
    return capCache.get(k);
  };
  // أشكال مشتركة ترتسم فعلاً (ثابتة العدد طول عمر المشهد)
  const SH = {
    upper: new T3.CapsuleGeometry(0.058, 0.2, 2, 8),
    fore: new T3.CapsuleGeometry(0.05, 0.19, 2, 8),
    hand: new T3.SphereGeometry(0.046, 8, 6),
    lamp: new T3.SphereGeometry(1, 12, 8),
  };

  // ---------- مواد ثابتة (نفسها بكل بناء) ----------
  const tex = (cv, o = {}) => {
    const t = new T3.CanvasTexture(cv);
    t.colorSpace = T3.SRGBColorSpace;
    t.anisotropy = ANISO;
    if (o.repeat) t.wrapS = t.wrapT = T3.RepeatWrapping;
    if (o.noMip) { t.generateMipmaps = false; t.minFilter = T3.LinearFilter; }
    return t;
  };
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h)); return c; };
  const codeTex = makeCodeTex();
  const tileTex = makeTileTex();
  const blobTex = makeBlobTex();
  const glowTex = makeGlowTex();
  const washTex = makeWashTex();
  const MAT = {
    shell: new T3.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 }),
    matte: new T3.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }),
    satin: new T3.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0 }),
    gloss: new T3.MeshStandardMaterial({ vertexColors: true, roughness: 0.26, metalness: 0.15 }),
    led: new T3.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    floor: new T3.MeshStandardMaterial({ map: tileTex, roughness: 0.38, metalness: 0.05 }),
    glass: new T3.MeshStandardMaterial({ color: '#D7E9E8', transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, depthWrite: false, side: T3.DoubleSide }),
    strip: new T3.MeshBasicMaterial({ color: '#FF6A2B', toneMapped: false }),
    glow: new T3.MeshBasicMaterial({ map: glowTex, color: '#FF6A2B', transparent: true, depthWrite: false, toneMapped: false }),
    blob: new T3.MeshBasicMaterial({ map: blobTex, color: '#000000', transparent: true, depthWrite: false, opacity: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    wash: new T3.MeshBasicMaterial({ map: washTex, color: '#FFC58A', transparent: true, opacity: 0.85, blending: T3.AdditiveBlending, depthWrite: false, toneMapped: false }),
    ground: new T3.ShadowMaterial({ opacity: 0.13 }),
    sel: new T3.MeshBasicMaterial({ color: '#FF6A2B', toneMapped: false }),
    selGlow: new T3.MeshBasicMaterial({ map: glowTex, color: '#FF6A2B', transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }),
    alert: new T3.MeshBasicMaterial({ color: C.info, toneMapped: false, transparent: true }),
    ao: new T3.MeshBasicMaterial({ map: glowTex, color: '#000000', transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  };

  // ---------- مصفوفات مع العكس (x → M·x، ودوران y و z ينعكس) ----------
  const _o = new T3.Object3D();
  function mx(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, order = 'XYZ') {
    _o.position.set(x * M, y, z);
    _o.rotation.set(rx, ry * M, rz * M, order);
    _o.scale.set(sx, sy, sz);
    _o.updateMatrix();
    return _o.matrix.clone();
  }
  const sub = (G, ...a) => G.clone().multiply(mx(...a));

  // دمج أجزاء كثيرة بشكل واحد (ألوان رؤوس + UV اختياري) — رسمة وحدة بدل مئات
  const _v = new T3.Vector3(), _n = new T3.Vector3(), _nm = new T3.Matrix3();
  function merge(parts, withColor, withUV) {
    let nv = 0, ni = 0;
    for (const p of parts) { nv += p.g.attributes.position.count; ni += p.g.index ? p.g.index.count : p.g.attributes.position.count; }
    if (!nv) return null;
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3);
    const col = withColor ? new Float32Array(nv * 3) : null, uv = withUV ? new Float32Array(nv * 2) : null;
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let vo = 0, io = 0;
    for (const p of parts) {
      const g = p.g, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, n = P.count;
      _nm.getNormalMatrix(p.m);
      const flip = p.m.determinant() < 0;
      const c = p.c, r = p.uvr || [0, 0, 1, 1];
      for (let i = 0; i < n; i++) {
        const k = (vo + i) * 3;
        _v.fromBufferAttribute(P, i).applyMatrix4(p.m);
        pos[k] = _v.x; pos[k + 1] = _v.y; pos[k + 2] = _v.z;
        if (N) { _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize(); nor[k] = _n.x; nor[k + 1] = _n.y; nor[k + 2] = _n.z; }
        if (col) { col[k] = c ? c.r : 1; col[k + 1] = c ? c.g : 1; col[k + 2] = c ? c.b : 1; }
        if (uv) { uv[(vo + i) * 2] = r[0] + (U ? U.getX(i) : 0) * r[2]; uv[(vo + i) * 2 + 1] = r[1] + (U ? U.getY(i) : 0) * r[3]; }
      }
      const tri = (a, b, d) => { idx[io++] = vo + a; if (flip) { idx[io++] = vo + d; idx[io++] = vo + b; } else { idx[io++] = vo + b; idx[io++] = vo + d; } };
      if (g.index) { const I = g.index.array; for (let t = 0; t + 2 < g.index.count; t += 3) tri(I[t], I[t + 1], I[t + 2]); }
      else for (let t = 0; t + 2 < n; t += 3) tri(t, t + 1, t + 2);
      vo += n;
    }
    const geo = new T3.BufferGeometry();
    geo.setAttribute('position', new T3.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new T3.BufferAttribute(nor, 3));
    if (col) geo.setAttribute('color', new T3.BufferAttribute(col, 3));
    if (uv) geo.setAttribute('uv', new T3.BufferAttribute(uv, 2));
    geo.setIndex(new T3.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    return geo;
  }
  const colorCache = new Map();
  const col = (hex) => { if (!colorCache.has(hex)) colorCache.set(hex, new T3.Color(hex)); return colorCache.get(hex); };

  // بلاطة بحافة أمامية مدوّرة: مقطع (z,y) ممدود على x
  function slabGeo(L, H, D, r) {
    const s = new T3.Shape();
    const rr = Math.min(r, H / 2 - 0.001, D / 2);
    s.moveTo(-D / 2, -H / 2);
    s.lineTo(D / 2 - rr, -H / 2);
    s.quadraticCurveTo(D / 2, -H / 2, D / 2, -H / 2 + rr);
    s.lineTo(D / 2, H / 2 - rr);
    s.quadraticCurveTo(D / 2, H / 2, D / 2 - rr, H / 2);
    s.lineTo(-D / 2, H / 2);
    s.closePath();
    const g = new T3.ExtrudeGeometry(s, { depth: L, bevelEnabled: false, curveSegments: 5 });
    g.translate(0, 0, -L / 2);
    g.rotateY(-PI / 2);
    return g;
  }

  // =====================================================================================
  //                                   رسم اللوحات (Canvas 2D)
  // =====================================================================================
  const FM = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';
  const FK = '"Noto Kufi Arabic", "IBM Plex Mono", Tahoma, sans-serif';
  const FD = '"Anton", "Noto Kufi Arabic", Impact, "Arial Narrow", sans-serif';
  const ARX = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
  const SC = { text: '#F4F4F0', muted: 'rgba(244,244,240,0.62)', faint: 'rgba(244,244,240,0.36)', line: 'rgba(255,255,255,0.09)', up: '#3DDC84', down: '#FF6A4D', wait: '#F1551D', work: '#FEA94F', ok: '#3DDC84', orange: '#F1551D' };
  // الأرقام لاتينية على الشاشات
  const latin = (s) => String(s == null ? '' : s)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/٫/g, '.').replace(/٬/g, ',').replace(/٪/g, '%');
  const val = (v) => (fin(v) ? v.toLocaleString('en-US', { maximumFractionDigits: 1 }) : latin(str(v, 24)));
  const hasLS = (() => { try { return 'letterSpacing' in mkCanvas(2, 2).getContext('2d'); } catch (e) { return false; } })();

  /** نص واحد: محاذاة مطلقة (left/right/center)، اتجاه حسب النص، قص بـ «…» لو طويل؛ يرجّع العرض */
  function tx(c, s, x, y, o) {
    s = latin(s);
    if (!s) return 0;
    const ar = ARX.test(s);
    if (o.upper && !ar) s = s.toUpperCase();
    const fam = o.fam || (ar ? FK : FM);
    const size = Math.max(1, o.size);
    c.font = `${o.weight || 500} ${size.toFixed(1)}px ${fam}`;
    c.direction = ar ? 'rtl' : 'ltr';
    c.textAlign = o.align || 'left';
    c.textBaseline = 'middle';
    if (hasLS) c.letterSpacing = o.ls && !ar ? `${o.ls.toFixed(2)}px` : '0px';
    if (o.max && c.measureText(s).width > o.max) {
      let lo = 0, hi = s.length;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (c.measureText(s.slice(0, mid) + '…').width <= o.max) lo = mid; else hi = mid - 1; }
      s = lo > 0 ? s.slice(0, lo).trimEnd() + '…' : '';
      if (!s) { if (hasLS) c.letterSpacing = '0px'; return 0; }
    }
    c.fillStyle = o.color || SC.text;
    c.globalAlpha = o.alpha == null ? 1 : o.alpha;
    c.fillText(s, x, y + (ar ? size * 0.1 : size * 0.04));
    c.globalAlpha = 1;
    const w = c.measureText(s).width;
    if (hasLS) c.letterSpacing = '0px';
    return w;
  }
  /** أكبر مقاس (≤ size) يخلي النص بالعرض المسموح */
  function fitSize(c, s, size, maxW, weight, fam, min) {
    s = latin(s);
    const ar = ARX.test(s);
    const f = fam || (ar ? FK : FM);
    c.font = `${weight || 500} ${size}px ${f}`;
    if (hasLS) c.letterSpacing = '0px';
    const w = c.measureText(s).width;
    return w <= maxW || !w ? size : Math.max(min || size * 0.45, size * (maxW / w));
  }
  function wrap(c, s, maxW, font) {
    c.font = font;
    const words = latin(s).split(' ');
    const out = [];
    let line = '';
    for (const wd of words) {
      const t = line ? `${line} ${wd}` : wd;
      if (c.measureText(t).width <= maxW || !line) line = t; else { out.push(line); line = wd; }
    }
    if (line) out.push(line);
    return out;
  }
  function rrect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  const dot = (c, x, y, r, color, halo) => {
    if (halo) { c.globalAlpha = 0.25; c.fillStyle = color; c.beginPath(); c.arc(x, y, r * 2.1, 0, PI * 2); c.fill(); c.globalAlpha = 1; }
    c.fillStyle = color; c.beginPath(); c.arc(x, y, r, 0, PI * 2); c.fill();
  };
  // أيقونات خطّية على شبكة 24×24 (Path2D)
  const ICONS = {
    building: 'M3 21h18M5 21V4h10v17M15 9h4v12M8 8h4M8 12h4M8 16h4',
    store: 'M3 9l1.5-5h15L21 9M3 9h18v1.5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0V9M5 13v8h14v-8M10 21v-5h4v5',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
    medkit: 'M3.5 7h17v13h-17zM9 7V4h6v3M12 10.5v6M9 13.5h6',
    calendar: 'M4 5h16v16H4zM4 10h16M8 3v4M16 3v4M8 14h2M14 14h2M8 17.5h2',
    bug: 'M8 10h8v5a4 4 0 0 1-8 0v-5zM9 10a3 3 0 0 1 6 0M12 13v6M4 14h4M16 14h4M5 8.5l3 2M19 8.5l-3 2M5 20l3-2M19 20l-3-2',
    briefcase: 'M3 8h18v12H3zM8 8V5h8v3M3 13.5h18M10.5 13v2.5h3V13',
    bag: 'M5 8h14l-1 13H6L5 8zM9 8V6.5a3 3 0 0 1 6 0V8',
    megaphone: 'M3 10v4h4l8 5V5l-8 5H3zM18 9a4 4 0 0 1 0 6M7 14l1.5 6.5h2.5L10 15',
    users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.6M18 14.4a6.5 6.5 0 0 1 3.5 5.6',
    chat: 'M4 5h16v11H9.5L4 20V5zM8 9h8M8 12.5h5',
    sparkles: 'M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8L11 3zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z',
    code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 18.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22M4.9 4.9l2.5 2.5M16.6 16.6l2.5 2.5M4.9 19.1l2.5-2.5M16.6 7.4l2.5-2.5',
    chart: 'M3 21h18M5.5 21v-6h3v6M10.5 21V10h3v11M15.5 21V5h3v16',
    cube: 'M12 2.5l8.5 4.75v9.5L12 21.5l-8.5-4.75v-9.5L12 2.5zM3.5 7.25L12 12l8.5-4.75M12 12v9.5',
    check: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM7.5 12.5l3 3 6-6.5',
    rocket: 'M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M9 15l-3-3c1-4 4.5-8.5 12-9 0 7.5-4.5 11-9 12zM15 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM9.2 12.2L5 12.5l3-4 4 .3M11.8 14.8l-.3 4.2 4-3-.3-4',
    flask: 'M9 3h6M10 3v6l-5.2 9.8A1.5 1.5 0 0 0 6.1 21h11.8a1.5 1.5 0 0 0 1.3-2.2L14 9V3M7.2 15h9.6',
    cloud: 'M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.6 1.6 3.8 3.8 0 0 1-.5 7.4M12 12.5v8M9 15.5l3-3 3 3',
    monitor: 'M3 4h18v12H3zM8 21h8M12 16v5M6.5 12.5l3-3 3 2 5-4.5',
    merge: 'M6 3v12M6 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18 9c0 6-12 3-12 7',
    inbox: 'M3 13h5l2 3h4l2-3h5M5.5 5h13l2.5 8v6H3v-6l2.5-8z',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  };
  const pathCache = new Map();
  function icon(c, name, x, y, size, color, lw) {
    const d = ICONS[name] || ICONS.cube;
    if (!pathCache.has(d)) pathCache.set(d, new Path2D(d));
    c.save();
    c.translate(x - size / 2, y - size / 2);
    c.scale(size / 24, size / 24);
    c.strokeStyle = color;
    c.lineWidth = lw || 1.8;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.stroke(pathCache.get(d));
    c.restore();
  }
  // شعار أرك: سهم «A» وعارضة
  const LOGO = { a: new Path2D('M4 20 12 4l8 16'), b: new Path2D('M7.9 14.2h8.2') };
  function drawLogo(c, x, y, size, color, bar) {
    c.save();
    c.translate(x - size / 2, y - size / 2);
    c.scale(size / 24, size / 24);
    c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = 2.8;
    c.strokeStyle = color; c.stroke(LOGO.a);
    c.strokeStyle = bar || color; c.stroke(LOGO.b);
    c.restore();
  }

  function panelBg(c, w, h, u) {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#151A19');
    g.addColorStop(1, '#0B0E0D');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // لمعة خفيفة أعلى الشاشة
    const s = c.createLinearGradient(0, 0, w, h);
    s.addColorStop(0, 'rgba(255,255,255,0.045)');
    s.addColorStop(0.45, 'rgba(255,255,255,0)');
    c.fillStyle = s;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.lineWidth = Math.max(1, u * 0.5);
    c.strokeRect(c.lineWidth / 2, c.lineWidth / 2, w - c.lineWidth, h - c.lineWidth);
  }
  /** صف العنوان؛ يرجّع y بداية المحتوى */
  function headRow(c, w, h, title, L, opt = {}) {
    const u = L.u, pad = L.pad;
    const k = L.lod === 'tiny' ? 1.9 : L.lod === 'mid' ? 1.35 : 1;
    const size = 6.2 * u * k;
    const y = pad + size * 0.62;
    const live = L.lod !== 'tiny' && opt.live !== false;
    const liveW = live ? 22 * u : 0;
    const al = L.rtl ? 'right' : 'left';
    const x = L.rtl ? w - pad : pad;
    tx(c, title, x, y, { size, weight: 600, color: opt.color || SC.muted, align: al, max: w - 2 * pad - liveW, upper: true, ls: 0.07 * size });
    if (live) {
      const lx = L.rtl ? pad : w - pad;
      const lbl = L.lang === 'ar' ? 'مباشر' : 'LIVE';
      const sz = 4.6 * u * k;
      if (L.rtl) { dot(c, lx + 1.6 * u, y, 1.3 * u, SC.ok, true); tx(c, lbl, lx + 4.2 * u, y, { size: sz, weight: 600, color: SC.faint, align: 'left', ls: 0.1 * sz }); }
      else { dot(c, lx - 1.6 * u, y, 1.3 * u, SC.ok, true); tx(c, lbl, lx - 4.2 * u, y, { size: sz, weight: 600, color: SC.faint, align: 'right', ls: 0.1 * sz }); }
    }
    return y + size * 0.62 + 3.2 * u * k;
  }
  /** سهم صغير + نسبة التغيّر. اللون من up (زين/شين/محايد) والسهم من إشارة الرقم نفسه (+ طالع، − نازل):
   * الأعطال نزلت = سهم نازل أخضر. الإشارة تنشال من النص لأن السهم يقولها */
  function delta(c, d, up, x, y, size, align) {
    let s = latin(str(d, 16));
    if (!s) return;
    const color = up === true ? SC.up : up === false ? SC.down : SC.muted;
    const sign = /^[+]/.test(s) ? 1 : /^[-−–]/.test(s) ? -1 : 0;
    const dirn = sign || (up === true ? 1 : up === false ? -1 : 0);
    if (sign) s = s.slice(1).trim();
    c.font = `600 ${size}px ${FM}`;
    if (hasLS) c.letterSpacing = '0px';
    const tw = c.measureText(s).width, aw = size * 0.62, gap = size * 0.3;
    const total = (dirn ? aw + gap : 0) + tw;
    let x0 = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
    if (dirn) {
      c.fillStyle = color;
      c.beginPath();
      if (dirn > 0) { c.moveTo(x0, y + aw * 0.38); c.lineTo(x0 + aw, y + aw * 0.38); c.lineTo(x0 + aw / 2, y - aw * 0.45); }
      else { c.moveTo(x0, y - aw * 0.38); c.lineTo(x0 + aw, y - aw * 0.38); c.lineTo(x0 + aw / 2, y + aw * 0.45); }
      c.closePath(); c.fill();
      x0 += aw + gap;
    }
    tx(c, s, x0, y, { size, weight: 600, color, align: 'left' });
  }

  function drawKpis(c, w, h, s, L) {
    const u = L.u, pad = L.pad;
    const top = headRow(c, w, h, s.title, L);
    let items = (Array.isArray(s.items) ? s.items : []).filter(isObj).slice(0, 4);
    if (!items.length) items = [{ label: '', value: '—' }];
    const ar = w / h;
    if (L.lod === 'tiny') items = items.slice(0, ar > 1.9 ? 2 : 1);
    else if (L.lod === 'mid') items = items.slice(0, ar > 2.3 ? 3 : 2);
    const n = items.length;
    const cols = n <= 3 ? n : ar >= 2.3 ? 4 : 2;
    const rows = Math.ceil(n / cols);
    const cw = (w - 2 * pad) / cols, ch = (h - top - pad * 0.8) / rows;
    const k = L.lod === 'tiny' ? 1.8 : L.lod === 'mid' ? 1.3 : 1;
    items.forEach((it, i) => {
      const cI = i % cols, rI = Math.floor(i / cols);
      const vc = L.rtl ? cols - 1 - cI : cI;
      const x0 = pad + vc * cw, y0 = top + rI * ch;
      if (cI > 0) { c.fillStyle = SC.line; c.fillRect(L.rtl ? x0 + cw : x0 - u * 0.4, y0 + ch * 0.08, Math.max(1, u * 0.45), ch * 0.8); }
      const inset = cI > 0 ? 3.5 * u : 0;
      const al = L.rtl ? 'right' : 'left';
      const ix = L.rtl ? x0 + cw - inset : x0 + inset;
      const avail = cw - inset - 3 * u;
      const lblS = Math.min(ch * 0.17, 5.6 * u * k);
      const hasLbl = !!str(it.label);
      if (hasLbl) tx(c, it.label, ix, y0 + lblS * 0.7, { size: lblS, weight: 500, color: SC.muted, align: al, max: avail, upper: true, ls: 0.05 * lblS });
      const v = val(it.value);
      // رقم = كبير بخط الأرقام؛ نص («قبل ٥ ساعات») = أصغر ومقصوص على عرض عموده (ما يدخل على الرقم اللي جنبه)
      const isNum = fin(it.value) || /^[\d\s.,%+\-−—:\/]+[KMB]?$/i.test(v);
      const vs = isNum ? fitSize(c, v, Math.min(ch * (hasLbl ? 0.4 : 0.55), 19 * u * k), avail, 600, FM, 4 * u)
        : fitSize(c, v, Math.min(ch * (hasLbl ? 0.24 : 0.34), 9 * u * k), avail, 600, null, 3.6 * u);
      const vy = y0 + (hasLbl ? lblS * 1.45 : 0) + vs * (isNum ? 0.62 : 0.8);
      tx(c, v, ix, vy, { size: vs, weight: 600, color: SC.text, align: al, max: avail });
      if (str(it.delta) && vy + vs * 0.55 + lblS < y0 + ch + u) delta(c, it.delta, it.up === true ? true : it.up === false ? false : null, ix, vy + vs * 0.55 + lblS * 0.75, lblS * 1.02, al);
    });
  }

  function series(s) {
    const a = (Array.isArray(s.series) ? s.series : []).filter(fin).slice(-48);
    if (a.length >= 2) return a;
    return [3, 4, 3.6, 5, 4.6, 6, 5.8, 7.2, 6.9, 8.4];
  }
  function lineChart(c, x0, y0, w, h, data, color, u, grid) {
    let lo = Math.min(...data), hi = Math.max(...data);
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    const pad = (hi - lo) * 0.12;
    lo -= pad; hi += pad;
    const X = (i) => x0 + (i / (data.length - 1)) * w;
    const Y = (v) => y0 + h - ((v - lo) / (hi - lo)) * h;
    if (grid) {
      c.fillStyle = SC.line;
      for (let i = 0; i <= 3; i++) c.fillRect(x0, Math.round(y0 + (h * i) / 3), w, Math.max(1, u * 0.35));
    }
    const path = () => {
      c.moveTo(X(0), Y(data[0]));
      for (let i = 1; i < data.length; i++) {
        const xm = (X(i - 1) + X(i)) / 2;
        c.bezierCurveTo(xm, Y(data[i - 1]), xm, Y(data[i]), X(i), Y(data[i]));
      }
    };
    const g = c.createLinearGradient(0, y0, 0, y0 + h);
    g.addColorStop(0, color === SC.up ? 'rgba(61,220,132,0.38)' : 'rgba(255,106,77,0.34)');
    g.addColorStop(1, 'rgba(61,220,132,0)');
    c.beginPath(); path(); c.lineTo(X(data.length - 1), y0 + h); c.lineTo(X(0), y0 + h); c.closePath();
    c.fillStyle = g; c.fill();
    c.beginPath(); path();
    c.strokeStyle = color; c.lineWidth = Math.max(1.5, u * 1.25); c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke();
    dot(c, X(data.length - 1), Y(data[data.length - 1]), Math.max(2, u * 1.5), color, true);
  }
  function drawChart(c, w, h, s, L) {
    const u = L.u, pad = L.pad;
    const top = headRow(c, w, h, s.title, L);
    const data = series(s);
    const color = s.up === false ? SC.down : SC.up;
    const v = val(s.value);
    const k = L.lod === 'tiny' ? 1.7 : L.lod === 'mid' ? 1.25 : 1;
    const wide = w / h >= 1.55;
    const al = L.rtl ? 'right' : 'left';
    if (wide) {
      const bw = (w - 2 * pad) * 0.34;
      const bx = L.rtl ? w - pad : pad;
      const vs = fitSize(c, v, Math.min((h - top) * 0.36, 20 * u * k), bw - 2 * u, 600, FM, 4 * u);
      const vy = top + vs * 0.7;
      tx(c, v, bx, vy, { size: vs, weight: 600, color: SC.text, align: al });
      if (str(s.delta)) delta(c, s.delta, s.up === true ? true : s.up === false ? false : null, bx, vy + vs * 0.62 + 4 * u * k, 5.4 * u * k, al);
      const cx0 = L.rtl ? pad : pad + bw + 3 * u;
      lineChart(c, cx0, top + 1.5 * u, w - 2 * pad - bw - 3 * u, h - top - pad - 1.5 * u, data, color, u, L.lod !== 'tiny');
    } else {
      const vs = fitSize(c, v, Math.min((h - top) * 0.26, 18 * u * k), (w - 2 * pad) * 0.62, 600, FM, 4 * u);
      const vy = top + vs * 0.6;
      const vw = tx(c, v, L.rtl ? w - pad : pad, vy, { size: vs, weight: 600, color: SC.text, align: al });
      if (str(s.delta)) delta(c, s.delta, s.up === true ? true : s.up === false ? false : null, L.rtl ? w - pad - vw - 3 * u : pad + vw + 3 * u, vy + vs * 0.08, 5.4 * u * k, al);
      const cy0 = vy + vs * 0.7 + 2 * u;
      lineChart(c, pad, cy0, w - 2 * pad, h - cy0 - pad, data, color, u, L.lod !== 'tiny');
    }
  }
  const TONE = { wait: SC.wait, work: SC.work, ok: SC.ok };
  function drawList(c, w, h, s, L) {
    const u = L.u, pad = L.pad;
    const top = headRow(c, w, h, s.title, L);
    const rows = (Array.isArray(s.rows) ? s.rows : []).filter(isObj);
    const k = L.lod === 'tiny' ? 1.8 : L.lod === 'mid' ? 1.3 : 1;
    const avail = h - top - pad * 0.6;
    if (!rows.length) {
      const sz = Math.min(avail * 0.3, 7 * u * k);
      const cy = top + avail * 0.42;
      icon(c, 'check', w / 2, cy - sz * 0.9, sz * 1.6, SC.ok, 1.7);
      tx(c, str(s.empty, 60) || '—', w / 2, cy + sz * 0.9, { size: sz * 0.8, weight: 500, color: SC.muted, align: 'center', max: w - 2 * pad });
      return;
    }
    const minH = 9.5 * u * k;
    const maxRows = Math.max(1, Math.floor(avail / minH));
    const list = rows.slice(0, maxRows);
    const rh = Math.min(avail / list.length, 15 * u * k);
    const ts = Math.min(rh * 0.46, 6.2 * u * k);
    list.forEach((r, i) => {
      const y = top + rh * (i + 0.5);
      if (i > 0) { c.fillStyle = SC.line; c.fillRect(pad, top + rh * i, w - 2 * pad, Math.max(1, u * 0.35)); }
      const dc = TONE[r.tone] || SC.faint;
      const dx = L.rtl ? w - pad - 1.6 * u : pad + 1.6 * u;
      dot(c, dx, y, Math.max(1.5, 1.35 * u * k), dc, !!TONE[r.tone]);
      const meta = latin(str(r.meta, 18));
      c.font = `500 ${ts * 0.9}px ${FM}`;
      const mw = meta ? c.measureText(meta).width + 3 * u : 0;
      const tx0 = L.rtl ? w - pad - 6.8 * u * Math.min(k, 1.4) : pad + 6.8 * u * Math.min(k, 1.4);
      tx(c, r.text, tx0, y, { size: ts, weight: 500, color: SC.text, align: L.rtl ? 'right' : 'left', max: w - 2 * pad - 7 * u - mw });
      if (meta) tx(c, meta, L.rtl ? pad : w - pad, y, { size: ts * 0.9, weight: 500, color: r.tone === 'wait' ? SC.wait : SC.muted, align: L.rtl ? 'left' : 'right' });
    });
  }
  const FLOW_ICONS = [
    [/code|build|كود|بناء|يبني|draft|مسودة|working|يشتغل|يجهّز|فرز|triage|متابعة|follow/i, 'code'],
    [/request|new|طلب|جديد|فكرة|idea|بلاغ|report|حجز|book|lead/i, 'inbox'],
    [/test|اختبار|review|مراجعة|يراجع|موافق|approv|إصلاح|fix|تنفيذ|run|قرار|decide/i, 'check'],
    [/ship|deploy|نشر|دمج|merge|done|تم|إغلاق|close|تقرير|publish|ينضم|join|يتطبّق|apply/i, 'rocket'],
    [/measure|قياس|monitor|مراقبة|scale|ينمو|grow|live/i, 'chart'],
  ];
  const flowIcon = (label, i) => {
    for (const [re, ic] of FLOW_ICONS) if (re.test(label)) return ic;
    return ['inbox', 'code', 'check', 'rocket', 'chart'][i % 5];
  };
  function drawFlow(c, w, h, s, L) {
    const u = L.u, pad = L.pad;
    const top = headRow(c, w, h, s.title, L, { color: SC.orange });
    let steps = (Array.isArray(s.steps) ? s.steps : []).map((x) => str(x, 24)).filter(Boolean).slice(0, 5);
    if (!steps.length) steps = L.lang === 'ar' ? ['طلب', 'بناء', 'مراجعة', 'دمج'] : ['CODE', 'TEST', 'SHIP', 'LIVE'];
    const k = steps.length;
    const slot = (w - 2 * pad) / k;
    const avail = h - top - pad * 0.6;
    const showLbl = L.lod !== 'tiny';
    const box = Math.min(slot * 0.5, avail * (showLbl ? 0.56 : 0.78));
    const cy = top + (showLbl ? avail * 0.4 : avail * 0.5);
    steps.forEach((lbl, i) => {
      const ord = L.rtl ? k - 1 - i : i;
      const cx = pad + slot * (ord + 0.5);
      rrect(c, cx - box / 2, cy - box / 2, box, box, box * 0.18);
      c.fillStyle = '#171C1B'; c.fill();
      c.strokeStyle = i === 0 ? SC.orange : 'rgba(241,85,29,0.55)'; c.lineWidth = Math.max(1, box * 0.04); c.stroke();
      icon(c, flowIcon(lbl, i), cx, cy, box * 0.56, '#F4F4F0', 1.7);
      if (showLbl) tx(c, lbl, cx, cy + box * 0.5 + 5.2 * u, { size: Math.min(5.6 * u * (L.lod === 'mid' ? 1.3 : 1), slot * 0.16), weight: 600, color: SC.text, align: 'center', max: slot - 2 * u, upper: true, ls: 0.4 * u });
      if (i < k - 1) {
        const ax = L.rtl ? cx - slot / 2 : cx + slot / 2;
        const len = Math.min(slot - box - 4 * u, slot * 0.3);
        if (len > u * 2) {
          const sgn = L.rtl ? -1 : 1;
          c.strokeStyle = SC.orange; c.lineWidth = Math.max(1, u * 0.9); c.lineCap = 'round';
          c.beginPath(); c.moveTo(ax - (sgn * len) / 2, cy); c.lineTo(ax + (sgn * len) / 2, cy);
          c.moveTo(ax + (sgn * len) / 2 - sgn * 2.2 * u, cy - 2 * u); c.lineTo(ax + (sgn * len) / 2, cy); c.lineTo(ax + (sgn * len) / 2 - sgn * 2.2 * u, cy + 2 * u);
          c.stroke();
        }
      }
    });
  }
  const DRAW = { kpis: drawKpis, chart: drawChart, list: drawList, flow: drawFlow };
  function drawScreen(c, w, h, s, L) {
    panelBg(c, w, h, L.u);
    (DRAW[s && s.type] || drawKpis)(c, w, h, isObj(s) ? s : {}, L);
  }
  /** شاشة كبيرة مقسّمة أقسام (المدير التنفيذي) */
  function drawComposite(c, w, h, list, L) {
    panelBg(c, w, h, L.u);
    const ws = list.map((s) => (s.type === 'chart' ? 1.25 : s.type === 'list' ? 0.95 : 1));
    const tot = ws.reduce((a, b) => a + b, 0);
    let x = 0;
    list.forEach((s, i) => {
      const sw = (w * ws[i]) / tot;
      const sx = L.rtl ? w - x - sw : x;
      c.save();
      c.translate(sx, 0);
      c.beginPath(); c.rect(0, 0, sw, h); c.clip();
      const Ls = Object.assign({}, L, { u: Math.min(h / 100, sw / 150) * (L.compositeK || 1) });
      Ls.pad = 6 * Ls.u;
      (DRAW[s.type] || drawKpis)(c, sw, h, s, Ls);
      c.restore();
      if (i > 0) { c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(L.rtl ? sx + sw : sx, h * 0.07, Math.max(1, L.u * 0.4), h * 0.86); }
      x += sw;
    });
  }
  /** لوحة اسم الدور على الجدار الجانبي (برتقالي على غامق) */
  function drawLabel(c, w, h, text, L, extra) {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1E1915');
    g.addColorStop(1, '#130F0D');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    const u = Math.min(w, h * 1.6) / 100;
    c.strokeStyle = 'rgba(241,85,29,0.35)';
    c.lineWidth = Math.max(1, u * 0.7);
    c.strokeRect(c.lineWidth / 2, c.lineWidth / 2, w - c.lineWidth, h - c.lineWidth);
    const pad = 8 * u;
    const ar = ARX.test(text);
    const al = L.rtl ? 'right' : 'left';
    const x = L.rtl ? w - pad : pad;
    const fam = ar ? FK : FD;
    const weight = ar ? 800 : 400;
    const t = ar ? text : latin(text).toUpperCase();
    const maxW = w - 2 * pad;
    const extraH = extra && extra.length ? Math.min(extra.length, 3) * 9 * u : 0;
    const availH = h - 2 * pad - extraH;
    // سطر أو سطرين، أيهم يطلع أكبر
    let lines = [t], size = fitSize(c, t, availH * 0.62, maxW, weight, fam, 4);
    const words = t.split(' ');
    if (words.length > 1) {
      c.font = `${weight} 20px ${fam}`;
      let best = null;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' '), z = words.slice(i).join(' ');
        const m = Math.max(c.measureText(a).width, c.measureText(z).width);
        if (!best || m < best.m) best = { m, two: [a, z] };
      }
      const two = best.two;
      {
        const s2 = Math.min(availH * 0.4, ...two.map((ln) => fitSize(c, ln, availH * 0.4, maxW, weight, fam, 4)));
        if (s2 > size * 1.15) { lines = two; size = s2; }
      }
    }
    const lh = size * (ar ? 1.18 : 1.02);
    const blockH = lines.length * lh;
    let y = pad + (availH - blockH) / 2 + lh / 2;
    for (const ln of lines) { tx(c, ln, x, y, { size, weight, fam, color: SC.orange, align: al, ls: ar ? 0 : size * 0.02 }); y += lh; }
    if (extra && extra.length) {
      let ey = h - pad - extraH + 4.5 * u;
      for (const e of extra.slice(0, 3)) {
        tx(c, `${L.rtl ? '‹' : '›'} ${latin(e)}`, x, ey, { size: 5.6 * u, weight: 600, color: SC.orange, alpha: 0.78, align: al, upper: true, max: maxW });
        ey += 9 * u;
      }
    }
  }
  /** شريط اسم الغرفة فوق الشاشات (المقر) */
  function drawStrip(c, w, h, text, L) {
    c.fillStyle = '#16120F';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(241,85,29,0.5)';
    c.fillRect(0, h - Math.max(1, h * 0.05), w, Math.max(1, h * 0.05));
    const pad = h * 0.32;
    const sq = h * 0.2;
    const ar = ARX.test(text);
    c.fillStyle = SC.orange;
    if (L.rtl) c.fillRect(w - pad - sq, h / 2 - sq / 2, sq, sq); else c.fillRect(pad, h / 2 - sq / 2, sq, sq);
    const size = fitSize(c, text, h * 0.5, w - 2 * pad - sq * 2, ar ? 700 : 600, ar ? FK : FM, h * 0.28);
    tx(c, text, L.rtl ? w - pad - sq * 1.9 : pad + sq * 1.9, h / 2, { size, weight: ar ? 700 : 600, color: SC.orange, align: L.rtl ? 'right' : 'left', upper: true, ls: size * 0.06 });
  }
  /** لوحة «الرؤية» بغرفة المدير */
  function drawVision(c, w, h, text, L) {
    c.fillStyle = '#F3EFE8';
    c.fillRect(0, 0, w, h);
    const u = Math.min(w, h) / 100;
    const pad = 11 * u;
    const ar = L.lang === 'ar';
    const al = ar ? 'right' : 'left';
    const x = ar ? w - pad : pad;
    tx(c, ar ? 'الرؤية' : 'VISION', x, pad + 4 * u, { size: 7.5 * u, weight: 700, color: '#2A2A28', align: al, ls: 1.2 * u });
    c.fillStyle = SC.orange;
    c.fillRect(ar ? w - pad - 12 * u : pad, pad + 10 * u, 12 * u, 1.4 * u);
    const fam = ar ? FK : FM;
    const size = 8.6 * u;
    const lines = wrap(c, text, w - 2 * pad, `${ar ? 700 : 600} ${size}px ${fam}`).slice(0, 5);
    let y = pad + 22 * u;
    for (const ln of lines) { tx(c, ln, x, y, { size, weight: ar ? 700 : 600, fam, color: '#1E1E1C', align: al }); y += size * 1.45; }
    drawLogo(c, ar ? pad + 7 * u : w - pad - 7 * u, h - pad - 5 * u, 14 * u, SC.orange);
  }

  // ---------- قوام مشتركة ----------
  function makeCodeTex() {
    const cv = mkCanvas(256, 160), x = cv.getContext('2d');
    x.fillStyle = '#39413E'; x.fillRect(0, 0, 256, 160);
    x.fillStyle = '#4C5652'; x.fillRect(0, 0, 256, 14);
    x.fillStyle = '#323936'; x.fillRect(0, 14, 40, 146);
    for (let i = 0; i < 3; i++) { x.fillStyle = '#7C8A84'; x.beginPath(); x.arc(9 + i * 9, 7, 2.6, 0, PI * 2); x.fill(); }
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const cols = ['#F2F7F4', '#F2F7F4', '#F2F7F4', '#A6EBC2', '#FFD0A8', '#A9B9B2'];
    for (let r = 0; r < 13; r++) {
      const y = 21 + r * 10.5;
      let xx = 48 + Math.floor(rnd() * 3) * 10;
      const parts = 1 + Math.floor(rnd() * 3);
      for (let p = 0; p < parts && xx < 240; p++) { const w = 14 + rnd() * 52; x.fillStyle = cols[Math.floor(rnd() * cols.length)]; x.fillRect(xx, y, Math.min(w, 246 - xx), 4.5); xx += w + 7; }
      if (r < 9) { x.fillStyle = '#8D9A94'; x.fillRect(8, y, 22, 3.5); }
    }
    return tex(cv);
  }
  function makeTileTex() {
    const cv = mkCanvas(256, 256), x = cv.getContext('2d');
    const tones = ['#2E2B28', '#2B2825', '#302C29', '#2C2926'];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { x.fillStyle = tones[i * 2 + j]; x.fillRect(i * 128, j * 128, 128, 128); }
    x.fillStyle = '#1F1D1B';
    x.fillRect(0, 0, 256, 2); x.fillRect(0, 127, 256, 2); x.fillRect(0, 0, 2, 256); x.fillRect(127, 0, 2, 256);
    const t = tex(cv, { repeat: true });
    return t;
  }
  function makeBlobTex() {
    const cv = mkCanvas(256, 256), x = cv.getContext('2d');
    // مستطيل ناعم (ظل تلامس): نرسم بظل مزاح عشان التمويه
    x.shadowColor = 'rgba(0,0,0,1)';
    x.shadowBlur = 46;
    x.shadowOffsetX = 1000;
    x.fillStyle = '#000';
    rrect(x, 58 - 1000, 58, 140, 140, 30);
    x.fill();
    return tex(cv, { noMip: false });
  }
  function makeGlowTex() {
    const cv = mkCanvas(64, 128), x = cv.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 128);
    // نطفي الأطراف الجانبية
    const e = x.createLinearGradient(0, 0, 64, 0);
    e.addColorStop(0, 'rgba(0,0,0,1)'); e.addColorStop(0.12, 'rgba(0,0,0,0)'); e.addColorStop(0.88, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-out';
    x.fillStyle = e;
    x.fillRect(0, 0, 64, 128);
    return tex(cv);
  }
  function makeWashTex() {
    const cv = mkCanvas(128, 256), x = cv.getContext('2d');
    x.save();
    x.scale(0.5, 1);
    const g = x.createRadialGradient(128, 6, 2, 128, 40, 230);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
    x.restore();
    return tex(cv);
  }

  // =====================================================================================
  //                                       الخطة
  // =====================================================================================
  const TYPES = ['team', 'ceo', 'eng'];
  const ST = ['waiting', 'working', 'idle'];
  function cleanScreen(s) {
    if (!isObj(s)) return null;
    const t = DRAW[s.type] ? s.type : 'kpis';
    return Object.assign({}, s, { type: t, title: str(s.title, 60) });
  }
  function cleanPlan(plan) {
    const p = isObj(plan) ? plan : {};
    const lang = p.lang === 'en' || p.lang === 'ar' ? p.lang : dir === 'rtl' ? 'ar' : 'en';
    const seen = new Set();
    const uid = (id, fb) => { let s = str(id, 40) || fb; while (seen.has(s)) s += '_'; seen.add(s); return s; };
    let floors = (Array.isArray(p.floors) ? p.floors : []).filter(isObj).slice(0, 8).map((f, fi) => {
      const fid = str(f.id, 40) || `f${fi}`;
      let rooms = (Array.isArray(f.rooms) ? f.rooms : []).filter(isObj).slice(0, 4).map((r, ri) => ({
        id: uid(r.id, `${fid}-${ri}`),
        label: strE(r.label, 80),
        type: TYPES.includes(r.type) ? r.type : 'team',
        people: clamp(Math.round(fin(r.people) ? r.people : 2), 1, 4),
        screens: (Array.isArray(r.screens) ? r.screens : []).map(cleanScreen).filter(Boolean).slice(0, 3),
        status: ST.includes(r.status) ? r.status : 'idle',
        vision: str(r.vision, 120),
      }));
      if (!rooms.length) rooms = [{ id: uid(fid, fid), label: strE(f.label, 80), type: 'team', people: 2, screens: [], status: 'idle', vision: '' }];
      return { id: fid, label: strE(f.label, 80) || rooms[0].label, rooms };
    });
    if (!floors.length) floors = [{ id: 'f0', label: '', rooms: [{ id: uid('room', 'room'), label: '', type: 'team', people: 2, screens: [], status: 'idle', vision: '' }] }];
    const roof = isObj(p.roof) ? p.roof : {};
    return { key: str(p.key, 40), kind: p.kind === 'hq' ? 'hq' : 'team', lang, roof: { title: strE(roof.title, 60), icon: ICONS[roof.icon] ? roof.icon : 'building' }, floors };
  }
  const sigOf = (P) => `${dir}|${P.kind}|${P.floors.map((f) => f.rooms.map((r) => `${r.id}:${r.type}:${r.people}:${r.screens.map((s) => s.type).join(',')}`).join(';')).join('/')}`;

  // =====================================================================================
  //                                        البناء
  // =====================================================================================
  let B = null; // البناء الحالي
  let Wpx = 760, Hpx = 660;
  let states = {}, selected = null;
  let fontsOk = !(document.fonts && document.fonts.load);
  let drawnOnce = false;
  let rectsDirty = true, cacheFloors = [], cacheRooms = [];
  let align = 0; // 0 = المبنى بالنص، 1 = لاصق بجهة عمود النص (setAlign)

  function dimsFor(P) {
    const n = P.floors.length, hq = P.kind === 'hq' || n >= 5;
    const maxR = Math.max(1, ...P.floors.map((f) => f.rooms.length));
    let W, FH, D;
    if (hq) { W = Math.max(14, 4.6 * maxR + 0.6); FH = 2.75; D = 4.9; }
    else if (n === 1) { W = maxR > 1 ? Math.max(8, 4.2 * maxR) : 7.4; FH = 4.25; D = 5.2; }
    else if (n === 2) { W = Math.max(8.8, 4.2 * maxR); FH = 3.7; D = 5.8; }
    else if (n === 3) { W = Math.max(8.6, 4.2 * maxR); FH = 3.35; D = 5.6; }
    else { W = Math.max(8.8, 4.2 * maxR); FH = 3.1; D = 5.4; }
    const S = hq ? 0.36 : n === 1 ? 0.5 : 0.42;
    // السقف سميك (~٩٪ من ارتفاع المبنى مثل الملصقات) عشان اللافتة تبان
    const ROOF = hq ? 2.4 : n === 1 ? 1.2 : 1.55;
    // المسرح العريض: المبنى أعرض على قد شكل المسرح (يعبّي ~٨٠٪ من عرضه مثل الملصقات) بدل عمود ضيق بنص فراغ.
    // تقدير من زاوية الكاميرا: عرض الواجهة × cos + العمق (مع القاعدة والدرج) × sin ≈ نسبة المسرح × الارتفاع الكلي
    if (n > 1 && Hpx > 0) {
      const az = hq ? 0.36 : 0.38;
      const Ht = 0.6 + n * (FH + S) + ROOF + (hq ? 3.7 : 3.2);
      const want = ((Wpx / Hpx) * 0.92 * Ht - Math.sin(az) * (D + 3.65)) / Math.cos(az) - 2.7;
      W = Math.max(W, Math.min(hq ? 22 : 17, Math.round(want * 4) / 4));
    }
    return {
      n, hq, single: n === 1, W, FH, D, S,
      T: hq ? 0.4 : 0.46, TB: 0.3, GT: 0.12, LIP: 0.05,
      ROOF,
      CUBE: hq ? 3.7 : clamp(W * 0.33, 2.5, 3.2),
      DECK: n === 1 ? 0.55 : 1.75, SIDE: n === 1 ? 0.85 : 1.6,
      PL: hq ? 0.6 : 0.62,
      yTop: n * (FH + S),
    };
  }

  function build(P) {
    clearBuild();
    const d = dimsFor(P);
    const { n, W, FH, D, S, T, TB, GT, LIP, ROOF, CUBE, PL, yTop } = d;
    const group = new T3.Group();
    scene.add(group);
    const b = {
      plan: P, key: P.key, sig: sigOf(P), d, group, geos: [], mats: [], texs: [], inst: [], lights: [],
      rooms: [], floors: [], people: [], atlases: [], pts: [], sign: null, logo: null,
    };
    B = b;
    const L = { shell: [], matte: [], satin: [], gloss: [], led: [] };
    const floorParts = [], blobParts = [], washParts = [], glassParts = [], glowParts = [], aoParts = [];
    const put = (cls, g, m, c) => L[cls].push({ g, m, c: c ? col(c) : null });
    const box = (cls, c, x, y, z, w, h, dd, rx = 0, ry = 0, rz = 0) => put(cls, TPL.box, mx(x, y, z, rx, ry, rz, w, h, dd), c);
    const cyl = (cls, c, x, y, z, r, h, rx = 0, ry = 0, rz = 0, lo) => put(cls, lo ? TPL.cylLo : TPL.cyl, mx(x, y, z, rx, ry, rz, r, h, r), c);
    const sph = (cls, c, x, y, z, sx, sy, sz, lo) => put(cls, lo ? TPL.sphLo : TPL.sph, mx(x, y, z, 0, 0, 0, sx, sy, sz), c);
    const blob = (x, y, z, w, dd, rot = 0) => blobParts.push({ g: TPL.plane, m: mx(x, y, z, -PI / 2, 0, rot, w, dd, 1) });
    const own = (g) => { b.geos.push(g); return g; };
    const add = (mesh) => { group.add(mesh); return mesh; };

    // ------------------------------- القشرة -------------------------------
    const ux0 = -W / 2 - T, ux1 = W / 2 + GT; // حدود المبنى الخارجية على u
    const zb = -D / 2, zf = D / 2;            // داخل الغرف
    const zB = zb - TB, zF = zf + LIP;        // الخارج
    const shellCol = '#FFFFFF';
    // بلاطة كل دور (أرضية الدور)
    for (let i = 0; i < n; i++) {
      const y = i * (FH + S);
      const g = own(slabGeo(ux1 - ux0, S, zF - zB, 0.07));
      put('shell', g, mx((ux0 + ux1) / 2, y + S / 2, (zF + zB) / 2), shellCol);
    }
    // الجدار المصمت والخلفي
    box('shell', shellCol, ux0 + T / 2, yTop / 2, (zF + zB) / 2, T, yTop, zF - zB);
    box('shell', shellCol, (ux0 + ux1) / 2, yTop / 2, zB + TB / 2, ux1 - ux0, yTop, TB);
    // السقف العلوي السميك + المكعب
    const rx0 = ux0 - 0.14, rx1 = ux1 + 0.14, rz0 = zB - 0.14, rz1 = zF + 0.16;
    put('shell', own(slabGeo(rx1 - rx0, ROOF, rz1 - rz0, 0.16)), mx((rx0 + rx1) / 2, yTop + ROOF / 2, (rz0 + rz1) / 2), shellCol);
    const cu = -W * 0.04, cz = zb + D * 0.38 - (d.hq ? 0.2 : 0), cy0 = yTop + ROOF;
    box('shell', '#FDFDFB', cu, cy0 + CUBE / 2, cz, CUBE, CUBE, CUBE);
    box('matte', '#CFCFC9', cu, cy0 + 0.03, cz, CUBE - 0.08, 0.06, CUBE - 0.08); // خط ظل تحت المكعب
    // القاعدة: بلاطة بيضاء بحافة مدوّرة، تجويف غامق وشريط برتقالي مضيء تحته
    const px0 = ux0 - 0.5, px1 = ux1 + d.SIDE, pz0 = zB - 0.45, pz1 = zF + d.DECK;
    const REC = 0.11;
    put('shell', own(slabGeo(px1 - px0, PL - REC, pz1 - pz0, 0.1)), mx((px0 + px1) / 2, -(PL - REC) / 2, (pz0 + pz1) / 2), shellCol);
    box('matte', C.recess, (px0 + px1) / 2 - 0.06, -PL + REC / 2, (pz0 + pz1) / 2 - 0.08, px1 - px0 - 0.24, REC, pz1 - pz0 - 0.2);
    box('led', null, (px0 + px1) / 2 - 0.05, -PL + REC * 0.55, pz1 - 0.16, px1 - px0 - 0.18, 0.035, 0.02);
    box('led', null, px1 - 0.16, -PL + REC * 0.55, (pz0 + pz1) / 2, 0.02, 0.035, pz1 - pz0 - 0.24);
    L.led[L.led.length - 1].c = L.led[L.led.length - 2].c = col('#FF6A2B');
    glowParts.push({ g: TPL.plane, m: mx((px0 + px1) / 2, -PL + 0.004, pz1 + 0.18, -PI / 2, 0, 0, px1 - px0 + 0.3, 0.6, 1), uvr: [0, 1, 1, -1] });
    glowParts.push({ g: TPL.plane, m: mx(px1 + 0.07, -PL + 0.004, (pz0 + pz1) / 2, -PI / 2, 0, PI / 2, pz1 - pz0 + 0.2, 0.3, 1), uvr: [0, 1, 1, -1] });
    // درج أمامي وأحواض نباتات
    const stepU = d.hq ? -W * 0.1 : -W * 0.16, stepW = d.hq ? 3.6 : 3.0, stepN = 3, stepH = PL / (stepN + 1), stepD = 0.36;
    for (let k = 0; k < (d.single ? 0 : stepN); k++) {
      const top = -stepH * (k + 1);
      box('shell', '#F6F6F3', stepU, (top - PL) / 2, pz1 + stepD * (k + 0.5), stepW, top + PL, stepD);
    }
    const planter = (u, z, w, dd, h) => {
      box('shell', '#F7F7F4', u, h / 2, z, w, h, dd);
      box('matte', C.soil, u, h - 0.02, z, w - 0.08, 0.03, dd - 0.08);
      const cnt = Math.max(3, Math.round(w / 0.32));
      for (let i = 0; i < cnt; i++) {
        const t = (i + 0.5) / cnt;
        const r = 0.17 + ((i * 37) % 7) * 0.012;
        put('matte', TPL.ico, mx(u - w / 2 + t * w, h + r * 0.55, z + (((i * 53) % 5) - 2) * 0.04, i, i * 0.7, 0, r, r * 0.85, r), C.leaves[i % C.leaves.length]);
      }
      blob(u, 0.002, z, w + 0.3, dd + 0.3);
    };
    const deckZ = zF + Math.min(0.75, d.DECK * 0.45);
    if (!d.single) {
      planter(stepU - stepW / 2 - 1.35, deckZ, 2.2, 0.55, 0.42);
      planter(stepU + stepW / 2 + 1.6, deckZ, 2.6, 0.55, 0.42);
    }
    // نباتات طويلة برا الزجاج
    const outer = [];
    const sideU = ux1 + d.SIDE * 0.55;
    const sideZs = d.single ? [zf - D * 0.5, zb + 0.7] : [zF + 0.6, zf - D * 0.45, zb + 0.6];
    sideZs.forEach((z, i) => { plant(sideU, 0, z, i === 1 ? 2.0 : 1.6 + i * 0.1, 'white', i + 3, 'tall'); outer.push([sideU, 2.3, z]); });
    // ظل تلامس تحت القاعدة
    blobParts.push({ g: TPL.plane, m: mx((px0 + px1) / 2, -PL + 0.003, (pz0 + pz1) / 2 + 0.3, -PI / 2, 0, 0, (px1 - px0) * 1.22, (pz1 - pz0 + 1.2) * 1.25, 1), big: true });

    // ------------------------------- الأدوار والغرف -------------------------------
    // الكاميرا تنحسب قبل الداخل عشان نحط الشاشات بالجزء الظاهر من الجدار الخلفي
    b.pts = fitPoints(d, outer, { px0, px1, pz0, pz1: pz1 + (d.single ? 0 : stepD * stepN), cu, cz, cy0 });
    b.cam = camParams(d);
    b.center = new T3.Vector3(((ux0 + ux1) / 2) * M, 0, (zB + zF) / 2);
    fit();
    const camY = camera.position.y, camZ = camera.position.z;

    P.floors.forEach((F, fi) => {
      const bi = n - 1 - fi; // من تحت
      const y0 = bi * (FH + S) + S, y1 = y0 + FH;
      const k = F.rooms.length;
      const rw = W / k;
      const fl = { id: F.id, label: F.label, fi, y0, y1, rooms: [] };
      b.floors.push(fl);
      // الزجاج والقوائم على جهة الكاميرا
      glassParts.push({ g: TPL.plane, m: mx(W / 2 + GT * 0.45, (y0 + y1) / 2, (zb + zf) / 2, 0, PI / 2, 0, D, FH, 1) });
      const mulN = Math.max(2, Math.round(D / 2.4));
      for (let i = 0; i <= mulN; i++) {
        const z = zb + (D * i) / mulN;
        box('gloss', '#1B1B1C', W / 2 + GT * 0.45, (y0 + y1) / 2, i === mulN ? zf - 0.05 : z, 0.04, FH, i === mulN ? 0.09 : 0.04);
      }
      box('gloss', '#1B1B1C', W / 2 + GT * 0.45, y0 + 0.05, (zb + zf) / 2, 0.06, 0.1, D);
      // فواصل بين الغرف
      for (let i = 1; i < k; i++) {
        const u = -W / 2 + rw * i;
        box('matte', C.part, u, (y0 + y1) / 2, (zb + zf) / 2 - 0.03, 0.12, FH, D - 0.06);
        box('shell', shellCol, u, (y0 + y1) / 2, zf - 0.03, 0.14, FH, 0.08);
      }
      F.rooms.forEach((r, ri) => {
        const R = Object.assign({}, r, {
          fi, ri, floorId: F.id, floorLabel: F.label, u0: -W / 2 + rw * ri, u1: -W / 2 + rw * (ri + 1), y0, y1, zb, zf,
          solid: ri === 0, glassSide: ri === k - 1, nPeople: r.people, people: [], panels: [], planStatus: r.status, state: r.status,
        });
        R.uc = (R.u0 + R.u1) / 2;
        R.rw = R.u1 - R.u0;
        b.rooms.push(R);
        fl.rooms.push(R);
        buildRoom(R);
      });
    });

    // ------------------------------- أضواء الغرف (من المجموعة الثابتة) -------------------------------
    // الغرفة العريضة تاخذ أكثر من ضوء (إضاءة متساوية)، والمقر (غرف أكثر من الأضواء) ضوء لكل دور
    b.lamps = [];
    for (const l of lamps) { l.intensity = 0; l.position.set(0, -100, 0); }
    const lampAt = (u, y, z, span, rooms, dist) => {
      const l = lamps[b.lamps.length];
      if (!l) return;
      const dcy = span > 5 ? 1.15 : 1.6;
      l.position.set(u * M, y, z);
      l.decay = dcy;
      l.distance = dist || Math.max(span, D) * 1.5;
      b.lamps.push({ l, rooms, base: (7 + span * D * 0.55) * (dcy < 1.6 ? 0.72 : 1) });
    };
    if (b.rooms.length > LPOOL) for (const fl of b.floors) lampAt(0, fl.y1 - 0.45, zb + D * 0.42, W, fl.rooms, W * 0.62);
    else {
      const per = Math.floor(LPOOL / b.rooms.length);
      for (const R of b.rooms) {
        const k = clamp(Math.round(R.rw / 3.4), 1, per);
        for (let j = 0; j < k; j++) lampAt(R.u0 + (R.rw * (j + 0.5)) / k, R.y1 - 0.45, zb + D * 0.42, R.rw / k, [R]);
      }
    }

    // ------------------------------- دمج ورسم -------------------------------
    const meshOf = (geo, mat, cast, recv) => {
      if (!geo) return null;
      own(geo);
      const m = new T3.Mesh(geo, mat);
      m.castShadow = !!cast; m.receiveShadow = !!recv;
      return add(m);
    };
    meshOf(merge(L.shell, true, false), MAT.shell, true, true);
    meshOf(merge(L.matte, true, false), MAT.matte, true, true);
    meshOf(merge(L.satin, true, false), MAT.satin, true, true);
    meshOf(merge(L.gloss, true, false), MAT.gloss, true, true);
    meshOf(merge(L.led, true, false), MAT.led, false, false);
    meshOf(merge(floorParts, false, true), MAT.floor, false, true);
    meshOf(merge(glassParts, false, false), MAT.glass, false, false);
    const blobs = meshOf(merge(blobParts.filter((p) => !p.big), false, true), MAT.blob, false, false);
    if (blobs) blobs.renderOrder = 1;
    const big = blobParts.find((p) => p.big);
    const bigBlob = new T3.MeshBasicMaterial({ map: blobTex, color: '#000000', transparent: true, depthWrite: false, opacity: 0.4 });
    b.mats.push(bigBlob);
    b.bigBlob = meshOf(merge([big], false, true), bigBlob, false, false);
    meshOf(merge(glowParts, false, true), MAT.glow, false, false);
    const ao = meshOf(merge(aoParts, false, true), MAT.ao, false, false);
    if (ao) ao.renderOrder = 1;
    const wash = meshOf(merge(washParts, false, true), MAT.wash, false, false);
    if (wash) wash.renderOrder = 2;
    // أرض شفافة تستقبل الظل
    const ground = meshOf(new T3.PlaneGeometry(1, 1), MAT.ground, false, true);
    ground.rotation.x = -PI / 2;
    ground.position.set(b.center.x, -PL + 0.001, b.center.z);
    ground.scale.set((px1 - px0) * 1.1, (pz1 - pz0) * 1.1, 1);
    // شاشات المكاتب لكل غرفة (لونها بالحالة) + أطلس الشاشات واللوحات
    for (const R of b.rooms) {
      R.monMat = new T3.MeshBasicMaterial({ map: codeTex, color: C.idle, toneMapped: false });
      b.mats.push(R.monMat);
      meshOf(merge(R.monParts, false, true), R.monMat, false, false);
      R.monParts = null;
    }
    // الناس: الأذرع InstancedMesh (تتحرك)، الباقي مدموج
    const np = b.people.length;
    if (np) {
      const mk = (geo, color) => {
        const mat = new T3.MeshStandardMaterial({ color, roughness: 0.85 });
        b.mats.push(mat);
        const im = new T3.InstancedMesh(geo, mat, np * 2);
        im.frustumCulled = false;
        im.instanceMatrix.setUsage(T3.DynamicDrawUsage);
        b.inst.push(im);
        return add(im);
      };
      b.armU = mk(SH.upper, C.hood);
      b.armF = mk(SH.fore, C.hood);
      b.armH = mk(SH.hand, C.skin);
    }
    // اللوحات النصية (أطلس لكل غرفة) + لافتة السطح + شعار المكعب
    buildAtlases();
    const signW = (rx1 - rx0) * 0.94, signH = ROOF * 0.8;
    b.sign = { w: signW, h: signH, canvas: null, tex: null };
    b.sign.mat = new T3.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false });
    b.mats.push(b.sign.mat);
    const sm = meshOf(new T3.PlaneGeometry(signW, signH), b.sign.mat, false, false);
    sm.position.set(((rx0 + rx1) / 2) * M, yTop + ROOF / 2, rz1 + 0.006);
    b.logo = { size: CUBE * 0.62 };
    b.logo.mat = new T3.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false });
    b.mats.push(b.logo.mat);
    const lm = meshOf(new T3.PlaneGeometry(CUBE * 0.62, CUBE * 0.62), b.logo.mat, false, false);
    lm.position.set(cu * M, cy0 + CUBE / 2, cz + CUBE / 2 + 0.006);
    // الضوء الأساسي: من جهة الجدار المصمت، فوق وقدّام
    const span = Math.max(W + 3, yTop + CUBE + 2, D + 4);
    sun.position.set(b.center.x - 0.24 * span * M, yTop * 0.6 + span * 1.9, b.center.z + span * 0.95);
    sun.target.position.set(b.center.x, yTop * 0.4, b.center.z);
    const sc = sun.shadow.camera;
    sc.left = -span * 0.85; sc.right = span * 0.85; sc.top = span * 0.85; sc.bottom = -span * 0.85;
    sc.near = 0.5; sc.far = span * 4;
    sc.updateProjectionMatrix();
    sun.target.updateMatrixWorld();
    applyTheme();
    applyStates();
    drawAll();
    renderer.shadowMap.needsUpdate = true;
    rectsDirty = true;

    // =============================== الغرفة ===============================
    function buildRoom(R) {
      const { u0, u1, y0, y1, uc, rw } = R;
      const FHr = y1 - y0;
      R.monParts = [];
      // أرضية بلاط (UV بمقياس العالم)
      floorParts.push({ g: TPL.plane, m: mx(uc, y0 + 0.004, (zb + zf) / 2, -PI / 2, 0, 0, rw, D, 1), uvr: [0, 0, rw / 1.25, D / 1.25] });
      // تكسية الجدران والسقف الغامقة
      put('matte', TPL.plane, mx(uc, (y0 + y1) / 2, zb + 0.004, 0, 0, 0, rw, FHr, 1), C.wall);
      put('matte', TPL.plane, mx(uc, y1 - 0.004, (zb + zf) / 2, PI / 2, 0, 0, rw, D, 1), C.ceil);
      if (R.solid) put('matte', TPL.plane, mx(u0 + 0.004, (y0 + y1) / 2, (zb + zf) / 2, 0, PI / 2, 0, D, FHr, 1), C.wallSide);
      if (R.ri > 0) put('matte', TPL.plane, mx(u0 + 0.065, (y0 + y1) / 2, (zb + zf) / 2, 0, PI / 2, 0, D, FHr, 1), C.wallSide);
      if (!R.glassSide) put('matte', TPL.plane, mx(u1 - 0.065, (y0 + y1) / 2, (zb + zf) / 2, 0, -PI / 2, 0, D, FHr, 1), C.wallSide);
      // سقف: إطار LED مستطيل + سبوتات قدّام الجدار الخلفي + بقع ضوء على الجدار
      const ix = Math.min(0.75, rw * 0.16), iz = Math.min(0.9, D * 0.16);
      const ly = y1 - 0.025;
      box('led', C.led, uc, ly, zb + iz, rw - 2 * ix, 0.025, 0.05);
      box('led', C.led, uc, ly, zf - iz, rw - 2 * ix, 0.025, 0.05);
      box('led', C.led, u0 + ix, ly, (zb + zf) / 2, 0.05, 0.025, D - 2 * iz);
      box('led', C.led, u1 - ix, ly, (zb + zf) / 2, 0.05, 0.025, D - 2 * iz);
      box('led', '#FFD9A8', uc, y1 - 0.05, zb + 0.03, rw - 0.1, 0.02, 0.02); // خط ضوء مخفي أعلى الجدار الخلفي
      // تظليل خفيف عند التقاء الأرضية بالجدران (عمق)
      aoParts.push({ g: TPL.plane, m: mx(uc, y0 + 0.006, zb + 0.45, -PI / 2, 0, 0, rw, 0.9, 1), uvr: [0, 1, 1, -1] });
      aoParts.push({ g: TPL.plane, m: mx(uc, y0 + 0.3, zb + 0.008, 0, 0, 0, rw, 0.6, 1) });
      aoParts.push({ g: TPL.plane, m: mx(u0 + 0.4, y0 + 0.007, (zb + zf) / 2, -PI / 2, 0, PI / 2, D, 0.8, 1), uvr: [0, 1, 1, -1] });
      if (R.glassSide) aoParts.push({ g: TPL.plane, m: mx(u1 - 0.4, y0 + 0.007, (zb + zf) / 2, -PI / 2, 0, -PI / 2, D, 0.8, 1), uvr: [0, 1, 1, -1] });
      aoParts.push({ g: TPL.plane, m: mx(uc, y1 - 0.007, zb + 0.35, PI / 2, 0, 0, rw, 0.7, 1) });
      const spots = Math.max(1, Math.round((rw - 0.6) / 1.5));
      for (let i = 0; i < spots; i++) {
        const u = u0 + (rw * (i + 0.5)) / spots;
        put('led', TPL.disc, mx(u, y1 - 0.012, zb + 0.42, PI / 2, 0, 0, 0.065, 0.065, 1), col(C.spot));
        washParts.push({ g: TPL.plane, m: mx(u, y1 - Math.min(1.1, FHr * 0.36), zb + 0.012, 0, 0, 0, 1.5, Math.min(2.2, FHr * 0.72), 1) });
      }
      // تحديد: شريط برتقالي على حافة الأرضية + توهج خفيف
      R.selGroup = new T3.Group();
      R.selGroup.visible = false;
      group.add(R.selGroup);
      const sg = own(new T3.BoxGeometry(rw - 0.3, 0.025, 0.05));
      const s1 = new T3.Mesh(sg, MAT.sel);
      s1.position.set(uc * M, y0 + 0.016, zf - 0.07);
      R.selGroup.add(s1);
      // إطار برتقالي رفيع حول فتحة الغرفة (يبين من فوق ومن تحت)
      const fz = zf + LIP + 0.012, inset = 0.06;
      const fw = own(new T3.BoxGeometry(rw - 2 * inset, 0.045, 0.02)), fh = own(new T3.BoxGeometry(0.045, FHr - 2 * inset, 0.02));
      for (const [g2, x, y] of [[fw, uc, y1 - inset], [fw, uc, y0 + inset], [fh, u0 + inset, (y0 + y1) / 2], [fh, u1 - inset, (y0 + y1) / 2]]) {
        const fm = new T3.Mesh(g2, MAT.sel);
        fm.position.set(x * M, y, fz);
        R.selGroup.add(fm);
      }
      const gg = own(new T3.PlaneGeometry(rw - 0.3, 1.3));
      const s2 = new T3.Mesh(gg, MAT.selGlow);
      s2.rotation.x = -PI / 2;
      s2.position.set(uc * M, y0 + 0.008, zf - 0.72);
      R.selGroup.add(s2);
      // لمبة تنبيه
      R.alertMesh = new T3.Mesh(SH.lamp, MAT.alert);
      R.alertMesh.scale.setScalar(0.1);
      R.alertMesh.position.set((u1 - 0.3) * M, y1 - 0.16, zf - 0.3);
      R.alertMesh.visible = false;
      group.add(R.alertMesh);

      // الأثاث حسب النوع
      if (R.type === 'ceo') ceoRoom(R); else teamRoom(R, R.type === 'eng');
      // الشاشات واللوحات
      wallPanels(R);
    }

    // ---------------- نطاق الجدار الخلفي الظاهر للكاميرا ----------------
    function band(R) {
      const { y0, y1 } = R;
      const t = (zb - camZ) / (zf + LIP - camZ);
      const hi = camY + t * (y1 - camY), lo = camY + t * (y0 - camY);
      return [Math.max(y0, lo), Math.min(y1, hi)];
    }
    function wallPanels(R) {
      const { u0, u1, y0, y1, rw } = R;
      const FHr = y1 - y0;
      const [vlo, vhi] = band(R);
      const hqSmall = d.hq;
      let top = Math.min(y1 - (hqSmall ? 0.16 : 0.24), vhi - 0.06);
      // شريط الاسم فوق الشاشات (المقر)
      if (hqSmall) {
        const sh = 0.34;
        if (top - sh - 0.55 > Math.max(vlo, y0 + 1.15)) {
          R.panels.push({ kind: 'strip', u: (u0 + u1) / 2, y: top - sh / 2, z: zb + 0.03, w: rw - 0.5, h: sh, wall: 'back' });
          top -= sh + 0.1;
        }
      }
      const floorLo = y0 + (hqSmall ? 1.32 : 1.36);
      let bot = Math.max(floorLo, vlo + 0.1, top - (hqSmall ? 1.25 : 2.0));
      if (top - bot < 0.55) bot = top - 0.55;
      const sh = top - bot;
      const a = u0 + (R.solid ? 0.38 : 0.3);
      // جهة الزجاج: الجزء من الجدار الخلفي اللي يبان من ورا قوائم الزجاج الجانبي (≈ ٠٫٤ من العمق) يبقى بدون شاشات
      let bnd = u1 - (R.glassSide ? 0.38 + 0.4 * D : 0.3);
      // المدير بالمقر (دور عريض): مكتبه بالجزء الأول، وغرفة الاجتماعات ورا الفاصل
      const meet = R.type === 'ceo' && rw > 11 ? u0 + rw * 0.6 : null;
      if (meet) bnd = Math.min(bnd, meet - 0.3);
      if (bnd - a < 1.4) bnd = Math.min(u1 - 0.3, a + 1.4);
      const avail = bnd - a;
      let list = R.screens.length ? R.screens.slice() : [{ type: 'kpis', title: R.label, items: [] }];
      if (R.type === 'ceo') {
        const w = Math.min(avail * 0.86, sh * 3.2, 6.2);
        const ucx = R.solid ? a + avail * 0.5 : (a + bnd) / 2;
        R.panels.push({ kind: 'composite', list, u: ucx, y: (top + bot) / 2, z: zb + 0.055, w, h: sh, wall: 'back', bezel: true });
        // لوحة «الرؤية» على جدار غرفة الاجتماعات
        if (meet) {
          const vh = Math.min(sh, 1.3), vw = vh * 0.82;
          R.panels.push({ kind: 'vision', text: R.vision, u: meet + 0.3 + Math.min(1.6, (u1 - meet) * 0.3), y: (top + bot) / 2, z: zb + 0.052, w: vw, h: vh, wall: 'back', frame: true });
        }
      } else {
        const maxN = avail >= 6.4 ? 3 : avail >= 3.2 ? 2 : 1;
        const spill = d.single && R.solid && list.length > maxN ? list[maxN] : null;
        list = list.slice(0, maxN);
        if (spill) {
          const sw = Math.min(D * 0.32, 1.7), shh = Math.min(sh, sw * 0.8);
          R.panels.push({ kind: 'screen', s: spill, u: u0 + 0.056, y: Math.min(top - shh / 2, (top + bot) / 2 + 0.2), z: zb + 0.32 + sw / 2, w: sw, h: shh, wall: 'side', bezel: true, late: true });
        }
        const gap = 0.14;
        const wt = list.map((s, i) => (s.type === 'flow' ? 1.7 : i === 0 ? 1.3 : 1) * (s.type === 'list' ? 0.95 : 1));
        const tot = wt.reduce((x, y) => x + y, 0);
        let ws = wt.map((x) => ((avail - gap * (list.length - 1)) * x) / tot);
        const cap = sh * (list.length === 1 ? 2.6 : 2.5);
        ws = ws.map((x) => Math.min(x, cap));
        const used = ws.reduce((x, y) => x + y, 0) + gap * (list.length - 1);
        let u = a + (avail - used) / 2;
        const at = R.panels.length && R.panels[R.panels.length - 1].late ? R.panels.length - 1 : R.panels.length;
        list.forEach((s, i) => {
          R.panels.splice(at + i, 0, { kind: 'screen', s, u: u + ws[i] / 2, y: (top + bot) / 2, z: zb + 0.055, w: ws[i], h: sh, wall: 'back', bezel: true });
          u += ws[i] + gap;
        });
      }
      // لوحة الاسم على الجدار الجانبي المصمت + «الرؤية» للمدير
      if (R.solid) {
        const ph = Math.min(FHr * 0.5, 1.6), pw = Math.min(D * 0.42, 2.5);
        const py = Math.min(y1 - 0.35 - ph / 2, Math.max(y0 + 1.45 + ph / 2, (top + bot) / 2));
        const extra = R.type === 'eng' ? ((R.screens.find((s) => s.type === 'flow') || {}).steps || []) : null;
        const side = R.panels.some((p) => p.late);
        R.panels.push({ kind: 'label', text: R.floorLabel || R.label, extra, u: u0 + 0.03, y: py, z: zb + D * (side ? 0.64 : 0.5), w: Math.min(pw, side ? D * 0.4 : pw), h: ph, wall: 'side' });
        if (R.type === 'ceo' && D >= 4.6 && !meet) {
          const vw = Math.min(1.25, D * 0.22), vh = Math.min(FHr * 0.42, vw * 1.3);
          R.panels.push({ kind: 'vision', text: R.vision, u: u0 + 0.052, y: Math.min(y1 - 0.3 - vh / 2, y0 + 1.5 + vh / 2), z: zb + 0.45 + vw / 2, w: vw, h: vh, wall: 'side', frame: true });
        }
      }
      // الإطارات السود ورا الشاشات
      for (const p of R.panels) {
        if (p.wall === 'back' && p.bezel) box('gloss', '#0A0A0B', p.u, p.y, zb + 0.026, p.w + 0.07, p.h + 0.07, 0.05);
        if (p.wall === 'side' && p.bezel) box('gloss', '#0A0A0B', u0 + 0.025, p.y, p.z, 0.05, p.h + 0.07, p.w + 0.07);
        if (p.frame && p.wall === 'side') box('satin', '#151413', u0 + 0.026, p.y, p.z, 0.04, p.h + 0.08, p.w + 0.08);
        else if (p.frame) box('satin', '#151413', p.u, p.y, zb + 0.026, p.w + 0.08, p.h + 0.08, 0.04);
      }
    }

    // ---------------- مكاتب وناس ----------------
    function teamRoom(R, eng) {
      const { u0, y0, uc, rw } = R;
      // الغرفة العريضة تتعبّى (مثل الملصقات: ٤–٥ مكاتب بالدور)
      const cnt = clamp(Math.round(rw / 2.9), Math.max(1, R.nPeople), 6);
      // غرفة وحدة: صف خلفي + موظف قدّام قريب من الكاميرا (عمق مثل الملصقات)
      const front = d.single && cnt >= 3 ? 1 : 0;
      const back = cnt - front;
      const rows = back > 2 && rw < back * 1.6 && D > 4.2 ? 2 : 1;
      const perRow = Math.ceil(back / rows);
      const pitch = Math.min(2.05, (rw - 0.8) / perRow);
      const deskW = clamp(pitch - 0.2, 1.05, 1.65);
      const deskD = 0.74;
      const z0 = zb + (d.hq ? 1.4 : d.single ? 1.55 : D >= 5.5 ? 2.05 : 1.8);
      let idx = 0;
      for (let r = 0; r < rows; r++) {
        const inRow = Math.min(perRow, back - idx);
        const zD = z0 + r * 1.85;
        const shift = d.hq ? 0 : rw * 0.04;
        const bench = !d.hq && inRow >= 2;
        if (bench) {
          // مكتب طويل متصل (مثل الملصقات) بأرجل كل مكتبين
          const span = (inRow - 1) * pitch + deskW;
          const bu = uc + shift;
          box('satin', C.walnut, bu, y0 + 0.72, zD, span, 0.045, deskD);
          box('satin', C.walnutDk, bu, y0 + 0.69, zD - deskD / 2 + 0.02, span - 0.1, 0.05, 0.04);
          const legs = inRow + 1;
          for (let q = 0; q < legs; q++) {
            const lu = bu - span / 2 + 0.05 + (q * (span - 0.1)) / (legs - 1);
            box('gloss', C.metal, lu, y0 + 0.35, zD, 0.05, 0.7, deskD - 0.08);
            box('gloss', C.metal, lu, y0 + 0.015, zD, 0.06, 0.03, deskD - 0.04);
          }
          blob(bu, y0 + 0.006, zD + 0.15, span + 0.3, deskD + 0.6);
        }
        for (let i = 0; i < inRow; i++) {
          const u = uc + shift + (i - (inRow - 1) / 2) * pitch;
          desk(R, u, y0, zD, deskW, deskD, eng || deskW >= 1.3, eng, idx, bench);
          person(R, u, y0, zD + deskD / 2 + 0.4, idx, 'chair');
          idx++;
        }
      }
      if (front) {
        const fu = u0 + rw * 0.36, fz = zf - 1.2;
        desk(R, fu, y0, fz, 1.75, 0.8, true, eng, idx);
        box('satin', C.walnut, fu + 0.88 + 0.32, y0 + 0.72, fz - 0.05, 0.64, 0.04, 0.7);
        box('satin', '#1E1D1C', fu + 0.88 + 0.32, y0 + 0.35, fz - 0.05, 0.6, 0.7, 0.66);
        person(R, fu, y0, fz + 0.8, idx, 'chair');
      }
      // خزانة منخفضة تحت الشاشات بالغرف العريضة
      if (!d.hq && rw >= 6) {
        const cw = Math.min(rw * 0.42, 3.2);
        box('satin', '#2A211B', uc - rw * 0.12, y0 + 0.26, zb + 0.26, cw, 0.52, 0.42);
        box('gloss', '#141312', uc - rw * 0.12, y0 + 0.525, zb + 0.26, cw + 0.02, 0.03, 0.44);
      }
      // نباتات: ركن خلفي جهة الزجاج + ركن أمامي جهة الجدار المصمت
      const big = !d.hq || rw > 3.6;
      plant(R.u1 - 0.45, y0, zb + 0.5, big ? 1.55 : 1.2, 'dark', R.ri + 1, 'leafy');
      if (rw > 3.2) plant(u0 + 0.45, y0, zf - 0.6, big ? 1.1 : 0.85, 'white', R.ri + 7, R.ri % 2 ? 'snake' : 'leafy');
      if (eng) {
        // خزانة سيرفر بلمبات حالة
        const ru = R.u1 - (rw > 5 ? 1.25 : 0.95), rz = zb + 0.42;
        box('gloss', C.rack, ru, y0 + 0.95, rz, 0.62, 1.9, 0.62);
        for (let j = 0; j < 9; j++) {
          box('matte', '#26282A', ru, y0 + 0.3 + j * 0.18, rz + 0.315, 0.52, 0.12, 0.01);
          for (let q = 0; q < 3; q++) box('led', j % 4 === 1 && q === 0 ? '#FF6A2B' : '#5CF29A', ru - 0.2 + q * 0.06, y0 + 0.3 + j * 0.18, rz + 0.322, 0.025, 0.025, 0.006);
        }
        blob(ru, y0 + 0.006, rz + 0.1, 0.9, 0.9);
      }
    }
    function desk(R, u, y0, z, w, dd, dual, eng, i, bench) {
      const top = y0 + 0.74;
      if (!bench) {
        box('satin', C.walnut, u, top - 0.02, z, w, 0.04, dd);
        for (const s of [-1, 1]) {
          box('gloss', C.metal, u + s * (w / 2 - 0.05), y0 + 0.36, z, 0.05, 0.72, dd - 0.08);
          box('gloss', C.metal, u + s * (w / 2 - 0.05), y0 + 0.015, z, 0.06, 0.03, dd - 0.04);
        }
      }
      if ((eng || i % 2 === 0) && !bench) box('satin', '#1E1D1C', u - (w / 2 - 0.28), y0 + 0.3, z - 0.02, 0.42, 0.58, dd - 0.14);
      // الشاشات (وجهها للموظف، يعني للكاميرا)
      const mz = z - dd / 2 + 0.16;
      const mons = dual ? [[-0.29, 0.17], [0.29, -0.17]] : [[0, 0]];
      for (const [ox, ry] of mons) {
        const G = mx(u + ox, top, mz, 0, ry, 0);
        put('gloss', TPL.box, sub(G, 0, 0.012, 0, 0, 0, 0, 0.2, 0.012, 0.15), C.metal);
        put('gloss', TPL.box, sub(G, 0, 0.13, -0.02, 0, 0, 0, 0.045, 0.24, 0.03), C.metal);
        put('gloss', TPL.box, sub(G, 0, 0.36, 0, 0, 0, 0, 0.58, 0.35, 0.03), C.monitor);
        R.monParts.push({ g: TPL.plane, m: sub(G, 0, 0.36, 0.0165, 0, 0, 0, 0.545, 0.315, 1), uvr: ox > 0 ? [0.5, 0, 0.5, 1] : [0, 0, ox < 0 ? 0.5 : 1, 1] });
      }
      // كيبورد وماوس وكوب
      box('gloss', '#2A2A2C', u, top + 0.01, z + dd / 2 - 0.2, 0.44, 0.018, 0.14);
      box('gloss', '#2A2A2C', u + 0.33, top + 0.01, z + dd / 2 - 0.2, 0.06, 0.02, 0.1);
      if (i % 3 === 1) cyl('satin', i % 2 ? '#F1551D' : '#EDEDE8', u - w / 2 + 0.2, top + 0.05, z + 0.05, 0.04, 0.1);
      if (i % 3 === 2) plant(u - w / 2 + 0.2, top, z - 0.1, 0.3, 'white', i + 2, 'leafy');
      if (!bench) blob(u, y0 + 0.006, z + 0.15, w + 0.25, dd + 0.6);
    }
    /** شخص قاعد ظهره للكاميرا (يواجه -z)؛ الأذرع تتحرّك بالإطار */
    function person(R, u, y0, z, idx, seat) {
      const G = mx(u, y0, z);
      // الكرسي
      if (seat === 'chair') {
        put('satin', TPL.box, sub(G, 0, 0.46, 0, 0, 0, 0, 0.5, 0.08, 0.48), C.chair);
        put('satin', TPL.box, sub(G, 0, 0.84, 0.25, -0.1, 0, 0, 0.47, 0.6, 0.07), C.chair);
        put('satin', TPL.box, sub(G, 0, 0.63, 0.22, 0, 0, 0, 0.08, 0.3, 0.06), C.chair);
        for (const s of [-1, 1]) put('satin', TPL.box, sub(G, s * 0.27, 0.64, 0.04, 0, 0, 0, 0.05, 0.035, 0.3), C.chair);
        put('gloss', TPL.cylLo, sub(G, 0, 0.26, 0.02, 0, 0, 0, 0.028, 0.34, 0.028), C.metal);
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * PI * 2 + 0.3;
          put('gloss', TPL.box, sub(G, Math.sin(a) * 0.15, 0.07, 0.02 + Math.cos(a) * 0.15, 0, a, 0, 0.04, 0.035, 0.3), C.metal);
          put('gloss', TPL.box, sub(G, Math.sin(a) * 0.3, 0.03, 0.02 + Math.cos(a) * 0.3, 0, a, 0, 0.035, 0.05, 0.06), C.metal);
        }
      }
      // الجسم
      put('matte', TPL.box, sub(G, 0, 0.55, -0.02, 0, 0, 0, 0.34, 0.14, 0.3), C.pants);
      for (const s of [-1, 1]) {
        put('matte', capsule(0.074, 0.3), sub(G, s * 0.1, 0.56, -0.2, PI / 2, 0, 0), C.pants);
        put('matte', capsule(0.058, 0.34), sub(G, s * 0.1, 0.29, -0.4), C.pants);
        put('matte', TPL.box, sub(G, s * 0.1, 0.04, -0.46, 0, 0, 0, 0.1, 0.07, 0.24), C.shoe);
      }
      put('matte', capsule(0.165, 0.3), sub(G, 0, 0.87, 0.02, -0.1, 0, 0, 1.18, 1, 0.82), C.hood);
      put('matte', TPL.sphLo, sub(G, 0, 1.11, 0.075, 0, 0, 0, 0.14, 0.085, 0.11), C.hood);
      put('matte', TPL.sphLo, sub(G, 0, 1.15, -0.01, 0, 0, 0, 0.055, 0.06, 0.055), C.skin);
      put('matte', TPL.sph, sub(G, 0, 1.255, -0.025, 0, 0, 0, 0.102, 0.115, 0.108), C.hair);
      for (const s of [-1, 1]) put('matte', TPL.sphLo, sub(G, s * 0.098, 1.245, -0.035, 0, 0, 0, 0.022, 0.035, 0.03), C.skin);
      blob(u, y0 + 0.007, z + 0.05, 0.85, 0.85);
      const p = { room: R, x: u * M, y: y0, z, idx, phase: (b.people.length * 1.37) % 6.28, wave: false, mode: 'rest' };
      R.people.push(b.people.length);
      b.people.push(p);
    }
    /** غرفة المدير: مكتب تنفيذي، لابتوب، كرسي جلد، جلسة، طاولة منخفضة، سجادة، خزانة، نباتات */
    function ceoRoom(R) {
      const { u0, u1, y0, rw } = R;
      const du = u0 + (rw > 11 ? rw * 0.28 : Math.min(rw * 0.4, 3.6)), dz = zb + (d.single ? D * 0.47 : Math.min(2.2, D * 0.4));
      const top = y0 + 0.76;
      // المكتب التنفيذي (جوانب خشب نازلة)
      box('satin', C.walnut, du, top - 0.03, dz, 2.2, 0.06, 0.95);
      for (const s of [-1, 1]) box('satin', C.walnut, du + s * 1.07, y0 + 0.365, dz, 0.06, 0.73, 0.95);
      box('satin', C.walnutDk, du, y0 + 0.45, dz - 0.4, 2.08, 0.5, 0.03);
      // لابتوب + مصباح + أوراق + كوب
      const G = mx(du + 0.15, top, dz + 0.12);
      put('gloss', TPL.box, sub(G, 0, 0.008, 0, 0, 0, 0, 0.36, 0.016, 0.25), '#A9AAAD');
      put('gloss', TPL.box, sub(G, 0, 0.12, -0.13, -0.22, 0, 0, 0.36, 0.24, 0.012), '#A9AAAD');
      R.monParts.push({ g: TPL.plane, m: sub(G, 0, 0.12, -0.122, -0.22, 0, 0, 0.33, 0.21, 1), uvr: [0, 0, 1, 1] });
      cyl('gloss', C.metal, du - 0.85, top + 0.01, dz - 0.15, 0.08, 0.02);
      cyl('gloss', C.metal, du - 0.85, top + 0.24, dz - 0.15, 0.012, 0.46);
      put('gloss', TPL.pot, mx(du - 0.78, top + 0.48, dz - 0.15, PI, 0, 0, 0.11, 0.12, 0.11), C.metal);
      box('led', C.spot, du - 0.78, top + 0.43, dz - 0.15, 0.08, 0.01, 0.08);
      box('matte', '#F4F2EE', du - 0.4, top + 0.008, dz + 0.1, 0.32, 0.012, 0.24, 0, 0.2, 0);
      cyl('satin', '#EDEDE8', du + 0.65, top + 0.05, dz + 0.05, 0.04, 0.1);
      plant(du + 0.9, top, dz - 0.25, 0.3, 'white', 5, 'leafy');
      blob(du, y0 + 0.006, dz, 2.6, 1.5);
      // الكرسي الجلد العالي + المدير
      const cz = dz + 0.95;
      const Gc = mx(du + 0.05, y0, cz);
      put('satin', TPL.box, sub(Gc, 0, 0.47, 0, 0, 0, 0, 0.56, 0.12, 0.52), '#121214');
      put('satin', TPL.box, sub(Gc, 0, 0.86, 0.27, -0.12, 0, 0, 0.56, 0.62, 0.12), '#121214');
      for (const s of [-1, 1]) put('satin', TPL.box, sub(Gc, s * 0.31, 0.66, 0.04, 0, 0, 0, 0.07, 0.06, 0.4), '#121214');
      put('gloss', TPL.cylLo, sub(Gc, 0, 0.24, 0.02, 0, 0, 0, 0.03, 0.34, 0.03), C.metal);
      for (let k = 0; k < 5; k++) { const a = (k / 5) * PI * 2 + 0.3; put('gloss', TPL.box, sub(Gc, Math.sin(a) * 0.17, 0.06, 0.02 + Math.cos(a) * 0.17, 0, a, 0, 0.045, 0.035, 0.34), C.metal); }
      person(R, du + 0.05, y0, cz, 0, 'none');
      // خزانة تحت الشاشة الكبيرة بزينة
      // تحت الشاشة الكبيرة بالضبط (نفس حدود wallPanels: بدون جهة الزجاج وغرفة الاجتماعات)
      const cA = u0 + (R.solid ? 0.38 : 0.3);
      let cB = u1 - (R.glassSide ? 0.38 + 0.4 * D : 0.3);
      if (rw > 11) cB = Math.min(cB, u0 + rw * 0.6 - 0.3);
      const crU = (cA + Math.max(cB, cA + 1.4)) / 2;
      const crW = clamp((cB - cA) * 0.62, 1.4, 3.6);
      box('satin', C.walnutDk, crU, y0 + 0.28, zb + 0.3, crW, 0.56, 0.5);
      cyl('satin', '#E9E5DD', crU - crW * 0.3, y0 + 0.7, zb + 0.3, 0.09, 0.28);
      cyl('satin', '#C9B8A0', crU - crW * 0.18, y0 + 0.66, zb + 0.32, 0.07, 0.2);
      box('satin', '#E8E4DC', crU + crW * 0.25, y0 + 0.6, zb + 0.3, 0.4, 0.06, 0.26);
      // جلسة: سجادة، كنبتين جلد، طاولة رخام منخفضة
      const lu = rw > 11 ? u0 + rw * 0.46 : Math.min(u1 - 1.6, du + Math.max(2.9, rw * 0.38)), lz = zf - Math.min(2.0, D * 0.33);
      if (lu > du + 2.2) {
        put('matte', TPL.disc, mx(lu, y0 + 0.008, lz, -PI / 2, 0, 0, 1.45, 1.1, 1), C.rug);
        cyl('gloss', C.marble, lu, y0 + 0.36, lz, 0.5, 0.045);
        cyl('satin', C.walnutDk, lu, y0 + 0.17, lz, 0.18, 0.34);
        box('matte', '#E9E5DD', lu + 0.1, y0 + 0.4, lz, 0.28, 0.04, 0.2, 0, 0.3, 0);
        plant(lu - 0.18, y0 + 0.38, lz - 0.08, 0.22, 'dark', 9, 'leafy');
        const arm = (u, z, ry) => {
          const Ga = mx(u, y0, z, 0, ry, 0);
          put('satin', TPL.box, sub(Ga, 0, 0.3, 0, 0, 0, 0, 0.82, 0.24, 0.78), '#141416');
          put('satin', TPL.box, sub(Ga, 0, 0.62, 0.32, -0.16, 0, 0, 0.82, 0.55, 0.16), '#141416');
          for (const s of [-1, 1]) put('satin', TPL.box, sub(Ga, s * 0.39, 0.46, 0, 0, 0, 0, 0.14, 0.34, 0.78), '#141416');
          for (const s of [-1, 1]) for (const t of [-1, 1]) put('gloss', TPL.cylLo, sub(Ga, s * 0.32, 0.08, t * 0.3, 0, 0, 0, 0.02, 0.16, 0.02), C.metal);
          blob(u, y0 + 0.009, z, 1.1, 1.1);
        };
        arm(lu - 1.05, lz + 0.15, -1.2);
        arm(lu + 1.05, lz + 0.15, 1.2);
      }
      if (rw > 11) {
        // غرفة اجتماعات ورا فاصل: طاولة طويلة و٦ كراسي
        const pu = u0 + rw * 0.6;
        box('matte', C.part, pu, (y0 + R.y1) / 2, (zb + zf) / 2 - 0.03, 0.12, R.y1 - y0, D - 0.06);
        box('shell', '#FFFFFF', pu, (y0 + R.y1) / 2, zf - 0.03, 0.14, R.y1 - y0, 0.08);
        put('matte', TPL.plane, mx(pu - 0.065, (y0 + R.y1) / 2, (zb + zf) / 2, 0, -PI / 2, 0, D, R.y1 - y0, 1), C.wallSide);
        const mu = (pu + u1 - 0.4 * D) / 2 + 0.3, mz = zb + D * 0.5;
        box('satin', C.walnut, mu, y0 + 0.74, mz, 2.6, 0.05, 1.05);
        cyl('gloss', C.metal, mu - 0.9, y0 + 0.37, mz, 0.05, 0.72);
        cyl('gloss', C.metal, mu + 0.9, y0 + 0.37, mz, 0.05, 0.72);
        for (const s2 of [-1, 1]) for (let q = 0; q < 3; q++) {
          const cu2 = mu - 0.85 + q * 0.85, cz2 = mz + s2 * 0.82;
          put('satin', TPL.box, mx(cu2, y0 + 0.46, cz2, 0, 0, 0, 0.46, 0.07, 0.44), C.chair);
          put('satin', TPL.box, mx(cu2, y0 + 0.78, cz2 + s2 * 0.21, 0, 0, 0, 0.44, 0.56, 0.06), C.chair);
          cyl('gloss', C.metal, cu2, y0 + 0.22, cz2, 0.025, 0.44, 0, 0, 0, true);
        }
        blob(mu, y0 + 0.006, mz, 3.4, 2.6);
      }
      plant(u1 - 0.5, y0, zb + 0.55, 1.7, 'dark', 2, 'leafy');
      plant(u0 + 0.5, y0, zf - 0.65, 1.25, 'white', 4, 'snake');
      if (rw > 9) plant((du + lu) / 2 + 0.4, y0, zb + 0.5, 1.4, 'white', 6, 'leafy');
    }

    // ---------------- نباتات ----------------
    function plant(u, y, z, hgt, pot, seed, kind) {
      let s = seed * 9301 + 49297;
      const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
      const pr = clamp(0.1 + hgt * 0.1, 0.08, 0.34), ph = clamp(0.16 + hgt * 0.16, 0.12, 0.55);
      if (kind === 'tall') {
        put('shell', TPL.cyl, mx(u, y + ph / 2 + 0.05, z, 0, 0, 0, pr * 1.3, ph + 0.1, pr * 1.3), '#F4F4F1');
      } else put('matte', TPL.pot, mx(u, y + ph / 2, z, 0, 0, 0, pr, ph, pr), pot === 'white' ? C.potW : C.potD);
      put('matte', TPL.disc, mx(u, y + ph + (kind === 'tall' ? 0.09 : -0.01), z, -PI / 2, 0, 0, pr * 0.92, pr * 0.92, 1), C.soil);
      const base = y + ph + (kind === 'tall' ? 0.08 : 0);
      const leafCls = 'matte';
      if (kind === 'snake') {
        const k = 9;
        for (let i = 0; i < k; i++) {
          const a = (i / k) * PI * 2 + rnd();
          const lh = hgt * (0.55 + rnd() * 0.45);
          put(leafCls, TPL.leaf, mx(u + Math.sin(a) * pr * 0.4, base + lh * 0.5, z + Math.cos(a) * pr * 0.4, (rnd() - 0.5) * 0.3, a, (rnd() - 0.5) * 0.35, 0.05, lh * 0.5, 0.016, 'YXZ'), C.leaves[i % 2 ? 0 : 3]);
        }
      } else {
        const k = Math.round(10 + hgt * 7);
        put(leafCls, TPL.cylLo, mx(u, base + hgt * 0.32, z, 0, 0, 0, 0.012, hgt * 0.64, 0.012), '#3C4A2F');
        for (let i = 0; i < k; i++) {
          const a = i * 2.39996 + rnd() * 0.5;
          const lift = 0.25 + 0.75 * (i / k);
          const r = (0.05 + rnd() * 0.22) * Math.min(1.4, hgt + 0.3) * (1.1 - lift * 0.5);
          const ly = base + hgt * (0.18 + lift * 0.78);
          const ls = (0.1 + hgt * 0.07) * (0.75 + rnd() * 0.45);
          const tilt = 0.5 + (1 - lift) * 0.8 + rnd() * 0.3;
          put(leafCls, TPL.leaf, mx(u + Math.sin(a) * r, ly, z + Math.cos(a) * r, tilt, a, 0, ls * 0.62, ls * 1.25, ls * 0.12, 'YXZ'), C.leaves[(i + seed) % C.leaves.length]);
        }
      }
      blob(u, y + 0.006, z, pr * 4, pr * 4);
    }
  }

  // ---------- نقاط الإطار والكاميرا ----------
  function fitPoints(d, outer, e) {
    const pts = [];
    const P = (u, y, z) => pts.push(new T3.Vector3(u * M, y, z));
    const { W, T, GT, TB, D, LIP, ROOF, CUBE, PL, yTop } = d;
    for (const u of [e.px0, e.px1]) for (const z of [e.pz0, e.pz1]) { P(u, -PL, z); P(u, 0, z); }
    const rx0 = -W / 2 - T - 0.14, rx1 = W / 2 + GT + 0.14, rz0 = -D / 2 - TB - 0.14, rz1 = D / 2 + LIP + 0.16;
    for (const u of [rx0, rx1]) for (const z of [rz0, rz1]) { P(u, yTop, z); P(u, yTop + ROOF, z); }
    for (const u of [e.cu - CUBE / 2, e.cu + CUBE / 2]) for (const z of [e.cz - CUBE / 2, e.cz + CUBE / 2]) P(u, e.cy0 + CUBE, z);
    for (const [u, y, z] of outer) P(u, y, z);
    return pts;
  }
  function camParams(d) {
    // زاوية من جهة الزجاج، والعين على ارتفاع يخلي الأدوار العليا تبيّن سقفها والسفلية أرضيتها
    const az = d.single ? 0.42 : d.hq ? 0.36 : 0.38;
    const el = d.single ? 0.1 : d.hq ? 0.035 : 0.05;
    const midY = (d.S + d.yTop) / 2;
    const eye = d.single ? d.S + d.FH * 0.62 : d.hq ? midY + d.FH * 0.4 : midY + d.FH * 0.25;
    return { az, el, eye, fov: d.single ? 32 : 28 };
  }
  const _p = new T3.Vector3();
  function fit() {
    if (!B) return;
    const cp = B.cam, c = B.center;
    camera.fov = cp.fov;
    camera.aspect = Wpx / Hpx;
    const th = cp.az * M, ph = cp.el;
    const dx = Math.sin(th) * Math.cos(ph), dy = Math.sin(ph), dz = Math.cos(th) * Math.cos(ph);
    let dist = (B.d.W + B.d.yTop + 10) * 1.6;
    let sx = 0, sy = 0, hw = 0.88;
    for (let i = 0; i < 40; i++) {
      // العين ثابتة الارتفاع (ميل خفيف)، ونقرّب/نبعّد لين المبنى يعبّي الإطار (هامش ٦٪ بالعرض و٣.٥٪ بالطول)
      camera.position.set(c.x + dx * dist, cp.eye + dy * dist * 0.35, c.z + dz * dist);
      camera.lookAt(c.x, cp.eye + dy * dist * 0.35 - dy * dist, c.z);
      camera.near = Math.max(0.1, dist * 0.2);
      camera.far = dist * 4;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of B.pts) {
        _p.copy(p).project(camera);
        if (_p.x < x0) x0 = _p.x; if (_p.x > x1) x1 = _p.x; if (_p.y < y0) y0 = _p.y; if (_p.y > y1) y1 = _p.y;
      }
      sx = (x0 + x1) / 2; sy = (y0 + y1) / 2; hw = (x1 - x0) / 2;
      const k = Math.max((x1 - x0) / 2 / 0.88, (y1 - y0) / 2 / 0.93);
      if (Math.abs(k - 1) < 2e-4) break;
      dist *= 1 + (k - 1) * 0.92;
    }
    // إزاحة العدسة بدل لف الكاميرا: الخطوط الرأسية تبقى رأسية والمبنى بالنص
    // align > 0: لو فيه عرض زايد نقرّب المبنى من عمود النص (الجدار المصمت: يسار بالإنجليزي، يمين بالعربي) عشان الخطوط تقصر
    const e = camera.projectionMatrix.elements;
    e[8] += sx + M * align * Math.max(0, 0.975 - hw);
    e[9] += sy;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    B.dist = dist;
    // بكسل لكل متر عند نص المبنى (لدقة القوام ومستوى التفاصيل)
    const a = toScreen(c.x, B.d.yTop / 2, c.z), b2 = toScreen(c.x, B.d.yTop / 2 + 1, c.z);
    B.ppm = Math.abs(a.y - b2.y);
    rectsDirty = true;
  }
  const toScreen = (x, y, z) => { _p.set(x, y, z).project(camera); return { x: ((_p.x + 1) / 2) * Wpx, y: ((1 - _p.y) / 2) * Hpx }; };

  // ---------- الأطالس (لوحات كل غرفة بقوام واحد) ----------
  const ATLAS_PAD = 0.05;
  function buildAtlases() {
    for (const R of B.rooms) {
      if (!R.panels.length) continue;
      // رصّ رفوف بالمتر (مستقل عن الدقة → UV ثابتة)
      const items = R.panels.map((p) => ({ p, w: p.w, h: p.h }));
      const maxRow = Math.max(4.5, ...items.map((i) => i.w + 2 * ATLAS_PAD));
      const sorted = [...items].sort((a, b) => b.h - a.h);
      let x = 0, y = 0, rowH = 0, W = 0;
      for (const it of sorted) {
        const iw = it.w + 2 * ATLAS_PAD, ih = it.h + 2 * ATLAS_PAD;
        if (x + iw > maxRow + 1e-6) { y += rowH; x = 0; rowH = 0; }
        it.x = x + ATLAS_PAD; it.y = y + ATLAS_PAD;
        x += iw; rowH = Math.max(rowH, ih); W = Math.max(W, x);
      }
      const H = y + rowH;
      const A = { items, W, H, canvas: null, tex: null, dens: 0 };
      A.mat = new T3.MeshBasicMaterial({ toneMapped: false });
      B.mats.push(A.mat);
      const parts = items.map((it) => {
        const p = it.p;
        const uvr = [it.x / W, 1 - (it.y + it.h) / H, it.w / W, it.h / H];
        const m = p.wall === 'side' ? mx(p.u, p.y, p.z, 0, PI / 2, 0, p.w, p.h, 1) : mx(p.u, p.y, p.z, 0, 0, 0, p.w, p.h, 1);
        return { g: TPL.plane, m, uvr };
      });
      const g = merge(parts, false, true);
      B.geos.push(g);
      const mesh = new T3.Mesh(g, A.mat);
      B.group.add(mesh);
      R.atlas = A;
      B.atlases.push(A);
    }
  }
  function wantDens() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const raw = clamp((B.ppm || 40) * dpr * 2, 70, 560);
    return Math.pow(2, Math.round(Math.log2(raw) * 2) / 2);
  }
  function lodFor(hm) {
    // ارتفاع اللوحة ببكسل الجهاز: كل ما صغرت نكبّر الخط ونقلّل العناصر
    const px = hm * (B.ppm || 40) * Math.min(2, window.devicePixelRatio || 1);
    return px >= 190 ? 'full' : px >= 76 ? 'mid' : 'tiny';
  }
  function drawAtlas(R, A, dens) {
    let dd = dens;
    if (A.W * dd > 4096) dd = 4096 / A.W;
    if (A.H * dd > 4096) dd = Math.min(dd, 4096 / A.H);
    const cw = Math.round(A.W * dd), ch = Math.round(A.H * dd);
    if (!A.canvas || A.canvas.width !== cw || A.canvas.height !== ch) {
      if (A.tex) { A.tex.dispose(); B.texs = B.texs.filter((t) => t !== A.tex); }
      A.canvas = mkCanvas(cw, ch);
      A.tex = tex(A.canvas);
      B.texs.push(A.tex);
      A.mat.map = A.tex;
      A.mat.needsUpdate = true;
    }
    A.dens = dens;
    const c = A.canvas.getContext('2d');
    c.clearRect(0, 0, cw, ch);
    const sx = cw / A.W, sy = ch / A.H;
    const P = B.plan;
    const rtl = P.lang === 'ar';
    for (const it of A.items) {
      const p = it.p;
      const x = Math.round((it.x - ATLAS_PAD) * sx), y = Math.round((it.y - ATLAS_PAD) * sy);
      const w = Math.round(it.w * sx), h = Math.round(it.h * sy), pd = Math.round(ATLAS_PAD * sx);
      // حافة ممدودة بلون اللوحة (عشان الـ mipmaps ما تسرّب ألوان الجيران)
      c.fillStyle = p.kind === 'vision' ? '#F3EFE8' : '#0D100F';
      c.fillRect(x, y, w + 2 * pd, h + 2 * pd);
      c.save();
      c.translate(x + pd, y + pd);
      c.beginPath(); c.rect(0, 0, w, h); c.clip();
      const L = { lang: P.lang, rtl, lod: lodFor(p.h), u: Math.min(h / 100, w / 150) };
      L.pad = 6 * L.u;
      try {
        if (p.kind === 'screen') drawScreen(c, w, h, p.s, L);
        else if (p.kind === 'composite') { L.u = h / 100; L.pad = 5 * L.u; drawComposite(c, w, h, p.list, L); }
        else if (p.kind === 'label') drawLabel(c, w, h, p.text || '', L, p.extra);
        else if (p.kind === 'strip') drawStrip(c, w, h, R.label || '', L);
        else if (p.kind === 'vision') drawVision(c, w, h, p.text || (P.lang === 'ar' ? 'نخلّي الرياضة أسهل وأقرب لكل الناس.' : 'Make fitness easier for everyone.'), L);
      } catch (e) { /* لوحة وحدة ما توقف الباقي */ }
      c.restore();
    }
    A.tex.needsUpdate = true;
  }
  function drawSign() {
    const s = B.sign, P = B.plan;
    const dens = clamp(wantDens(), 80, 360);
    let cw = Math.round(s.w * dens), ch = Math.round(s.h * dens);
    if (cw > 4096) { ch = Math.round((ch * 4096) / cw); cw = 4096; }
    if (!s.canvas || s.canvas.width !== cw || s.canvas.height !== ch) {
      if (s.tex) { s.tex.dispose(); B.texs = B.texs.filter((t) => t !== s.tex); }
      s.canvas = mkCanvas(cw, ch);
      s.tex = tex(s.canvas);
      B.texs.push(s.tex);
      s.mat.map = s.tex;
      s.mat.needsUpdate = true;
    }
    const c = s.canvas.getContext('2d');
    c.clearRect(0, 0, cw, ch);
    const title = P.roof.title || '';
    const ar = ARX.test(title);
    const fam = ar ? FK : FD, weight = ar ? 800 : 400;
    const t = ar ? title : latin(title).toUpperCase();
    let size = ch * (ar ? 0.7 : 0.78);
    const ic = ch * 0.64, gap = ch * 0.26;
    size = fitSize(c, t, size, cw * 0.86 - ic - gap, weight, fam, ch * 0.2);
    c.font = `${weight} ${size}px ${fam}`;
    if (hasLS) c.letterSpacing = ar ? '0px' : `${(size * 0.03).toFixed(1)}px`;
    const tw = t ? c.measureText(t).width : 0;
    if (hasLS) c.letterSpacing = '0px';
    const total = Math.min(tw, cw * 0.86 - ic - gap) + (t ? gap : 0) + ic;
    const x0 = (cw - total) / 2;
    const rtl = P.lang === 'ar';
    const icX = rtl ? x0 + total - ic / 2 : x0 + ic / 2;
    icon(c, P.roof.icon, icX, ch / 2, ic, SC.orange, 1.5);
    if (t) tx(c, t, rtl ? x0 + total - ic - gap : x0 + ic + gap, ch / 2, { size, weight, fam, color: '#1A1A19', align: rtl ? 'right' : 'left', ls: ar ? 0 : size * 0.03, max: cw * 0.86 - ic - gap });
    s.tex.needsUpdate = true;
  }
  function drawCubeLogo() {
    const l = B.logo;
    if (!l.canvas) {
      l.canvas = mkCanvas(512, 512);
      l.tex = tex(l.canvas);
      B.texs.push(l.tex);
      l.mat.map = l.tex;
      l.mat.needsUpdate = true;
    }
    const c = l.canvas.getContext('2d');
    c.clearRect(0, 0, 512, 512);
    drawLogo(c, 256, 262, 470, SC.orange, '#FF7A3D');
    l.tex.needsUpdate = true;
  }
  function drawAll() {
    if (!B) return;
    const dens = wantDens();
    for (const R of B.rooms) if (R.atlas) drawAtlas(R, R.atlas, dens);
    drawSign();
    drawCubeLogo();
    B.dens = dens;
    if (fontsOk) drawnOnce = true;
  }

  // ---------- الثيم والحالات ----------
  function applyTheme() {
    const th = THEMES[theme];
    MAT.shell.color.set(th.shell);
    hemi.color.set(th.sky);
    hemi.groundColor.set(th.ground);
    hemi.intensity = th.hemi;
    sun.intensity = th.sun;
    renderer.toneMappingExposure = th.exposure;
    MAT.ground.opacity = th.shadow;
    MAT.blob.opacity = theme === 'dark' ? 0.55 : 0.42;
    if (B && B.bigBlob) B.bigBlob.material.opacity = th.blob;
    MAT.glow.opacity = th.glow;
    renderer.shadowMap.needsUpdate = true;
  }
  function applyStates() {
    if (!B) return;
    for (const R of B.rooms) {
      const s = isObj(states) && isObj(states[R.id]) ? states[R.id] : null;
      const st = s ? (s.waiting ? 'waiting' : s.working ? 'working' : 'idle') : R.planStatus;
      R.state = st;
      R.alert = !!(s && s.alert);
      if (R.monMat) R.monMat.color.set(st === 'waiting' ? C.orange : st === 'working' ? C.amber : C.idle);
      const sel = selected != null && selected === R.id;
      R.selGroup.visible = sel;
      R.alertMesh.visible = R.alert;
      R.people.forEach((pi, j) => {
        const p = B.people[pi];
        p.wave = st === 'waiting' && j === 0;
        p.mode = st === 'idle' ? 'rest' : 'type';
      });
    }
    // الضوء: المختارة أقوى وأدفى، واللي تنتظرك أقوى شوي
    for (const lp of B.lamps || []) {
      let f = 1, sel = false;
      for (const R of lp.rooms) { const s1 = selected != null && R.id === selected; if (s1) sel = true; f = Math.max(f, (s1 ? 1.65 : 1) * (R.state === 'waiting' ? 1.08 : 1)); }
      lp.l.intensity = lp.base * f;
      lp.l.color.set(sel ? '#FFA766' : '#FFC690');
    }
  }

  // ---------- حركة الناس ----------
  const _m = new T3.Matrix4(), _s = new T3.Matrix4(), _e = new T3.Matrix4(), _t = new T3.Matrix4(), _q = new T3.Quaternion(), _eu = new T3.Euler(), _one = new T3.Vector3(1, 1, 1), _pos = new T3.Vector3();
  const rotM = (out, rx, ry, rz) => out.makeRotationFromEuler(_eu.set(rx, ry, rz, 'XYZ'));
  function pose(t) {
    if (!B || !B.armU) return;
    const animate = t > 0;
    B.people.forEach((p, i) => {
      for (const side of [-1, 1]) {
        const k = i * 2 + (side > 0 ? 1 : 0);
        const ph = p.phase + side * 0.8;
        const waving = p.wave && side === M;
        let a, rz, b2, rzE;
        if (waving) {
          a = 0.2; rz = side * 2.5; b2 = 0.15;
          rzE = side * (0.35 + (animate ? 0.45 * Math.sin(t * 7 + p.phase) : 0.2));
        } else if (p.mode === 'type') {
          a = 0.6 + (animate ? 0.05 * Math.sin(t * 12 + ph) : 0);
          rz = -side * 0.14; b2 = 0.98 + (animate ? 0.1 * Math.sin(t * 13 + ph * 1.7) : 0); rzE = side * 0.12;
        } else {
          a = 0.5 + (animate ? 0.03 * Math.sin(t * 1.3 + ph) : 0); rz = -side * 0.12; b2 = 1.05; rzE = side * 0.18;
        }
        // الكتف ← الذراع العليا ← الكوع ← الساعد ← الكف
        _s.makeTranslation(p.x + side * 0.205, p.y + 1.03, p.z + 0.02).multiply(rotM(_t, a, 0, rz));
        _m.copy(_s).multiply(_t.makeTranslation(0, -0.155, 0));
        B.armU.setMatrixAt(k, _m);
        _e.copy(_s).multiply(_t.makeTranslation(0, -0.3, 0)).multiply(rotM(_t, b2, 0, rzE));
        _m.copy(_e).multiply(_t.makeTranslation(0, -0.14, 0));
        B.armF.setMatrixAt(k, _m);
        _m.copy(_e).multiply(_t.makeTranslation(0, -0.285, 0));
        B.armH.setMatrixAt(k, _m);
      }
    });
    B.armU.instanceMatrix.needsUpdate = true;
    B.armF.instanceMatrix.needsUpdate = true;
    B.armH.instanceMatrix.needsUpdate = true;
  }

  // ---------- التنظيف ----------
  function clearBuild() {
    if (!B) return;
    scene.remove(B.group);
    B.group.traverse((o) => { if (o.isLight && o.dispose) o.dispose(); });
    for (const g of B.geos) g.dispose();
    for (const m of B.mats) m.dispose();
    for (const t of B.texs) t.dispose();
    for (const im of B.inst) im.dispose();
    B = null;
    rectsDirty = true;
  }

  // ---------- المستطيلات للصفحة ----------
  function computeRects() {
    cacheFloors = []; cacheRooms = [];
    if (!B) return;
    const d = B.d;
    const ux0 = -d.W / 2 - d.T, ux1 = d.W / 2 + d.GT, zF = d.D / 2 + d.LIP, zB = -d.D / 2 - d.TB;
    const bbox = (pts) => {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const [u, y, z] of pts) { const s = toScreen(u * M, y, z); x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y); }
      return { left: Math.round(x0), top: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
    };
    for (const f of B.floors) {
      const rect = bbox([[-d.W / 2, f.y0, zF], [d.W / 2, f.y0, zF], [-d.W / 2, f.y1, zF], [d.W / 2, f.y1, zF]]);
      const corners = [[ux0, zF], [ux0, zB], [ux1, zF], [ux1, zB]].map(([u, z]) => {
        const t = toScreen(u * M, f.y1, z), bo = toScreen(u * M, f.y0, z);
        return [t.x, t.y, bo.x, bo.y];
      });
      const mid = (e) => (e[0] + e[2]) / 2;
      const l = corners.reduce((a, b) => (mid(b) < mid(a) ? b : a));
      const r = corners.reduce((a, b) => (mid(b) > mid(a) ? b : a));
      const rnd = (e) => e.map((v) => Math.round(v * 10) / 10);
      cacheFloors.push({ id: f.id, rect, edge: { l: rnd(l), r: rnd(r) } });
    }
    const cp = camera.position;
    cacheRooms = B.rooms.map((R) => {
      const r = bbox([[R.u0, R.y0, zF], [R.u1, R.y0, zF], [R.u0, R.y1, zF], [R.u1, R.y1, zF]]);
      const dist = Math.hypot(R.uc * M - cp.x, (R.y0 + R.y1) / 2 - cp.y, zF - cp.z);
      return { id: R.id, left: r.left, top: r.top, w: r.w, h: r.h, _d: dist };
    }).sort((a, b) => b._d - a._d).map(({ _d, ...r }) => r);
    rectsDirty = false;
  }

  // ---------- الخطوط ----------
  /** المشهد أعاد رسم القوام (الخطوط وصلت): الصفحة ترسم إطار (مهم مع تقليل الحركة: ما فيه حلقة رسم) */
  const notify = () => { try { if (typeof O0.onRedraw === 'function') O0.onRedraw(); } catch (e) { /* الصفحة */ } };
  let fontTimer = 0;
  // خط وصل متأخر (بعد المهلة، أو جوال بطيء): نعيد الرسم مرة بعد ما تهدأ التحميلات
  const onFonts = () => {
    clearTimeout(fontTimer);
    fontTimer = setTimeout(() => { if (disposed) return; fontsOk = true; if (B) { drawAll(); notify(); } }, 160);
  };
  try { if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', onFonts); } catch (e) { /* متصفح قديم */ }
  if (!fontsOk) {
    const jobs = [];
    const tryLoad = (f, s) => { try { jobs.push(document.fonts.load(f, s).catch(() => null)); } catch (e) { /* */ } };
    for (const w of [500, 600, 700]) tryLoad(`${w} 20px "IBM Plex Mono"`, 'AZaz09%');
    tryLoad('400 20px "Anton"', 'AZ');
    for (const w of [500, 700, 800]) tryLoad(`${w} 20px "Noto Kufi Arabic"`, 'أرك ابتث');
    Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 4500))]).then(() => {
      fontsOk = true;
      if (!disposed && B) { drawAll(); drawnOnce = true; notify(); }
    });
  }

  // ---------- الواجهة ----------
  function show(plan) {
    if (disposed) return;
    const P = cleanPlan(plan);
    const sig = sigOf(P);
    if (B && P.key && B.key === P.key && B.sig === sig) {
      // نفس الغرف: نحدّث النصوص بس ونخلي الأشكال
      B.plan = P;
      const byId = new Map();
      for (const f of P.floors) for (const r of f.rooms) byId.set(r.id, Object.assign({ floorLabel: f.label }, r));
      for (const R of B.rooms) {
        const r = byId.get(R.id);
        if (!r) continue;
        R.label = r.label; R.nPeople = r.people; R.floorLabel = r.floorLabel; R.screens = r.screens; R.vision = r.vision; R.planStatus = r.status;
        for (const p of R.panels) {
          if (p.kind === 'screen') { const i = R.panels.filter((q) => q.kind === 'screen').indexOf(p); p.s = r.screens[i] || p.s; }
          else if (p.kind === 'composite') p.list = r.screens.length ? r.screens : p.list;
          else if (p.kind === 'label') { p.text = r.floorLabel || r.label; if (r.type === 'eng') p.extra = ((r.screens.find((s) => s.type === 'flow') || {}).steps || []); }
          else if (p.kind === 'vision') p.text = r.vision;
        }
      }
      applyStates();
      drawAll();
      return;
    }
    build(P);
  }
  function resize(w, h) {
    if (disposed) return;
    Wpx = Math.max(1, Math.round(fin(w) ? w : canvas.clientWidth || 1));
    Hpx = Math.max(1, Math.round(fin(h) ? h : canvas.clientHeight || 1));
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(Wpx, Hpx, false);
    if (B) {
      const nw = dimsFor(B.plan).W;
      if (Math.abs(nw - B.d.W) > 0.06 * B.d.W) { build(B.plan); return; }
      fit();
      // دقة القوام تتبع حجم المسرح (نعيد الرسم لو تغيّرت كثير)
      const want = wantDens();
      if (!B.dens || want / B.dens > 1.4 || want / B.dens < 0.7) drawAll();
    }
  }
  renderer.setSize(Wpx, Hpx, false);
  applyTheme();

  return {
    show,
    update(st, sel) { states = isObj(st) ? st : {}; selected = sel == null ? null : String(sel); applyStates(); },
    setTheme(t) { theme = t === 'dark' ? 'dark' : 'light'; applyTheme(); },
    setDir(dd) {
      const nd = dd === 'rtl' ? 'rtl' : 'ltr';
      if (nd === dir) return;
      dir = nd; M = dir === 'rtl' ? -1 : 1;
      if (B) { const P = B.plan; B.key = ''; build(P); }
    },
    resize,
    /** يعيد رسم الشاشات واللافتات (مثلاً بعد ما توصل الخطوط) */
    redraw() { if (!disposed && B) drawAll(); },
    /** مكان المبنى بالعرض الزايد: 0 = بالنص (الجوال)، 1 = جهة عمود النص (الشاشات العريضة) */
    setAlign(a) {
      const na = fin(a) ? clamp(a, 0, 1) : 0;
      if (na === align) return;
      align = na;
      if (B) fit();
    },
    frame(t) {
      if (disposed) return;
      const tt = fin(t) ? t : 0;
      if (B) {
        pose(tt);
        MAT.alert.opacity = tt > 0 ? 0.55 + 0.45 * Math.sin(tt * 6) : 1;
      }
      renderer.render(scene, camera);
    },
    floors() { if (rectsDirty) computeRects(); return cacheFloors.map((f) => ({ id: f.id, rect: Object.assign({}, f.rect), edge: { l: f.edge.l.slice(), r: f.edge.r.slice() } })); },
    rooms() { if (rectsDirty) computeRects(); return cacheRooms.map((r) => Object.assign({}, r)); },
    ready() { return fontsOk && drawnOnce; },
    /** لوحات القوام (للفحص) */
    canvases() { return B ? B.atlases.map((A) => A.canvas).filter(Boolean) : []; },
    /** أرقام للفحص (رسمات، مثلثات، ذاكرة) */
    stats() {
      const i = renderer.info;
      return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: (i.programs || []).length, lights: LPOOL + 2 };
    },
    dispose() {
      if (disposed) return;
      clearBuild();
      for (const k of Object.keys(MAT)) MAT[k].dispose();
      for (const t of [codeTex, tileTex, blobTex, glowTex, washTex]) t.dispose();
      for (const g of Object.values(SH)) g.dispose();
      for (const g of Object.values(TPL)) g.dispose();
      for (const g of capCache.values()) g.dispose();
      clearTimeout(fontTimer);
      try { document.fonts.removeEventListener('loadingdone', onFonts); } catch (e) { /* */ }
      sun.dispose(); hemi.dispose(); // خريطة الظل
      for (const l of lamps) l.dispose();
      renderer.dispose();
      disposed = true;
    },
  };
}
