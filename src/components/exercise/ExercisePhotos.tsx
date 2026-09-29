// صور التمرين الحقيقية: بداية الحركة ونهايتها تتبدّل تلقائياً (مثل صورة متحركة) + صورة مصغّرة للقوائم
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Animated, Pressable, StyleSheet, View } from 'react-native';
import { T } from '@/components/ui';
import { publicUrl } from '@/lib/supabase';
import { brand, colors, radius } from '@/theme';

export const exercisePhotoUrl = (path: string) => publicUrl('exercises', path) ?? '';

const STEP_MS = 1300;

/** الصورتين (البداية والنهاية) محمّلتين فوق بعض، والتبديل بتلاشي بينهم: ما يطلع فراغ وقت التبديل،
 * والحركة ما تبدأ إلا بعد ما تتحمّل الصورتين. لو وحدة ما تحمّلت تبقى الثانية ثابتة بدل ما تختفي الصور */
export function ExercisePhotos({ photos }: { photos: string[] }) {
  const { t } = useTranslation();
  const urls = useMemo(() => photos.slice(0, 2).map(exercisePhotoUrl).filter(Boolean), [photos]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [loaded, setLoaded] = useState<boolean[]>([]);
  const [broken, setBroken] = useState<boolean[]>([]);
  const [fade] = useState(() => new Animated.Value(0));

  const good = urls.map((_, i) => !broken[i]);
  const goodCount = good.filter(Boolean).length;
  const animate = urls.length > 1 && goodCount === 2 && !!loaded[0] && !!loaded[1];
  const onlyOne = goodCount === 1 ? good.indexOf(true) : -1;
  const shown = animate ? idx : onlyOne >= 0 ? onlyOne : 0;

  useEffect(() => {
    if (!animate || !playing) return;
    const id = setInterval(() => setIdx((i) => (i === 0 ? 1 : 0)), STEP_MS);
    return () => clearInterval(id);
  }, [animate, playing]);

  useEffect(() => {
    Animated.timing(fade, { toValue: animate ? idx : onlyOne === 1 ? 1 : 0, duration: 280, useNativeDriver: true }).start();
  }, [fade, idx, animate, onlyOne]);

  if (!urls.length || goodCount === 0) return null;
  const mark = (set: typeof setLoaded, i: number) => set((cur) => { const n = [...cur]; n[i] = true; return n; });

  return (
    <Pressable onPress={() => animate && setPlaying((p) => !p)} accessibilityRole="button"
      accessibilityLabel={t(playing ? 'exercise.a11yPause' : 'exercise.a11yPlay')}
      style={{ width: '100%', aspectRatio: 3 / 2, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border }}>
      {/* البداية تحت، والنهاية فوقها وتظهر بالتلاشي */}
      {urls.map((u, i) => good[i] ? (
        <Animated.View key={u} style={[StyleSheet.absoluteFill, i === 1 ? { opacity: fade } : null]}>
          <Image source={{ uri: u }} style={{ flex: 1 }} contentFit="contain" cachePolicy="memory-disk"
            onLoad={() => mark(setLoaded, i)} onError={() => mark(setBroken, i)} />
        </Animated.View>
      ) : null)}
      {!loaded[shown] ? (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}
      {urls.length > 1 ? (
        <View style={{ position: 'absolute', bottom: 10, start: 10, end: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(10,51,45,0.82)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
            {urls.map((u, i) => (
              <View key={u} style={{ width: 7, height: 7, borderRadius: 2, transform: [{ rotate: '45deg' }], backgroundColor: i === shown ? brand.amber : 'rgba(255,255,255,0.45)' }} />
            ))}
            <T size="xs" color={brand.cream}>{t(shown === 0 ? 'library.photoStart' : 'library.photoEnd')}</T>
          </View>
          {animate ? (
            <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,51,45,0.82)' }}>
              <Ionicons name={playing ? 'pause' : 'play'} size={14} color={brand.cream} />
            </View>
          ) : null}
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
