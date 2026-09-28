import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, View } from 'react-native';
import { useLocalized } from '@/lib/i18n';
import { GymSearchError, nearbyGyms, refreshNearbyGyms, searchGymsOnMap, searchGymsSaved } from '@/lib/gyms';
import { getCurrentPosition, type Position } from '@/lib/location';
import { errorKey, supabase } from '@/lib/supabase';
import type { Gym } from '@/lib/types';
import { colors, space } from '@/theme';
import { Button, Input, OptionCard, Row, T } from './ui';

export function gymName(g: Pick<Gym, 'name' | 'name_en'> | null | undefined, lng: 'ar' | 'en') {
  if (!g) return '';
  return lng === 'en' && g.name_en ? g.name_en : g.name;
}

export function GymPicker({ userId, value, onChange }: {
  userId: string; value: string | null; onChange: (gym: Gym) => void;
}) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const pos = useRef<Position | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const findNearby = async () => {
    setBusy(true);
    try {
      const p = await getCurrentPosition();
      if (!p) return Alert.alert(t('errors.locationDenied'));
      pos.current = p;
      // نجيب نوادي المنطقة من الخريطة أولاً (وقت اللياقة، جولدز… وأي نادي حقيقي قريب)
      await Promise.all([refreshNearbyGyms(p, { precise: true }), refreshNearbyGyms(p)]);
      setGyms(await nearbyGyms(p, 30));
    } catch (e) {
      Alert.alert(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  // البحث بالاسم: المحفوظ عندنا فوراً، ثم الخريطة الحقيقية (Google / OpenStreetMap) بعد ما توقف عن الكتابة
  const search = (q: string) => {
    setQuery(q);
    setNote(null);
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) return;
    timer.current = setTimeout(async () => {
      const text = q.trim();
      setSearching(true);
      const saved = await searchGymsSaved(text).catch(() => [] as Gym[]);
      setGyms(saved);
      try {
        const map = await searchGymsOnMap(text, pos.current);
        const seen = new Set(map.map((g) => g.id));
        setGyms([...map, ...saved.filter((g) => !seen.has(g.id))]);
        if (!map.length && !saved.length) setNote(t('checkin.noResults'));
      } catch (e) {
        setNote(e instanceof GymSearchError && e.message === 'rate_limited' ? t('checkin.rateLimited') : t('checkin.mapDown'));
      } finally {
        setSearching(false);
      }
    }, 700);
  };

  const addHere = async () => {
    if (newName.trim().length < 2) return Alert.alert(t('errors.required'));
    setBusy(true);
    try {
      const p = await getCurrentPosition();
      if (!p) return Alert.alert(t('errors.locationDenied'));
      const { data, error } = await supabase.from('gyms')
        .insert({ name: newName.trim(), lat: p.lat, lng: p.lng, created_by: userId })
        .select('*').single();
      if (error) throw error;
      setGyms((g) => [data as Gym, ...g]);
      onChange(data as Gym);
      setAdding(false);
      setNewName('');
    } catch (e) {
      Alert.alert(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space.md }}>
      <Button title={t('onboarding.findNearby')} icon="locate" variant="secondary" onPress={findNearby} loading={busy && !adding} />
      <Input placeholder={t('checkin.searchPh')} value={query} onChangeText={search} autoCorrect={false} returnKeyType="search" />
      {searching ? <Row><ActivityIndicator size="small" color={colors.primary} /><T size="sm" muted>{t('checkin.searchingMap')}</T></Row> : null}
      {note ? <T size="sm" muted>{note}</T> : null}
      {gyms.map((g) => (
        <OptionCard
          key={g.id}
          title={gymName(g, lng)}
          subtitle={[g.address ?? g.city, g.distance_m != null ? (g.distance_m >= 1000 ? `${(g.distance_m / 1000).toFixed(1)} km` : `${Math.round(g.distance_m)} m`) : null, g.verified ? t('checkin.pointsOk') : t('checkin.noPoints')].filter(Boolean).join(' · ')}
          icon="barbell-outline"
          selected={value === g.id}
          onPress={() => onChange(g)}
        />
      ))}
      {adding ? (
        <View style={{ gap: space.sm }}>
          <Input label={t('onboarding.gymName')} value={newName} onChangeText={setNewName} />
          <Button title={t('common.save')} onPress={addHere} loading={busy} />
        </View>
      ) : (
        <Button title={t('onboarding.addGymHere')} icon="add-circle-outline" variant="ghost" onPress={() => setAdding(true)} />
      )}
      <View style={{ flexDirection: 'row', gap: space.xs, alignItems: 'center' }}>
        <Ionicons name="information-circle-outline" size={16} color={colors.muted} />
        <T size="xs" muted style={{ flex: 1 }}>{t('onboarding.gymWhy')}</T>
      </View>
    </View>
  );
}
