import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ProfileView } from '@/components/social/ProfileView';
import { useTranslation } from 'react-i18next';
import { Alert, I18nManager, Pressable, View } from 'react-native';
import { checkForAppUpdate, isBeta, versionLabel } from '@/lib/appInfo';
import { LanguageToggle } from '@/components/LanguageToggle';
import { MembershipEntry } from '@/components/gymops/MembershipEntry';
import { Button, Card, Row, Screen, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { errorKey, supabase } from '@/lib/supabase';
import { deleteMyAccount } from '@/lib/account';
import { unreadCount } from '@/lib/messages';
import { ownerCounts } from '@/lib/owner';
import { unregisterPush } from '@/lib/push';
import { colors, space, THEMES, type ThemeId } from '@/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '@/lib/appTheme';
import { useLocalized } from '@/lib/i18n';
import type { IconName } from '@/components/ui';

function MenuItem({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <Row style={{ paddingVertical: space.md }} gap={space.md}>
        <Ionicons name={icon} size={22} color={colors.primary} />
        <T style={{ flex: 1 }}>{label}</T>
        <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.muted} />
      </Row>
    </Pressable>
  );
}

export default function ProfileTab() {
  const { t } = useTranslation();
  const { userId, profile, health, refreshProfile } = useUser();
  const [reloadKey, setReloadKey] = useState(0);
  const [owner, setOwner] = useState<{ reports: number; brands: number } | null>(null);
  useFocusEffect(useCallback(() => {
    refreshProfile(); setReloadKey((k) => k + 1);
    ownerCounts().then(setOwner).catch(() => {});
  }, [refreshProfile]));

  return (
    <Screen>
      <ProfileView p={profile} me={userId} reloadKey={reloadKey} onProfileChanged={refreshProfile} actions={<MessagesButton userId={userId} />} />

      {health?.weight_kg ? (
        <Card style={{ gap: space.xs }}>
          <T size="sm" muted>{t('profile.healthInfo')}</T>
          <T bold>
            {health.weight_kg} {t('common.kg')} · {health.height_cm} {t('common.cm')}
            {health.goal ? ` · ${t(`onboarding.goal_${health.goal}`)}` : ''}
          </T>
        </Card>
      ) : null}

      {/* اشتراكي وبطاقة الدخول + إدارة النادي للموظفين */}
      <MembershipEntry />

      <Card style={{ paddingVertical: space.xs }}>
        {owner ? <MenuItem icon="shield-checkmark-outline" label={`${t('owner.title')}${owner.reports + owner.brands ? ` · ${owner.reports + owner.brands}` : ''}`} onPress={() => router.push('/owner')} /> : null}
        {isBeta ? <MenuItem icon="chatbubble-ellipses-outline" label={t('beta.feedback')} onPress={() => router.push('/feedback')} /> : null}
        <MenuItem icon="ribbon-outline" label={t('social.ranksTitle')} onPress={() => router.push('/ranks')} />
        <MenuItem icon="barbell-outline" label={t('workout.history')} onPress={() => router.push('/workout/history')} />
        <MenuItem icon="pulse-outline" label={t('health.title')} onPress={() => router.push('/health')} />
        <MenuItem icon="watch-outline" label={t('health.devices')} onPress={() => router.push('/devices')} />
        <MenuItem icon="analytics-outline" label={t('profile.inbody')} onPress={() => router.push('/inbody')} />
        <MenuItem icon="trending-down-outline" label={t('profile.progress')} onPress={() => router.push('/progress')} />
        <MenuItem icon="people-outline" label={t('profile.friends')} onPress={() => router.push('/friends')} />
        <MenuItem icon="create-outline" label={t('profile.edit')} onPress={() => router.push('/profile-edit')} />
        <MenuItem icon="book-outline" label={t('profile.learn')} onPress={() => router.push('/learn/body-composition')} />
      </Card>

      <Card style={{ gap: space.md }}>
        <T bold>{t('profile.theme')}</T>
        <ThemePicker />
      </Card>

      <Card style={{ gap: space.md }}>
        <T bold>{t('profile.language')}</T>
        <LanguageToggle userId={userId} />
      </Card>

      <T size="xs" muted center>🔒 {t('profile.privacy')}</T>
      <Button title={t('auth.signOut')} variant="ghost" icon="log-out-outline" onPress={async () => { await unregisterPush(); await supabase.auth.signOut(); }} />
      <Pressable onPress={() => Alert.alert(t('profile.deleteAccount'), t('profile.deleteConfirm'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('profile.deleteYes'), style: 'destructive', onPress: () => deleteMyAccount(userId).catch((e) => Alert.alert(t(errorKey(e)))) },
      ])}>
        <T size="sm" center color={colors.danger}>{t('profile.deleteAccount')}</T>
      </Pressable>
      <Pressable onPress={async () => {
        const r = await checkForAppUpdate();
        if (r === 'none') Alert.alert(t('beta.upToDate'));
        else if (r === 'unavailable') Alert.alert(t('beta.updateUnavailable'));
      }}>
        <T size="xs" muted center>{versionLabel()} · {t('beta.checkUpdate')}</T>
      </Pressable>
    </Screen>
  );
}

/** اختيار لون التطبيق: ثيمات من درجات ألوان دليل الهوية */
function ThemePicker() {
  const { theme, setTheme } = useAppTheme();
  const { lng } = useLocalized();
  return (
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      {(Object.keys(THEMES) as ThemeId[]).map((id) => {
        const th = THEMES[id];
        const active = theme === id;
        return (
          <Pressable key={id} accessibilityRole="radio" accessibilityState={{ selected: active }} accessibilityLabel={th.name[lng]}
            onPress={() => {
              if (active) return;
              setTheme(id);
              // الواجهة يُعاد تركيبها بالألوان الجديدة؛ نرجع لصفحة الحساب
              setTimeout(() => router.navigate('/(tabs)/profile'), 60);
            }}
            style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View style={{ padding: 3, borderRadius: 16, borderWidth: 2, borderColor: active ? colors.primary : 'transparent', width: '100%' }}>
              <LinearGradient colors={th.swatch} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ height: 58, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
                {active ? <Ionicons name="checkmark-circle" size={22} color={id === 'sand' ? th.swatch[2] : '#F8EDDA'} /> : null}
              </LinearGradient>
            </View>
            <T size="xs" semibold={active}>{th.name[lng]}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** زر الرسائل في حسابي مع عدد غير المقروء */
function MessagesButton({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const [n, setN] = useState(0);
  useFocusEffect(useCallback(() => { unreadCount(userId).then(setN).catch(() => {}); }, [userId]));
  return (
    <Pressable onPress={() => router.push('/messages')} accessibilityRole="button" accessibilityLabel={t('chat.title')}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: space.md, opacity: pressed ? 0.8 : 1 })}>
      <Ionicons name="chatbubbles" size={22} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <T semibold>{t('chat.title')}</T>
        <T size="xs" muted>{t('chat.rule')}</T>
      </View>
      {n > 0 ? <View style={{ minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><T size="xs" bold color={colors.onPrimary}>{n}</T></View> : null}
      <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.muted} />
    </Pressable>
  );
}
