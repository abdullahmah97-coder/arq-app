// بطاقة النوم في الرئيسية: متى تنام عشان تصحى على وقتك وتاخذ احتياجك (من ساعتك)، أوقات النوم على دورات النوم،
// «لو نمت الحين تصحى…»، ومنبّه صحيان حقيقي (iOS 26+) أو إشعار بصوت، وتذكير وقت النوم.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Modal, Pressable, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { alarmSupported } from '../../../modules/arq-alarm';
import { NCard, NSection, NT, Num, Pill } from '@/components/pulse/widgets';
import { useUser } from '@/lib/auth';
import { useHealth } from '@/lib/health';
import { useLocalized } from '@/lib/i18n';
import {
  applySleepSchedule, bedtimeFor, bestCycle, clockLabel, cycleBedtimes, fmtDuration, fmtHm, isNightWindow, markApplied, parseHm,
  sleepNeed, syncSleepSchedule, useSleepSettings, wakeTimesFrom, type SleepSettings, type SleepTexts,
} from '@/lib/sleep';
import { brand, night, pulse, space } from '@/theme';

const minutesNow = (d: Date) => d.getHours() * 60 + d.getMinutes();

export function HomeSleep() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId } = useUser();
  const h = useHealth();
  const { settings, save, ready } = useSleepSettings(userId);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(useCallback(() => { setNow(new Date()); }, []));

  const need = sleepNeed(h.scores?.sleep_need_min);
  const wakeMin = parseHm(settings.wake) ?? 420;
  const bed = bedtimeFor(wakeMin, need);
  const cycles = cycleBedtimes(wakeMin);
  const best = bestCycle(cycles, need);
  const nowMin = minutesNow(now);
  const night_ = isNightWindow(nowMin, bed, wakeMin);
  const texts = useSleepTexts(bed);

  // احتياج النوم يتغير مع الساعة: نعيد جدولة التذكير بهدوء لو تغيّر
  useEffect(() => {
    if (ready) void syncSleepSchedule(userId, settings, need, texts, lng);
  }, [ready, userId, settings, need, texts, lng]);

  return (
    <>
      <NSection title={t('sleep.title')} action={t('sleep.edit')} onAction={() => setOpen(true)} />
      <NCard onPress={() => setOpen(true)}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <NT size={12} muted>{t('sleep.bedBy')}</NT>
            <Num size={34} color={night.text}>{clockLabel(bed, lng)}</Num>
            <NT size={12} muted style={{ lineHeight: 19 }}>
              {t('sleep.toWake', { wake: clockLabel(wakeMin, lng), need: fmtDuration(need) })}
            </NT>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Ionicons name="moon" size={24} color={pulse.sleep} />
            {settings.alarm ? (
              <Pill color={brand.deepGreen} bg={brand.amber}>{`⏰ ${clockLabel(wakeMin, lng)}`}</Pill>
            ) : null}
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <NT size={12} muted>{t('sleep.cyclesTitle')}</NT>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {cycles.map((c) => {
              const on = best?.cycles === c.cycles;
              return (
                <View key={c.cycles} style={{
                  flex: 1, alignItems: 'center', gap: 2, paddingVertical: 8, borderRadius: 14,
                  backgroundColor: on ? 'rgba(254,169,79,0.16)' : night.card, borderWidth: 1, borderColor: on ? brand.amber : night.line,
                }}>
                  <NT size={15} bold color={on ? brand.amber : night.text}>{clockLabel(c.at, lng)}</NT>
                  <NT size={10} faint>{t('sleep.cycles', { n: c.cycles, h: fmtDuration(c.sleepMin) })}</NT>
                </View>
              );
            })}
          </View>
        </View>

        {night_ ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: night.card, borderRadius: 14, padding: 10 }}>
            <Ionicons name="bed-outline" size={18} color={night.accent} />
            <NT size={12} style={{ flex: 1, lineHeight: 19 }}>
              {t('sleep.ifNow', { times: wakeTimesFrom(nowMin).map((w) => clockLabel(w.at, lng)).join(' · ') })}
            </NT>
          </View>
        ) : null}

        {!settings.alarm ? (
          <Pressable onPress={() => setOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
            <Ionicons name="alarm-outline" size={16} color={night.accent} />
            <NT size={13} semibold color={night.accent}>{t('sleep.setAlarm')}</NT>
          </Pressable>
        ) : null}
      </NCard>
      {open ? <SleepSheet initial={settings} need={need} onClose={() => setOpen(false)} onSaved={(s) => {
        const clean = save(s);
        void markApplied(userId, clean, need, lng);
      }} /> : null}
    </>
  );
}

