// بوابات الدخول: مفتاح لكل بوابة يربطها مزوّد البوابة مع أرك (يظهر مرة وحدة)
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Share, Switch, Text, View } from 'react-native';
import { Button, Card, Empty, Input, Row, Screen, T } from '@/components/ui';
import { timeAgo } from '@/lib/dates';
import { createGate, loadGates, setGateActive } from '@/lib/gymops';
import { useLocalized } from '@/lib/i18n';
import { errorKey, SUPABASE_URL } from '@/lib/supabase';
import { brand, colors, space } from '@/theme';

export default function Gates() {
  const { gym } = useLocalSearchParams<{ gym: string }>();
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [rows, setRows] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [fresh, setFresh] = useState<{ name: string; key: string } | null>(null);
  const load = useCallback(() => { loadGates(String(gym)).then(setRows).catch(() => {}); }, [gym]);
  useFocusEffect(load);
  const add = async () => {
    if (name.trim().length < 2) return;
    try { const g = await createGate(String(gym), name); setFresh({ name, key: g.api_key }); setName(''); load(); }
    catch (e) { Alert.alert(t(errorKey(e))); }
  };
  const doc = (key: string) => t('gymops.gateDoc', { url: `${SUPABASE_URL}/rest/v1/rpc/gate_verify`, key });
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('gymops.tool_gates') }} />
      <T size="sm" muted>{t('gymops.gatesHint')}</T>
      <Row gap={space.sm}>
        <View style={{ flex: 1 }}><Input value={name} onChangeText={setName} maxLength={40} placeholder={t('gymops.gateNamePh')} /></View>
        <Button small icon="add" title={t('gymops.add')} onPress={add} />
      </Row>
      {fresh ? (
        <Card style={{ gap: space.sm, borderColor: brand.orange }}>
          <T bold>{t('gymops.gateKeyOnce', { name: fresh.name })}</T>
          <Text selectable style={{ fontFamily: 'Courier', color: colors.text, fontSize: 13 }}>{fresh.key}</Text>
          <Button small icon="share-social-outline" title={t('gymops.shareWithVendor')} onPress={() => Share.share({ message: doc(fresh.key) })} />
        </Card>
      ) : null}
      {rows.length ? rows.map((g) => (
        <Card key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <T semibold>{g.name}</T>
            <T size="xs" muted>…{g.key_hint} · {g.last_used_at ? t('gymops.lastUsed', { when: timeAgo(g.last_used_at, lng) }) : t('gymops.neverUsed')}</T>
          </View>
          <Switch value={g.active} onValueChange={async (v) => { await setGateActive(g.id, v).catch(() => {}); load(); }} trackColor={{ true: brand.orange, false: colors.border }} />
        </Card>
      )) : <Empty icon="git-network-outline" text={t('gymops.noGates')} />}
    </Screen>
  );
}
