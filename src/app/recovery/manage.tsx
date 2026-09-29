// لوحة تحكم مركز العلاج الطبيعي والاستشفاء: الحالة، الصفحة والعرض، طلبات المواعيد وتأكيدها، وتنبيه اللي عندهم موعد فقط.
// المالك يفتحها لأي مركز (?id=)
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { AdminBanner, Metric, StatusPill } from '@/components/partners/parts';
import { PromptModal } from '@/components/PromptModal';
import { CenterCard } from '@/components/recovery/parts';
import { Avatar, Button, Card, Empty, Input, Loading, Row, Screen, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { fmtRiyadh, parseRiyadh } from '@/lib/coaching';
import { useLocalized } from '@/lib/i18n';
import {
  centerAppointments, closeAppointment, loadCenter, loadMyCenter, respondAppointment, sendCenterNotice, type CenterAppointment, type RecoveryCenter,
} from '@/lib/recovery';
import { errorKey, publicUrl } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

export default function ManageCenter() {
  const { id: adminId } = useLocalSearchParams<{ id?: string }>();
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId } = useUser();
  const [c, setC] = useState<RecoveryCenter | null | undefined>(undefined);
  const [appts, setAppts] = useState<CenterAppointment[]>([]);
  const [confirming, setConfirming] = useState<CenterAppointment | null>(null);
  const [declining, setDeclining] = useState<CenterAppointment | null>(null);

  const load = useCallback(() => {
    (adminId ? loadCenter(String(adminId)) : loadMyCenter(userId)).then((x) => {
      setC(x);
      if (x) centerAppointments(x.id).then(setAppts).catch(() => {});
    }).catch(() => setC(null));
  }, [userId, adminId]);
  useFocusEffect(load);

  if (c === undefined) return <Loading />;
  if (!c) return (
    <Screen><Empty icon="medkit-outline" text={t('partners.noCenterYet')} />
      <Button title={t('recovery.addCenter')} icon="add" onPress={() => router.replace('/recovery/join')} /></Screen>
  );
  const requests = appts.filter((a) => a.status === 'requested');
  const upcoming = appts.filter((a) => a.status === 'confirmed');
  const past = appts.filter((a) => !['requested', 'confirmed'].includes(a.status)).slice(0, 15);
  const linked = new Set(appts.filter((a) => a.status !== 'declined' && a.status !== 'cancelled').map((a) => a.user_id)).size;
  const run = async (fn: () => Promise<void>) => { try { await fn(); load(); } catch (e) { Alert.alert(t(errorKey(e))); } };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('partners.centerDashboard') }} />
      {adminId ? <AdminBanner /> : null}
      <Card style={{ gap: space.sm, borderColor: c.status === 'approved' ? colors.success : c.status === 'pending' ? brand.amber : colors.danger }}>
        <Row>
          <T semibold style={{ flex: 1 }}>{t(`recovery.status_${c.status}`)}</T>
          <Button small variant="secondary" icon="create-outline" title={t('recovery.editCenter')}
            onPress={() => router.push({ pathname: '/recovery/join', params: adminId ? { id: c.id } : {} })} />
        </Row>
        {c.review_note && c.status !== 'approved' ? <T size="sm">{t('coaching.reviewNote')}: {c.review_note}</T> : null}
      </Card>
      <CenterCard c={c} />

      <Row gap={space.sm}>
        <Metric icon="mail-unread-outline" n={requests.length} label={t('partners.apptRequests')} />
        <Metric icon="calendar-outline" n={upcoming.length} label={t('partners.apptUpcoming')} />
        <Metric icon="people-outline" n={linked} label={t('partners.linkedPeople')} />
      </Row>

      <T size="lg" bold>{t('partners.appointments')}</T>
      {requests.length + upcoming.length ? [...requests, ...upcoming].map((a) => (
        <Card key={a.id} style={{ gap: 6 }}>
          <Row gap={space.sm}>
            <Avatar size={36} uri={publicUrl('avatars', a.avatar_url)} name={a.name} />
            <View style={{ flex: 1 }}>
              <T semibold>{a.name}</T>
              <T size="xs" muted>{a.starts_at ? fmtRiyadh(a.starts_at, lng) : a.preferred || t('partners.anyTime')}</T>
            </View>
            <StatusPill status={a.status} label={t(`partners.appt_${a.status}`)} />
          </Row>
          {a.note ? <T size="sm" muted>{a.note}</T> : null}
          {a.status === 'requested' ? (
            <Row gap={space.sm}>
              <Button small style={{ flex: 1 }} icon="checkmark" title={t('partners.confirmAppt')} onPress={() => setConfirming(a)} />
              <Button small variant="ghost" title={t('subs.decline')} onPress={() => setDeclining(a)} />
            </Row>
          ) : (
            <Row gap={space.sm}>
              <Button small style={{ flex: 1 }} variant="secondary" icon="checkmark-done" title={t('partners.markDone')} onPress={() => run(() => closeAppointment(a.id, 'done'))} />
              <Button small variant="ghost" title={t('partners.cancelAppt')} onPress={() => run(() => closeAppointment(a.id, 'cancelled'))} />
            </Row>
          )}
        </Card>
      )) : <T size="sm" muted>{t('partners.noAppointments')}</T>}
      {past.length ? (
        <Card style={{ gap: 4 }}>
          <T size="sm" semibold>{t('partners.pastAppointments')}</T>
          {past.map((a) => (
            <Row key={a.id}>
              <T size="xs" style={{ flex: 1 }}>{a.name}{a.starts_at ? ` · ${fmtRiyadh(a.starts_at, lng)}` : ''}</T>
              <StatusPill status={a.status} label={t(`partners.appt_${a.status}`)} />
            </Row>
          ))}
        </Card>
      ) : null}

      <Notice centerId={c.id} linked={linked} disabled={c.status !== 'approved'} />

      <PromptModal visible={!!confirming} title={t('partners.confirmAppt')} message={confirming ? t('partners.confirmHint', { pref: confirming.preferred || t('partners.anyTime') }) : undefined}
        fields={[{ key: 'when', label: t('partners.apptTime'), placeholder: '2026-10-05 17:30' }, { key: 'note', label: t('partners.noteOptional'), multiline: true }]}
        onClose={() => setConfirming(null)}
        onSubmit={async (v) => {
          const when = parseRiyadh(v.when);
          if (!when || when.getTime() < Date.now()) return Alert.alert(t('partners.err_time'));
          if (confirming) await run(() => respondAppointment(confirming.id, true, when, v.note));
          setConfirming(null);
        }} />
      <PromptModal visible={!!declining} title={t('subs.decline')} fields={[{ key: 'note', label: t('partners.noteOptional'), multiline: true }]}
        onClose={() => setDeclining(null)} danger confirm={t('subs.decline')}
        onSubmit={async (v) => { if (declining) await run(() => respondAppointment(declining.id, false, null, v.note)); setDeclining(null); }} />
    </Screen>
  );
}

