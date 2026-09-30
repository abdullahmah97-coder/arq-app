import { Link, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandGradient, Logo, SaduPattern } from '@/brand/Brand';
import { LanguageToggle } from '@/components/LanguageToggle';
import { Button, Input, T } from '@/components/ui';
import { handOffEmail } from '@/lib/passwordReset';
import { errorKey, supabase } from '@/lib/supabase';
import { brand, colors, space } from '@/theme';

export default function SignIn() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const forgot = () => { handOffEmail(email); router.push('/forgot-password'); };

  /** يرسل رابط تأكيد الإيميل مرة ثانية */
  const resendConfirm = async () => {
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
    Alert.alert(error ? t(errorKey(error)) : t('auth.confirmResent'));
  };

  const submit = async () => {
    if (!email || !password) return Alert.alert(t('errors.required'));
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (!error) return;
    const key = errorKey(error);
    // ما أكّد إيميله للحين: نقول له وش يسوي بدل «صار خطأ»
    if (key === 'errors.emailNotConfirmed') {
      return Alert.alert(t(key), t('auth.confirmFirstBody'), [
        { text: t('auth.resendConfirm'), onPress: () => { void resendConfirm(); } },
        { text: t('common.close'), style: 'cancel' },
      ]);
    }
    if (key === 'errors.invalidLogin') {
      return Alert.alert(t(key), t('auth.invalidLoginHint'), [
        { text: t('auth.forgot'), onPress: forgot },
        { text: t('common.close'), style: 'cancel' },
      ]);
    }
    Alert.alert(t(key));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        {/* غلاف الهوية: تدرج الكثبان مع الشعار كما في غلاف دليل الهوية */}
        <BrandGradient name="glow" style={{ paddingBottom: space.xxl * 1.5 }}>
          <SaduPattern variant="peaks" color={brand.cream} opacity={0.25} />
          <SafeAreaView edges={['top']} style={{ paddingHorizontal: space.lg }}>
            <View style={{ alignItems: 'flex-end', paddingTop: space.sm }}>
              <LanguageToggle compact />
            </View>
            <View style={{ alignItems: 'center', gap: space.lg, marginTop: space.xl }}>
              <Logo variant="mark" height={96} color={brand.cream} />
              <Logo variant="lockup" height={26} color={brand.deepGreen} />
              <T size="lg" semibold color={brand.deepGreen}>{t('app.tagline')}</T>
            </View>
          </SafeAreaView>
        </BrandGradient>

        <View style={{ padding: space.lg, gap: space.lg, marginTop: -space.lg }}>
          <T muted center size="sm">{t('app.about')}</T>
          <Input label={t('auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <View style={{ gap: space.sm }}>
            <Input label={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
            {/* استرجاع الحساب برمز على الإيميل */}
            <Pressable onPress={forgot} hitSlop={10}
              accessibilityRole="link" style={{ alignSelf: 'flex-end', paddingVertical: space.xs }}>
              <T size="sm" semibold color={colors.primary}>{t('auth.forgot')}</T>
            </Pressable>
          </View>
          <Button title={t('auth.signIn')} onPress={submit} loading={busy} />
          <Link href="/sign-up" asChild>
            <Button title={`${t('auth.noAccount')} ${t('auth.signUp')}`} variant="ghost" />
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
