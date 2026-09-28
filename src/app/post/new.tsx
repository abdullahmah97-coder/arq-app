import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, Switch } from 'react-native';
import { Button, Input, Row, Screen, Segmented, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { pickImage, type PickedImage } from '@/lib/images';
import { errorKey, supabase, uploadImage } from '@/lib/supabase';
import { colors, radius } from '@/theme';
import { goBackOrHome } from '@/lib/nav';

export default function NewPost() {
  const { t } = useTranslation();
  const { userId } = useUser();
  const params = useLocalSearchParams<{ checkIn?: string }>();
  const [image, setImage] = useState<PickedImage | null>(null);
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<'friends' | 'public'>('friends');
  const [todayCheckIn, setTodayCheckIn] = useState<string | null>(params.checkIn ?? null);
  const [attach, setAttach] = useState(!!params.checkIn);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (params.checkIn) return;
    const since = new Date(); since.setHours(0, 0, 0, 0);
    supabase.from('check_ins').select('id').eq('user_id', userId).gte('checked_in_at', since.toISOString())
      .order('checked_in_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (data) { setTodayCheckIn(data.id); setAttach(true); } });
  }, [userId, params.checkIn]);

  const submit = async () => {
    if (!image && !caption.trim()) return Alert.alert(t('errors.required'));
    setBusy(true);
    try {
      const path = image ? await uploadImage('posts', userId, image.uri, image.mimeType) : null;
      const { error } = await supabase.from('posts').insert({
        user_id: userId,
        image_path: path,
        caption: caption.trim() || null,
        visibility,
        check_in_id: attach ? todayCheckIn : null,
      });
      if (error) throw error;
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
        {image ? (
          <Image source={{ uri: image.uri }} style={{ width: '100%', aspectRatio: 1, borderRadius: radius.lg }} contentFit="cover" />
        ) : null}
        <Row>
          <Button style={{ flex: 1 }} small title={t('onboarding.takePhoto')} icon="camera-outline" variant="secondary"
            onPress={async () => { const i = await pickImage('camera', [1, 1]); if (i) setImage(i); }} />
          <Button style={{ flex: 1 }} small title={t('onboarding.pickPhoto')} icon="images-outline" variant="secondary"
            onPress={async () => { const i = await pickImage('library', [1, 1]); if (i) setImage(i); }} />
        </Row>
        <Input placeholder={t('feed.caption')} value={caption} onChangeText={setCaption} multiline maxLength={1000} />
        <T size="sm" muted>{t('feed.visibility')}</T>
        <Segmented value={visibility} onChange={setVisibility}
          options={[{ value: 'friends', label: t('feed.vis_friends') }, { value: 'public', label: t('feed.vis_public') }]} />
        {todayCheckIn ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <T>📍 {t('feed.attachCheckIn')}</T>
            <Switch value={attach} onValueChange={setAttach} trackColor={{ true: colors.primary }} />
          </Row>
        ) : null}
        <Button title={t('feed.post')} icon="send" onPress={submit} loading={busy} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
