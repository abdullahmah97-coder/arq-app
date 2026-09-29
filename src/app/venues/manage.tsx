// لوحة الملعب أو الاستوديو: الحجوزات (تأكيد، اعتذار، إلغاء بسبب، حضر، ما حضر)، الملاعب، والحصص الأسبوعية
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Switch, View } from 'react-native';
import { BookingStatusPill, SportIcon } from '@/components/bookings/parts';
import { StatusPill } from '@/components/partners/parts';
import { Avatar, Button, Card, Empty, Input, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import {
  CLASS_SPORTS, clockLabel, COURT_SPORTS, deleteCourt, deleteVenueClass, loadCourts, loadMyVenue, loadVenueClasses, respondBooking, riyadhMinute,
  saveCourt, saveVenueClass, venueBookingList, weekdayName, whenLabel,
  type ClassInput, type Court, type Sport, type Venue, type VenueAction, type VenueBooking, type VenueClass,
} from '@/lib/bookings';
import { useLocalized } from '@/lib/i18n';
import { errorKey, publicUrl } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

type Tab = 'bookings' | 'courts' | 'classes';
const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

export default function VenueManage() {
  const { t } = useTranslation();
  const { userId } = useUser();
  const [v, setV] = useState<Venue | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('bookings');
  const load = useCallback(() => { loadMyVenue(userId).then(setV).catch(() => setV(null)); }, [userId]);
  useFocusEffect(load);

  if (v === undefined) return <Loading />;
  if (!v) return (
    <Screen>
      <Empty icon="calendar-outline" text={t('venue.noVenue')} />
      <Button icon="add" title={t('venue.joinTitle')} onPress={() => router.replace('/venues/join')} />
    </Screen>
  );

  const courts = v.sports.some((s) => COURT_SPORTS.includes(s));
  const classes = v.sports.some((s) => CLASS_SPORTS.includes(s));
  const tabs: Tab[] = ['bookings', ...(courts ? ['courts' as const] : []), ...(classes ? ['classes' as const] : [])];

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('venue.dashboard') }} />
      <Card style={{ gap: 6 }}>
        <Row><T bold style={{ flex: 1 }}>{v.name}</T><StatusPill status={v.status} label={t(`venue.st_${v.status}`)} /></Row>
        {v.status !== 'approved' ? <T size="xs" muted style={{ lineHeight: 19 }}>{t(`venue.stBody_${v.status}`)}</T> : null}
        <Row gap={space.sm}>
          <Button small style={{ flex: 1 }} variant="secondary" icon="create-outline" title={t('venue.editTitle')} onPress={() => router.push('/venues/join')} />
          {v.status === 'approved' ? <Button small style={{ flex: 1 }} variant="secondary" icon="eye-outline" title={t('venue.viewPage')} onPress={() => router.push({ pathname: '/book/[id]', params: { id: v.id } })} /> : null}
        </Row>
      </Card>
      {tabs.length > 1 ? <Segmented<Tab> value={tab} onChange={setTab} options={tabs.map((x) => ({ value: x, label: t(`venue.tab_${x}`) }))} /> : null}
      {tab === 'bookings' ? <BookingsTab v={v} /> : tab === 'courts' ? <CourtsTab v={v} /> : <ClassesTab v={v} />}
    </Screen>
  );
}

