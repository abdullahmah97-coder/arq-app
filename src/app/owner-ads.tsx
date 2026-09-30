// لوحة المالك ← إعلان البداية: كل الإعلانات، حالتها وأرقامها، وتشغيل/إيقاف ومعاينة وحذف
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Switch, View } from 'react-native';
import { LaunchAdView } from '@/components/ads/LaunchAd';
import { Button, Card, Empty, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { adMediaUrl, deleteLaunchAd, launchAdStats, listLaunchAds, setLaunchAdActive, type AdStats, type LaunchAdRow } from '@/lib/launchAds';
import { adState, isMarketing, parseTarget, type AdState } from '@/lib/launchAdsCore';
import { useLocalized } from '@/lib/i18n';
import { isAdmin } from '@/lib/owner';
import { brand, colors, radius, space } from '@/theme';

const STATE_COLOR: Record<AdState, string> = { live: '#2E8B57', scheduled: brand.amber, ended: '#8A8A8A', off: '#B0B0B0' };

export default function OwnerAds() {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const fmt = (iso: string, end = false) => new Date(new Date(iso).getTime() - (end ? 1000 : 0))
    .toLocaleDateString(lng === 'en' ? 'en-GB' : 'ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short', timeZone: 'Asia/Riyadh' });
  const [ok, setOk] = useState<boolean | null>(null);
  const [rows, setRows] = useState<LaunchAdRow[] | null>(null);
  const [stats, setStats] = useState<Record<string, AdStats>>({});
  const [preview, setPreview] = useState<LaunchAdRow | null>(null);
  // قسمين منفصلين: تسويقي (عليه «إعلان») وتوعوي ومناسبات
  const [tab, setTab] = useState<'marketing' | 'awareness'>('marketing');

  const load = useCallback(async () => {
    const admin = await isAdmin();
    setOk(admin);
    if (!admin) return;
    const [r, s] = await Promise.all([listLaunchAds(), launchAdStats()]);
    setRows(r); setStats(s);
  }, []);
  useFocusEffect(useCallback(() => { load().catch(() => setRows([])); }, [load]));

  if (ok === null) return <Loading />;
  if (!ok) return <Screen><Empty icon="lock-closed-outline" text={t('owner.noAccess')} /></Screen>;

  // اللي يظهر الحين للجميع: أعلى أولوية ثم الأحدث بين الفعّالة
  // «زر شوف النادي ← صفحة نادي» بدل الرابط الخام
  const buttonLine = (r: LaunchAdRow) => {
    const tg = parseTarget(r.link);
    const where = tg.target === 'url' ? (r.link ?? '').replace(/^https:\/\//, '').split('/')[0]
      : tg.target === 'page' ? r.link ?? '' : t(`ads.tg_${tg.target}`);
    return t('ads.buttonLine', { cta: r.cta || t('ads.defaultCta'), where });
  };
  const shownRows = (rows ?? []).filter((r) => (tab === 'marketing') === isMarketing(r.kind));
  const winner = (rows ?? []).filter((r) => adState(r) === 'live' && r.audience === 'all')
    .sort((a, b) => b.priority - a.priority || b.created_at.localeCompare(a.created_at))[0]?.id;

  const toggle = async (r: LaunchAdRow, v: boolean) => {
    setRows((cur) => cur?.map((x) => (x.id === r.id ? { ...x, active: v } : x)) ?? null);
    try { await setLaunchAdActive(r.id, v); } catch {
      setRows((cur) => cur?.map((x) => (x.id === r.id ? { ...x, active: !v } : x)) ?? null);
      Alert.alert(t('errors.generic'));
    }
  };
  const remove = (r: LaunchAdRow) => Alert.alert(t('ads.deleteConfirm'), r.title, [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('ads.delete'), style: 'destructive', onPress: async () => { try { await deleteLaunchAd(r); load(); } catch { Alert.alert(t('errors.generic')); } } },
  ]);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('ads.ownerTitle') }} />
      <View style={{ backgroundColor: brand.deepGreen, borderRadius: radius.lg, padding: space.lg, gap: 6 }}>
        <Row gap={8}>
          <Ionicons name="megaphone" size={18} color={brand.amber} />
          <T size="xs" semibold color={brand.amber}>{t('ads.eyebrow')}</T>
        </Row>
        <T size="lg" bold color={brand.cream}>{t('ads.introTitle')}</T>
        <T size="sm" color={brand.sand} style={{ lineHeight: 22 }}>{t('ads.introBody')}</T>
      </View>
      <Segmented<'marketing' | 'awareness'> value={tab} onChange={setTab} options={[
        { value: 'marketing', label: `${t('ads.tab_marketing')} ${(rows ?? []).filter((r) => isMarketing(r.kind)).length || ''}`.trim() },
        { value: 'awareness', label: `${t('ads.tab_awareness')} ${(rows ?? []).filter((r) => !isMarketing(r.kind)).length || ''}`.trim() },
      ]} />
      <T size="xs" muted style={{ lineHeight: 19 }}>{t(`ads.tabHint_${tab}`)}</T>
      <Button icon="add" title={t(tab === 'marketing' ? 'ads.newMarketing' : 'ads.newAwareness')}
        onPress={() => router.push({ pathname: '/owner-ad', params: { kind: tab === 'marketing' ? 'ad' : 'awareness' } })} />

      {!rows ? <Loading /> : !shownRows.length ? <Empty icon="image-outline" text={t(`ads.none_${tab}`)} /> : shownRows.map((r) => {
        const st = adState(r);
        const s = stats[r.id];
        const dates = [r.starts_at ? t('ads.from', { d: fmt(r.starts_at) }) : null, r.ends_at ? t('ads.to', { d: fmt(r.ends_at, true) }) : null].filter(Boolean).join(' ');
        return (
          <Card key={r.id} style={{ gap: space.sm }}>
            <Row style={{ alignItems: 'flex-start' }} gap={space.md}>
              {r.media_type === 'video' ? (
                <View style={{ width: 64, height: 110, borderRadius: 8, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="play-circle" size={30} color={brand.sand} />
                </View>
              ) : (
                <Image source={{ uri: adMediaUrl(r.media_path) }} style={{ width: 64, height: 110, borderRadius: 8, backgroundColor: '#000' }} contentFit="cover" autoplay={false} />
              )}
              <View style={{ flex: 1, gap: 4 }}>
                <Row>
                  <T bold style={{ flex: 1 }} numberOfLines={2}>{r.title}</T>
                  <Switch value={r.active} onValueChange={(v) => toggle(r, v)} trackColor={{ true: brand.orange }} />
                </Row>
                <Row gap={6} style={{ flexWrap: 'wrap' }}>
                  <View style={{ backgroundColor: STATE_COLOR[st], borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <T size="xs" semibold color="#fff">{t(`ads.state_${st}`)}</T>
                  </View>
                  {winner === r.id ? <View style={{ backgroundColor: brand.orange, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><T size="xs" semibold color="#fff">{t('ads.showingNow')}</T></View> : null}
                  <T size="xs" muted>{t(`ads.kind_${r.kind}`)} · {r.media_type === 'gif' ? 'GIF' : r.media_type === 'video' ? t('ads.video') : t('ads.image')} · {t(`ads.aud_${r.audience}`)} · {t(`ads.freq_${r.frequency}`)}</T>
                </Row>
                {dates ? <T size="xs" muted>{dates}</T> : null}
                {r.link ? <T size="xs" muted numberOfLines={1}>{buttonLine(r)}</T> : null}
                <T size="xs" semibold color={colors.primary}>{t('ads.statsLine', { views: s?.views ?? 0, reach: s?.reach ?? 0, clicks: s?.clicks ?? 0, closes: s?.closes ?? 0 })}</T>
              </View>
            </Row>
            <Row gap={space.sm}>
              <Button small style={{ flex: 1 }} variant="secondary" icon="eye-outline" title={t('ads.preview')} onPress={() => setPreview(r)} />
              <Button small style={{ flex: 1 }} variant="secondary" icon="create-outline" title={t('ads.edit')} onPress={() => router.push({ pathname: '/owner-ad', params: { id: r.id } })} />
              <Button small variant="ghost" icon="trash-outline" title="" onPress={() => remove(r)} />
            </Row>
          </Card>
        );
      })}
      <T size="xs" muted style={{ lineHeight: 19 }}>{t('ads.rules')}</T>
      {preview ? <LaunchAdView ad={preview} preview onClose={() => setPreview(null)} /> : null}
    </Screen>
  );
}
