// لوحة المالك: الأندية اللي طلبت تنضم كشريك (مع السجل التجاري ورخصة النادي وصورهم).
// الاعتماد يربط صاحب الطلب بسلسلته (أو ينشئها) ويفتح له لوحة التحكم
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Input, Row, T } from '@/components/ui';
import { timeAgo } from '@/lib/dates';
import { useLocalized } from '@/lib/i18n';
import { clubRequestQueue, partnerDocUrl, reviewClubRequest, type ClubQueueItem } from '@/lib/partners';
import { errorKey } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

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
          r.city, r.branches ? t('partners.branchesN', { n: r.branches }) : null].filter(Boolean).join(' · ')}
      </T>
      <View style={{ gap: 2 }}>
        <T size="sm">{t('partners.crNumber')}: <T size="sm" semibold>{r.cr_number || '—'}</T></T>
        <T size="sm">{t('partners.licenseNumber')}: <T size="sm" semibold>{r.license_number || '—'}</T></T>
      </View>
      {r.cr_doc_path || r.license_doc_path ? (
        <Row gap={space.sm}>
          {r.cr_doc_path ? <DocButton label={t('partners.crPhoto')} path={r.cr_doc_path} /> : null}
          {r.license_doc_path ? <DocButton label={t('partners.licensePhoto')} path={r.license_doc_path} /> : null}
        </Row>
      ) : <T size="xs" muted>{t('partners.noDocs')}</T>}
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

/** صورة مستند (السجل التجاري أو الرخصة): رابط مؤقت يفتح الصورة كاملة داخل التطبيق */
function DocButton({ label, path }: { label: string; path: string }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    const u = await partnerDocUrl(path).catch(() => null);
    setBusy(false);
    if (u) setUrl(u); else Alert.alert(t('errors.generic'));
  };
  return (
    <>
      <Pressable onPress={open} disabled={busy} accessibilityRole="button" accessibilityLabel={label}
        style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9,
          borderRadius: radius.md, backgroundColor: colors.cardAlt, opacity: pressed ? 0.7 : 1 })}>
        {busy ? <ActivityIndicator size="small" color={colors.text} /> : <Ionicons name="document-attach-outline" size={16} color={colors.primary} />}
        <T size="sm" semibold numberOfLines={1}>{label}</T>
      </Pressable>
      <Modal visible={!!url} transparent animationType="fade" onRequestClose={() => setUrl(null)}>
        <Pressable onPress={() => setUrl(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' }} accessibilityLabel={t('common.close')}>
          <SafeAreaView style={{ flex: 1 }}>
            <Row style={{ justifyContent: 'space-between', padding: space.md }}>
              <T semibold color={brand.cream}>{label}</T>
              <Ionicons name="close" size={24} color={brand.cream} />
            </Row>
            {url ? <Image source={{ uri: url }} style={{ flex: 1 }} contentFit="contain" /> : null}
          </SafeAreaView>
        </Pressable>
      </Modal>
    </>
  );
}
