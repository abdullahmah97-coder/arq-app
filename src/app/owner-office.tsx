// مكتب أرك أب (للإدارة فقط): أقسام لوحة الإدارة كمكتب ثلاثي الأبعاد — كل قسم مكتب عليه موظف،
// والعلامة البرتقالية = شي ينتظر موافقتك. تحته حالة المهام (تنتظرك، شغّالة، منتهية) وكرت المكتب المختار.
// المرحلة الجاية: وكيل ذكاء اصطناعي لكل مكتب يجهّز الشغل ويرفعه هنا لموافقتك (المكان جاهز في officeCore)
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { I18nManager, Pressable, View } from 'react-native';
import { OfficeStage } from '@/components/office/OfficeStage';
import { Num } from '@/components/pulse/widgets';
import { Button, Card, Empty, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { loadOfficeSnapshot } from '@/lib/office';
import {
  buildTasks, deskDef, deskStates, filterCounts, filterTasks,
  type DeskId, type OfficeRoute, type OfficeSnapshot, type OfficeTask, type TaskFilter, type TaskStatus,
} from '@/lib/officeCore';
import { isAdmin } from '@/lib/owner';
import { brand, colors, radius, space, withAlpha } from '@/theme';

const FILTERS: TaskFilter[] = ['waiting', 'in_progress', 'done', 'all'];

/** فتح قسم: لوحة الإدارة نرجع لها (هي اللي فتحت المكتب) بدل ما نكدّسها مرة ثانية */
function open(route: OfficeRoute) {
  if (route.pathname === '/owner') router.dismissTo('/owner');
  else router.push(route as never);
}

export default function OwnerOffice() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const focused = useIsFocused();
  const [ok, setOk] = useState<boolean | null>(null);
  const [snap, setSnap] = useState<OfficeSnapshot | null>(null);
  const [desk, setDesk] = useState<DeskId | null>(null);
  const [filter, setFilter] = useState<TaskFilter>('waiting');

  // نحدّث كل ما رجعت للمكتب (بعد ما توافق على طلب مثلاً)
  useFocusEffect(useCallback(() => {
    let alive = true;
    isAdmin().then((a) => {
      if (!alive) return;
      setOk(a);
      if (a) loadOfficeSnapshot().then((s) => { if (alive) setSnap(s); }).catch(() => {});
    }).catch(() => { if (alive) setOk(false); });
    return () => { alive = false; };
  }, []));

  const tasks = useMemo(() => (snap ? buildTasks(snap, lng) : []), [snap, lng]);
  const states = useMemo(() => deskStates(tasks), [tasks]);
  const counts = useMemo(() => filterCounts(tasks, desk), [tasks, desk]);
  const shown = useMemo(() => filterTasks(tasks, desk, filter), [tasks, desk, filter]);
  const sign = useCallback((id: DeskId) => t(`office.sign_${id}`), [t]);

  if (ok === null || (ok && !snap)) return <Loading />;
  if (!ok) return <Screen><Empty icon="lock-closed-outline" text={t('owner.noAccess')} /></Screen>;

  const pick = (id: DeskId) => setDesk((cur) => (cur === id ? null : id));
  const st = desk ? states.find((s) => s.id === desk) ?? null : null;

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

      {desk && st ? <DeskCard id={desk} waiting={st.waiting} inProgress={st.inProgress} done={st.done} onClose={() => setDesk(null)} /> : null}

      <Segmented<TaskFilter> wrap value={filter} onChange={setFilter}
        options={FILTERS.map((f) => ({ value: f, label: `${t(`office.filter_${f}`)} ${counts[f] || ''}`.trim() }))} />

      {shown.length ? shown.map((task) => <TaskRow key={task.id} task={task} />)
        : <Empty icon="checkmark-done-outline" text={t(filter === 'waiting' ? 'office.emptyWaiting' : 'office.empty')} />}
    </Screen>
  );
}

const STATUS_COLOR: Record<TaskStatus | 'waiting', string> = {
  waiting: '#F1551D', scheduled: '#5B8DEF', in_progress: '#C9822B', done: '#2E9E6A',
};

function DeskCard({ id, waiting, inProgress, done, onClose }: { id: DeskId; waiting: number; inProgress: number; done: number; onClose: () => void }) {
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

      {/* مكان الوكيل الذكي: يجهّز الشغل ويرفعه لموافقتك (المرحلة الجاية) */}
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', padding: space.md, borderRadius: radius.md,
        borderWidth: 1, borderStyle: 'dashed', borderColor: withAlpha(brand.orange, 0.5), backgroundColor: withAlpha(brand.amber, 0.08) }}>
        <Ionicons name="sparkles" size={18} color={brand.orange} />
        <View style={{ flex: 1, gap: 2 }}>
          <T size="sm" semibold>{t('office.agentTitle')}</T>
          <T size="xs" muted>{t(`office.agent_${id}`)}</T>
        </View>
      </View>
    </Card>
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

function TaskRow({ task }: { task: OfficeTask }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const d = deskDef(task.desk);
  const color = STATUS_COLOR[task.status];
  const when = task.at ? timeAgo(task.at, lng) : '';
  return (
    <Pressable onPress={() => open(task.route)} accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, borderRadius: radius.md,
        borderWidth: 1, borderColor: task.status === 'waiting' ? withAlpha(color, 0.55) : colors.border, padding: space.md, opacity: pressed ? 0.85 : 1 })}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: withAlpha(d.shirt, 0.16), alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={d.icon as never} size={18} color={d.shirt} />
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
