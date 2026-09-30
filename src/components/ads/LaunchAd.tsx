// إعلان البداية: بطاقة فوق التطبيق أول ما يفتح (صورة أو GIF أو فيديو قصير) مع زر تخطي وعدّاد، و«إعلان» على الإعلانات التسويقية.
// الفيديو يشتغل بدون صوت وفيه زر للصوت، ويقفل لحاله بعد ما يخلص لو «يقفل تلقائياً» مفعّل.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Button, T } from '@/components/ui';
import { adMediaUrl, launchAdEvent, launchAdToShow, markAdShown, type AdMediaType, type LaunchAd } from '@/lib/launchAds';
import { brand } from '@/theme';

/** مرة وحدة لكل تشغيل للتطبيق */
let checkedThisLaunch = false;
/** كم ننتظر الفيديو يجهز قبل ما نتركه للمرة الجاية */
const VIDEO_WAIT_MS = 6000;

/** أي خطأ في الإعلان يختفي بصمت بدل ما يأثر على التطبيق */
class Silent extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

export function LaunchAdGate() {
  return <Silent><Gate /></Silent>;
}

/** يجيب الإعلان الحالي بعد ما تفتح الرئيسية، ويعرضه بعد ما يتحمّل الملف (عشان ما تطلع شاشة فاضية) */
function Gate() {
  const [ad, setAd] = useState<LaunchAd | null>(null);
  const done = useCallback(() => setAd(null), []);
  useEffect(() => {
    if (checkedThisLaunch) return;
    checkedThisLaunch = true;
    let dead = false;
    const timer = setTimeout(async () => {
      const a = await launchAdToShow().catch(() => null);
      const url = a ? adMediaUrl(a.media_path) : undefined;
      if (!a || !url || dead) return;
      // الفيديو يتجهّز في VideoGate ويطلع أول ما يكون جاهز
      if (a.media_type === 'video') { setAd(a); return; }
      // ننتظر الصورة ٤ ثواني بالكثير؛ لو ما تحمّلت نتركها للمرة الجاية
      const loaded = await Promise.race([Image.prefetch(url).catch(() => false), new Promise<boolean>((r) => setTimeout(() => r(false), 4000))]);
      if (!loaded || dead) return;
      setAd(a);
    }, 700);
    return () => { dead = true; clearTimeout(timer); };
  }, []);
  if (!ad) return null;
  if (ad.media_type === 'video') return <VideoGate ad={ad} onDone={done} />;
  return <LaunchAdView ad={ad} onClose={done} />;
}

/** فيديو البداية: نجهّز المشغّل قبل ما تطلع البطاقة، ولو ما جهز خلال ٦ ثواني (أو فشل) نتركه للمرة الجاية */
function VideoGate({ ad, onDone }: { ad: LaunchAd; onDone: () => void }) {
  const player = useVideoPlayer(adMediaUrl(ad.media_path) ?? null, (p) => { p.muted = true; p.loop = false; });
  // (الويب ما يحمّل الفيديو إلا لما ينعرض، فيطلع على طول)
  const [ready, setReady] = useState(() => Platform.OS === 'web' || player.status === 'readyToPlay');
  useEffect(() => {
    if (ready) return;
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') setReady(true);
      else if (status === 'error') onDone();
    });
    const timer = setTimeout(onDone, VIDEO_WAIT_MS);
    return () => { sub.remove(); clearTimeout(timer); };
  }, [player, ready, onDone]);
  if (!ready) return null;
  return <LaunchAdView ad={ad} player={player} onClose={onDone} />;
}

// تغيير خصائص المشغّل (برا المكوّن)
const setMuted = (p: VideoPlayer, v: boolean) => { p.muted = v; };
const startPlayback = (p: VideoPlayer) => { p.muted = true; p.timeUpdateEventInterval = 0.5; p.play(); };
const stopPlayback = (p: VideoPlayer) => { try { p.pause(); } catch { /* المشغّل انقفل */ } };

type VideoProps = { width: number; height: number; onRatio: (r: number) => void; onRemain: (s: number) => void; onEnd: () => void };

/** الفيديو داخل البطاقة: يشتغل بدون صوت، زر للصوت، ويبلّغ بمقاسه والوقت الباقي ونهايته */
function AdVideo({ player, width, height, onRatio, onRemain, onEnd }: VideoProps & { player: VideoPlayer }) {
  const { t } = useTranslation();
  const [muted, setMutedState] = useState(true);
  // آخر نسخة من الدوال (بدون ما نعيد تشغيل الفيديو كل ما تتغير)
  const cb = useRef({ onRatio, onRemain, onEnd });
  useEffect(() => { cb.current = { onRatio, onRemain, onEnd }; });
  useEffect(() => {
    const size = player.videoTrack?.size;
    if (size?.width && size.height) cb.current.onRatio(size.width / size.height);
    const subs = [
      player.addListener('videoTrackChange', ({ videoTrack }) => {
        const s = videoTrack?.size;
        if (s?.width && s.height) cb.current.onRatio(s.width / s.height);
      }),
      player.addListener('timeUpdate', ({ currentTime }) => {
        if (player.duration > 0) cb.current.onRemain(Math.max(0, Math.ceil(player.duration - currentTime)));
      }),
      player.addListener('playToEnd', () => cb.current.onEnd()),
    ];
    startPlayback(player);
    return () => { subs.forEach((s) => s.remove()); stopPlayback(player); };
  }, [player]);
  const toggle = () => { const next = !muted; setMuted(player, next); setMutedState(next); };
  return (
    <View style={{ width, height, backgroundColor: '#000' }}>
      <VideoView player={player} style={{ width, height }} contentFit="cover" nativeControls={false}
        allowsPictureInPicture={false} fullscreenOptions={{ enable: false }}
        // أندرويد: textureView عشان الزوايا الدائرية تقص الفيديو
        surfaceType={Platform.OS === 'android' ? 'textureView' : undefined} />
      <Pressable onPress={toggle} hitSlop={10} accessibilityRole="button" accessibilityLabel={muted ? t('ads.soundOn') : t('ads.soundOff')}
        style={styles.sound}>
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color="#fff" />
      </Pressable>
    </View>
  );
}

