// موظفين الاستقبال: إضافة باسم المستخدم وإزالة
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { Avatar, Button, Card, Empty, Input, Row, Screen, T } from '@/components/ui';
import { addStaff, loadStaff, removeStaff } from '@/lib/gymops';
import { errorKey, publicUrl } from '@/lib/supabase';
import { space } from '@/theme';

export default function Staff() {
  const { gym } = useLocalSearchParams<{ gym: string }>();
  const { t } = useTranslation();
  const [rows, setRows] = useState<any[]>([]);
  const [u, setU] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { loadStaff(String(gym)).then(setRows).catch(() => {}); }, [gym]);
  useFocusEffect(load);
  const add = async () => {
    if (!u.trim()) return;
    setBusy(true);
    try { await addStaff(String(gym), u); setU(''); load(); } catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('gymops.tool_staff') }} />
      <T size="sm" muted>{t('gymops.staffHint')}</T>
      <Row gap={space.sm}>
        <View style={{ flex: 1 }}><Input value={u} onChangeText={setU} autoCapitalize="none" placeholder="@username" /></View>
        <Button small icon="add" title={t('gymops.add')} loading={busy} onPress={add} />
      </Row>
      {rows.length ? rows.map((s) => (
        <Card key={s.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Avatar size={38} uri={publicUrl('avatars', s.profiles?.avatar_url)} name={s.profiles?.full_name ?? s.profiles?.username} />
          <View style={{ flex: 1 }}>
            <T semibold>{s.profiles?.full_name || s.profiles?.username}</T>
            <T size="xs" muted>@{s.profiles?.username} · {t('gymops.role_reception')}</T>
          </View>
          <Button small variant="ghost" icon="trash-outline" title="" onPress={() => Alert.alert(t('gymops.removeStaffQ'), '', [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.delete'), style: 'destructive', onPress: async () => { await removeStaff(String(gym), s.user_id).catch(() => {}); load(); } },
          ])} />
        </Card>
      )) : <Empty icon="id-card-outline" text={t('gymops.noStaff')} />}
    </Screen>
  );
}
