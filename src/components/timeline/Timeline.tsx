// قطع التايم لاين: بطاقة الحضور، سطر «وش جديدك؟»، تنبيه المشاركة، إعدادات المشاركة، ونشر «صحى ☀️» تلقائياً
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Modal, Pressable, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { clockText } from '@/components/PostCard';
import { CoachCheck } from '@/components/social/RankBadge';
import { Avatar, Card, Row, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { publicUrl } from '@/lib/supabase';
import { postWakeIfDue, setSharing, type TimelineItem } from '@/lib/timeline';
import { trainedMinutes } from '@/lib/wakeCore';
import { brand, colors, radius, space } from '@/theme';

/** «دخل النادي 🏋️»: من الحضور نفسه (اللايك = تصفيق الحضور، والتعليق في صفحة الحضور) */
export const CheckinItemCard = memo(function CheckinItemCard({ it, onLike }: { it: TimelineItem; onLike: (it: TimelineItem) => void }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [now] = useState(Date.now);
  const mins = trainedMinutes(it.at, it.meta.out);
  const here = !it.meta.out && now - Date.parse(it.at) < 6 * 3600_000;
  const name = it.full_name || it.username;
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <Row style={{ padding: space.md }}>
        <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: it.user_id } })}>
          <Avatar uri={publicUrl('avatars', it.avatar_url)} name={name} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Row gap={4}>
            <T bold numberOfLines={1} style={{ flexShrink: 1 }}>{name}</T>
            {it.is_coach ? <CoachCheck size={15} /> : null}
          </Row>
          <T size="xs" muted>@{it.username} · {timeAgo(it.at, lng)}</T>
        </View>
      </Row>
      <Pressable disabled={!it.gym_id} onPress={() => it.gym_id && router.push({ pathname: '/gym/[id]', params: { id: it.gym_id } })}
        accessibilityRole="button"
        style={({ pressed }) => ({ marginHorizontal: space.md, borderRadius: radius.md, padding: space.lg, backgroundColor: brand.deepGreen, opacity: pressed ? 0.9 : 1 })}>
        <Row gap={space.md}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="barbell" size={22} color={brand.cream} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T size="lg" bold color={brand.cream} numberOfLines={2}>
              {it.gym_name ? t('timeline.checkedIn', { gym: it.gym_name }) : t('timeline.checkedInNoGym')}
            </T>
            <T size="sm" color={brand.sand}>
              {clockText(it.at, lng)}
              {mins
                ? ` · ${mins < 60 ? t('timeline.trainedMin', { n: mins }) : t('timeline.trained', { time: `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}` })}`
                : here ? ` · ${t('timeline.hereNow')}` : ''}
            </T>
          </View>
        </Row>
      </Pressable>
      <Row style={{ padding: space.md }} gap={space.lg}>
        <Pressable onPress={() => onLike(it)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('timeline.like')}>
          <Row gap={space.xs}>
            <Ionicons name={it.liked_by_me ? 'heart' : 'heart-outline'} size={22} color={it.liked_by_me ? colors.danger : colors.text} />
            <T size="sm">{it.like_count}</T>
          </Row>
        </Pressable>
        <Pressable onPress={() => router.push({ pathname: '/checkin/[id]', params: { id: it.id, name: it.full_name || it.username } })} hitSlop={8}
          accessibilityRole="button" accessibilityLabel={t('timeline.comment')}>
          <Row gap={space.xs}>
            <Ionicons name="chatbubble-outline" size={20} color={colors.text} />
            <T size="sm">{it.comment_count}</T>
          </Row>
        </Pressable>
      </Row>
    </Card>
  );
});

/** «وش جديدك؟»: ينشر صورة أو رسالة، وزر إعدادات المشاركة */
export function TimelineComposer({ onSettings }: { onSettings: () => void }) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  return (
    <Card style={{ gap: 0 }}>
      <Row gap={space.md}>
        <Avatar size={40} uri={publicUrl('avatars', profile?.avatar_url ?? null)} name={profile?.full_name ?? profile?.username ?? ''} />
        <Pressable onPress={() => router.push('/post/new')} accessibilityRole="button" accessibilityLabel={t('feed.newPost')}
          style={{ flex: 1, backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: space.md, paddingVertical: 10 }}>
          <T size="sm" muted numberOfLines={1}>{t('timeline.composePh')}</T>
        </Pressable>
        <Pressable onPress={() => router.push('/post/new')} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('timeline.addPhoto')}>
          <Ionicons name="image-outline" size={24} color={colors.primary} />
        </Pressable>
        <Pressable onPress={onSettings} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('timeline.settingsTitle')}>
          <Ionicons name="options-outline" size={22} color={colors.muted} />
        </Pressable>
      </Row>
    </Card>
  );
}

