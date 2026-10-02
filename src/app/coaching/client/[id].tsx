// المتدرب عند مدربه: السجل (حسب صلاحياته)، التقرير الشهري، البرنامج، الحصص، والملاحظات الخاصة
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { Chip } from '@/components/coaching/parts';
import { MonthReportCard, Timeline } from '@/components/coaching/Timeline';
import { Button, Card, Empty, Input, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { addNote, assignProgram, bookSession, deleteNote, endLink, fmtRiyadh, loadCoachClients, loadMonthReport, loadMyPrograms, loadNotes, loadSessions,
  loadTimeline, parseRiyadh, setSessionStatus, type CoachClient, type CoachNote, type CoachSession, type MonthReport, type MyProgram, type TimelineItem } from '@/lib/coaching';
import { monthStartIso as monthStart } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { goBackOrHome } from '@/lib/nav';
import { errorKey } from '@/lib/supabase';
import { colors, radius, space } from '@/theme';

type Tab = 'record' | 'report' | 'program' | 'sessions' | 'notes';

export default function ClientRecord() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId } = useUser();
  const [c, setC] = useState<CoachClient | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('record');
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  const [month, setMonth] = useState(0);
  const [report, setReport] = useState<MonthReport | null | undefined>(undefined);
  const [notes, setNotes] = useState<CoachNote[]>([]);
  const [note, setNote] = useState('');
  const [sessions, setSessions] = useState<CoachSession[]>([]);
  const [progs, setProgs] = useState<MyProgram[]>([]);
  const [pf, setPf] = useState({ title: '', program_id: null as string | null, days: 3, weeks: '4', notes: '' });
  const [sf, setSf] = useState({ when: '', minutes: '60', place: '' });

  const load = useCallback(() => {
    loadCoachClients().then((l) => setC(l.find((x) => x.client_id === id && x.status === 'active') ?? null)).catch(() => setC(null));
    loadTimeline(String(id)).then(setItems).catch(() => setItems([]));
    loadNotes(String(id)).then(setNotes).catch(() => {});
    loadSessions({ clientId: String(id), coachId: userId }).then(setSessions).catch(() => {});
    loadMyPrograms(userId).then(setProgs).catch(() => {});
  }, [id, userId]);
  useFocusEffect(load);
  const loadReport = useCallback((m: number) => { setReport(undefined); loadMonthReport(String(id), monthStart(m)).then(setReport).catch(() => setReport(null)); }, [id]);

  if (c === undefined) return <Loading />;
  if (!c) return <Screen><Empty icon="lock-closed-outline" text={t('coaching.noAccess')} /></Screen>;
  const name = c.full_name || c.username;

  const saveProgram = async () => {
    if (pf.title.trim().length < 2) return Alert.alert(t('coaching.err_program'));
    try { await assignProgram(c.client_id, { title: pf.title, program_id: pf.program_id, days_per_week: pf.days, weeks: Number(pf.weeks) || 4, notes: pf.notes }); Alert.alert(t('coaching.programAssigned')); load(); }
    catch (e) { Alert.alert(t(errorKey(e))); }
  };
  const book = async () => {
    const d = parseRiyadh(sf.when);
    if (!d || d.getTime() < Date.now() - 86400000) return Alert.alert(t('coaching.err_when'));
    try { await bookSession(c.client_id, d, Number(sf.minutes) || 60, sf.place); setSf({ when: '', minutes: '60', place: '' }); load(); }
    catch (e) { Alert.alert(t(errorKey(e))); }
  };
  const end = () => Alert.alert(t('coaching.endTitle'), t('coaching.endBody', { name }), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('coaching.end'), style: 'destructive', onPress: async () => { await endLink(c.link_id); goBackOrHome(); } },
  ]);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: name }} />
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        <T size="xs" muted>{t('coaching.canSee')}:</T>
        {c.scopes.length ? c.scopes.map((s) => <Chip key={s} label={t(`coaching.scope_${s}`)} />) : <T size="xs" muted>{t('coaching.basicOnly')}</T>}
      </Row>
      <Segmented<Tab> wrap value={tab} onChange={(v) => { setTab(v); if (v === 'report' && report === undefined) loadReport(month); }}
        options={(['record', 'report', 'program', 'sessions', 'notes'] as Tab[]).map((v) => ({ value: v, label: t(`coaching.tab_${v}`) }))} />

      {tab === 'record' ? (items === null ? <Loading /> : <Timeline items={items} />) : null}

      {tab === 'report' ? (
        <View style={{ gap: space.sm }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Pressable onPress={() => { setMonth(month - 1); loadReport(month - 1); }} hitSlop={8}><T semibold color={colors.primary}>{t('coaching.prevMonth')}</T></Pressable>
            {month < 0 ? <Pressable onPress={() => { setMonth(month + 1); loadReport(month + 1); }} hitSlop={8}><T semibold color={colors.primary}>{t('coaching.nextMonth')}</T></Pressable> : null}
          </Row>
          {report === undefined ? <Loading /> : <MonthReportCard r={report} name={name} />}
        </View>
      ) : null}

      {tab === 'program' ? (
        <Card style={{ gap: space.sm }}>
          <T semibold>{c.program ? t('coaching.currentProgram', { title: c.program }) : t('coaching.noProgram')}</T>
          {progs.length ? (
            <View style={{ gap: 6 }}>
              <T size="xs" muted>{t('coaching.fromMyPrograms')}</T>
              <Row gap={6} style={{ flexWrap: 'wrap' }}>
                {progs.map((p) => <Chip key={p.id} label={p.title} on={pf.program_id === p.id} onPress={() => setPf({ ...pf, program_id: pf.program_id === p.id ? null : p.id, title: p.title })} />)}
              </Row>
            </View>
          ) : <Pressable onPress={() => router.push('/program/new')}><T size="xs" color={colors.primary}>{t('coaching.createProgramFirst')}</T></Pressable>}
          <Input label={t('coaching.programTitle')} value={pf.title} onChangeText={(v) => setPf({ ...pf, title: v })} maxLength={80} placeholder={t('coaching.programTitlePh')} />
          <T size="xs" semibold>{t('coaching.daysPerWeek')}</T>
          <Segmented<number> wrap value={pf.days} onChange={(v) => setPf({ ...pf, days: v })} options={[2, 3, 4, 5, 6].map((d) => ({ value: d, label: String(d) }))} />
          <Input label={t('coaching.weeks')} value={pf.weeks} onChangeText={(v) => setPf({ ...pf, weeks: v })} keyboardType="number-pad" />
          <Input label={t('coaching.programNotes')} value={pf.notes} onChangeText={(v) => setPf({ ...pf, notes: v })} maxLength={600} multiline />
          <Button icon="checkmark" title={t('coaching.assign')} onPress={saveProgram} />
          <T size="xs" muted>{t('coaching.assignHint')}</T>
        </Card>
      ) : null}

      {tab === 'sessions' ? (
        <View style={{ gap: space.sm }}>
          <Card style={{ gap: space.sm }}>
            <T semibold>{t('coaching.bookSession')}</T>
            <Input label={t('coaching.when')} value={sf.when} onChangeText={(v) => setSf({ ...sf, when: v })} placeholder="2026-10-05 18:00" autoCapitalize="none" />
            <Row gap={space.sm}>
              <View style={{ flex: 1 }}><Input label={t('coaching.minutes')} value={sf.minutes} onChangeText={(v) => setSf({ ...sf, minutes: v })} keyboardType="number-pad" /></View>
              <View style={{ flex: 2 }}><Input label={t('coaching.place')} value={sf.place} onChangeText={(v) => setSf({ ...sf, place: v })} maxLength={80} /></View>
            </Row>
            <Button icon="calendar-outline" title={t('coaching.book')} onPress={book} />
          </Card>
          {sessions.length ? sessions.map((s) => (
            <Card key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Ionicons name={s.status === 'done' ? 'checkmark-circle' : s.status === 'booked' ? 'time-outline' : 'close-circle-outline'} size={20}
                color={s.status === 'done' ? colors.success : s.status === 'booked' ? colors.primary : colors.muted} />
              <View style={{ flex: 1 }}>
                <T size="sm" semibold>{fmtRiyadh(s.starts_at, lng)}</T>
                <T size="xs" muted>{t(`coaching.st_${s.status}`)} · {t('gymops.minutesN', { count: s.duration_min })}{s.place ? ` · ${s.place}` : ''}</T>
              </View>
              {s.status === 'booked' ? (
                <Row gap={space.sm}>
                  <Pressable hitSlop={6} onPress={() => setSessionStatus(s.id, 'done').then(load)}><T size="xs" semibold color={colors.success}>{t('coaching.st_done')}</T></Pressable>
                  <Pressable hitSlop={6} onPress={() => setSessionStatus(s.id, 'cancelled').then(load)}><T size="xs" color={colors.muted}>{t('common.cancel')}</T></Pressable>
                </Row>
              ) : null}
            </Card>
          )) : <Empty icon="calendar-outline" text={t('coaching.noSessions')} />}
        </View>
      ) : null}

      {tab === 'notes' ? (
        <View style={{ gap: space.sm }}>
          <Card style={{ gap: space.sm }}>
            <Input value={note} onChangeText={setNote} maxLength={1000} multiline placeholder={t('coaching.notePh')} />
            <Button small icon="add" title={t('coaching.addNote')} onPress={async () => { if (!note.trim()) return; try { await addNote(c.client_id, note); setNote(''); load(); } catch (e) { Alert.alert(t(errorKey(e))); } }} />
            <T size="xs" muted>{t('coaching.notesPrivate')}</T>
          </Card>
          {notes.map((n) => (
            <View key={n.id} style={{ padding: space.md, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, gap: 4 }}>
              <T size="sm" style={{ lineHeight: 22 }}>{n.body}</T>
              <Row style={{ justifyContent: 'space-between' }}>
                <T size="xs" muted>{fmtRiyadh(n.created_at, lng)}</T>
                <Pressable hitSlop={6} onPress={() => deleteNote(n.id).then(load)}><T size="xs" color={colors.danger}>{t('common.delete')}</T></Pressable>
              </Row>
            </View>
          ))}
        </View>
      ) : null}

      <Row gap={space.sm}>
        <Button style={{ flex: 1 }} variant="secondary" icon="chatbubble-ellipses-outline" title={t('coaching.message')} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.client_id } })} />
        <Button variant="ghost" title={t('coaching.end')} onPress={end} />
      </Row>
    </Screen>
  );
}
