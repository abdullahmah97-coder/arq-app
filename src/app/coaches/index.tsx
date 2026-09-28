// دليل المدربين: بحث وتخصص، الموثّقين أولاً ثم الأعلى تقييماً
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import { Chip, CoachRow } from '@/components/coaching/parts';
import { Button, Empty, Input, Loading, Row, Screen } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { loadDirectory, loadMyCoachProfile, SPECIALTIES, type CoachCard } from '@/lib/coaching';
import { space } from '@/theme';

export default function CoachesDirectory() {
  const { gym } = useLocalSearchParams<{ gym?: string }>();
  const { t } = useTranslation();
  const { userId } = useUser();
  const [q, setQ] = useState('');
  const [sp, setSp] = useState<string | null>(null);
  const [list, setList] = useState<CoachCard[] | null>(null);
  const [isCoach, setIsCoach] = useState(false);

  const load = useCallback(() => { loadDirectory({ q, specialty: sp, gym: gym ?? null }).then(setList).catch(() => setList([])); }, [q, sp, gym]);
  useEffect(() => { const h = setTimeout(load, 250); return () => clearTimeout(h); }, [load]);
  useFocusEffect(useCallback(() => { loadMyCoachProfile(userId).then((p) => setIsCoach(!!p)); }, [userId]));

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('coaching.directory') }} />
      <Input value={q} onChangeText={setQ} placeholder={t('coaching.searchPh')} returnKeyType="search" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        <Chip label={t('coaching.all')} on={!sp} onPress={() => setSp(null)} />
        {SPECIALTIES.map((s) => <Chip key={s} label={t(`coaching.sp_${s}`)} on={sp === s} onPress={() => setSp(sp === s ? null : s)} />)}
      </ScrollView>
      {list === null ? <Loading /> : list.length ? list.map((c) => <CoachRow key={c.user_id} c={c} />) : <Empty icon="barbell-outline" text={t('coaching.noCoaches')} />}
      <Row gap={space.sm}>
        <Button style={{ flex: 1 }} variant="secondary" icon={isCoach ? 'speedometer-outline' : 'ribbon-outline'} title={isCoach ? t('coaching.hub') : t('coaching.becomeCoach')}
          onPress={() => router.push(isCoach ? '/coaching' : '/coaching/profile')} />
      </Row>
    </Screen>
  );
}
