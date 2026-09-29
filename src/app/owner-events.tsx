// لوحة إدارة التطبيق ← البطولات والفعاليات: كل الفعاليات وحالتها، إظهار وإخفاء، معاينة وتعديل وحذف
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Switch, View } from 'react-native';
import { EventArt, EventIcon, evTitle } from '@/components/events/EventParts';
import { Button, Card, Empty, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { useLocalized } from '@/lib/i18n';
import { deleteEvent, eventAdminState, eventDateLabel, listAllEvents, setEventActive, type EventAdminState, type LocalEvent } from '@/lib/localEvents';
import { isAdmin } from '@/lib/owner';
import { brand, colors, radius, space } from '@/theme';

const STATE_COLOR: Record<EventAdminState, string> = { now: '#2E8B57', soon: brand.amber, open: brand.green, past: '#8A8A8A', hidden: '#B0B0B0' };
/** الترتيب: الجارية ثم القادمة ثم المستمرة ثم المخفية */
const ORDER: Record<EventAdminState, number> = { now: 0, soon: 1, open: 2, hidden: 3, past: 4 };

export default function OwnerEvents() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [ok, setOk] = useState<boolean | null>(null);
  const [rows, setRows] = useState<LocalEvent[] | null>(null);
  const [tab, setTab] = useState<'current' | 'past'>('current');

  const load = useCallback(async () => {
    const admin = await isAdmin();
    setOk(admin);
    if (!admin) return;
    setRows(await listAllEvents());
  }, []);
  useFocusEffect(useCallback(() => { load().catch(() => setRows([])); }, [load]));

  if (ok === null) return <Loading />;
  if (!ok) return <Screen><Empty icon="lock-closed-outline" text={t('owner.noAccess')} /></Screen>;

  const all = rows ?? [];
  const isPast = (e: LocalEvent) => eventAdminState(e) === 'past';
  const counts = { current: all.filter((e) => !isPast(e)).length, past: all.filter(isPast).length };
  const shown = all.filter((e) => (tab === 'past') === isPast(e))
    .sort((a, b) => ORDER[eventAdminState(a)] - ORDER[eventAdminState(b)] || (a.starts_on ?? '9999').localeCompare(b.starts_on ?? '9999'));

  const toggle = async (e: LocalEvent, v: boolean) => {
    setRows((cur) => cur?.map((x) => (x.id === e.id ? { ...x, active: v } : x)) ?? null);
    try { await setEventActive(e.id, v); } catch {
      setRows((cur) => cur?.map((x) => (x.id === e.id ? { ...x, active: !v } : x)) ?? null);
      Alert.alert(t('errors.generic'));
    }
  };
  const remove = (e: LocalEvent) => Alert.alert(t('events.deleteConfirm'), e.title, [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('events.delete'), style: 'destructive', onPress: async () => { try { await deleteEvent(e); load(); } catch { Alert.alert(t('errors.generic')); } } },
  ]);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('events.title') }} />
      <View style={{ backgroundColor: brand.deepGreen, borderRadius: radius.lg, padding: space.lg, gap: 6 }}>
        <Row gap={8}>
          <Ionicons name="trophy" size={18} color={brand.amber} />
          <T size="xs" semibold color={brand.amber}>{t('events.adminEyebrow')}</T>
        </Row>
        <T size="lg" bold color={brand.cream}>{t('events.adminTitle')}</T>
        <T size="sm" color={brand.sand} style={{ lineHeight: 22 }}>{t('events.adminIntro')}</T>
      </View>
      <Segmented<'current' | 'past'> value={tab} onChange={setTab} options={[
        { value: 'current', label: `${t('events.tab_current')} ${counts.current || ''}`.trim() },
        { value: 'past', label: `${t('events.tab_past')} ${counts.past || ''}`.trim() },
      ]} />
      <Button icon="add" title={t('events.new')} onPress={() => router.push('/owner-event')} />

      {!rows ? <Loading /> : !shown.length ? <Empty icon="trophy-outline" text={t(`events.none_${tab}`)} /> : shown.map((e) => {
        const st = eventAdminState(e);
        const when = eventDateLabel(e, lng);
        return (
          <Card key={e.id} style={{ gap: space.sm }}>
            <Row style={{ alignItems: 'flex-start' }} gap={space.md}>
              <EventArt e={e} style={{ width: 64, height: 72, borderRadius: 10 }} iconSize={26} />
              <View style={{ flex: 1, gap: 4 }}>
                <Row>
                  <T bold style={{ flex: 1 }} numberOfLines={2}>{evTitle(e, lng)}</T>
                  <Switch value={e.active} onValueChange={(v) => toggle(e, v)} trackColor={{ true: brand.orange }}
                    accessibilityLabel={t('events.activeLabel')} />
                </Row>
                <Row gap={6} style={{ flexWrap: 'wrap' }}>
                  <View style={{ backgroundColor: STATE_COLOR[st], borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <T size="xs" semibold color="#fff">{t(`events.st_${st}`)}</T>
                  </View>
                  {e.featured ? (
                    <View style={{ backgroundColor: brand.orange, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <T size="xs" semibold color="#fff">{t('events.featured')}</T>
                    </View>
                  ) : null}
                  <Row gap={4}>
                    <EventIcon category={e.category} size={13} color={colors.muted} />
                    <T size="xs" muted>{t(`events.cat_${e.category}`)}</T>
                  </Row>
                </Row>
                {when ? <T size="xs" muted>{when}</T> : null}
                {e.url ? <T size="xs" muted numberOfLines={1}>{e.url.replace(/^https:\/\//, '').split('/')[0]}</T> : null}
              </View>
            </Row>
            <Row gap={space.sm}>
              <Button small style={{ flex: 1 }} variant="secondary" icon="eye-outline" title={t('events.view')}
                onPress={() => router.push({ pathname: '/events/[id]', params: { id: e.id, preview: '1' } })} />
              <Button small style={{ flex: 1 }} variant="secondary" icon="create-outline" title={t('events.edit')}
                onPress={() => router.push({ pathname: '/owner-event', params: { id: e.id } })} />
              <Button small variant="ghost" icon="trash-outline" title="" onPress={() => remove(e)} />
            </Row>
          </Card>
        );
      })}
      <T size="xs" muted style={{ lineHeight: 19 }}>{t('events.adminRules')}</T>
    </Screen>
  );
}
