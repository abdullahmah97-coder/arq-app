import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { useLocalized } from '@/lib/i18n';
import { getCurrentPosition } from '@/lib/location';
import { errorKey, supabase } from '@/lib/supabase';
import type { Gym } from '@/lib/types';
import { colors, space } from '@/theme';
import { Button, Input, OptionCard, T } from './ui';

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

  const findNearby = async () => {
    setBusy(true);
    try {
      const pos = await getCurrentPosition();
      if (!pos) return Alert.alert(t('errors.locationDenied'));
      const { data, error } = await supabase.rpc('nearby_gyms', { p_lat: pos.lat, p_lng: pos.lng, p_km: 30 });
      if (error) throw error;
      setGyms((data ?? []) as Gym[]);
    } catch (e) {
      Alert.alert(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const search = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) return;
    const s = q.trim().replace(/[%_,()]/g, '');
    const { data } = await supabase.from('gyms').select('*')
      .or(`name.ilike.%${s}%,name_en.ilike.%${s}%,city.ilike.%${s}%`).limit(20);
    setGyms((data ?? []) as Gym[]);
  };

  const addHere = async () => {
    if (newName.trim().length < 2) return Alert.alert(t('errors.required'));
    setBusy(true);
    try {
      const pos = await getCurrentPosition();
      if (!pos) return Alert.alert(t('errors.locationDenied'));
      const { data, error } = await supabase.from('gyms')
        .insert({ name: newName.trim(), lat: pos.lat, lng: pos.lng, created_by: userId })
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
      <Input placeholder="🔎" value={query} onChangeText={search} />
      {gyms.map((g) => (
        <OptionCard
          key={g.id}
          title={gymName(g, lng)}
          subtitle={[g.city, g.distance_m != null ? `${Math.round(g.distance_m)} m` : null, g.verified ? '✓' : null].filter(Boolean).join(' · ')}
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
