// حسابات العروض والتقييم (بدون اعتماديات — قابلة للاختبار)
export const monthly = (o: { price_sar: number; months: number }) => (o.months > 0 ? o.price_sar / o.months : o.price_sar * 30);
export const discountPct = (o: { price_sar: number; old_price_sar: number | null }) =>
  o.old_price_sar && o.old_price_sar > o.price_sar ? Math.round((1 - o.price_sar / o.old_price_sar) * 100) : null;
export function daysLeft(o: { ends_on: string | null }, now = new Date()) {
  if (!o.ends_on) return null;
  const end = new Date(`${o.ends_on}T23:59:59`);
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
}

/** توزيع النجوم ٥..١ */
export function ratingBars(reviews: { rating: number }[]) {
  const c = [5, 4, 3, 2, 1].map((s) => reviews.filter((r) => r.rating === s).length);
  const total = Math.max(1, reviews.length);
  return c.map((n, i) => ({ stars: 5 - i, n, pct: n / total }));
}
