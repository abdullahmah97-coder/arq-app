// بعض محركات JavaScript على الجوال ما فيها TextDecoder، وقارئ نماذج GLB (three.js) يحتاجه لقراءة ملف النموذج
const g = globalThis as { TextDecoder?: unknown };

if (typeof g.TextDecoder === 'undefined') {
  class Utf8Decoder {
    readonly encoding = 'utf-8';
    decode(input?: ArrayBuffer | ArrayBufferView): string {
      if (!input) return '';
      const b = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      let out = '';
      let i = 0;
      if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) i = 3; // BOM
      const chunk: number[] = [];
      const flush = () => { out += String.fromCharCode.apply(null, chunk); chunk.length = 0; };
      while (i < b.length) {
        const c = b[i++];
        let cp: number;
        if (c < 0x80) cp = c;
        else if (c < 0xe0) cp = ((c & 0x1f) << 6) | (b[i++] & 0x3f);
        else if (c < 0xf0) cp = ((c & 0x0f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f);
        else cp = ((c & 0x07) << 18) | ((b[i++] & 0x3f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f);
        if (cp > 0xffff) { cp -= 0x10000; chunk.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff)); } else chunk.push(cp);
        if (chunk.length > 8000) flush();
      }
      flush();
      return out;
    }
  }
  g.TextDecoder = Utf8Decoder;
}

export {};
