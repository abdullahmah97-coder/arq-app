// صور التمرين الحقيقية: بداية الحركة ونهايتها تتبدّل تلقائياً (مثل صورة متحركة) + صورة مصغّرة للقوائم
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { T } from '@/components/ui';
import { publicUrl } from '@/lib/supabase';
import { brand, colors, radius } from '@/theme';

export const exercisePhotoUrl = (path: string) => publicUrl('exercises', path) ?? '';

const STEP_MS = 1300;

export function ExercisePhotos({ photos }: { photos: string[] }) {
  const { t } = useTranslation();
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [failed, setFailed] = useState(false);
  const urls = photos.map(exercisePhotoUrl);
  const multi = urls.length > 1;

  useEffect(() => { Image.prefetch(photos.map(exercisePhotoUrl), 'memory-disk').catch(() => {}); }, [photos]);

  useEffect(() => {
    if (!multi || !playing) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % urls.length), STEP_MS);
    return () => clearInterval(id);
  }, [multi, playing, urls.length]);

  if (!urls.length || failed) return null;
  return (
    <Pressable onPress={() => multi && setPlaying((p) => !p)} accessibilityRole="button"
      accessibilityLabel={t(playing ? 'exercise.a11yPause' : 'exercise.a11yPlay')}
      style={{ width: '100%', aspectRatio: 3 / 2, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border }}>
      <Image source={{ uri: urls[idx] }} style={{ flex: 1 }} contentFit="contain" transition={{ duration: 280, effect: 'cross-dissolve' }}
        cachePolicy="memory-disk" onError={() => setFailed(true)} />
      {multi ? (
        <View style={{ position: 'absolute', bottom: 10, start: 10, end: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(10,51,45,0.82)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
            {urls.map((u, i) => (
              <View key={u} style={{ width: 7, height: 7, borderRadius: 2, transform: [{ rotate: '45deg' }], backgroundColor: i === idx ? brand.amber : 'rgba(255,255,255,0.45)' }} />
            ))}
            <T size="xs" color={brand.cream}>{t(idx === 0 ? 'library.photoStart' : 'library.photoEnd')}</T>
          </View>
          <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,51,45,0.82)' }}>
            <Ionicons name={playing ? 'pause' : 'play'} size={14} color={brand.cream} />
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

/** صورة مصغّرة للقوائم (أول صورة)، وإذا ما فيه صورة: أيقونة */
export function ExerciseThumb({ photo, size = 56, has3d }: { photo?: string; size?: number; has3d?: boolean }) {
  const [failed, setFailed] = useState(false);
  const w = Math.round(size * 1.5);
  return (
    <View style={{ width: w, height: size, borderRadius: 10, overflow: 'hidden', backgroundColor: photo && !failed ? '#fff' : colors.cardAlt,
      alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
      {photo && !failed ? (
        <Image source={{ uri: exercisePhotoUrl(photo) }} style={{ width: '100%', height: '100%' }} contentFit="cover"
          cachePolicy="memory-disk" recyclingKey={photo} transition={120} onError={() => setFailed(true)} />
      ) : (
        <Ionicons name={has3d ? 'body-outline' : 'barbell-outline'} size={size * 0.42} color={colors.primary} />
      )}
      {has3d ? (
        <View style={{ position: 'absolute', top: 3, end: 3, backgroundColor: brand.deepGreen, borderRadius: 5, paddingHorizontal: 4, paddingVertical: 1 }}>
          <T size="xs" bold color={brand.amber} style={{ fontSize: 9, lineHeight: 12 }}>3D</T>
        </View>
      ) : null}
    </View>
  );
}
