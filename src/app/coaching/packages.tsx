// باقات المدرب: عدد الحصص، السعر، الصلاحية — تظهر في صفحته (الدفع داخل التطبيق يتفعّل لاحقاً)
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Switch, View } from 'react-native';
import { Button, Card, Empty, Input, Row, Screen, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { deletePackage, loadPackages, savePackage, type CoachPackage } from '@/lib/coaching';
import { errorKey } from '@/lib/supabase';
import { brand, colors, space } from '@/theme';

const EMPTY = { id: undefined as string | undefined, title: '', sessions: '8', price: '', valid: '30', description: '', online: false, active: true };
const num = (s: string) => Number(s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))));

export default function Packages() {
  const { t } = useTranslation();
  const { userId } = useUser();
  const [list, setList] = useState<CoachPackage[]>([]);
  const [f, setF] = useState({ ...EMPTY });
  const load = useCallback(() => { loadPackages(userId).then(setList).catch(() => {}); }, [userId]);
  useFocusEffect(load);

  const save = async () => {
    if (f.title.trim().length < 2 || !(num(f.sessions) >= 1) || !(num(f.price) >= 0) || f.price.trim() === '') return Alert.alert(t('coaching.err_package'));
    try {
      await savePackage({ title: f.title.trim(), sessions: Math.round(num(f.sessions)), price_sar: num(f.price), valid_days: Math.round(num(f.valid)) || 30,
        description: f.description.trim() || null, online: f.online, active: f.active }, f.id);
      setF({ ...EMPTY }); load();
    } catch (e) { Alert.alert(t(errorKey(e))); }
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('coaching.packages') }} />
      <Card style={{ gap: space.sm }}>
        <T semibold>{f.id ? t('coaching.editPackage') : t('coaching.newPackage')}</T>
        <Input label={t('coaching.pkgTitle')} value={f.title} onChangeText={(v) => setF({ ...f, title: v })} maxLength={60} placeholder={t('coaching.pkgTitlePh')} />
        <Row gap={space.sm}>
          <View style={{ flex: 1 }}><Input label={t('coaching.pkgSessions')} value={f.sessions} onChangeText={(v) => setF({ ...f, sessions: v })} keyboardType="number-pad" /></View>
          <View style={{ flex: 1 }}><Input label={t('coaching.pkgPrice')} value={f.price} onChangeText={(v) => setF({ ...f, price: v })} keyboardType="decimal-pad" placeholder="1200" /></View>
          <View style={{ flex: 1 }}><Input label={t('coaching.pkgValid')} value={f.valid} onChangeText={(v) => setF({ ...f, valid: v })} keyboardType="number-pad" /></View>
        </Row>
        <Input label={t('coaching.pkgDesc')} value={f.description} onChangeText={(v) => setF({ ...f, description: v })} maxLength={300} multiline />
        <Row style={{ justifyContent: 'space-between' }}><T semibold>{t('coaching.online')}</T><Switch value={f.online} onValueChange={(v) => setF({ ...f, online: v })} trackColor={{ true: brand.orange }} /></Row>
        <Row style={{ justifyContent: 'space-between' }}><T semibold>{t('coaching.pkgActive')}</T><Switch value={f.active} onValueChange={(v) => setF({ ...f, active: v })} trackColor={{ true: brand.orange }} /></Row>
        <Row gap={space.sm}>
          <Button style={{ flex: 1 }} icon="checkmark" title={t('common.save')} onPress={save} />
          {f.id ? <Button variant="ghost" title={t('common.cancel')} onPress={() => setF({ ...EMPTY })} /> : null}
        </Row>
      </Card>
      {list.length ? list.map((p) => (
        <Pressable key={p.id} onPress={() => setF({ id: p.id, title: p.title, sessions: String(p.sessions), price: String(p.price_sar), valid: String(p.valid_days), description: p.description ?? '', online: p.online, active: p.active })}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, opacity: p.active ? 1 : 0.55 }}>
            <View style={{ flex: 1 }}>
              <T semibold>{p.title}</T>
              <T size="xs" muted>{t('coaching.sessionsN', { count: p.sessions })} · {t('coaching.validDays', { count: p.valid_days })}</T>
            </View>
            <T bold color={colors.primary}>{Math.round(p.price_sar)} {t('clubs.sar')}</T>
            <Pressable hitSlop={8} onPress={() => Alert.alert(t('coaching.deletePackage'), p.title, [{ text: t('common.cancel'), style: 'cancel' }, { text: t('common.delete'), style: 'destructive', onPress: () => deletePackage(p.id).then(load) }])}>
              <T size="xs" color={colors.danger}>{t('common.delete')}</T>
            </Pressable>
          </Card>
        </Pressable>
      )) : <Empty icon="pricetags-outline" text={t('coaching.noPackages')} />}
      <T size="xs" muted center>{t('coaching.payNote')}</T>
    </Screen>
  );
}
