// three.js بنسخته CommonJS (اللي تستخدمها مكتبة الرسم ثلاثي الأبعاد) تنادي process.emitWarning لحظة تحميلها.
// هذي الدالة موجودة في Node فقط، وغيابها على الجوال كان يطيّح التطبيق عند فتح صفحة التمرين.
const g = globalThis as { process?: { env?: Record<string, string | undefined>; emitWarning?: (...args: unknown[]) => void } };
if (!g.process) g.process = { env: {} };
if (typeof g.process.emitWarning !== 'function') g.process.emitWarning = () => {};

export {};
