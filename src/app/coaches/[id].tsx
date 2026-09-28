// صفحة المدرب: النبذة، التخصصات، الأندية، الباقات، التقييمات، وطلب التدريب بصلاحيات يختارها المتدرب
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, View } from 'react-native';
import { BrandGradient, SaduPattern } from '@/brand/Brand';
import { STAR } from '@/components/clubs/parts';
import { Chip, ScopePicker, VerifiedBadge } from '@/components/coaching/parts';
import { Avatar, Button, Card, Empty, Input, Loading, Row, Screen, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { loadCoach, loadCoachReviews, loadPackages, rateCoach, requestCoach, type CoachDetail, type CoachPackage, type CoachReview, type Scope } from '@/lib/coaching';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { errorKey, publicUrl } from '@/lib/supabase';
import { brand, colors, space } from '@/theme';

export default function CoachPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId } = useUser();
  const [c, setC] = useState<CoachDetail | null | undefined>(undefined);
  const [reviews, setReviews] = useState<CoachReview[]>([]);
  const [pkgs, setPkgs] = useState<CoachPackage[]>([]);
  const [asking, setAsking] = useState(false);
  const [scopes, setScopes] = useState<Scope[]>(['workouts', 'visits']);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(0);
  const [rbody, setRbody] = useState('');

  const load = useCallback(() => {
    loadCoach(String(id)).then(setC).catch(() => setC(null));
    loadCoachReviews(String(id)).then((r) => { setReviews(r); const m = r.find((x) => x.is_me); if (m) { setRating(m.rating); setRbody(m.body ?? ''); } }).catch(() => {});
    loadPackages(String(id)).then((p) => setPkgs(p.filter((x) => x.active))).catch(() => {});
  }, [id]);
  useFocusEffect(load);

  if (c === undefined) return <Loading />;
  if (!c) return <Screen><Empty text={t('coaching.notFound')} /></Screen>;
  const name = c.full_name || c.username;

  const send = async () => {
    setBusy(true);
    try { await requestCoach(c.user_id, scopes, msg); setAsking(false); Alert.alert(t('coaching.requestSent')); load(); }
    catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };
  const rate = async () => {
    if (!rating) return Alert.alert(t('clubs.pickStars'));
    try { await rateCoach(userId, c.user_id, rating, rbody); load(); Alert.alert(t('coaching.thanksReview')); } catch (e) { Alert.alert(t(errorKey(e))); }
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: name }} />
      <BrandGradient name="ember" style={{ borderRadius: 16, overflow: 'hidden', padding: space.xl, gap: space.sm, alignItems: 'center' }}>
        <SaduPattern variant="arrows" opacity={0.1} />
        <Avatar size={84} uri={publicUrl('avatars', c.avatar_url)} name={name} />
        <Row gap={6}><T size="xl" bold color={brand.cream}>{name}</T>{c.verified ? <Ionicons name="checkmark-circle" size={20} color="#6BD68A" /> : null}</Row>
        {c.headline ? <T size="sm" color={brand.sand} center>{c.headline}</T> : null}
        <Row gap={space.md} style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          {c.rating ? <Row gap={3}><Ionicons name="star" size={14} color={STAR} /><T size="sm" semibold color={brand.cream}>{c.rating.toFixed(1)} ({c.reviews})</T></Row> : null}
          <T size="sm" color={brand.cream}>{t('coaching.clientsN', { count: c.clients })}</T>
          {c.years_exp ? <T size="sm" color={brand.cream}>{t('coaching.yearsN', { count: c.years_exp })}</T> : null}
        </Row>
      </BrandGradient>

      {c.is_me ? <Button icon="create-outline" title={t('coaching.editProfile')} onPress={() => router.push('/coaching/profile')} />
        : c.my_link_status === 'active' ? (
          <Row gap={space.sm}>
            <Button style={{ flex: 1 }} icon="chatbubble-ellipses-outline" title={t('coaching.message')} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.user_id } })} />
            <Button style={{ flex: 1 }} variant="secondary" icon="person-outline" title={t('coaching.myCoach')} onPress={() => router.push('/my-coach')} />
          </Row>
        ) : c.my_link_status === 'pending' ? (
          <Card><T center semibold>{c.my_link_by === 'client' ? t('coaching.requestPending') : t('coaching.inviteWaiting')}</T>
            {c.my_link_by === 'coach' ? <Button small title={t('coaching.openInvites')} onPress={() => router.push('/my-coach')} /> : null}</Card>
        ) : !c.accepting ? <Card><T center muted>{t('coaching.notAccepting')}</T></Card>
        : asking ? (
          <Card style={{ gap: space.sm }}>
            <T semibold>{t('coaching.whatCanSee', { name })}</T>
            <ScopePicker value={scopes} onChange={setScopes} />
            <Input value={msg} onChangeText={setMsg} maxLength={300} multiline placeholder={t('coaching.msgPh')} />
            <Row gap={space.sm}>
              <Button style={{ flex: 1 }} title={t('coaching.sendRequest')} loading={busy} onPress={send} />
              <Button variant="ghost" title={t('common.cancel')} onPress={() => setAsking(false)} />
            </Row>
          </Card>
        ) : <Button icon="barbell-outline" title={t('coaching.askToTrain')} onPress={() => setAsking(true)} />}

      {c.bio ? <Card><T style={{ lineHeight: 24 }}>{c.bio}</T></Card> : null}

      <Card style={{ gap: space.sm }}>
        {c.specialties.length ? <Row gap={6} style={{ flexWrap: 'wrap' }}>{c.specialties.map((s) => <Chip key={s} label={t(`coaching.sp_${s}`)} />)}</Row> : null}
        <Row gap={space.md} style={{ flexWrap: 'wrap' }}>
          {c.city ? <T size="sm">📍 {c.city}</T> : null}
          <T size="sm">{t(`coaching.trains_${c.trains}`)}</T>
          {c.in_person ? <T size="sm">{t('coaching.inPerson')}</T> : null}
          {c.online ? <T size="sm">{t('coaching.online')}</T> : null}
          {c.languages?.length ? <T size="sm">{c.languages.map((l) => t(`coaching.lang_${l}`)).join('، ')}</T> : null}
        </Row>
        {c.certifications ? <View style={{ gap: 2 }}><T size="xs" semibold>{t('coaching.certs')}</T><T size="sm" muted>{c.certifications}</T></View> : null}
        {!c.verified ? <T size="xs" muted>{t('coaching.notVerifiedNote')}</T> : <VerifiedBadge />}
        {c.instagram ? <Pressable onPress={() => Linking.openURL(`https://instagram.com/${c.instagram}`)}><T size="sm" semibold color={colors.primary}>@{c.instagram} ↗</T></Pressable> : null}
      </Card>

      {c.gyms.length ? (
        <Card style={{ gap: 6 }}>
          <T semibold>{t('coaching.trainsAt')}</T>
          {c.gyms.map((g) => (
            <Pressable key={g.id} onPress={() => router.push({ pathname: '/clubs/[id]', params: { id: g.id } })}>
              <T size="sm" color={colors.primary}>{lng === 'en' && g.name_en ? g.name_en : g.name} ›</T>
            </Pressable>
          ))}
        </Card>
      ) : null}

      {pkgs.length ? (
        <Card style={{ gap: space.sm }}>
          <T semibold>{t('coaching.packages')}</T>
          {pkgs.map((p) => (
            <Row key={p.id} style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <T size="sm" semibold>{p.title}</T>
                <T size="xs" muted>{t('coaching.sessionsN', { count: p.sessions })} · {t('coaching.validDays', { count: p.valid_days })}{p.online ? ` · ${t('coaching.online')}` : ''}</T>
                {p.description ? <T size="xs" muted>{p.description}</T> : null}
              </View>
              <T bold color={colors.primary}>{Math.round(p.price_sar).toLocaleString('en-US')} {t('clubs.sar')}</T>
            </Row>
          ))}
          <T size="xs" muted>{t('coaching.payNote')}</T>
        </Card>
      ) : null}

      <T size="lg" bold>{t('coaching.reviews')}</T>
      {c.can_review ? (
        <Card style={{ gap: space.sm }}>
          <Row gap={8} style={{ justifyContent: 'center' }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Pressable key={i} onPress={() => setRating(i)} hitSlop={6}><Ionicons name={rating >= i ? 'star' : 'star-outline'} size={30} color={rating >= i ? STAR : colors.muted} /></Pressable>
            ))}
          </Row>
          <Input value={rbody} onChangeText={setRbody} maxLength={500} multiline placeholder={t('coaching.reviewPh')} />
          <Button small title={t('clubs.publishReview')} onPress={rate} />
        </Card>
      ) : null}
      {reviews.length ? reviews.map((r) => (
        <Card key={r.user_id} style={{ gap: 4 }}>
          <Row>
            <Avatar size={30} uri={publicUrl('avatars', r.avatar_url)} name={r.full_name ?? r.username} />
            <T size="sm" semibold style={{ flex: 1 }}>{r.full_name || r.username}</T>
            <Row gap={2}>{[1, 2, 3, 4, 5].map((i) => <Ionicons key={i} name={r.rating >= i ? 'star' : 'star-outline'} size={11} color={STAR} />)}</Row>
          </Row>
          {r.body ? <T size="sm" style={{ lineHeight: 22 }}>{r.body}</T> : null}
          <T size="xs" muted>{t('coaching.verifiedClient')} · {timeAgo(r.updated_at, lng)}</T>
        </Card>
      )) : <Empty icon="star-outline" text={t('coaching.noReviews')} />}
    </Screen>
  );
}
