// Supabase Edge Function: gyms-nearby — يجيب النوادي الحقيقية حول موقع المستخدم من الخريطة ويضيفها للقاعدة
// عشان تسجيل الحضور يلقى ناديك تلقائياً (بدون ما أحد يضيفه يدوياً).
//
// المزود:
//   * OpenStreetMap (Overpass) — مجاني بدون مفتاح (الافتراضي)
//   * Google Places — أدق في السعودية، يشتغل تلقائياً إذا أضفت المفتاح:
//       supabase secrets set GOOGLE_MAPS_API_KEY=...
// كل منطقة (~٢ كم) تُمسح مرة كل أسبوعين فقط، وبعدها القراءة من القاعدة مباشرة.
//
// الطلبات (POST، بتوكن المستخدم):
//   { lat, lng }                 → مسح المنطقة (~٤ كم) مرة كل أسبوعين           → { provider, scanned, found }
//   { lat, lng, precise: true }  → مسح دقيق حولك (~٤٠٠ م) لتسجيل الحضور         → { provider, scanned, found }
//   { q, lat?, lng? }            → بحث بالاسم («وقت اللياقة الياسمين»)          → { provider, gyms: [...] }
// الخطأ: { error }

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const CELL_DEG = 0.02;       // ≈ ٢ كم
const PRECISE_DEG = 0.002;   // ≈ ٢٠٠ م (مسح دقيق وقت تسجيل الحضور)
const TTL_DAYS = 14;
const RADIUS_M = 4000;
const PRECISE_RADIUS_M = 400;
const SEARCH_PER_HOUR = 40;  // حد البحث بالاسم لكل مستخدم

// أنواع أماكن قوقل اللي نعتبرها نادي رياضي
const GOOGLE_GYM_TYPES = new Set(['gym', 'fitness_center', 'sports_club', 'sports_complex', 'yoga_studio', 'sports_activity_location', 'athletic_field']);
const UA = 'ARQ-app/1.0 (gym check-in; contact via app)';

function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

interface Place { id: string; name: string; name_en?: string; lat: number; lng: number; city?: string; address?: string }

const hasLatin = (s?: string) => !!s && /[A-Za-z]/.test(s);

async function fromOsm(lat: number, lng: number, radius = RADIUS_M): Promise<Place[]> {
  const around = `(around:${radius},${lat},${lng})`;
  const query = `[out:json][timeout:20];(
    nwr["leisure"="fitness_centre"]${around};
    nwr["amenity"="gym"]${around};
    nwr["leisure"="sports_centre"]["sport"~"fitness|bodybuilding|crossfit|weightlifting|boxing|martial_arts"]${around};
  );out center tags 120;`;
  const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  let lastErr = 'osm_unavailable';
  for (const ep of endpoints) {
    try {
      const r = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(22000),
      });
      if (!r.ok) { lastErr = `osm_${r.status}`; continue; }
      const text = await r.text();
      if (!text.trimStart().startsWith('{')) { lastErr = 'osm_busy'; continue; } // Overpass يرجع XML لما يكون مشغول
      const d = JSON.parse(text);
      const out: Place[] = [];
      for (const e of d.elements ?? []) {
        const t = e.tags ?? {};
        const la = e.lat ?? e.center?.lat;
        const lo = e.lon ?? e.center?.lon;
        const name: string | undefined = t['name:ar'] || t.name || t['name:en'] || t.brand;
        if (!name || la == null || lo == null) continue;
        const en = t['name:en'] || (hasLatin(t.name) ? t.name : undefined) || (hasLatin(t.brand) ? t.brand : undefined);
        const address = [t['addr:street'], t['addr:district'] || t['addr:suburb'] || t['addr:neighbourhood']].filter(Boolean).join('، ');
        out.push({ id: `${e.type}/${e.id}`, name, name_en: en !== name ? en : undefined, lat: la, lng: lo, city: t['addr:city'], address: address || undefined });
      }
      return out;
    } catch (e) {
      lastErr = String(e);
    }
  }
  throw new Error(lastErr);
}

function googlePlaces(d: any): Place[] {
  const out: Place[] = [];
  for (const p of d.places ?? []) {
    const name = p.displayName?.text;
    const la = p.location?.latitude;
    const lo = p.location?.longitude;
    if (!name || la == null || lo == null) continue;
    if (p.businessStatus === 'CLOSED_PERMANENTLY') continue;
    const types: string[] = p.types ?? [];
    if (types.length && !types.some((t) => GOOGLE_GYM_TYPES.has(t))) continue;
    out.push({ id: p.id, name, name_en: hasLatin(name) ? name : undefined, lat: la, lng: lo, address: p.shortFormattedAddress });
  }
  return out;
}
const GOOGLE_FIELDS = 'places.id,places.displayName,places.location,places.shortFormattedAddress,places.types,places.businessStatus';

/** بحث قوقل بالاسم (مع تفضيل المنطقة القريبة منك) */
async function searchGoogle(q: string, key: string, near?: { lat: number; lng: number }): Promise<Place[]> {
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': GOOGLE_FIELDS },
    body: JSON.stringify({
      textQuery: q,
      includedType: 'gym',
      languageCode: 'ar',
      regionCode: 'SA',
      pageSize: 20,
      ...(near ? { locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 30000 } } } : {}),
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`google_${r.status}`);
  return googlePlaces(await r.json());
}

