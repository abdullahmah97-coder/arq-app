// «اختصاراتي»: قائمة الاختصارات وترتيبها الافتراضي (منطق بحت، عشان يتختبر)
import { mergeOrder, type Arranged } from './orderMerge.ts';

export const SHORTCUTS = {
  coach: { icon: 'sparkles', label: 'coach.title', to: '/coach' },
  meal: { icon: 'camera-outline', label: 'meal.snap', to: '/food/photo' },
  plan: { icon: 'calendar-outline', label: 'plan.title', to: '/(tabs)/plan' },
  library: { icon: 'library-outline', label: 'library.title', to: '/exercises' },
  recovery: { icon: 'leaf-outline', label: 'recovery.title', to: '/recovery' },
  health: { icon: 'pulse-outline', label: 'health.title', to: '/health' },
  history: { icon: 'barbell-outline', label: 'workout.history', to: '/workout/history' },
  inbody: { icon: 'analytics-outline', label: 'profile.inbody', to: '/inbody' },
  progress: { icon: 'trending-down-outline', label: 'profile.progress', to: '/progress' },
  stores: { icon: 'storefront-outline', label: 'store.title', to: '/store' },
  clubs: { icon: 'business-outline', label: 'clubs.title', to: '/clubs' },
  coaches: { icon: 'people-circle-outline', label: 'coaching.directory', to: '/coaches' },
  programs: { icon: 'albums-outline', label: 'programs.title', to: '/programs' },
  ranks: { icon: 'ribbon-outline', label: 'social.ranksTitle', to: '/ranks' },
  friends: { icon: 'people-outline', label: 'profile.friends', to: '/friends' },
  messages: { icon: 'chatbubbles-outline', label: 'chat.title', to: '/messages' },
  attendance: { icon: 'calendar-number-outline', label: 'trust.attendanceTitle', to: '/attendance' },
  myCoach: { icon: 'person-outline', label: 'coaching.myCoach', to: '/my-coach' },
  record: { icon: 'document-text-outline', label: 'coaching.myRecord', to: '/record' },
  compare: { icon: 'git-compare-outline', label: 'trust.compareTitle', to: '/clubs/compare' },
  forCoaches: { icon: 'medal-outline', label: 'coaching.forCoaches', to: '/coaching' },
  devices: { icon: 'watch-outline', label: 'health.devices', to: '/devices' },
  profileEdit: { icon: 'create-outline', label: 'profile.edit', to: '/profile-edit' },
  learn: { icon: 'book-outline', label: 'profile.learn', to: '/learn/body-composition' },
  appointments: { icon: 'calendar-clear-outline', label: 'partners.myAppointments', to: '/recovery/appointments' },
  partners: { icon: 'briefcase-outline', label: 'partners.hubName', to: '/partners' },
} as const;
export type ShortcutId = keyof typeof SHORTCUTS;
export const SHORTCUT_IDS = Object.keys(SHORTCUTS) as ShortcutId[];
/** كم اختصار يظهر في الرئيسية */
export const HOME_SHORTCUTS = 8;

export const mergeShortcuts = (saved: Partial<{ order: unknown; hidden: unknown }> | null | undefined): Arranged<ShortcutId> =>
  mergeOrder(saved, SHORTCUT_IDS);
export const visibleShortcuts = (l: Arranged<ShortcutId>) => l.order.filter((k) => !l.hidden.includes(k));
