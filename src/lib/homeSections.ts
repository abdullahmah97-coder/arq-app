// أقسام الرئيسية وترتيبها (منطق بحت بدون واجهة، عشان يتختبر)
export const HOME_SECTIONS = ['rings', 'monitors', 'mission', 'nutrition', 'recovery', 'dashboard', 'steps', 'stats', 'checkin', 'clubs', 'store', 'rules'] as const;
export type HomeSection = (typeof HOME_SECTIONS)[number];

/** الأيقونة ومفتاح الاسم لكل قسم (لقائمة الترتيب) */
export const SECTION_META: Record<HomeSection, { icon: string; label: string }> = {
  rings: { icon: 'pulse', label: 'homeLayout.s_rings' },
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

const isSection = (k: unknown): k is HomeSection => typeof k === 'string' && (HOME_SECTIONS as readonly string[]).includes(k);

/** يدمج الترتيب المحفوظ مع الأقسام الحالية: يشيل القديم والمكرر، والأقسام الجديدة تنحط بعد اللي قبلها بالترتيب الافتراضي */
export function mergeLayout(saved: Partial<{ order: unknown; hidden: unknown }> | null | undefined): HomeLayout {
  const order: HomeSection[] = [];
  for (const k of Array.isArray(saved?.order) ? saved.order : []) if (isSection(k) && !order.includes(k)) order.push(k);
  HOME_SECTIONS.forEach((k, i) => {
    if (order.includes(k)) return;
    const prev = HOME_SECTIONS.slice(0, i).reverse().find((p) => order.includes(p));
    order.splice(prev ? order.indexOf(prev) + 1 : 0, 0, k);
  });
  const hidden = [...new Set((Array.isArray(saved?.hidden) ? saved.hidden : []).filter(isSection))];
  return { order, hidden };
}

export const isDefaultLayout = (l: HomeLayout) =>
  !l.hidden.length && l.order.every((k, i) => k === HOME_SECTIONS[i]);
