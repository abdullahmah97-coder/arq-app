// المتاجر: مطاعم صحية، ملابس رياضية، مكملات ومعدات، ومنتجاتها (تظهر للجميع بعد موافقة الإدارة)
import { supabase } from './supabase';

export type BrandCategory = 'restaurant' | 'apparel' | 'supplements' | 'equipment' | 'accessories' | 'nutrition' | 'other';
export const BRAND_CATEGORIES: BrandCategory[] = ['restaurant', 'apparel', 'supplements', 'equipment', 'accessories', 'nutrition', 'other'];
/** الأقسام الرئيسية اللي تظهر كبطاقات كبيرة في المتاجر */
export const FEATURED_CATEGORIES: BrandCategory[] = ['restaurant', 'apparel'];
export type BrandStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface Brand {
  id: string;
  /** فارغ = صفحة أضافتها إدارة أرك وما ارتبطت بحساب صاحبها بعد */
  owner: string | null;
  listed_by?: 'owner' | 'arq';
  name: string;
  tagline: string | null;
  description: string | null;
  category: BrandCategory;
  logo_path: string | null;
  website: string | null;
  instagram: string | null;
  city?: string | null;
  status: BrandStatus;
  review_note: string | null;
  created_at: string;
  brand_products?: Product[];
}

export interface Product {
  id: string;
  brand_id: string;
  name: string;
  description: string | null;
  price_sar: number | null;
  image_path: string | null;
  url: string | null;
  active: boolean;
  created_at: string;
  /** للمطاعم: سعرات وماكروز الطبق */
  kcal?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  /** الكمية: فارغ = بدون تتبع، صفر = نفد */
  stock?: number | null;
}

const PSEL = 'id, brand_id, name, description, price_sar, image_path, url, active, created_at, kcal, protein_g, carbs_g, fat_g, stock';

export async function loadBrands(): Promise<Brand[]> {
  const { data } = await supabase.from('brands').select(`*, brand_products(${PSEL})`)
    .eq('status', 'approved').order('created_at', { ascending: false }).limit(60);
  return (data ?? []) as Brand[];
}

export async function loadBrand(id: string): Promise<Brand | null> {
  const { data } = await supabase.from('brands').select(`*, brand_products(${PSEL})`).eq('id', id).maybeSingle();
  return (data as Brand) ?? null;
}

export async function loadMyBrand(me: string): Promise<Brand | null> {
  const { data } = await supabase.from('brands').select(`*, brand_products(${PSEL})`).eq('owner', me).maybeSingle();
  return (data as Brand) ?? null;
}

export type BrandInput = Pick<Brand, 'name' | 'tagline' | 'description' | 'category' | 'logo_path' | 'website' | 'instagram' | 'city'>;

/** ينظف الروابط: يضيف https:// ويشيل @ من انستقرام */
export function normalizeBrand(b: BrandInput): BrandInput {
  const url = (u: string | null) => {
    const v = (u ?? '').trim();
    if (!v) return null;
    return /^https:\/\//i.test(v) ? v : `https://${v.replace(/^http:\/\//i, '')}`;
  };
  const clean = (s: string | null) => (s ?? '').trim() || null;
  return {
    ...b,
    name: b.name.trim(),
    tagline: clean(b.tagline),
    description: clean(b.description),
    website: url(b.website),
    instagram: clean(b.instagram)?.replace(/^@/, '') ?? null,
    city: b.category === 'restaurant' ? clean(b.city ?? null) : null,
  };
}

/** asListing: المالك يضيف صفحة متجر بدون صاحب (تظهر مباشرة، ويربطها بحساب صاحبها بعدين) */
export async function saveBrand(me: string, input: BrandInput, id?: string, asListing = false) {
  const b = normalizeBrand(input);
  const q = id ? supabase.from('brands').update(b).eq('id', id)
    : supabase.from('brands').insert(asListing ? { ...b, owner: null, listed_by: 'arq', status: 'approved' } : { ...b, owner: me });
  const { data, error } = await q.select('id').single();
  if (error) throw error;
  return data.id as string;
}

export type ProductInput = Pick<Product, 'name' | 'description' | 'price_sar' | 'image_path' | 'url' | 'active' | 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'stock'>;

