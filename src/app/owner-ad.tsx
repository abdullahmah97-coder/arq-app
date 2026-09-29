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
import { isoToRiyadhDate, riyadhDateToIso, validAdLink, type AdAudience, type AdFrequency, type AdKind } from '@/lib/launchAdsCore';
import { brand, colors, radius, space } from '@/theme';

const QUICK_LINKS = ['/store', '/clubs', '/coaches', '/recovery', '/partners'] as const;
const QUICK_LABEL: Record<(typeof QUICK_LINKS)[number], string> = {
  '/store': 'store.title', '/clubs': 'clubs.title', '/coaches': 'coaching.directory', '/recovery': 'recovery.title', '/partners': 'partners.hubName',
};

export default function OwnerAdEdit() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [loading, setLoading] = useState(!!id);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<AdKind>('ad');
  const [media, setMedia] = useState<{ path: string; type: AdMediaType } | null>(null);
  const [link, setLink] = useState('');
  const [cta, setCta] = useState('');
  const [audience, setAudience] = useState<AdAudience>('all');
  const [starts, setStarts] = useState('');
  const [ends, setEnds] = useState('');
  const [frequency, setFrequency] = useState<AdFrequency>('daily');
  const [autoClose, setAutoClose] = useState(6);
  const [pinned, setPinned] = useState(false);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!id) return;
    loadLaunchAd(id).then((a) => {
      if (a) {
        setTitle(a.title); setKind(a.kind); setMedia({ path: a.media_path, type: a.media_type });
        setLink(a.link ?? ''); setCta(a.cta ?? ''); setAudience(a.audience);
        setStarts(isoToRiyadhDate(a.starts_at)); setEnds(isoToRiyadhDate(a.ends_at, true));
        setFrequency(a.frequency); setAutoClose(a.auto_close); setPinned(a.priority > 0); setActive(a.active);
      }
    }).finally(() => setLoading(false));
  }, [id]);

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
    if (!validAdLink(link)) { Alert.alert(t('ads.err_link')); return null; }
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
        <Segmented<AdKind> value={kind} onChange={setKind} options={[{ value: 'ad', label: t('ads.kind_ad') }, { value: 'occasion', label: t('ads.kind_occasion') }]} />
        <T size="xs" muted style={{ lineHeight: 18 }}>{t(`ads.kindHint_${kind}`)}</T>
      </Card>

      <Card style={{ gap: space.sm }}>
        <Input label={t('ads.link')} hint={t('ads.linkHint')} value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} placeholder="/store" />
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          {QUICK_LINKS.map((l) => (
            <Pressable key={l} onPress={() => setLink(l)} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: link === l ? brand.orange : colors.cardAlt }}>
              <T size="xs" semibold color={link === l ? '#fff' : colors.text}>{t(QUICK_LABEL[l])}</T>
            </Pressable>
          ))}
        </Row>
        {link.trim() ? <Input label={t('ads.cta')} value={cta} onChangeText={setCta} maxLength={30} placeholder={t('ads.defaultCta')} /> : null}
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
