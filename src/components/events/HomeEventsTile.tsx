// مربع «البطولات والفعاليات» في الرئيسية جنب المتاجر: أقرب فعالية مميزة وموعدها، ويفتح صفحة البطولات
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { NT } from '@/components/pulse/widgets';
import { LONG_PRESS_MS, useHomeLongPress } from '@/lib/homeLayout';
import { useLocalized } from '@/lib/i18n';
import { eventDateLabel, eventImageUrl, loadEventsCached, nextHighlight, type LocalEvent } from '@/lib/localEvents';
import { brand } from '@/theme';
import { evTitle, useEventBadge } from './EventParts';

const FALLBACK = require('../../../assets/imagery/run-sand.jpg');
/** أنواع البطولات اللي طلبها المستخدم: جري، خيل، هايكنج، رماية، ملاكمة */
const TEASER = ['run-fast', 'horse-variant', 'hiking', 'target', 'boxing-glove'] as const;

export function HomeEventsTile({ style }: { style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const longPress = useHomeLongPress();
  const badgeOf = useEventBadge();
  const [next, setNext] = useState<LocalEvent | null>(null);

  useFocusEffect(useCallback(() => {
    let dead = false;
    loadEventsCached().then((rows) => { if (!dead) setNext(nextHighlight(rows)); }).catch(() => {});
    return () => { dead = true; };
  }, []));

  const img = eventImageUrl(next?.image_path);
  const badge = next ? badgeOf(next) : null;
  const when = next ? eventDateLabel(next, lng, { withYear: false }) : '';

  return (
    <Pressable onPress={() => router.push('/events')} onLongPress={longPress} delayLongPress={LONG_PRESS_MS}
      accessibilityRole="button" accessibilityLabel={next ? `${t('events.title')}: ${evTitle(next, lng)}` : t('events.title')}
      style={({ pressed }) => [styles.tile, style, pressed && { opacity: 0.9 }]}>
      <Image source={img ? { uri: img } : FALLBACK} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      <LinearGradient colors={['rgba(6,31,27,0.05)', 'rgba(6,31,27,0.6)', 'rgba(6,31,27,0.97)']} locations={[0, 0.38, 0.72]} style={StyleSheet.absoluteFill} />

      <View style={styles.top}>
        {badge ? (
          <View style={[styles.badge, badge.hot && { backgroundColor: brand.orange }]}>
            <NT size={10} semibold color={brand.cream}>{badge.label}</NT>
          </View>
        ) : (
          <View style={styles.trophy}><MaterialCommunityIcons name="trophy" size={15} color={brand.deepGreen} /></View>
        )}
      </View>

      <View style={styles.body}>
        <NT size={15} bold color={brand.cream} numberOfLines={2} style={{ lineHeight: 22 }}>{t('events.title')}</NT>
        {next ? (
          <>
            <NT size={12} semibold color={brand.amber} numberOfLines={2} style={{ lineHeight: 18 }}>{evTitle(next, lng)}</NT>
            {when ? <NT size={10} color={brand.sand} numberOfLines={1}>{when}</NT> : null}
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
              {TEASER.map((n) => <MaterialCommunityIcons key={n} name={n} size={15} color={brand.amber} />)}
            </View>
            <NT size={10} color={brand.sand} numberOfLines={2}>{t('events.homeTeaser')}</NT>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { height: 212, borderRadius: 20, overflow: 'hidden', backgroundColor: brand.deepGreen },
  top: { flexDirection: 'row', padding: 10 },
  badge: { backgroundColor: 'rgba(6,31,27,0.72)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  trophy: { width: 28, height: 28, borderRadius: 14, backgroundColor: brand.amber, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 12, paddingBottom: 12, gap: 3 },
});
