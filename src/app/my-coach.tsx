// مدربي: الدعوات (أوافق وأحدد وش يشوف)، مدربيني وصلاحياتهم، البرنامج، الحصص، آخر اطلاع، وإنهاء التدريب
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { Chip, ScopePicker, VerifiedBadge } from '@/components/coaching/parts';
import { Avatar, Button, Card, Empty, Loading, Row, Screen, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { cancelMySession, endLink, fmtRiyadh, loadAccessLog, loadMyCoaches, loadSessions, respondLink, setScopes,
  type AccessRow, type CoachSession, type MyCoach, type Scope } from '@/lib/coaching';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { errorKey, publicUrl } from '@/lib/supabase';
import { brand, colors, space } from '@/theme';

export default function MyCoachScreen() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId } = useUser();
  const [list, setList] = useState<MyCoach[] | null>(null);
  const [sessions, setSessions] = useState<CoachSession[]>([]);
  const [access, setAccess] = useState<AccessRow[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Scope[]>([]);

  const load = useCallback(() => {
    loadMyCoaches().then(setList).catch(() => setList([]));
    loadSessions({ clientId: userId, upcoming: true }).then((s) => setSessions(s.filter((x) => x.status === 'booked'))).catch(() => {});
    loadAccessLog().then(setAccess).catch(() => {});
  }, [userId]);
  useFocusEffect(load);

  if (list === null) return <Loading />;
  const invites = list.filter((c) => c.status === 'pending' && c.requested_by === 'coach');
  const waiting = list.filter((c) => c.status === 'pending' && c.requested_by === 'client');
  const active = list.filter((c) => c.status === 'active');
  const nameOf = (c: MyCoach) => c.full_name || c.username;

  const accept = async (c: MyCoach) => { try { await respondLink(c.link_id, true, draft); setEditing(null); load(); } catch (e) { Alert.alert(t(errorKey(e))); } };
  const saveScopes = async (c: MyCoach) => { try { await setScopes(c.link_id, draft); setEditing(null); load(); Alert.alert(t('coaching.scopesSaved')); } catch (e) { Alert.alert(t(errorKey(e))); } };
  const end = (c: MyCoach) => Alert.alert(t('coaching.endTitle'), t('coaching.endBodyClient', { name: nameOf(c) }), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('coaching.end'), style: 'destructive', onPress: async () => { await endLink(c.link_id); load(); } },
  ]);
  const cancel = (s: CoachSession) => Alert.alert(t('coaching.cancelSession'), fmtRiyadh(s.starts_at, lng), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('coaching.yesCancel'), style: 'destructive', onPress: async () => { try { await cancelMySession(s.id); load(); } catch (e) { Alert.alert(t(errorKey(e))); } } },
  ]);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('coaching.myCoach') }} />

      {invites.map((c) => (
        <Card key={c.link_id} style={{ gap: space.sm, borderColor: brand.amber }}>
          <Row>
            <Avatar size={40} uri={publicUrl('avatars', c.avatar_url)} name={nameOf(c)} />
            <View style={{ flex: 1 }}>
              <Row gap={6}><T semibold>{t('coaching.invitedBy', { name: nameOf(c) })}</T>{c.verified ? <VerifiedBadge small /> : null}</Row>
              {c.headline ? <T size="xs" muted>{c.headline}</T> : null}
            </View>
          </Row>
          {c.message ? <T size="sm">«{c.message}»</T> : null}
          {editing === c.link_id ? (
            <>
              <T size="sm" semibold>{t('coaching.whatCanSee', { name: nameOf(c) })}</T>
              <ScopePicker value={draft} onChange={setDraft} />
              <Row gap={space.sm}>
                <Button style={{ flex: 1 }} title={t('coaching.acceptInvite')} onPress={() => accept(c)} />
                <Button variant="ghost" title={t('common.cancel')} onPress={() => setEditing(null)} />
              </Row>
            </>
          ) : (
            <Row gap={space.sm}>
              <Button small style={{ flex: 1 }} title={t('coaching.review')} onPress={() => { setEditing(c.link_id); setDraft(['workouts', 'visits']); }} />
              <Button small variant="ghost" title={t('coaching.decline')} onPress={() => respondLink(c.link_id, false).then(load)} />
              <Pressable onPress={() => router.push({ pathname: '/coaches/[id]', params: { id: c.coach_id } })}><T size="xs" color={colors.primary}>{t('coaching.viewProfile')}</T></Pressable>
            </Row>
          )}
        </Card>
      ))}

      {active.length ? active.map((c) => (
        <Card key={c.link_id} style={{ gap: space.sm }}>
          <Pressable onPress={() => router.push({ pathname: '/coaches/[id]', params: { id: c.coach_id } })}>
            <Row>
              <Avatar size={44} uri={publicUrl('avatars', c.avatar_url)} name={nameOf(c)} />
              <View style={{ flex: 1 }}>
                <Row gap={6}><T semibold>{nameOf(c)}</T>{c.verified ? <VerifiedBadge small /> : null}</Row>
                <T size="xs" muted>{c.last_access_at ? t('coaching.lastAccess', { ago: timeAgo(c.last_access_at, lng) }) : t('coaching.noAccessYet')}</T>
              </View>
              <Ionicons name="chevron-back" size={16} color={colors.muted} />
            </Row>
          </Pressable>
          {c.program ? (
            <View style={{ backgroundColor: colors.cardAlt, borderRadius: 10, padding: space.sm, gap: 2 }}>
              <T size="xs" muted>{t('coaching.myProgram')}</T>
              <T size="sm" semibold>{c.program} · {t('coaching.daysN', { count: c.program_days ?? 3 })}</T>
              {c.program_notes ? <T size="xs">{c.program_notes}</T> : null}
            </View>
          ) : null}
          {c.next_session_at ? <T size="sm" semibold color={colors.primary}>{t('coaching.nextSession')}: {fmtRiyadh(c.next_session_at, lng)}</T> : null}
          {editing === c.link_id ? (
            <>
              <ScopePicker value={draft} onChange={setDraft} />
              <Row gap={space.sm}>
                <Button small style={{ flex: 1 }} title={t('common.save')} onPress={() => saveScopes(c)} />
                <Button small variant="ghost" title={t('common.cancel')} onPress={() => setEditing(null)} />
              </Row>
            </>
          ) : (
            <>
              <Row gap={6} style={{ flexWrap: 'wrap' }}>
                <T size="xs" muted>{t('coaching.canSee')}:</T>
                {c.scopes.length ? c.scopes.map((s) => <Chip key={s} label={t(`coaching.scope_${s}`)} />) : <T size="xs" muted>{t('coaching.basicOnly')}</T>}
              </Row>
              <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
                <Button small variant="secondary" icon="shield-checkmark-outline" title={t('coaching.editScopes')} onPress={() => { setEditing(c.link_id); setDraft(c.scopes); }} />
                <Button small variant="secondary" icon="chatbubble-ellipses-outline" title={t('coaching.message')} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.coach_id } })} />
                <Button small variant="ghost" title={t('coaching.end')} onPress={() => end(c)} />
              </Row>
            </>
          )}
        </Card>
      )) : !invites.length ? <Empty icon="barbell-outline" text={t('coaching.noCoachYet')} /> : null}

      {waiting.map((c) => <T key={c.link_id} size="sm" muted>⏳ {t('coaching.waitingCoach', { name: nameOf(c) })}</T>)}

      {sessions.length ? <T size="lg" bold>{t('coaching.upcomingSessions')}</T> : null}
      {sessions.map((s) => (
        <Card key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Ionicons name="calendar-outline" size={18} color={brand.deepGreen} />
          <View style={{ flex: 1 }}>
            <T size="sm" semibold>{fmtRiyadh(s.starts_at, lng)}</T>
            <T size="xs" muted>{t('gymops.minutesN', { count: s.duration_min })}{s.place ? ` · ${s.place}` : ''}</T>
          </View>
          <Pressable hitSlop={8} onPress={() => cancel(s)}><T size="xs" color={colors.danger}>{t('coaching.cancelSession')}</T></Pressable>
        </Card>
      ))}

      {access.length ? (
        <Card style={{ gap: 6 }}>
          <T semibold>{t('coaching.accessLog')}</T>
          {access.slice(0, 8).map((a, i) => {
            const c = list.find((x) => x.coach_id === a.coach_id);
            return <T key={i} size="xs" muted>{t('coaching.accessRow', { name: c ? nameOf(c) : t('coaching.formerCoach'), what: t(`coaching.what_${a.what}`), ago: timeAgo(a.at, lng) })}</T>;
          })}
        </Card>
      ) : null}

      <Row gap={space.sm}>
        <Button style={{ flex: 1 }} icon="search" title={t('coaching.findCoach')} onPress={() => router.push('/coaches')} />
        <Button style={{ flex: 1 }} variant="secondary" icon="document-text-outline" title={t('coaching.myRecord')} onPress={() => router.push('/record')} />
      </Row>
      <T size="xs" muted center>{t('coaching.privacyNote')}</T>
    </Screen>
  );
}