export async function saveProduct(brandId: string, input: ProductInput, id?: string) {
  const url = (input.url ?? '').trim();
  const p = { ...input, name: input.name.trim(), description: input.description?.trim() || null, url: url ? (/^https:\/\//i.test(url) ? url : `https://${url.replace(/^http:\/\//i, '')}`) : null };
  const { error } = id ? await supabase.from('brand_products').update(p).eq('id', id) : await supabase.from('brand_products').insert({ ...p, brand_id: brandId });
  if (error) throw error;
}

export const deleteProduct = (id: string) => supabase.from('brand_products').delete().eq('id', id);

export const fmtPrice = (n: number | null, lng: 'ar' | 'en') =>
  n == null ? '' : lng === 'ar' ? `${+n} ر.س` : `SAR ${+n}`;

/** طبق فيه سعرات؟ (يظهر عليه «أكلتها» ويدخل جدول الاشتراك) */
export const hasMacros = (p: Pick<Product, 'kcal'>) => p.kcal != null && p.kcal > 0;

export const soldOut = (p: Pick<Product, 'stock'>) => p.stock === 0;

// ---------- عروض المتجر وأكوادها ----------
export interface BrandOffer {
  id: string; brand_id: string; title: string; details: string | null; code: string | null; percent: number | null;
  url: string | null; ends_on: string | null; active: boolean; created_at: string;
}
export type OfferInput = Pick<BrandOffer, 'title' | 'details' | 'code' | 'percent' | 'url' | 'ends_on' | 'active'>;

export async function loadBrandOffers(brandId: string): Promise<BrandOffer[]> {
  const { data } = await supabase.from('brand_offers').select('*').eq('brand_id', brandId).order('created_at', { ascending: false });
  return (data ?? []) as BrandOffer[];
}
export async function saveBrandOffer(brandId: string, o: OfferInput, id?: string) {
  const url = (o.url ?? '').trim();
  const row = {
    ...o, title: o.title.trim(), details: o.details?.trim() || null, code: o.code?.trim().toUpperCase() || null,
    url: url ? (/^https:\/\//i.test(url) ? url : `https://${url.replace(/^http:\/\//i, '')}`) : null, ends_on: o.ends_on || null,
  };
  const { error } = id ? await supabase.from('brand_offers').update(row).eq('id', id) : await supabase.from('brand_offers').insert({ ...row, brand_id: brandId });
  if (error) throw error;
}
export const deleteBrandOffer = (id: string) => supabase.from('brand_offers').delete().eq('id', id);

/** تسجيل مشاهدة/كشف كود/زيارة. الكشف يرجع الكود */
export async function offerEvent(id: string, kind: 'view' | 'reveal' | 'visit'): Promise<string | null> {
  const { data, error } = await supabase.rpc('offer_event', { p_offer: id, p_kind: kind });
  if (error) throw error;
  return (data as string | null) ?? null;
}
export interface OfferStat { offer_id: string; title: string; active: boolean; views: number; reveals: number; visits: number }
export async function brandOfferStats(brandId: string): Promise<OfferStat[]> {
  const { data } = await supabase.rpc('brand_offer_stats', { p_brand: brandId });
  return (data ?? []) as OfferStat[];
}

// ---------- تنبيهات المتجر: فقط للمرتبطين (مشتركين الوجبات + اللي اشتركوا في تنبيهاته) ----------
export async function isFollowingStore(brandId: string, me: string) {
  const { data } = await supabase.from('brand_followers').select('brand_id').eq('brand_id', brandId).eq('user_id', me).maybeSingle();
  return !!data;
}
export async function setFollowStore(brandId: string, me: string, on: boolean) {
  const { error } = on ? await supabase.from('brand_followers').insert({ brand_id: brandId, user_id: me })
    : await supabase.from('brand_followers').delete().eq('brand_id', brandId).eq('user_id', me);
  if (error && !String(error.message).includes('duplicate')) throw error;
}
export async function storeAudience(brandId: string): Promise<{ followers: number; subscribers: number }> {
  const { data } = await supabase.rpc('store_audience', { p_brand: brandId });
  const r = (data as any[] | null)?.[0];
  return { followers: Number(r?.followers ?? 0), subscribers: Number(r?.subscribers ?? 0) };
}
export async function sendStoreAnnouncement(brandId: string, title: string, body: string): Promise<number> {
  const { data, error } = await supabase.rpc('send_store_announcement', { p_brand: brandId, p_title: title.trim(), p_body: body.trim() });
  if (error) throw error;
  return Number(data ?? 0);
}
export interface Announcement { id: string; title: string; body: string; recipients: number; created_at: string }
export async function loadAnnouncements(brandId: string, limit = 5): Promise<Announcement[]> {
  const { data } = await supabase.from('brand_announcements').select('id, title, body, recipients, created_at').eq('brand_id', brandId)
    .order('created_at', { ascending: false }).limit(limit);
  return (data ?? []) as Announcement[];
}

// ---------- استيراد منتجات/منيو من نص (ينسخ من إكسل أو إيميل الشريك) ----------
export interface ParsedProducts { rows: ProductInput[]; errors: number[] }
const toNum = (v: string | undefined) => {
  const s = (v ?? '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[^\d.]/g, '');
  return s ? Number(s) : null;
};
/** كل سطر: الاسم، السعر، السعرات، بروتين، كارب، دهون، الكمية (الأعمدة بعد الاسم اختيارية). فواصل: , أو ؛ أو Tab */
export function parseProductsText(text: string): ParsedProducts {
  const rows: ProductInput[] = [];
  const errors: number[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const raw = line.trim();
    if (!raw) return;
    const c = raw.split(/\t|;|؛|,|،/).map((x) => x.trim());
    const name = c[0] ?? '';
    if (name.length < 2 || name.length > 80 || /^(name|الاسم|اسم)/i.test(name)) { if (name.length >= 2 && i === 0) return; errors.push(i + 1); return; }
    const price = toNum(c[1]); const kcal = toNum(c[2]);
    if ((price != null && (price < 0 || price > 100000)) || (kcal != null && kcal > 5000)) { errors.push(i + 1); return; }
    const stock = toNum(c[6]);
    rows.push({
      name, description: null, price_sar: price, image_path: null, url: null, active: true,
      kcal: kcal != null ? Math.round(kcal) : null, protein_g: toNum(c[3]), carbs_g: toNum(c[4]), fat_g: toNum(c[5]),
      stock: stock != null ? Math.round(stock) : null,
    });
  });
  return { rows: rows.slice(0, 60), errors };
}
export async function importProducts(brandId: string, rows: ProductInput[]) {
  if (!rows.length) return 0;
  const { error } = await supabase.from('brand_products').insert(rows.map((r) => ({ ...r, brand_id: brandId })));
  if (error) throw error;
  return rows.length;
}
