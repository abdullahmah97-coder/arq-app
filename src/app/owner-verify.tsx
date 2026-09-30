// لوحة إدارة التطبيق ← التوثيق: ابحث عن أي حساب ووثّقه (علامة ✓)، أو شيل التوثيق من الحسابات الموثّقة
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { Avatar, Button, Card, Empty, Input, Loading, Row, Screen, T } from '@/components/ui';
import { displayName } from '@/lib/adminUsers';
import { useUser } from '@/lib/auth';
import { useLocalized } from '@/lib/i18n';
import { isAdmin } from '@/lib/owner';
import { errorKey, publicUrl } from '@/lib/supabase';
import { loadVerified, searchForVerify, setVerified, type VerifiedUser, type VerifyCandidate } from '@/lib/verify';
import { brand, colors, radius, space } from '@/theme';

interface Person { id: string; username: string; full_name: string | null; avatar_url: string | null; email?: string; verified: boolean }

export default function OwnerVerify() {
  const { t } = useTranslation();
  const { userId, refreshProfile } = useUser();
  const [ok, setOk] = useState<boolean | null>(null);
  const [verified, setVerifiedList] = useState<VerifiedUser[] | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<VerifyCandidate[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const seq = useRef(0);

  const loadList = useCallback(() => { loadVerified().then(setVerifiedList).catch((e) => { setVerifiedList([]); Alert.alert(t(errorKey(e))); }); }, [t]);

  useFocusEffect(useCallback(() => {
    isAdmin().then((a) => { setOk(a); if (a) loadList(); }).catch(() => setOk(false));
  }, [loadList]));

  // البحث بعد ما يوقف الكتابة شوي (حرفين على الأقل)
  const searching = query.trim().length >= 2;
  useEffect(() => {
    const q = query.trim();
    const my = ++seq.current;
    if (!ok || q.length < 2) return;
    const h = setTimeout(() => {
      searchForVerify(q).then((r) => { if (my === seq.current) setResults(r); })
        .catch((e) => { if (my === seq.current) setResults([]); Alert.alert(t(errorKey(e))); });
    }, 350);
    return () => clearTimeout(h);
  }, [ok, query, t]);

  const toggle = (p: Person) => {
    const name = p.full_name || `@${p.username}`;
    const on = !p.verified;
    Alert.alert(t(on ? 'verify.verifyTitle' : 'verify.unverifyTitle', { name }), t(on ? 'verify.verifyBody' : 'verify.unverifyBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t(on ? 'verify.verify' : 'verify.unverify'), style: on ? 'default' : 'destructive', onPress: async () => {
          setBusy(p.id);
          try {
            await setVerified(p.id, on);
            setResults((rs) => rs?.map((x) => (x.id === p.id ? { ...x, verified: on } : x)) ?? null);
            setVerifiedList((vs) => {
              const rest = (vs ?? []).filter((x) => x.id !== p.id);
              return on ? [...rest, { id: p.id, username: p.username, full_name: p.full_name, avatar_url: p.avatar_url }].sort((a, b) => a.username.localeCompare(b.username)) : rest;
            });
            if (p.id === userId) void refreshProfile();
          } catch (e) { Alert.alert(t(errorKey(e))); }
          setBusy(null);
        },
      },
    ]);
  };

  if (ok === null) return <Loading />;
  if (!ok) return <Screen><Empty icon="lock-closed-outline" text={t('owner.noAccess')} /></Screen>;

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('verify.title') }} />
      <View style={{ backgroundColor: brand.deepGreen, borderRadius: radius.lg, padding: space.lg, gap: 6 }}>
        <Row gap={8}>
          <Ionicons name="shield-checkmark" size={18} color={brand.amber} />
          <T size="xs" semibold color={brand.amber}>{t('adminUsers.eyebrow')}</T>
        </Row>
        <T size="lg" bold color={brand.cream}>{t('verify.headline')}</T>
        <T size="sm" color={brand.sand} style={{ lineHeight: 22 }}>{t('verify.intro')}</T>
      </View>

      <Input value={query} onChangeText={setQuery} placeholder={t('verify.searchPh')} autoCapitalize="none" autoCorrect={false}
        clearButtonMode="while-editing" returnKeyType="search" />
      {!searching || results === null ? null : !results.length ? (
        <T size="sm" muted center>{t('verify.noResults')}</T>
      ) : (
        results.map((r) => <PersonRow key={r.id} p={r} me={r.id === userId} busy={busy === r.id} onToggle={toggle} />)
      )}

      <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
        <T size="lg" bold>{t('verify.verifiedTitle')}{verified?.length ? ` (${verified.length})` : ''}</T>
        <Ionicons name="checkmark-circle" size={20} color={colors.success} />
      </Row>
      {!verified ? <Loading /> : !verified.length ? (
        <Empty icon="shield-outline" text={t('verify.none')} />
      ) : (
        verified.map((v) => <PersonRow key={v.id} p={{ ...v, verified: true }} me={v.id === userId} busy={busy === v.id} onToggle={toggle} />)
      )}
    </Screen>
  );
}

function PersonRow({ p, me, busy, onToggle }: { p: Person; me: boolean; busy: boolean; onToggle: (p: Person) => void }) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const name = displayName(p);
  return (
    <Card style={{ gap: space.sm, opacity: busy ? 0.6 : 1 }}>
      <Row gap={space.md}>
        <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: p.id } })} accessibilityRole="link" accessibilityLabel={name}>
          <Avatar size={44} uri={publicUrl('avatars', p.avatar_url)} name={name} />
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <Row gap={6}>
            <T bold numberOfLines={1} style={{ flexShrink: 1 }}>{name}</T>
            {p.verified ? <Ionicons name="checkmark-circle" size={16} color={colors.success} accessibilityLabel={t('verify.badge')} /> : null}
            {me ? <T size="xs" semibold color={brand.orange}>{t('adminUsers.you')}</T> : null}
          </Row>
          <T size="xs" muted numberOfLines={1}>@{p.username}</T>
          {p.email ? <T size="xs" numberOfLines={1} style={{ writingDirection: 'ltr', textAlign: lng === 'ar' ? 'right' : 'left' }}>{p.email}</T> : null}
        </View>
      </Row>
      <Button small variant={p.verified ? 'secondary' : 'primary'} icon={p.verified ? 'close-circle-outline' : 'shield-checkmark-outline'}
        title={t(p.verified ? 'verify.unverify' : 'verify.verify')} loading={busy} onPress={() => onToggle(p)} />
    </Card>
  );
}
