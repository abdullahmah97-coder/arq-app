// حجز الملاعب والحصص: القائمة، الأوقات المحجوزة، الحجز والإلغاء، حجوزاتي، ولوحة الملعب (ملاعب، حصص، تأكيد الحجوزات)
import { type BookingStatus, type Sport } from './bookingsCore';
import { publicUrl, supabase } from './supabase';

export * from './bookingsCore';

export interface Venue {
  id: string; owner: string | null; listed_by: 'owner' | 'arq'; sports: Sport[];
  name: string; name_en: string | null; city: string; city_en: string | null; district: string | null; district_en: string | null;
  audience: 'men' | 'women' | 'mixed' | null; about: string | null; about_en: string | null;
  phone: string | null; maps_url: string | null; booking_url: string | null; website: string | null; instagram: string | null; source_url: string | null;
  image_path: string | null; open_hour: number; close_hour: number; slot_min: number; price_sar: number | null; auto_confirm: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'suspended'; review_note: string | null; created_at: string;
}
export interface Court { id: string; venue_id: string; sport: Sport; name: string; active: boolean; sort: number }
export interface VenueClass {
  id: string; venue_id: string; sport: Sport; title: string; title_en: string | null; weekday: number; start_time: string;
  duration_min: number; capacity: number; coach_name: string | null; price_sar: number | null; audience: 'men' | 'women' | 'mixed'; active: boolean;
}
export interface Taken { court_id: string; starts_at: string; ends_at: string; mine: boolean }
export interface ClassSession {
  class_id: string; sport: Sport; title: string; title_en: string | null; coach_name: string | null; audience: string; price_sar: number | null;
  starts_at: string; ends_at: string; capacity: number; booked: number; my_booking: string | null; my_status: BookingStatus | null;
}
export interface MyBooking {
  id: string; venue_id: string; venue_name: string; venue_name_en: string | null; city: string; phone: string | null; maps_url: string | null;
  sport: Sport; label: string; label_en: string; starts_at: string; ends_at: string; status: BookingStatus; price_sar: number | null; venue_note: string | null; created_at: string;
}
export interface VenueBooking {
  id: string; sport: Sport; label: string; starts_at: string; ends_at: string; status: BookingStatus; price_sar: number | null; note: string | null; venue_note: string | null;
  user_id: string; username: string; full_name: string | null; avatar_url: string | null; created_at: string;
}

const num = (v: unknown) => (v == null ? null : Number(v));
const toVenue = (r: any): Venue => ({ ...r, price_sar: num(r.price_sar) });

export const venueImageUrl = (path: string | null | undefined) => publicUrl('brands', path);
export const venueName = (v: Pick<Venue, 'name' | 'name_en'>, lng: string) => (lng === 'en' && v.name_en ? v.name_en : v.name);
export const venueCity = (v: Pick<Venue, 'city' | 'city_en' | 'district' | 'district_en'>, lng: string) =>
  [lng === 'en' ? v.city_en || v.city : v.city, lng === 'en' ? v.district_en || v.district : v.district].filter(Boolean).join(' · ');

// ---------- للمستخدم ----------
/** المعتمدة: الشركاء (الحجز داخل التطبيق) أول، وبعدها المدرجة من مواقعها */
export async function loadVenues(sport?: Sport): Promise<Venue[]> {
  let qy = supabase.from('venues').select('*').eq('status', 'approved');
  if (sport) qy = qy.contains('sports', [sport]);
  const { data, error } = await qy.order('listed_by', { ascending: false }).order('name');
  if (error) throw error;
  return (data ?? []).map(toVenue);
}

export async function loadVenue(id: string): Promise<Venue | null> {
  const { data } = await supabase.from('venues').select('*').eq('id', id).maybeSingle();
  return data ? toVenue(data) : null;
}

export async function loadCourts(venueId: string, all = false): Promise<Court[]> {
  let qy = supabase.from('venue_courts').select('*').eq('venue_id', venueId);
  if (!all) qy = qy.eq('active', true);
  const { data } = await qy.order('sort').order('name');
  return (data ?? []) as Court[];
}

export async function loadTaken(venueId: string, from: string, to: string): Promise<Taken[]> {
  const { data, error } = await supabase.rpc('venue_taken', { p_venue: venueId, p_from: from, p_to: to });
  if (error) throw error;
  return (data ?? []) as Taken[];
}

export async function bookCourt(courtId: string, start: string, note?: string): Promise<{ id: string; status: BookingStatus }> {
  const { data, error } = await supabase.rpc('book_court', { p_court: courtId, p_starts: start, p_note: note?.trim() || null });
  if (error) throw error;
  return data as { id: string; status: BookingStatus };
}

export async function loadClassSchedule(venueId: string, days = 14): Promise<ClassSession[]> {
  const { data, error } = await supabase.rpc('venue_class_schedule', { p_venue: venueId, p_days: days });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({ ...r, price_sar: num(r.price_sar), capacity: Number(r.capacity), booked: Number(r.booked) }));
}