/** بحث OpenStreetMap بالاسم (Nominatim) — احتياطي مجاني */
async function searchOsm(q: string, near?: { lat: number; lng: number }): Promise<Place[]> {
  const u = new URL('https://nominatim.openstreetmap.org/search');
  u.searchParams.set('format', 'jsonv2');
  u.searchParams.set('q', q);
  u.searchParams.set('countrycodes', 'sa');
  u.searchParams.set('limit', '30');
  u.searchParams.set('addressdetails', '1');
  u.searchParams.set('accept-language', 'ar');
  if (near) u.searchParams.set('viewbox', `${near.lng - 0.4},${near.lat + 0.4},${near.lng + 0.4},${near.lat - 0.4}`);
  const r = await fetch(u, { headers: { 'User-Agent': UA, Referer: 'https://arq.app' }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`osm_${r.status}`);
  const out: Place[] = [];
  for (const e of await r.json()) {
    const cat = `${e.category}/${e.type}`;
    if (!['leisure/fitness_centre', 'amenity/gym', 'leisure/sports_centre'].includes(cat)) continue;
    const name: string = e.name || String(e.display_name ?? '').split(',')[0];
    if (!name) continue;
    const a = e.address ?? {};
    const address = [a.road, a.suburb || a.neighbourhood || a.quarter].filter(Boolean).join('، ');
    out.push({ id: `${e.osm_type}/${e.osm_id}`, name, name_en: hasLatin(name) ? name : undefined, lat: Number(e.lat), lng: Number(e.lon), city: a.city || a.town, address: address || undefined });
  }
  return out;
}

async function fromGoogle(lat: number, lng: number, key: string, radius = RADIUS_M): Promise<Place[]> {
  const r = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': GOOGLE_FIELDS },
    body: JSON.stringify({
      includedTypes: ['gym', 'fitness_center'],
      maxResultCount: 20,
      rankPreference: 'DISTANCE',
      languageCode: 'ar',
      regionCode: 'SA',
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius } },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`google_${r.status}`);
  return googlePlaces(await r.json());
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'unauthorized' }, 401);

  let lat = NaN, lng = NaN, q = '', precise = false;
  try {
    const b = await req.json();
    lat = Number(b.lat); lng = Number(b.lng);
    q = typeof b.q === 'string' ? b.q.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    precise = b.precise === true;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const hasPos = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  if (!q && !hasPos) return json({ error: 'bad_location' }, 400);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const googleKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  const provider: 'google' | 'osm' = googleKey ? 'google' : 'osm';
  const near = hasPos ? { lat, lng } : undefined;

  // ---------------------------------------------------------------- بحث بالاسم
  if (q) {
    if (q.length < 2) return json({ error: 'bad_query' }, 400);
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await admin.from('gym_search_log').select('*', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', since);
    if ((count ?? 0) >= SEARCH_PER_HOUR) return json({ error: 'rate_limited' }, 429);
    await admin.from('gym_search_log').insert({ user_id: user.id, q });

    let places: Place[] = [];
    let used: 'google' | 'osm' = provider;
    try {
      places = provider === 'google' ? await searchGoogle(q, googleKey!, near) : await searchOsm(q, near);
    } catch (e) {
      if (provider !== 'google') return json({ error: String(e) }, 502);
      try { places = await searchOsm(q, near); used = 'osm'; } catch (e2) { return json({ error: String(e2) }, 502); }
    }
    if (!places.length) return json({ provider: used, gyms: [] });
    const { error } = await admin.rpc('upsert_provider_gyms', { p_source: used, p_places: places });
    if (error) return json({ error: error.message }, 500);
    const { data: rows, error: e2 } = await admin.from('gyms')
      .select('id, name, name_en, city, lat, lng, radius_m, verified, address, chain_id, external_id')
      .eq('source', used).in('external_id', places.map((p) => p.id));
    if (e2) return json({ error: e2.message }, 500);
    const rank = new Map(places.map((p, i) => [p.id, i]));
    const gyms = (rows ?? []).map(({ external_id, ...g }: any) => ({ ...g, distance_m: near ? Math.round(distanceM(near, g)) : null, _rank: rank.get(external_id) ?? 99 }));
    // الأقرب أولاً لو نعرف موقعك، وإلا بترتيب المزود
    gyms.sort((a: any, b: any) => (near ? a.distance_m - b.distance_m : a._rank - b._rank));
    for (const g of gyms) delete (g as any)._rank;
    return json({ provider: used, gyms });
  }

  // ---------------------------------------------------------------- مسح المنطقة (أو مسح دقيق حولك وقت الحضور)
  const step = precise ? PRECISE_DEG : CELL_DEG;
  const digits = precise ? 3 : 2;
  const cell = `${precise ? 'p:' : ''}${(Math.round(lat / step) * step).toFixed(digits)},${(Math.round(lng / step) * step).toFixed(digits)}`;
  const radius = precise ? PRECISE_RADIUS_M : RADIUS_M;

  const { data: scan } = await admin.from('gym_area_scans').select('provider, scanned_at').eq('cell', cell).maybeSingle();
  const fresh = scan && scan.provider === provider && Date.now() - new Date(scan.scanned_at).getTime() < TTL_DAYS * 86_400_000;
  if (fresh) return json({ provider, scanned: false });

  let places: Place[] = [];
  let used: 'google' | 'osm' = provider;
  try {
    places = provider === 'google' ? await fromGoogle(lat, lng, googleKey!, radius) : await fromOsm(lat, lng, radius);
  } catch (e) {
    if (provider === 'google') {
      try { places = await fromOsm(lat, lng, radius); used = 'osm'; } catch (e2) { return json({ error: String(e2) }, 502); }
    } else {
      return json({ error: String(e) }, 502);
    }
  }

  const { data: n, error } = await admin.rpc('upsert_provider_gyms', { p_source: used, p_places: places });
  if (error) return json({ error: error.message }, 500);
  await admin.from('gym_area_scans').upsert({ cell, provider: used, scanned_at: new Date().toISOString(), found: n ?? 0 });
  return json({ provider: used, scanned: true, found: n ?? 0 });
});
