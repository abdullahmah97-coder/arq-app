// لحظات التايم لاين (نفس فكرة Path بهوية أرك): صورة مربعة، خط زمني عمودي بفقاعة أيقونة لكل لحظة،
// سطر اللحظة وتفاصيلها، وزر تفاعل بالإيموجي ❤️ 💪 🔥 😂 👏 مع صور اللي تفاعلوا
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { CoachCheck } from '@/components/social/RankBadge';
import { Avatar, T } from '@/components/ui';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { REACTION_EMOJI, REACTIONS, type ReactionKey, type Reactor } from '@/lib/reactions';
import { publicUrl } from '@/lib/supabase';
import { itemKey, type TimelineItem } from '@/lib/timeline';
import type { MomentMeta } from '@/lib/types';
import { clockOf, dayOf, durationText, stableIndex, trainedMinutes } from '@/lib/wakeCore';
import { brand, colors, fonts, radius, space } from '@/theme';

/** مقاسات العمود: الصورة، عمود الخط الزمني، والفقاعة */
export const AV = 46;
export const RAIL = 44;
const BUBBLE = 36;
const TOP = 14;
/** بنفسجي الليل (من خلفية «الخزامى» في أرك) */
export const NIGHT = '#2E2248';
export const SLEEP_LINES = 5;

type IconName = keyof typeof Ionicons.glyphMap;
type Lng = 'ar' | 'en';
export type MomentKind = TimelineItem['item_type'];

export function tap() {
  if (Platform.OS === 'web') return;
  Haptics.selectionAsync().catch(() => {});
}

/** صورة الحساب بزوايا صغيرة (هوية أرك الهندسية) */
export function MomentAvatar({ uri, name, size = AV }: { uri?: string | null; name: string; size?: number }) {
  const r = Math.round(size * 0.26);
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: r, backgroundColor: colors.cardAlt }} contentFit="cover" transition={120} />;
  const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: brand.deepGreen, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: brand.amber, fontFamily: fonts.title, fontSize: size * 0.4 }}>{initial}</Text>
    </View>
  );
}

/** فقاعة اللحظة على الخط: ☀️ صباح الخير، 🌙 تصبحون على خير، 🏋️ النادي، 📷 صورة، “ كلام */
export function bubbleLook(kind: MomentKind, photo: boolean): { bg: string; fg: string; icon?: IconName; glyph?: string } {
  switch (kind) {
    case 'wake': return { bg: brand.amber, fg: '#FFFFFF', icon: 'sunny' };
    case 'sleep': return { bg: NIGHT, fg: brand.sand, icon: 'moon' };
    case 'checkin': return { bg: brand.deepGreen, fg: brand.amber, icon: 'barbell' };
    default: return photo ? { bg: brand.orange, fg: brand.cream, icon: 'camera' } : { bg: brand.green, fg: brand.cream, glyph: '“' };
  }
}

export function MomentBubble({ kind, photo, size = BUBBLE, ring = colors.bg }: { kind: MomentKind; photo?: boolean; size?: number; ring?: string }) {
  const b = bubbleLook(kind, !!photo);
  return (
    <View style={[styles.bubble, { width: size, height: size, borderRadius: size / 2, backgroundColor: b.bg, borderColor: ring }]}>
      {b.icon ? <Ionicons name={b.icon} size={Math.round(size * 0.47)} color={b.fg} />
        : <Text style={{ color: b.fg, fontSize: Math.round(size * 0.72), lineHeight: Math.round(size * 0.9), fontFamily: fonts.title, marginTop: Math.round(size * 0.18) }}>{b.glyph}</Text>}
    </View>
  );
}

/** «الساعة 6:30 ص» اليوم، «أمس 6:30 ص»، وإلا «قبل 3 أيام» */
export function whenText(iso: string, lng: Lng, now: Date, t: TFunction): string {
  const d = dayOf(iso, now);
  const time = clockOf(new Date(iso), lng);
  if (d === 'today') return t('timeline.m_at', { time });
  if (d === 'yesterday') return t('timeline.m_yesterday', { time });
  return timeAgo(iso, lng, now.getTime());
}

