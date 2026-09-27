// «أضف متجرك»: متاجر البراندات الرياضية ومنتجاتها (تظهر للجميع بعد موافقة الإدارة)
import { supabase } from './supabase';

export type BrandCategory = 'apparel' | 'supplements' | 'equipment' | 'accessories' | 'nutrition' | 'other';
export const BRAND_CATEGORIES: BrandCategory[] = ['apparel', 'supplements', 'equipment', 'accessories', 'nutrition', 'other'];
export type BrandStatus = 'pending' | 'approved' | 'rejected';

export interface Brand {
  id: string;
  owner: string;
  name: string;
  tagline: string | null;
  description: string | null;
  category: BrandCategory;
  logo_path: string | null;
  website: string | null;
  instagram: string | null;
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
}

const PSEL = 'id, brand_id, name, description, price_sar, image_path, url, active, created_at';

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

export type BrandInput = Pick<Brand, 'name' | 'tagline' | 'description' | 'category' | 'logo_path' | 'website' | 'instagram'>;

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
  };
}

export async function saveBrand(me: string, input: BrandInput, id?: string) {
  const b = normalizeBrand(input);
  const q = id ? supabase.from('brands').update(b).eq('id', id) : supabase.from('brands').insert({ ...b, owner: me });
  const { data, error } = await q.select('id').single();
  if (error) throw error;
  return data.id as string;
}

export type ProductInput = Pick<Product, 'name' | 'description' | 'price_sar' | 'image_path' | 'url' | 'active'>;

export async function saveProduct(brandId: string, input: ProductInput, id?: string) {
  const url = (input.url ?? '').trim();
  const p = { ...input, name: input.name.trim(), description: input.description?.trim() || null, url: url ? (/^https:\/\//i.test(url) ? url : `https://${url.replace(/^http:\/\//i, '')}`) : null };
  const { error } = id ? await supabase.from('brand_products').update(p).eq('id', id) : await supabase.from('brand_products').insert({ ...p, brand_id: brandId });
  if (error) throw error;
}

export const deleteProduct = (id: string) => supabase.from('brand_products').delete().eq('id', id);

export const fmtPrice = (n: number | null, lng: 'ar' | 'en') =>
  n == null ? '' : lng === 'ar' ? `${+n} ر.س` : `SAR ${+n}`;
