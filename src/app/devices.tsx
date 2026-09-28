// ربط الجوال والساعة: Apple Health (iOS) / Health Connect (Android) + وضع تجريبي
import { Ionicons } from '@expo/vector-icons';
import { ImageBackground } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Logo } from '@/brand/Brand';
import { Button, Card, Row, T, type IconName } from '@/components/ui';
import { useHealth } from '@/lib/health';
import { brand, colors, space, TAB_BAR_SPACE } from '@/theme';

const READS: [IconName, string][] = [
  ['footsteps', 'health.steps'], ['moon', 'health.sleep'], ['heart', 'health.rhr'], ['pulse', 'health.hrv'], ['flame', 'health.kcal'],
];

export default function Devices() {
  const { t } = useTranslation();
  const h = useHealth();
  const [busy, setBusy] = useState(false);
  const ios = Platform.OS === 'ios';
  const android = Platform.OS === 'android';
  const native = ios || android;
  const realConnected = h.status === 'connected' && h.source !== 'demo';

  const connect = async () => {
    setBusy(true);
    try {
      const ok = await h.connect();
      if (!ok) Alert.alert(t('health.unavailable'));
      else router.dismissTo('/health');
    } finally { setBusy(false); }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: TAB_BAR_SPACE }}>
      <ImageBackground source={require('../../assets/imagery/sprint.jpg')} style={styles.hero} imageStyle={{ borderRadius: 20 }} contentFit="cover">
        <LinearGradient colors={['rgba(10,51,45,0.1)', 'rgba(10,51,45,0.95)']} style={[StyleSheet.absoluteFill, { borderRadius: 20 }]} />
        <View style={{ flex: 1, justifyContent: 'flex-end', padding: space.lg, gap: 6 }}>
          <Logo variant="mark" height={20} color={brand.orange} />
          <T size="xl" bold color={brand.cream}>{t('health.connectTitle')}</T>
          <T size="sm" color={brand.sand} style={{ lineHeight: 22 }}>{t('health.connectBody')}</T>
        </View>
      </ImageBackground>

      {native ? (
        <Card style={{ gap: space.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={space.md}>
              <View style={[styles.srcIcon, { backgroundColor: ios ? '#FFFFFF' : brand.deepGreen }]}>
                <Ionicons name={ios ? 'heart' : 'fitness'} size={24} color={ios ? '#FF2D55' : brand.amber} />
              </View>
              <View>
                <T bold>{ios ? 'Apple Health' : 'Health Connect'}</T>
                <T size="xs" muted>{ios ? t('health.via_ios') : t('health.via_android')}</T>
              </View>
            </Row>
            <View style={[styles.dot, { backgroundColor: realConnected ? brand.green : colors.border }]} />
          </Row>
          <T size="sm" muted>{ios ? t('health.watches_ios') : t('health.watches_android')}</T>
          {h.status === 'unavailable' ? <T size="sm" color={colors.danger}>{t('health.unavailable')}</T> : null}
          {realConnected ? (
            <View style={{ gap: space.sm }}>
              <Button title={t('health.refresh')} icon="sync" onPress={() => h.refresh()} loading={h.syncing} />
              {h.openSettings ? <Button title={t('health.manage')} variant="secondary" icon="settings-outline" onPress={() => h.openSettings?.()} /> : null}
              <Button title={t('health.disconnect')} variant="ghost" onPress={() => h.disconnect()} />
            </View>
          ) : (
            <Button title={t('health.connect')} icon="link" onPress={connect} loading={busy} disabled={h.status === 'unavailable'} />
          )}
        </Card>
      ) : null}

      <Card style={{ gap: space.md }}>
        <T bold>{t('health.components')}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {READS.map(([icon, key]) => (
            <Row key={key} gap={6} style={styles.chip}>
              <Ionicons name={icon} size={14} color={brand.orange} />
              <T size="xs">{t(key)}</T>
            </Row>
          ))}
        </View>
        <T size="xs" muted style={{ lineHeight: 20 }}>{t('health.noWatch')}</T>
      </Card>

      <Card style={{ gap: space.sm }}>
        <Row><Ionicons name="flask-outline" size={18} color={brand.green} /><T bold>{t('health.demo')}</T></Row>
        <Button title={h.source === 'demo' ? t('health.disconnect') : t('health.demo')} variant="secondary"
          onPress={() => (h.source === 'demo' ? h.disconnect() : (h.useDemo(), router.dismissTo('/health')))} />
      </Card>

      <Row style={{ alignItems: 'flex-start' }}>
        <Ionicons name="lock-closed-outline" size={16} color={colors.muted} />
        <T size="xs" muted style={{ flex: 1, lineHeight: 20 }}>{t('health.privacy')}</T>
      </Row>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { height: 240, borderRadius: 20, overflow: 'hidden' },
  srcIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  dot: { width: 12, height: 12, borderRadius: 6 },
  chip: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
});
