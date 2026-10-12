// لوحة إدارة التطبيق ← بلاغات المجتمع: كل محتوى عليه بلاغات (مجمّع)، والصور اللي علق فحصها،
// والكلمات الممنوعة. الإجراء يقفل كل البلاغات على نفس المحتوى، وينحفظ في سجل الإدارة.
// (شرط App Store رقم 1.2: الرد على البلاغات بسرعة، خلال ٢٤ ساعة)
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { Avatar, Button, Card, Empty, Input, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { isAdmin } from '@/lib/owner';
import { addTerm, listTerms, removeTerm, safetyAct, safetyQueue, type SafetyAction, type SafetyItem } from '@/lib/safety';
import { errorKey, publicUrl } from '@/lib/supabase';
import { colors, radius, space } from '@/theme';

type Tab = 'open' | 'all' | 'terms';

export default function OwnerSafety() {
  const { t } = useTranslation();
  const [ok, setOk] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('open');
  const [items, setItems] = useState<SafetyItem[] | null>(null);
  const [terms, setTerms] = useState<string[] | null>(null);
  const [term, setTerm] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback((which: Tab) => {
    if (which === 'terms') { listTerms().then(setTerms).catch((e) => { setTerms([]); Alert.alert(t(errorKey(e))); }); return; }
    setItems(null);
    safetyQueue(which).then(setItems).catch((e) => { setItems([]); Alert.alert(t(errorKey(e))); });
  }, [t]);

  useFocusEffect(useCallback(() => {
    isAdmin().then((a) => { setOk(a); if (a) load(tab); }).catch(() => setOk(false));
  }, [load, tab]));

  const act = (it: SafetyItem, action: SafetyAction, days?: number) => {
    const name = it.full_name || (it.username ? `@${it.username}` : '');
    const run = async () => {
      setBusy(`${it.target_id}:${action}`);
      try { await safetyAct(it.target_type, it.target_id, action, days); load(tab); }
      catch (e) { Alert.alert(t(errorKey(e))); }
      finally { setBusy(null); }
    };
    if (action === 'suspend') {
      Alert.alert(t('safety.suspendQ', { name, count: days }), t('safety.suspendExplain'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('safety.suspendDays', { count: days }), style: 'destructive', onPress: run },
      ]);
    } else run();
  };

  if (ok === null) return <Loading />;
  if (!ok) return <Screen><Empty icon="lock-closed-outline" text={t('srv.not_allowed')} /></Screen>;

  return (
    <Screen edges={['bottom']}>
      <T size="sm" muted style={{ lineHeight: 21 }}>{t('safety.queueHint')}</T>
      <Segmented value={tab} onChange={setTab}
        options={[{ value: 'open', label: t('safety.tabOpen') }, { value: 'all', label: t('safety.tabAll') }, { value: 'terms', label: t('safety.tabTerms') }]} />

      {tab === 'terms' ? (
        <View style={{ gap: space.md }}>
          <T size="sm" muted style={{ lineHeight: 21 }}>{t('safety.termsHint')}</T>
          <Row gap={space.sm}>
            <View style={{ flex: 1 }}><Input value={term} onChangeText={setTerm} placeholder={t('safety.termPlaceholder')} maxLength={40} autoCapitalize="none" /></View>
            <Button small icon="add" title={t('safety.add')} loading={busy === 'term'} disabled={term.trim().length < 2}
              onPress={async () => {
                setBusy('term');
                try { await addTerm(term); setTerm(''); load('terms'); } catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(null); }
              }} />
          </Row>
          {!terms ? <Loading /> : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {terms.map((w) => (
                <Pressable key={w} onLongPress={() => Alert.alert(t('safety.removeTermQ', { term: w }), '', [
                  { text: t('common.cancel'), style: 'cancel' },
                  { text: t('common.delete'), style: 'destructive', onPress: async () => { try { await removeTerm(w); load('terms'); } catch (e) { Alert.alert(t(errorKey(e))); } } },
                ])} accessibilityRole="button" accessibilityHint={t('safety.removeTermHint')}
                  style={{ backgroundColor: colors.cardAlt, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 }}>
                  <T size="sm">{w}</T>
                </Pressable>
              ))}
            </View>
          )}
          <T size="xs" muted>{t('safety.removeTermHint')}</T>
        </View>
      ) : !items ? <Loading /> : !items.length ? (
        <Empty icon="shield-checkmark-outline" text={t(tab === 'open' ? 'safety.queueEmpty' : 'safety.queueEmptyAll')} />
      ) : items.map((it) => <ReportCard key={`${it.target_type}:${it.target_id}`} it={it} busy={busy} onAct={(a, d) => act(it, a, d)} />)}
    </Screen>
  );
}

