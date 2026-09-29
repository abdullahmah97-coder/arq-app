// باركود المنتجات: نقرأ الباركود ونجيب القيم الغذائية من Open Food Facts
// (قاعدة بيانات مفتوحة للمنتجات الغذائية، ترخيص ODbL: نذكر المصدر تحت المنتج)
// الدوال هنا صافية قابلة للاختبار ما عدا lookupBarcode (تطلب من الإنترنت)
import type { Macros } from './math';

export interface BarcodeProduct {
  code: string;
  name_ar: string | null;
  name_en: string | null;
  brand: string | null;
  image: string | null;
  /** وحدة الكمية: جرام أو مل */
  unit: 'g' | 'ml';
  /** القيم لكل ١٠٠ جم/مل (null لو المنتج ما عليه قيم) */
  per100: Macros | null;
  /** القيم لحصة وحدة كما هي مكتوبة على المنتج */
  perServing: Macros | null;
  /** حجم الحصة بالجرام/مل */
  servingSize: number | null;
  /** حجم العبوة كاملة بالجرام/مل */
  packageSize: number | null;
}

export type PortionKey = 'serving' | 'package' | 'hundred';
export interface Portion { key: PortionKey; amount: number | null; macros: Macros }

const r1 = (n: number) => Math.round(n * 10) / 10;

