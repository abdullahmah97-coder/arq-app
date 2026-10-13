// بديل @anthropic-ai/sdk لاختبار دوال الذكاء الاصطناعي (office-agent والدوال الخمس) بدون إنترنت: يسجّل كل طلب ويرد بالرد اللي يحدده الاختبار.
// الحالة وأصناف الأخطاء على globalThis لأن esbuild يدمج نسخة ثانية من هذا الملف داخل الحزمة
// (عشان instanceof يشتغل بين نسخة الاختبار ونسخة الدالة).
//
// الرد: anth.respond(params) لو موجودة، وإلا أول عنصر في anth.script. العنصر واحد من:
//   { json: {...} } أو { text: '...' }      → stop_reason: end_turn
//   { refusal: true }                     → stop_reason: refusal بدون محتوى
//   { truncated: true }                   → stop_reason: max_tokens بنص ناقص
//   { throw: 'timeout' | 'api' }          → يرمي APIConnectionTimeoutError أو APIError (500)
//   { model: '...' }                      → اسم النموذج اللي رد (مثلاً بعد التحويل للبديل)
// إضافات للدوال الخمس (ما تغيّر شي من فوق):
//   { throw: 'rate_limit' | 'bad_request' | 'connection', message? } → RateLimitError (429) / BadRequestError (400) / APIConnectionError
//   { pause: true, content? }             → stop_reason: pause_turn (المحتوى افتراضياً بحث ويب ما خلص)
//   { content: [...], stop? }             → محتوى الرد كما هو (stop_reason: stop أو end_turn)
//   { stop: '...' }                       → stop_reason مخصص (مثلاً model_context_window_exceeded)
//   { category: '...' }                   → stop_details.category مع refusal
//   { usage: {...} }                      → توكنات الرد (افتراضياً: ١٠٠ دخل و٥٠ خرج)
//   anth.options                          → خيارات كل طلب (الوسيط الثاني لـ create، مثل timeout)
export const anth = (globalThis.__anthMock ??= {
  requests: [], clients: [], script: [], respond: null, delayMs: 0, inFlight: 0, maxInFlight: 0, options: [],
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
  class BadRequestError extends APIError {}
  class RateLimitError extends APIError {}
  class InternalServerError extends APIError {}
  return { AnthropicError, APIError, APIConnectionError, APIConnectionTimeoutError, BadRequestError, RateLimitError, InternalServerError };
})());

export function resetAnthropic() {
  Object.assign(anth, { requests: [], clients: [], script: [], respond: null, delayMs: 0, inFlight: 0, maxInFlight: 0, options: [] });
}

function reply(step, params) {
  if (!step) throw new Error('unexpected Anthropic request');
  if (step.throw === 'timeout') throw new errors.APIConnectionTimeoutError();
  if (step.throw === 'rate_limit') throw new errors.RateLimitError(429, step.message ?? 'Rate limited');
  if (step.throw === 'bad_request') throw new errors.BadRequestError(400, step.message ?? 'Bad request');
  if (step.throw === 'connection') throw new errors.APIConnectionError();
  if (step.throw) throw new errors.APIError(500, 'Internal server error');
  const model = step.model ?? params.model;
  const usage = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...step.usage };
  if (step.refusal) return { id: 'msg', type: 'message', role: 'assistant', model, stop_reason: 'refusal', stop_details: { type: 'refusal', category: step.category ?? null, explanation: null }, content: [], usage };
  if (step.truncated) return { id: 'msg', type: 'message', role: 'assistant', model, stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"summary":{"ar":"ملخ' }], usage };
  if (step.pause) return { id: 'msg', type: 'message', role: 'assistant', model, stop_reason: 'pause_turn', stop_details: null, usage,
    content: step.content ?? [{ type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'q' } }] };
  if (step.content) return { id: 'msg', type: 'message', role: 'assistant', model, stop_reason: step.stop ?? 'end_turn', stop_details: null, content: step.content, usage };
  const text = step.text ?? JSON.stringify(step.json);
  return { id: 'msg', type: 'message', role: 'assistant', model, stop_reason: step.stop ?? 'end_turn', stop_details: null, content: [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text }], usage };
}

export default class Anthropic {
  static AnthropicError = errors.AnthropicError;
  static APIError = errors.APIError;
  static APIConnectionError = errors.APIConnectionError;
  static APIConnectionTimeoutError = errors.APIConnectionTimeoutError;
  static BadRequestError = errors.BadRequestError;
  static RateLimitError = errors.RateLimitError;
  static InternalServerError = errors.InternalServerError;

  constructor(opts = {}) {
    anth.clients.push(opts);
    this.messages = { create: async () => { throw new Error('use client.beta.messages.create'); } };
    this.beta = {
      messages: {
        create: async (params, options) => {
          anth.requests.push(structuredClone(params));
          anth.options.push(options ?? null);
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
