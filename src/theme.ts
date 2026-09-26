// هوية ARQ | أرك — الألوان والخطوط مأخوذة حرفياً من دليل الهوية (Brand Guideline 2025)

/** ألوان العلامة الستة */
export const brand = {
  deepGreen: '#0A332D', // النخيل — الأساسي الداكن
  green: '#2F4B3C',     // الواحة
  orange: '#F1551D',    // الكثبان — لون الحركة الأساسي
  amber: '#FEA94F',     // الرمال الذهبية
  sand: '#F7DFBB',      // الطين
  cream: '#F8EDDA',     // الصحراء الفاتحة — الخلفية
};

/** التدرجات المعتمدة (من الأعلى للأسفل) */
export const gradients = {
  dune: [brand.deepGreen, brand.orange, brand.amber, brand.cream] as const,  // أخضر ← برتقالي ← كهرماني ← كريمي
  ember: [brand.deepGreen, brand.orange] as const,
  sunset: [brand.orange, brand.amber] as const,
  oasis: [brand.deepGreen, brand.amber, brand.cream] as const,
  glow: [brand.orange, brand.amber, brand.cream] as const,
  sand: [brand.amber, brand.cream] as const,
};

export const colors = {
  bg: brand.cream,
  card: '#FCF5EA',
  cardAlt: brand.sand,
  border: '#EBD5B3',
  text: brand.deepGreen,
  muted: '#5B7066',
  primary: brand.orange,
  onPrimary: brand.cream,
  accent: brand.green,
  fire: brand.orange,
  danger: '#C23A12',
  success: brand.green,
  gold: brand.amber,
  silver: '#9AA69E',
  bronze: '#B9763E',
  // شريط التبويبات بالأخضر الداكن كما في تطبيقات الهوية (حقيبة الجيم)
  tabBar: brand.deepGreen,
  tabActive: brand.amber,
  tabInactive: 'rgba(248,237,218,0.55)',
};

/**
 * الخطوط حسب دليل الهوية:
 *  • العربي: Noto Kufi Arabic — Bold للعناوين و Light للنصوص
 *  • الإنجليزي: Avenir Next — Demi Bold للعناوين و Medium للنصوص
 *  • الأرقام الكبيرة (مؤشرات، نقاط): Noah Bold
 * تتبدّل تلقائياً مع لغة التطبيق (setFontLang تُستدعى من i18n).
 */
const KUFI = { title: 'NotoKufiArabic_700Bold', semibold: 'NotoKufiArabic_600SemiBold', body: 'NotoKufiArabic_300Light', regular: 'NotoKufiArabic_400Regular' };
const AVENIR = { title: 'AvenirNext-DemiBold', semibold: 'AvenirNext-DemiBold', body: 'AvenirNext-Medium', regular: 'AvenirNext-Regular' };
let fontLang: 'ar' | 'en' = 'ar';
export function setFontLang(lng: string) { fontLang = lng.startsWith('en') ? 'en' : 'ar'; }
export const isLatinUI = () => fontLang === 'en';
export const fonts = {
  get title() { return (fontLang === 'en' ? AVENIR : KUFI).title; },
  get semibold() { return (fontLang === 'en' ? AVENIR : KUFI).semibold; },
  get body() { return (fontLang === 'en' ? AVENIR : KUFI).body; },
  get regular() { return (fontLang === 'en' ? AVENIR : KUFI).regular; },
  /** أرقام العرض الكبيرة (لاتينية فقط) */
  display: 'Noah-Bold',
  kufiBold: KUFI.title,
};