/** سطر اللحظة (بعد الاسم) وتفاصيلها تحت */
export function momentText(it: { item_type: MomentKind; id: string; at: string; meta: MomentMeta; gym_name: string | null },
  t: TFunction, lng: Lng, now: Date): { headline: string; sub: string } {
  switch (it.item_type) {
    case 'wake': {
      const parts = [whenText(it.meta.at ?? it.at, lng, now, t)];
      if (it.meta.src === 'alarm') parts.push(t('timeline.m_alarm'));
      if (it.meta.slept) parts.push(t('timeline.m_slept', { d: durationText(it.meta.slept, lng) }));
      return { headline: t('timeline.m_wake'), sub: parts.join(' · ') };
    }
    case 'sleep':
      return {
        headline: t('timeline.m_sleep'),
        sub: `${whenText(it.meta.at ?? it.at, lng, now, t)} · ${t(`timeline.sleepLine${stableIndex(it.id, SLEEP_LINES) + 1}`)}`,
      };
    case 'checkin': {
      const mins = trainedMinutes(it.at, it.meta.out);
      const here = !it.meta.out && now.getTime() - Date.parse(it.at) < 6 * 3600_000;
      const parts = [whenText(it.at, lng, now, t)];
      if (mins) parts.push(t('timeline.m_trained', { d: durationText(mins, lng) }));
      else if (here) parts.push(t('timeline.m_hereNow'));
      return { headline: it.gym_name ? t('timeline.m_gym', { gym: it.gym_name }) : t('timeline.m_gymNoName'), sub: parts.join(' · ') };
    }
    default: {
      const parts = [whenText(it.at, lng, now, t)];
      if (it.gym_name) parts.push(`📍 ${it.gym_name}`);
      return { headline: '', sub: parts.join(' · ') };
    }
  }
}

export interface MomentRowProps {
  it: TimelineItem;
  mine: boolean;
  pickerOpen: boolean;
  /** آخر لحظة: الخط يوقف عند الفقاعة */
  last?: boolean;
  onPicker: (key: string | null) => void;
  onReact: (it: TimelineItem, next: ReactionKey | null) => void;
  onReactors: (it: TimelineItem) => void;
  onLongPress?: (it: TimelineItem) => void;
}

export const MomentRow = memo(function MomentRow({ it, mine, pickerOpen, last, onPicker, onReact, onReactors, onLongPress }: MomentRowProps) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [now] = useState(() => new Date());
  const name = it.full_name || it.username;
  const photo = it.item_type === 'post' ? publicUrl('posts', it.image_path) : null;
  const { headline, sub } = momentText(it, t, lng, now);
  const open = () => {
    onPicker(null);
    if (it.item_type === 'checkin') router.push({ pathname: '/checkin/[id]', params: { id: it.id, name } });
    else router.push({ pathname: '/post/[id]', params: { id: it.id } });
  };
  const canDelete = mine && it.item_type !== 'checkin' && !!onLongPress;
  return (
    <Pressable onPress={open} onLongPress={canDelete ? () => onLongPress!(it) : undefined} delayLongPress={350}
      accessibilityRole="button" accessibilityLabel={[name, headline, it.item_type === 'post' ? it.caption : '', sub].filter(Boolean).join('، ')}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: 'rgba(247,223,187,0.35)' }]}>
      <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: it.user_id } })} accessibilityRole="link" accessibilityLabel={name}
        style={{ paddingTop: TOP }}>
        <MomentAvatar uri={publicUrl('avatars', it.avatar_url)} name={name} />
      </Pressable>
      <View style={styles.rail}>
        <View style={[styles.line, { backgroundColor: colors.border }, last && { bottom: undefined, height: TOP + AV / 2 }]} />
        <View style={{ marginTop: TOP + (AV - BUBBLE) / 2 }}><MomentBubble kind={it.item_type} photo={!!photo} /></View>
      </View>
      <View style={[styles.main, { borderBottomColor: colors.border }]}>
        <View style={styles.head}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.title, { color: colors.text, fontFamily: fonts.title }]} numberOfLines={1}>
              {name}{it.is_coach ? <Text>{' '}<CoachCheck size={14} /></Text> : null}
            </Text>
            {headline ? <T style={{ lineHeight: 24 }} numberOfLines={2}>{headline}</T> : null}
            {it.item_type === 'post' && it.caption ? <T style={{ lineHeight: 24 }} numberOfLines={8}>{it.caption}</T> : null}
            {sub ? <T size="xs" muted style={{ lineHeight: 18, marginTop: 2 }}>{sub}</T> : null}
          </View>
          <ReactionPill value={it.my_reaction} open={pickerOpen} onToggle={() => onPicker(pickerOpen ? null : itemKey(it))} />
        </View>
        {/* الإيموجي تنفتح تحت الزر داخل الصف نفسه (لمسها مضمون في أندرويد كمان) */}
        {pickerOpen ? <ReactionPicker value={it.my_reaction} onPick={(e) => onReact(it, e === it.my_reaction ? null : e)} /> : null}
        {photo ? <Image source={{ uri: photo }} style={[styles.photo, { backgroundColor: colors.cardAlt }]} contentFit="cover" transition={150} /> : null}
        {it.like_count > 0 || it.comment_count > 0
          ? <ReactorsStrip count={it.like_count} reactors={it.reactors} comments={it.comment_count} onReactors={() => onReactors(it)} onComments={open} />
          : null}
      </View>
    </Pressable>
  );
});

