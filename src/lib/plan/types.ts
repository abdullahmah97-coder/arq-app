// شكل الخطة الأسبوعية المحفوظة في plans.data
import type { Gender, Goal, I18nText, Level } from '../types';
import type { InBodyAnalysis } from '../inbody/types';

export type MealSlot = 'breakfast' | 'lunch' | 'snack' | 'dinner';

export interface PlanExercise {
  name: I18nText;
  /** معرف التمرين في دليل التمارين ثلاثي الأبعاد (src/three/catalog.ts) */
  exercise_id?: string;
  sets: number;
  reps: string; // مثل "8-10" أو "30 ث"
  rest_sec: number;
  notes?: I18nText;
  /** عدّات متبقية في الخزان (Reps In Reserve) مثل "1-2" */
  rir?: string;
}

export interface PlanDay {
  day: number; // 0 = الأحد ... 6 = السبت
  rest: boolean;
  focus: I18nText;
  exercises: PlanExercise[];
  cardio?: I18nText;
}

export interface MealPortion {
  name: I18nText;
  amount: string; // "120 جم" / "1 حبة" — نص حر
}

export interface PlanMeal {
  slot: MealSlot;
  name: I18nText;
  portions: MealPortion[];
  kcal: number;
  protein_g: number;
}

export interface PlanMealDay {
  day: number;
  meals: PlanMeal[];
}

export interface PlanTargets {
  bmi: number;
  bmr: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  water_l: number;
}

export interface WeeklyPlan {
  version: 1;
  generated_at: string;
  summary: I18nText;
  targets: PlanTargets;
  days: PlanDay[];
  meals: PlanMealDay[];
  tips: I18nText[];
  photo_notes?: I18nText;
  /** هل بُنيت الخطة على تقرير InBody */
  based_on_inbody?: boolean;
  /** البرنامج الجاهز المعتمد (إن وجد) */
  program?: { id: string; name: I18nText; credit?: string };
}

export interface PlanInput {
  gender: Gender;
  age: number;
  height_cm: number;
  weight_kg: number;
  goal: Goal;
  level: Level;
  days_per_week: number; // 2..6
  /** تحليل آخر تقرير InBody (اختياري) — يحسّن دقة السعرات والبروتين والتمارين */
  inbody?: InBodyAnalysis | null;
}
