import { Tabs } from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';
import { PulseTabBar } from '@/components/pulse/TabBar';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { LaunchAdGate } from '@/components/ads/LaunchAd';
import { TourGate } from '@/components/tour/TourGate';
import { UpdateBanner } from '@/components/UpdateBanner';
import { WakeWatcher } from '@/components/timeline/Timeline';

export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <>
    <Tabs
      tabBar={(props) => <PulseTabBar {...props} />}
      screenOptions={{ headerShown: false }}
      // خطأ في تبويب يعرض رسالة داخل التبويب نفسه بدل ما يقفل التطبيق
      screenLayout={({ children, route }) => <ScreenErrorBoundary name={`(tabs)/${route.name}`}>{children}</ScreenErrorBoundary>}
    >
      <Tabs.Screen name="index" options={{ title: t('home.tab') }} />
      <Tabs.Screen name="plan" options={{ title: t('plan.title') }} />
      <Tabs.Screen name="community" options={{ title: t('feed.title') }} />
      <Tabs.Screen name="compete" options={{ title: t('compete.title') }} />
      <Tabs.Screen name="profile" options={{ title: t('profile.title') }} />
    </Tabs>
    {/* تحديث فوري جاهز: زر «حدّث الحين» بدل إعادة فتح التطبيق مرتين */}
    <UpdateBanner />
    {/* جولة التعريف: أول دخول بعد إنشاء الحساب */}
    <TourGate />
    {/* إعلان البداية: يظهر مرة بعد فتح التطبيق حسب إعدادات إدارة التطبيق (وما يطلع فوق جولة التعريف) */}
    <LaunchAdGate />
    {/* «صحى ☀️» في التايم لاين: مرة باليوم لما تفتح التطبيق الصبح */}
    <WakeWatcher />
    </>
  );
}
