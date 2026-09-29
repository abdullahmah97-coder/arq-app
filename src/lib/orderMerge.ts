// دمج ترتيب محفوظ مع القائمة الحالية (أقسام الرئيسية، الاختصارات…): يشيل القديم والمكرر، والجديد ينحط بعد اللي قبله بالترتيب الافتراضي
export interface Arranged<K extends string> { order: K[]; hidden: K[] }

export function mergeOrder<K extends string>(saved: Partial<{ order: unknown; hidden: unknown }> | null | undefined, all: readonly K[]): Arranged<K> {
  const known = (k: unknown): k is K => typeof k === 'string' && (all as readonly string[]).includes(k);
  const order: K[] = [];
  for (const k of Array.isArray(saved?.order) ? saved.order : []) if (known(k) && !order.includes(k)) order.push(k);
  all.forEach((k, i) => {
    if (order.includes(k)) return;
    const prev = all.slice(0, i).reverse().find((p) => order.includes(p));
    order.splice(prev ? order.indexOf(prev) + 1 : 0, 0, k);
  });
  const hidden = [...new Set((Array.isArray(saved?.hidden) ? saved.hidden : []).filter(known))];
  return { order, hidden };
}

export const isDefaultOrder = <K extends string>(l: Arranged<K>, all: readonly K[]) =>
  !l.hidden.length && l.order.every((k, i) => k === all[i]);
