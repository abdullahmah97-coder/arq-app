// خلفية هيدر الحساب + نافذة اختيارها (لون من ألوان أرك أو صورة من الجهاز)
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SaduPattern } from '@/brand/Brand';
import { Button, T } from '@/components/ui';
import { COVER_IDS, COVER_NAMES, coverColors, setCoverColor, setCoverPhoto, type CoverId } from '@/lib/cover';
import { useLocalized } from '@/lib/i18n';
import { pickImage } from '@/lib/images';
import { errorKey, publicUrl } from '@/lib/supabase';
import { brand, colors, radius, space } from '@/theme';

/** الخلفية نفسها: صورة (مع تظليل عشان النص يبان) أو تدرّج اللون */
export function ProfileCover({ cover, photo, style, children }: {
  cover?: string | null; photo?: string | null; style?: StyleProp<ViewStyle>; children?: ReactNode;
}) {
  if (photo) {
    return (
      <View style={[style, { backgroundColor: brand.deepGreen }]}>
        <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        <LinearGradient colors={['rgba(10,51,45,0.35)', 'rgba(10,51,45,0.78)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
        {children}
      </View>
    );
  }
  return (
    <LinearGradient colors={coverColors(cover)} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={style}>
      <SaduPattern variant="arrows" opacity={0.12} />
      {children}
    </LinearGradient>
  );
}

/** نافذة اختيار الخلفية (لصاحب الحساب) */
export function CoverPicker({ visible, me, cover, photoPath, onClose, onChanged }: {
  visible: boolean; me: string; cover: CoverId; photoPath: string | null;
  onClose: () => void; onChanged: (next: { cover: CoverId; photoPath: string | null; localUri?: string }) => void;
}) {
  const { t } = useTranslation();
  const { lng } = useLocalized();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<'photo' | CoverId | null>(null);

  const pickColor = async (id: CoverId) => {
    if (busy) return;
    setBusy(id);
    const prev = { cover, photoPath };
    onChanged({ cover: id, photoPath: null });
    try { await setCoverColor(me, id, photoPath); onClose(); }
    catch (e) { onChanged(prev); Alert.alert(t(errorKey(e))); } finally { setBusy(null); }
  };
  const pickPhoto = async () => {
    const img = await pickImage('library', [1, 1]);
    if (!img) return;
    setBusy('photo');
    onChanged({ cover, photoPath, localUri: img.uri });
    try { const path = await setCoverPhoto(me, img.uri, img.mimeType, photoPath); onChanged({ cover, photoPath: path }); onClose(); }
    catch (e) { onChanged({ cover, photoPath }); Alert.alert(t(errorKey(e))); } finally { setBusy(null); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={onClose} accessibilityLabel={t('common.close')} />
      <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, paddingBottom: space.lg + insets.bottom, gap: space.md }}>
        <T size="lg" bold>{t('profile.coverTitle')}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, justifyContent: 'center' }}>
          {COVER_IDS.map((id) => {
            const on = !photoPath && cover === id;
            return (
              <Pressable key={id} onPress={() => pickColor(id)} accessibilityRole="button" accessibilityState={{ selected: on }}
                accessibilityLabel={COVER_NAMES[id][lng === 'en' ? 'en' : 'ar']} style={{ alignItems: 'center', gap: 4, width: 70 }}>
                <View style={{ padding: 3, borderRadius: 32, borderWidth: 2, borderColor: on ? colors.primary : 'transparent' }}>
                  <LinearGradient colors={coverColors(id)} style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' }}>
                    {busy === id ? <Ionicons name="hourglass-outline" size={18} color={brand.cream} />
                      : on ? <Ionicons name="checkmark" size={22} color={brand.cream} />
                      : id === 'auto' ? <Ionicons name="color-wand-outline" size={18} color={brand.cream} /> : null}
                  </LinearGradient>
                </View>
                <T size="xs" semibold={on} muted={!on} center>{COVER_NAMES[id][lng === 'en' ? 'en' : 'ar']}</T>
              </Pressable>
            );
          })}
        </View>
        <T size="xs" muted center>{t('profile.coverAutoHint')}</T>
        <Button variant="secondary" icon="image-outline" title={photoPath ? t('profile.coverChangePhoto') : t('profile.coverPhoto')} loading={busy === 'photo'} onPress={pickPhoto} />
        {photoPath ? <Button variant="ghost" icon="trash-outline" title={t('profile.coverRemovePhoto')} onPress={() => pickColor(cover)} /> : null}
      </View>
    </Modal>
  );
}

export const coverPhotoUrl = (path: string | null | undefined) => (path ? publicUrl('avatars', path) : null);
