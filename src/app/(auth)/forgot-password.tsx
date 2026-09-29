// نسيت كلمة المرور: الإيميل ← رمز على الإيميل ← كلمة مرور جديدة، وتدخل حسابك على طول
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { Logo } from '@/brand/Brand';
import { Button, H, Input, Row, Screen, T } from '@/components/ui';
import { looksLikeEmail, resetPasswordWithCode, sendRecoveryCode, takeHandedEmail } from '@/lib/passwordReset';
import { errorKey } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

/** Supabase يسمح بطلب رمز جديد كل ٦٠ ثانية */
const RESEND_AFTER = 60;

const back = () => (router.canGoBack() ? router.back() : router.replace('/sign-in'));

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState(takeHandedEmail);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const send = async () => {
    const e = email.trim();
    if (!looksLikeEmail(e)) return Alert.alert(t('errors.badEmail'));
    setBusy(true);
    try {
      await sendRecoveryCode(e);
      setSentTo(e);
      setCode('');
      setWait(RESEND_AFTER);
    } catch (err) {
      Alert.alert(t(errorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!sentTo) return;
    if (code.replace(/\D/g, '').length < 6) return Alert.alert(t('errors.badCode'));
    if (password.length < 8) return Alert.alert(t('errors.shortPassword'));
    if (password !== confirm) return Alert.alert(t('errors.passwordMismatch'));
    setBusy(true);
    try {
      const r = await resetPasswordWithCode(sentTo, code, password);
      // انفتحت الجلسة: التطبيق ينقلك لحسابك تلقائياً
      Alert.alert(r.saved ? t('auth.passwordChanged') : t('auth.passwordNotSaved'));
    } catch (err) {
      Alert.alert(t(errorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ alignItems: 'flex-start', gap: space.md, marginTop: space.sm }}>
          <Logo variant="lockup" height={20} color={brand.deepGreen} />
          <H>{t('auth.forgotTitle')}</H>
        </View>

        {!sentTo ? (
          <>
            <T muted>{t('auth.forgotIntro')}</T>
            <Input label={t('auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false}
              keyboardType="email-address" autoComplete="email" textContentType="emailAddress" returnKeyType="send" onSubmitEditing={send} />
            <Button title={t('auth.sendCode')} icon="mail-outline" onPress={send} loading={busy} />
          </>
        ) : (
          <>
            <Row gap={space.md} style={{ alignItems: 'flex-start', backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: space.md }}>
              <Ionicons name="mail-unread-outline" size={24} color={colors.primary} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, gap: space.sm }}>
                <T size="sm">{t('auth.codeSent', { email: sentTo })}</T>
                <Pressable onPress={() => { setSentTo(null); setCode(''); setPassword(''); setConfirm(''); }} disabled={busy}
                  hitSlop={10} accessibilityRole="button" style={{ alignSelf: 'flex-start' }}>
                  <T size="sm" semibold color={colors.primary}>{t('auth.changeEmail')}</T>
                </Pressable>
              </View>
            </Row>
            <Input label={t('auth.code')} value={code} onChangeText={(v) => setCode(v.replace(/[^\d]/g, '').slice(0, 10))}
              keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={10} placeholder="••••••••"
              style={{ textAlign: 'center', fontSize: 22, letterSpacing: 6, writingDirection: 'ltr' }} />
            <Input label={t('auth.newPassword')} hint={t('auth.passwordHint')} value={password} onChangeText={setPassword}
              secureTextEntry autoComplete="new-password" textContentType="newPassword" />
            <Input label={t('auth.confirmPassword')} value={confirm} onChangeText={setConfirm}
              secureTextEntry autoComplete="new-password" textContentType="newPassword" returnKeyType="done" onSubmitEditing={save} />
            <Button title={t('auth.savePassword')} icon="key-outline" onPress={save} loading={busy} />
            <Button title={wait > 0 ? t('auth.resendIn', { s: wait }) : t('auth.resend')} variant="secondary" small
              disabled={wait > 0 || busy} onPress={send} />
          </>
        )}

        <Button title={t('auth.backToSignIn')} variant="ghost" onPress={back} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
