// إنشاء جدول تمارين ونشره (متاح لرتبة «محترف» فأعلى أو المدرب الموثّق — مفروض في القاعدة أيضاً)
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, Pressable, TextInput, View } from 'react-native';
import { ExercisePicker } from '@/components/ExercisePicker';
import { Button, Card, Empty, Input, Row, Screen, Segmented, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { useLocalized } from '@/lib/i18n';
import { canPublish, RANKS, validateProgram, type UserProgramDay } from '@/lib/ranks';
import { publishProgram } from '@/lib/social';
import { toLatinDigits } from '@/lib/digits';
import { errorKey } from '@/lib/supabase';
import type { Level } from '@/lib/types';
import { getExercise } from '@/three/catalog';
import { brand, colors, fonts, radius, space } from '@/theme';

const RESTS = [60, 90, 120, 180];
const RIRS = ['', '0-1', '1-2', '2-3'];

export default function NewProgram() {
  const { t } = useTranslation();
  const { L } = useLocalized();
  const { userId, profile } = useUser();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [level, setLevel] = useState<Level>('intermediate');
  const [days, setDays] = useState<UserProgramDay[]>([{ title: t('social.dayN', { n: 1 }), exercises: [] }]);
  const [pickFor, setPickFor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  if (!canPublish('program', profile)) {
    return <Screen><Empty icon="lock-closed-outline" text={t('social.programsLocked', { rank: L(RANKS[3].name) })} /></Screen>;
  }

  const setDay = (i: number, f: (d: UserProgramDay) => UserProgramDay) => setDays((ds) => ds.map((d, k) => (k === i ? f(d) : d)));
  const setEx = (i: number, j: number, patch: Partial<UserProgramDay['exercises'][number]>) =>
    setDay(i, (d) => ({ ...d, exercises: d.exercises.map((e, k) => (k === j ? { ...e, ...patch } : e)) }));

  const publish = async () => {
    const err = validateProgram({ title, days });
    if (err) return Alert.alert(t(`social.err_${err}`));
    setBusy(true);
    try {
      const id = await publishProgram(userId, { title, description: desc, level, days });
      router.replace({ pathname: '/program/[id]', params: { id } });
    } catch (e) {
      Alert.alert(t(errorKey(e)));
    } finally { setBusy(false); }
  };

  return (
    <Screen edges={['bottom']}>
      <T muted style={{ lineHeight: 24 }}>{t('social.newProgramIntro')}</T>
      <Input label={t('social.programTitle')} value={title} onChangeText={setTitle} maxLength={80} placeholder={t('social.programTitlePh')} />
      <Input label={t('social.programDesc')} value={desc} onChangeText={setDesc} maxLength={600} multiline style={{ minHeight: 80, textAlignVertical: 'top' }} placeholder={t('social.programDescPh')} />
      <Segmented<Level> value={level} onChange={setLevel} options={(['beginner', 'intermediate', 'advanced'] as Level[]).map((v) => ({ value: v, label: t(`onboarding.level_${v}`) }))} />

      {days.map((d, i) => (
        <Card key={i} style={{ gap: space.md }}>
          <Row>
            <View style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: brand.deepGreen, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '45deg' }] }}>
              <T size="xs" bold color={brand.amber} style={{ transform: [{ rotate: '-45deg' }] }}>{i + 1}</T>
            </View>
            <TextInput value={d.title} onChangeText={(v) => setDay(i, (x) => ({ ...x, title: v }))} maxLength={40}
              style={{ flex: 1, fontFamily: fonts.title, fontSize: 17, color: colors.text, paddingVertical: 4, textAlign: 'auto' }} />
            {days.length > 1 ? (
              <Pressable hitSlop={10} onPress={() => setDays((ds) => ds.filter((_, k) => k !== i))} accessibilityLabel={t('social.removeDay')}>
                <Ionicons name="close-circle-outline" size={22} color={colors.muted} />
              </Pressable>
            ) : null}
          </Row>

          {d.exercises.map((e, j) => {
            const g = getExercise(e.exercise_id);
            return (
              <View key={j} style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm }}>
                <Row>
                  <T semibold style={{ flex: 1 }} numberOfLines={1}>{g ? L(g.name) : e.exercise_id}</T>
                  <Pressable hitSlop={10} onPress={() => setDay(i, (x) => ({ ...x, exercises: x.exercises.filter((_, k) => k !== j) }))}>
                    <Ionicons name="trash-outline" size={18} color={colors.muted} />
                  </Pressable>
                </Row>
                <Row gap={space.md}>
                  <Stepper label={t('social.sets')} value={e.sets} onChange={(v) => setEx(i, j, { sets: v })} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <T size="xs" muted>{t('social.reps')}</T>
                    <TextInput value={e.reps} onChangeText={(v) => setEx(i, j, { reps: toLatinDigits(v).replace(/[^\d-]/g, '').slice(0, 5) })} keyboardType="numbers-and-punctuation"
                      style={{ height: 38, borderRadius: 10, backgroundColor: colors.cardAlt, color: colors.text, textAlign: 'center', fontFamily: fonts.semibold, fontSize: 16 }} />
                  </View>
                </Row>
                <Row gap={6} style={{ flexWrap: 'wrap' }}>
                  <T size="xs" muted>{t('social.rest')}</T>
                  {RESTS.map((r) => <Chip key={r} on={e.rest_sec === r} text={r >= 120 ? `${r / 60}${t('social.minShort')}` : `${r}${t('social.secShort')}`} onPress={() => setEx(i, j, { rest_sec: r })} />)}
                </Row>
                <Row gap={6} style={{ flexWrap: 'wrap' }}>
                  <T size="xs" muted>RIR</T>
                  {RIRS.map((r) => <Chip key={r || 'none'} on={(e.rir ?? '') === r} text={r || '—'} onPress={() => setEx(i, j, { rir: r || undefined })} />)}
                </Row>
              </View>
            );
          })}

          <Pressable onPress={() => setPickFor(i)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12 }}>
            <Ionicons name="add" size={18} color={colors.primary} />
            <T semibold color={colors.primary}>{t('workout.addExercise')}</T>
          </Pressable>
        </Card>
      ))}

      {days.length < 7 ? (
        <Button variant="ghost" icon="calendar-outline" title={t('social.addDay')} onPress={() => setDays((ds) => [...ds, { title: t('social.dayN', { n: ds.length + 1 }), exercises: [] }])} />
      ) : null}
      <Button title={t('social.publish')} icon="paper-plane-outline" loading={busy} onPress={publish} />
      <T size="xs" muted center>{t('social.publishNote')}</T>

      <Modal visible={pickFor !== null} animationType="slide" transparent onRequestClose={() => setPickFor(null)}>
        <ExercisePicker onClose={() => setPickFor(null)} onPick={(id) => {
          if (pickFor !== null) setDay(pickFor, (d) => ({ ...d, exercises: [...d.exercises, { exercise_id: id, sets: 3, reps: '8-12', rest_sec: 90, rir: '1-2' }].slice(0, 15) }));
          setPickFor(null);
        }} />
      </Modal>
    </Screen>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const btn = (icon: 'remove' | 'add', v: number) => (
    <Pressable onPress={() => onChange(Math.max(1, Math.min(10, v)))} hitSlop={6}
      style={{ width: 34, height: 38, borderRadius: 10, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={16} color={colors.text} />
    </Pressable>
  );
  return (
    <View style={{ gap: 2 }}>
      <T size="xs" muted>{label}</T>
      <Row gap={6}>
        {btn('remove', value - 1)}
        <T bold style={{ minWidth: 20, textAlign: 'center' }}>{value}</T>
        {btn('add', value + 1)}
      </Row>
    </View>
  );
}

function Chip({ text, on, onPress }: { text: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: on ? brand.deepGreen : colors.cardAlt, borderWidth: 1, borderColor: on ? brand.deepGreen : colors.border }}>
      <T size="xs" semibold color={on ? brand.cream : colors.text}>{text}</T>
    </Pressable>
  );
}
