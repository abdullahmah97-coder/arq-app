// لوحة المالك ← إضافة أو تعديل إعلان البداية: صورة أو GIF، رابط وزر، الجمهور، المدة، وعدد مرات الظهور
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Switch, View } from 'react-native';
import { LaunchAdView } from '@/components/ads/LaunchAd';
import { Button, Card, Input, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { AD_MAX_BYTES, adMediaUrl, deleteLaunchAd, loadLaunchAd, saveLaunchAd, uploadAdMedia, type AdMediaType } from '@/lib/launchAds';
import {
  AD_TARGETS, isoToRiyadhDate, parseTarget, riyadhDateToIso, targetLink, validAdLink,
  type AdAudience, type AdFrequency, type AdKind, type AdPartnerTarget, type AdTarget,
} from '@/lib/launchAdsCore';
import { listPartners, statusGroup, type PartnerRow } from '@/lib/partners';
import { brand, colors, radius, space } from '@/theme';

const QUICK_LINKS = ['/store', '/clubs', '/coaches', '/recovery', '/partners'] as const;
const PARTNER_TARGETS: AdPartnerTarget[] = ['store', 'club', 'coach', 'center'];
const isPartner = (t: AdTarget): t is AdPartnerTarget => (PARTNER_TARGETS as string[]).includes(t);
const TARGET_ICON: Record<AdTarget, keyof typeof Ionicons.glyphMap> = {
  none: 'remove-circle-outline', store: 'storefront-outline', club: 'business-outline', coach: 'person-outline', center: 'medkit-outline', page: 'apps-outline', url: 'link-outline',
};
const QUICK_LABEL: Record<(typeof QUICK_LINKS)[number], string> = {
  '/store': 'store.title', '/clubs': 'clubs.title', '/coaches': 'coaching.directory', '/recovery': 'recovery.title', '/partners': 'partners.hubName',
};

export default function OwnerAdEdit() {
  const { t } = useTranslation();
  const { id, kind: kindParam } = useLocalSearchParams<{ id?: string; kind?: AdKind }>();
  const [loading, setLoading] = useState(!!id);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<AdKind>(kindParam === 'awareness' || kindParam === 'occasion' ? kindParam : 'ad');
  const [media, setMedia] = useState<{ path: string; type: AdMediaType } | null>(null);
  const [link, setLink] = useState('');
  const [cta, setCta] = useState('');
  const [audience, setAudience] = useState<AdAudience>('all');
  const [starts, setStarts] = useState('');
  const [ends, setEnds] = useState('');
  const [frequency, setFrequency] = useState<AdFrequency>('daily');
  const [autoClose, setAutoClose] = useState(6);
  const [pinned, setPinned] = useState(false);
  // زر الإعلان: نوع الوجهة + الصفحة المختارة
  const [target, setTarget] = useState<AdTarget>('none');
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PartnerRow[] | null>(null);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!id) return;
    loadLaunchAd(id).then((a) => {
      if (a) {
        setTitle(a.title); setKind(a.kind); setMedia({ path: a.media_path, type: a.media_type });
        setLink(a.link ?? ''); setCta(a.cta ?? ''); setAudience(a.audience);
        setStarts(isoToRiyadhDate(a.starts_at)); setEnds(isoToRiyadhDate(a.ends_at, true));
        setFrequency(a.frequency); setAutoClose(a.auto_close); setPinned(a.priority > 0); setActive(a.active);
        const pt = parseTarget(a.link);
        setTarget(pt.target);
        if (pt.id && isPartner(pt.target)) {
          listPartners(pt.target).then((rows) => {
            const r = rows.find((x) => x.id === pt.id);
            if (r) setPicked({ id: r.id, name: r.name });
          }).catch(() => {});
        }
      }
    }).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!isPartner(target)) return;
    let dead = false;
    const h = setTimeout(() => {
      listPartners(target, q).then((rows) => { if (!dead) setResults(rows.filter((r) => statusGroup(r.status) === 'live').slice(0, 8)); })
        .catch(() => { if (!dead) setResults([]); });
    }, 250);
    return () => { dead = true; clearTimeout(h); };
  }, [target, q]);

  const chooseTarget = (tg: AdTarget) => {
    setTarget(tg); setPicked(null); setQ(''); setResults(null);
    if (tg === 'none') { setLink(''); setCta(''); }
    else if (tg === 'url') setLink((l) => (l.startsWith('https://') ? l : 'https://'));
    else if (tg === 'page') setLink((l) => (QUICK_LINKS.includes(l as never) ? l : '/store'));
    else setLink('');
  };
  const choosePartner = (r: PartnerRow) => {
    if (!isPartner(target)) return;
    setPicked({ id: r.id, name: r.name });
    setLink(targetLink(target, r.id));
    const key = target === 'store' && r.meta?.category === 'restaurant' ? 'restaurant' : target;
    setCta((c) => c.trim() || t(`ads.cta_${key}`));
  };

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    // الجودة ١ وبدون قص: عشان الـGIF يبقى متحرك
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false });
    const a = res.canceled ? null : res.assets?.[0];
    if (!a) return;
    const mime = a.mimeType ?? (a.uri.toLowerCase().endsWith('.gif') ? 'image/gif' : 'image/jpeg');
    const type: AdMediaType = mime.includes('gif') ? 'gif' : 'image';
    if (a.fileSize && a.fileSize > AD_MAX_BYTES[type]) return Alert.alert(t('ads.tooBig', { mb: AD_MAX_BYTES[type] / 1024 / 1024 }));
    setBusy(true);
    try { const up = await uploadAdMedia(a.uri, mime); setMedia({ path: up.path, type: up.media_type }); }
    catch (e) { Alert.alert(String((e as Error)?.message) === 'file_too_big' ? t('ads.tooBig', { mb: AD_MAX_BYTES[type] / 1024 / 1024 }) : t('errors.generic')); }
    finally { setBusy(false); }
  };

  const draft = () => {
    if (!media) { Alert.alert(t('ads.err_media')); return null; }
    if (title.trim().length < 2) { Alert.alert(t('ads.err_title')); return null; }
    if (isPartner(target) && !picked) { Alert.alert(t('ads.err_target')); return null; }
    if (!validAdLink(link) || (target === 'url' && link.trim() === 'https://')) { Alert.alert(t('ads.err_link')); return null; }
    const s = riyadhDateToIso(starts); const e = riyadhDateToIso(ends, true);
    if (s === undefined || e === undefined) { Alert.alert(t('ads.err_date')); return null; }
    if (s && e && e <= s) { Alert.alert(t('ads.err_range')); return null; }
    return {
      title, kind, media_path: media.path, media_type: media.type, link: link.trim() || null, cta: cta.trim() || null,
      audience, starts_at: s, ends_at: e, frequency, auto_close: autoClose, priority: pinned ? 10 : 0, active,
    };
  };

  const save = async () => {
    const d = draft();
    if (!d) return;
    setBusy(true);
    try { await saveLaunchAd(d, id); router.back(); } catch { Alert.alert(t('errors.generic')); } finally { setBusy(false); }
  };
  const remove = () => Alert.alert(t('ads.deleteConfirm'), title, [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('ads.delete'), style: 'destructive', onPress: async () => {
      if (!id || !media) return;
      try { await deleteLaunchAd({ id, media_path: media.path }); router.back(); } catch { Alert.alert(t('errors.generic')); }
    } },
  ]);

  if (loading) return <Loading />;
  const url = adMediaUrl(media?.path);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: id ? t('ads.editTitle') : t('ads.new') }} />

      {/* الملف */}
      <Card style={{ gap: space.sm }}>
        <T semibold>{t('ads.media')}</T>
        <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
          <Pressable onPress={pick} disabled={busy} accessibilityRole="button" accessibilityLabel={t('ads.pick')}
            style={{ width: 108, height: 192, borderRadius: radius.md, backgroundColor: '#000', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            {url ? <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} contentFit="contain" autoplay />
              : <Ionicons name="image-outline" size={34} color={brand.sand} />}
          </Pressable>
          <View style={{ flex: 1, gap: 6 }}>
            <Button small icon="images-outline" title={media ? t('ads.change') : t('ads.pick')} loading={busy} onPress={pick} />
            <T size="xs" muted style={{ lineHeight: 18 }}>{t('ads.mediaHint')}</T>
            <Row gap={6} style={{ opacity: 0.55 }}>
              <Ionicons name="videocam-outline" size={16} color={colors.muted} />
              <T size="xs" muted style={{ flex: 1 }}>{t('ads.videoSoon')}</T>
            </Row>
          </View>
        </Row>
      </Card>

      <Card style={{ gap: space.sm }}>
        <Input label={t('ads.titleLabel')} hint={t('ads.titleHint')} value={title} onChangeText={setTitle} maxLength={80} placeholder={t('ads.titlePh')} />
        <T size="sm" semibold>{t('ads.kind')}</T>
        <Segmented<AdKind> value={kind} onChange={setKind} options={(['ad', 'awareness', 'occasion'] as const).map((k) => ({ value: k, label: t(`ads.kind_${k}`) }))} />
        <T size="xs" muted style={{ lineHeight: 18 }}>{t(`ads.kindHint_${kind}`)}</T>
      </Card>

      {/* زر الإعلان: يودّي لصفحة نادي أو متجر أو مدرب أو مركز، أو قسم، أو رابط */}
      <Card style={{ gap: space.sm }}>
        <T semibold>{t('ads.button')}</T>
        <T size="xs" muted style={{ lineHeight: 18 }}>{t('ads.buttonHint')}</T>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          {AD_TARGETS.map((tg) => (
            <Pressable key={tg} onPress={() => chooseTarget(tg)} accessibilityRole="button" accessibilityState={{ selected: target === tg }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: target === tg ? brand.deepGreen : colors.cardAlt }}>
              <Ionicons name={TARGET_ICON[tg]} size={14} color={target === tg ? brand.cream : colors.text} />
              <T size="xs" semibold color={target === tg ? brand.cream : colors.text}>{t(`ads.tg_${tg}`)}</T>
            </Pressable>
          ))}
        </Row>

        {isPartner(target) ? (
          <View style={{ gap: 6 }}>
            {picked ? (
              <Row style={{ backgroundColor: 'rgba(241,85,29,0.1)', borderRadius: radius.md, padding: 10 }}>
                <Ionicons name="checkmark-circle" size={18} color={brand.orange} />
                <T size="sm" semibold style={{ flex: 1 }}>{t('ads.goesTo', { name: picked.name })}</T>
                <Pressable onPress={() => { setPicked(null); setLink(''); }} hitSlop={8}><T size="xs" semibold color={brand.orange}>{t('ads.changeTarget')}</T></Pressable>
              </Row>
            ) : (
              <>
                <Input value={q} onChangeText={setQ} placeholder={t('ads.searchTarget')} autoCorrect={false} />
                {results === null ? <Loading /> : results.length ? results.map((r) => (
                  <Pressable key={r.id} onPress={() => choosePartner(r)} accessibilityRole="button"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
                    <Ionicons name={TARGET_ICON[target]} size={18} color={brand.orange} />
                    <View style={{ flex: 1 }}>
                      <T size="sm" semibold numberOfLines={1}>{r.name}</T>
                      {r.subtitle ? <T size="xs" muted numberOfLines={1}>{r.subtitle}</T> : null}
                    </View>
                    {r.partner ? <T size="xs" semibold color={brand.orange}>{t('partners.st_partner')}</T> : null}
                  </Pressable>
                )) : <T size="xs" muted>{t('ads.noTargets')}</T>}
              </>
            )}
          </View>
        ) : null}

        {target === 'page' ? (
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {QUICK_LINKS.map((l) => (
              <Pressable key={l} onPress={() => setLink(l)} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: link === l ? brand.orange : colors.cardAlt }}>
                <T size="xs" semibold color={link === l ? '#fff' : colors.text}>{t(QUICK_LABEL[l])}</T>
              </Pressable>
            ))}
          </Row>
        ) : null}
        {target === 'url' ? <Input label={t('ads.link')} hint={t('ads.linkHint')} value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://" /> : null}
        {target !== 'none' ? <Input label={t('ads.cta')} value={cta} onChangeText={setCta} maxLength={30} placeholder={t('ads.defaultCta')} /> : null}
      </Card>

      <Card style={{ gap: space.sm }}>
        <T size="sm" semibold>{t('ads.audience')}</T>
        <Segmented<AdAudience> value={audience} onChange={setAudience} options={(['all', 'men', 'women'] as const).map((a) => ({ value: a, label: t(`ads.aud_${a}`) }))} />
        <Row gap={space.sm}>
          <View style={{ flex: 1 }}><Input label={t('ads.starts')} value={starts} onChangeText={setStarts} placeholder="2026-09-23" keyboardType="numbers-and-punctuation" /></View>
          <View style={{ flex: 1 }}><Input label={t('ads.ends')} value={ends} onChangeText={setEnds} placeholder="2026-09-24" keyboardType="numbers-and-punctuation" /></View>
        </Row>
        <T size="xs" muted>{t('ads.datesHint')}</T>
        <T size="sm" semibold>{t('ads.frequency')}</T>
        <Segmented<AdFrequency> wrap value={frequency} onChange={setFrequency} options={(['every_open', 'daily', 'once'] as const).map((f) => ({ value: f, label: t(`ads.freq_${f}`) }))} />
        <T size="sm" semibold>{t('ads.autoClose')}</T>
        <Segmented<number> value={autoClose} onChange={setAutoClose} options={[0, 4, 6, 10].map((n) => ({ value: n, label: n ? t('ads.seconds', { n }) : t('ads.manual') }))} />
        <Row>
          <View style={{ flex: 1 }}><T semibold>{t('ads.pinned')}</T><T size="xs" muted>{t('ads.pinnedHint')}</T></View>
          <Switch value={pinned} onValueChange={setPinned} trackColor={{ true: brand.orange }} />
        </Row>
        <Row>
          <View style={{ flex: 1 }}><T semibold>{t('ads.activeLabel')}</T><T size="xs" muted>{t('ads.activeHint')}</T></View>
          <Switch value={active} onValueChange={setActive} trackColor={{ true: brand.orange }} />
        </Row>
      </Card>

      <Row gap={space.sm}>
        <Button style={{ flex: 1 }} variant="secondary" icon="eye-outline" title={t('ads.preview')} onPress={() => { if (draft()) setPreview(true); }} />
        <Button style={{ flex: 1 }} icon="checkmark" title={t('common.save')} loading={busy} onPress={save} />
      </Row>
      {id ? <Button variant="ghost" icon="trash-outline" title={t('ads.delete')} onPress={remove} /> : null}

      {preview && media ? (
        <LaunchAdView preview onClose={() => setPreview(false)}
          ad={{ id: id ?? 'preview', kind, title, media_path: media.path, link: link.trim() || null, cta: cta.trim() || null, auto_close: autoClose }} />
      ) : null}
    </Screen>
  );
}