export async function bookClass(classId: string, start: string): Promise<{ id: string; status: BookingStatus }> {
  const { data, error } = await supabase.rpc('book_venue_class', { p_class: classId, p_starts: start });
  if (error) throw error;
  return data as { id: string; status: BookingStatus };
}

export async function myBookings(): Promise<MyBooking[]> {
  const { data, error } = await supabase.rpc('my_venue_bookings');
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({ ...r, price_sar: num(r.price_sar) }));
}

export async function cancelBooking(id: string) {
  const { error } = await supabase.rpc('cancel_venue_booking', { p_id: id });
  if (error) throw error;
}

// ---------- لصاحب الملعب أو الاستوديو ----------
export async function loadMyVenue(me: string): Promise<Venue | null> {
  const { data } = await supabase.from('venues').select('*').eq('owner', me).maybeSingle();
  return data ? toVenue(data) : null;
}

export type VenueInput = Pick<Venue, 'sports' | 'name' | 'name_en' | 'city' | 'city_en' | 'district' | 'district_en' | 'audience' | 'about' | 'about_en'
  | 'phone' | 'maps_url' | 'booking_url' | 'website' | 'instagram' | 'image_path' | 'open_hour' | 'close_hour' | 'slot_min' | 'price_sar' | 'auto_confirm'>;

const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

export async function saveMyVenue(i: VenueInput, id?: string): Promise<string> {
  const row = {
    ...i, name: i.name.trim(), city: i.city.trim(), name_en: clean(i.name_en), city_en: clean(i.city_en), district: clean(i.district), district_en: clean(i.district_en),
    about: clean(i.about), about_en: clean(i.about_en), phone: clean(i.phone), maps_url: clean(i.maps_url), booking_url: clean(i.booking_url),
    website: clean(i.website), instagram: clean(i.instagram)?.replace(/^@/, '') ?? null,
  };
  const { data, error } = id
    ? await supabase.from('venues').update(row).eq('id', id).select('id').single()
    : await supabase.from('venues').insert(row).select('id').single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function uploadVenueImage(me: string, uri: string, mimeType: string): Promise<string> {
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const body = await (await fetch(uri)).arrayBuffer();
  if (body.byteLength > 5 * 1024 * 1024) throw new Error('file_too_big');
  const path = `${me}/venue-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('brands').upload(path, body, { contentType: mimeType, cacheControl: '31536000' });
  if (error) throw error;
  return path;
}

export async function saveCourt(c: { venue_id: string; sport: Sport; name: string; active?: boolean; sort?: number }, id?: string) {
  const row = { ...c, name: c.name.trim() };
  const { error } = id ? await supabase.from('venue_courts').update(row).eq('id', id) : await supabase.from('venue_courts').insert(row);
  if (error) throw error;
}
export async function deleteCourt(id: string) {
  const { error } = await supabase.from('venue_courts').delete().eq('id', id);
  if (error) throw error;
}

export async function loadVenueClasses(venueId: string): Promise<VenueClass[]> {
  const { data } = await supabase.from('venue_classes').select('*').eq('venue_id', venueId).order('weekday').order('start_time');
  return ((data ?? []) as any[]).map((r) => ({ ...r, price_sar: num(r.price_sar) }));
}
export type ClassInput = Omit<VenueClass, 'id'>;
export async function saveVenueClass(c: ClassInput, id?: string) {
  const row = { ...c, title: c.title.trim(), title_en: clean(c.title_en), coach_name: clean(c.coach_name) };
  const { error } = id ? await supabase.from('venue_classes').update(row).eq('id', id) : await supabase.from('venue_classes').insert(row);
  if (error) throw error;
}
export async function deleteVenueClass(id: string) {
  const { error } = await supabase.from('venue_classes').delete().eq('id', id);
  if (error) throw error;
}

export async function venueBookingList(venueId: string): Promise<VenueBooking[]> {
  const { data, error } = await supabase.rpc('venue_booking_list', { p_venue: venueId });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({ ...r, price_sar: num(r.price_sar) }));
}

export type VenueAction = 'confirm' | 'decline' | 'cancel' | 'done' | 'no_show';
export async function respondBooking(id: string, action: VenueAction, note?: string) {
  const { error } = await supabase.rpc('respond_venue_booking', { p_id: id, p_action: action, p_note: note?.trim() || null });
  if (error) throw error;
}

// ---------- لوحة إدارة التطبيق ----------
export async function pendingVenues(): Promise<Venue[]> {
  const { data } = await supabase.from('venues').select('*').eq('status', 'pending').order('created_at');
  return (data ?? []).map(toVenue);
}
export async function reviewVenue(id: string, decision: 'approved' | 'rejected', note?: string) {
  const { error } = await supabase.rpc('review_venue', { p_id: id, p_decision: decision, p_note: note?.trim() || null });
  if (error) throw error;
}
