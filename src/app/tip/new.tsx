// نشر نصيحة للمجتمع (متاح لرتبة «متقدم» فأعلى أو المدرب الموثّق)
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, TextInput, View } from 'react-native';
import { Button, Card, Empty, Screen, Segmented, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { useLocalized } from '@/lib/i18n';
import { canPublish, RANKS } from '@/lib/ranks';
import { publishTip, TIP_TAGS, type TipTag } from '@/lib/social';
import { errorKey } from '@/lib/supabase';
import { colors, fonts } from '@/theme';

export default function NewTip() {
  const { t } = useTranslation();
  const { L } = useLocalized();
  const { userId, profile } = useUser();
  const [body, setBody] = useState('');
  const [tag, setTag] = useState<TipTag>('training');
  const [busy, setBusy] = useState(false);

  if (!canPublish('tip', profile)) {
    return <Screen><Empty icon="lock-closed-outline" text={t('social.tipsLocked', { rank: L(RANKS[2].name) })} /></Screen>;
  }

  const send = async () => {
    if (body.trim().length < 3) return Alert.alert(t('social.err_tipShort'));
    setBusy(true);
    try {
      await publishTip(userId, body, tag);
      router.back();
    } catch (e) {
      Alert.alert(t(errorKey(e)));
    } finally { setBusy(false); }
  };

  return (
    <Screen edges={['bottom']}>
      <T muted style={{ lineHeight: 24 }}>{t('social.newTipIntro')}</T>
      <Segmented<TipTag> wrap value={tag} onChange={setTag} options={TIP_TAGS.map((v) => ({ value: v, label: t(`social.tag_${v}`) }))} />
      <Card>
        <TextInput value={body} onChangeText={setBody} multiline maxLength={500} autoFocus placeholder={t('social.tipPh')} placeholderTextColor={colors.muted}
          style={{ minHeight: 160, textAlignVertical: 'top', color: colors.text, fontFamily: fonts.regular, fontSize: 16, lineHeight: 26, textAlign: 'auto' }} />
        <View style={{ alignItems: 'flex-end' }}><T size="xs" muted>{body.length}/500</T></View>
      </Card>
      <Button title={t('social.publish')} icon="paper-plane-outline" loading={busy} onPress={send} />
    </Screen>
  );
}