function useSleepTexts(bedMin: number): SleepTexts {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  return useMemo(() => ({
    wakeTitle: t('sleep.wakeTitle'),
    wakeBody: t('sleep.wakeBody'),
    bedTitle: t('sleep.bedTitle'),
    bedBody: t('sleep.bedBody', { at: clockLabel(bedMin, lng) }),
    stop: t('sleep.stop'),
    snooze: t('sleep.snooze'),
  }), [t, lng, bedMin]);
}

const QUICK = ['05:00', '05:30', '06:00', '06:30', '07:00', '07:30', '08:00', '09:00'];
const BEFORE = [15, 30, 60];

/** ضبط الصحيان والتذكير */
function SleepSheet({ initial, need, onClose, onSaved }: {
  initial: SleepSettings; need: number; onClose: () => void; onSaved: (s: SleepSettings) => void;
}) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [s, setS] = useState<SleepSettings>(initial);
  const [busy, setBusy] = useState(false);
  const weekdays = t('weekdaysShort', { returnObjects: true }) as string[];
  const wakeMin = parseHm(s.wake) ?? 420;
  const bed = bedtimeFor(wakeMin, need);
  const texts = useSleepTexts(bed);
  const real = alarmSupported();

  const shift = (delta: number) => { Haptics.selectionAsync().catch(() => {}); setS((x) => ({ ...x, wake: fmtHm((parseHm(x.wake) ?? 420) + delta) })); };
  const toggleDay = (d: number) => setS((x) => {
    const has = x.days.includes(d);
    const days = has ? x.days.filter((y) => y !== d) : [...x.days, d].sort();
    return { ...x, days: days.length ? days : x.days };
  });

  const saveAll = async () => {
    setBusy(true);
    try {
      const r = await applySleepSchedule(s, need, texts, true);
      onSaved(s);
      const lines: string[] = [];
      if (r.wake === 'alarmkit') lines.push(t('sleep.okAlarm', { at: clockLabel(wakeMin, lng) }));
      if (r.wake === 'notification') lines.push(t('sleep.okNotif', { at: clockLabel(wakeMin, lng) }));
      if (r.alarmDenied) lines.push(t('sleep.alarmDenied'));
      if (r.remind === 'on') lines.push(t('sleep.okRemind', { at: clockLabel(bed - s.remindBefore, lng) }));
      const denied = r.wake === 'denied' || r.remind === 'denied';
      if (denied) lines.push(t('sleep.notifDenied'));
      onClose();
      if (lines.length) {
        Alert.alert(t('sleep.saved'), lines.join('\n\n'), denied || r.alarmDenied
          ? [{ text: t('common.close'), style: 'cancel' }, { text: t('sleep.openSettings'), onPress: () => void Linking.openSettings() }]
          : undefined);
      }
    } finally { setBusy(false); }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <SafeAreaView edges={['bottom']} style={{ maxHeight: '92%', backgroundColor: night.bg2, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: space.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, marginBottom: space.sm }}>
            <NT size={18} bold>{t('sleep.sheetTitle')}</NT>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Ionicons name="close" size={24} color={night.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.lg }}>
            {/* وقت الصحيان */}
            <View style={{ alignItems: 'center', gap: 8 }}>
              <NT size={13} muted>{t('sleep.wakeAt')}</NT>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, direction: 'ltr' }}>
                <Step icon="remove" label={t('sleep.earlier')} onPress={() => shift(-5)} onLong={() => shift(-30)} />
                <Num size={48} color={night.text}>{clockLabel(wakeMin, lng)}</Num>
                <Step icon="add" label={t('sleep.later')} onPress={() => shift(5)} onLong={() => shift(30)} />
              </View>
              <NT size={11} faint>{t('sleep.stepHint')}</NT>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {QUICK.map((q) => (
                  <Chip key={q} on={s.wake === q} text={clockLabel(parseHm(q)!, lng)} onPress={() => setS((x) => ({ ...x, wake: q }))} />
                ))}
              </ScrollView>
            </View>

            {/* الأيام */}
            <View style={{ gap: 8 }}>
              <NT size={13} semibold>{t('sleep.days')}</NT>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {weekdays.map((w, d) => (
                  <Pressable key={d} onPress={() => toggleDay(d)} accessibilityRole="checkbox" accessibilityState={{ checked: s.days.includes(d) }}
                    style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 12, borderWidth: 1,
                      backgroundColor: s.days.includes(d) ? brand.amber : night.card, borderColor: s.days.includes(d) ? brand.amber : night.line }}>
                    <NT size={11} bold color={s.days.includes(d) ? brand.deepGreen : night.text}>{w}</NT>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* المنبّه */}
            <Toggle icon="alarm-outline" title={t('sleep.alarm')} sub={t(real ? 'sleep.alarmReal' : 'sleep.alarmNotif')}
              value={s.alarm} onChange={(v) => setS((x) => ({ ...x, alarm: v }))} />

            {/* تذكير النوم */}
            <Toggle icon="notifications-outline" title={t('sleep.remind')}
              sub={t('sleep.remindSub', { at: clockLabel(bed - s.remindBefore, lng), bed: clockLabel(bed, lng) })}
              value={s.remind} onChange={(v) => setS((x) => ({ ...x, remind: v }))} />
            {s.remind ? (
              <View style={{ flexDirection: 'row', gap: 6, marginTop: -8 }}>
                {BEFORE.map((b) => <Chip key={b} on={s.remindBefore === b} text={t('sleep.before', { n: b })} onPress={() => setS((x) => ({ ...x, remindBefore: b }))} />)}
              </View>
            ) : null}

            <View style={{ backgroundColor: night.card, borderRadius: 16, padding: 12, gap: 4 }}>
              <NT size={12} muted style={{ lineHeight: 19 }}>
                {t('sleep.summary', { bed: clockLabel(bed, lng), need: fmtDuration(need) })}
              </NT>
            </View>

            <Pressable onPress={saveAll} disabled={busy} accessibilityRole="button"
              style={({ pressed }) => ({ backgroundColor: brand.amber, borderRadius: 999, paddingVertical: 14, alignItems: 'center', opacity: pressed || busy ? 0.75 : 1 })}>
              <NT size={15} bold color={brand.deepGreen}>{busy ? t('sleep.saving') : t('sleep.save')}</NT>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function Step({ icon, label, onPress, onLong }: { icon: 'add' | 'remove'; label: string; onPress: () => void; onLong: () => void }) {
  return (
    <Pressable onPress={onPress} onLongPress={onLong} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center',
        backgroundColor: night.cardStrong, borderWidth: 1, borderColor: night.line, opacity: pressed ? 0.7 : 1 })}>
      <Ionicons name={icon} size={22} color={night.text} />
    </Pressable>
  );
}

function Chip({ text, on, onPress }: { text: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1,
      backgroundColor: on ? brand.amber : night.card, borderColor: on ? brand.amber : night.line }}>
      <NT size={12} semibold color={on ? brand.deepGreen : night.text}>{text}</NT>
    </Pressable>
  );
}

function Toggle({ icon, title, sub, value, onChange }: {
  icon: 'alarm-outline' | 'notifications-outline'; title: string; sub: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: night.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: night.line }}>
      <Ionicons name={icon} size={22} color={value ? brand.amber : night.muted} />
      <View style={{ flex: 1, gap: 2 }}>
        <NT size={14} semibold>{title}</NT>
        <NT size={11} muted style={{ lineHeight: 17 }}>{sub}</NT>
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={title}
        trackColor={{ true: brand.orange, false: night.line }} thumbColor={brand.cream} />
    </View>
  );
}
