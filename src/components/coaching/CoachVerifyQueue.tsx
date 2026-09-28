// لوحة المالك: ملفات المدربين الجديدة. المالك يراجع البيانات والشهادات ثم يعتمد (يتوثّق ويظهر للناس) أو يرفض بسبب يوصل للمدرب
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { Chip } from '@/components/coaching/parts';
import { Avatar, Button, Card, Input, Row, T } from '@/components/ui';
import { loadVerificationQueue, reviewCoach, type VerifyReq } from '@/lib/coaching';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { errorKey, publicUrl } from '@/lib/supabase';
import { colors, space } from '@/theme';

export function CoachVerifyQueue() {
  const { t } = useTranslation();
  const [q, setQ] = useState<VerifyReq[]>([]);
  const load = useCallback(() => { loadVerificationQueue().then(setQ); }, []);
  useFocusEffect(load);
  if (!q.length) return null;
  return (
    <Card style={{ gap: space.md }}>
      <T semibold>{t('coaching.reviewQueue', { count: q.length })}</T>
      {q.map((r) => <Item key={r.user_id} r={r} onDone={load} />)}
    </Card>
  );
}

function Item({ r, onDone }: { r: VerifyReq; onDone: () => void }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const name = r.full_name || r.username;

  const decide = async (d: 'approved' | 'rejected') => {
    if (d === 'rejected' && note.trim().length < 3) return Alert.alert(t('coaching.err_rejectNote'));
    setBusy(true);
    try { await reviewCoach(r.user_id, d, d === 'rejected' ? note : undefined); onDone(); }
    catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };

  return (
    <View style={{ gap: 6, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
      <Row gap={space.sm}>
        <Avatar size={40} uri={publicUrl('avatars', r.avatar_url)} name={name} />
        <View style={{ flex: 1 }}>
          <T semibold>{name} · @{r.username}</T>
          <T size="xs" muted>{t('coaching.submittedAgo', { ago: timeAgo(r.submitted_at, lng) })}</T>
        </View>
      </Row>
      {r.headline ? <T size="sm" semibold>{r.headline}</T> : null}
      {r.specialties.length ? <Row gap={6} style={{ flexWrap: 'wrap' }}>{r.specialties.map((s) => <Chip key={s} label={t(`coaching.sp_${s}`)} />)}</Row> : null}
      <T size="xs" muted>
        {[r.years_exp != null ? t('coaching.yearsN', { count: r.years_exp }) : null, r.city, t(`coaching.trains_${r.trains}`),
          r.in_person ? t('coaching.inPerson') : null, r.online ? t('coaching.online') : null,
          r.price_from_sar ? t('coaching.fromPrice', { n: Math.round(r.price_from_sar) }) : null, r.instagram ? `@${r.instagram}` : null]
          .filter(Boolean).join(' · ')}
      </T>
      <View style={{ gap: 2 }}>
        <T size="xs" semibold>{t('coaching.certs')}</T>
        <T size="sm">{r.certifications || '—'}</T>
      </View>
      {r.gyms.length ? <T size="xs" muted>{t('coaching.trainsAt')}: {r.gyms.join('، ')}</T> : null}
      {r.bio ? <T size="xs" muted numberOfLines={4}>{r.bio}</T> : null}

      {rejecting ? (
        <View style={{ gap: space.sm }}>
          <Input value={note} onChangeText={setNote} maxLength={300} multiline placeholder={t('coaching.rejectNotePh')} />
          <Row gap={space.sm}>
            <Button small style={{ flex: 1 }} variant="secondary" title={t('coaching.sendReject')} loading={busy} onPress={() => decide('rejected')} />
            <Button small variant="ghost" title={t('common.cancel')} onPress={() => setRejecting(false)} />
          </Row>
        </View>
      ) : (
        <Row gap={space.sm}>
          <Button small style={{ flex: 1 }} icon="checkmark-circle-outline" title={t('coaching.approve')} loading={busy} onPress={() => decide('approved')} />
          <Button small variant="secondary" title={t('coaching.reject')} onPress={() => setRejecting(true)} />
          <Button small variant="ghost" title={t('coaching.viewProfile')} onPress={() => router.push({ pathname: '/coaches/[id]', params: { id: r.user_id } })} />
        </Row>
      )}
    </View>
  );
}
