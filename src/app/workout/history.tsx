// سجل الجلسات: كل تمرين سجلته مع الحجم والتغيّر عن الجلسة المماثلة قبلها
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Num } from '@/components/pulse/widgets';
import { Card, Empty, Row, Screen, T } from '@/components/ui';
import { useLocalized } from '@/lib/i18n';
import { compareSession, exercisesOf, loadHistory, type SessionData } from '@/lib/training';
import { MUSCLE_NAMES } from '@/three/catalog';
import { musclesOf } from '@/lib/training/stats';
import { colors, space } from '@/theme';

export default function WorkoutHistory() {
  const { t } = useTranslation();
  const { L, lng } = useLocalized();
  const [list, setList] = useState<SessionData[] | null>(null);
  useFocusEffect(useCallback(() => { loadHistory(100).then(setList); }, []));

  if (!list) return <Screen><T muted>…</T></Screen>;
  const done = list.filter((s) => s.sets.length);
  return (
    <Screen edges={['bottom']}>
      {done.length === 0 ? <Empty text={t('workout.historyEmpty')} icon="barbell-outline" /> : done.map((s) => {
        const c = compareSession(s, list);
        const muscles = [...musclesOf(exercisesOf(s))].slice(0, 4).map((m) => L(MUSCLE_NAMES[m])).join('، ');
        return (
          <Card key={s.id} onPress={() => router.push({ pathname: '/workout/[id]', params: { id: s.id } })} style={{ gap: space.xs }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T bold style={{ flex: 1 }} numberOfLines={1}>{s.title || t('workout.title')}{c.prs ? ' 🏆' : ''}</T>
              <T size="xs" muted>{new Date(s.started_at).toLocaleDateString(lng === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' })}</T>
            </Row>
            <T size="xs" muted>{muscles}</T>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row gap={4}><Num size={18} color={colors.text}>{Math.round(c.totals.now.volume).toLocaleString('en-US')}</Num><T size="xs" muted>{t('workout.kg')} · {c.totals.now.sets} {t('workout.sets')}</T></Row>
              {c.volumeDelta != null ? (
                <Row gap={2}>
                  <Ionicons name={c.volumeDelta >= 0 ? 'arrow-up' : 'arrow-down'} size={12} color={c.volumeDelta >= 0 ? colors.success : colors.primary} />
                  <T size="sm" bold color={c.volumeDelta >= 0 ? colors.success : colors.primary}>{c.volumeDelta > 0 ? '+' : ''}{c.volumeDelta}%</T>
                </Row>
              ) : <View />}
            </Row>
          </Card>
        );
      })}
      <T size="xs" muted center>{t('workout.historyHint')}</T>
    </Screen>
  );
}
