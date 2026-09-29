// إعلان البداية: بطاقة فوق التطبيق أول ما يفتح (صورة أو GIF) مع زر تخطي وعدّاد، و«إعلان» على الإعلانات التسويقية
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
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
  const win = useWindowDimensions();
  const [ratio, setRatio] = useState(0.8);
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

  // بطاقة في نص الشاشة والتطبيق باين وراها معتّم. المقاس يتبع نسبة الصورة (بين 9:16 و 5:4) بحد أقصى ٦٥٪ من طول الشاشة
  const cardW = Math.min(win.width - 56, 360);
  const r = Math.min(1.25, Math.max(0.5625, ratio));
  const imgH = Math.min(cardW / r, win.height * 0.65 - (ad.link ? 72 : 0));

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => close('close')}>
      <Pressable style={styles.backdrop} onPress={() => close('close')} accessibilityRole="button" accessibilityLabel={t('ads.skip')}>
        {preview ? <View style={styles.previewTag}><T size="xs" semibold color={brand.deepGreen}>{t('ads.previewTag')}</T></View> : null}
        {/* الضغط داخل البطاقة ما يقفلها */}
        <Pressable onPress={() => {}} style={[styles.card, { width: cardW }]}>
          <Pressable onPress={ad.link ? open : undefined} disabled={!ad.link} accessibilityRole={ad.link ? 'link' : 'image'} accessibilityLabel={ad.title}>
            <Image source={{ uri: adMediaUrl(ad.media_path) }} style={{ width: cardW, height: imgH }} contentFit="cover" autoplay transition={150}
              onLoad={(e) => { const w = e.source?.width, h = e.source?.height; if (w && h) setRatio(w / h); }} />
          </Pressable>
          <View style={styles.top} pointerEvents="box-none">
            {ad.kind === 'ad' ? <View style={styles.label}><T size="xs" semibold color="#fff">{t('ads.label')}</T></View> : <View />}
            <Pressable onPress={() => close('close')} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('ads.skip')} style={styles.skip}>
              <T size="xs" semibold color="#fff">{ad.auto_close && left > 0 ? t('ads.skipIn', { n: left }) : t('ads.skip')}</T>
              <Ionicons name="close" size={16} color="#fff" />
            </Pressable>
          </View>
          {ad.link ? (
            <View style={{ padding: 12 }}>
              <Button small icon={ad.link.startsWith('/') ? 'sparkles-outline' : 'open-outline'} title={ad.cta || t('ads.defaultCta')} onPress={open} />
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(6,24,21,0.62)', alignItems: 'center', justifyContent: 'center', gap: 12 },
  card: { borderRadius: 24, overflow: 'hidden', backgroundColor: brand.deepGreen, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
  top: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  skip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  previewTag: { backgroundColor: brand.amber, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
});
