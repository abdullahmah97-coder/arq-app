// أشكال حلقات الرئيسية: أطوال المسارات دقيقة (عشان التعبئة تطابق القيمة)، والبداية من فوق، وحفظ الاختيار
import assert from 'node:assert/strict';
import { gaugeArc, litSegments, ringSegments, roundedPolygon, segmentCount } from '../src/components/pulse/shapes.ts';
import { DEFAULT_RING_STYLE, isRingStyle, parseRingStyle, RING_STYLE_META, RING_STYLES } from '../src/lib/ringStyleCore.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log('ok -', name); };
const near = (a: number, b: number, eps = 0.05) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

/** يقيس طول مسار (M/L/A فقط) من الأوامر نفسها: الخطوط بالمسافة، والأقواس من الوتر ونصف القطر */
function measure(d: string) {
  const tok = d.match(/[MLAZ]|-?\d+(\.\d+)?/g)!;
  let i = 0; let x = 0; let y = 0; let x0 = 0; let y0 = 0; let len = 0;
  const num = () => Number(tok[i++]);
  while (i < tok.length) {
    const c = tok[i++];
    if (c === 'M') { x = x0 = num(); y = y0 = num(); }
    else if (c === 'L') { const nx = num(); const ny = num(); len += Math.hypot(nx - x, ny - y); x = nx; y = ny; }
    else if (c === 'A') {
      const r = num(); num(); num(); const large = num(); num(); const nx = num(); const ny = num();
      const chord = Math.hypot(nx - x, ny - y);
      let ang = 2 * Math.asin(Math.min(1, chord / (2 * r)));
      if (large) ang = 2 * Math.PI - ang;
      len += r * ang; x = nx; y = ny;
    } else if (c === 'Z') { len += Math.hypot(x0 - x, y0 - y); x = x0; y = y0; }
  }
  return { len, start: { x: x0, y: y0 } };
}

test('rounded diamond: exact length and starts at the top centre', () => {
  const p = roundedPolygon(132, 132, 120, 4, 14);
  const m = measure(p.d);
  near(m.len, p.length, 0.2);
  near(m.start.x, 132, 0.01);
  assert.ok(m.start.y < 132 - 100 && m.start.y > 132 - 120, 'top of the shape');
  // بدون تدوير = محيط المربع المائل
  near(roundedPolygon(0, 0, 100, 4, 0).length, 4 * 2 * 100 * Math.sin(Math.PI / 4), 0.001);
});

test('rounded hexagon: exact length, closes on itself', () => {
  const p = roundedPolygon(100, 100, 80, 6, 9);
  near(measure(p.d).len, p.length, 0.2);
  assert.ok(p.d.endsWith('Z'));
  near(roundedPolygon(0, 0, 50, 6, 0).length, 6 * 50, 0.001); // السداسي المنتظم ضلعه = نصف قطره
  // التدوير يقصّر المسار شوي بس
  assert.ok(p.length < 6 * 80 && p.length > 6 * 80 * 0.9);
});

test('corner radius is capped so tiny shapes stay valid', () => {
  const p = roundedPolygon(10, 10, 6, 4, 50);
  assert.ok(Number.isFinite(p.length) && p.length > 0);
  assert.ok(!/NaN|Infinity/.test(p.d));
});

test('gauge: 270° arc open at the bottom, symmetric', () => {
  const g = gaugeArc(100, 100, 80);
  near(g.length, 80 * 1.5 * Math.PI, 0.001);
  const m = measure(g.d);
  near(m.len, g.length, 0.2);
  const nums = g.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const [sx, sy] = nums; const [ex, ey] = nums.slice(-2);
  near(sx + ex, 200, 0.02);   // متناظر حول المنتصف
  near(sy, ey, 0.02);
  assert.ok(sy > 100, 'ends are below the centre');
});

test('segments: evenly spaced, lit count follows the value', () => {
  const segs = ringSegments(100, 100, 80, 24);
  assert.equal(segs.length, 24);
  assert.ok(segs.every((d) => /^M [\d.-]+ [\d.-]+ A 80 80 0 0 1 /.test(d)));
  assert.equal(litSegments(0, 24), 0);
  assert.equal(litSegments(0.001, 24), 1, 'any progress shows at least one segment');
  assert.equal(litSegments(0.5, 24), 12);
  assert.equal(litSegments(1, 24), 24);
  assert.equal(litSegments(1.7, 24), 24);
  assert.ok(segmentCount(120) > segmentCount(70), 'outer rings get more segments');
  assert.ok(segmentCount(5) >= 12);
});

test('ring style: saved values are validated', () => {
  assert.equal(DEFAULT_RING_STYLE, 'rings');
  assert.equal(parseRingStyle('diamond'), 'diamond');
  assert.equal(parseRingStyle('"bars"'), 'bars');
  assert.equal(parseRingStyle(null), 'rings');
  assert.equal(parseRingStyle('triangle'), 'rings');
  assert.ok(isRingStyle('hexagon') && !isRingStyle('x') && !isRingStyle(4));
  assert.deepEqual(Object.keys(RING_STYLE_META).sort(), [...RING_STYLES].sort());
  assert.ok(RING_STYLES.length >= 5, 'several styles to choose from');
});

console.log(`\n${passed} rings tests passed`);
