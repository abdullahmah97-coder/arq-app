import {
  barcodeCandidates, canonicalBarcode, defaultPortion, fromAiLookup, parseOffProduct, portionMacros, portions, productName, siteName, upcEtoA, validGtin,
} from '../src/lib/nutrition/barcode.ts';

let failed = 0;
const ok = (c: boolean, label: string) => { console.log(c ? 'ok  ' : 'FAIL', label); if (!c) { failed++; process.exitCode = 1; } };
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---- أرقام الباركود
ok(validGtin('3017620422003'), 'EAN-13 valid (Nutella)');
ok(!validGtin('3017620422004'), 'EAN-13 wrong check digit');
ok(validGtin('036000291452') && validGtin('96385074'), 'UPC-A and EAN-8 valid');
ok(!validGtin('12345') && !validGtin('30176204220a3'), 'bad length / letters');
ok(upcEtoA('04252614') === '042100005264' && validGtin('042100005264'), 'UPC-E expands to UPC-A');
ok(eq(barcodeCandidates('0036000291452', 'org.gs1.EAN-13'), ['0036000291452', '036000291452']), 'iPhone reads UPC-A as EAN-13 with a leading zero');
ok(eq(barcodeCandidates('036000291452', 'upc_a'), ['036000291452', '0036000291452']), 'UPC-A also tries the 13-digit form');
ok(eq(barcodeCandidates('04252614', 'upc_e'), ['04252614', '042100005264', '0042100005264']), 'UPC-E tries the expansions');
ok(eq(barcodeCandidates('96385074', 'ean8'), ['96385074']), 'EAN-8 stays as is');
ok(eq(barcodeCandidates(' 3017620 422003 '), ['3017620422003']), 'spaces around the digits are ignored');
ok(eq(barcodeCandidates('3017620422004'), []), 'misread (bad check digit) is ignored');

// ---- رد Open Food Facts
const nutella = {
  code: '3017620422003', status: 1, status_verbose: 'product found',
  product: {
    code: '3017620422003', brands: 'Nutella, Ferrero', product_name: 'Nutella', product_name_ar: 'نوتيلا', product_name_en: 'Nutella',
    product_quantity: 400, product_quantity_unit: 'g', quantity: '400 g',
    image_front_small_url: 'https://images.openfoodfacts.org/images/products/301/762/042/2003/front_en.879.200.jpg',
    nutriments: { 'energy-kcal_100g': 539, 'energy-kj_100g': 2252, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 },
  },
};
const p = parseOffProduct(nutella, '3017620422003')!;
ok(!!p && p.name_ar === 'نوتيلا' && p.brand === 'Nutella' && p.unit === 'g' && p.packageSize === 400 && p.servingSize === null, 'parses name, brand, unit and pack size');
ok(eq(p.per100, { kcal: 539, protein_g: 6.3, carbs_g: 57.5, fat_g: 30.9 }), 'per 100 g values');
ok(productName(p, 'ar') === 'نوتيلا · Nutella' && productName(p, 'en') === 'Nutella', 'name with brand only when missing');
const list = portions(p);
ok(eq(list.map((x) => x.key), ['package', 'hundred']) && list[0].macros.kcal === 2156, 'portions: whole jar and 100 g');
ok(defaultPortion(list)!.key === 'hundred', 'a 400 g jar defaults to 100 g, not the whole jar');
ok(eq(portionMacros(list[1], 0.5), { kcal: 270, protein_g: 3.2, carbs_g: 28.8, fat_g: 15.5 }), 'half of 100 g');

ok(parseOffProduct({ status: 0, status_verbose: 'product not found' }, '1') === null, 'not found → null');

const can = parseOffProduct({ status: 1, product: { product_name: 'Cola', quantity: '330ml', product_quantity: 330,
  nutriments: { 'energy-kcal_100g': 42, carbohydrates_100g: 10.6 } } }, '5449000000996')!;
ok(can.unit === 'ml' && defaultPortion(portions(can))!.key === 'package' && portions(can)[0].macros.kcal === 139, 'a 330 ml can defaults to the whole can');

