// أدوات تجميع مشتركة بين Apple Health و Health Connect (بدون اعتماد على مكتبات أصلية — قابلة للاختبار)
import type { SleepNight } from './types';

export type SleepKind = 'in_bed' | 'asleep' | 'awake' | 'light' | 'deep' | 'rem';
export interface SleepSegment { start: number; end: number; kind: SleepKind }
export interface HrSample { t: number; bpm: number }

const MIN = 60_000;

/** YYYY-MM-DD بالتوقيت المحلي */
export function localDay(d: Date): string {
  const y = d.getFullYear(), m = d.getMonth() + 1, dd = d.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/** بداية ونهاية اليوم المحلي */
export function dayRange(day: string): { start: Date; end: Date } {
  const [y, m, d] = day.split('-').map(Number);
  return { start: new Date(y, m - 1, d, 0, 0, 0), end: new Date(y, m - 1, d + 1, 0, 0, 0) };
}

/** نافذة نوم "ليلة البارحة" لهذا اليوم: من 6 مساءً أمس حتى 2 ظهراً اليوم */
export function sleepWindow(day: string): { start: Date; end: Date } {
  const [y, m, d] = day.split('-').map(Number);
  return { start: new Date(y, m - 1, d - 1, 18, 0, 0), end: new Date(y, m - 1, d, 14, 0, 0) };
}

/** آخر n أيام (الأقدم أولاً) منتهية باليوم */
export function lastDays(n: number, now = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1 - i))));
}

/** دمج الفترات المتداخلة (الساعة والجوال قد يسجلان نفس النوم) — يُرجع المجموع بالدقائق */
export function mergedMinutes(segs: { start: number; end: number }[]): number {
  const s = segs.filter((x) => x.end > x.start).sort((a, b) => a.start - b.start);
  let total = 0, cs = -1, ce = -1;
  for (const x of s) {
    if (x.start > ce) { if (ce > cs) total += ce - cs; cs = x.start; ce = x.end; }
    else ce = Math.max(ce, x.end);
  }
  if (ce > cs) total += ce - cs;
  return Math.round(total / MIN);
}

/** يلخّص مقاطع النوم في ليلة واحدة */
export function summarizeSleep(segs: SleepSegment[]): SleepNight | null {
  if (!segs.length) return null;
  const staged = segs.filter((s) => s.kind === 'light' || s.kind === 'deep' || s.kind === 'rem');
  const of = (k: SleepKind) => mergedMinutes(segs.filter((s) => s.kind === k));
  const awake = of('awake');
  let asleep: number;
  let stages: SleepNight['stages'] = null;
  if (staged.length) {
    stages = { light: of('light'), deep: of('deep'), rem: of('rem'), awake };
    asleep = stages.light + stages.deep + stages.rem;
  } else {
    asleep = of('asleep');
  }
  if (asleep <= 0) return null;
  const all = segs.filter((s) => s.kind !== 'in_bed');
  const bed = segs.filter((s) => s.kind === 'in_bed');
  const start = Math.min(...(bed.length ? bed : all).map((s) => s.start));
  const end = Math.max(...(bed.length ? bed : all).map((s) => s.end));
  const inBed = Math.max(asleep + awake, bed.length ? mergedMinutes(bed) : Math.round((end - start) / MIN));
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString(), in_bed_min: inBed, asleep_min: asleep, stages };
}

/** دقائق في مناطق النبض الخمس (نسبة من أقصى نبض 220 − العمر). الفجوات > 10 دقائق لا تُحتسب. */
export function hrZoneMinutes(samples: HrSample[], age: number): number[] {
  const max = 220 - Math.min(90, Math.max(14, age));
  const bounds = [0.5, 0.6, 0.7, 0.8, 0.9].map((p) => p * max);
  const zones = [0, 0, 0, 0, 0];
  const s = [...samples].sort((a, b) => a.t - b.t);
  for (let i = 0; i < s.length - 1; i++) {
    const dt = (s[i + 1].t - s[i].t) / MIN;
    if (dt <= 0 || dt > 10) continue;
    const bpm = (s[i].bpm + s[i + 1].bpm) / 2;
    let z = -1;
    for (let k = 4; k >= 0; k--) if (bpm >= bounds[k]) { z = k; break; }
    if (z >= 0) zones[z] += dt;
  }
  return zones.map((m) => Math.round(m));
}

export const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
