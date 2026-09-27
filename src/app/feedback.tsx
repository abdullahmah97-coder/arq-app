// أرسل ملاحظة / تقرير: يوصل لمالك التطبيق فقط مع رقم النسخة والجهاز وصورة اختيارية، وتشوف حالة تقاريرك
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { Button, Card, Input, OptionCard, Row, Screen, T } from '@/components/ui';
import { appMeta, versionLabel } from '@/lib/appInfo';
import { useUser } from '@/lib/auth';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { pickImage } from '@/lib/images';
import { loadMyReports, STATUS_COLOR, uploadReportShot, type Report } from '@/lib/owner';
import { errorKey, supabase } from '@/lib/supabase';
import { colors, radius, space } from '@/theme';

type Category = 'bug' | 'idea' | 'design' | 'other';
const ICONS = { bug: 'bug-outline', idea: 'bulb-outline', design: 'color-palette-outline', other: 'chatbubble-ellipses-outline' } as const;

export default function Feedback() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { userId } = useUser();
  const { screen } = useLocalSearchParams<{ screen?: string }>();
  const [category, setCategory] = useState<Category>('bug');
  const [message, setMessage] = useState('');
  const [shot, setShot] = useState<{ uri: string; mimeType: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Report[]>([]);
  useEffect(() => { loadMyReports(userId).then(setMine).catch(() => {}); }, [userId]);

  const send = async () => {
    if (message.trim().length < 3) return;
    setBusy(true);
    try {
      const screenshot_path = shot ? await uploadReportShot(userId, shot.uri, shot.mimeType) : null;
      const { error } = await supabase.from('beta_feedback').insert({
        user_id: userId, category, message: message.trim(), screen: screen ?? null, screenshot_path, ...appMeta(),
      });
      if (error) throw error;
      Alert.alert(t('beta.thanks'));
      router.back();
    } catch (e) {
      Alert.alert(t(errorKey(e)));
    } finally { setBusy(false); }
  };

  return (
    <Screen edges={['bottom']}>
      <T muted style={{ lineHeight: 24 }}>{t('beta.intro')}</T>
      <Row gap={6} style={{ backgroundColor: colors.cardAlt, borderRadius: 12, padding: space.md }}>
        <Ionicons name="lock-closed-outline" size={16} color={colors.primary} />
        <T size="xs" style={{ flex: 1, lineHeight: 19 }}>{t('beta.privateNote')}</T>
      </Row>
      {(['bug', 'idea', 'design', 'other'] as const).map((c) => (
        <OptionCard key={c} title={t(`beta.cat_${c}`)} icon={ICONS[c]} selected={category === c} onPress={() => setCategory(c)} />
      ))}
      <Input label={t('beta.message')} value={message} onChangeText={setMessage} multiline maxLength={2000}
        placeholder={t(`beta.ph_${category}`)} style={{ minHeight: 130 }} />
      <Pressable onPress={async () => { const img = await pickImage('library'); if (img) setShot(img); }} accessibilityRole="button"
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.md, padding: space.md }}>
        {shot ? <Image source={{ uri: shot.uri }} style={{ width: 48, height: 48, borderRadius: 8 }} /> : <Ionicons name="image-outline" size={24} color={colors.primary} />}
        <T size="sm" semibold style={{ flex: 1 }} color={colors.primary}>{shot ? t('beta.shotAdded') : t('beta.addShot')}</T>
        {shot ? <Pressable hitSlop={8} onPress={() => setShot(null)}><Ionicons name="close-circle" size={20} color={colors.muted} /></Pressable> : null}
      </Pressable>
      <Button title={t('beta.send')} icon="send" onPress={send} loading={busy} disabled={message.trim().length < 3} />
      <T size="xs" muted center style={{ marginTop: space.sm }}>{versionLabel()}</T>

      {mine.length ? (
        <View style={{ gap: space.sm }}>
          <T bold>{t('beta.myReports')}</T>
          {mine.map((r) => (
            <Card key={r.id} style={{ gap: 6 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row gap={6}><Ionicons name={ICONS[r.category]} size={15} color={colors.primary} /><T size="xs" muted>{timeAgo(r.created_at, lng)}</T></Row>
                <View style={{ backgroundColor: STATUS_COLOR[r.status] + '26', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 }}>
                  <T size="xs" semibold color={STATUS_COLOR[r.status]}>{t(`owner.st_${r.status}`)}</T>
                </View>
              </Row>
              <T size="sm" numberOfLines={3}>{r.message}</T>
              {r.admin_note ? <T size="xs" color={colors.primary}>↳ {r.admin_note}</T> : null}
            </Card>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
