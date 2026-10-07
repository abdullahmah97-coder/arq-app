// مكتب أرك أب (للإدارة فقط): أقسام لوحة الإدارة كمكتب ثلاثي الأبعاد — كل قسم مكتب عليه موظف،
// والعلامة البرتقالية = شي ينتظر موافقتك. تحته حالة المهام (تنتظرك، شغّالة، منتهية) وكرت المكتب المختار.
// كل مكتب (غير المتدربين للحين) عليه وكيل ذكاء اصطناعي: «شغّل الوكيل» يجهّز الشغل ويرفعه هنا لموافقتك،
// ومهامه عليها علامة ✨ وتنفتح في ورقة توافق فيها أو ترفض (ما يتغيّر شي بالتطبيق إلا بموافقتك)
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useIsFocused, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, I18nManager, Pressable, View } from 'react-native';
import { AgentTaskSheet } from '@/components/office/AgentTaskSheet';
import { OfficeStage } from '@/components/office/OfficeStage';
import { Num } from '@/components/pulse/widgets';
import { Button, Card, Empty, Input, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { loadOffice } from '@/lib/office';
import { fetchAgentTasks, runDeskAgent, type RunOutcome } from '@/lib/officeAgents';
import { agentStale, hasAgent, isWorking, runLine, type AgentTaskRow } from '@/lib/officeAgentsCore';
import {
  agentRoute, buildTasks, deskDef, deskStates, filterCounts, filterTasks,
  type DeskId, type OfficeRoute, type OfficeSnapshot, type OfficeTask, type TaskFilter, type TaskStatus,
} from '@/lib/officeCore';
import { isAdmin } from '@/lib/owner';
import { brand, colors, radius, space, withAlpha } from '@/theme';

const FILTERS: TaskFilter[] = ['waiting', 'in_progress', 'done', 'all'];
/** كل كم نحدّث مهام الوكلاء وهم يشتغلون */
const POLL_MS = 4000;

/** تشغيل وكيل مكتب: شغّال الحين، أو نتيجة آخر تشغيلة */
type DeskRun = { busy: true } | { busy: false; res: RunOutcome };

/** فتح قسم: لوحة الإدارة نرجع لها (هي اللي فتحت المكتب) بدل ما نكدّسها مرة ثانية */
function open(route: OfficeRoute) {
  if (route.pathname === '/owner') router.dismissTo('/owner');
  else router.push(route as never);
}

export default function OwnerOffice() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const focused = useIsFocused();
  const navigation = useNavigation();
  const [ok, setOk] = useState<boolean | null>(null);
  const [snap, setSnap] = useState<OfficeSnapshot | null>(null);
  const [agents, setAgents] = useState<AgentTaskRow[] | null>(null);
  const [desk, setDesk] = useState<DeskId | null>(null);
  const [filter, setFilter] = useState<TaskFilter>('waiting');
  const [runs, setRuns] = useState<Partial<Record<DeskId, DeskRun>>>({});
  const [sheet, setSheet] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const reload = useCallback(() => loadOffice().then((o) => {
    if (!mounted.current) return;
    setSnap(o.snap);
    setAgents(o.agents);
  }), []);

  // نحدّث كل ما رجعت للمكتب (بعد ما توافق على طلب مثلاً)
  useFocusEffect(useCallback(() => {
    let alive = true;
    isAdmin().then((a) => {
      if (!alive) return;
      setOk(a);
      if (a) reload().catch(() => {});
    }).catch(() => { if (alive) setOk(false); });
    return () => { alive = false; };
  }, [reload]));

  // الوكلاء يشتغلون: نحدّث مهامهم كل ٤ ثواني لين يخلصون (والشاشة قدامك)
  const anyRun = Object.values(runs).some((r) => r?.busy);
  // مهمة «شغّالة» من زمان وقفت (نفس قاعدة المكتب AGENT_STALE_MS: تنعرض ما كمّلت) — ما نستنى عليها
  const working = useMemo(() => (agents ?? []).some((a) => isWorking(a.status) && !agentStale(a, Date.now())), [agents]);
  useEffect(() => {
    if (!focused || (!anyRun && !working)) return;
    const h = setInterval(() => {
      fetchAgentTasks().then((rows) => { if (mounted.current) setAgents(rows); }).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(h);
  }, [focused, anyRun, working]);

  const runAgent = useCallback(async (id: DeskId, brief?: string) => {
    setRuns((r) => ({ ...r, [id]: { busy: true } }));
    const res = await runDeskAgent(id, brief);
    if (!mounted.current) return;
    setRuns((r) => ({ ...r, [id]: { busy: false, res } }));
    const rows = await fetchAgentTasks().catch(() => null);
    if (!mounted.current) return;
    if (rows) setAgents(rows);
    if ('error' in res) {
      // running = الدالة للحين تشتغل بالخلفية (سطر النتيجة يقول كذا)، غيره نقوله لك
      if (res.error !== 'running') Alert.alert(t(`office.err_${res.error}`));
      return;
    }
    // ملخص اليوم جاهز: نفتحه لك على طول — بس لو المكتب قدامك الحين (مو شاشة ثانية فوقه) وما فيه ورقة مفتوحة
    // (ما نستبدل مهمة تشتغل عليها). وإلا يبقى في القائمة. isFocused تقرا الحالة الحين مو وقت ما بدأ التشغيل
    if (id === 'lead' && res.done) {
      const daily = rows?.find((a) => a.kind === 'daily_brief' && a.status === 'done');
      if (daily && navigation.isFocused()) setSheet((cur) => cur ?? daily.id);
    }
  }, [t, navigation]);

  const full = useMemo(() => (snap ? { ...snap, agentTasks: agents ?? snap.agentTasks } : null), [snap, agents]);
  const tasks = useMemo(() => (full ? buildTasks(full, lng) : []), [full, lng]);
  const states = useMemo(() => deskStates(tasks), [tasks]);
  const counts = useMemo(() => filterCounts(tasks, desk), [tasks, desk]);
  const shown = useMemo(() => filterTasks(tasks, desk, filter), [tasks, desk, filter]);
  const sign = useCallback((id: DeskId) => t(`office.sign_${id}`), [t]);

  if (ok === null || (ok && !snap)) return <Loading />;
  if (!ok) return <Screen><Empty icon="lock-closed-outline" text={t('owner.noAccess')} /></Screen>;

  const pick = (id: DeskId) => setDesk((cur) => (cur === id ? null : id));
  const st = desk ? states.find((s) => s.id === desk) ?? null : null;
  const sheetTask = sheet ? agents?.find((a) => a.id === sheet) ?? null : null;

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('office.title') }} />
      <T size="sm" muted>{t('office.intro')}</T>

      <OfficeStage states={states} selected={desk} onPick={pick} label={sign} paused={!focused} />

      {/* ملخص المهام: الضغط على أي رقم يفلتر القائمة */}
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {(['waiting', 'in_progress', 'done'] as const).map((f) => (
          <Pressable key={f} onPress={() => setFilter(f)} accessibilityRole="button" accessibilityState={{ selected: filter === f }}
            style={{ flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, padding: space.md, gap: 2,
              borderColor: filter === f ? STATUS_COLOR[f] : colors.border }}>
            <Num size={26} color={STATUS_COLOR[f]}>{counts[f]}</Num>
            <T size="xs" muted numberOfLines={2}>{t(`office.stat_${f}`)}</T>
          </Pressable>
        ))}
      </View>

      {desk && st ? (
        <DeskCard id={desk} waiting={st.waiting} inProgress={st.inProgress} done={st.done} onClose={() => setDesk(null)}
          run={runs[desk]} onRun={(brief) => { void runAgent(desk, brief); }} />
      ) : null}

      <Segmented<TaskFilter> wrap value={filter} onChange={setFilter}
        options={FILTERS.map((f) => ({ value: f, label: `${t(`office.filter_${f}`)} ${counts[f] || ''}`.trim() }))} />

      {shown.length ? shown.map((task) => (
        <TaskRow key={task.id} task={task} onPress={() => (task.agentTaskId ? setSheet(task.agentTaskId) : open(task.route))} />
      )) : <Empty icon="checkmark-done-outline" text={t(filter === 'waiting' ? 'office.emptyWaiting' : 'office.empty')} />}

      {/* key: مهمة ثانية = ورقة جديدة (المسودة والرفض ما ينتقلون من مهمة لثانية) */}
      {sheetTask ? (
        <AgentTaskSheet key={sheetTask.id} task={sheetTask} route={agentRoute(sheetTask)} onClose={() => setSheet(null)}
          onChanged={() => { reload().catch(() => {}); }} onOpen={open} onPickDesk={(id) => { setDesk(id); setFilter('waiting'); }} />
      ) : null}
    </Screen>
  );
}

