// أول شيء: تعويض دوال Node اللي تحتاجها بعض المكتبات (لازم قبل أي استيراد ثاني)
import '@/polyfills/process';
import {
  NotoKufiArabic_300Light, NotoKufiArabic_400Regular, NotoKufiArabic_600SemiBold, NotoKufiArabic_700Bold, useFonts,
} from '@expo-google-fonts/noto-kufi-arabic';
import { DefaultTheme, Stack, ThemeProvider, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HeaderBack } from '@/components/HeaderBack';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { Button, Loading, T } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { flushLastFatal, installGlobalErrorLogger } from '@/lib/events';
import { HealthProvider } from '@/lib/health';
import { restoreLocale } from '@/lib/i18n';
import { usePushSetup } from '@/lib/push';
import { colors, fontAssets, fonts, space, type ThemeId } from '@/theme';
import { restoreTheme, saveTheme, ThemeCtx } from '@/lib/appTheme';

/** الصفحات اللي تفتح كنافذة من تحت: زر إغلاق بدل سهم الرجوع */
const MODAL_ROUTES = new Set([
  'post/new', 'challenge/new', 'feedback', 'program/new', 'tip/new',
  'clubs/chain-edit', 'clubs/review', 'clubs/offer', 'store/join', 'store/product', 'food/add', 'food/photo', 'exercise/[id]',
  'checkin/index', 'owner-event',
]);

const navTheme = () => ({
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.bg, card: colors.bg, text: colors.text, border: colors.border, primary: colors.primary },
});

/** مسجّل دخول بس ما قدرنا نجيب الحساب (غالباً بدون إنترنت): نعرض إعادة محاولة بدل صفحة البداية */
function ProfileRetry() {
  const { t } = useTranslation();
  const { refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl, backgroundColor: colors.bg }}>
      <T bold center>{t('errors.profileLoad')}</T>
      <T size="sm" muted center>{t('errors.network')}</T>
      <Button title={t('common.retry')} icon="refresh" loading={busy} style={{ alignSelf: 'stretch' }}
        onPress={async () => { setBusy(true); try { await refreshProfile(); } finally { setBusy(false); } }} />
    </View>
  );
}

