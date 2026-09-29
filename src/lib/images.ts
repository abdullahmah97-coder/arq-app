import * as ImagePicker from 'expo-image-picker';

export interface PickedImage {
  uri: string;
  mimeType: string;
  width?: number;
  height?: number;
}

export async function pickImage(source: 'camera' | 'library', aspect?: [number, number]): Promise<PickedImage | null> {
  const perm = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;

  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.7,
    allowsEditing: !!aspect,
    aspect,
  };
  const res = source === 'camera'
    ? await ImagePicker.launchCameraAsync(opts)
    : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, mimeType: a.mimeType ?? 'image/jpeg', width: a.width || undefined, height: a.height || undefined };
}

export interface PickedMedia extends PickedImage {
  type: 'image' | 'video';
  /** مدة الفيديو بالثواني */
  duration?: number;
  fileSize?: number;
}

/** صورة أو فيديو (دقيقة كحد أقصى، جودة متوسطة عشان الحجم) — للمحادثة */
export async function pickMedia(source: 'camera' | 'library'): Promise<PickedMedia | null> {
  const perm = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images', 'videos'],
    quality: 0.7,
    videoMaxDuration: 60,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
  };
  const res = source === 'camera'
    ? await ImagePicker.launchCameraAsync(opts)
    : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const video = a.type === 'video' || (a.mimeType ?? '').startsWith('video/');
  return {
    uri: a.uri,
    mimeType: a.mimeType ?? (video ? 'video/mp4' : 'image/jpeg'),
    width: a.width || undefined,
    height: a.height || undefined,
    type: video ? 'video' : 'image',
    duration: video && a.duration ? a.duration / 1000 : undefined,
    fileSize: a.fileSize ?? undefined,
  };
}
