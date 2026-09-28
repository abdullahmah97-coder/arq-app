// لوحة المدرب: الطلبات، دعوة متدرب، متدربيني (الالتزام وآخر تمرين)، الحصص القادمة، والأدوات
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { ReviewStatus, VerifiedBadge } from '@/components/coaching/parts';
import { Avatar, Button, Card, Empty, Input, Loading, Row, Screen, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { fmtRiyadh, inviteClient, loadCoachClients, loadMyCoachProfile, loadSessions, respondLink, setSessionStatus, type CoachClient, type CoachProfile, type CoachSession } from '@/lib/coaching';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { errorKey, publicUrl } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

export default function CoachHub() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId, profile } = useUser();
  const [me, setMe] = useState<CoachProfile | null | undefined>(undefined);
  const [clients, setClients] = useState<CoachClient[]>([]);
  const [sessions, setSessions] = useState<CoachSession[]>([]);
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    loadMyCoachProfile(userId).then(setMe).catch(() => setMe(null));
    loadCoachClients().then(setClients).catch(() => {});
    loadSessions({ coachId: userId, upcoming: true }).then((s) => setSessions(s.filter((x) => x.status === 'booked'))).catch(() => {});
  }, [userId]);
  useFocusEffect(load);

  if (me === undefined) return <Loading />;
  if (!me) {
    return (
      <Screen edges={['bottom']}>
        <Stack.Screen options={{ title: t('coaching.hub') }} />
        <Empty icon="ribbon-outline" text={t('coaching.becomeIntro')} />
        <Button icon="add" title={t('coaching.createProfile')} onPress={() => router.push('/coaching/profile')} />
      </Screen>
    );
  }
  const pending = clients.filter((c) => c.status === 'pending');
  const incoming = pending.filter((c) => c.requested_by === 'client');
  const active = clients.filter((c) => c.status === 'active');
  const nameOf = (id: string) => { const c = clients.find((x) => x.client_id === id); return c ? c.full_name || c.username : ''; };

  const sendInvite = async () => {
    if (invite.trim().length < 3) return;
    setBusy(true);
    try { await inviteClient(invite.trim()); setInvite(''); Alert.alert(t('coaching.inviteSent')); load(); } catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };
  const respond = async (c: CoachClient, ok: boolean) => { try { await respondLink(c.link_id, ok); load(); } catch (e) { Alert.alert(t(errorKey(e))); } };
  const mark = (s: CoachSession) => Alert.alert(t('coaching.sessionHow'), fmtRiyadh(s.starts_at, lng), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('coaching.st_no_show'), onPress: () => setSessionStatus(s.id, 'no_show').then(load) },
    { text: t('coaching.st_done'), onPress: () => setSessionStatus(s.id, 'done').then(load) },
  ]);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('coaching.hub') }} />
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Avatar size={48} uri={publicUrl('avatars', profile.avatar_url)} name={profile.full_name ?? profile.username} />
        <View style={{ flex: 1, gap: 2 }}>
          <Row gap={6}><T semibold>{profile.full_name || profile.username}</T>{profile.is_coach ? <VerifiedBadge small /> : null}</Row>
          <T size="xs" muted>{t('coaching.hubStats', { active: active.length, pending: pending.length, sessions: sessions.length })}</T>
        </View>
        <Pressable onPress={() => router.push({ pathname: '/coaches/[id]', params: { id: userId } })} hitSlop={8}><T size="xs" semibold color={colors.primary}>{t('coaching.viewPublic')}</T></Pressable>
      </Card>

      {me.status !== 'approved' ? <ReviewStatus status={me.status} note={me.review_note} onEdit={() => router.push('/coaching/profile')} /> : null}

      <Row gap={space.sm}>
        <Tool icon="create-outline" label={t('coaching.editProfile')} onPress={() => router.push('/coaching/profile')} />
        <Tool icon="pricetags-outline" label={t('coaching.packages')} onPress={() => router.push('/coaching/packages')} />
        <Tool icon="clipboard-outline" label={t('coaching.myPrograms')} onPress={() => router.push('/programs')} />
      </Row>

      {incoming.length ? <T size="lg" bold>{t('coaching.requests')}</T> : null}
      {incoming.map((c) => (
        <Card key={c.link_id} style={{ gap: space.sm }}>
          <Row><Avatar size={36} uri={publicUrl('avatars', c.avatar_url)} name={c.full_name ?? c.username} /><T semibold style={{ flex: 1 }}>{c.full_name || c.username}</T><T size="xs" muted>{timeAgo(c.created_at, lng)}</T></Row>
          {c.message ? <T size="sm">«{c.message}»</T> : null}
          <T size="xs" muted>{t('coaching.theyAllow')}: {c.scopes.length ? c.scopes.map((s) => t(`coaching.scope_${s}`)).join('، ') : t('coaching.basicOnly')}</T>
          <Row gap={space.sm}>
            <Button small style={{ flex: 1 }} title={t('coaching.accept')} onPress={() => respond(c, true)} />
            <Button small variant="ghost" title={t('coaching.decline')} onPress={() => respond(c, false)} />
          </Row>
        </Card>
      ))}

      {me.status === 'approved' ? <Card style={{ gap: space.sm }}>
        <T semibold>{t('coaching.inviteTitle')}</T>
        <Row gap={space.sm}>
          <View style={{ flex: 1 }}><Input value={invite} onChangeText={setInvite} placeholder="@username" autoCapitalize="none" autoCorrect={false} /></View>
          <Button small title={t('coaching.invite')} loading={busy} onPress={sendInvite} />
        </Row>
        <T size="xs" muted>{t('coaching.inviteHint')}</T>
        {pending.filter((c) => c.requested_by === 'coach').map((c) => <T key={c.link_id} size="xs" muted>⏳ @{c.username} · {t('coaching.waitingApproval')}</T>)}
      </Card> : null}

      <T size="lg" bold>{t('coaching.myClients')}</T>
      {active.length ? active.map((c) => (
        <Pressable key={c.link_id} onPress={() => router.push({ pathname: '/coaching/client/[id]', params: { id: c.client_id } })}
          style={({ pressed }) => ({ padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, gap: 6, opacity: pressed ? 0.85 : 1 })}>
          <Row>
            <Avatar size={40} uri={publicUrl('avatars', c.avatar_url)} name={c.full_name ?? c.username} />
            <View style={{ flex: 1 }}>
              <T semibold>{c.full_name || c.username}</T>
              <T size="xs" muted numberOfLines={1}>{c.program ?? t('coaching.noProgram')}</T>
            </View>
            {c.adherence != null ? (
              <View style={{ alignItems: 'center' }}>
                <T bold color={c.adherence >= 80 ? brand.green : c.adherence >= 50 ? brand.amber : brand.orange}>{c.adherence}%</T>
                <T size="xs" muted>{t('coaching.adherence')}</T>
              </View>
            ) : null}
          </Row>
          <Row gap={space.md} style={{ flexWrap: 'wrap' }}>
            {c.last_workout_at ? <T size="xs" muted>🏋️ {timeAgo(c.last_workout_at, lng)}</T> : null}
            {c.last_visit_at ? <T size="xs" muted>📍 {timeAgo(c.last_visit_at, lng)}</T> : null}
            {c.next_session_at ? <T size="xs" semibold color={colors.primary}>{t('coaching.nextSession')}: {fmtRiyadh(c.next_session_at, lng)}</T> : null}
          </Row>
        </Pressable>
      )) : <Empty icon="people-outline" text={t('coaching.noClients')} />}

      {sessions.length ? <T size="lg" bold>{t('coaching.upcomingSessions')}</T> : null}
      {sessions.slice(0, 10).map((s) => (
        <Pressable key={s.id} onPress={() => mark(s)}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Ionicons name="calendar-outline" size={18} color={brand.deepGreen} />
            <View style={{ flex: 1 }}>
              <T size="sm" semibold>{nameOf(s.client_id)}</T>
              <T size="xs" muted>{fmtRiyadh(s.starts_at, lng)} · {t('gymops.minutesN', { count: s.duration_min })}{s.place ? ` · ${s.place}` : ''}</T>
            </View>
            <T size="xs" color={colors.primary}>{t('coaching.markSession')}</T>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

function Tool({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 6, paddingVertical: space.md, borderRadius: radius.lg,
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 })}>
      <Ionicons name={icon} size={22} color={brand.deepGreen} />
      <T size="xs" semibold center>{label}</T>
    </Pressable>
  );
}