const NOTICE_KEY = 'arq.timeline.notice.v1';

/** مرة وحدة: وش يطلع لأصدقائك تلقائياً، مع زر الإعدادات */
export function SharingNotice({ onSettings }: { onSettings: () => void }) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(NOTICE_KEY).then((v) => { if (alive && !v) setShow(true); }, () => {});
    return () => { alive = false; };
  }, []);
  if (!show) return null;
  const dismiss = () => { setShow(false); AsyncStorage.setItem(NOTICE_KEY, '1').catch(() => {}); };
  return (
    <Card style={{ gap: space.sm, borderWidth: 1, borderColor: brand.amber, backgroundColor: 'rgba(254,169,79,0.12)' }}>
      <T bold>{t('timeline.noticeTitle')}</T>
      <T size="sm" style={{ lineHeight: 21 }}>{t('timeline.noticeBody')}</T>
      <Row gap={space.lg}>
        <Pressable onPress={dismiss} hitSlop={8} accessibilityRole="button"><T semibold color={colors.primary}>{t('timeline.ok')}</T></Pressable>
        <Pressable onPress={() => { dismiss(); onSettings(); }} hitSlop={8} accessibilityRole="button"><T semibold color={colors.muted}>{t('timeline.settings')}</T></Pressable>
      </Row>
    </Card>
  );
}

/** وش أشارك مع أصدقائي: صحياني ☀️ ودخولي النادي 🏋️ (تنعرض لما تكون مفتوحة بس، فتبدأ من إعدادك الحالي) */
export function TimelineSettings({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { session, profile, refreshProfile } = useAuth();
  const [wake, setWake] = useState(profile?.share_wake !== false);
  const [checkins, setCheckins] = useState(profile?.share_checkins !== false);
  const uid = session?.user.id;
  const save = async (patch: { share_wake?: boolean; share_checkins?: boolean }, undo: () => void) => {
    if (!uid) return;
    const { error } = await setSharing(uid, patch);
    if (error) undo(); else void refreshProfile();
  };
  const hidden = profile?.presence_visibility === 'hidden';
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: space.lg, gap: space.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T size="lg" bold>{t('timeline.settingsTitle')}</T>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </Row>
          <ShareRow title={t('timeline.shareWake')} sub={t('timeline.shareWakeSub')} value={wake}
            onChange={(v) => { setWake(v); void save({ share_wake: v }, () => setWake(!v)); }} />
          <ShareRow title={t('timeline.shareCheckins')} sub={hidden ? t('timeline.hiddenNote') : t('timeline.shareCheckinsSub')} value={checkins}
            onChange={(v) => { setCheckins(v); void save({ share_checkins: v }, () => setCheckins(!v)); }} />
          <T size="xs" muted style={{ lineHeight: 18 }}>{t('timeline.settingsNote')}</T>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function ShareRow({ title, sub, value, onChange }: { title: string; sub: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row gap={space.md} style={{ backgroundColor: colors.card, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ flex: 1, gap: 2 }}>
        <T semibold>{title}</T>
        <T size="xs" muted style={{ lineHeight: 18 }}>{sub}</T>
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={title} trackColor={{ true: brand.orange, false: colors.border }} thumbColor={brand.cream} />
    </Row>
  );
}

/** ينشر «صحى ☀️» مرة باليوم لما تفتح التطبيق الصبح (لو المشاركة شغّالة) */
export function WakeWatcher() {
  const { session, profile } = useAuth();
  const uid = session?.user.id;
  const on = !!profile?.onboarded && profile?.share_wake !== false;
  useEffect(() => {
    if (!uid || !on) return;
    const run = () => { postWakeIfDue(uid).catch(() => {}); };
    run();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') run(); });
    return () => sub.remove();
  }, [uid, on]);
  return null;
}
