// جدول الحصص الأسبوعي للفرع: إضافة، تعديل، إيقاف، وعدد المحجوز للأسبوع الجاي
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Switch, View } from 'react-native';
import { Button, Card, Empty, Input, Row, Screen, Segmented, T } from '@/components/ui';
import { deleteClass, loadClasses, loadSchedule, saveClass, type ClassSlot } from '@/lib/gymops';
import { errorKey } from '@/lib/supabase';
import { brand, colors, space } from '@/theme';

type Form = { id?: string; name: string; coach_name: string; weekday: number; start_time: string; duration_min: string; capacity: string; audience: 'men' | 'women' | 'mixed'; members_only: boolean; active: boolean };
const EMPTY: Form = { name: '', coach_name: '', weekday: 0, start_time: '19:00', duration_min: '45', capacity: '20', audience: 'mixed', members_only: true, active: true };

export default function ClassesAdmin() {
  const { gym } = useLocalSearchParams<{ gym: string }>();
  const { t } = useTranslation();
  const [rows, setRows] = useState<any[]>([]);
  const [slots, setSlots] = useState<ClassSlot[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    loadClasses(String(gym)).then(setRows).catch(() => {});
    loadSchedule(String(gym), 7).then(setSlots).catch(() => {});
  }, [gym]);
  useFocusEffect(load);
  const days = t('weekdays', { returnObjects: true }) as string[];

  const save = async () => {
    if (!form) return;
    if (form.name.trim().length < 2 || !/^\d{1,2}:\d{2}$/.test(form.start_time)) return Alert.alert(t('gymops.err_class'));
    setBusy(true);
    try {
      await saveClass({ id: form.id, gym_id: String(gym), name: form.name.trim(), coach_name: form.coach_name.trim() || null, weekday: form.weekday,
        start_time: form.start_time, duration_min: Number(form.duration_min) || 45, capacity: Number(form.capacity) || 20, audience: form.audience,
        members_only: form.members_only, active: form.active });
      setForm(null); load();
    } catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('gymops.tool_classesAdmin') }} />
      {form ? (
        <Card style={{ gap: space.sm }}>
          <Input label={t('gymops.className')} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} maxLength={60} placeholder={t('gymops.classNamePh')} />
          <Input label={t('gymops.coachName')} value={form.coach_name} onChangeText={(v) => setForm({ ...form, coach_name: v })} maxLength={60} />
          <T size="sm" muted>{t('gymops.weekday')}</T>
          <Segmented<number> wrap value={form.weekday} onChange={(v) => setForm({ ...form, weekday: v })} options={days.map((d, i) => ({ value: i, label: d }))} />
          <Row gap={space.sm}>
            <View style={{ flex: 1 }}><Input label={t('gymops.startTime')} value={form.start_time} onChangeText={(v) => setForm({ ...form, start_time: v })} placeholder="19:00" /></View>
            <View style={{ flex: 1 }}><Input label={t('gymops.durationMin')} value={form.duration_min} onChangeText={(v) => setForm({ ...form, duration_min: v })} keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><Input label={t('gymops.capacity')} value={form.capacity} onChangeText={(v) => setForm({ ...form, capacity: v })} keyboardType="number-pad" /></View>
          </Row>
          <Segmented<'men' | 'women' | 'mixed'> value={form.audience} onChange={(v) => setForm({ ...form, audience: v })} options={[
            { value: 'mixed', label: t('clubs.aud_mixed') }, { value: 'men', label: t('clubs.aud_men') }, { value: 'women', label: t('clubs.aud_women') },
          ]} />
          <Row style={{ justifyContent: 'space-between' }}><T size="sm">{t('gymops.membersOnly')}</T><Switch value={form.members_only} onValueChange={(v) => setForm({ ...form, members_only: v })} trackColor={{ true: brand.orange }} /></Row>
          <Row style={{ justifyContent: 'space-between' }}><T size="sm">{t('gymops.classActive')}</T><Switch value={form.active} onValueChange={(v) => setForm({ ...form, active: v })} trackColor={{ true: brand.orange }} /></Row>
          <Row gap={space.sm}>
            <View style={{ flex: 1 }}><Button small title={t('common.save')} loading={busy} onPress={save} /></View>
            <View style={{ flex: 1 }}><Button small variant="secondary" title={t('common.cancel')} onPress={() => setForm(null)} /></View>
          </Row>
          {form.id ? <Button small variant="ghost" icon="trash-outline" title={t('common.delete')} onPress={async () => { await deleteClass(form.id!).catch(() => {}); setForm(null); load(); }} /> : null}
        </Card>
      ) : <Button icon="add" title={t('gymops.addClass')} onPress={() => setForm({ ...EMPTY })} />}

      {rows.length ? rows.map((c) => {
        const next = slots.find((s) => s.class_id === c.id);
        return (
          <Pressable key={c.id} onPress={() => setForm({ id: c.id, name: c.name, coach_name: c.coach_name ?? '', weekday: c.weekday, start_time: String(c.start_time).slice(0, 5),
            duration_min: String(c.duration_min), capacity: String(c.capacity), audience: c.audience, members_only: c.members_only, active: c.active })}>
            <Card style={{ gap: 2, opacity: c.active ? 1 : 0.5 }}>
              <T semibold>{c.name}</T>
              <T size="xs" muted>{days[c.weekday]} · {String(c.start_time).slice(0, 5)} · {t('gymops.minutesN', { count: c.duration_min })}{c.coach_name ? ` · ${c.coach_name}` : ''}</T>
              {next ? <T size="xs" color={next.booked >= next.capacity ? brand.orange : colors.text}>{t('gymops.nextBooked', { booked: next.booked, capacity: next.capacity, date: next.class_date })}{next.waitlist ? ` · ${t('gymops.waitlistN', { count: next.waitlist })}` : ''}</T> : null}
            </Card>
          </Pressable>
        );
      }) : !form ? <Empty icon="calendar-outline" text={t('gymops.noClasses')} /> : null}
    </Screen>
  );
}
