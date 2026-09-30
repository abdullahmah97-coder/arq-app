// إعلان البداية: جلب الإعلان الحالي وتسجيل المشاهدة، وأدوات لوحة المالك (إضافة، تعديل، رفع، أرقام)
import AsyncStorage from '@react-native-async-storage/async-storage';
import { markSeen, riyadhDay, shouldShowAd, type AdAudience, type AdFrequency, type AdKind, type SeenMap } from './launchAdsCore';
import { publicUrl, supabase } from './supabase';

export type AdMediaType = 'image' | 'gif' | 'video';
export interface LaunchAd {
  id: string; kind: AdKind; title: string; media_path: string; media_type: AdMediaType;
  link: string | null; cta: string | null; frequency: AdFrequency; auto_close: number; updated_at: string;
}
export interface LaunchAdRow extends LaunchAd {
  audience: AdAudience; starts_at: string | null; ends_at: string | null; active: boolean; priority: number; created_at: string;
}
export interface AdStats { views: number; reach: number; clicks: number; closes: number }
export type AdInput = Omit<LaunchAdRow, 'id' | 'updated_at' | 'created_at'>;

export const adMediaUrl = (path: string | null | undefined) => publicUrl('ads', path);

const SEEN_KEY = 'arq.launchAd.v1';
const readSeen = async (): Promise<SeenMap> => {
  try { return JSON.parse((await AsyncStorage.getItem(SEEN_KEY)) ?? '{}') as SeenMap; } catch { return {}; }
};
/** نسخة الإعلان: تتغير بس لو تغيّرت الصورة، عشان «مرة وحدة» ما يرجع يظهر لو المالك أوقفه وشغّله */
const versionOf = (a: LaunchAd) => a.media_path;

/** الإعلان اللي لازم يظهر الحين (أو null): يحترم عدد مرات الظهور المحفوظ في الجهاز */
export async function launchAdToShow(): Promise<LaunchAd | null> {
  const { data, error } = await supabase.rpc('current_launch_ad');
  if (error || !data?.[0]) return null;
  const ad = data[0] as LaunchAd;
  return shouldShowAd(ad.frequency, ad.id, versionOf(ad), await readSeen(), riyadhDay()) ? ad : null;
}

export async function markAdShown(ad: LaunchAd) {
  const next = markSeen(await readSeen(), ad.id, versionOf(ad), riyadhDay());
  await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(next)).catch(() => {});
}

export const launchAdEvent = (id: string, kind: 'view' | 'click' | 'close') =>
  supabase.rpc('launch_ad_event', { p_ad: id, p_kind: kind }).then(() => {}, () => {});

// ---------- لوحة المالك ----------
export async function listLaunchAds(): Promise<LaunchAdRow[]> {
  const { data, error } = await supabase.from('launch_ads').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as LaunchAdRow[];
}

export async function loadLaunchAd(id: string): Promise<LaunchAdRow | null> {
  const { data } = await supabase.from('launch_ads').select('*').eq('id', id).maybeSingle();
  return (data as LaunchAdRow | null) ?? null;
}

export async function launchAdStats(): Promise<Record<string, AdStats>> {
  const { data } = await supabase.rpc('launch_ad_stats');
  return Object.fromEntries(((data ?? []) as ({ ad_id: string } & AdStats)[]).map((r) => [r.ad_id, {
    views: Number(r.views), reach: Number(r.reach), clicks: Number(r.clicks), closes: Number(r.closes),
  }]));
}

export async function saveLaunchAd(input: AdInput, id?: string): Promise<string> {
  const row = { ...input, title: input.title.trim(), link: input.link?.trim() || null, cta: input.cta?.trim() || null };
  const { data, error } = id
    ? await supabase.from('launch_ads').update(row).eq('id', id).select('id').single()
    : await supabase.from('launch_ads').insert(row).select('id').single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function setLaunchAdActive(id: string, active: boolean) {
  const { error } = await supabase.from('launch_ads').update({ active }).eq('id', id);
  if (error) throw error;
}

export async function deleteLaunchAd(ad: Pick<LaunchAdRow, 'id' | 'media_path'>) {
  const { error } = await supabase.from('launch_ads').delete().eq('id', ad.id);
  if (error) throw error;
  supabase.storage.from('ads').remove([ad.media_path]).then(() => {}, () => {});
}

/** الحد: الصور ٥ ميقا، GIF ٨، والفيديو ٢٠ ميقا ولين ٣٠ ثانية (عشان يفتح بسرعة على الجوال) */
export const AD_MAX_BYTES: Record<AdMediaType, number> = { image: 5 * 1024 * 1024, gif: 8 * 1024 * 1024, video: 20 * 1024 * 1024 };
export const AD_MAX_VIDEO_SEC = 30;

/** نوع الملف من الـ MIME */
export const adMediaTypeOf = (mimeType: string): AdMediaType =>
  (mimeType.startsWith('video/') ? 'video' : mimeType.includes('gif') ? 'gif' : 'image');

export async function uploadAdMedia(uri: string, mimeType: string): Promise<{ path: string; media_type: AdMediaType }> {
  const media_type = adMediaTypeOf(mimeType);
  const ext = media_type === 'video' ? (mimeType.includes('quicktime') ? 'mov' : mimeType.includes('webm') ? 'webm' : 'mp4')
    : media_type === 'gif' ? 'gif' : mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const body = await (await fetch(uri)).arrayBuffer();
  if (body.byteLength > AD_MAX_BYTES[media_type]) throw new Error('file_too_big');
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('ads').upload(path, body, { contentType: mimeType, cacheControl: '31536000' });
  if (error) throw error;
  return { path, media_type };
}
