// لوحة المالك: طلبات توثيق المدربين (يتأكد من الشهادات ثم يوثّق)
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { Button, Card, Row, T } from '@/components/ui';
import { loadVerificationQueue, setVerified, type VerifyReq } from '@/lib/coaching';
import { errorKey } from '@/lib/supabase';
import { space } from '@/theme';

export function CoachVerifyQueue() {
  const { t } = useTranslation();
  const [q, setQ] = useState<VerifyReq[]>([]);
  const load = useCallback(() => { loadVerificationQueue().then(setQ); }, []);
  useFocusEffect(load);
  if (!q.length) return null;
  return (
    <Card style={{ gap: space.sm }}>
      <T semibold>{t('coaching.verifyQueue', { count: q.length })}</T>
      {q.map((r) => (
        <View key={r.user_id} style={{ gap: 4 }}>
          <T size="sm" semibold>{r.full_name || r.username} · @{r.username}</T>
          {r.headline ? <T size="xs" muted>{r.headline}</T> : null}
          <T size="xs">{r.certifications}</T>
          <Row gap={space.sm}>
            <Button small title={t('coaching.verify')} onPress={async () => { try { await setVerified(r.user_id, true); load(); } catch (e) { Alert.alert(t(errorKey(e))); } }} />
            <Button small variant="ghost" title={t('coaching.viewProfile')} onPress={() => router.push({ pathname: '/coaches/[id]', params: { id: r.user_id } })} />
          </Row>
        </View>
      ))}
    </Card>
  );
}
