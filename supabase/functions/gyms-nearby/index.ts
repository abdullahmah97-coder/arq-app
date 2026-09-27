// Supabase Edge Function: gyms-nearby — يجيب النوادي الحقيقية حول موقع المستخدم من الخريطة ويضيفها للقاعدة
// عشان تسجيل الحضور يلقى ناديك تلقائياً (بدون ما أحد يضيفه يدوياً).
//
// المزود:
//   * OpenStreetMap (Overpass) — مجاني بدون مفتاح (الافتراضي)
//   * Google Places — أدق في السعودية، يشتغل تلقائياً إذا أضفت المفتاح:
//       supabase secrets set GOOGLE_MAPS_API_KEY=...
// كل منطقة (~٢ كم) تُمسح مرة كل أسبوعين فقط، وبعدها القراءة من القاعدة مباشرة.
//
// الطلب (POST، بتوكن المستخدم): { lat, lng }
// الرد: { provider, scanned, found }  أو { error }

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const CELL_DEG = 0.02;       // ≈ ٢ كم
const TTL_DAYS = 14;
const RADIUS_M = 4000;

interface Place { id: string; name: string; name_en?: string; lat: number; lng: number; city?: string; address?: string }

const hasLatin = (s?: string) => !!s && /[A-Za-z]/.test(s);

async function fromOsm(lat: number, lng: number): Promise<Place[]> {
  const around = `(around:${RADIUS_M},${lat},${lng})`;
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
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'ARQ-app/1.0 (gym check-in)' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(22000),
      });
      if (!r.ok) { lastErr = `osm_${r.status}`; continue; }
      const d = await r.json();
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

async function fromGoogle(lat: number, lng: number, key: string): Promise<Place[]> {
  const r = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.shortFormattedAddress',
    },
    body: JSON.stringify({
      includedTypes: ['gym', 'fitness_center'],
      maxResultCount: 20,
      rankPreference: 'DISTANCE',
      languageCode: 'ar',
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: RADIUS_M } },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`google_${r.status}`);
  const d = await r.json();
  const out: Place[] = [];
  for (const p of d.places ?? []) {
    const name = p.displayName?.text;
    const la = p.location?.latitude;
    const lo = p.location?.longitude;
    if (!name || la == null || lo == null) continue;
    out.push({ id: p.id, name, name_en: hasLatin(name) ? name : undefined, lat: la, lng: lo, address: p.shortFormattedAddress });
  }
  return out;
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

  let lat: number, lng: number;
  try {
    const b = await req.json();
    lat = Number(b.lat); lng = Number(b.lng);
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return json({ error: 'bad_location' }, 400);
  }

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const googleKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  const provider: 'google' | 'osm' = googleKey ? 'google' : 'osm';
  const cell = `${(Math.round(lat / CELL_DEG) * CELL_DEG).toFixed(2)},${(Math.round(lng / CELL_DEG) * CELL_DEG).toFixed(2)}`;

  const { data: scan } = await admin.from('gym_area_scans').select('provider, scanned_at').eq('cell', cell).maybeSingle();
  const fresh = scan && scan.provider === provider && Date.now() - new Date(scan.scanned_at).getTime() < TTL_DAYS * 86_400_000;
  if (fresh) return json({ provider, scanned: false });

  let places: Place[] = [];
  let used: 'google' | 'osm' = provider;
  try {
    places = provider === 'google' ? await fromGoogle(lat, lng, googleKey!) : await fromOsm(lat, lng);
  } catch (e) {
    if (provider === 'google') {
      try { places = await fromOsm(lat, lng); used = 'osm'; } catch (e2) { return json({ error: String(e2) }, 502); }
    } else {
      return json({ error: String(e) }, 502);
    }
  }

  const { data: n, error } = await admin.rpc('upsert_provider_gyms', { p_source: used, p_places: places });
  if (error) return json({ error: error.message }, 500);
  await admin.from('gym_area_scans').upsert({ cell, provider: used, scanned_at: new Date().toISOString(), found: n ?? 0 });
  return json({ provider: used, scanned: true, found: n ?? 0 });
});
