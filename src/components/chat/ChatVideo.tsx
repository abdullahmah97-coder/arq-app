// فيديو المحادثة: معاينة داخل الفقاعة (أول لقطة، بدون صوت) وعرض كامل بأزرار التشغيل
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { T } from '@/components/ui';
import { brand, space } from '@/theme';

/** مقاس الفقاعة: عرض ثابت والارتفاع حسب نسبة الفيديو (بحدود) */
export function videoSize(w?: number | null, h?: number | null) {
  const W = 230;
  const ratio = w && h ? h / w : 16 / 9;
  return { width: W, height: Math.round(Math.min(320, Math.max(140, W * ratio))) };
}

export const fmtDur = (s?: number | null) => {
  if (s == null || !isFinite(s)) return '';
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

function Preview({ uri, style }: { uri: string; style: { width: number; height: number } }) {
  // لاعب صامت ما يشتغل: يعرض أول لقطة بس
  const player = useVideoPlayer(uri, (p) => { p.muted = true; p.loop = false; });
  return <VideoView player={player} style={style} contentFit="cover" nativeControls={false} pointerEvents="none" />;
}

export function VideoBubble({ uri, width, height, duration, uploading, onOpen }: {
  uri?: string; width?: number | null; height?: number | null; duration?: number | null; uploading?: boolean; onOpen?: () => void;
}) {
  const { t } = useTranslation();
  const size = videoSize(width, height);
  return (
    <Pressable onPress={() => uri && !uploading && onOpen?.()} accessibilityRole="button" accessibilityLabel={t('chat.video')}
      style={{ borderRadius: 18, overflow: 'hidden', backgroundColor: brand.deepGreen, ...size }}>
      {uri && !uploading ? <Preview uri={uri} style={size} /> : null}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,51,45,0.25)' }}>
        {uploading || !uri ? <ActivityIndicator color={brand.cream} /> : (
          <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(248,237,218,0.92)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="play" size={26} color={brand.deepGreen} style={{ marginLeft: 3 }} />
          </View>
        )}
      </View>
      {duration ? (
        <View style={{ position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Ionicons name="videocam" size={12} color="#fff" />
          <T size="xs" color="#fff" style={{ fontSize: 11 }}>{fmtDur(duration)}</T>
        </View>
      ) : null}
    </Pressable>
  );
}

function FullPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = false; p.play(); });
  return <VideoView player={player} style={{ width: '100%', height: '100%' }} contentFit="contain" nativeControls allowsPictureInPicture={false} />;
}

/** عرض الفيديو كامل الشاشة */
export function VideoViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal visible={!!uri} animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {uri ? <FullPlayer uri={uri} /> : null}
        <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, right: 0, left: 0 }}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('common.close')}
            style={{ alignSelf: 'flex-end', margin: space.lg, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
