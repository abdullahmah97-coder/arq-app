// أشكال حلقات الرئيسية (منطق بحت عشان يتختبر): الترتيب هنا هو ترتيبها في تخصيص الرئيسية
export const RING_STYLES = ['rings', 'gauge', 'segments', 'diamond', 'hexagon', 'bars'] as const;
export type RingStyle = (typeof RING_STYLES)[number];
export const DEFAULT_RING_STYLE: RingStyle = 'rings';

export const isRingStyle = (x: unknown): x is RingStyle => typeof x === 'string' && (RING_STYLES as readonly string[]).includes(x);

/** القيمة المحفوظة → شكل معروف (أي شي قديم أو خربان يرجع للدوائر) */
export const parseRingStyle = (raw: string | null | undefined): RingStyle => {
  if (!raw) return DEFAULT_RING_STYLE;
  const v = raw.trim().replace(/^"|"$/g, '');
  return isRingStyle(v) ? v : DEFAULT_RING_STYLE;
};

/** الأيقونة ومفتاح الاسم لكل شكل */
export const RING_STYLE_META: Record<RingStyle, { icon: string; label: string }> = {
  rings: { icon: 'ellipse-outline', label: 'homeLayout.style_rings' },
  gauge: { icon: 'speedometer-outline', label: 'homeLayout.style_gauge' },
  segments: { icon: 'sunny-outline', label: 'homeLayout.style_segments' },
  diamond: { icon: 'diamond-outline', label: 'homeLayout.style_diamond' },
  hexagon: { icon: 'cube-outline', label: 'homeLayout.style_hexagon' },
  bars: { icon: 'stats-chart-outline', label: 'homeLayout.style_bars' },
};
