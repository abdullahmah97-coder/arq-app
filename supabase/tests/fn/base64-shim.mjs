// بديل jsr:@std/encoding للاختبارات
export const encodeBase64 = (bytes) => Buffer.from(bytes).toString('base64');
