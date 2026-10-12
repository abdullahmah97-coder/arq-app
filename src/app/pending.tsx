// شاشة الانتظار: الحساب الجديد ما يدخل التطبيق لين يقبله المشرف من لوحة إدارة التطبيق.
// نتحقق كل ٣٠ ثانية وكل ما يرجع للتطبيق، ونرسل له إشعار أول ما ينقبل. يقدر يطلع أو يحذف حسابه من هنا.
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AppState, Pressable, View } from 'react-native';
import { Logo } from '@/brand/Brand';
import { LanguageToggle } from '@/components/LanguageToggle';
import { Button, Card, Row, Screen, T } from '@/components/ui';
import { deleteMyAccount } from '@/lib/account';
import { useAuth } from '@/lib/auth';
import { enablePush, pushStatus, unregisterPush, type PushStatus } from '@/lib/push';
import { errorKey, supabase } from '@/lib/supabase';
import { brand, colors, space } from '@/theme';

const EVERY = 30_000;

export default function Pending() {
  const { t } = useTranslation();
  const { session, profile, refreshProfile } = useAuth();
  const [checking, setChecking] = useState(false);
  const [still, setStill] = useState(false);
  const [push, setPush] = useState<PushStatus | null>(null);
  const rejected = profile?.approval === 'rejected';
  const uid = session?.user.id;

  const check = useCallback(async (manual = false) => {
    if (manual) setChecking(true);
    try { await refreshProfile(); } finally { if (manual) { setChecking(false); setStill(true); } }
  }, [refreshProfile]);

  useEffect(() => {
    pushStatus().then(setPush).catch(() => setPush('unsupported'));
    const timer = setInterval(() => { void check(); }, EVERY);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void check(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [check]);

  const signOut = async () => {
    await unregisterPush().catch(() => {});
    await supabase.auth.signOut();
  };
  const remove = () => Alert.alert(t('profile.deleteAccount'), t('profile.deleteConfirm'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('profile.deleteYes'), style: 'destructive', onPress: () => { if (uid) deleteMyAccount(uid).catch((e) => Alert.alert(t(errorKey(e)))); } },
  ]);

  const name = profile?.full_name?.trim() || (profile?.username ? `@${profile.username}` : session?.user.email ?? '');

  return (
    <Screen edges={['top', 'bottom']}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Logo variant="lockup" height={20} color={brand.deepGreen} />
        <LanguageToggle compact userId={uid} />
      </Row>

      <Card style={{ gap: space.md, alignItems: 'center', paddingVertical: space.xl, marginTop: space.lg }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: rejected ? colors.cardAlt : brand.deepGreen }}>
          <Ionicons name={rejected ? 'close-circle-outline' : 'hourglass-outline'} size={36} color={rejected ? colors.danger : brand.cream} />
        </View>
        <T size="xl" bold center>{t(rejected ? 'approval.rejectedTitle' : 'approval.pendingTitle')}</T>
        <T center style={{ lineHeight: 26 }}>{t(rejected ? 'approval.rejectedBody' : 'approval.pendingBody')}</T>
        {name ? <T size="sm" muted center>{t('approval.signedInAs', { name })}</T> : null}
      </Card>

      {!rejected ? (
        <View style={{ gap: space.sm }}>
          {push === 'on' ? (
            <Row gap={6} style={{ justifyContent: 'center' }}>
              <Ionicons name="notifications" size={16} color={brand.green} />
              <T size="sm" color={brand.green}>{t('approval.notifyOn')}</T>
            </Row>
          ) : push === 'ask' ? (
            <Button title={t('approval.notifyMe')} icon="notifications-outline" variant="secondary"
              onPress={async () => setPush(await enablePush(true))} />
          ) : null}
          <Button title={t('approval.checkNow')} icon="refresh" loading={checking} onPress={() => check(true)} />
          {still && !checking ? <T size="sm" muted center>{t('approval.stillPending')}</T> : null}
        </View>
      ) : (
        <Button title={t('approval.checkNow')} icon="refresh" variant="secondary" loading={checking} onPress={() => check(true)} />
      )}

      <View style={{ gap: space.sm, marginTop: space.lg }}>
        <Button title={t('auth.signOut')} variant="ghost" icon="log-out-outline" onPress={signOut} />
        <Pressable onPress={remove} accessibilityRole="button" hitSlop={8} style={{ paddingVertical: space.sm }}>
          <T size="sm" center color={colors.danger}>{t('profile.deleteAccount')}</T>
        </Pressable>
      </View>
    </Screen>
  );
}
