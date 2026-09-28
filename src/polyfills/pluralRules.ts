// محرك الجوال (Hermes) ما فيه Intl.PluralRules، فكانت i18next ما تفرّق بين «يوم / يومين / أيام».
// هذا تعويض صغير للعربي والإنجليزي فقط (قواعد CLDR)، ويشتغل بس لو الدالة ناقصة.
type Cat = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
type Opts = { type?: 'cardinal' | 'ordinal' };

function arCardinal(n: number): Cat {
  if (!Number.isInteger(n)) return 'other';
  const m = Math.abs(n) % 100;
  if (n === 0) return 'zero';
  if (n === 1) return 'one';
  if (n === 2) return 'two';
  if (m >= 3 && m <= 10) return 'few';
  if (m >= 11 && m <= 99) return 'many';
  return 'other';
}

function enCardinal(n: number): Cat {
  return n === 1 ? 'one' : 'other';
}

function enOrdinal(n: number): Cat {
  const m10 = Math.abs(n) % 10;
  const m100 = Math.abs(n) % 100;
  if (m10 === 1 && m100 !== 11) return 'one';
  if (m10 === 2 && m100 !== 12) return 'two';
  if (m10 === 3 && m100 !== 13) return 'few';
  return 'other';
}

class PluralRulesLite {
  private lang: 'ar' | 'en';
  private type: 'cardinal' | 'ordinal';
  constructor(locales?: string | string[], opts: Opts = {}) {
    const first = String((Array.isArray(locales) ? locales[0] : locales) ?? 'en').toLowerCase();
    this.lang = first.startsWith('ar') ? 'ar' : 'en';
    this.type = opts.type === 'ordinal' ? 'ordinal' : 'cardinal';
  }
  select(n: number): Cat {
    const v = Number(n);
    if (!Number.isFinite(v)) return 'other';
    if (this.type === 'ordinal') return this.lang === 'en' ? enOrdinal(v) : 'other';
    return this.lang === 'ar' ? arCardinal(v) : enCardinal(v);
  }
  resolvedOptions() {
    const pluralCategories: Cat[] = this.type === 'ordinal'
      ? (this.lang === 'en' ? ['one', 'two', 'few', 'other'] : ['other'])
      : (this.lang === 'ar' ? ['zero', 'one', 'two', 'few', 'many', 'other'] : ['one', 'other']);
    return { locale: this.lang, type: this.type, pluralCategories };
  }
  static supportedLocalesOf(locales?: string | string[]) {
    return (Array.isArray(locales) ? locales : locales ? [locales] : []).filter((l) => /^(ar|en)\b/i.test(l));
  }
}

const I = (globalThis as { Intl?: Record<string, unknown> }).Intl;
if (I && typeof I.PluralRules !== 'function') {
  I.PluralRules = PluralRulesLite;
}

export { PluralRulesLite };