function RootNavigator() {
  const { session, loading, profile } = useAuth();
  const { t } = useTranslation();
  const navReady = !!useRootNavigationState()?.key;
  // إشعارات الجوال: ربط الجهاز بالحساب وفتح الصفحة لما تضغط إشعار (بعد ما يجهز التنقّل)
  usePushSetup(!!session && !!profile?.onboarded && !loading, navReady);

  // ننتظر لين نعرف حالة الدخول (بدل ما تومض صفحة تسجيل الدخول عند كل فتح)
  if (loading) return <Loading />;
  if (session && !profile) return <ProfileRetry />;

  const signedIn = !!session;
  const onboarded = !!profile?.onboarded;

  return (
    <Stack
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.title },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
        headerBackButtonDisplayMode: 'minimal',
        // الصفحات اللي تحط عنوانها بنفسها بعد التحميل ما يطلع فيها اسم المسار (مثل coaches/[id])
        title: '',
        // زر رجوع خاص يشتغل دائماً (بدل الأصلي)، وزر إغلاق للنوافذ
        headerLeft: () => <HeaderBack close={MODAL_ROUTES.has(route.name)} />,
        gestureEnabled: true,
      })}
      // خطأ داخل صفحة يعرض رسالة مع زر رجوع بدل ما يقفل التطبيق
      screenLayout={({ children, route }) => <ScreenErrorBoundary name={route.name}>{children}</ScreenErrorBoundary>}
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
        {/* صفحة التمرين تفتح كنافذة من تحت: ترجع منها دائماً (حتى لو فتحتها من داخل تمرين شغّال) */}
        <Stack.Screen name="exercise/[id]" options={{ title: '', presentation: 'modal', gestureEnabled: true }} />
        <Stack.Screen name="exercises" options={{ title: t('library.title') }} />
        <Stack.Screen name="feedback" options={{ title: t('beta.feedback'), presentation: 'modal' }} />
        {/* نافذة من تحت: تنسحب لتحت للإغلاق، وفيها زر إغلاق واضح */}
        <Stack.Screen name="coach" options={{ headerShown: false, presentation: 'modal', gestureEnabled: true }} />
        <Stack.Screen name="workout/log" options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="workout/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="workout/history" options={{ title: t('workout.history') }} />
        <Stack.Screen name="programs" options={{ title: t('programs.title') }} />
        <Stack.Screen name="program/[id]" options={{ title: t('social.program') }} />
        <Stack.Screen name="program/new" options={{ title: t('social.newProgram'), presentation: 'modal' }} />
        <Stack.Screen name="tip/new" options={{ title: t('social.newTip'), presentation: 'modal' }} />
        <Stack.Screen name="ranks" options={{ title: t('social.ranksTitle') }} />
        <Stack.Screen name="gym/[id]" options={{ title: t('presence.title') }} />
        <Stack.Screen name="messages" options={{ title: t('chat.title') }} />
        <Stack.Screen name="owner" options={{ title: t('owner.title') }} />
        <Stack.Screen name="clubs/index" options={{ title: t('clubs.title') }} />
        <Stack.Screen name="clubs/[id]" options={{ title: '' }} />
        <Stack.Screen name="clubs/chain/[id]" options={{ title: '' }} />
        <Stack.Screen name="clubs/chain-edit" options={{ title: t('clubs.editChain'), presentation: 'modal' }} />
        <Stack.Screen name="clubs/review" options={{ title: t('clubs.rate'), presentation: 'modal' }} />
        <Stack.Screen name="clubs/offer" options={{ title: t('clubs.addOffer'), presentation: 'modal' }} />
        <Stack.Screen name="chat/[id]" options={{ title: '' }} />
        <Stack.Screen name="checkin/[id]" options={{ title: t('presence.comments') }} />
        <Stack.Screen name="checkin/index" options={{ title: t('checkin.title'), presentation: 'modal' }} />
        <Stack.Screen name="store/index" options={{ title: t('store.title') }} />
        <Stack.Screen name="store/[id]" options={{ title: '' }} />
        <Stack.Screen name="store/join" options={{ title: t('store.addYours'), presentation: 'modal' }} />
        <Stack.Screen name="store/manage" options={{ title: t('store.myStore') }} />
        <Stack.Screen name="store/product" options={{ title: t('store.product'), presentation: 'modal' }} />
        <Stack.Screen name="follows/[id]" options={{ title: '' }} />
        <Stack.Screen name="food/add" options={{ title: t('food.addFood'), presentation: 'modal' }} />
        <Stack.Screen name="food/photo" options={{ title: t('meal.title'), presentation: 'modal' }} />
        <Stack.Screen name="notifications/index" options={{ title: t('notif.title') }} />
        <Stack.Screen name="notifications/settings" options={{ title: t('notif.settings') }} />
        <Stack.Screen name="owner-nudges" options={{ title: t('nudge.title') }} />
        <Stack.Screen name="owner-partners" options={{ title: t('partners.manageTitle') }} />
        <Stack.Screen name="owner-ads" options={{ title: t('ads.ownerTitle') }} />
        <Stack.Screen name="owner-ad" options={{ title: t('ads.new'), presentation: 'modal' }} />
        <Stack.Screen name="partners" options={{ title: t('partners.hubName') }} />
        <Stack.Screen name="clubs/join" options={{ title: t('partners.joinClubTitle'), presentation: 'modal' }} />
        <Stack.Screen name="store/offer" options={{ title: t('partners.addOffer'), presentation: 'modal' }} />
        <Stack.Screen name="store/import" options={{ title: t('partners.importTitle'), presentation: 'modal' }} />
        <Stack.Screen name="recovery/manage" options={{ title: t('partners.centerDashboard') }} />
        <Stack.Screen name="recovery/appointments" options={{ title: t('partners.myAppointments') }} />
        <Stack.Screen name="events/index" options={{ title: t('events.title') }} />
        <Stack.Screen name="events/[id]" options={{ title: '' }} />
        <Stack.Screen name="owner-events" options={{ title: t('events.title') }} />
        <Stack.Screen name="owner-event" options={{ title: t('events.new'), presentation: 'modal' }} />
        <Stack.Screen name="owner-calorie-alert" options={{ title: t('kcalAlert.title') }} />
        <Stack.Screen name="book/index" options={{ title: t('book.title') }} />
        <Stack.Screen name="book/[id]" options={{ title: '' }} />
        <Stack.Screen name="bookings" options={{ title: t('book.myBookings') }} />
        <Stack.Screen name="venues/join" options={{ title: t('venue.joinTitle') }} />
        <Stack.Screen name="venues/manage" options={{ title: t('venue.dashboard') }} />
      </Stack.Protected>
    </Stack>
  );
}

installGlobalErrorLogger();

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [themeId, setThemeId] = useState<ThemeId>('palm');
  const [fontsLoaded] = useFonts({ NotoKufiArabic_300Light, NotoKufiArabic_400Regular, NotoKufiArabic_600SemiBold, NotoKufiArabic_700Bold, ...fontAssets });
  useEffect(() => {
    Promise.all([restoreLocale(), restoreTheme().then(setThemeId)]).finally(() => setReady(true));
    // لو انقفل التطبيق بخطأ في التشغيل السابق نرسل تفاصيله الحين
    flushLastFatal();
  }, []);
  const themeCtx = useMemo(() => ({
    theme: themeId,
    setTheme: (id: ThemeId) => { saveTheme(id); setThemeId(id); },
  }), [themeId]);

  return (
    <SafeAreaProvider>
      {/* الدخول والصحة فوق الثيم: تغيير الثيم يعيد رسم الواجهة بدون ما يضيع تسجيل الدخول */}
      <AuthProvider>
        <HealthProvider>
          {/* تغيير الثيم يعيد تركيب الواجهة (key) لتقرأ الرموز الجديدة */}
          <ThemeProvider value={navTheme()} key={themeId}>
            <StatusBar style="dark" />
            {ready && fontsLoaded ? (
              <ThemeCtx.Provider value={themeCtx}>
                <RootNavigator />
              </ThemeCtx.Provider>
            ) : <Loading />}
          </ThemeProvider>
        </HealthProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
