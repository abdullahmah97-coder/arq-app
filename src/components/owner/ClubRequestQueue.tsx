// لوحة المالك: الأندية اللي طلبت تنضم كشريك. الاعتماد يربط صاحب الطلب بسلسلته (أو ينشئها) ويفتح له لوحة التحكم
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, View } from 'react-native';
import { Button, Card, Input, Row, T } from '@/components/ui';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { clubRequestQueue, reviewClubRequest, type ClubQueueItem } from '@/lib/partners';
import { errorKey } from '@/lib/supabase';
import { colors, space } from '@/theme';

export function ClubRequestQueue({ onChange }: { onChange?: () => void }) {
  const { t } = useTranslation();
  const [q, setQ] = useState<ClubQueueItem[]>([]);
  const load = useCallback(() => { clubRequestQueue().then(setQ).catch(() => {}); }, []);
  useFocusEffect(load);
  if (!q.length) return null;
  return (
    <Card style={{ gap: space.md }}>
      <T semibold>{t('partners.clubQueue', { count: q.length })}</T>
      {q.map((r) => <Item key={r.id} r={r} onDone={() => { load(); onChange?.(); }} />)}
    </Card>
  );
}

function Item({ r, onDone }: { r: ClubQueueItem; onDone: () => void }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const decide = async (d: 'approved' | 'rejected') => {
    if (d === 'rejected' && note.trim().length < 3) return Alert.alert(t('coaching.err_rejectNote'));
    setBusy(true);
    try { await reviewClubRequest(r.id, d, d === 'rejected' ? note : undefined); onDone(); }
    catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };
  return (
    <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm }}>
      <Row>
        <Ionicons name="business-outline" size={18} color={colors.primary} />
        <T bold style={{ flex: 1 }}>{r.club_name}</T>
        <T size="xs" muted>{timeAgo(r.created_at, lng)}</T>
      </Row>
      <T size="sm">{r.full_name || r.username} (@{r.username}) · {t(`partners.role_${r.role}`)}</T>
      <T size="xs" muted>
        {[r.chain_name ? t('partners.linkedChain', { name: r.chain_name }) : t('partners.newChainOnApprove'),
          r.city, r.branches ? t('partners.branchesN', { n: r.branches }) : null, r.cr_number ? `${t('partners.crNumber')}: ${r.cr_number}` : null].filter(Boolean).join(' · ')}
      </T>
      <Row gap={space.md}>
        <Pressable onPress={() => Linking.openURL(`tel:+${r.phone}`)}><T size="sm" semibold color={colors.primary}>+{r.phone}</T></Pressable>
        {r.email ? <Pressable onPress={() => Linking.openURL(`mailto:${r.email}`)}><T size="sm" semibold color={colors.primary}>{r.email}</T></Pressable> : null}
      </Row>
      {r.note ? <T size="sm" muted>{r.note}</T> : null}
      {rejecting ? (
        <View style={{ gap: space.sm }}>
          <Input value={note} onChangeText={setNote} maxLength={300} multiline placeholder={t('coaching.rejectNotePh')} />
          <Row gap={space.sm}>
            <Button small style={{ flex: 1 }} variant="secondary" title={t('coaching.sendReject')} loading={busy} onPress={() => decide('rejected')} />
            <Button small variant="ghost" title={t('common.cancel')} onPress={() => setRejecting(false)} />
          </Row>
        </View>
      ) : (
        <Row gap={space.sm}>
          <Button small style={{ flex: 1 }} icon="checkmark-circle-outline" title={t('coaching.approve')} loading={busy} onPress={() => decide('approved')} />
          <Button small variant="secondary" title={t('coaching.reject')} onPress={() => setRejecting(true)} />
        </Row>
      )}
    </View>
  );
}