/** زر التفاعل: 🙂 لو ما تفاعلت، وإيموجيك لو تفاعلت. الضغط يفتح الخمسة (ReactionPicker)، والضغط على نفس الإيموجي يشيله */
export function ReactionPill({ value, open, onToggle }: { value: ReactionKey | null; open: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable onPress={() => { tap(); onToggle(); }} hitSlop={8} accessibilityRole="button"
      accessibilityLabel={value ? t('timeline.reactedWith', { e: REACTION_EMOJI[value] }) : t('timeline.react')}
      accessibilityState={{ expanded: open }}
      style={({ pressed }) => [styles.pill, {
        borderColor: value ? brand.amber : colors.border, backgroundColor: value ? 'rgba(254,169,79,0.16)' : colors.card, opacity: pressed ? 0.7 : 1,
      }]}>
      {value ? <Text style={{ fontSize: 17 }}>{REACTION_EMOJI[value]}</Text> : <Ionicons name="happy-outline" size={20} color={colors.muted} />}
    </Pressable>
  );
}

/** الخمسة ❤️ 💪 🔥 😂 👏 (تنعرض تحت الزر بمكانها في الصف) */
export function ReactionPicker({ value, onPick }: { value: ReactionKey | null; onPick: (e: ReactionKey) => void }) {
  const { t } = useTranslation();
  const [a] = useState(() => new Animated.Value(0));
  useEffect(() => { Animated.spring(a, { toValue: 1, useNativeDriver: Platform.OS !== 'web', friction: 6, tension: 140 }).start(); }, [a]);
  return (
    <Animated.View accessibilityRole="menu" style={[styles.picker, { backgroundColor: colors.card, borderColor: colors.border },
      { opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}>
      {REACTIONS.map((k) => (
        <Pressable key={k} onPress={() => { tap(); onPick(k); }} hitSlop={3} accessibilityRole="menuitem"
          accessibilityLabel={t('timeline.reactWith', { e: REACTION_EMOJI[k] })} accessibilityState={{ selected: value === k }}
          style={({ pressed }) => [styles.pickBtn, value === k && { backgroundColor: 'rgba(254,169,79,0.3)' }, pressed && { transform: [{ scale: 1.25 }] }]}>
          <Text style={{ fontSize: 22 }}>{REACTION_EMOJI[k]}</Text>
        </Pressable>
      ))}
    </Animated.View>
  );
}

/** صور آخر اللي تفاعلوا مع إيموجي كل واحد، والعدد، وعدد التعليقات */
export function ReactorsStrip({ count, reactors, comments, onReactors, onComments }: {
  count: number; reactors: Reactor[]; comments: number; onReactors: () => void; onComments: () => void;
}) {
  const { t } = useTranslation();
  const shown = reactors.slice(0, 5);
  return (
    <View style={styles.strip}>
      {count > 0 ? (
        <Pressable onPress={onReactors} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('timeline.reactorsA11y', { count })} style={styles.stripBtn}>
          <View style={{ flexDirection: 'row' }}>
            {shown.map((r, i) => (
              <View key={r.u} style={[styles.face, { borderColor: colors.bg, zIndex: 10 - i }, i > 0 && { marginStart: -8 }]}>
                <Avatar size={22} uri={publicUrl('avatars', r.a)} name={r.n} />
                <Text style={styles.faceEmoji}>{REACTION_EMOJI[r.e]}</Text>
              </View>
            ))}
          </View>
          <T size="xs" semibold muted>{count}</T>
        </Pressable>
      ) : null}
      {comments > 0 ? (
        <Pressable onPress={onComments} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('timeline.commentsA11y', { count: comments })} style={styles.stripBtn}>
          <Ionicons name="chatbubble-outline" size={14} color={colors.muted} />
          <T size="xs" semibold muted>{comments}</T>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: space.lg },
  rail: { width: RAIL, alignItems: 'center' },
  line: { position: 'absolute', top: 0, bottom: 0, left: (RAIL - 2) / 2, width: 2 },
  bubble: {
    alignItems: 'center', justifyContent: 'center', borderWidth: 3, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  main: { flex: 1, paddingVertical: TOP, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  title: { fontSize: 15, lineHeight: 24, writingDirection: 'auto' },
  photo: { width: '100%', aspectRatio: 1, borderRadius: radius.lg },
  pill: { width: 50, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  picker: {
    alignSelf: 'flex-end', flexDirection: 'row', gap: 2, padding: 4, borderRadius: 22, borderWidth: 1, marginTop: -2,
    shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  pickBtn: { width: 36, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  strip: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  stripBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  face: { borderRadius: 13, borderWidth: 2 },
  faceEmoji: { position: 'absolute', bottom: -5, end: -6, fontSize: 11 },
});
