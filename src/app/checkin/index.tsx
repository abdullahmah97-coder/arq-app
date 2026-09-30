// تسجيل الحضور خطوة بخطوة: نحدد موقعك ← نجيب النوادي الحقيقية حولك من الخريطة ← نوضح وين أنت وكم تبعد
// ← تسجّل في النادي اللي أنت داخله. ولو ناديك مو موجود: تبحث عنه بالاسم في الخريطة أو تضيفه.
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, View } from 'react-native';
import { gymName } from '@/components/GymPicker';
import { Button, Card, Input, Row, Screen, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { logEvent } from '@/lib/events';
import { GymSearchError, gymsInRange, mapsUrl, nearbyGyms, refreshNearbyGyms, searchGymsOnMap, searchGymsSaved } from '@/lib/gyms';
import { useLocalized } from '@/lib/i18n';
import { locate, type Position } from '@/lib/location';
import { emitCheckedIn } from '@/lib/timeline';
import { errorKey, supabase, tooFarMeters } from '@/lib/supabase';
import type { CheckIn, Gym } from '@/lib/types';
import { brand, colors, radius, space } from '@/theme';
import { goBackOrHome } from '@/lib/nav';

type Phase = 'locating' | 'searching' | 'ready' | 'denied' | 'off' | 'timeout';

const fmtDist = (m: number | null | undefined, lng: 'ar' | 'en') => {
  if (m == null) return '';
  if (m >= 1000) return lng === 'ar' ? `${(m / 1000).toFixed(1)} كم` : `${(m / 1000).toFixed(1)} km`;
  return lng === 'ar' ? `${Math.round(m)} م` : `${Math.round(m)} m`;
};

export default function CheckInScreen() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId, profile, refreshProfile } = useUser();
  // from=timeline: من زر ＋ في التايم لاين — بعد التسجيل نرجع له على طول والحضور طالع فوق
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [phase, setPhase] = useState<Phase>('locating');
  const [pos, setPos] = useState<Position | null>(null);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [busyGym, setBusyGym] = useState<string | null>(null);
  const [done, setDone] = useState<{ gym: Gym; row: CheckIn } | null>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Gym[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [mainGym, setMainGym] = useState<string | null>(profile.gym_id);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const scan = useCallback(async () => {
    setPhase('locating');
    const r = await locate();
    if (!alive.current) return;
    if ('error' in r) { setPhase(r.error); logEvent('checkin_locate_fail', { reason: r.error }); return; }
    setPos(r.pos);
    setPhase('searching');
    // مسح دقيق حولك (النادي اللي أنت فيه) + مسح المنطقة (النوادي القريبة) بنفس الوقت
    await Promise.all([refreshNearbyGyms(r.pos, { precise: true }), refreshNearbyGyms(r.pos)]);
    try {
      const list = await nearbyGyms(r.pos, 3);
      if (!alive.current) return;
      setGyms(list);
      logEvent('checkin_scan', { found: list.length, inRange: gymsInRange(list, r.pos.accuracy).length, acc: Math.round(r.pos.accuracy) });
    } catch {
      setGyms([]);
    }
    setPhase('ready');
  }, []);

  useEffect(() => { scan(); }, [scan]);

  const inRange = pos ? gymsInRange(gyms, pos.accuracy) : [];
  const inRangeIds = new Set(inRange.map((g) => g.id));
  const nearest = gyms[0];

  // الضغط على اسم النادي (أو زر التسجيل) = تسجيل دخول على طول، والخادم يتأكد إنك داخله
  const checkIn = async (g: Gym) => {
    if (busyGym) return;
    if (!pos) { Alert.alert(t('checkin.needLocation'), '', [{ text: t('checkin.retry'), onPress: scan }, { text: t('common.cancel'), style: 'cancel' }]); return; }
    setBusyGym(g.id);
    try {
      const { data, error } = await supabase.rpc('check_in', { p_gym: g.id, p_lat: pos.lat, p_lng: pos.lng, p_accuracy: pos.accuracy });
      if (error) throw error;
      // أول مرة: نخلي هذا ناديك الأساسي
      if (!profile.gym_id) await supabase.from('profiles').update({ gym_id: g.id }).eq('id', userId);
      await refreshProfile();
      const row = data as CheckIn;
      logEvent('checkin_done', { from: from ?? null, points: row.points_awarded });
      if (from === 'timeline') {
        emitCheckedIn(gymName(g, lng), row.points_awarded);
        goBackOrHome();
        return;
      }
      setDone({ gym: g, row });
    } catch (e) {
      const m = tooFarMeters(e);
      if (m != null) {
        const left = Math.max(0, m - (g.radius_m ?? 0));
        Alert.alert(t('checkin.tooFarTitle', { name: gymName(g, lng) }), t('checkin.tooFarBody', { d: fmtDist(m, lng), left: fmtDist(left, lng) }), [
          { text: t('checkin.retry'), onPress: scan },
          { text: t('common.ok'), style: 'cancel' },
        ]);
      } else {
        Alert.alert(t(errorKey(e)));
      }
    } finally {
      setBusyGym(null);
    }
  };

  const setAsMain = async (g: Gym) => {
    const { error } = await supabase.from('profiles').update({ gym_id: g.id }).eq('id', userId);
    if (error) return Alert.alert(t(errorKey(error)));
    setMainGym(g.id);
    await refreshProfile();
    Alert.alert(gymName(g, lng), t('checkin.savedMain'));
  };

  // البحث بالاسم: النوادي المحفوظة فوراً، ثم الخريطة بعد ما توقف عن الكتابة
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearch = (text: string) => {
    setQ(text);
    setSearchNote(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (text.trim().length < 2) { setResults(null); return; }
    searchTimer.current = setTimeout(async () => {
      const query = text.trim();
      setSearching(true);
      const saved = await searchGymsSaved(query).catch(() => [] as Gym[]);
      if (alive.current) setResults(saved);
      try {
        const map = await searchGymsOnMap(query, pos);
        if (!alive.current) return;
        const seen = new Set(map.map((g) => g.id));
        setResults([...map, ...saved.filter((g) => !seen.has(g.id))]);
        if (!map.length && !saved.length) setSearchNote(t('checkin.noResults'));
      } catch (e) {
        if (alive.current) setSearchNote(e instanceof GymSearchError && e.message === 'rate_limited' ? t('checkin.rateLimited') : t('checkin.mapDown'));
      } finally {
        if (alive.current) setSearching(false);
      }
    }, 700);
  };

  const addManual = async () => {
    if (newName.trim().length < 2) return Alert.alert(t('errors.required'));
    if (!pos) return;
    const { data, error } = await supabase.from('gyms').insert({ name: newName.trim(), lat: pos.lat, lng: pos.lng, created_by: userId }).select('*').single();
    if (error) return Alert.alert(t(errorKey(error)));
    setAdding(false); setNewName('');
    setGyms((l) => [{ ...(data as Gym), distance_m: 0 }, ...l]);
    await setAsMain(data as Gym);
  };

  // ---------------------------------------------------------------- تم التسجيل
  if (done) {
    const pts = done.row.points_awarded;
    return (
      <Screen>
        <Card style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xl }}>
          <Ionicons name="checkmark-circle" size={64} color={colors.success} />
          <T bold size="lg" center>{t('checkin.doneTitle')}</T>
          <T semibold center>{gymName(done.gym, lng)}</T>
          <T center muted>{pts > 0 ? t('home.checkedIn', { points: pts }) : t('home.checkedInNoPoints')}</T>
          <T size="sm" center muted>{t('checkin.doneHint')}</T>
        </Card>
        <Button title={t('home.shareSession')} icon="camera-outline" onPress={() => router.replace({ pathname: '/post/new', params: { checkIn: done.row.id } })} />
        <Button title={t('checkin.back')} variant="secondary" onPress={goBackOrHome} />
      </Screen>
    );
  }

  const acc = pos ? Math.round(pos.accuracy) : null;
  const accColor = acc == null ? colors.muted : acc <= 30 ? colors.success : acc <= 80 ? brand.amber : colors.danger;

  return (
    <Screen>
      {/* الحالة */}
      <Card style={{ gap: space.sm }}>
        {phase === 'locating' || phase === 'searching' ? (
          <Row>
            <ActivityIndicator color={colors.primary} />
            <T semibold style={{ flex: 1 }}>{phase === 'locating' ? t('checkin.locating') : t('checkin.searchingGyms')}</T>
          </Row>
        ) : phase === 'ready' ? (
          <>
            <Row>
              <Ionicons name={inRange.length ? 'checkmark-circle' : 'location-outline'} size={26} color={inRange.length ? colors.success : colors.primary} />
              <T bold style={{ flex: 1 }}>
                {inRange.length === 1 ? t('checkin.inside', { name: gymName(inRange[0], lng) })
                  : inRange.length > 1 ? t('checkin.insideMany')
                    : t('checkin.outside')}
              </T>
            </Row>
            {!inRange.length ? (
              <T size="sm" muted>{nearest ? t('checkin.nearestLine', { name: gymName(nearest, lng), d: fmtDist(nearest.distance_m, lng) }) : t('checkin.noneNearLine')}</T>
            ) : (
              <Button icon="finger-print" title={t('checkin.oneTap', { name: gymName(inRange[0], lng) })}
                loading={busyGym === inRange[0].id} onPress={() => checkIn(inRange[0])} />
            )}
          </>
        ) : (
          <Row>
            <Ionicons name="alert-circle" size={24} color={colors.danger} />
            <T semibold style={{ flex: 1 }}>{t(phase === 'denied' ? 'errors.locationDenied' : phase === 'off' ? 'checkin.locationOff' : 'checkin.timeout')}</T>
          </Row>
        )}
        {acc != null && phase === 'ready' ? (
          <Row gap={6}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accColor }} />
            <T size="xs" muted style={{ flex: 1 }}>{t('checkin.accuracy', { m: acc })}{acc > 80 ? ` — ${t('checkin.weakGps')}` : ''}</T>
          </Row>
        ) : null}
        <Row>
          {phase === 'denied' || phase === 'off' ? (
            <Button small style={{ flex: 1 }} title={t('checkin.openSettings')} icon="settings-outline" variant="secondary" onPress={() => Linking.openSettings()} />
          ) : null}
          <Button small style={{ flex: 1 }} title={t('checkin.retry')} icon="locate" variant="secondary"
            onPress={scan} disabled={phase === 'locating' || phase === 'searching'} />
        </Row>
      </Card>

      {/* كيف يشتغل */}
      <Card style={{ gap: 6, backgroundColor: colors.cardAlt }}>
        <T semibold>{t('checkin.howTitle')}</T>
        {['how1', 'how2', 'how3'].map((k) => (
          <Row key={k} gap={6} style={{ alignItems: 'flex-start' }}>
            <T size="sm" color={colors.primary}>•</T>
            <T size="sm" muted style={{ flex: 1 }}>{t(`checkin.${k}`)}</T>
          </Row>
        ))}
      </Card>

      {/* النوادي حولك */}
      {phase === 'ready' && gyms.length ? (
        <View style={{ gap: space.sm }}>
          <T bold>{t('checkin.aroundYou')}</T>
          {[...inRange, ...gyms.filter((g) => !inRangeIds.has(g.id))].slice(0, 12).map((g) => (
            <GymRow key={g.id} g={g} lng={lng} here={inRangeIds.has(g.id)} main={mainGym === g.id}
              busy={busyGym === g.id} onCheckIn={() => checkIn(g)} onMain={() => setAsMain(g)} />
          ))}
        </View>
      ) : null}

      {/* البحث بالاسم */}
      <Card style={{ gap: space.sm }}>
        <T bold>{t('checkin.notListed')}</T>
        <Input placeholder={t('checkin.searchPh')} value={q} onChangeText={onSearch} returnKeyType="search" autoCorrect={false} />
        {searching ? <Row><ActivityIndicator size="small" color={colors.primary} /><T size="sm" muted>{t('checkin.searchingMap')}</T></Row> : null}
        {searchNote ? <T size="sm" muted>{searchNote}</T> : null}
        {(results ?? []).slice(0, 10).map((g) => {
          const d = g.distance_m ?? (pos ? distance(pos, g) : null);
          const here = pos ? d != null && d <= g.radius_m + Math.min(Math.max(pos.accuracy, 0), 50) : false;
          return <GymRow key={g.id} g={{ ...g, distance_m: d ?? undefined }} lng={lng} here={here} main={mainGym === g.id}
            busy={busyGym === g.id} onCheckIn={() => checkIn(g)} onMain={() => setAsMain(g)} />;
        })}
        {adding ? (
          <View style={{ gap: space.sm }}>
            <Input label={t('onboarding.gymName')} value={newName} onChangeText={setNewName} />
            <T size="xs" muted>{t('checkin.addNote')}</T>
            <Button title={t('common.save')} onPress={addManual} disabled={!pos} />
          </View>
        ) : (
          <Button small title={t('checkin.addManual')} icon="add-circle-outline" variant="ghost" onPress={() => setAdding(true)} disabled={!pos} />
        )}
      </Card>
    </Screen>
  );
}

