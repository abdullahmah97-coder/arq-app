// لوحة إدارة التطبيق ← طلبات التسجيل: كل حساب جديد ينتظر موافقتك قبل ما يدخل التطبيق.
// قبول (يوصله إشعار ويكمّل إعداد حسابه) أو رفض، و«قبول الكل»، ومفتاح لإيقاف الموافقة (الجديد يدخل على طول).
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Switch, View } from 'react-native';
import { Avatar, Button, Card, Empty, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { listSignups, loadApprovalSetting, saveApprovalSetting, setApproval, type Approval, type SignupRow } from '@/lib/approval';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { isAdmin } from '@/lib/owner';
import { errorKey, publicUrl } from '@/lib/supabase';
import { colors, space } from '@/theme';

export default function OwnerSignups() {
  const { t } = useTranslation();
  const [ok, setOk] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Approval>('pending');
  const [rows, setRows] = useState<SignupRow[] | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback((which: Approval) => {
    setRows(null);
    listSignups(which).then(setRows).catch((e) => { setRows([]); Alert.alert(t(errorKey(e))); });
  }, [t]);

  useFocusEffect(useCallback(() => {
    isAdmin().then((a) => {
      setOk(a);
      if (!a) return;
      load(tab);
      loadApprovalSetting().then(setEnabled).catch(() => setEnabled(true));
    }).catch(() => setOk(false));
  }, [load, tab]));

  const decide = async (ids: string[], to: Approval, key: string) => {
    setBusy(key);
    try { await setApproval(ids, to); setRows((r) => (r ?? []).filter((x) => !ids.includes(x.id))); }
    catch (e) { Alert.alert(t(errorKey(e))); }
    finally { setBusy(null); }
  };
  const reject = (u: SignupRow) => Alert.alert(t('approval.rejectQ', { name: u.full_name || `@${u.username}` }), t('approval.rejectExplain'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('approval.reject'), style: 'destructive', onPress: () => decide([u.id], 'rejected', `${u.id}:rejected`) },
  ]);
  const approveAll = () => {
    const ids = (rows ?? []).map((r) => r.id);
    Alert.alert(t('approval.approveAllQ', { count: ids.length }), '', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('approval.approveAll'), onPress: () => decide(ids, 'approved', 'all') },
    ]);
  };
  const toggle = (v: boolean) => {
    const save = async () => {
      setEnabled(v);
      try { await saveApprovalSetting(v); } catch (e) { setEnabled(!v); Alert.alert(t(errorKey(e))); }
    };
    if (v) { void save(); return; }
    Alert.alert(t('approval.offQ'), t('approval.offExplain'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('approval.turnOff'), style: 'destructive', onPress: save },
    ]);
  };

  if (ok === null) return <Loading />;
  if (!ok) return <Screen><Empty icon="lock-closed-outline" text={t('srv.not_allowed')} /></Screen>;

  return (
    <Screen edges={['bottom']}>
      <T size="sm" muted style={{ lineHeight: 21 }}>{t('approval.queueHint')}</T>

      <Card style={{ gap: 4 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T semibold style={{ flex: 1 }}>{t('approval.settingTitle')}</T>
          <Switch value={enabled ?? true} disabled={enabled === null} onValueChange={toggle} trackColor={{ true: colors.primary }} />
        </Row>
        <T size="xs" muted style={{ lineHeight: 19 }}>{t(enabled === false ? 'approval.settingOff' : 'approval.settingOn')}</T>
      </Card>

      <Segmented value={tab} onChange={setTab}
        options={[{ value: 'pending', label: t('approval.tabPending') }, { value: 'rejected', label: t('approval.tabRejected') }, { value: 'approved', label: t('approval.tabApproved') }]} />

      {!rows ? <Loading /> : !rows.length ? (
        <Empty icon="people-outline" text={t(tab === 'pending' ? 'approval.empty' : 'approval.emptyOther')} />
      ) : (
        <View style={{ gap: space.md }}>
          {tab === 'pending' && rows.length > 1 ? (
            <Button small variant="secondary" icon="checkmark-done" title={`${t('approval.approveAll')} (${rows.length})`} loading={busy === 'all'} onPress={approveAll} />
          ) : null}
          {rows.map((u) => <SignupCard key={u.id} u={u} tab={tab} busy={busy}
            onApprove={() => decide([u.id], 'approved', `${u.id}:approved`)} onReject={() => reject(u)} />)}
        </View>
      )}
    </Screen>
  );
}

function SignupCard({ u, tab, busy, onApprove, onReject }: { u: SignupRow; tab: Approval; busy: string | null; onApprove: () => void; onReject: () => void }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const name = u.full_name || u.username;
  const when = tab === 'pending' ? u.created_at : u.approval_at ?? u.created_at;
  return (
    <Card style={{ gap: space.sm }}>
      <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: u.id } })} accessibilityRole="link">
        <Row gap={space.md}>
          <Avatar size={44} uri={publicUrl('avatars', u.avatar_url)} name={name} />
          <View style={{ flex: 1, gap: 2 }}>
            <T semibold numberOfLines={1}>{name} <T size="xs" muted>@{u.username}</T></T>
            {u.email ? <T size="xs" muted numberOfLines={1}>{u.email}</T> : null}
            <T size="xs" muted>
              {[u.gender ? t(`onboarding.${u.gender}`) : null, u.account_type && u.account_type !== 'trainee' ? t('approval.partnerAccount') : null,
                t(tab === 'pending' ? 'approval.signedUp' : 'approval.decided', { ago: timeAgo(when, lng) })].filter(Boolean).join(' · ')}
            </T>
          </View>
        </Row>
      </Pressable>
      <Row gap={space.sm}>
        {tab !== 'approved' ? (
          <Button small style={{ flex: 1 }} icon="checkmark" title={t('approval.approve')} loading={busy === `${u.id}:approved`} onPress={onApprove} />
        ) : null}
        {tab !== 'rejected' ? (
          <Button small style={{ flex: 1 }} variant="secondary" icon="close" title={t('approval.reject')} loading={busy === `${u.id}:rejected`} onPress={onReject} />
        ) : null}
      </Row>
    </Card>
  );
}
