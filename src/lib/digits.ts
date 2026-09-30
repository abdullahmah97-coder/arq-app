// الأرقام العربية (٠-٩) والفارسية (۰-۹) → إنجليزية.
// لوحة الأرقام في الجوال لما تكون اللغة عربي تكتب ٠-٩، والخانات اللي تشيل «غير الأرقام» كانت تمسحها.
export const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));

/** بس الأرقام (بعد تحويل العربية) */
export const onlyDigits = (s: string) => toLatinDigits(s).replace(/\D/g, '');
