// سجلي الكامل: كل رياضتي في مكان واحد (تمارين، حضور، إنبدي، صحة، أكل، حصص، برامج) + التقرير الشهري
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { MonthReportCard, Timeline } from '@/components/coaching/Timeline';
import { Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { loadMonthReport, loadTimeline, type MonthReport, type TimelineItem } from '@/lib/coaching';
import { colors, space } from '@/theme';

const monthStart = (offset: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset); return d.toISOString().slice(0, 10); };

export default function MyRecord() {
  const { t } = useTranslation();
  const { userId, profile } = useUser();
  const [tab, setTab] = useState<'record' | 'report'>('record');
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  const [month, setMonth] = useState(0);
  const [report, setReport] = useState<MonthReport | null | undefined>(undefined);
  useFocusEffect(useCallback(() => { loadTimeline(userId).then(setItems).catch(() => setItems([])); }, [userId]));
  const loadReport = (m: number) => { setReport(undefined); loadMonthReport(userId, monthStart(m)).then(setReport).catch(() => setReport(null)); };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('coaching.myRecord') }} />
      <T size="sm" muted>{t('coaching.myRecordHint')}</T>
      <Segmented<'record' | 'report'> value={tab} onChange={(v) => { setTab(v); if (v === 'report' && report === undefined) loadReport(month); }}
        options={[{ value: 'record', label: t('coaching.tab_record') }, { value: 'report', label: t('coaching.tab_report') }]} />
      {tab === 'record' ? (items === null ? <Loading /> : <Timeline items={items} />) : (
        <View style={{ gap: space.sm }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Pressable onPress={() => { setMonth(month - 1); loadReport(month - 1); }} hitSlop={8}><T semibold color={colors.primary}>{t('coaching.prevMonth')}</T></Pressable>
            {month < 0 ? <Pressable onPress={() => { setMonth(month + 1); loadReport(month + 1); }} hitSlop={8}><T semibold color={colors.primary}>{t('coaching.nextMonth')}</T></Pressable> : null}
          </Row>
          {report === undefined ? <Loading /> : <MonthReportCard r={report} name={profile.full_name || profile.username} />}
        </View>
      )}
    </Screen>
  );
}