const STATUS_COLOR: Record<TaskStatus | 'waiting', string> = {
  waiting: '#F1551D', scheduled: '#5B8DEF', in_progress: '#C9822B', done: '#2E9E6A',
};

function DeskCard({ id, waiting, inProgress, done, onClose, run, onRun }: {
  id: DeskId; waiting: number; inProgress: number; done: number; onClose: () => void; run: DeskRun | undefined; onRun: (brief?: string) => void;
}) {
  const { t } = useTranslation();
  const d = deskDef(id);
  return (
    <Card style={{ gap: space.md, borderColor: d.shirt }}>
      <Row gap={space.md}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: d.shirt, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={d.icon as never} size={22} color={brand.cream} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T bold>{t(`office.desk_${id}`)}</T>
          <T size="xs" muted>{t(`office.role_${id}`)}</T>
        </View>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('office.allDesks')}>
          <Ionicons name="close" size={20} color={colors.muted} />
        </Pressable>
      </Row>

      <Row gap={space.lg}>
        <Count n={waiting} label={t('office.stat_waiting')} color={STATUS_COLOR.waiting} />
        <Count n={inProgress} label={t('office.stat_in_progress')} color={STATUS_COLOR.in_progress} />
        <Count n={done} label={t('office.stat_done')} color={STATUS_COLOR.done} />
      </Row>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {d.links.map((l) => (
          <View key={l.key} style={{ flexGrow: 1, minWidth: '45%' }}>
            <Button small variant={l === d.links[0] ? 'dark' : 'secondary'} title={t(`office.link_${l.key}`)} onPress={() => open(l.route)} />
          </View>
        ))}
      </View>

      {/* الوكيل الذكي: يجهّز الشغل ويرفعه لموافقتك (مكتب المتدربين للحين «قريباً») */}
      {hasAgent(id) ? <AgentBox key={id} id={id} run={run} onRun={onRun} /> : (
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', padding: space.md, borderRadius: radius.md,
          borderWidth: 1, borderStyle: 'dashed', borderColor: withAlpha(brand.orange, 0.5), backgroundColor: withAlpha(brand.amber, 0.08) }}>
          <Ionicons name="sparkles" size={18} color={brand.orange} />
          <View style={{ flex: 1, gap: 2 }}>
            <T size="sm" semibold>{t('office.agentTitle')}</T>
            <T size="xs" muted>{t(`office.agent_${id}`)}</T>
          </View>
        </View>
      )}
    </Card>
  );
}

