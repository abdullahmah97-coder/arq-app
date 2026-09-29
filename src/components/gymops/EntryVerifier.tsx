// شاشة الاستقبال: يختار الفرع مرة وحدة، ويتحقق من رمز العضو (QR أو ٦ أرقام) بنتيجة واضحة وكبيرة
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, TextInput, View } from 'react-native';
import { Avatar, Button, Card, Empty, Loading, Row, T } from '@/components/ui';
import { loadStaffGyms, rememberEntryGym, savedEntryGym, verifyEntry, type EntryResult, type StaffGym, daysLeftText } from '@/lib/gymops';
import { useLocalized } from '@/lib/i18n';
import { errorKey, publicUrl } from '@/lib/supabase';
import { brand, colors, fonts, radius, space } from '@/theme';

const OK = '#1F8A55';
const NO = '#C23A12';

export function EntryVerifier({ token, gymParam }: { token?: string | null; gymParam?: string | null }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const [gyms, setGyms] = useState<StaffGym[] | null>(null);
  const [gym, setGym] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<EntryResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const used = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      const list = await loadStaffGyms();
      setGyms(list);
      const saved = await savedEntryGym();
      const pick = (gymParam && list.find((g) => g.gym_id === gymParam)) || (saved && list.find((g) => g.gym_id === saved)) || (list.length === 1 ? list[0] : null);
      if (pick) setGym(pick.gym_id); else if (list.length > 1) setPicking(true);
    })();
  }, [gymParam]);

  const check = useCallback(async (value: string) => {
    if (!gym || busy) return;
    setBusy(true); setErr(null); setRes(null);
    try {
      const r = await verifyEntry(value, gym);
      setRes(r);
      Haptics.notificationAsync(r.allowed ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
    } catch (e) { setErr(errorKey(e)); }
    finally { setBusy(false); setCode(''); }
  }, [gym, busy]);

  useEffect(() => {
    if (token && gym && used.current !== token) { used.current = token; check(token); }
  }, [token, gym, check]);

  if (gyms === null) return <Loading />;
  if (!gyms.length) return <Empty icon="lock-closed-outline" text={t('gymops.staffOnly')} />;
  const current = gyms.find((g) => g.gym_id === gym);
  const gname = (g: StaffGym) => (lng === 'en' && g.name_en ? g.name_en : g.name);

  if (picking || !current) {
    return (
      <View style={{ gap: space.sm }}>
        <T bold>{t('gymops.pickBranch')}</T>
        {gyms.map((g) => (
          <Pressable key={g.gym_id} onPress={() => { setGym(g.gym_id); rememberEntryGym(g.gym_id); setPicking(false); }}
            style={{ padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: g.gym_id === gym ? brand.orange : colors.border }}>
            <T semibold>{gname(g)}</T>
            <T size="xs" muted>{t(`gymops.role_${g.role}`)}</T>
          </Pressable>
        ))}
      </View>
    );
  }

  return (
    <View style={{ gap: space.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T size="sm" muted>{t('gymops.verifyingAt')} <T size="sm" semibold>{gname(current)}</T></T>
        {gyms.length > 1 ? <Pressable onPress={() => setPicking(true)} hitSlop={8}><T size="sm" semibold color={colors.primary}>{t('gymops.change')}</T></Pressable> : null}
      </Row>

      {busy ? <Loading /> : null}
      {res ? <ResultPanel r={res} onNext={() => { setRes(null); if (token) router.replace('/entry/code'); }} /> : null}
      {err ? <Card style={{ borderColor: NO }}><T color={NO}>{t(err)}</T></Card> : null}

      {!res ? (
        <Card style={{ gap: space.sm, alignItems: 'center' }}>
          <T semibold>{t('gymops.typeCode')}</T>
          <TextInput value={code} onChangeText={(v) => { const d = v.replace(/[٠-٩]/g, (x) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(x))).replace(/\D/g, '').slice(0, 6); setCode(d); if (d.length === 6) check(d); }}
            keyboardType="number-pad" maxLength={6} placeholder="000000" placeholderTextColor={colors.muted} accessibilityLabel={t('gymops.typeCode')}
            style={{ width: 220, textAlign: 'center', fontSize: 34, letterSpacing: 10, fontFamily: fonts.semibold, color: colors.text, borderBottomWidth: 2, borderColor: brand.orange, paddingVertical: 6 }} />
          <T size="xs" muted center>{t('gymops.scanHint')}</T>
        </Card>
      ) : null}
    </View>
  );
}

function ResultPanel({ r, onNext }: { r: EntryResult; onNext: () => void }) {
  const { t } = useTranslation();
  const color = r.allowed ? OK : NO;
  return (
    <View style={{ gap: space.md }}>
      <View style={{ backgroundColor: color, borderRadius: radius.lg, padding: space.xl, alignItems: 'center', gap: space.sm }}>
        <Ionicons name={r.allowed ? 'checkmark-circle' : 'close-circle'} size={84} color="#fff" />
        <T size="xxl" bold color="#fff">{r.allowed ? t('gymops.allowed') : t('gymops.denied')}</T>
        <T size="lg" semibold color="#fff" center>{t(`gymops.reason_${r.reason}`)}</T>
        {r.allowed && r.already_in ? <T size="sm" color="#fff">{t('gymops.alreadyIn')}</T> : null}
      </View>
      {r.member_id ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Avatar size={64} uri={publicUrl('avatars', r.avatar_url)} name={r.member_name} />
          <View style={{ flex: 1, gap: 2 }}>
            <T size="lg" bold>{r.member_name}</T>
            {r.username ? <T size="xs" muted>@{r.username}</T> : null}
            {r.plan_name ? <T size="sm">{r.plan_name}</T> : null}
            {r.days_left != null ? <T size="sm" semibold color={r.days_left <= 7 ? brand.orange : colors.text}>{daysLeftText(t, r.days_left)} · {r.ends_on}</T> : null}
          </View>
        </Card>
      ) : null}
      <Button icon="arrow-forward" title={t('gymops.nextMember')} onPress={onNext} />
    </View>
  );
}
