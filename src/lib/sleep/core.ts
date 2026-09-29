// حاسبة النوم (منطق بحت عشان يتختبر): متى تنام عشان تصحى على وقتك وتاخذ احتياجك،
// وأوقات النوم على دورات النوم (كل دورة ٩٠ دقيقة) عشان تصحى بين دورتين وأنت أنشط.

export const CYCLE_MIN = 90;
/** الوقت اللي ياخذه أغلب الناس لين يغفون */
export const FALL_ASLEEP_MIN = 15;
export const DEFAULT_NEED_MIN = 8 * 60;
const DAY = 24 * 60;

export interface SleepSettings {
  /** وقت الصحيان HH:MM */
  wake: string;
  /** أيام الصحيان: ٠ = الأحد … ٦ = السبت */
  days: number[];
  /** منبّه الصحيان شغّال */
  alarm: boolean;
  /** تذكير وقت النوم */
  remind: boolean;
  /** التذكير قبل وقت النوم بكم دقيقة */
  remindBefore: number;
}

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
export const DEFAULT_SLEEP: SleepSettings = { wake: '07:00', days: ALL_DAYS, alarm: false, remind: false, remindBefore: 30 };

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** "07:05" → ٤٢٥ دقيقة من بداية اليوم */
export function parseHm(s: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]); const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** دقائق من بداية اليوم (أي رقم، حتى السالب أو فوق ٢٤ ساعة) → "HH:MM" */
export function fmtHm(minutes: number): string {
  const v = mod(Math.round(minutes), DAY);
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

const round5 = (n: number) => Math.round(n / 5) * 5;

/** احتياج النوم من الساعة (بين ٦ و١٠ ساعات)، وإلا ٨ ساعات */
export function sleepNeed(fromWatch: number | null | undefined): number {
  return fromWatch && Number.isFinite(fromWatch) && fromWatch >= 360 && fromWatch <= 600 ? Math.round(fromWatch) : DEFAULT_NEED_MIN;
}

/** متى تنام (تدخل السرير) عشان تصحى على الوقت وتاخذ احتياجك كامل */
export function bedtimeFor(wakeMin: number, needMin: number): number {
  return mod(round5(wakeMin - FALL_ASLEEP_MIN - needMin), DAY);
}

export interface CycleOption { cycles: number; at: number; sleepMin: number }

/** أوقات النوم اللي تخليك تصحى بين دورتين (٦ و٥ و٤ دورات) */
export function cycleBedtimes(wakeMin: number, cycles = [6, 5, 4]): CycleOption[] {
  return cycles.map((c) => ({ cycles: c, sleepMin: c * CYCLE_MIN, at: mod(round5(wakeMin - FALL_ASLEEP_MIN - c * CYCLE_MIN), DAY) }));
}

/** لو نمت الحين: أفضل أوقات الصحيان (٤ و٥ و٦ دورات) */
export function wakeTimesFrom(nowMin: number, cycles = [4, 5, 6]): CycleOption[] {
  return cycles.map((c) => ({ cycles: c, sleepMin: c * CYCLE_MIN, at: mod(round5(nowMin + FALL_ASLEEP_MIN + c * CYCLE_MIN), DAY) }));
}

/** أقرب خيار دورات لاحتياجك (بدون ما ينقص عنه أكثر من نص دورة) */
export function bestCycle(options: CycleOption[], needMin: number): CycleOption | null {
  if (!options.length) return null;
  return [...options].sort((a, b) => Math.abs(a.sleepMin - needMin) - Math.abs(b.sleepMin - needMin))[0];
}

/**
 * هل الوقت الحين «وقت نوم»: من ساعتين قبل وقت النوم لين وقت الصحيان.
 * نستخدمها عشان نعرض «لو نمت الحين تصحى الساعة…».
 */
export function isNightWindow(nowMin: number, bedMin: number, wakeMin: number): boolean {
  const start = mod(bedMin - 120, DAY);
  return start <= wakeMin ? nowMin >= start && nowMin < wakeMin : nowMin >= start || nowMin < wakeMin;
}

/** أقرب موعد صحيان جاي (على الأيام المختارة) */
export function nextWake(now: Date, wakeMin: number, days: number[]): Date | null {
  const allowed = new Set(days.filter((d) => d >= 0 && d <= 6));
  if (!allowed.size) return null;
  for (let i = 0; i <= 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    d.setHours(Math.floor(wakeMin / 60), wakeMin % 60, 0, 0);
    if (d.getTime() > now.getTime() && allowed.has(d.getDay())) return d;
  }
  return null;
}

/**
 * موعد تذكير النوم لكل يوم صحيان: التذكير قبل وقت النوم بـ remindBefore، وممكن يكون في اليوم اللي قبله.
 * يرجع [يوم التذكير (٠ = الأحد)، الدقيقة من بداية اليوم].
 */
export function bedtimeReminders(wakeMin: number, needMin: number, days: number[], remindBefore: number): [number, number][] {
  const abs = round5(wakeMin - FALL_ASLEEP_MIN - needMin - remindBefore); // ممكن يكون سالب = اليوم اللي قبل
  const dayOffset = Math.floor(abs / DAY);
  const at = mod(abs, DAY);
  const out = new Map<number, number>();
  for (const d of days) if (d >= 0 && d <= 6) out.set(mod(d + dayOffset, 7), at);
  return [...out.entries()].sort((a, b) => a[0] - b[0]);
}

/** ينظّف الإعدادات المحفوظة (أي شي خربان يرجع للافتراضي) */
export function sanitizeSleep(raw: unknown): SleepSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const wake = parseHm(String(r.wake ?? '')) != null ? fmtHm(parseHm(String(r.wake))!) : DEFAULT_SLEEP.wake;
  const days = Array.isArray(r.days)
    ? [...new Set(r.days.filter((d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : DEFAULT_SLEEP.days;
  const before = typeof r.remindBefore === 'number' && [0, 15, 30, 45, 60].includes(r.remindBefore) ? r.remindBefore : DEFAULT_SLEEP.remindBefore;
  return { wake, days: days.length ? days : DEFAULT_SLEEP.days, alarm: r.alarm === true, remind: r.remind === true, remindBefore: before };
}

/** مدة بالساعات والدقائق "7:45" */
export const fmtDuration = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`;
