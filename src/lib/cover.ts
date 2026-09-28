// خلفية الحساب خلف الاسم: لون من ألوان أرك (ثابت عند كل من يشوف الحساب) أو صورة من جهاز صاحب الحساب.
// 'auto' يتبع ثيم التطبيق عند المشاهد نفسه (مثل قبل).
import { gradients } from '@/theme';
import { supabase, uploadImage } from './supabase';

export const COVER_IDS = ['auto', 'ember', 'palm', 'oasis', 'dune', 'lavender', 'night', 'gold'] as const;
export type CoverId = (typeof COVER_IDS)[number];

/** الألوان من الأعلى للأسفل. الأسفل غامق كفاية عشان النص الفاتح يبان */
const FIXED: Record<Exclude<CoverId, 'auto'>, [string, string]> = {
  ember: ['#0A332D', '#F1551D'],
  palm: ['#0A332D', '#1F4A3F'],
  oasis: ['#2F4B3C', '#5E7F63'],
  dune: ['#5C230D', '#B8400F'],
  lavender: ['#2E2248', '#7B5BC4'],
  night: ['#0B1614', '#26332F'],
  gold: ['#4A3510', '#9A6B1E'],
};

export const COVER_NAMES: Record<CoverId, { ar: string; en: string }> = {
  auto: { ar: 'تلقائي', en: 'Auto' },
  ember: { ar: 'أرك', en: 'ARQ' },
  palm: { ar: 'النخيل', en: 'Palm' },
  oasis: { ar: 'الواحة', en: 'Oasis' },
  dune: { ar: 'الكثبان', en: 'Dune' },
  lavender: { ar: 'الخزامى', en: 'Lavender' },
  night: { ar: 'الليل', en: 'Night' },
  gold: { ar: 'الذهبي', en: 'Gold' },
};

export function coverColors(id: string | null | undefined): [string, string, ...string[]] {
  const fixed = id && id !== 'auto' ? FIXED[id as Exclude<CoverId, 'auto'>] : undefined;
  return (fixed ?? gradients.ember) as unknown as [string, string, ...string[]];
}

/** يختار لون ويشيل الصورة (اللون هو اللي يبان) */
export async function setCoverColor(me: string, id: CoverId, oldPhoto?: string | null) {
  const { error } = await supabase.from('profiles').update({ cover: id, cover_url: null }).eq('id', me);
  if (error) throw error;
  if (oldPhoto) supabase.storage.from('avatars').remove([oldPhoto]).then(() => {}, () => {});
}

/** يرفع صورة الخلفية لمجلد المستخدم ويحذف القديمة */
export async function setCoverPhoto(me: string, uri: string, mimeType: string, oldPhoto?: string | null): Promise<string> {
  const path = await uploadImage('avatars', me, uri, mimeType);
  const { error } = await supabase.from('profiles').update({ cover_url: path }).eq('id', me);
  if (error) {
    supabase.storage.from('avatars').remove([path]).then(() => {}, () => {});
    throw error;
  }
  if (oldPhoto && oldPhoto !== path) supabase.storage.from('avatars').remove([oldPhoto]).then(() => {}, () => {});
  return path;
}
