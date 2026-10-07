// بديل @anthropic-ai/sdk لاختبار دالة office-agent بدون إنترنت: يسجّل كل طلب ويرد بالرد اللي يحدده الاختبار.
// الحالة وأصناف الأخطاء على globalThis لأن esbuild يدمج نسخة ثانية من هذا الملف داخل الحزمة
// (عشان instanceof يشتغل بين نسخة الاختبار ونسخة الدالة).
//
// الرد: anth.respond(params) لو موجودة، وإلا أول عنصر في anth.script. العنصر واحد من:
//   { json: {...} } أو { text: '...' }      → stop_reason: end_turn
//   { refusal: true }                     → stop_reason: refusal بدون محتوى
//   { truncated: true }                   → stop_reason: max_tokens بنص ناقص
//   { throw: 'timeout' | 'api' }          → يرمي APIConnectionTimeoutError أو APIError (500)
//   { model: '...' }                      → اسم النموذج اللي رد (مثلاً بعد التحويل للبديل)
export const anth = (globalThis.__anthMock ??= {
  requests: [], clients: [], script: [], respond: null, delayMs: 0, inFlight: 0, maxInFlight: 0,
});

export const errors = (globalThis.__anthErrors ??= (() => {
  class AnthropicError extends Error {}
  class APIError extends AnthropicError {
    constructor(status, message) { super(message); this.status = status; }
  }
  class APIConnectionError extends APIError {
    constructor(message = 'Connection error.') { super(undefined, message); }
  }
  class APIConnectionTimeoutError extends APIConnectionError {
    constructor() { super('Request timed out.'); }
  }
  return { AnthropicError, APIError, APIConnectionError, APIConnectionTimeoutError };
})());

export function resetAnthropic() {
  Object.assign(anth, { requests: [], clients: [], script: [], respond: null, delayMs: 0, inFlight: 0, maxInFlight: 0 });
}

function reply(step, params) {
  if (!step) throw new Error('unexpected Anthropic request');
  if (step.throw === 'timeout') throw new errors.APIConnectionTimeoutError();
  if (step.throw) throw new errors.APIError(500, 'Internal server error');
  const model = step.model ?? params.model;
  if (step.refusal) return { id: 'msg', type: 'message', role: 'assistant', model, stop_reason: 'refusal', stop_details: { type: 'refusal', category: null, explanation: null }, content: [] };
  if (step.truncated) return { id: 'msg', type: 'message', role: 'assistant', model, stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"summary":{"ar":"ملخ' }] };
  const text = step.text ?? JSON.stringify(step.json);
  return { id: 'msg', type: 'message', role: 'assistant', model, stop_reason: 'end_turn', stop_details: null, content: [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text }] };
}

export default class Anthropic {
  static AnthropicError = errors.AnthropicError;
  static APIError = errors.APIError;
  static APIConnectionError = errors.APIConnectionError;
  static APIConnectionTimeoutError = errors.APIConnectionTimeoutError;

  constructor(opts = {}) {
    anth.clients.push(opts);
    this.messages = { create: async () => { throw new Error('use client.beta.messages.create'); } };
    this.beta = {
      messages: {
        create: async (params) => {
          anth.requests.push(structuredClone(params));
          anth.inFlight++;
          anth.maxInFlight = Math.max(anth.maxInFlight, anth.inFlight);
          try {
            if (anth.delayMs) await new Promise((r) => setTimeout(r, anth.delayMs));
            const step = anth.respond ? anth.respond(params) : anth.script.shift();
            return reply(step, params);
          } finally {
            anth.inFlight--;
          }
        },
      },
    };
  }
}
