// قاعدة أطعمة مختصرة لحساب السعرات (قيم تقريبية لكل حصة، من جداول التغذية المعتمدة مثل USDA ومتوسطات الأطباق الشعبية)
// kcal / بروتين / كربوهيدرات / دهون — للحصة المذكورة. المستخدم يقدر يغيّر عدد الحصص أو الوزن بالجرام.
import type { I18nText } from '../types';

export type FoodCategory = 'dishes' | 'grains' | 'protein' | 'dairy' | 'fruit' | 'veg' | 'nuts' | 'drinks' | 'sweets' | 'fast';

export interface Food {
  id: string;
  name: I18nText;
  serving: I18nText;
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  cat: FoodCategory;
}

type Row = [id: string, ar: string, en: string, servingAr: string, servingEn: string, grams: number, kcal: number, p: number, c: number, f: number];

const DATA: Record<FoodCategory, Row[]> = {
  dishes: [
    ['kabsa_chicken', 'كبسة دجاج', 'Chicken kabsa', 'صحن (رز + ربع دجاجة)', 'plate (rice + quarter chicken)', 450, 750, 40, 85, 26],
    ['kabsa_lamb', 'كبسة لحم', 'Lamb kabsa', 'صحن', 'plate', 450, 850, 42, 82, 38],
    ['mandi_chicken', 'مندي دجاج', 'Chicken mandi', 'صحن', 'plate', 450, 720, 42, 80, 24],
    ['mandi_lamb', 'مندي لحم', 'Lamb mandi', 'صحن', 'plate', 450, 860, 45, 80, 39],
    ['kabsa_rice', 'رز كبسة (بدون لحم)', 'Kabsa rice (no meat)', 'كوب', 'cup', 180, 300, 6, 50, 8],
    ['saleeg', 'سليق', 'Saleeg', 'صحن', 'plate', 350, 480, 25, 55, 17],
    ['jareesh', 'جريش', 'Jareesh', 'صحن', 'bowl', 250, 260, 9, 40, 7],
    ['harees', 'هريس', 'Harees', 'صحن', 'bowl', 250, 320, 18, 40, 9],
    ['margoog', 'مرقوق', 'Margoog', 'صحن', 'bowl', 300, 380, 18, 45, 13],
    ['mutabbaq', 'مطبق لحم', 'Meat mutabbaq', 'حبة', 'piece', 200, 520, 20, 40, 31],
    ['foul', 'فول مدمس', 'Ful medames (fava beans)', 'كوب', 'cup', 250, 260, 13, 35, 8],
    ['falafel', 'فلافل', 'Falafel', '٥ حبات', '5 pieces', 85, 285, 11, 27, 15],
    ['hummus', 'حمص بالطحينة', 'Hummus', 'نصف كوب', 'half cup', 120, 200, 9.5, 17, 11.5],
    ['shakshuka', 'شكشوكة (بيضتين)', 'Shakshuka (2 eggs)', 'صحن', 'plate', 250, 280, 14, 12, 19],
    ['omelette', 'أومليت بيضتين', '2-egg omelette', 'حبة', 'serving', 120, 190, 13, 1, 15],
    ['sambousa', 'سمبوسة لحم', 'Meat sambousa', 'حبة', 'piece', 50, 150, 5, 13, 9],
    ['fatayer_zaatar', 'فطيرة زعتر', "Za'atar manakish", 'حبة', 'piece', 100, 290, 7, 38, 12],
    ['fatayer_cheese', 'فطيرة جبن', 'Cheese manakish', 'حبة', 'piece', 120, 380, 14, 40, 18],
    ['bamia', 'بامية باللحم', 'Okra stew with meat', 'كوب', 'cup', 250, 180, 12, 14, 8],
    ['molokhia', 'ملوخية', 'Molokhia', 'كوب', 'cup', 250, 120, 6, 10, 6],
    ['lentil_soup', 'شوربة عدس', 'Lentil soup', 'كوب', 'cup', 250, 180, 10, 28, 3.5],
    ['oats_soup', 'شوربة شوفان', 'Oat soup', 'كوب', 'cup', 250, 150, 7, 20, 5],
    ['grape_leaves', 'ورق عنب', 'Stuffed grape leaves', '٦ حبات', '6 pieces', 120, 200, 3.5, 25, 10],
    ['fattoush', 'فتوش', 'Fattoush', 'صحن', 'bowl', 200, 180, 3, 18, 11],
    ['tabbouleh', 'تبولة', 'Tabbouleh', 'كوب', 'cup', 160, 190, 3, 15, 13],
  ],
  grains: [
    ['rice_white', 'رز أبيض مطبوخ', 'White rice (cooked)', 'كوب', 'cup', 160, 206, 4.3, 45, 0.4],
    ['rice_brown', 'رز بني مطبوخ', 'Brown rice (cooked)', 'كوب', 'cup', 195, 218, 4.5, 46, 1.6],
    ['bread_arabic', 'خبز عربي', 'Arabic pita bread', 'رغيف', 'loaf', 60, 165, 5.5, 33, 0.7],
    ['bread_brown_arabic', 'خبز بر', 'Whole-wheat pita', 'رغيف', 'loaf', 60, 155, 6, 31, 1.5],
    ['tamees', 'خبز تميس', 'Tamees bread', 'رغيف', 'loaf', 150, 400, 12, 78, 4],
    ['samoli', 'خبز صامولي', 'Samoli roll', 'حبة', 'roll', 70, 190, 6, 36, 2.5],
    ['toast_white', 'توست أبيض', 'White toast', 'شريحة', 'slice', 28, 75, 2.5, 14, 1],
    ['toast_brown', 'توست بر', 'Whole-wheat toast', 'شريحة', 'slice', 30, 75, 3.5, 13, 1],
    ['croissant', 'كرواسون', 'Croissant', 'حبة', 'piece', 60, 245, 5, 27, 13],
    ['oats', 'شوفان', 'Oats (dry)', 'نصف كوب', 'half cup', 40, 150, 5, 27, 2.5],
    ['pasta', 'مكرونة مطبوخة', 'Pasta (cooked)', 'كوب', 'cup', 140, 220, 8, 43, 1.3],
    ['potato_boiled', 'بطاطس مسلوقة', 'Boiled potato', 'حبة متوسطة', 'medium', 170, 150, 3.5, 34, 0.2],
    ['sweet_potato', 'بطاطا حلوة مشوية', 'Baked sweet potato', 'حبة متوسطة', 'medium', 130, 115, 2, 27, 0.2],
    ['corn_flakes', 'كورن فليكس', 'Corn flakes', 'كوب', 'cup', 30, 110, 2, 25, 0.2],
    ['granola', 'جرانولا', 'Granola', 'نصف كوب', 'half cup', 60, 270, 6, 38, 11],
    ['quinoa', 'كينوا مطبوخة', 'Quinoa (cooked)', 'كوب', 'cup', 185, 222, 8, 39, 3.6],
    ['freekeh', 'فريكة مطبوخة', 'Freekeh (cooked)', 'كوب', 'cup', 160, 200, 7, 40, 1.5],
  ],
  protein: [
    ['chicken_breast', 'صدر دجاج مشوي', 'Grilled chicken breast', '١٠٠ جم', '100 g', 100, 165, 31, 0, 3.6],
    ['chicken_quarter', 'ربع دجاجة مشوية', 'Grilled quarter chicken', 'ربع', 'quarter', 180, 380, 44, 0, 22],
    ['beef_steak', 'ستيك لحم', 'Beef steak (lean)', '١٠٠ جم', '100 g', 100, 220, 30, 0, 11],
    ['beef_minced', 'لحم مفروم مطبوخ', 'Ground beef (cooked)', '١٠٠ جم', '100 g', 100, 270, 26, 0, 18],
    ['lamb', 'لحم غنم مطبوخ', 'Lamb (cooked)', '١٠٠ جم', '100 g', 100, 280, 25, 0, 20],
    ['kofta', 'كفتة مشوية', 'Grilled kofta', '٣ أصابع', '3 skewers', 120, 330, 24, 4, 24],
    ['salmon', 'سلمون', 'Salmon', '١٠٠ جم', '100 g', 100, 206, 22, 0, 12],
    ['hamour', 'هامور مشوي', 'Grilled hammour', 'قطعة', 'fillet', 150, 177, 37, 0, 2],
    ['shrimp', 'روبيان مطبوخ', 'Cooked shrimp', '١٠٠ جم', '100 g', 100, 99, 24, 0.2, 0.3],
    ['tuna_water', 'تونة بالماء', 'Tuna in water', 'علبة مصفاة', 'can, drained', 120, 130, 29, 0, 1],
    ['tuna_oil', 'تونة بالزيت', 'Tuna in oil', 'علبة مصفاة', 'can, drained', 120, 230, 32, 0, 10],
    ['egg', 'بيض مسلوق', 'Boiled egg', 'حبة', 'egg', 50, 78, 6.3, 0.6, 5.3],
    ['egg_white', 'بياض بيض', 'Egg white', 'بياض حبة', 'white of 1 egg', 33, 17, 3.6, 0.2, 0],
    ['turkey', 'شرائح ديك رومي', 'Turkey slices', '٣ شرائح', '3 slices', 50, 55, 9, 2, 1],
    ['liver', 'كبدة مقلية', 'Pan-fried liver', 'صحن صغير', 'small plate', 150, 290, 36, 7, 12],
  ],
  dairy: [
    ['milk_full', 'حليب كامل الدسم', 'Whole milk', 'كوب', 'cup', 244, 150, 8, 12, 8],
    ['milk_low', 'حليب قليل الدسم', 'Low-fat milk', 'كوب', 'cup', 244, 105, 8, 12, 2.4],
    ['laban', 'لبن', 'Laban (buttermilk)', 'كوب', 'cup', 240, 100, 8, 12, 2.5],
    ['yogurt_full', 'زبادي كامل الدسم', 'Full-fat yogurt', 'علبة', 'cup', 170, 105, 6, 8, 5.5],
    ['greek_yogurt', 'زبادي يوناني قليل الدسم', 'Greek yogurt (non-fat)', 'علبة', 'cup', 170, 100, 17, 6, 0.7],
    ['labneh', 'لبنة', 'Labneh', 'ملعقتين كبار', '2 tbsp', 30, 55, 2.5, 1.5, 4.5],
    ['feta', 'جبنة فيتا', 'Feta cheese', '٣٠ جم', '30 g', 30, 75, 4, 1.2, 6],
    ['cheddar', 'جبنة شيدر', 'Cheddar slice', 'شريحة', 'slice', 20, 80, 5, 0.3, 6.6],
    ['halloumi', 'حلومي مشوي', 'Grilled halloumi', '٥٠ جم', '50 g', 50, 160, 11, 1, 13],
    ['cream_cheese', 'جبنة مثلثات/كيري', 'Cream cheese portion', 'قطعة', 'portion', 20, 60, 1.3, 0.7, 6],
    ['cottage', 'جبنة قريش', 'Cottage cheese', 'نصف كوب', 'half cup', 113, 110, 12.5, 4, 5],
  ],
  fruit: [
    ['dates', 'تمر', 'Dates', '٣ تمرات', '3 dates', 30, 85, 0.8, 22, 0.1],
    ['banana', 'موز', 'Banana', 'حبة متوسطة', 'medium', 118, 105, 1.3, 27, 0.4],
    ['apple', 'تفاح', 'Apple', 'حبة متوسطة', 'medium', 182, 95, 0.5, 25, 0.3],
    ['orange', 'برتقال', 'Orange', 'حبة', 'medium', 131, 62, 1.2, 15.4, 0.2],
    ['watermelon', 'بطيخ', 'Watermelon', 'كوب مكعبات', 'cup, diced', 152, 46, 0.9, 11.5, 0.2],
    ['mango', 'مانجو', 'Mango', 'كوب مكعبات', 'cup, diced', 165, 99, 1.4, 25, 0.6],
    ['grapes', 'عنب', 'Grapes', 'كوب', 'cup', 151, 104, 1.1, 27, 0.2],
    ['strawberry', 'فراولة', 'Strawberries', 'كوب', 'cup', 152, 49, 1, 11.7, 0.5],
    ['pomegranate', 'رمان', 'Pomegranate', 'كوب حبوب', 'cup of arils', 174, 144, 2.9, 32.5, 2],
    ['avocado', 'أفوكادو', 'Avocado', 'نصف حبة', 'half', 100, 160, 2, 8.5, 14.7],
    ['figs', 'تين طازج', 'Fresh figs', '٢ حبة', '2 figs', 100, 74, 0.8, 19, 0.3],
    ['guava', 'جوافة', 'Guava', 'حبة', 'fruit', 55, 37, 1.4, 8, 0.5],
  ],
  veg: [
    ['green_salad', 'سلطة خضراء (بدون صوص)', 'Green salad (no dressing)', 'صحن', 'bowl', 150, 25, 1.5, 5, 0.2],
    ['salad_oil', 'سلطة بزيت الزيتون', 'Salad with olive oil', 'صحن', 'bowl', 165, 145, 1.5, 5, 14],
    ['cucumber', 'خيار', 'Cucumber', 'حبة', 'medium', 200, 30, 1.3, 7, 0.2],
    ['tomato', 'طماطم', 'Tomato', 'حبة', 'medium', 123, 22, 1.1, 4.8, 0.2],
    ['broccoli', 'بروكلي مطبوخ', 'Cooked broccoli', 'كوب', 'cup', 156, 55, 3.7, 11, 0.6],
    ['veg_saute', 'خضار سوتيه', 'Sautéed vegetables', 'كوب', 'cup', 150, 90, 3, 12, 4],
    ['carrot', 'جزر', 'Carrot', 'حبة', 'medium', 61, 25, 0.6, 6, 0.1],
  ],
  nuts: [
    ['almonds', 'لوز', 'Almonds', 'حفنة (٢٨ جم)', 'handful (28 g)', 28, 164, 6, 6, 14],
    ['peanuts', 'فول سوداني', 'Peanuts', 'حفنة (٢٨ جم)', 'handful (28 g)', 28, 161, 7.3, 4.6, 14],
    ['cashews', 'كاجو', 'Cashews', 'حفنة (٢٨ جم)', 'handful (28 g)', 28, 157, 5.2, 8.6, 12.4],
    ['walnuts', 'عين جمل', 'Walnuts', 'حفنة (٢٨ جم)', 'handful (28 g)', 28, 185, 4.3, 3.9, 18.5],
    ['pistachio', 'فستق', 'Pistachios', 'حفنة (٢٨ جم)', 'handful (28 g)', 28, 159, 5.7, 7.7, 12.8],
    ['peanut_butter', 'زبدة فول سوداني', 'Peanut butter', 'ملعقتين كبار', '2 tbsp', 32, 190, 7, 7, 16],
    ['olive_oil', 'زيت زيتون', 'Olive oil', 'ملعقة كبيرة', '1 tbsp', 14, 119, 0, 0, 13.5],
    ['tahini', 'طحينة', 'Tahini', 'ملعقة كبيرة', '1 tbsp', 15, 89, 2.6, 3.2, 8],
    ['butter', 'زبدة', 'Butter', 'ملعقة كبيرة', '1 tbsp', 14, 102, 0.1, 0, 11.5],
    ['honey', 'عسل', 'Honey', 'ملعقة كبيرة', '1 tbsp', 21, 64, 0.1, 17, 0],
    ['sugar', 'سكر', 'Sugar', 'ملعقة صغيرة', '1 tsp', 4, 16, 0, 4, 0],
  ],
  drinks: [
    ['arabic_coffee', 'قهوة عربية', 'Arabic coffee', 'فنجالين', '2 small cups', 100, 5, 0.2, 1, 0],
    ['tea_sugar', 'شاي بالسكر', 'Tea with sugar', 'كوب', 'cup', 200, 35, 0, 9, 0],
    ['karak', 'شاي كرك', 'Karak tea', 'كوب', 'cup', 200, 150, 3, 22, 5],
    ['americano', 'قهوة أمريكانو/سوداء', 'Americano / black coffee', 'كوب', 'cup', 350, 5, 0.3, 0.5, 0],
    ['latte', 'لاتيه', 'Latte', 'كوب وسط', 'medium', 350, 190, 12, 18, 7],
    ['cappuccino', 'كابتشينو', 'Cappuccino', 'كوب وسط', 'medium', 350, 130, 7, 11, 6],
    ['spanish_latte', 'سبانش لاتيه', 'Spanish latte', 'كوب وسط', 'medium', 350, 280, 9, 38, 10],
    ['orange_juice', 'عصير برتقال', 'Orange juice', 'كوب', 'cup', 248, 112, 1.7, 26, 0.5],
    ['soda', 'مشروب غازي', 'Soft drink', 'علبة', 'can', 355, 140, 0, 39, 0],
    ['soda_diet', 'مشروب غازي دايت', 'Diet soft drink', 'علبة', 'can', 355, 0, 0, 0, 0],
    ['energy', 'مشروب طاقة', 'Energy drink', 'علبة', 'can', 250, 110, 0, 27, 0],
    ['whey', 'بروتين واي (بالماء)', 'Whey protein (with water)', 'سكوب', 'scoop', 30, 120, 24, 3, 1.5],
    ['whey_milk', 'بروتين واي بالحليب', 'Whey protein with milk', 'سكوب + كوب حليب', 'scoop + cup milk', 275, 225, 32, 15, 4],
  ],
  sweets: [
    ['lugaimat', 'لقيمات', 'Lugaimat', '٥ حبات', '5 pieces', 75, 300, 4, 38, 15],
    ['kunafa', 'كنافة', 'Kunafa', 'قطعة', 'piece', 100, 380, 7, 45, 19],
    ['basbousa', 'بسبوسة', 'Basbousa', 'قطعة', 'piece', 70, 260, 3, 42, 9],
    ['maamoul', 'معمول', "Ma'amoul", 'حبة', 'piece', 40, 170, 2.5, 22, 8],
    ['chocolate', 'شوكولاتة بالحليب', 'Milk chocolate', 'لوح صغير', 'small bar', 45, 235, 3.4, 26, 13],
    ['chips', 'شيبس', 'Potato chips', 'كيس صغير', 'small bag', 28, 150, 2, 15, 10],
    ['biscuit', 'بسكويت دايجستف', 'Digestive biscuits', '٢ حبة', '2 biscuits', 30, 145, 2, 19, 7],
    ['cake', 'كيك', 'Cake', 'قطعة', 'slice', 80, 300, 3.5, 40, 14],
    ['donut', 'دونات', 'Glazed donut', 'حبة', 'donut', 60, 250, 3, 30, 14],
    ['ice_cream', 'آيسكريم', 'Ice cream', 'بولة', 'scoop', 66, 137, 2.3, 16, 7.3],
    ['protein_bar', 'بروتين بار', 'Protein bar', 'حبة', 'bar', 60, 220, 20, 23, 7],
    ['popcorn', 'فشار', 'Popcorn (air-popped)', '٣ أكواب', '3 cups', 24, 93, 3, 18.6, 1.1],
  ],
  fast: [
    ['shawarma_chicken', 'شاورما دجاج', 'Chicken shawarma', 'ساندويتش', 'sandwich', 250, 480, 28, 45, 20],
    ['shawarma_meat', 'شاورما لحم', 'Meat shawarma', 'ساندويتش', 'sandwich', 250, 540, 27, 44, 27],
    ['burger_beef', 'برجر لحم', 'Beef burger', 'ساندويتش', 'sandwich', 250, 540, 28, 45, 27],
    ['burger_chicken', 'برجر دجاج مقرمش', 'Crispy chicken burger', 'ساندويتش', 'sandwich', 230, 520, 24, 50, 25],
    ['broast', 'بروستد', 'Broasted chicken', 'قطعتين', '2 pieces', 250, 600, 38, 25, 38],
    ['nuggets', 'ناجتس دجاج', 'Chicken nuggets', '٦ قطع', '6 pieces', 100, 280, 14, 17, 17],
    ['fries', 'بطاطس مقلية', 'French fries', 'وسط', 'medium', 117, 365, 4, 48, 17],
    ['pizza', 'بيتزا', 'Pizza', 'شريحة', 'slice', 107, 285, 12, 36, 10],
    ['shawarma_plate', 'صحن شاورما عربي', 'Arabic shawarma platter', 'صحن', 'platter', 450, 950, 40, 90, 45],
  ],
};

export const FOODS: Food[] = (Object.keys(DATA) as FoodCategory[]).flatMap((cat) =>
  DATA[cat].map(([id, ar, en, sAr, sEn, grams, kcal, p, c, f]) => ({
    id, cat, grams, kcal, protein_g: p, carbs_g: c, fat_g: f,
    name: { ar, en }, serving: { ar: sAr, en: sEn },
  })),
);

export const FOOD_CATEGORIES = Object.keys(DATA) as FoodCategory[];

export function getFood(id: string | null | undefined): Food | undefined {
  return id ? FOODS.find((f) => f.id === id) : undefined;
}
