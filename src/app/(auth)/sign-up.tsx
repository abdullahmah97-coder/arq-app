import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { Button, H, Input, Row, Screen, T } from '@/components/ui';
import { currentLocale } from '@/lib/i18n';
import { handOffEmail } from '@/lib/passwordReset';
import { errorKey, supabase } from '@/lib/supabase';
import type { Gender } from '@/lib/types';
import { Logo } from '@/brand/Brand';
import { brand, colors, radius, space } from '@/theme';

export default function SignUp() {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [busy, setBusy] = useState(false);

  /** عنده حساب من قبل: نوديه لتسجيل الدخول أو لاسترجاع كلمة المرور */
  const alreadyHave = (title: string, body: string) => Alert.alert(title, body, [
    { text: t('auth.forgot'), onPress: () => { handOffEmail(email); router.replace('/forgot-password'); } },
    { text: t('auth.signIn'), onPress: () => router.back() },
    { text: t('common.cancel'), style: 'cancel' },
  ]);

  const submit = async () => {
    const u = username.trim().toLowerCase();
    if (!fullName || !u || !email || !password || !gender) return Alert.alert(t('errors.required'));
    if (!/^[a-z0-9_.]{3,24}$/.test(u)) return Alert.alert(t('errors.invalidUsername'));
    if (password.length < 8) return Alert.alert(t('errors.shortPassword'));

    setBusy(true);
    const { data: taken } = await supabase.from('profiles').select('id').eq('username', u).maybeSingle();
    if (taken) { setBusy(false); return alreadyHave(t('errors.usernameTaken'), t('auth.usernameTakenHint')); }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { username: u, full_name: fullName.trim(), gender, locale: currentLocale() } },
    });
    setBusy(false);
    if (error) {
      const key = errorKey(error);
      return key === 'errors.emailTaken' ? alreadyHave(t(key), t('auth.emailTakenHint')) : Alert.alert(t(key));
    }
    // الإيميل مسجّل من قبل: Supabase يرد «نجاح» بحساب وهمي بدون هويات عشان ما يكشف الحسابات، فنكشفه هنا
    if (data.user && (data.user.identities?.length ?? 0) === 0) return alreadyHave(t('errors.emailTaken'), t('auth.emailTakenHint'));
    if (!data.session) {
      Alert.alert(t('auth.checkEmail'));
      router.back();
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ alignItems: 'flex-start', gap: space.md, marginTop: space.sm }}>
          <Logo variant="lockup" height={20} color={brand.deepGreen} />
          <H>{t('auth.signUp')}</H>
        </View>
        <Input label={t('auth.fullName')} value={fullName} onChangeText={setFullName} autoComplete="name" />
        <View style={{ gap: space.xs }}>
          <T size="sm" muted>{t('onboarding.gender')}</T>
          <Row gap={space.md}>
            {(['male', 'female'] as const).map((g) => (
              <Pressable
                key={g}
                onPress={() => setGender(g)}
                style={{
                  flex: 1, alignItems: 'center', gap: space.xs, paddingVertical: space.lg, borderRadius: radius.lg,
                  backgroundColor: gender === g ? '#FDEBDD' : colors.card, borderWidth: 2, borderColor: gender === g ? colors.primary : colors.border,
                }}
              >
                <Ionicons name={g === 'male' ? 'male' : 'female'} size={28} color={gender === g ? colors.primary : colors.muted} />
                <T bold color={gender === g ? colors.primary : colors.text}>{t(`onboarding.${g}`)}</T>
              </Pressable>
            ))}
          </Row>
        </View>
        <Input label={t('auth.username')} hint={t('auth.usernameHint')} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
        <Input label={t('auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Input label={t('auth.password')} hint={t('auth.passwordHint')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
        <Button title={t('auth.signUp')} onPress={submit} loading={busy} />
        <Button title={`${t('auth.haveAccount')} ${t('auth.signIn')}`} variant="ghost" onPress={() => router.back()} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