/** صندوق الوكيل في كرت المكتب: وش يسوي، زر التشغيل (ولوكيل التسويق فكرة اختيارية)، وهو يشتغل، ونتيجة آخر تشغيلة */
function AgentBox({ id, run, onRun }: { id: DeskId; run: DeskRun | undefined; onRun: (brief?: string) => void }) {
  const { t } = useTranslation();
  const [brief, setBrief] = useState('');
  const busy = !!run?.busy;
  const res = run && !run.busy ? run.res : null;
  const line = !res ? null
    : 'error' in res ? (res.error === 'running' ? t('office.err_running') : null)
    : runLine(res).map((p) => t(`office.${p.key}`, { n: p.n })).join(' · ') || t('office.run_nothing');
  return (
    <View style={{ gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1,
      borderColor: withAlpha(brand.orange, 0.5), backgroundColor: withAlpha(brand.amber, 0.08) }}>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
        <Ionicons name="sparkles" size={18} color={brand.orange} />
        <View style={{ flex: 1, gap: 2 }}>
          <T size="sm" semibold>{t('office.agentLive')}</T>
          <T size="xs" muted>{t(`office.agent_${id}`)}</T>
        </View>
      </View>
      {id === 'marketing' ? (
        <Input value={brief} onChangeText={setBrief} placeholder={t('office.agentBriefPh')} maxLength={300} editable={!busy} />
      ) : null}
      <Button small variant="dark" icon="sparkles-outline" title={t('office.agentRun')} loading={busy} disabled={busy}
        onPress={() => onRun(id === 'marketing' ? brief : undefined)} />
      {busy ? (
        <Row gap={space.sm}>
          <ActivityIndicator size="small" color={brand.orange} />
          <T size="xs" muted style={{ flex: 1 }}>{t('office.agentRunning')}</T>
        </Row>
      ) : line ? <T size="xs" semibold>{line}</T> : null}
    </View>
  );
}

function Count({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Num size={22} color={color}>{n}</Num>
      <T size="xs" muted>{label}</T>
    </View>
  );
}

function TaskRow({ task, onPress }: { task: OfficeTask; onPress: () => void }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const d = deskDef(task.desk);
  const color = STATUS_COLOR[task.status];
  const when = task.at ? timeAgo(task.at, lng) : '';
  const ai = task.agent === 'claude';
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityHint={ai ? t('office.agentBadge') : undefined}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, borderRadius: radius.md,
        borderWidth: 1, borderColor: task.status === 'waiting' ? withAlpha(color, 0.55) : colors.border, padding: space.md, opacity: pressed ? 0.85 : 1 })}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: withAlpha(d.shirt, 0.16), alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={d.icon as never} size={18} color={d.shirt} />
        {/* علامة ✨: هالمهمة جهّزها الوكيل الذكي */}
        {ai ? (
          <View style={{ position: 'absolute', bottom: -3, end: -3, width: 18, height: 18, borderRadius: 9, backgroundColor: brand.orange,
            borderWidth: 2, borderColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="sparkles" size={9} color={brand.cream} />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T size="sm" semibold numberOfLines={1}>{t(`office.kind_${task.kind}`, { n: task.n ?? 0 })}</T>
        {task.name ? <T size="xs" numberOfLines={2}>{task.name}</T> : null}
        <T size="xs" muted numberOfLines={1}>{[t(`office.sign_${task.desk}`), when].filter(Boolean).join(' · ')}</T>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: withAlpha(color, 0.14) }}>
          <T size="xs" semibold color={color}>{t(`office.st_${task.status}`)}</T>
        </View>
        <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={16} color={colors.muted} />
      </View>
    </Pressable>
  );
}
