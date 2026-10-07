// مكتب أرك أب: يجمع بيانات أقسام لوحة الإدارة في لقطة وحدة (للإدارة فقط — مفروضة في القاعدة بـ is_admin).
// كل مصدر يتحمّل لحاله: لو تعطّل واحد يبقى باقي المكتب شغّال. ومعها مهام وكلاء الذكاء الاصطناعي (office_tasks)
import { adminUserStats } from './adminUsers';
import { pendingVenues, type Venue } from './bookings';
import type { Brand } from './brands';
import { loadVerificationQueue, type VerifyReq } from './coaching';
import { eventAdminState, type LocalEvent } from './eventsCore';
import { listLaunchAds, type LaunchAdRow } from './launchAds';
import { adState } from './launchAdsCore';
import { listAllEvents } from './localEvents';
import { loadCalorieAlertConfig } from './nutrition';
import { loadAgentTasks } from './officeAgents';
import type { AgentTaskRow } from './officeAgentsCore';
import type { AgentTaskLite, OfficeSnapshot } from './officeCore';
import { loadBrandRequests, loadReports, type Report } from './owner';
import { clubRequestQueue, partnerOverview, type ClubQueueItem } from './partners';
import { loadCenterRequests, type RecoveryCenter } from './recovery';

const safe = <T,>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

type Raw = {
  ov: Awaited<ReturnType<typeof partnerOverview>>;
  clubs?: ClubQueueItem[]; brands?: Brand[]; coaches?: VerifyReq[]; centers?: RecoveryCenter[]; venues?: Venue[];
  reports: Report[]; ads: LaunchAdRow[] | null; events: LocalEvent[] | null;
  users?: OfficeSnapshot['users']; kcalEnabled: boolean | null;
  /** مهام الوكلاء (null = ما انحمّلت) */
  agentTasks?: AgentTaskLite[] | null;
};

/** من بيانات الأقسام لِلقطة المكتب (تستخدمها لوحة الإدارة بعد عشان رقم رابط المكتب يطابق المكتب) */
export function snapshotFrom(d: Raw): OfficeSnapshot {
  const pending: OfficeSnapshot['pending'] = {};
  for (const [k, v] of Object.entries(d.ov)) if (v) pending[k as keyof typeof pending] = v.pending;
  return {
    pending,
    requests: [
      ...(d.clubs ?? []).map((c) => ({ kind: 'club' as const, id: c.id, name: c.chain_name || c.gym_name || c.club_name, at: c.created_at })),
      ...(d.brands ?? []).filter((b) => b.status === 'pending').map((b) => ({ kind: 'store' as const, id: b.id, name: b.name, at: b.created_at ?? null })),
      ...(d.coaches ?? []).map((c) => ({ kind: 'coach' as const, id: c.user_id, name: c.full_name || `@${c.username}`, at: c.submitted_at })),
      ...(d.centers ?? []).map((c) => ({ kind: 'center' as const, id: c.id, name: c.name, at: c.created_at ?? null })),
      ...(d.venues ?? []).map((v) => ({ kind: 'venue' as const, id: v.id, name: v.name, at: v.created_at })),
    ],
    reports: d.reports.map((x) => ({ id: x.id, status: x.status, message: x.message, at: x.created_at, updated_at: x.updated_at })),
    ads: d.ads?.map((a) => ({ id: a.id, title: a.title, state: adState(a), at: a.updated_at ?? a.created_at })) ?? null,
    events: d.events?.map((e) => ({ id: e.id, title: e.title, title_en: e.title_en, state: eventAdminState(e), starts_on: e.starts_on, at: e.updated_at ?? null })) ?? null,
    users: d.users ?? null,
    kcalEnabled: d.kcalEnabled,
    agentTasks: d.agentTasks ?? null,
  };
}

/** اللقطة كاملة، ومعها صفوف مهام الوكلاء كاملة (ورقة الموافقة تحتاج الاقتراح والمدخلات) */
export async function loadOffice(): Promise<{ snap: OfficeSnapshot; agents: AgentTaskRow[] | null }> {
  const [ov, clubs, brands, coaches, centers, venues, reports, ads, events, users, kcalEnabled, agentTasks] = await Promise.all([
    safe(partnerOverview(), {}),
    safe(clubRequestQueue(), []),
    safe(loadBrandRequests(), []),
    safe(loadVerificationQueue(), []),
    safe(loadCenterRequests(), []),
    safe(pendingVenues(), []),
    safe(loadReports(), []),
    // null لو فشلت: ما نطلع تنبيه "ما فيه إعلان/فعالية" بسبب خطأ شبكة
    safe<LaunchAdRow[] | null>(listLaunchAds(), null),
    safe<LocalEvent[] | null>(listAllEvents(), null),
    safe(adminUserStats().then((u) => ({ trainees: u.trainees, new7d: u.new7d })), null),
    safe(loadCalorieAlertConfig(true).then((c) => c.enabled), null),
    safe<AgentTaskRow[] | null>(loadAgentTasks(), null),
  ]);
  return { snap: snapshotFrom({ ov, clubs, brands, coaches, centers, venues, reports, ads, events, users, kcalEnabled, agentTasks }), agents: agentTasks };
}

export const loadOfficeSnapshot = async (): Promise<OfficeSnapshot> => (await loadOffice()).snap;

/** طلبات الشركاء المعلّقة كقوائم (لوحة الإدارة تحتاجها عشان رقم رابط المكتب يطابق المكتب بالضبط مع مهام الوكلاء) */
export async function loadRequestLists(): Promise<Pick<Raw, 'clubs' | 'coaches' | 'centers' | 'venues'>> {
  const [clubs, coaches, centers, venues] = await Promise.all([
    safe(clubRequestQueue(), []), safe(loadVerificationQueue(), []), safe(loadCenterRequests(), []), safe(pendingVenues(), []),
  ]);
  return { clubs, coaches, centers, venues };
}