const kj = parseOffProduct({ status: 1, product: { product_name: 'Bread', nutriments: { energy_100g: 1000, energy_unit: 'kJ', proteins_100g: 9 } } }, '1')!;
ok(kj.per100!.kcal === 239 && kj.per100!.protein_g === 9, 'kJ only → kcal');

const wrong = parseOffProduct({ status: 1, product: { product_name: 'Oil', nutriments: { 'energy-kcal_100g': 3700, 'energy-kj_100g': 3700, fat_100g: 100 } } }, '1')!;
ok(wrong.per100!.kcal === 884, 'kJ typed into the kcal field is fixed');

const bar = parseOffProduct({ status: 1, product: { product_name: 'Protein bar', serving_quantity: '60', serving_size: '60 g',
  nutriments: { 'energy-kcal_100g': 350, proteins_100g: 33, carbohydrates_100g: 30, fat_100g: 12 } } }, '1')!;
const barList = portions(bar);
ok(defaultPortion(barList)!.key === 'serving' && barList[0].amount === 60 && barList[0].macros.kcal === 210 && barList[0].macros.protein_g === 19.8, 'serving from per-100 values');
ok(eq(portionMacros(barList[0], 2), { kcal: 420, protein_g: 39.6, carbs_g: 36, fat_g: 14.4 }), 'two servings');

const servingOnly = parseOffProduct({ status: 1, product: { product_name: 'Laban', nutriments: { 'energy-kcal_serving': 120, proteins_serving: 6 } } }, '1')!;
ok(servingOnly.per100 === null && eq(portions(servingOnly).map((x) => [x.key, x.amount, x.macros.kcal]), [['serving', null, 120]]), 'per-serving values only');

const empty = parseOffProduct({ status: 1, product: { product_name: 'Mystery', nutriments: {} } }, '1')!;
ok(!!empty && portions(empty).length === 0 && defaultPortion(portions(empty)) === null, 'product without values has no portions');

const litre = parseOffProduct({ status: 1, product: { product_name: 'Milk', quantity: '1 L', nutriments: { 'energy-kcal_100g': 61 } } }, '1')!;
ok(litre.unit === 'ml', '«1 L» is a liquid');
const arabicMl = parseOffProduct({ status: 1, product: { product_name: 'لبن', quantity: '200 مل', nutriments: { 'energy-kcal_100g': 40 } } }, '1')!;
ok(arabicMl.unit === 'ml', '«200 مل» is a liquid');

// ---- رد بحث الذكاء الاصطناعي
const ai = fromAiLookup('6281234567895', { found: true, confidence: 'high', source_url: 'https://www.carrefourksa.com/p/123',
  product: { name_ar: 'لبن كامل الدسم', name_en: 'Full Fat Laban', brand: 'Test', unit: 'ml', servingSize: 180, packageSize: 180,
    per100: { kcal: 60, protein_g: 3.1, carbs_g: 4.6, fat_g: 3.2 }, perServing: null } })!;
ok(!!ai && ai.source === 'ai' && ai.confidence === 'high' && ai.unit === 'ml' && ai.per100!.kcal === 60, 'AI result becomes a product');
ok(defaultPortion(portions(ai))!.key === 'serving' && portions(ai)[0].macros.kcal === 108, 'AI product portions work (180 ml laban)');
ok(siteName(ai.sourceUrl) === 'carrefourksa.com' && siteName('javascript:x') === null && siteName(null) === null, 'site name from the source link');
ok(fromAiLookup('1', { found: false }) === null, 'AI not found → null');
ok(fromAiLookup('1', { found: true, product: { name_en: 'X', per100: { kcal: 3000 } } }) === null, 'AI impossible values → null');
const bad = fromAiLookup('1', { found: true, confidence: 'sure', source_url: 'http://x.com', product: { name_en: 'Bar', perServing: { kcal: 200, protein_g: 20 } } })!;
ok(bad.confidence === 'low' && bad.sourceUrl === null && portions(bad)[0].macros.kcal === 200, 'unknown confidence → low, http link dropped');
ok(canonicalBarcode('04252614', 'upc_e') === '042100005264' && canonicalBarcode('3017620422003') === '3017620422003' && canonicalBarcode('123') === null, 'canonical code for the AI search');

console.log(failed ? `${failed} FAILED` : 'all barcode checks passed');
