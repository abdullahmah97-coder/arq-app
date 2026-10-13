// فحوص مشتركة لطلبات Claude في اختبارات الدوال: شكل الـ JSON schema (حدود الـ API) والحقول الممنوعة على claude-sonnet-5-5

/** مشاكل الـ schema: كل كائن additionalProperties: false و required من خصائصه، وبدون قيود ما يقبلها الـ API */
export function schemaProblems(s, path = '$', out = []) {
  if (!s || typeof s !== 'object') { out.push(`${path}: not a schema`); return out; }
  for (const k of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'pattern', 'format', '$ref']) {
    if (k in s) out.push(`${path}: unsupported ${k}`);
  }
  if (s.type === 'object') {
    if (s.additionalProperties !== false) out.push(`${path}: additionalProperties must be false`);
    const props = Object.keys(s.properties ?? {});
    for (const r of s.required ?? []) if (!props.includes(r)) out.push(`${path}: required ${r} is not a property`);
    for (const [k, v] of Object.entries(s.properties ?? {})) schemaProblems(v, `${path}.${k}`, out);
  }
  if (s.type === 'array') schemaProblems(s.items, `${path}[]`, out);
  for (const v of s.anyOf ?? []) schemaProblems(v, `${path}|`, out);
  if (Array.isArray(s.type)) out.push(`${path}: type arrays are not used (anyOf instead)`);
  return out;
}

/** عدد الحقول الاختيارية والحقول اللي فيها anyOf (حدود الـ API: ٢٤ و ١٦ لكل الطلب) */
export function schemaStats(s, acc = { optional: 0, unions: 0 }) {
  if (!s || typeof s !== 'object') return acc;
  if (s.anyOf) acc.unions++;
  if (s.type === 'object') {
    const req = new Set(s.required ?? []);
    for (const [k, v] of Object.entries(s.properties ?? {})) { if (!req.has(k)) acc.optional++; schemaStats(v, acc); }
  }
  if (s.type === 'array') schemaStats(s.items, acc);
  for (const v of s.anyOf ?? []) schemaStats(v, acc);
  return acc;
}

/** حقول ممنوعة أو قديمة على claude-sonnet-5-5: sampling، thinking disabled/budget، tool_choice إجباري، prefill */
export function requestProblems(req) {
  const out = [];
  for (const k of ['temperature', 'top_p', 'top_k', 'output_format']) if (k in req) out.push(`has ${k}`);
  if (req.thinking && req.thinking.type !== 'adaptive') out.push(`thinking ${JSON.stringify(req.thinking)}`);
  if (req.tool_choice && ['any', 'tool'].includes(req.tool_choice.type)) out.push('forced tool_choice');
  const msgs = req.messages ?? [];
  if (!msgs.length || msgs[0].role !== 'user') out.push('first message is not user');
  // آخر رسالة assistant = prefill، إلا لو كانت متابعة pause_turn (آخر كتلة server_tool_use)
  const last = msgs[msgs.length - 1];
  if (last?.role === 'assistant') {
    const blocks = Array.isArray(last.content) ? last.content : [];
    if (!blocks.some((b) => b.type === 'server_tool_use')) out.push('assistant prefill');
  }
  return out;
}

export const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };
/** فيه fallbacks: "default" مع رأس البيتا الصحيح؟ */
export const hasFallback = (req) => req.fallbacks === 'default' && JSON.stringify(req.betas) === JSON.stringify(FALLBACK.betas);
/** بدون fallbacks ولا رأسها */
export const noFallback = (req) => !('fallbacks' in req) && !(req.betas ?? []).some((b) => /fallback/.test(b));
