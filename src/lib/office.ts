// مكتب أرك أب: يجمع بيانات أقسام لوحة الإدارة في لقطة وحدة (للإدارة فقط — مفروضة في القاعدة بـ is_admin).
// كل مصدر يتحمّل لحاله: لو تعطّل واحد يبقى باقي المكتب شغّال
import { adminUserStats } from './adminUsers';
import { pendingVenues } from './bookings';
import { loadVerificationQueue } from './coaching';
import { eventAdminState } from './eventsCore';
import { listLaunchAds } from './launchAds';
import { adState } from './launchAdsCore';
import { listAllEvents } from './localEvents';
import { loadCalorieAlertConfig } from './nutrition';
import type { OfficeSnapshot } from './officeCore';
import { loadBrandRequests, loadReports } from './owner';
import { clubRequestQueue, partnerOverview } from './partners';
import { loadCenterRequests } from './recovery';

const safe = <T,>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

export async function loadOfficeSnapshot(): Promise<OfficeSnapshot> {
  const [ov, clubs, brands, coaches, centers, venues, reports, ads, events, users, kcal] = await Promise.all([
    safe(partnerOverview(), {}),
    safe(clubRequestQueue(), []),
    safe(loadBrandRequests(), []),
    safe(loadVerificationQueue(), []),
    safe(loadCenterRequests(), []),
    safe(pendingVenues(), []),
    safe(loadReports(), []),
    safe(listLaunchAds(), []),
    safe(listAllEvents(), []),
    safe(adminUserStats().then((u) => ({ trainees: u.trainees, new7d: u.new7d })), null),
    safe(loadCalorieAlertConfig(true).then((c) => c.enabled), null),
  ]);
  const pending: OfficeSnapshot['pending'] = {};
  for (const [k, v] of Object.entries(ov)) if (v) pending[k as keyof typeof pending] = v.pending;
  return {
    pending,
    requests: [
      ...clubs.map((c) => ({ kind: 'club' as const, id: c.id, name: c.chain_name || c.gym_name || c.club_name, at: c.created_at })),
      ...brands.filter((b) => b.status === 'pending').map((b) => ({ kind: 'store' as const, id: b.id, name: b.name, at: b.created_at ?? null })),
      ...coaches.map((c) => ({ kind: 'coach' as const, id: c.user_id, name: c.full_name || `@${c.username}`, at: c.submitted_at })),
      ...centers.map((c) => ({ kind: 'center' as const, id: c.id, name: c.name, at: c.created_at ?? null })),
      ...venues.map((v) => ({ kind: 'venue' as const, id: v.id, name: v.name, at: v.created_at })),
    ],
    reports: reports.map((x) => ({ id: x.id, status: x.status, message: x.message, at: x.created_at, updated_at: x.updated_at })),
    ads: ads.map((a) => ({ id: a.id, title: a.title, state: adState(a), at: a.updated_at ?? a.created_at })),
    events: events.map((e) => ({ id: e.id, title: e.title, title_en: e.title_en, state: eventAdminState(e), starts_on: e.starts_on, at: e.updated_at ?? null })),
    users,
    kcalEnabled: kcal,
  };
}
