// إعلان البداية: صفحة كاملة أول ما يفتح التطبيق (صورة أو GIF) مع زر تخطي وعدّاد، و«إعلان» على الإعلانات التسويقية
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, T } from '@/components/ui';
import { adMediaUrl, launchAdEvent, launchAdToShow, markAdShown, type LaunchAd } from '@/lib/launchAds';
import { brand } from '@/theme';

/** مرة وحدة لكل تشغيل للتطبيق */
let checkedThisLaunch = false;

/** أي خطأ في الإعلان يختفي بصمت بدل ما يأثر على التطبيق */
class Silent extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

export function LaunchAdGate() {
  return <Silent><Gate /></Silent>;
}

/** يجيب الإعلان الحالي بعد ما تفتح الرئيسية، ويعرضه بعد ما تتحمّل الصورة (عشان ما تطلع شاشة فاضية) */
function Gate() {
  const [ad, setAd] = useState<LaunchAd | null>(null);
  useEffect(() => {
    if (checkedThisLaunch) return;
    checkedThisLaunch = true;
    let dead = false;
    const timer = setTimeout(async () => {
      const a = await launchAdToShow().catch(() => null);
      const url = a ? adMediaUrl(a.media_path) : undefined;
      if (!a || !url || dead) return;
      // ننتظر الصورة ٤ ثواني بالكثير؛ لو ما تحمّلت نتركها للمرة الجاية
      const loaded = await Promise.race([Image.prefetch(url).catch(() => false), new Promise<boolean>((r) => setTimeout(() => r(false), 4000))]);
      if (!loaded || dead) return;
      setAd(a);
    }, 700);
    return () => { dead = true; clearTimeout(timer); };
  }, []);
  if (!ad) return null;
  return <LaunchAdView ad={ad} onClose={() => setAd(null)} />;
}

/** العرض نفسه. preview: معاينة المالك (بدون تسجيل أرقام) */
export function LaunchAdView({ ad, onClose, preview }: { ad: Pick<LaunchAd, 'id' | 'kind' | 'title' | 'media_path' | 'link' | 'cta' | 'auto_close'> & Partial<LaunchAd>; onClose: () => void; preview?: boolean }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [left, setLeft] = useState(ad.auto_close);
  const done = useRef(false);

  useEffect(() => {
    if (preview) return;
    launchAdEvent(ad.id, 'view');
    if (ad.frequency) markAdShown(ad as LaunchAd);
  }, [ad, preview]);

  const close = (kind: 'close' | 'auto') => {
    if (done.current) return;
    done.current = true;
    if (!preview && kind === 'close') launchAdEvent(ad.id, 'close');
    onClose();
  };

  useEffect(() => {
    if (!ad.auto_close) return;
    const iv = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(iv);
  }, [ad.auto_close]);
  useEffect(() => { if (ad.auto_close && left <= 0) close('auto'); });

  const open = () => {
    if (!ad.link || done.current) return;
    done.current = true;
    if (!preview) launchAdEvent(ad.id, 'click');
    onClose();
    if (ad.link.startsWith('/')) setTimeout(() => router.push(ad.link as never), 250);
    else Linking.openURL(ad.link).catch(() => {});
  };

  return (
    <Modal visible transparent={false} animationType="fade" statusBarTranslucent onRequestClose={() => close('close')}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={ad.link ? open : undefined} disabled={!ad.link}
          accessibilityRole={ad.link ? 'link' : 'image'} accessibilityLabel={ad.title}>
          <Image source={{ uri: adMediaUrl(ad.media_path) }} style={StyleSheet.absoluteFill} contentFit="contain" autoplay transition={150} />
        </Pressable>

        <View style={[styles.top, { top: insets.top + 10 }]} pointerEvents="box-none">
          {ad.kind === 'ad' ? (
            <View style={styles.label}><T size="xs" semibold color="#fff">{t('ads.label')}</T></View>
          ) : <View />}
          <Pressable onPress={() => close('close')} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('ads.skip')} style={styles.skip}>
            <T size="sm" semibold color="#fff">{ad.auto_close && left > 0 ? t('ads.skipIn', { n: left }) : t('ads.skip')}</T>
            <Ionicons name="close" size={18} color="#fff" />
          </Pressable>
        </View>

        {ad.link ? (
          <View style={[styles.bottom, { bottom: insets.bottom + 20 }]}>
            <Button icon={ad.link.startsWith('/') ? 'sparkles-outline' : 'open-outline'} title={ad.cta || t('ads.defaultCta')} onPress={open} />
          </View>
        ) : null}
        {preview ? <View style={[styles.previewTag, { bottom: insets.bottom + (ad.link ? 86 : 20) }]}><T size="xs" semibold color={brand.deepGreen}>{t('ads.previewTag')}</T></View> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  skip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  bottom: { position: 'absolute', left: 24, right: 24 },
  previewTag: { position: 'absolute', alignSelf: 'center', backgroundColor: brand.amber, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
});
