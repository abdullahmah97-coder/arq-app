// زر «أضف إلى Apple Wallet» + حالة البطاقة وإيقافها (يظهر بس على iPhone ولما السيرفر يكون جاهز)
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { Row, T } from '@/components/ui';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { errorKey } from '@/lib/supabase';
import { addToWallet, myWalletPass, revokeWalletPass, walletEnabled, type WalletStatus } from '@/lib/wallet';
import { colors, fonts, space } from '@/theme';

export function WalletButton() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<WalletStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => {
    walletEnabled().then((on) => { setEnabled(on); if (on) myWalletPass().then(setStatus); });
  }, []));
  if (!enabled) return null;

  const add = async () => {
    setBusy(true);
    try { await addToWallet(); } catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };
  const revoke = () => Alert.alert(t('wallet.revokeTitle'), t('wallet.revokeBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('wallet.revoke'), style: 'destructive', onPress: async () => {
      try { await revokeWalletPass(); setStatus({ has_pass: false, code_hint: null, rotated_at: null, last_used_at: null }); Alert.alert(t('wallet.revoked')); }
      catch (e) { Alert.alert(t(errorKey(e))); }
    } },
  ]);

  return (
    <View style={{ gap: space.sm, alignItems: 'center' }}>
      <Pressable onPress={add} disabled={busy} accessibilityRole="button" accessibilityLabel={t('wallet.add')}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#000', borderRadius: 12, paddingHorizontal: 22, height: 50, opacity: pressed || busy ? 0.8 : 1, alignSelf: 'stretch', justifyContent: 'center' })}>
        {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="wallet" size={22} color="#fff" />}
        <T semibold color="#fff" style={{ fontFamily: fonts.semibold }}>{status?.has_pass ? t('wallet.update') : t('wallet.add')}</T>
      </Pressable>
      <T size="xs" muted center>{status?.has_pass ? t('wallet.hasPass', { hint: status.code_hint?.toUpperCase() }) : t('wallet.hint')}</T>
      {status?.has_pass ? (
        <Row gap={space.md}>
          {status.last_used_at ? <T size="xs" muted>{t('wallet.lastUsed', { ago: timeAgo(status.last_used_at, lng) })}</T> : null}
          <Pressable onPress={revoke} hitSlop={8}><T size="xs" semibold color={colors.danger}>{t('wallet.revoke')}</T></Pressable>
        </Row>
      ) : null}
    </View>
  );
}
