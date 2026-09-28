
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { GymPicker } from '@/components/GymPicker';
import { Avatar, Button, Card, Input, Screen, SectionTitle, Segmented, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { pickImage, type PickedImage } from '@/lib/images';
import { errorKey, publicUrl, supabase, uploadImage } from '@/lib/supabase';
import type { Gender, Goal, Level } from '@/lib/types';
import { space } from '@/theme';
import { goBackOrHome } from '@/lib/nav';

export default function ProfileEdit() {
  const { t } = useTranslation();
  const { userId, profile, health, refreshProfile } = useUser();
  const [fullName, setFullName] = useState(profile.full_name ?? '');
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [avatar, setAvatar] = useState<PickedImage | null>(null);
  const [gymId, setGymId] = useState(profile.gym_id);
  const [gender, setGender] = useState<Gender>(health?.gender ?? 'male');
  const [height, setHeight] = useState(health?.height_cm ? String(health.height_cm) : '');
  const [goal, setGoal] = useState<Goal>(health?.goal ?? 'fit');
  const [level, setLevel] = useState<Level>(health?.level ?? 'beginner');
  const [days, setDays] = useState(health?.days_per_week ?? 3);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const u = username.trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,24}$/.test(u)) return Alert.alert(t('errors.invalidUsername'));
    const h = Number(height);
    if (!(h >= 120 && h <= 230)) return Alert.alert(t('errors.invalidNumber'));
    setBusy(true);
    try {
      const avatarPath = avatar ? await uploadImage('avatars', userId, avatar.uri, avatar.mimeType) : undefined;
      const { error } = await supabase.from('profiles').update({
        full_name: fullName.trim() || null, username: u, bio: bio.trim() || null, gym_id: gymId,
        ...(avatarPath ? { avatar_url: avatarPath } : {}),
      }).eq('id', userId);
      if (error) throw error;
      const { error: hErr } = await supabase.from('health_profiles').update({
        gender, height_cm: h, goal, level, days_per_week: days, updated_at: new Date().toISOString(),
      }).eq('user_id', userId);
      if (hErr) throw hErr;
      await refreshProfile();
      goBackOrHome();
    } catch (e) {
      Alert.alert(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['bottom']}>
        <Pressable style={{ alignItems: 'center', gap: space.sm }}
          onPress={async () => { const i = await pickImage('library', [1, 1]); if (i) setAvatar(i); }}>
          <Avatar size={96} uri={avatar?.uri ?? publicUrl('avatars', profile.avatar_url)} name={fullName || username} />
          <T size="sm" muted>{t('profile.changePhoto')}</T>
        </Pressable>
        <Input label={t('auth.fullName')} value={fullName} onChangeText={setFullName} />
        <Input label={t('auth.username')} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
        <Input label={t('profile.bio')} value={bio} onChangeText={setBio} multiline maxLength={200} />

        <SectionTitle title={t('profile.gym')} />
        <GymPicker userId={userId} value={gymId} onChange={(g) => setGymId(g.id)} />

        <SectionTitle title={t('profile.healthInfo')} />
        <Card style={{ gap: space.md }}>
          <T size="sm" muted>{t('onboarding.gender')}</T>
          <Segmented value={gender} onChange={setGender}
            options={[{ value: 'male', label: t('onboarding.male') }, { value: 'female', label: t('onboarding.female') }]} />
          <Input label={t('onboarding.height')} value={height} onChangeText={setHeight} keyboardType="decimal-pad" />
          <T size="sm" muted>{t('onboarding.goal')}</T>
          <Segmented wrap value={goal} onChange={setGoal}
            options={(['lose', 'gain', 'maintain', 'fit'] as const).map((g) => ({ value: g, label: t(`onboarding.goal_${g}`) }))} />
          <T size="sm" muted>{t('onboarding.level')}</T>
          <Segmented value={level} onChange={setLevel}
            options={(['beginner', 'intermediate', 'advanced'] as const).map((l) => ({ value: l, label: t(`onboarding.level_${l}`) }))} />
          <T size="sm" muted>{t('onboarding.daysPerWeek')}</T>
          <Segmented value={days} onChange={setDays} options={[2, 3, 4, 5, 6].map((d) => ({ value: d, label: String(d) }))} />
        </Card>
        <View style={{ height: space.sm }} />
        <Button title={t('common.save')} onPress={save} loading={busy} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
