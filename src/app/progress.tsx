import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { Button, Card, Empty, Input, Row, Screen, SectionTitle, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { pickImage, type PickedImage } from '@/lib/images';
import { useLocalized } from '@/lib/i18n';
import { errorKey, signedBodyUrl, supabase, uploadImage } from '@/lib/supabase';
import type { BodyLog } from '@/lib/types';
import { colors, radius, space } from '@/theme';

type LogWithUrl = BodyLog & { url?: string };

export default function Progress() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId, health, refreshProfile } = useUser();
  const [logs, setLogs] = useState<LogWithUrl[]>([]);
  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('body_logs').select('*').eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(60);
    const rows = (data ?? []) as LogWithUrl[];
    await Promise.all(rows.map(async (r) => { if (r.photo_path) r.url = await signedBodyUrl(r.photo_path); }));
    setLogs(rows);
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    const w = Number(weight);
    if (!(w >= 30 && w <= 300)) return Alert.alert(t('errors.invalidNumber'));
    setBusy(true);
    try {
      const path = photo ? await uploadImage('body', userId, photo.uri, photo.mimeType) : null;
      const { error } = await supabase.from('body_logs').insert({ user_id: userId, weight_kg: w, photo_path: path, note: note.trim() || null });
      if (error) throw error;
      await supabase.from('health_profiles').update({ weight_kg: w, updated_at: new Date().toISOString() }).eq('user_id', userId);
      setWeight(''); setNote(''); setPhoto(null);
      await Promise.all([load(), refreshProfile()]);
    } catch (e) {
      Alert.alert(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  // رسم مبسّط للاتجاه: أعمدة بارتفاع نسبي
  const series = [...logs].reverse().slice(-12);
  const min = Math.min(...series.map((l) => Number(l.weight_kg)));
  const max = Math.max(...series.map((l) => Number(l.weight_kg)));
  const first = series[0] ? Number(series[0].weight_kg) : undefined;
  const last = series.length ? Number(series[series.length - 1].weight_kg) : undefined;
  const delta = first != null && last != null ? Math.round((last - first) * 10) / 10 : 0;

  return (
    <Screen edges={['bottom']}>
      <Card style={{ gap: space.md }}>
        <T bold>{t('profile.logWeight')}</T>
        <Input placeholder={health?.weight_kg ? String(health.weight_kg) : '80'} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />
        <Input placeholder={`${t('profile.note')} (${t('common.optional')})`} value={note} onChangeText={setNote} />
        {photo ? <Image source={{ uri: photo.uri }} style={{ width: 120, aspectRatio: 3 / 4, borderRadius: radius.md }} /> : null}
        <Row>
          <Button small style={{ flex: 1 }} variant="secondary" icon="camera-outline" title={t('onboarding.takePhoto')}
            onPress={async () => { const i = await pickImage('camera', [3, 4]); if (i) setPhoto(i); }} />
          <Button small style={{ flex: 1 }} variant="secondary" icon="images-outline" title={t('onboarding.pickPhoto')}
            onPress={async () => { const i = await pickImage('library', [3, 4]); if (i) setPhoto(i); }} />
        </Row>
        <Button title={t('common.save')} onPress={save} loading={busy} />
        <T size="xs" muted>🔒 {t('profile.privacy')}</T>
      </Card>

      {series.length > 1 ? (
        <Card style={{ gap: space.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T bold>{t('profile.progress')}</T>
            <T bold style={{ color: delta <= 0 ? colors.success : colors.fire }}>{delta > 0 ? '+' : ''}{delta} {t('common.kg')}</T>
          </Row>
          <Row style={{ alignItems: 'flex-end', height: 120 }} gap={4}>
            {series.map((l) => {
              const h = max === min ? 60 : 20 + ((Number(l.weight_kg) - min) / (max - min)) * 100;
              return <View key={l.id} style={{ flex: 1, height: h, backgroundColor: colors.primary, borderRadius: 4, opacity: 0.85 }} />;
            })}
          </Row>
        </Card>
      ) : null}

      <SectionTitle title={t('profile.weightHistory')} />
      {logs.length === 0 ? <Empty text={t('common.empty')} /> : logs.map((l) => (
        <Card key={l.id} style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
          {l.url ? <Image source={{ uri: l.url }} style={{ width: 54, height: 72, borderRadius: radius.sm }} /> : null}
          <View style={{ flex: 1 }}>
            <T bold size="lg">{l.weight_kg} {t('common.kg')}</T>
            <T size="xs" muted>{new Date(l.created_at).toLocaleDateString(lng === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US', { dateStyle: 'medium' })}</T>
            {l.note ? <T size="sm" muted>{l.note}</T> : null}
          </View>
        </Card>
      ))}
    </Screen>
  );
}
