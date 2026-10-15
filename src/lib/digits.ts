// الأرقام العربية (٠-٩) والفارسية (۰-۹) → إنجليزية.
// لوحة الأرقام في الجوال لما تكون اللغة عربي تكتب ٠-٩، والخانات اللي تشيل «غير الأرقام» كانت تمسحها.
export const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));

/** بس الأرقام (بعد تحويل العربية) */
export const onlyDigits = (s: string) => toLatinDigits(s).replace(/\D/g, '');

/**
 * رقم من خانة يكتبها المستخدم: أرقام عربية (٠-٩) أو فارسية (۰-۹) أو إنجليزية، والفاصلة العشرية «٫» أو «,» أو «.».
 * لوحة الأرقام في الجوال لما تكون اللغة عربي تكتب «٢٥٠» و«٧٥٫٥»، و Number/parseFloat ما تفهمها (تطلع NaN أو صفر).
 * فاضي أو غلط أو سالب = null
 */
export function parseDecimal(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null;
  const s = toLatinDigits(v)
    .replace(/[\s٬‎‏؜]/g, '') // مسافات، فاصلة الآلاف العربية، علامات الاتجاه
    .replace(/[٫,،]/g, '.');
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** بديل Number(نص) للخانات: الغلط = NaN (فالمقارنات تفشل والتحقق يرفضه) */
export const toNumber = (v: string | number | null | undefined) => parseDecimal(v) ?? NaN;
