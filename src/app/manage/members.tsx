// أعضاء الفرع: الكل، قريب ينتهي، منتهي، منقطعين، بانتظار الربط — مع تذكير المنقطعين بضغطة
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Share, View } from 'react-native';
import { Avatar, Button, Card, Empty, Input, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { isGymStaff, loadGymMembers, nudgeInactive, STATE_COLOR, type GymMember, type MemberFilter } from '@/lib/gymops';
import { errorKey, publicUrl } from '@/lib/supabase';
import { brand, colors, space } from '@/theme';

export default function Members() {
  const { gym, filter: f0 } = useLocalSearchParams<{ gym: string; filter?: MemberFilter }>();
  const { t } = useTranslation();
  const [filter, setFilter] = useState<MemberFilter>(f0 ?? 'all');
  const [rows, setRows] = useState<GymMember[] | null>(null);
  const [q, setQ] = useState('');
  const [staff, setStaff] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setRows(null);
    loadGymMembers(String(gym), filter).then(setRows).catch(() => setRows([]));
  }, [gym, filter]);
  useFocusEffect(useCallback(() => { isGymStaff(String(gym)).then(setStaff); load(); }, [gym, load]));

  if (staff === false) return <Screen><Empty icon="lock-closed-outline" text={t('gymops.staffOnly')} /></Screen>;
  const shown = (rows ?? []).filter((m) => !q || `${m.member_name ?? ''} ${m.username ?? ''} ${m.member_contact ?? ''}`.toLowerCase().includes(q.toLowerCase()));

  const winback = async () => {
    setBusy(true);
    try { const n = await nudgeInactive(String(gym)); Alert.alert(t('gymops.winbackSent', { count: n })); }
    catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('gymops.tool_members') }} />
      <Segmented<MemberFilter> wrap value={filter} onChange={setFilter} options={(['all', 'expiring', 'expired', 'inactive', 'pending'] as MemberFilter[]).map((v) => ({ value: v, label: t(`gymops.f_${v}`) }))} />
      <Input value={q} onChangeText={setQ} placeholder={t('gymops.searchMember')} />
      {filter === 'inactive' && rows?.length ? (
        <Card style={{ gap: space.sm }}>
          <T size="sm">{t('gymops.winbackHint')}</T>
          <Button small icon="notifications-outline" title={t('gymops.winback', { count: rows.length })} loading={busy} onPress={winback} />
        </Card>
      ) : null}
      {rows === null ? <Loading /> : shown.length ? shown.map((m) => (
        <Pressable key={m.membership_id} onPress={() => router.push({ pathname: '/manage/membership', params: { gym: String(gym), id: m.membership_id } })}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Avatar size={42} uri={publicUrl('avatars', m.avatar_url)} name={m.member_name} />
            <View style={{ flex: 1, gap: 2 }}>
              <T semibold numberOfLines={1}>{m.member_name ?? '—'}</T>
              <T size="xs" muted numberOfLines={1}>{[m.plan_name, m.chain_wide ? t('gymops.chainWide') : null, m.username ? `@${m.username}` : m.member_contact].filter(Boolean).join(' · ')}</T>
              {m.claim_code ? (
                <Pressable onPress={() => Share.share({ message: t('gymops.claimShare', { code: m.claim_code }) })} hitSlop={6}>
                  <T size="xs" semibold color={colors.primary}>{t('gymops.claimCode')}: {m.claim_code} ↗</T>
                </Pressable>
              ) : (
                <T size="xs" muted>{m.last_visit ? t('gymops.lastVisitDays', { count: m.days_since_visit ?? 0 }) : t('gymops.noVisits')}</T>
              )}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <View style={{ backgroundColor: STATE_COLOR[m.state], borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                <T size="xs" semibold color="#fff">{t(`gymops.state_${m.state}`)}</T>
              </View>
              <T size="xs" semibold color={m.days_left <= 7 ? brand.orange : colors.muted}>{t('gymops.daysLeft', { count: m.days_left })}</T>
            </View>
          </Card>
        </Pressable>
      )) : <Empty icon="people-outline" text={t('gymops.noMembers')} />}
    </Screen>
  );
}
