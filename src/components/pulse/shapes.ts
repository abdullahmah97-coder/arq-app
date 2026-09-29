// هندسة أشكال الحلقات (بدون واجهة، عشان تتختبر): مضلع منتظم بزوايا مدوّرة، وقوس العدّاد، وقطع الحلقة المقطّعة.
// كل مسار يبدأ من فوق بالنص ويمشي مع عقارب الساعة، وطوله محسوب بالضبط عشان التعبئة (strokeDasharray) تكون دقيقة.

export interface ShapePath { d: string; length: number }

const f = (n: number) => Number(n.toFixed(2));

/**
 * مضلع منتظم (رأسه لفوق) بزوايا مدوّرة.
 * n = عدد الأضلاع (٤ معيّن، ٦ سداسي)، R = نصف القطر للرؤوس، r = نصف قطر التدوير.
 */
export function roundedPolygon(cx: number, cy: number, R: number, n: number, r: number): ShapePath {
  const turn = (2 * Math.PI) / n;            // زاوية الانعطاف عند كل رأس
  const interior = Math.PI - turn;
  const side = 2 * R * Math.sin(Math.PI / n);
  // التدوير ما يتعدى نص الضلع
  const maxR = (side / 2) * Math.tan(interior / 2);
  const rr = Math.max(0, Math.min(r, maxR * 0.95));
  const d = rr / Math.tan(interior / 2);      // بُعد نقطة التماس عن الرأس
  const V = Array.from({ length: n }, (_, k) => {
    const a = -Math.PI / 2 + k * turn;
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  });
  const toward = (p: { x: number; y: number }, q: { x: number; y: number }, dist: number) => {
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    return { x: p.x + ((q.x - p.x) / len) * dist, y: p.y + ((q.y - p.y) / len) * dist };
  };
  const pin = (k: number) => toward(V[k], V[(k - 1 + n) % n], d);
  const pout = (k: number) => toward(V[k], V[(k + 1) % n], d);
  // منتصف قوس الرأس العلوي: البداية والنهاية
  const mid = toward(V[0], { x: cx, y: cy }, rr / Math.sin(interior / 2) - rr);
  const arc = (p: { x: number; y: number }) => `A ${f(rr)} ${f(rr)} 0 0 1 ${f(p.x)} ${f(p.y)}`;
  let path = `M ${f(mid.x)} ${f(mid.y)} ${arc(pout(0))}`;
  for (let k = 1; k < n; k++) path += ` L ${f(pin(k).x)} ${f(pin(k).y)} ${arc(pout(k))}`;
  path += ` L ${f(pin(0).x)} ${f(pin(0).y)} ${arc(mid)} Z`;
  return { d: path, length: n * (side - 2 * d) + n * rr * turn };
}

/** قوس عدّاد ٢٧٠° مفتوح من تحت: يبدأ من تحت يسار ويلف مع عقارب الساعة لتحت يمين */
export function gaugeArc(cx: number, cy: number, R: number, sweepDeg = 270): ShapePath {
  const sweep = (sweepDeg * Math.PI) / 180;
  const start = Math.PI / 2 + (2 * Math.PI - sweep) / 2; // ١٣٥° للعدّاد ٢٧٠°
  const end = start + sweep;
  const p0 = { x: cx + R * Math.cos(start), y: cy + R * Math.sin(start) };
  const p1 = { x: cx + R * Math.cos(end), y: cy + R * Math.sin(end) };
  const large = sweep > Math.PI ? 1 : 0;
  return { d: `M ${f(p0.x)} ${f(p0.y)} A ${f(R)} ${f(R)} 0 ${large} 1 ${f(p1.x)} ${f(p1.y)}`, length: R * sweep };
}

/**
 * قطع الحلقة المقطّعة (تشبه نقش السدو): كل قطعة قوس صغير.
 * count = عدد القطع، fill = نسبة القطعة من مكانها (الباقي فراغ). يبدأ من فوق مع عقارب الساعة.
 */
export function ringSegments(cx: number, cy: number, R: number, count: number, fill = 0.58): string[] {
  const step = (2 * Math.PI) / count;
  const half = (step * fill) / 2;
  return Array.from({ length: count }, (_, i) => {
    const c = -Math.PI / 2 + (i + 0.5) * step;
    const a0 = c - half;
    const a1 = c + half;
    return `M ${f(cx + R * Math.cos(a0))} ${f(cy + R * Math.sin(a0))} A ${f(R)} ${f(R)} 0 0 1 ${f(cx + R * Math.cos(a1))} ${f(cy + R * Math.sin(a1))}`;
  });
}

/** عدد القطع المناسب لحلقة بنصف قطر R: القطع تبقى بنفس الطول تقريباً في كل الحلقات */
export const segmentCount = (R: number, segLen = 20) => Math.max(12, Math.round((2 * Math.PI * R) / segLen));

/** كم قطعة تنور لقيمة من ٠ لـ ١ (أي قيمة فوق الصفر تنوّر قطعة وحدة على الأقل) */
export const litSegments = (value: number, count: number) =>
  value <= 0 ? 0 : Math.max(1, Math.min(count, Math.round(value * count)));
