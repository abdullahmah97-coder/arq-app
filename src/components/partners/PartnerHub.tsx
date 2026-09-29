// بوابة الشركاء: لوحة تحكم لكل فئة عند الشريك (نادي، متجر أو مطعم، مدرب، مركز)، وحالة طلب الانضمام، وطريق الانضمام لباقي الفئات
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { DashLink, StatusPill } from '@/components/partners/parts';
import { Card, Loading, Row, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { kindOf, loadPartnerState, type AccountType, type PartnerKind, type PartnerState } from '@/lib/partners';
import { brand, colors, space } from '@/theme';

type Icon = keyof typeof Ionicons.glyphMap;
const JOIN: Record<PartnerKind, { icon: Icon; route: string }> = {
  club: { icon: 'business-outline', route: '/clubs/join' },
  store: { icon: 'storefront-outline', route: '/store/join' },
  coach: { icon: 'person-outline', route: '/coaching/profile' },
  center: { icon: 'medkit-outline', route: '/recovery/join' },
  venue: { icon: 'tennisball-outline', route: '/venues/join' },
};

export function PartnerHub({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { userId, profile } = useUser();
  const [s, setS] = useState<PartnerState | null>(null);
  useFocusEffect(useCallback(() => { loadPartnerState(userId).then(setS).catch(() => {}); }, [userId]));
  if (!s) return <Loading />;

  const chosen = kindOf(profile.account_type as AccountType | undefined);
  const has: Record<PartnerKind, boolean> = {
    club: !!(s.chains.length || s.gyms.length || s.clubRequest), store: !!s.store, coach: !!s.coach, center: !!s.center, venue: !!s.venue,
  };
  const toJoin = (['club', 'store', 'coach', 'center', 'venue'] as PartnerKind[]).filter((k) => !has[k])
    .sort((a, b) => Number(b === chosen) - Number(a === chosen));

  return (
    <View style={{ gap: space.md }}>
      {/* النادي */}
      {s.chains.length || s.gyms.length ? (
        <Card style={{ gap: 2 }}>
          <Head icon="business" title={t('partners.clubDashboard')} />
          {s.chains.map((c) => (
            <View key={c.id} style={{ gap: 0 }}>
              <Row style={{ paddingTop: 6 }}>
                <T bold style={{ flex: 1 }}>{c.name}</T>
                <StatusPill status={!c.active ? 'suspended' : c.partner ? 'approved' : 'listed'} label={t(!c.active ? 'partners.st_hidden' : c.partner ? 'partners.st_partner' : 'partners.st_listed')} />
              </Row>
              <DashLink icon="pricetags-outline" title={t('partners.clubPageOffers')} sub={t('partners.clubPageOffersSub')} onPress={() => router.push({ pathname: '/clubs/chain/[id]', params: { id: c.id } })} />
              <DashLink icon="create-outline" title={t('partners.clubEdit')} sub={t('partners.clubEditSub')} onPress={() => router.push({ pathname: '/clubs/chain-edit', params: { id: c.id } })} />
            </View>
          ))}
          {s.gyms.map((g) => (
            <DashLink key={g.gym_id} icon="speedometer-outline" title={t('partners.branchDashboard', { name: g.name })} sub={t('partners.branchDashboardSub')}
              onPress={() => router.push({ pathname: '/manage/[gymId]', params: { gymId: g.gym_id } })} />
          ))}
          {s.gyms[0] ? <DashLink icon="megaphone-outline" title={t('partners.notifyMembers')} sub={t('partners.announceRuleClub')}
            onPress={() => router.push({ pathname: '/manage/broadcast', params: { gym: s.gyms[0].gym_id } })} /> : null}
          {!s.gyms.length ? <T size="xs" muted style={{ lineHeight: 19 }}>{t('partners.noBranchesYet')}</T> : null}
        </Card>
      ) : s.clubRequest ? (
        <Card style={{ gap: 6 }}>
          <Head icon="business" title={t('partners.clubDashboard')} />
          <Row><T semibold style={{ flex: 1 }}>{s.clubRequest.club_name}</T>
            <StatusPill status={s.clubRequest.status} label={t(`partners.clubReq_${s.clubRequest.status}`)} /></Row>
          {s.clubRequest.status === 'rejected' ? <DashLink icon="refresh" title={t('partners.resubmit')} sub={s.clubRequest.review_note ?? undefined} onPress={() => router.push('/clubs/join')} />
            : <T size="xs" muted>{t('partners.clubReqBody_pending', { name: s.clubRequest.club_name })}</T>}
        </Card>
      ) : null}

      {/* المتجر أو المطعم */}
      {s.store ? (
        <Card style={{ gap: 2 }}>
          <Head icon={s.store.category === 'restaurant' ? 'restaurant' : 'storefront'} title={t(s.store.category === 'restaurant' ? 'partners.restaurantDashboard' : 'partners.storeDashboard')} />
          <Row style={{ paddingTop: 6 }}><T bold style={{ flex: 1 }}>{s.store.name}</T><StatusPill status={s.store.status} label={t(`store.statusTitle_${s.store.status}`)} /></Row>
          <DashLink icon="speedometer-outline" title={t('partners.openDashboard')} sub={t('partners.storeDashSub')} onPress={() => router.push('/store/manage')} />
          <DashLink icon="pricetag-outline" title={t('partners.addOffer')} sub={t('partners.addOfferSub')} onPress={() => router.push({ pathname: '/store/offer', params: { brand: s.store!.id } })} />
          <DashLink icon="add-circle-outline" title={t(s.store.category === 'restaurant' ? 'partners.addDish' : 'store.addProduct')} onPress={() => router.push({ pathname: '/store/product', params: { brand: s.store!.id } })} />
          {!compact ? <DashLink icon="create-outline" title={t('store.editStore')} onPress={() => router.push('/store/join')} /> : null}
        </Card>
      ) : null}

      {/* المدرب */}
      {s.coach ? (
        <Card style={{ gap: 2 }}>
          <Head icon="person" title={t('partners.coachDashboard')} />
          <Row style={{ paddingTop: 6 }}><T bold style={{ flex: 1 }}>{profile.full_name || profile.username}</T><StatusPill status={s.coach.status} label={t(`partners.coachSt_${s.coach.status}`)} /></Row>
          <DashLink icon="speedometer-outline" title={t('partners.openDashboard')} sub={t('partners.coachDashSub')} onPress={() => router.push('/coaching')} />
          <DashLink icon="pricetags-outline" title={t('partners.coachPackages')} sub={t('partners.coachPackagesSub')} onPress={() => router.push('/coaching/packages')} />
          {!compact ? <DashLink icon="create-outline" title={t('partners.coachProfile')} onPress={() => router.push('/coaching/profile')} /> : null}
        </Card>
      ) : null}

      {/* المركز */}
      {s.center ? (
        <Card style={{ gap: 2 }}>
          <Head icon="medkit" title={t('partners.centerDashboard')} />
          <Row style={{ paddingTop: 6 }}><T bold style={{ flex: 1 }}>{s.center.name}</T><StatusPill status={s.center.status} label={t(`recovery.status_${s.center.status}`).split('،')[0]} /></Row>
          <DashLink icon="speedometer-outline" title={t('partners.openDashboard')} sub={t('partners.centerDashSub')} onPress={() => router.push('/recovery/manage')} />
          {!compact ? <DashLink icon="create-outline" title={t('recovery.editCenter')} onPress={() => router.push('/recovery/join')} /> : null}
        </Card>
      ) : null}

      {/* الملعب أو الاستوديو */}
      {s.venue ? (
        <Card style={{ gap: 2 }}>
          <Head icon="tennisball" title={t('venue.dashboard')} />
          <Row style={{ paddingTop: 6 }}><T bold style={{ flex: 1 }}>{s.venue.name}</T><StatusPill status={s.venue.status} label={t(`venue.st_${s.venue.status}`)} /></Row>
          <DashLink icon="calendar-outline" title={t('partners.openDashboard')} sub={t('venue.dashSub')} onPress={() => router.push('/venues/manage')} />
          {!compact ? <DashLink icon="create-outline" title={t('venue.editTitle')} onPress={() => router.push('/venues/join')} /> : null}
        </Card>
      ) : null}

      {/* الانضمام لباقي الفئات */}
      {toJoin.length ? (
        <Card style={{ gap: 2 }}>
          <T bold>{t(chosen && !has[chosen] ? 'partners.completeJoin' : 'partners.joinAs')}</T>
          {toJoin.slice(0, compact ? 1 : 5).map((k) => (
            <DashLink key={k} icon={JOIN[k].icon} title={t(`partners.join_${k}`)} sub={t(`partners.joinSub_${k}`)}
              onPress={() => router.push(JOIN[k].route as never)} />
          ))}
          <T size="xs" muted style={{ lineHeight: 19 }}>{t('partners.joinReviewNote')}</T>
        </Card>
      ) : null}
    </View>
  );
}

function Head({ icon, title }: { icon: Icon; title: string }) {
  return (
    <Row gap={8}>
      <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={16} color={brand.cream} />
      </View>
      <T bold size="lg" style={{ flex: 1 }}>{title}</T>
      <Ionicons name="shield-checkmark-outline" size={16} color={colors.muted} />
    </Row>
  );
}