function distance(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function GymRow({ g, lng, here, main, busy, onCheckIn, onMain }: {
  g: Gym; lng: 'ar' | 'en'; here: boolean; main: boolean; busy: boolean; onCheckIn: () => void; onMain: () => void;
}) {
  const { t } = useTranslation();
  const sub = [g.address ?? g.city, g.distance_m != null ? t(here ? 'checkin.here' : 'checkin.away', { d: fmtDist(g.distance_m, lng) }) : null].filter(Boolean).join(' · ');
  return (
    <Card style={{ gap: space.sm, borderColor: here ? colors.success : colors.border, borderWidth: here ? 1.5 : 1 }}>
      <Row style={{ alignItems: 'flex-start' }}>
        <Ionicons name="barbell-outline" size={20} color={here ? colors.success : colors.primary} style={{ marginTop: 2 }} />
        <Pressable style={{ flex: 1, gap: 2 }} onPress={onCheckIn} disabled={busy} accessibilityRole="button"
          accessibilityLabel={t('checkin.tapToCheckIn', { name: gymName(g, lng) })}>
          <T semibold numberOfLines={2} color={here ? colors.success : colors.text}>{gymName(g, lng)}</T>
          {sub ? <T size="xs" muted numberOfLines={2}>{sub}</T> : null}
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <Tag text={g.verified ? t('checkin.pointsOk') : t('checkin.noPoints')} color={g.verified ? colors.success : colors.muted} />
            {main ? <Tag text={t('checkin.mainGym')} color={colors.primary} /> : null}
          </Row>
        </Pressable>
        <Pressable hitSlop={8} accessibilityRole="link" accessibilityLabel={t('checkin.openMap')}
          onPress={() => Linking.openURL(mapsUrl(g, Platform.OS === 'ios')).catch(() => {})}>
          <Ionicons name="map-outline" size={20} color={colors.muted} />
        </Pressable>
      </Row>
      <Row>
        {here ? <Button small style={{ flex: 1 }} title={t('checkin.checkInHere')} icon="finger-print" onPress={onCheckIn} loading={busy} /> : null}
        {!main ? <Button small style={{ flex: here ? undefined : 1 }} title={t('checkin.setMain')} variant="secondary" onPress={onMain} /> : null}
      </Row>
    </Card>
  );
}

function Tag({ text, color }: { text: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm, borderWidth: 1, borderColor: color }}>
      <T size="xs" color={color}>{text}</T>
    </View>
  );
}
