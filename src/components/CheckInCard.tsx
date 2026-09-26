import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { useUser } from '@/lib/auth';
import { durationLabel } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { getCurrentPosition } from '@/lib/location';
import { errorKey, supabase, tooFarMeters } from '@/lib/supabase';
import type { CheckIn, Gym } from '@/lib/types';
import { colors, space } from '@/theme';
import { gymName } from './GymPicker';
import { Button, Card, Row, T } from './ui';

export function CheckInCard({ onChange }: { onChange?: () => void }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId, profile, refreshProfile } = useUser();
  const [gym, setGym] = useState<Gym | null>(null);
  const [open, setOpen] = useState<CheckIn | null>(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
    const [g, c] = await Promise.all([
      profile.gym_id ? supabase.from('gyms').select('*').eq('id', profile.gym_id).single() : Promise.resolve({ data: null }),
      supabase.from('check_ins').select('*').eq('user_id', userId).is('checked_out_at', null)
        .gte('checked_in_at', since).order('checked_in_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setGym((g.data as Gym) ?? null);
    setOpen((c.data as CheckIn) ?? null);
  }, [userId, profile.gym_id]);

  useEffect(() => { load(); }, [load]);

  // تحديث العدّاد كل دقيقة أثناء التواجد في النادي
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => tick((x) => x + 1), 60_000);
    return () => clearInterval(id);
  }, [open]);

  const checkIn = async () => {
    if (!gym) return Alert.alert(t('home.noGym'));
    setBusy(true);
    try {
      const pos = await getCurrentPosition();
      if (!pos) return Alert.alert(t('errors.locationDenied'));
      const { data, error } = await supabase.rpc('check_in', {
        p_gym: gym.id, p_lat: pos.lat, p_lng: pos.lng, p_accuracy: pos.accuracy,
      });
      if (error) throw error;
      const row = data as CheckIn;
      setOpen(row);
      Alert.alert(row.points_awarded > 0 ? t('home.checkedIn', { points: row.points_awarded }) : t('home.checkedInNoPoints'));
      await refreshProfile();
      onChange?.();
    } catch (e) {
      const m = tooFarMeters(e);
      Alert.alert(m != null ? t('errors.tooFar', { m }) : t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const checkOut = async () => {
    if (!open) return;
    setBusy(true);
    try {
      const before = open.points_awarded;
      const { data, error } = await supabase.rpc('check_out', { p_check_in: open.id });
      if (error) throw error;
      const row = data as CheckIn;
      const minutes = Math.round((new Date(row.checked_out_at!).getTime() - new Date(row.checked_in_at).getTime()) / 60000);
      Alert.alert(t('home.checkedOut', { minutes }), row.points_awarded > before ? t('home.longBonus') : undefined);
      setOpen(null);
      await refreshProfile();
      onChange?.();
    } catch (e) {
      Alert.alert(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: space.md, borderColor: open ? colors.primary : colors.border }}>
      <Row>
        <Ionicons name={open ? 'radio-button-on' : 'location-outline'} size={22} color={open ? colors.success : colors.primary} />
        <View style={{ flex: 1 }}>
          <T bold>{gym ? gymName(gym, lng) : t('home.noGym')}</T>
          {open ? <T size="sm" muted>{t('home.inGym', { time: durationLabel(open.checked_in_at, lng) })}</T> : null}
        </View>
      </Row>
      {open ? (
        <Row>
          <Button style={{ flex: 1 }} title={t('home.checkOut')} variant="secondary" icon="log-out-outline" onPress={checkOut} loading={busy} />
          <Button style={{ flex: 1 }} title={t('home.shareSession')} icon="camera-outline"
            onPress={() => router.push({ pathname: '/post/new', params: { checkIn: open.id } })} />
        </Row>
      ) : (
        <Button
          title={busy ? t('home.checkingIn') : t('home.checkIn')}
          icon="finger-print"
          onPress={gym ? checkIn : () => router.push('/profile-edit')}
          loading={busy}
        />
      )}
    </Card>
  );
}
