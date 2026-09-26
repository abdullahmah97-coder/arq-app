// صيغة ردود مدرب ARQ الذكي (نفسها من الذكاء الاصطناعي أو من المحرك المحلي)

export type CoachRoute = 'health' | 'inbody' | 'plan' | 'compete' | 'devices' | 'progress' | 'friends' | 'challenge_new' | 'learn';

export interface CoachWorkoutItem {
  exercise_id: string;
  sets: number;
  reps: string;
  rest_sec: number;
}

export interface CoachWorkout {
  title: string;
  minutes: number;
  exercises: CoachWorkoutItem[];
  note?: string;
}

export interface CoachReply {
  text: string;
  workout?: CoachWorkout | null;
  open?: { kind: 'exercise'; id: string } | { kind: 'screen'; route: CoachRoute } | null;
  chips?: string[];
  /** مصدر الرد: الذكاء الاصطناعي أو المحرك المحلي (بدون إنترنت/بدون مفتاح) */
  source?: 'ai' | 'local';
}

export interface CoachMessage {
  id: string;
  role: 'user' | 'coach';
  text: string;
  reply?: CoachReply;
  at: number;
}

/** معلومات المستخدم التي يستخدمها المدرب لتخصيص الرد */
export interface CoachContext {
  lang: 'ar' | 'en';
  gender?: 'male' | 'female' | null;
  goal?: 'lose' | 'gain' | 'maintain' | 'fit' | null;
  level?: 'beginner' | 'intermediate' | 'advanced' | null;
  weight_kg?: number | null;
  recovery?: number | null;
  zone?: 'green' | 'yellow' | 'red' | null;
  strain?: number | null;
  sleep_min?: number | null;
  steps?: number | null;
  today?: { focus: string; exercises: { exercise_id?: string; name: string; sets: number; reps: string }[]; rest: boolean } | null;
  protein_g?: number | null;
  calories?: number | null;
}
