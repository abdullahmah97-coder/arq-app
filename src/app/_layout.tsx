import {
  NotoKufiArabic_300Light, NotoKufiArabic_400Regular, NotoKufiArabic_600SemiBold, NotoKufiArabic_700Bold, useFonts,
} from '@expo-google-fonts/noto-kufi-arabic';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Loading } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { HealthProvider } from '@/lib/health';
import { restoreLocale } from '@/lib/i18n';
import { colors, fontAssets, fonts, type ThemeId } from '@/theme';
import { restoreTheme, saveTheme, ThemeCtx } from '@/lib/appTheme';

const navTheme = () => ({
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.bg, card: colors.bg, text: colors.text, border: colors.border, primary: colors.primary },
});

function RootNavigator() {
  const { session, loading, profile } = useAuth();
  const { t } = useTranslation();

  if (loading && session) return <Loading />;

  const signedIn = !!session;
  const onboarded = !!profile?.onboarded;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.title },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && !onboarded}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && onboarded}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="post/new" options={{ title: t('feed.newPost'), presentation: 'modal' }} />
        <Stack.Screen name="post/[id]" options={{ title: t('feed.comments') }} />
        <Stack.Screen name="challenge/new" options={{ title: t('compete.newChallenge'), presentation: 'modal' }} />
        <Stack.Screen name="challenge/[id]" options={{ title: t('compete.challenges') }} />
        <Stack.Screen name="friends" options={{ title: t('friends.title') }} />
        <Stack.Screen name="user/[id]" options={{ title: '' }} />
        <Stack.Screen name="progress" options={{ title: t('profile.progress') }} />
        <Stack.Screen name="profile-edit" options={{ title: t('profile.edit') }} />
        <Stack.Screen name="inbody/index" options={{ title: t('inbody.title') }} />
        <Stack.Screen name="inbody/review" options={{ title: t('inbody.review') }} />
        <Stack.Screen name="inbody/[id]" options={{ title: t('inbody.results') }} />
        <Stack.Screen name="learn/body-composition" options={{ title: t('inbody.learn') }} />
        <Stack.Screen name="learn/inbody" options={{ title: t('inbody.learn') }} />
        <Stack.Screen name="health" options={{ headerShown: false }} />
        <Stack.Screen name="devices" options={{ title: t('health.devices') }} />
        <Stack.Screen name="exercise/[id]" options={{ title: '' }} />
        <Stack.Screen name="feedback" options={{ title: t('beta.feedback'), presentation: 'modal' }} />
        <Stack.Screen name="coach" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="workout/log" options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="workout/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="workout/history" options={{ title: t('workout.history') }} />
        <Stack.Screen name="programs" options={{ title: t('programs.title') }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [themeId, setThemeId] = useState<ThemeId>('palm');
  const [fontsLoaded] = useFonts({ NotoKufiArabic_300Light, NotoKufiArabic_400Regular, NotoKufiArabic_600SemiBold, NotoKufiArabic_700Bold, ...fontAssets });
  useEffect(() => {
    Promise.all([restoreLocale(), restoreTheme().then(setThemeId)]).finally(() => setReady(true));
  }, []);
  const themeCtx = useMemo(() => ({
    theme: themeId,
    setTheme: (id: ThemeId) => { saveTheme(id); setThemeId(id); },
  }), [themeId]);

  return (
    <SafeAreaProvider>
      {/* تغيير الثيم يعيد تركيب الواجهة (key) لتقرأ الرموز الجديدة */}
      <ThemeProvider value={navTheme()} key={themeId}>
        <StatusBar style="dark" />
        {ready && fontsLoaded ? (
          <ThemeCtx.Provider value={themeCtx}>
            <AuthProvider>
              <HealthProvider>
                <RootNavigator />
              </HealthProvider>
            </AuthProvider>
          </ThemeCtx.Provider>
        ) : <Loading />}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
