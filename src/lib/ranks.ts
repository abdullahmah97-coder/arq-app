// الرتب: تبدأ من «مبتدئ» وترتفع بالنقاط (الحضور للنادي، السلسلة، التمارين، الخطوات، التحديات)
// يجب أن تطابق rank_level() و can_publish() في قاعدة البيانات
import type { I18nText } from './types';

export type RankId = 'beginner' | 'committed' | 'advanced' | 'pro' | 'elite';

export interface Rank {
  level: number;
  id: RankId;
  min: number;
  name: I18nText;
  color: string;
  icon: 'leaf' | 'flame' | 'barbell' | 'trophy' | 'diamond';
  perks: I18nText[];
}

const t = (ar: string, en: string): I18nText => ({ ar, en });

export const RANKS: Rank[] = [
  { level: 0, id: 'beginner', min: 0, name: t('مبتدئ', 'Beginner'), color: '#8FA89B', icon: 'leaf',
    perks: [t('سجل حضورك وتمارينك وابدأ تجمع نقاط', 'Log check-ins and workouts to start earning points'), t('تابع المدربين وتبنَّ برامجهم', 'Follow coaches and adopt their programs')] },
  { level: 1, id: 'committed', min: 150, name: t('ملتزم', 'Committed'), color: '#FEA94F', icon: 'flame',
    perks: [t('شارة «ملتزم» في ملفك', '“Committed” badge on your profile')] },
  { level: 2, id: 'advanced', min: 500, name: t('متقدم', 'Advanced'), color: '#F1551D', icon: 'barbell',
    perks: [t('تقدر تنشر نصائح للمجتمع', 'You can publish tips to the community')] },
  { level: 3, id: 'pro', min: 1200, name: t('محترف', 'Pro'), color: '#2F4B3C', icon: 'trophy',
    perks: [t('تقدر تنشر جداول تمارين يتبناها غيرك', 'You can publish workout programs others can adopt'), t('+10 نقاط كل ما تبنى أحد برنامجك', '+10 points each time someone adopts your program')] },
  { level: 4, id: 'elite', min: 2500, name: t('نخبة', 'Elite'), color: '#0A332D', icon: 'diamond',
    perks: [t('شارة النخبة وظهور مميز في الاكتشاف', 'Elite badge and featured in Discover')] },
];

export const TIP_LEVEL = 2;
export const PROGRAM_LEVEL = 3;

export function rankLevel(points: number) {
  let l = 0;
  for (const r of RANKS) if (points >= r.min) l = r.level;
  return l;
}

export const rankOf = (points: number) => RANKS[rankLevel(points)];

/** التقدم للرتبة التالية (0..1) والنقاط المتبقية */
export function rankProgress(points: number) {
  const cur = rankOf(points);
  const next = RANKS[cur.level + 1] ?? null;
  if (!next) return { cur, next, pct: 1, remaining: 0 };
  const pct = Math.max(0, Math.min(1, (points - cur.min) / (next.min - cur.min)));
  return { cur, next, pct, remaining: next.min - points };
}

export function canPublish(kind: 'tip' | 'program', p: { points: number; is_coach?: boolean | null; is_owner?: boolean | null }) {
  // المدرب الموثّق ومالك التطبيق مفتوح لهم النشر بدون شرط الرتبة
  if (p.is_coach || p.is_owner) return true;
  return rankLevel(p.points) >= (kind === 'tip' ? TIP_LEVEL : PROGRAM_LEVEL);
}

/** مصادر النقاط (تطابق دوال القاعدة) — تُعرض في صفحة الرتب */
export const POINT_SOURCES: { icon: string; pts: number; label: I18nText }[] = [
  { icon: 'location', pts: 10, label: t('تسجيل حضور في النادي (مرة باليوم)', 'Gym check-in (once a day)') },
  { icon: 'barbell', pts: 15, label: t('إنجاز تمرين اليوم من خطتك', 'Completing today’s planned workout') },
  { icon: 'flame', pts: 25, label: t('كل ٧ أيام حضور متتالية', 'Every 7-day check-in streak') },
  { icon: 'time', pts: 5, label: t('جلسة ٤٥ دقيقة فأكثر', 'Session of 45+ minutes') },
  { icon: 'footsteps', pts: 5, label: t('١٠,٠٠٠ خطوة في اليوم', '10,000 steps in a day') },
  { icon: 'trophy', pts: 50, label: t('الفوز بتحدي', 'Winning a challenge') },
  { icon: 'people', pts: 10, label: t('كل متدرب يتبنى برنامجك', 'Each trainee who adopts your program') },
];

// ---------- برامج المستخدمين ----------
export interface UserProgramExercise { exercise_id: string; sets: number; reps: string; rest_sec: number; rir?: string }
export interface UserProgramDay { title: string; exercises: UserProgramExercise[] }

/** يتحقق من البرنامج قبل النشر؛ يرجع مفتاح الخطأ أو null */
export function validateProgram(p: { title: string; days: UserProgramDay[] }): string | null {
  if (p.title.trim().length < 3) return 'title';
  if (!p.days.length || p.days.length > 7) return 'days';
  for (const d of p.days) {
    if (!d.title.trim()) return 'dayTitle';
    if (!d.exercises.length) return 'dayEmpty';
    if (d.exercises.length > 15) return 'tooMany';
    for (const e of d.exercises) {
      if (!(e.sets >= 1 && e.sets <= 10)) return 'sets';
      if (!/^\d{1,2}(-\d{1,2})?$/.test(e.reps.trim())) return 'reps';
    }
  }
  return null;
}
