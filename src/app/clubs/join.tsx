// انضم كنادي شريك: صاحب النادي أو مديره يطلب من داخل التطبيق، وإدارة أرك تراجع وتعتمد، وبعدها تفتح له لوحة التحكم
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { ClubLogo } from '@/components/clubs/parts';
import { Button, Card, Input, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { loadChains, type Chain } from '@/lib/clubs';
import { CLUB_ROLES, myClubRequest, requestClubPartner, type ClubRequest, type ClubRole } from '@/lib/partners';
import { onlyDigits } from '@/lib/digits';
import { errorKey } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

export default function JoinClub() {
  const { t } = useTranslation();
  const { userId } = useUser();
  const [req, setReq] = useState<ClubRequest | null | undefined>(undefined);
  const [chains, setChains] = useState<Chain[]>([]);
  const [q, setQ] = useState('');
  const [chainId, setChainId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState<ClubRole>('owner');
  const [cr, setCr] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [branches, setBranches] = useState('');
  const [note, setNote] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => {
    myClubRequest(userId).then(setReq).catch(() => setReq(null));
    loadChains().then(setChains).catch(() => {});
  }, [userId]));
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? chains.filter((c) => c.name.toLowerCase().includes(s) || (c.name_en ?? '').toLowerCase().includes(s)).slice(0, 8) : [];
  }, [q, chains]);

  if (req === undefined) return <Loading />;

  const submit = async () => {
    if (name.trim().length < 2) return Alert.alert(t('partners.err_clubName'));
    if (onlyDigits(phone).length < 9) return Alert.alert(t('partners.err_phone'));
    if (!agree) return Alert.alert(t('store.err_agree'));
    setBusy(true);
    try {
      await requestClubPartner({ chainId, name, role, cr, phone, email, city, branches, note });
      Alert.alert(t('partners.requestSent'), t('partners.requestSentBody'));
      setReq(await myClubRequest(userId));
    } catch (e) { Alert.alert(t(errorKey(e))); } finally { setBusy(false); }
  };

  if (req && req.status !== 'rejected') {
    return (
      <Screen edges={['bottom']}>
        <Stack.Screen options={{ title: t('partners.joinClubTitle') }} />
        <Card style={{ gap: space.sm, alignItems: 'center', padding: space.xl }}>
          <Ionicons name={req.status === 'approved' ? 'checkmark-circle' : 'time-outline'} size={44} color={req.status === 'approved' ? colors.success : brand.amber} />
          <T bold size="lg" center>{t(`partners.clubReq_${req.status}`)}</T>
          <T muted center style={{ lineHeight: 22 }}>{t(`partners.clubReqBody_${req.status}`, { name: req.club_name })}</T>
        </Card>
        {req.status === 'approved' ? <Button icon="grid-outline" title={t('partners.openDashboard')} onPress={() => router.replace('/partners')} /> : null}
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('partners.joinClubTitle') }} />
      {req?.status === 'rejected' ? (
        <Card style={{ gap: 4, borderColor: colors.danger }}>
          <T semibold>{t('partners.clubReq_rejected')}</T>
          {req.review_note ? <T size="sm">{t('coaching.reviewNote')}: {req.review_note}</T> : null}
        </Card>
      ) : (
        <Card style={{ gap: space.sm, backgroundColor: brand.deepGreen, borderColor: brand.deepGreen }}>
          <T bold color={brand.cream}>{t('partners.joinClubHow')}</T>
          {(['clubJoin1', 'clubJoin2', 'clubJoin3'] as const).map((k, i) => (
            <Row key={k} style={{ alignItems: 'flex-start' }}>
              <T bold color={brand.amber}>{i + 1}</T>
              <T size="sm" color={brand.sand} style={{ flex: 1, lineHeight: 22 }}>{t(`partners.${k}`)}</T>
            </Row>
          ))}
        </Card>
      )}

      {/* اختيار النادي من الدليل أو كتابته */}
      <View style={{ gap: 6 }}>
        <T size="sm" semibold>{t('partners.findYourClub')}</T>
        {chainId ? (
          <Row style={{ backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1.5, borderColor: brand.orange, padding: space.sm }}>
            <ClubLogo c={{ name: name || '?', logo_path: chains.find((c) => c.id === chainId)?.logo_path ?? null }} size={36} />
            <T semibold style={{ flex: 1 }}>{name}</T>
            <Pressable onPress={() => { setChainId(null); setName(''); }} hitSlop={8}><Ionicons name="close-circle" size={20} color={colors.muted} /></Pressable>
          </Row>
        ) : (
          <>
            <Input value={q} onChangeText={setQ} placeholder={t('partners.searchClubPh')} />
            {matches.map((c) => (
              <Pressable key={c.id} onPress={() => { setChainId(c.id); setName(c.name); setQ(''); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 6 }}>
                <ClubLogo c={{ name: c.name_en || c.name, logo_path: c.logo_path }} size={32} />
                <T style={{ flex: 1 }}>{c.name}</T>
                <T size="xs" muted>{t('partners.branchesN', { n: c.branches })}</T>
              </Pressable>
            ))}
            <T size="xs" muted>{t('partners.clubNotListed')}</T>
          </>
        )}
      </View>
      {!chainId ? <Input label={t('partners.clubName')} value={name} onChangeText={setName} maxLength={80} placeholder={t('partners.clubNamePh')} /> : null}
      <View style={{ gap: 6 }}>
        <T size="sm" semibold>{t('partners.yourRole')}</T>
        <Segmented<ClubRole> wrap value={role} onChange={setRole} options={CLUB_ROLES.map((r) => ({ value: r, label: t(`partners.role_${r}`) }))} />
      </View>
      <Input label={t('partners.crNumber')} hint={t('partners.crHint')} value={cr} onChangeText={setCr} keyboardType="number-pad" maxLength={15} />
      <Row gap={space.sm}>
        <View style={{ flex: 1 }}><Input label={t('partners.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="05xxxxxxxx" /></View>
        <View style={{ flex: 1 }}><Input label={t('partners.branches')} value={branches} onChangeText={setBranches} keyboardType="number-pad" maxLength={3} placeholder="1" /></View>
      </Row>
      <Input label={t('partners.workEmail')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" maxLength={120} placeholder="name@club.sa" />
      <Input label={t('store.city')} value={city} onChangeText={setCity} maxLength={40} placeholder={t('store.cityPh')} />
      <Input label={t('partners.noteOptional')} value={note} onChangeText={setNote} maxLength={400} multiline style={{ minHeight: 80, textAlignVertical: 'top' }}
        placeholder={t('partners.clubNotePh')} />
      <Pressable onPress={() => setAgree(!agree)} accessibilityRole="checkbox" accessibilityState={{ checked: agree }}>
        <Row style={{ alignItems: 'flex-start', backgroundColor: colors.card, borderRadius: radius.md, padding: space.sm }}>
          <Ionicons name={agree ? 'checkbox' : 'square-outline'} size={22} color={agree ? brand.orange : colors.muted} />
          <T size="sm" style={{ flex: 1, lineHeight: 22 }}>{t('partners.clubAgree')}</T>
        </Row>
      </Pressable>
      <Button title={t('store.submit')} icon="paper-plane-outline" loading={busy} onPress={submit} />
    </Screen>
  );
}
