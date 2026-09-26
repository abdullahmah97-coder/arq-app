// أنواع البيانات المشتركة بين التطبيق وقاعدة البيانات

export type Locale = 'ar' | 'en';
export type I18nText = { ar: string; en: string };

export type Gender = 'male' | 'female';
export type Goal = 'lose' | 'gain' | 'maintain' | 'fit';
export type Level = 'beginner' | 'intermediate' | 'advanced';

export interface Profile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  gym_id: string | null;
  locale: Locale;
  points: number;
  streak: number;
  best_streak: number;
  last_checkin_on: string | null;
  onboarded: boolean;
  created_at: string;
  followers_count: number;
  following_count: number;
  /** مدرب موثّق (يُمنح من الإدارة) */
  is_coach: boolean;
}

export interface HealthProfile {
  user_id: string;
  gender: Gender | null;
  birth_year: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  goal: Goal | null;
  level: Level | null;
  days_per_week: number | null;
}

export interface Gym {
  id: string;
  name: string;
  name_en: string | null;
  city: string | null;
  lat: number;
  lng: number;
  radius_m: number;
  verified: boolean;
  distance_m?: number;
}

export interface CheckIn {
  id: string;
  user_id: string;
  gym_id: string;
  checked_in_at: string;
  checked_out_at: string | null;
  distance_m: number | null;
  points_awarded: number;
}

export interface BodyLog {
  id: string;
  user_id: string;
  weight_kg: number;
  photo_path: string | null;
  note: string | null;
  created_at: string;
}

export interface FeedPost {
  id: string;
  user_id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  image_path: string | null;
  caption: string | null;
  check_in_id: string | null;
  gym_name: string | null;
  created_at: string;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profiles?: Pick<Profile, 'username' | 'avatar_url'>;
}

export type LeaderboardScope = 'friends' | 'gym' | 'global';

export interface LeaderboardRow {
  user_id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  points: number;
  streak: number;
  rank: number;
}

export type ChallengeMetric = 'checkins' | 'workouts' | 'points' | 'steps';

export interface Challenge {
  id: string;
  creator: string;
  title: string;
  metric: ChallengeMetric;
  target: number | null;
  starts_on: string;
  ends_on: string;
  settled: boolean;
  created_at: string;
}

export interface ChallengeStanding {
  user_id: string;
  username: string;
  avatar_url: string | null;
  status: 'invited' | 'joined';
  score: number;
}

export interface Friendship {
  id: string;
  requester: string;
  addressee: string;
  status: 'pending' | 'accepted';
  created_at: string;
}