// ---------- الحجوزات ----------
function BookingsTab({ v }: { v: Venue }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [rows, setRows] = useState<VenueBooking[] | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const load = useCallback(() => { setNow(Date.now()); venueBookingList(v.id).then(setRows).catch(() => setRows([])); }, [v.id]);
  useFocusEffect(load);

  const act = async (b: VenueBooking, a: VenueAction, note?: string) => {
    setBusy(b.id + a);
    try { await respondBooking(b.id, a, note); setCancelling(null); setReason(''); load(); } catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(null); }
  };

  if (!rows) return <Loading />;
  if (!rows.length) return <Empty icon="calendar-outline" text={t('venue.noBookings')} />;
  const pending = rows.filter((b) => b.status === 'pending').length;
  return (
    <View style={{ gap: space.sm }}>
      {pending ? <T semibold color={brand.orange}>{t('venue.pendingCount', { count: pending, n: pending })}</T> : null}
      {rows.map((b) => {
        const future = Date.parse(b.starts_at) > now;
        return (
          <Card key={b.id} style={{ gap: space.sm }}>
            <Row style={{ alignItems: 'flex-start' }} gap={space.md}>
              <Avatar uri={publicUrl('avatars', b.avatar_url)} name={b.full_name ?? b.username} size={38} />
              <View style={{ flex: 1, gap: 2 }}>
                <T semibold numberOfLines={1}>{b.full_name || `@${b.username}`}</T>
                <Row gap={4}><SportIcon sport={b.sport} size={13} color={colors.primary} /><T size="sm">{b.label}</T></Row>
                <T size="sm" semibold color={colors.primary}>{whenLabel(b.starts_at, lng)} – {clockLabel(riyadhMinute(b.ends_at), lng)}</T>
                {b.note ? <T size="xs" muted>«{b.note}»</T> : null}
              </View>
              <BookingStatusPill status={b.status} />
            </Row>
            {b.status === 'pending' && future ? (
              <Row gap={space.sm}>
                <Button small style={{ flex: 1 }} icon="checkmark" title={t('venue.confirm')} loading={busy === b.id + 'confirm'} onPress={() => act(b, 'confirm')} />
                <Button small style={{ flex: 1 }} variant="secondary" icon="close" title={t('venue.decline')} loading={busy === b.id + 'decline'} onPress={() => act(b, 'decline')} />
              </Row>
            ) : b.status === 'confirmed' && !future ? (
              <Row gap={space.sm}>
                <Button small style={{ flex: 1 }} variant="secondary" icon="checkmark-done" title={t('venue.done')} onPress={() => act(b, 'done')} />
                <Button small style={{ flex: 1 }} variant="secondary" icon="person-remove-outline" title={t('venue.noShow')} onPress={() => act(b, 'no_show')} />
              </Row>
            ) : b.status === 'confirmed' && future ? (
              cancelling === b.id ? (
                <View style={{ gap: 6 }}>
                  <Input value={reason} onChangeText={setReason} maxLength={200} placeholder={t('venue.cancelReason')} />
                  <Row gap={space.sm}>
                    <View style={{ flex: 1 }}><Button small variant="danger" title={t('venue.cancelSend')} loading={busy === b.id + 'cancel'} onPress={() => (reason.trim() ? act(b, 'cancel', reason) : Alert.alert(t('srv.note_required')))} /></View>
                    <Button small variant="ghost" title={t('common.back')} onPress={() => setCancelling(null)} />
                  </Row>
                </View>
              ) : <Pressable onPress={() => { setCancelling(b.id); setReason(''); }} style={{ alignSelf: 'flex-start' }}><T size="xs" semibold color={colors.muted}>{t('venue.cancelBooking')}</T></Pressable>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

// ---------- الملاعب ----------
function CourtsTab({ v }: { v: Venue }) {
  const { t } = useTranslation();
  const sports = v.sports.filter((s) => COURT_SPORTS.includes(s));
  const [rows, setRows] = useState<Court[] | null>(null);
  const [name, setName] = useState('');
  const [sport, setSport] = useState<Sport>(sports[0]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { loadCourts(v.id, true).then(setRows).catch(() => setRows([])); }, [v.id]);
  useFocusEffect(load);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try { await saveCourt({ venue_id: v.id, sport, name, sort: (rows?.length ?? 0) + 1 }); setName(''); load(); } catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };
  const toggle = async (c: Court, active: boolean) => {
    setRows((cur) => cur?.map((x) => (x.id === c.id ? { ...x, active } : x)) ?? null);
    try { await saveCourt({ venue_id: v.id, sport: c.sport, name: c.name, active }, c.id); } catch { load(); }
  };
  const remove = (c: Court) => Alert.alert(t('venue.deleteCourt'), c.name, [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.delete'), style: 'destructive', onPress: async () => { try { await deleteCourt(c.id); load(); } catch (e) { Alert.alert(t(errorKey(e))); } } },
  ]);

  if (!rows) return <Loading />;
  return (
    <View style={{ gap: space.sm }}>
      <T size="xs" muted style={{ lineHeight: 19 }}>{t('venue.courtsHint')}</T>
      {rows.map((c) => (
        <Card key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <SportIcon sport={c.sport} size={20} color={colors.primary} />
          <View style={{ flex: 1 }}><T semibold>{c.name}</T><T size="xs" muted>{t(`book.sport_${c.sport}`)}</T></View>
          <Switch value={c.active} onValueChange={(x) => toggle(c, x)} trackColor={{ true: brand.orange }} />
          <Pressable onPress={() => remove(c)} hitSlop={8} accessibilityLabel={t('common.delete')}><Ionicons name="trash-outline" size={18} color={colors.muted} /></Pressable>
        </Card>
      ))}
      <Card style={{ gap: space.sm }}>
        <T semibold>{t('venue.addCourt')}</T>
        {sports.length > 1 ? <Segmented<Sport> value={sport} onChange={setSport} options={sports.map((s) => ({ value: s, label: t(`book.sport_${s}`) }))} /> : null}
        <Input value={name} onChangeText={setName} maxLength={40} placeholder={t('venue.courtPh', { n: rows.length + 1 })} />
        <Button small icon="add" title={t('venue.addCourt')} loading={busy} onPress={add} />
      </Card>
    </View>
  );
}

// ---------- الحصص ----------
const BLANK = (venue: string, sport: Sport): ClassInput => ({
  venue_id: venue, sport, title: '', title_en: null, weekday: 0, start_time: '18:00', duration_min: 50, capacity: 10, coach_name: null, price_sar: null, audience: 'mixed', active: true,
});

function ClassesTab({ v }: { v: Venue }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const sports = v.sports.filter((s) => CLASS_SPORTS.includes(s));
  const [rows, setRows] = useState<VenueClass[] | null>(null);
  const [edit, setEdit] = useState<{ id?: string; c: ClassInput; time: string; cap: string; price: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { loadVenueClasses(v.id).then(setRows).catch(() => setRows([])); }, [v.id]);
  useFocusEffect(load);

  const open = (c?: VenueClass) => {
    const base = c ? { ...c } : BLANK(v.id, sports[0]);
    setEdit({ id: c?.id, c: base, time: base.start_time.slice(0, 5), cap: String(base.capacity), price: base.price_sar != null ? String(base.price_sar) : '' });
  };
  const save = async () => {
    if (!edit) return;
    const time = toLatin(edit.time).trim();
    const m = time.match(/^(\d{1,2}):(\d{2})$/);
    const cap = parseInt(toLatin(edit.cap), 10);
    const price = edit.price.trim() ? Number(toLatin(edit.price)) : null;
    if (edit.c.title.trim().length < 2) return Alert.alert(t('venue.err_classTitle'));
    if (!m || +m[1] > 23 || +m[2] > 59) return Alert.alert(t('venue.err_time'));
    if (!(cap >= 1 && cap <= 60)) return Alert.alert(t('venue.err_capacity'));
    if (price != null && !(price >= 0 && price <= 2000)) return Alert.alert(t('venue.err_price'));
    setBusy(true);
    try {
      const { id, c } = edit;
      const { id: _drop, ...rest } = c as VenueClass;
      await saveVenueClass({ ...rest, start_time: `${m[1].padStart(2, '0')}:${m[2]}`, capacity: cap, price_sar: price }, id);
      setEdit(null); load();
    } catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };
  const remove = (c: VenueClass) => Alert.alert(t('venue.deleteClass'), c.title, [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.delete'), style: 'destructive', onPress: async () => { try { await deleteVenueClass(c.id); load(); } catch (e) { Alert.alert(t(errorKey(e))); } } },
  ]);

  if (!rows) return <Loading />;
  const setC = <K extends keyof ClassInput>(k: K, val: ClassInput[K]) => setEdit((e) => (e ? { ...e, c: { ...e.c, [k]: val } } : e));
  return (
    <View style={{ gap: space.sm }}>
      <T size="xs" muted style={{ lineHeight: 19 }}>{t('venue.classesHint')}</T>
      {rows.map((c) => (
        <Card key={c.id} style={{ gap: 4, opacity: c.active ? 1 : 0.6 }}>
          <Row>
            <SportIcon sport={c.sport} size={18} color={colors.primary} />
            <T semibold style={{ flex: 1 }}>{c.title}</T>
            <Pressable onPress={() => open(c)} hitSlop={8}><Ionicons name="create-outline" size={18} color={colors.primary} /></Pressable>
            <Pressable onPress={() => remove(c)} hitSlop={8}><Ionicons name="trash-outline" size={18} color={colors.muted} /></Pressable>
          </Row>
          <T size="sm">{weekdayName(c.weekday, lng)} · {clockLabel(Number(c.start_time.slice(0, 2)) * 60 + Number(c.start_time.slice(3, 5)), lng)} · {t('venue.minutes', { n: c.duration_min })}</T>
          <T size="xs" muted>{[t('venue.capacityN', { n: c.capacity }), c.coach_name, c.price_sar != null ? t('book.priceClass', { n: c.price_sar }) : null, c.audience !== 'mixed' ? t(`book.aud_${c.audience}`) : null].filter(Boolean).join(' · ')}</T>
        </Card>
      ))}
      {edit ? (
        <Card style={{ gap: space.sm }}>
          <T semibold>{edit.id ? t('venue.editClass') : t('venue.addClass')}</T>
          {sports.length > 1 ? <Segmented<Sport> value={edit.c.sport} onChange={(s) => setC('sport', s)} options={sports.map((s) => ({ value: s, label: t(`book.sport_${s}`) }))} /> : null}
          <Input label={t('venue.classTitle')} value={edit.c.title} onChangeText={(x) => setC('title', x)} maxLength={60} placeholder={t('venue.classTitlePh')} />
          <T size="sm" muted>{t('venue.weekday')}</T>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <Pressable key={d} onPress={() => setC('weekday', d)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: edit.c.weekday === d ? brand.deepGreen : colors.cardAlt }}>
                <T size="xs" semibold color={edit.c.weekday === d ? brand.cream : colors.text}>{weekdayName(d, lng)}</T>
              </Pressable>
            ))}
          </Row>
          <Row gap={space.sm}>
            <View style={{ flex: 1 }}><Input label={t('venue.startTime')} value={edit.time} onChangeText={(x) => setEdit((e) => (e ? { ...e, time: x } : e))} placeholder="18:00" keyboardType="numbers-and-punctuation" maxLength={5} /></View>
            <View style={{ flex: 1 }}><Input label={t('venue.capacity')} value={edit.cap} onChangeText={(x) => setEdit((e) => (e ? { ...e, cap: x } : e))} keyboardType="number-pad" maxLength={2} /></View>
          </Row>
          <T size="sm" muted>{t('venue.duration')}</T>
          <Segmented<number> value={edit.c.duration_min} onChange={(n) => setC('duration_min', n)} options={[45, 50, 60, 75, 90].map((n) => ({ value: n, label: String(n) }))} />
          <Row gap={space.sm}>
            <View style={{ flex: 1 }}><Input label={t('venue.coach')} value={edit.c.coach_name ?? ''} onChangeText={(x) => setC('coach_name', x)} maxLength={60} /></View>
            <View style={{ flex: 1 }}><Input label={t('venue.classPrice')} value={edit.price} onChangeText={(x) => setEdit((e) => (e ? { ...e, price: x } : e))} keyboardType="decimal-pad" maxLength={6} /></View>
          </Row>
          <Segmented<'mixed' | 'men' | 'women'> value={edit.c.audience} onChange={(a) => setC('audience', a)} options={(['mixed', 'men', 'women'] as const).map((a) => ({ value: a, label: t(`book.aud_${a}`) }))} />
          <Row>
            <T semibold style={{ flex: 1 }}>{t('venue.classActive')}</T>
            <Switch value={edit.c.active} onValueChange={(x) => setC('active', x)} trackColor={{ true: brand.orange }} />
          </Row>
          <Row gap={space.sm}>
            <View style={{ flex: 1 }}><Button icon="checkmark" title={t('common.save')} loading={busy} onPress={save} /></View>
            <Button variant="ghost" title={t('common.cancel')} onPress={() => setEdit(null)} />
          </Row>
        </Card>
      ) : <Button icon="add" title={t('venue.addClass')} onPress={() => open()} />}
      <View style={{ backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: space.md }}>
        <T size="xs" muted style={{ lineHeight: 19 }}>{t('venue.classRules')}</T>
      </View>
    </View>
  );
}
