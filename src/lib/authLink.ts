// رابط تأكيد الإيميل من Supabase يفتح التطبيق ومعه الجلسة:
//   arq://#access_token=…&refresh_token=…&type=signup
// ولو الرابط قديم أو انستخدم: arq://#error=access_denied&error_code=otp_expired&error_description=…
// منطق بحت عشان يتختبر؛ التطبيق يستخدمه في AuthProvider عشان يدخّل المستخدم على طول.

export type AuthLink =
  | { kind: 'session'; access_token: string; refresh_token: string; type: string | null }
  | { kind: 'error'; code: string; description: string | null }
  | null;

export function parseAuthLink(url: string | null | undefined): AuthLink {
  if (!url) return null;
  const params = new Map<string, string>();
  const collect = (part: string) => {
    for (const kv of part.split('&')) {
      const i = kv.indexOf('=');
      if (i <= 0) continue;
      try {
        params.set(decodeURIComponent(kv.slice(0, i)), decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' ')));
      } catch { /* جزء مشوّه: نتجاهله */ }
    }
  };
  const hash = url.indexOf('#');
  const query = url.indexOf('?');
  if (query >= 0 && (hash < 0 || query < hash)) collect(url.slice(query + 1, hash >= 0 ? hash : undefined));
  if (hash >= 0) collect(url.slice(hash + 1));

  const access = params.get('access_token');
  const refresh = params.get('refresh_token');
  if (access && refresh) return { kind: 'session', access_token: access, refresh_token: refresh, type: params.get('type') ?? null };
  const code = params.get('error_code') ?? params.get('error');
  if (code) return { kind: 'error', code, description: params.get('error_description') ?? null };
  return null;
}