/** معاينة المالك: مشغّل خاص فيها */
function OwnAdVideo({ uri, ...rest }: VideoProps & { uri: string }) {
  const player = useVideoPlayer(uri, (p) => { p.muted = true; p.loop = false; });
  return <AdVideo player={player} {...rest} />;
}

type AdViewData = Pick<LaunchAd, 'id' | 'kind' | 'title' | 'media_path' | 'link' | 'cta' | 'auto_close'> & Partial<LaunchAd> & { media_type?: AdMediaType };

/** العرض نفسه. preview: معاينة المالك (بدون تسجيل أرقام). player: فيديو جاهز من VideoGate */
export function LaunchAdView({ ad, onClose, preview, player }: { ad: AdViewData; onClose: () => void; preview?: boolean; player?: VideoPlayer }) {
  const { t } = useTranslation();
  const win = useWindowDimensions();
  const video = ad.media_type === 'video';
  const [ratio, setRatio] = useState(video ? 9 / 16 : 0.8);
  const [left, setLeft] = useState(ad.auto_close);
  const [remain, setRemain] = useState(0);
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

  // الصور: عدّاد بالثواني. الفيديو: يقفل لما يخلص (لو «يقفل تلقائياً» مفعّل)
  useEffect(() => {
    if (!ad.auto_close || video) return;
    const iv = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(iv);
  }, [ad.auto_close, video]);
  useEffect(() => { if (!video && ad.auto_close && left <= 0) close('auto'); });
  const onEnd = () => { if (ad.auto_close) close('auto'); };

  const open = () => {
    if (!ad.link || done.current) return;
    done.current = true;
    if (!preview) launchAdEvent(ad.id, 'click');
    onClose();
    if (ad.link.startsWith('/')) setTimeout(() => router.push(ad.link as never), 250);
    else Linking.openURL(ad.link).catch(() => {});
  };

  // بطاقة في نص الشاشة والتطبيق باين وراها معتّم. المقاس يتبع نسبة الملف (بين 9:16 و 5:4) بحد أقصى ٦٥٪ من طول الشاشة
  const cardW = Math.min(win.width - 56, 360);
  const r = Math.min(1.25, Math.max(0.5625, ratio));
  const imgH = Math.min(cardW / r, win.height * 0.65 - (ad.link ? 72 : 0));
  const url = adMediaUrl(ad.media_path);
  const countdown = video ? (ad.auto_close && remain > 0 ? remain : 0) : (ad.auto_close && left > 0 ? left : 0);

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => close('close')}>
      <Pressable style={styles.backdrop} onPress={() => close('close')} accessibilityRole="button" accessibilityLabel={t('ads.skip')}>
        {preview ? <View style={styles.previewTag}><T size="xs" semibold color={brand.deepGreen}>{t('ads.previewTag')}</T></View> : null}
        {/* الضغط داخل البطاقة ما يقفلها */}
        <Pressable onPress={() => {}} style={[styles.card, { width: cardW }]}>
          <Pressable onPress={ad.link ? open : undefined} disabled={!ad.link} accessibilityRole={ad.link ? 'link' : 'image'} accessibilityLabel={ad.title}>
            {video ? (
              player ? <AdVideo player={player} width={cardW} height={imgH} onRatio={setRatio} onRemain={setRemain} onEnd={onEnd} />
                : url ? <OwnAdVideo uri={url} width={cardW} height={imgH} onRatio={setRatio} onRemain={setRemain} onEnd={onEnd} /> : null
            ) : (
              <Image source={{ uri: url }} style={{ width: cardW, height: imgH }} contentFit="cover" autoplay transition={150}
                onLoad={(e) => { const w = e.source?.width, h = e.source?.height; if (w && h) setRatio(w / h); }} />
            )}
          </Pressable>
          <View style={styles.top} pointerEvents="box-none">
            {ad.kind === 'ad' ? <View style={styles.label}><T size="xs" semibold color="#fff">{t('ads.label')}</T></View> : <View />}
            <Pressable onPress={() => close('close')} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('ads.skip')} style={styles.skip}>
              <T size="xs" semibold color="#fff">{countdown ? t('ads.skipIn', { n: countdown }) : t('ads.skip')}</T>
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
  sound: { position: 'absolute', bottom: 10, start: 10, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  previewTag: { backgroundColor: brand.amber, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
});