function ReportCard({ it, busy, onAct }: { it: SafetyItem; busy: string | null; onAct: (a: SafetyAction, days?: number) => void }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const s = it.snapshot ?? {};
  const unscreened = it.reasons.includes('unscreened');
  const canHide = it.target_type === 'post' || it.target_type === 'comment' || it.target_type === 'checkin_comment';
  const open = it.status === 'open';
  const img = s.image_path ? publicUrl('posts', s.image_path) : null;
  const text = s.caption ?? s.body ?? (it.target_type === 'user' ? [s.full_name, s.bio].filter(Boolean).join(' · ') : null);
  const b = (a: SafetyAction) => busy === `${it.target_id}:${a}`;

  return (
    <Card style={{ gap: space.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T size="xs" semibold color={open ? colors.danger : colors.muted} style={{ flex: 1, textTransform: 'uppercase' }}>
          {t(`safety.what_${it.target_type}`)} · {unscreened ? t('safety.unscreened') : t('safety.reportsN', { count: it.reports })}
          {it.hidden ? ` · ${t('safety.isHidden')}` : ''}{it.suspended_until ? ` · ${t('safety.isSuspended')}` : ''}
        </T>
        <T size="xs" muted>{timeAgo(it.last_at, lng)}</T>
      </Row>
      {it.target_user ? (
        <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: it.target_user! } })} accessibilityRole="link">
          <Row gap={space.sm}>
            <Avatar size={30} uri={publicUrl('avatars', it.avatar_url)} name={it.full_name || it.username} />
            <T semibold numberOfLines={1} style={{ flex: 1 }}>{it.full_name || it.username} <T size="xs" muted>@{it.username}</T></T>
          </Row>
        </Pressable>
      ) : null}
      {img ? <Image source={{ uri: img }} style={{ width: '100%', aspectRatio: 1, borderRadius: radius.md, backgroundColor: colors.cardAlt }} contentFit="cover" /> : null}
      {s.media_type ? <T size="sm" muted>{t(s.media_type === 'video' ? 'safety.hasVideo' : 'safety.hasPhoto')}</T> : null}
      {text ? <T style={{ lineHeight: 24 }}>{text}</T> : null}
      {!unscreened ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {it.reasons.map((r) => (
            <View key={r} style={{ backgroundColor: colors.cardAlt, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
              <T size="xs">{t(`safety.reason_${r}`)}</T>
            </View>
          ))}
        </View>
      ) : null}
      {it.notes.slice(0, 3).map((n) => <T key={n} size="sm" muted style={{ lineHeight: 21 }}>«{n}»</T>)}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {unscreened ? <Button small icon="checkmark-circle-outline" title={t('safety.approve')} loading={b('approve')} onPress={() => onAct('approve')} /> : null}
        {canHide && !it.hidden ? <Button small variant="danger" icon="eye-off-outline" title={t('safety.hide')} loading={b('hide')} onPress={() => onAct('hide')} /> : null}
        {canHide && it.hidden ? <Button small variant="secondary" icon="eye-outline" title={t('safety.restore')} loading={b('restore')} onPress={() => onAct('restore')} /> : null}
        {it.target_user && !it.suspended_until ? (
          <>
            <Button small variant="secondary" icon="pause-circle-outline" title={t('safety.suspendDays', { count: 7 })} loading={b('suspend')} onPress={() => onAct('suspend', 7)} />
            <Button small variant="secondary" icon="pause-circle-outline" title={t('safety.suspendDays', { count: 30 })} onPress={() => onAct('suspend', 30)} />
          </>
        ) : null}
        {it.suspended_until ? <Button small variant="secondary" icon="play-circle-outline" title={t('safety.unsuspend')} loading={b('unsuspend')} onPress={() => onAct('unsuspend')} /> : null}
        {open && !unscreened ? <Button small variant="ghost" title={t('safety.dismiss')} loading={b('dismiss')} onPress={() => onAct('dismiss')} /> : null}
      </View>
    </Card>
  );
}
