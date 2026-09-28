// بطاقة الدخول: رمز QR يتجدد كل ٤٥ ثانية + رقم من ٦ خانات، يمسحه الاستقبال بكاميرا جواله
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, View } from 'react-native';
import { BrandGradient } from '@/brand/Brand';
import { QrCode } from '@/components/gymops/QrCode';
import { Avatar, Button, Empty, Loading, Screen, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { entryLink, loadMyMemberships, newEntryToken, type MyMembership } from '@/lib/gymops';
import { useLocalized } from '@/lib/i18n';
import { errorKey, publicUrl } from '@/lib/supabase';
import { brand, radius, space } from '@/theme';

const REFRESH_MS = 45_000;

export default function EntryCard() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const { profile } = useAuth();
  const [tok, setTok] = useState<{ token: string; code: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mem, setMem] = useState<MyMembership | null | undefined>(undefined);
  const [left, setLeft] = useState(REFRESH_MS);
  const born = useRef(Date.now());

  const refresh = useCallback(async () => {
    try { const x = await newEntryToken(); setTok(x); setErr(null); born.current = Date.now(); setLeft(REFRESH_MS); }
    catch (e) { setErr(errorKey(e)); }
  }, []);

  useFocusEffect(useCallback(() => {
    refresh();
    loadMyMemberships().then((ms) => setMem(ms.find((m) => m.state === 'active') ?? ms.find((m) => m.state !== 'expired' && m.state !== 'cancelled') ?? null)).catch(() => setMem(null));
    const tick = setInterval(() => {
      const l = REFRESH_MS - (Date.now() - born.current);
      if (l <= 0) refresh(); else setLeft(l);
    }, 1000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    return () => { clearInterval(tick); sub.remove(); };
  }, [refresh]));

  if (mem === undefined) return <Loading />;
  const name = profile?.full_name?.trim() || profile?.username || '';
  const place = mem ? (lng === 'en' && mem.target_name_en ? mem.target_name_en : mem.target_name) : null;

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('gymops.entryCard') }} />
      <BrandGradient name="ember" style={{ borderRadius: radius.lg, overflow: 'hidden', padding: space.lg, gap: space.md, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Avatar size={40} uri={publicUrl('avatars', profile?.avatar_url)} name={name} />
          <View>
            <T bold color={brand.cream}>{name}</T>
            {mem ? <T size="xs" color={brand.sand}>{place} · {mem.plan_name}</T> : <T size="xs" color={brand.sand}>{t('gymops.noActive')}</T>}
          </View>
        </View>
        <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 14 }}>
          {tok ? <QrCode value={entryLink(tok.token)} size={250} /> : <View style={{ width: 250, height: 250, alignItems: 'center', justifyContent: 'center' }}><T muted>{err ? t(err) : '…'}</T></View>}
        </View>
        <T size="xs" color={brand.sand}>{t('gymops.orCode')}</T>
        <T size="xxl" bold color={brand.cream} style={{ letterSpacing: 8, fontVariant: ['tabular-nums'] }}>{tok ? `${tok.code.slice(0, 3)} ${tok.code.slice(3)}` : '— — —'}</T>
        <View style={{ width: '70%', height: 4, borderRadius: 2, backgroundColor: 'rgba(248,237,218,0.25)', overflow: 'hidden' }}>
          <View style={{ width: `${(left / REFRESH_MS) * 100}%`, height: '100%', backgroundColor: brand.amber }} />
        </View>
        {mem ? <T size="sm" semibold color={brand.cream}>{t('gymops.daysLeft', { count: mem.days_left })}</T> : null}
      </BrandGradient>
      <T size="sm" muted center>{t('gymops.cardHint')}</T>
      {!mem ? <Empty icon="card-outline" text={t('gymops.noActiveHint')} /> : null}
      <Button variant="secondary" icon="refresh" title={t('gymops.newCode')} onPress={refresh} />
    </Screen>
  );
}