/** تنبيه المركز: يوصل فقط للي عندهم موعد (مرة باليوم) */
function Notice({ centerId, linked, disabled }: { centerId: string; linked: number; disabled: boolean }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (title.trim().length < 3 || body.trim().length < 3) return Alert.alert(t('partners.err_announce'));
    setBusy(true);
    try {
      const n = await sendCenterNotice(centerId, title, body);
      Alert.alert(t('partners.sent'), t('partners.sentTo', { n }));
      setTitle(''); setBody('');
    } catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };
  return (
    <Card style={{ gap: space.sm }}>
      <Row gap={8}>
        <Ionicons name="megaphone-outline" size={20} color={colors.primary} />
        <T bold style={{ flex: 1 }}>{t('partners.announceTitle')}</T>
        <T size="xs" muted>{t('partners.audienceN', { n: linked })}</T>
      </Row>
      <View style={{ backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: space.sm }}>
        <T size="xs" muted style={{ lineHeight: 19 }}>{t('partners.announceRuleCenter')}</T>
      </View>
      <Input value={title} onChangeText={setTitle} maxLength={60} placeholder={t('partners.announceTitlePh')} />
      <Input value={body} onChangeText={setBody} maxLength={240} multiline style={{ minHeight: 70, textAlignVertical: 'top' }} placeholder={t('partners.announceBodyPh')} />
      <Button icon="paper-plane-outline" title={t('partners.sendAnnounce')} loading={busy} disabled={disabled || !linked} onPress={send} />
    </Card>
  );
}
