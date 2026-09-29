// اشتراكي: اشتراكاتي في الأندية، بطاقة الدخول، ربط اشتراك برمز، طلب تجميد/نقل، الحصص، ادعُ صديقك، وملاحظاتي للنادي
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Share, View } from 'react-native';
import { Button, Card, Empty, Input, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import {
  claimMembership, loadMyFeedback, loadMyMemberships, loadMyRequests, myReferral, requestChange, sendGymFeedback, STATE_COLOR, type MyMembership,
 daysLeftText } from '@/lib/gymops';
import { useLocalized } from '@/lib/i18n';
import { errorKey } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

export default function MyMembershipScreen() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId } = useUser();
  const [items, setItems] = useState<MyMembership[] | null>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<any[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<{ id: string; mode: 'freeze' | 'feedback' | 'invite' } | null>(null);

  const load = useCallback(() => {
    loadMyMemberships().then(setItems).catch(() => setItems([]));
    loadMyRequests().then(setRequests).catch(() => {});
    loadMyFeedback(userId).then(setFeedback).catch(() => {});
  }, [userId]);
  useFocusEffect(load);

  const claim = async () => {
    if (code.trim().length < 8) return Alert.alert(t('gymops.claimHint'));
    setBusy(true);
    try { await claimMembership(code); setCode(''); load(); Alert.alert(t('gymops.claimed')); }
    catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };

  if (items === null) return <Loading />;
  const live = items.filter((m) => m.state !== 'expired' && m.state !== 'cancelled');
  const past = items.filter((m) => m.state === 'expired' || m.state === 'cancelled');

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('gymops.myMembership') }} />
      {live.length ? (
        <Button icon="qr-code" title={t('gymops.showCard')} onPress={() => router.push('/membership/card')} />
      ) : null}

      {items.length ? null : <Empty icon="card-outline" text={t('gymops.noMemberships')} />}

      {live.map((m) => (
        <MembershipCard key={m.id} m={m} lng={lng} pending={requests.some((r) => r.membership_id === m.id && r.status === 'pending')}
          open={open?.id === m.id ? open.mode : null} onOpen={(mode) => setOpen(open?.id === m.id && open.mode === mode ? null : { id: m.id, mode })}
          userId={userId} onDone={() => { setOpen(null); load(); }} />
      ))}

      <Card style={{ gap: space.sm }}>
        <T semibold>{t('gymops.claimTitle')}</T>
        <T size="xs" muted>{t('gymops.claimHint')}</T>
        <Row gap={space.sm}>
          <View style={{ flex: 1 }}><Input value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" maxLength={8} placeholder="ABCD2345" /></View>
          <Button small title={t('gymops.claim')} loading={busy} onPress={claim} />
        </Row>
      </Card>

      {feedback.length ? (
        <View style={{ gap: space.sm }}>
          <T bold>{t('gymops.myFeedback')}</T>
          {feedback.map((f) => (
            <Card key={f.id} style={{ gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T size="xs" semibold color={colors.primary}>{t(`gymops.fb_${f.category}`)}</T>
                <T size="xs" muted>{t(`gymops.fbs_${f.status}`)}</T>
              </Row>
              <T size="sm">{f.body}</T>
              {f.reply ? <View style={{ backgroundColor: colors.bg, borderRadius: radius.md, padding: space.sm }}><T size="xs" semibold>{t('gymops.gymReply')}</T><T size="sm">{f.reply}</T></View> : null}
            </Card>
          ))}
        </View>
      ) : null}

      {past.length ? (
        <View style={{ gap: space.sm }}>
          <T bold muted>{t('gymops.pastMemberships')}</T>
          {past.map((m) => <MembershipCard key={m.id} m={m} lng={lng} compact userId={userId} onDone={load} />)}
        </View>
      ) : null}
    </Screen>
  );
}

