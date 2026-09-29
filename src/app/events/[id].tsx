// صفحة الفعالية: الموعد والمكان والنبذة، والموقع الرسمي، وتذكير قبل الموعد بيوم، ومشاركة
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Share, View } from 'react-native';
import { EventArt, EventIcon, evCity, evSummary, evTitle, evVenue, useEventBadge } from '@/components/events/EventParts';
import { Button, Card, Empty, Loading, Row, Screen, T } from '@/components/ui';
import { useLocalized } from '@/lib/i18n';
import { eventDateLabel, hasReminder, loadEvent, reminderTime, toggleReminder, type LocalEvent } from '@/lib/localEvents';
import { brand, colors, radius, space } from '@/theme';

export default function EventPage() {
  // preview=1 من لوحة الإدارة: تشوف الفعالية حتى لو مخفية (الصلاحيات في القاعدة تمنع غير الإدارة)
  const { id, preview } = useLocalSearchParams<{ id: string; preview?: string }>();
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const badgeOf = useEventBadge();
  const [e, setE] = useState<LocalEvent | null | undefined>(undefined);
  const [reminded, setReminded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadEvent(String(id)).then((r) => { setE(r); if (r) hasReminder(r.id).then(setReminded); }).catch(() => setE(null));
  }, [id]);

  if (e === undefined) return <Loading />;
  if (!e || (!e.active && preview !== '1')) return <Screen><Empty icon="trophy-outline" text={t('events.notFound')} /></Screen>;

  const title = evTitle(e, lng);
  const when = eventDateLabel(e, lng);
  const where = [evCity(e, lng), evVenue(e, lng)].filter(Boolean).join(' · ');
  const badge = badgeOf(e);
  const canRemind = !!reminderTime(e) || reminded;

  const remind = async () => {
    setBusy(true);
    try {
      const r = await toggleReminder(e, { title: t('events.remTitle', { name: title }), body: t('events.remBody', { name: title, when }) });
      if (r === 'on') setReminded(true);
      else if (r === 'off') setReminded(false);
      else Alert.alert(t(r === 'denied' ? 'events.remDenied' : 'events.remUnavailable'));
    } catch { Alert.alert(t('errors.generic')); } finally { setBusy(false); }
  };
  const share = () => Share.share({ message: [title, when, where, e.url].filter(Boolean).join('\n') }).catch(() => {});

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: '' }} />
      {!e.active ? (
        <Row gap={6} style={{ backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: 10 }}>
          <Ionicons name="eye-off-outline" size={16} color={colors.muted} />
          <T size="xs" muted style={{ flex: 1 }}>{t('events.hiddenNote')}</T>
        </Row>
      ) : null}
      <EventArt e={e} style={{ height: 190, borderRadius: radius.lg }} iconSize={72} />
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
          <EventIcon category={e.category} size={13} color={brand.deepGreen} />
          <T size="xs" semibold>{t(`events.cat_${e.category}`)}</T>
        </View>
        {badge ? (
          <View style={{ backgroundColor: badge.hot ? brand.orange : colors.cardAlt, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
            <T size="xs" semibold color={badge.hot ? brand.cream : colors.text}>{badge.label}</T>
          </View>
        ) : null}
      </Row>
      <T size="xl" bold style={{ lineHeight: 34 }}>{title}</T>

      <Card style={{ gap: space.sm }}>
        {when ? <Info icon="calendar-outline" label={t('events.when')} value={when} /> : null}
        {where ? <Info icon="location-outline" label={t('events.where')} value={where} /> : null}
      </Card>

      {evSummary(e, lng) ? <T style={{ lineHeight: 26 }}>{evSummary(e, lng)}</T> : null}

      {e.url ? <Button icon="open-outline" title={t('events.official')} onPress={() => Linking.openURL(e.url!).catch(() => {})} /> : null}
      <Row gap={space.sm}>
        {canRemind ? (
          <View style={{ flex: 1 }}>
            <Button variant="secondary" icon={reminded ? 'notifications' : 'notifications-outline'} loading={busy}
              title={reminded ? t('events.reminded') : t('events.remind')} onPress={remind} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}><Button variant="secondary" icon="share-outline" title={t('events.share')} onPress={share} /></View>
      </Row>
      {reminded ? <T size="xs" muted center>{t('events.remindedHint')}</T> : null}
      <T size="xs" muted center style={{ lineHeight: 19 }}>{t('events.sourceNote')}</T>
    </Screen>
  );
}

function Info({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={17} color={colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T size="xs" muted>{label}</T>
        <T semibold>{value}</T>
      </View>
    </Row>
  );
}
