// قطع التايم لاين: تنبيه المشاركة (مرة وحدة)، إعدادات المشاركة، ونشر «صباح الخير ☀️» تلقائياً
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Modal, Pressable, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Row, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { postWakeIfDue, setSharing } from '@/lib/timeline';
import { brand, colors, radius, space } from '@/theme';

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

/** وش أشارك مع أصدقائي: صباحي ☀️ ودخولي النادي 🏋️ (تنعرض لما تكون مفتوحة بس، فتبدأ من إعدادك الحالي) */
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

/** ينشر «صباح الخير ☀️» مرة باليوم لما تفتح التطبيق الصبح، أو أول فتح بعد «تصبحون على خير» (لو المشاركة شغّالة) */
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