function MembershipCard({ m, lng, compact, pending, open, onOpen, userId, onDone }: {
  m: MyMembership; lng: 'ar' | 'en'; compact?: boolean; pending?: boolean; open?: 'freeze' | 'feedback' | 'invite' | null;
  onOpen?: (mode: 'freeze' | 'feedback' | 'invite') => void; userId: string; onDone: () => void;
}) {
  const { t } = useTranslation();
  const name = lng === 'en' && m.target_name_en ? m.target_name_en : m.target_name;
  const total = Math.max(1, (new Date(m.ends_on).getTime() - new Date(m.starts_on).getTime()) / 86400000 + 1);
  const pct = Math.min(1, Math.max(0, m.days_left / total));
  return (
    <Card style={{ gap: space.sm, opacity: compact ? 0.75 : 1 }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T bold numberOfLines={1}>{name}</T>
          <T size="sm" muted>{m.plan_name}{m.kind === 'pass' ? ` · ${t('gymops.pass')}` : ''}</T>
        </View>
        <View style={{ backgroundColor: STATE_COLOR[m.state], borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
          <T size="xs" semibold color="#fff">{t(`gymops.state_${m.state}`)}</T>
        </View>
      </Row>
      {!compact ? (
        <>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.cardAlt, overflow: 'hidden' }}>
            <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: m.days_left <= 7 ? brand.orange : brand.deepGreen }} />
          </View>
          <Row style={{ justifyContent: 'space-between' }}>
            <T size="sm" semibold color={m.days_left <= 7 ? brand.orange : colors.text}>{daysLeftText(t, m.days_left)}</T>
            <T size="xs" muted>{t('gymops.endsOn', { date: m.ends_on })}</T>
          </Row>
          {m.state === 'frozen' && m.frozen_until ? <T size="xs" color="#5B8DEF">{t('gymops.frozenUntil', { date: m.frozen_until })}</T> : null}
          {pending ? <T size="xs" muted>{t('gymops.requestPending')}</T> : null}
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {m.gym_id ? <Chip icon="calendar-outline" label={t('gymops.classes')} onPress={() => router.push({ pathname: '/classes/[gymId]', params: { gymId: m.gym_id! } })} /> : null}
            {!pending ? <Chip icon="snow-outline" label={t('gymops.freeze')} active={open === 'freeze'} onPress={() => onOpen?.('freeze')} /> : null}
            {m.gym_id ? <Chip icon="gift-outline" label={t('gymops.invite')} active={open === 'invite'} onPress={() => onOpen?.('invite')} /> : null}
            {m.gym_id ? <Chip icon="chatbox-ellipses-outline" label={t('gymops.feedback')} active={open === 'feedback'} onPress={() => onOpen?.('feedback')} /> : null}
          </Row>
          {open === 'freeze' ? <FreezeForm m={m} onDone={onDone} /> : null}
          {open === 'invite' && m.gym_id ? <InviteBox gymId={m.gym_id} gymName={name} /> : null}
          {open === 'feedback' && m.gym_id ? <FeedbackForm gymId={m.gym_id} userId={userId} onDone={onDone} /> : null}
        </>
      ) : <T size="xs" muted>{t('gymops.endedOn', { date: m.ends_on })}</T>}
    </Card>
  );
}

function Chip({ icon, label, onPress, active }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!active }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
        backgroundColor: active ? brand.deepGreen : colors.bg, borderWidth: 1, borderColor: active ? brand.deepGreen : colors.border }}>
      <Ionicons name={icon} size={14} color={active ? brand.amber : colors.text} />
      <T size="xs" semibold color={active ? brand.cream : colors.text}>{label}</T>
    </Pressable>
  );
}

function FreezeForm({ m, onDone }: { m: MyMembership; onDone: () => void }) {
  const { t } = useTranslation();
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await requestChange(m.id, 'freeze', { days, reason }); Alert.alert(t('gymops.requestSent')); onDone(); }
    catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };
  return (
    <View style={{ gap: space.sm, backgroundColor: colors.bg, borderRadius: radius.lg, padding: space.md }}>
      <T size="sm" semibold>{t('gymops.freezeTitle')}</T>
      <Segmented<number> wrap value={days} onChange={setDays} options={[7, 14, 30, 60].map((d) => ({ value: d, label: t('gymops.daysN', { count: d }) }))} />
      <Input value={reason} onChangeText={setReason} maxLength={300} placeholder={t('gymops.freezeReasonPh')} />
      <T size="xs" muted>{t('gymops.freezeHint')}</T>
      <Button small title={t('gymops.sendRequest')} loading={busy} onPress={send} />
    </View>
  );
}

function InviteBox({ gymId, gymName }: { gymId: string; gymName: string }) {
  const { t } = useTranslation();
  const [r, setR] = useState<{ code: string; reward: string | null; joined: number } | null | undefined>(undefined);
  useFocusEffect(useCallback(() => { myReferral(gymId).then(setR).catch(() => setR(null)); }, [gymId]));
  if (r === undefined) return <T size="xs" muted>…</T>;
  if (!r) return null;
  const msg = t('gymops.inviteMsg', { gym: gymName, code: r.code });
  return (
    <View style={{ gap: space.sm, backgroundColor: colors.bg, borderRadius: radius.lg, padding: space.md, alignItems: 'center' }}>
      <T size="sm" muted center>{t('gymops.yourCode')}</T>
      <T size="xl" bold style={{ letterSpacing: 4 }}>{r.code}</T>
      {r.reward ? <T size="sm" center>{t('gymops.reward')}: {r.reward}</T> : null}
      <T size="xs" muted>{t('gymops.joinedN', { count: r.joined })}</T>
      <Button small icon="share-social-outline" title={t('gymops.shareCode')} onPress={() => Share.share({ message: msg })} />
    </View>
  );
}

function FeedbackForm({ gymId, userId, onDone }: { gymId: string; userId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [cat, setCat] = useState<'complaint' | 'suggestion' | 'praise'>('suggestion');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (body.trim().length < 3) return;
    setBusy(true);
    try { await sendGymFeedback(userId, gymId, cat, body); Alert.alert(t('gymops.feedbackSent')); onDone(); }
    catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };
  return (
    <View style={{ gap: space.sm, backgroundColor: colors.bg, borderRadius: radius.lg, padding: space.md }}>
      <Segmented<'complaint' | 'suggestion' | 'praise'> wrap value={cat} onChange={setCat} options={[
        { value: 'suggestion', label: t('gymops.fb_suggestion') }, { value: 'complaint', label: t('gymops.fb_complaint') }, { value: 'praise', label: t('gymops.fb_praise') },
      ]} />
      <Input value={body} onChangeText={setBody} multiline maxLength={800} placeholder={t('gymops.feedbackPh')} />
      <T size="xs" muted>{t('gymops.feedbackHint')}</T>
      <Button small title={t('gymops.send')} loading={busy} onPress={send} />
    </View>
  );
}