/** ملفات الخطوط التي تُحمَّل عند الإقلاع */
export const fontAssets = {
  'AvenirNext-DemiBold': require('../assets/fonts/AvenirNext-DemiBold.ttf'),
  'AvenirNext-Medium': require('../assets/fonts/AvenirNext-Medium.ttf'),
  'AvenirNext-Regular': require('../assets/fonts/AvenirNext-Regular.ttf'),
  'Noah-Bold': require('../assets/fonts/Noah-Bold.otf'),
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
// الهوية هندسية وحادّة (مستوحاة من السدو) — زوايا صغيرة
export const radius = { sm: 4, md: 6, lg: 10, pill: 999 };
export const font = { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, xxl: 28, huge: 40 };

/** الوضع الغامر (الرئيسية والصحة): أخضر النخيل الداكن مع لمعة البرتقالي — مثل صفحات الغلاف في دليل الهوية */
export const night = {
  bg: '#061F1B',
  bg2: '#0A332D',
  statusBar: 'light' as 'light' | 'dark',
  /** لون النصوص التفاعلية على خلفية الوضع الغامر */
  accent: '#FEA94F',
  card: 'rgba(248,237,218,0.06)',
  cardStrong: 'rgba(248,237,218,0.10)',
  line: 'rgba(248,237,218,0.12)',
  text: brand.cream,
  muted: 'rgba(248,237,218,0.62)',
  faint: 'rgba(248,237,218,0.35)',
};

/** ألوان مؤشرات الصحة (من ألوان الهوية فقط) */
export const pulse = {
  green: '#7FB77E',   // جاهزية عالية (مشتق من أخضر الواحة بإضاءة أعلى للقراءة على الداكن)
  yellow: brand.amber as string,
  red: brand.orange,
  strain: brand.orange,
  sleep: brand.sand as string,
  steps: brand.amber as string,
};

/** المساحة أسفل المحتوى حتى لا يغطيه شريط التبويب العائم */
export const TAB_BAR_SPACE = 116;

// ---------------------------------------------------------------------------
// ثيمات لون التطبيق — كلها من درجات ألوان دليل الهوية (Brand Colors + Gradient Variation)
// ---------------------------------------------------------------------------
export type ThemeId = 'palm' | 'oasis' | 'dune' | 'sand';
type Overrides = { brand?: Partial<typeof brand>; night?: Partial<typeof night>; colors?: Partial<typeof colors>; pulse?: Partial<typeof pulse> };
export const THEMES: Record<ThemeId, { name: { ar: string; en: string }; swatch: [string, string, string] } & Overrides> = {
  palm: { name: { ar: 'النخيل', en: 'Palm' }, swatch: ['#0A332D', '#F1551D', '#FEA94F'] },
  oasis: {
    name: { ar: 'الواحة', en: 'Oasis' }, swatch: ['#2F4B3C', '#FEA94F', '#F7DFBB'],
    brand: { deepGreen: '#2F4B3C', green: '#4E6E5B' },
    night: { bg: '#15241D', bg2: '#2F4B3C' },
    colors: { muted: '#5E7466', border: '#E6D3B2' },
  },
  dune: {
    name: { ar: 'الكثبان', en: 'Dune' }, swatch: ['#6E2A10', '#F1551D', '#FEA94F'],
    brand: { deepGreen: '#5C230D', green: '#8C3A17' },
    night: { bg: '#2A0E04', bg2: '#5C230D' },
    colors: { muted: '#7A5B4B', border: '#EFCFAE' },
  },
  sand: {
    name: { ar: 'الرمال', en: 'Sand' }, swatch: ['#F7DFBB', '#FEA94F', '#0A332D'],
    night: {
      bg: '#F8EDDA', bg2: '#F7DFBB', statusBar: 'dark',
      card: 'rgba(10,51,45,0.05)', cardStrong: 'rgba(10,51,45,0.08)', line: 'rgba(10,51,45,0.12)',
      text: '#0A332D', muted: 'rgba(10,51,45,0.68)', faint: 'rgba(10,51,45,0.42)', accent: '#D2480F',
    },
    pulse: { sleep: '#2F4B3C', yellow: '#D9822B', steps: '#D9822B' },
  },
};

const BASE = { brand: { ...brand }, night: { ...night }, colors: { ...colors }, pulse: { ...pulse } };
export let currentTheme: ThemeId = 'palm';

/** يطبّق الثيم بتعديل رموز الألوان في مكانها (تُقرأ عند الرسم) — يُتبعه إعادة تركيب الواجهة */
export function applyTheme(id: ThemeId) {
  const t = THEMES[id] ?? THEMES.palm;
  currentTheme = THEMES[id] ? id : 'palm';
  Object.assign(brand, BASE.brand, t.brand);
  Object.assign(night, BASE.night, t.night);
  Object.assign(pulse, BASE.pulse, t.pulse);
  Object.assign(colors, BASE.colors, {
    bg: brand.cream, cardAlt: brand.sand, text: brand.deepGreen, primary: brand.orange, onPrimary: brand.cream,
    accent: brand.green, fire: brand.orange, success: brand.green, gold: brand.amber, tabBar: brand.deepGreen, tabActive: brand.amber,
  }, t.colors);
  const g = gradients as unknown as Record<string, string[]>;
  g.dune = [brand.deepGreen, brand.orange, brand.amber, brand.cream];
  g.ember = [brand.deepGreen, brand.orange];
  g.sunset = [brand.orange, brand.amber];
  g.oasis = [brand.deepGreen, brand.amber, brand.cream];
  g.glow = [brand.orange, brand.amber, brand.cream];
  g.sand = [brand.amber, brand.cream];
}
