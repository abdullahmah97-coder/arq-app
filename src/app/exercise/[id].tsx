// شاشة التمرين: مجسّم 3D واقعي بملابس ARQ + العضلات العاملة مع شرح مفصّل + الخطوات والأخطاء والتنفس
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { ExerciseViewer, ViewerLoading, type Gender } from '@/components/exercise/ExerciseViewer';
import { Card, Empty, Row, Screen, Segmented, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useLocalized } from '@/lib/i18n';
import { e1rm, fmtSet, loadHistory, summarize, type SessionData } from '@/lib/training';
import { ANATOMY } from '@/three/anatomy';
import { exerciseMuscles, getExercise, MUSCLE_NAMES } from '@/three/catalog';
import type { Muscle } from '@/three/rig';
import { brand, colors, space } from '@/theme';

export default function ExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { L } = useLocalized();
  const { health } = useAuth();
  const ex = getExercise(String(id));
  const [gender, setGender] = useState<Gender>(health?.gender === 'female' ? 'female' : 'male');
  const [focus, setFocus] = useState<Muscle | null>(null);

  const [hist, setHist] = useState<SessionData[]>([]);
  useEffect(() => { loadHistory(120).then(setHist).catch(() => {}); }, []);
  const mine = ex ? hist.filter((h) => h.sets.some((x) => x.exercise_id === ex.id)).slice(0, 8)
    .map((h) => ({ id: h.id, ...summarize(ex.id, h.sets) })) : [];
  const maxE = Math.max(1, ...mine.map((m) => m.e1rm));
  const best = mine.reduce<typeof mine[number]['top']>((b, m) => (m.top && (!b || e1rm(m.top.weight_kg, m.top.reps) > e1rm(b.weight_kg, b.reps)) ? m.top : b), null);

  if (!ex) return <Screen><Empty text={t('exercise.notFound')} /></Screen>;
  const m = exerciseMuscles(ex);
  const muscles: [Muscle, 'primary' | 'secondary'][] = [
    ...m.primary.map((x) => [x, 'primary'] as [Muscle, 'primary']),
    ...m.secondary.map((x) => [x, 'secondary'] as [Muscle, 'secondary']),
  ];
  const info = focus ? ANATOMY[focus] : null;

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: L(ex.name) }} />

      <Suspense fallback={<ViewerLoading />}>
        <ExerciseViewer motion={ex.motion} gender={gender} focus={focus} muscles={ex.library ? m : undefined} />
      </Suspense>
      <T size="xs" muted center>{t(ex.library ? 'exercise.mapHint' : 'exercise.dragHint')}</T>
      <Segmented value={gender} onChange={setGender}
        options={[{ value: 'male', label: t('exercise.male') }, { value: 'female', label: t('exercise.female') }]} />

      {/* العضلات */}
      <Card style={{ gap: space.md }}>
        <T bold>{t('exercise.muscles')}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          <Chip label={t('exercise.allMuscles')} active={!focus} color={brand.deepGreen} onPress={() => setFocus(null)} />
          {muscles.map(([mu, kind]) => (
            <Chip key={mu} label={L(MUSCLE_NAMES[mu])} active={focus === mu}
              color={kind === 'primary' ? brand.orange : brand.amber}
              sub={t(`exercise.${kind}`)} onPress={() => setFocus(focus === mu ? null : mu)} />
          ))}
        </View>
        {info && focus ? (
          <View style={{ gap: space.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T bold size="lg" color={colors.primary}>{L(MUSCLE_NAMES[focus])}</T>
              <T size="xs" muted style={{ fontStyle: 'italic' }}>{info.latin}</T>
            </Row>
            <Fact icon="location-outline" title={t('exercise.location')} text={L(info.location)} />
            <Fact icon="flash-outline" title={t('exercise.function')} text={L(info.function)} />
            <Fact icon="hand-left-outline" title={t('exercise.feel')} text={L(info.feel)} />
          </View>
        ) : null}
      </Card>

      {mine.length ? (
        <Card style={{ gap: space.sm }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T bold>{t('workout.myHistory')}</T>
            {best ? <T size="xs" muted>{t('workout.best')}: {fmtSet(best)}</T> : null}
          </Row>
          <T size="xs" muted>{t('workout.progress')}</T>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 90 }}>
            {[...mine].reverse().map((m, i, arr) => {
              const h = Math.max(8, (m.e1rm / maxE) * 70);
              const last = i === arr.length - 1;
              return (
                <View key={m.id} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                  <T size="xs" muted>{m.top ? fmtSet(m.top) : ''}</T>
                  <View style={{ width: '100%', height: h, borderRadius: 4, backgroundColor: last ? colors.primary : colors.cardAlt }} />
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}

      <Card style={{ gap: space.sm }}>
        <T bold>{t('exercise.steps')}</T>
        {ex.steps.map((s, i) => (
          <Row key={i} style={{ alignItems: 'flex-start' }} gap={space.md}>
            <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: brand.deepGreen, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '45deg' }], marginTop: 4 }}>
              <T size="xs" bold color={brand.amber} style={{ transform: [{ rotate: '-45deg' }] }}>{i + 1}</T>
            </View>
            <T style={{ flex: 1, lineHeight: 26 }}>{L(s)}</T>
          </Row>
        ))}
      </Card>

      <Card style={{ gap: space.sm }}>
        <T bold>{t('exercise.mistakes')}</T>
        {ex.mistakes.map((s, i) => (
          <Row key={i} style={{ alignItems: 'flex-start' }}>
            <Ionicons name="close-circle" size={18} color={colors.danger} style={{ marginTop: 3 }} />
            <T style={{ flex: 1 }}>{L(s)}</T>
          </Row>
        ))}
      </Card>

      <Card style={{ gap: space.sm }}>
        <Row><Ionicons name="leaf-outline" size={18} color={colors.accent} /><T bold>{t('exercise.breathing')}</T></Row>
        <T muted>{L(ex.breathing)}</T>
        {ex.tip ? (
          <>
            <Row style={{ marginTop: space.sm }}><Ionicons name="bulb-outline" size={18} color={colors.primary} /><T bold>{t('exercise.tip')}</T></Row>
            <T muted>{L(ex.tip)}</T>
          </>
        ) : null}
      </Card>
    </Screen>
  );
}

function Chip({ label, sub, active, color, onPress }: { label: string; sub?: string; active: boolean; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{
      flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
      backgroundColor: active ? color : colors.cardAlt, borderWidth: 1, borderColor: active ? color : colors.border,
    }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: active ? brand.cream : color, transform: [{ rotate: '45deg' }] }} />
      <T size="sm" semibold color={active ? brand.cream : colors.text}>{label}</T>
      {sub ? <T size="xs" color={active ? brand.sand : colors.muted}>· {sub}</T> : null}
    </Pressable>
  );
}

function Fact({ icon, title, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; text: string }) {
  return (
    <Row style={{ alignItems: 'flex-start' }} gap={space.md}>
      <Ionicons name={icon} size={18} color={colors.primary} style={{ marginTop: 3 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <T size="sm" semibold>{title}</T>
        <T size="sm" muted style={{ lineHeight: 22 }}>{text}</T>
      </View>
    </Row>
  );
}
