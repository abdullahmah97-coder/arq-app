// أقسام الرئيسية وترتيبها (منطق بحت بدون واجهة، عشان يتختبر)
import { isDefaultOrder, mergeOrder } from './orderMerge.ts';
export const HOME_SECTIONS = ['rings', 'sleep', 'shortcuts', 'monitors', 'mission', 'nutrition', 'recovery', 'dashboard', 'steps', 'stats', 'checkin', 'clubs', 'store', 'rules'] as const;
export type HomeSection = (typeof HOME_SECTIONS)[number];

/** الأيقونة ومفتاح الاسم لكل قسم (لقائمة الترتيب) */
export const SECTION_META: Record<HomeSection, { icon: string; label: string }> = {
  rings: { icon: 'pulse', label: 'homeLayout.s_rings' },
  sleep: { icon: 'moon-outline', label: 'homeLayout.s_sleep' },
  shortcuts: { icon: 'apps-outline', label: 'homeLayout.s_shortcuts' },
  monitors: { icon: 'heart-outline', label: 'homeLayout.s_monitors' },
  mission: { icon: 'barbell-outline', label: 'homeLayout.s_mission' },
  nutrition: { icon: 'restaurant-outline', label: 'homeLayout.s_nutrition' },
  recovery: { icon: 'leaf-outline', label: 'homeLayout.s_recovery' },
  dashboard: { icon: 'stats-chart-outline', label: 'homeLayout.s_dashboard' },
  steps: { icon: 'footsteps-outline', label: 'homeLayout.s_steps' },
  stats: { icon: 'star-outline', label: 'homeLayout.s_stats' },
  checkin: { icon: 'location-outline', label: 'homeLayout.s_checkin' },
  clubs: { icon: 'business-outline', label: 'homeLayout.s_clubs' },
  store: { icon: 'bag-handle-outline', label: 'homeLayout.s_store' },
  rules: { icon: 'help-circle-outline', label: 'homeLayout.s_rules' },
};

export interface HomeLayout { order: HomeSection[]; hidden: HomeSection[] }
export const DEFAULT_LAYOUT: HomeLayout = { order: [...HOME_SECTIONS], hidden: [] };

/** يدمج الترتيب المحفوظ مع الأقسام الحالية: يشيل القديم والمكرر، والأقسام الجديدة تنحط بعد اللي قبلها بالترتيب الافتراضي */
export const mergeLayout = (saved: Partial<{ order: unknown; hidden: unknown }> | null | undefined): HomeLayout => mergeOrder(saved, HOME_SECTIONS);

export const isDefaultLayout = (l: HomeLayout) => isDefaultOrder(l, HOME_SECTIONS);
