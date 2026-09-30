// فيديو المحادثة: معاينة داخل الفقاعة (أول لقطة، بدون صوت) وعرض كامل بأزرار التشغيل
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { T } from '@/components/ui';
import { brand, space } from '@/theme';

/** مقاس الفيديو في الفقاعة: عرض ثابت والارتفاع حسب نسبة الفيديو (بحدود) */
export function videoSize(w?: number | null, h?: number | null) {
  const W = 240;
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

/** معاينة الفيديو داخل الفقاعة: أول لقطة وزر تشغيل ومدته (الضغط على الفقاعة نفسها) */
export function VideoThumb({ uri, width, height, duration, uploading }: {
  uri?: string; width?: number | null; height?: number | null; duration?: number | null; uploading?: boolean;
}) {
  const size = videoSize(width, height);
  return (
    <View style={{ backgroundColor: brand.deepGreen, ...size }}>
      {uri && !uploading ? <Preview uri={uri} style={size} /> : null}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,51,45,0.2)' }}>
        {uploading || !uri ? <ActivityIndicator color={brand.cream} /> : (
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="play" size={26} color="#fff" style={{ marginLeft: 3 }} />
          </View>
        )}
      </View>
      {duration ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 8, start: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Ionicons name="videocam" size={12} color="#fff" />
          <T size="xs" color="#fff" style={{ fontSize: 11 }}>{fmtDur(duration)}</T>
        </View>
      ) : null}
    </View>
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
