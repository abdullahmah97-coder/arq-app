// إضافة أو تعديل اشتراك عضو: باسم المستخدم في أرك، أو الاسم والجوال (نعطيه رمز ربط)
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Share, View } from 'react-native';
import { Button, Card, Empty, Input, Row, Screen, Segmented, T } from '@/components/ui';
import { deleteMembership, loadMembership, normDate, saveMembership } from '@/lib/gymops';
import { canManageGymOrChain } from '@/lib/services';
import { goBackOrHome } from '@/lib/nav';
import { isoDate as iso } from '@/lib/dates';
import { toLatinDigits } from '@/lib/digits';
import { errorKey } from '@/lib/supabase';
import { colors, space } from '@/theme';

const addMonths = (from: string, n: number) => { const d = new Date(`${from}T12:00:00`); d.setMonth(d.getMonth() + n); d.setDate(d.getDate() - 1); return iso(d); };
const addDays = (from: string, n: number) => { const d = new Date(`${from}T12:00:00`); d.setDate(d.getDate() + n - 1); return iso(d); };

export default function MembershipForm() {
  const { gym, id } = useLocalSearchParams<{ gym: string; id?: string }>();
  const { t } = useTranslation();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [who, setWho] = useState<'user' | 'guest'>('user');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [kind, setKind] = useState<'membership' | 'pass'>('membership');
  const [plan, setPlan] = useState('');
  const [starts, setStarts] = useState(iso(new Date()));
  const [ends, setEnds] = useState(addMonths(iso(new Date()), 1));
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [referral, setReferral] = useState('');
  const [busy, setBusy] = useState(false);
  const [claim, setClaim] = useState<string | null>(null);
  const [chainWide, setChainWide] = useState(false);

  useEffect(() => { canManageGymOrChain(String(gym)).then(setAllowed); }, [gym]);
  useEffect(() => {
    if (!id) return;
    loadMembership(String(id)).then((m) => {
      if (!m) return;
      setKind(m.kind); setPlan(m.plan_name); setStarts(m.starts_on); setEnds(m.ends_on); setPrice(m.price_sar != null ? String(+m.price_sar) : '');
      setNotes(m.notes ?? ''); setClaim(m.claim_code); setChainWide(!!m.chain_id && !m.gym_id);
      if (m.user_id) { setWho('user'); setUsername(m.profiles?.username ?? ''); } else { setWho('guest'); setName(m.member_name ?? ''); setContact(m.member_contact ?? ''); }
    });
  }, [id]);

  if (allowed === false) return <Screen><Empty icon="lock-closed-outline" text={t('gymops.managerOnly')} /></Screen>;

  const save = async () => {
    const s = normDate(starts), e = normDate(ends);
    if (plan.trim().length < 2) return Alert.alert(t('gymops.err_plan'));
    if (!s || !e || e < s) return Alert.alert(t('gymops.err_dates'));
    if (!id && who === 'user' && !username.trim()) return Alert.alert(t('gymops.err_username'));
    if (!id && who === 'guest' && !name.trim()) return Alert.alert(t('gymops.err_name'));
    setBusy(true);
    try {
      const r = await saveMembership({
        id: id ?? null, gymId: chainWide ? null : String(gym), chainId: null, username: who === 'user' ? username : undefined,
        memberName: who === 'guest' ? name : undefined, memberContact: who === 'guest' ? contact : undefined,
        kind, plan, starts: s, ends: e, price: price.trim() ? Number(toLatinDigits(price).replace(/[^\d.]/g, '')) : null, notes, referral,
      });
      if (!id && r.claim_code) setClaim(r.claim_code); else goBackOrHome();
    } catch (err) { Alert.alert(t(errorKey(err))); } finally { setBusy(false); }
  };

  if (claim && !id) {
    return (
      <Screen edges={['bottom']}>
        <Stack.Screen options={{ title: t('gymops.tool_addMember') }} />
        <Card style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xl }}>
          <T bold>{t('gymops.savedWithCode')}</T>
          <T size="xxl" bold style={{ letterSpacing: 4 }}>{claim}</T>
          <T size="sm" muted center>{t('gymops.claimExplain')}</T>
          <Button icon="share-social-outline" title={t('gymops.sendCode')} onPress={() => Share.share({ message: t('gymops.claimShare', { code: claim }) })} />
        </Card>
        <Button variant="secondary" title={t('common.done')} onPress={goBackOrHome} />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: id ? t('gymops.editMember') : t('gymops.tool_addMember') }} />
      {!id ? <Segmented<'user' | 'guest'> value={who} onChange={setWho} options={[{ value: 'user', label: t('gymops.hasArq') }, { value: 'guest', label: t('gymops.noArq') }]} /> : null}
      {who === 'user' ? (
        <Input label={t('gymops.username')} value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="@username" editable={!id} />
      ) : (
        <>
          <Input label={t('gymops.memberName')} value={name} onChangeText={setName} maxLength={80} />
          <Input label={t('gymops.memberContact')} value={contact} onChangeText={setContact} maxLength={80} keyboardType="phone-pad" hint={t('gymops.contactHint')} />
        </>
      )}
      <Segmented<'membership' | 'pass'> value={kind} onChange={setKind} options={[{ value: 'membership', label: t('gymops.kindMembership') }, { value: 'pass', label: t('gymops.kindPass') }]} />
      <Input label={t('gymops.plan')} value={plan} onChangeText={setPlan} maxLength={80} placeholder={kind === 'pass' ? t('gymops.planPassPh') : t('gymops.planPh')} />
      <Row gap={space.md}>
        <View style={{ flex: 1 }}><Input label={t('gymops.starts')} value={starts} onChangeText={setStarts} placeholder="2026-10-01" autoCapitalize="none" /></View>
        <View style={{ flex: 1 }}><Input label={t('gymops.ends')} value={ends} onChangeText={setEnds} placeholder="2026-10-31" autoCapitalize="none" /></View>
      </Row>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {(kind === 'pass' ? [[1, 'd'], [7, 'd']] : [[1, 'm'], [3, 'm'], [6, 'm'], [12, 'm']]).map(([n, u]) => (
          <Pressable key={`${n}${u}`} onPress={() => { const s = normDate(starts) ?? iso(new Date()); setEnds(u === 'm' ? addMonths(s, n as number) : addDays(s, n as number)); }}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.cardAlt }}>
            <T size="xs" semibold>{u === 'm' ? t('gymops.monthsN', { count: n as number }) : t('gymops.daysN', { count: n as number })}</T>
          </Pressable>
        ))}
      </Row>
      <Input label={t('gymops.price')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="300" />
      {!id ? <Input label={t('gymops.referralCode')} value={referral} onChangeText={(v) => setReferral(v.toUpperCase())} autoCapitalize="characters" maxLength={6} hint={t('gymops.referralHint')} /> : null}
      <Input label={t('gymops.notes')} value={notes} onChangeText={setNotes} maxLength={300} multiline />
      {claim && id ? <T size="sm">{t('gymops.claimCode')}: <T size="sm" bold>{claim}</T></T> : null}
      <Button icon="checkmark" title={t('common.save')} loading={busy} onPress={save} />
      {id ? <Button variant="ghost" icon="trash-outline" title={t('common.delete')} onPress={() => Alert.alert(t('gymops.deleteMemberQ'), '', [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: async () => { try { await deleteMembership(String(id)); goBackOrHome(); } catch (e) { Alert.alert(t(errorKey(e))); } } },
      ])} /> : null}
    </Screen>
  );
}