/** رقم من قيمة OFF (أحياناً نص) */
const numOf = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** رقم التحقق حق GS1 (EAN-8، UPC-A، EAN-13، GTIN-14) */
export function validGtin(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** UPC-E (٨ أرقام) ← UPC-A (١٢ رقم) */
export function upcEtoA(upce: string): string | null {
  if (!/^[01]\d{7}$/.test(upce)) return null;
  const [ns, d1, d2, d3, d4, d5, d6, check] = upce.split('');
  let body: string;
  if ('012'.includes(d6)) body = `${d1}${d2}${d6}0000${d3}${d4}${d5}`;
  else if (d6 === '3') body = `${d1}${d2}${d3}00000${d4}${d5}`;
  else if (d6 === '4') body = `${d1}${d2}${d3}${d4}00000${d5}`;
  else body = `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  return `${ns}${body}${check}`;
}

/**
 * الأرقام اللي ندوّر فيها بالترتيب. الآيفون يقرأ UPC-A كـ EAN-13 بصفر قدام، وبعض المنتجات
 * محفوظة بالشكلين، فنجرب الثاني لو الأول ما انوجد. يرجع [] لو الرقم غلط (قراءة ناقصة من الكاميرا).
 */
export function barcodeCandidates(raw: string, type = ''): string[] {
  const code = raw.replace(/\D/g, '');
  const t = type.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (code.length === 8 && (t.includes('upce') || (!t.includes('ean8') && !validGtin(code)))) {
    const a = upcEtoA(code);
    if (a && validGtin(a)) return [code, a, `0${a}`];
  }
  if (!validGtin(code)) return [];
  const out = [code];
  if (code.length === 13 && code.startsWith('0')) out.push(code.slice(1));
  if (code.length === 12) out.push(`0${code}`);
  if (code.length === 14 && code.startsWith('0')) out.push(code.slice(1));
  return out;
}

/** السعرات والماكروز من حقول OFF لنهاية معيّنة (_100g أو _serving) */
function macrosFrom(n: Record<string, unknown>, suffix: '_100g' | '_serving', per100: boolean): Macros | null {
  let kcal = numOf(n[`energy-kcal${suffix}`]);
  const kj = numOf(n[`energy-kj${suffix}`]) ?? (String(n.energy_unit ?? '').toLowerCase() === 'kj' ? numOf(n[`energy${suffix}`]) : null);
  // بعض المنتجات حاطين الكيلوجول في خانة السعرات بالغلط
  if (kcal == null || (per100 && kcal > 950)) kcal = kj != null ? kj / 4.184 : kcal;
  const protein = numOf(n[`proteins${suffix}`]);
  const carbs = numOf(n[`carbohydrates${suffix}`]);
  const fat = numOf(n[`fat${suffix}`]);
  if (kcal == null && protein == null && carbs == null && fat == null) return null;
  const p = protein ?? 0, c = carbs ?? 0, f = fat ?? 0;
  const k = kcal ?? p * 4 + c * 4 + f * 9;
  if (per100 && (k > 950 || p > 100 || c > 100 || f > 100)) return null;
  if (!per100 && (k > 5000 || p > 500 || c > 1000 || f > 500)) return null;
  return { kcal: Math.round(k), protein_g: r1(p), carbs_g: r1(c), fat_g: r1(f) };
}

/** سوائل: «330ml»، «1 L»، «250 مل» */
const ML_RE = /(^|[\d\s.])(ml|cl|l|مل|لتر)(?![a-z])/i;

const clean = (v: unknown, max = 70) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
};

/** يحوّل رد Open Food Facts لمنتج نقدر نعرضه (null لو ما فيه منتج) */
export function parseOffProduct(json: any, code: string): BarcodeProduct | null {
  const p = json?.product;
  if (!p || (json?.status !== 1 && json?.status !== 'success' && !p.product_name && !p.nutriments)) return null;
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const u = String(p.product_quantity_unit ?? p.serving_quantity_unit ?? '').toLowerCase();
  const unit: 'g' | 'ml' = u === 'ml' ? 'ml' : u === 'g' ? 'g' : ML_RE.test(String(p.quantity ?? p.serving_size ?? '')) ? 'ml' : 'g';
  const serving = numOf(p.serving_quantity);
  const pkg = numOf(p.product_quantity);
  const per100 = macrosFrom(n, '_100g', true);
  const perServing = macrosFrom(n, '_serving', false);
  const name_ar = clean(p.product_name_ar);
  const name_en = clean(p.product_name_en) ?? clean(p.product_name) ?? clean(p.generic_name_en) ?? clean(p.generic_name);
  const brand = clean(String(p.brands ?? '').split(',')[0], 40);
  if (!name_ar && !name_en && !brand && !per100 && !perServing) return null;
  return {
    code: String(p.code ?? code),
    name_ar, name_en, brand,
    image: typeof p.image_front_small_url === 'string' && p.image_front_small_url.startsWith('https://') ? p.image_front_small_url : null,
    unit,
    per100,
    perServing,
    servingSize: serving && serving > 0 && serving <= 2000 ? serving : null,
    packageSize: pkg && pkg > 0 && pkg <= 10000 ? pkg : null,
  };
}

const scale = (m: Macros, f: number): Macros =>
  ({ kcal: Math.round(m.kcal * f), protein_g: r1(m.protein_g * f), carbs_g: r1(m.carbs_g * f), fat_g: r1(m.fat_g * f) });

/** الكميات المتاحة: حصة، العبوة كاملة، ١٠٠ جم/مل — بس اللي نقدر نحسب قيمها */
export function portions(p: BarcodeProduct): Portion[] {
  const out: Portion[] = [];
  if (p.servingSize && p.per100) out.push({ key: 'serving', amount: p.servingSize, macros: scale(p.per100, p.servingSize / 100) });
  else if (p.perServing) out.push({ key: 'serving', amount: p.servingSize, macros: p.perServing });
  if (p.packageSize && p.packageSize !== p.servingSize) {
    if (p.per100) out.push({ key: 'package', amount: p.packageSize, macros: scale(p.per100, p.packageSize / 100) });
    else if (p.perServing && p.servingSize) out.push({ key: 'package', amount: p.packageSize, macros: scale(p.perServing, p.packageSize / p.servingSize) });
  }
  if (p.per100) out.push({ key: 'hundred', amount: 100, macros: p.per100 });
  return out;
}

/** الكمية الافتراضية: الحصة، وإلا العبوة لو تنشرب/تنأكل مرة وحدة (علبة ٣٣٠، لوح، كيس صغير)، وإلا ١٠٠ */
export function defaultPortion(list: Portion[]): Portion | null {
  return list.find((x) => x.key === 'serving')
    ?? list.find((x) => x.key === 'package' && (x.amount ?? 0) <= 350)
    ?? list.find((x) => x.key === 'hundred')
    ?? list[0] ?? null;
}

export const portionMacros = (portion: Portion, count: number): Macros => scale(portion.macros, Math.max(0, count));

/** اسم المنتج بلغة المستخدم مع الماركة لو مو مذكورة */
export function productName(p: BarcodeProduct, lng: 'ar' | 'en'): string {
  const base = (lng === 'ar' ? p.name_ar ?? p.name_en : p.name_en ?? p.name_ar) ?? p.brand ?? p.code;
  return p.brand && !base.toLowerCase().includes(p.brand.toLowerCase()) ? `${base} · ${p.brand}` : base;
}

const OFF = 'https://world.openfoodfacts.org/api/v2/product/';
const FIELDS = 'code,product_name,product_name_ar,product_name_en,generic_name,generic_name_en,brands,quantity,product_quantity,product_quantity_unit,serving_size,serving_quantity,serving_quantity_unit,nutriments,image_front_small_url';
const cache = new Map<string, BarcodeProduct | null>();

async function fetchOne(code: string): Promise<BarcodeProduct | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(`${OFF}${code}?fields=${FIELDS}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'ARQ/1.0 (https://joinarq.com)' },
      signal: ctrl.signal,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('network');
    return parseOffProduct(await res.json(), code);
  } catch {
    throw new Error('network');
  } finally {
    clearTimeout(timer);
  }
}

/** يدوّر المنتج بالباركود. null = ما انوجد، ويرمي 'network' لو ما فيه اتصال */
export async function lookupBarcode(raw: string, type = ''): Promise<BarcodeProduct | null> {
  const list = barcodeCandidates(raw, type);
  if (!list.length) throw new Error('invalid_code');
  const key = list[0];
  if (cache.has(key)) return cache.get(key) ?? null;
  for (const c of list) {
    const p = await fetchOne(c);
    if (p) { cache.set(key, p); return p; }
  }
  cache.set(key, null);
  return null;
}
