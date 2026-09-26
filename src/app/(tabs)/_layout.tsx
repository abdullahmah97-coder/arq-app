import { Tabs } from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';
import { PulseTabBar } from '@/components/pulse/TabBar';

export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs tabBar={(props) => <PulseTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: t('home.tab') }} />
      <Tabs.Screen name="plan" options={{ title: t('plan.title') }} />
      <Tabs.Screen name="community" options={{ title: t('feed.title') }} />
      <Tabs.Screen name="compete" options={{ title: t('compete.title') }} />
      <Tabs.Screen name="profile" options={{ title: t('profile.title') }} />
    </Tabs>
  );
}
