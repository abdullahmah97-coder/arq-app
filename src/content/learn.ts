// محتوى صفحات "تعلّم": ما هو تكوين الجسم؟ + كيف تقرأ تقرير InBody
import type { I18nText } from '../lib/types';

const t = (ar: string, en: string): I18nText => ({ ar, en });

// ---------------------------------------------------------------------------
// ما هو تكوين الجسم؟
// ---------------------------------------------------------------------------

export const bodyComposition = {
  title: t('ما هو تكوين الجسم؟', 'What is body composition?'),
  intro: [
    t(
      'يُعدّ تحليل تكوين الجسم طريقةً لوصف مكوناته. توجد عدة طرق لتصنيف هذه المكونات، كما هو موضح في الشكل التالي. يستخدم جهاز InBody الطريقة الجزيئية لتحديد كمية أربعة مكونات أساسية في الجسم: الماء، والبروتين، والمعادن، والدهون.',
      'Body composition analysis is a way of describing what the body is made of. There are several ways to classify these components, as shown in the figure below. InBody uses the molecular method to measure four basic components of the body: water, protein, minerals and fat.',
    ),
    t(
      'تختلف نسب هذه المكونات باختلاف الجنس والعمر والخصائص الفردية، وترتبط ارتباطًا وثيقًا بالحالة الصحية للفرد. من خلال تحليل تكوين الجسم، يُمكننا تحديد ما إذا كان الجسم يعاني من انتفاخ، وما إذا كان نموه متوازنًا.',
      'The proportions of these components vary with sex, age and individual characteristics, and are closely linked to a person’s health. Body composition analysis tells us whether the body has swelling (edema) and whether it is developing in a balanced way.',
    ),
  ],
  components: [
    {
      key: 'water',
      share: 60,
      name: t('الماء', 'Water'),
      text: t(
        'يشكل الماء معظم مكونات الجسم، ويتوزع في جميع خلايا الجسم وسوائله. ينقل الماء العناصر الغذائية والفضلات، ويُعدّ المكون الرئيسي للدم، ويلعب دورًا محوريًا في العمليات الحيوية داخل الجسم، كما يُسهّل التفاعلات الكيميائية المختلفة.',
        'Water makes up most of the body and is found in every cell and body fluid. It carries nutrients and waste, is the main component of blood, plays a central role in the body’s vital processes and enables many chemical reactions.',
      ),
    },
    {
      key: 'protein',
      share: 16,
      name: t('البروتين', 'Protein'),
      text: t(
        'يُعدّ البروتين مكونًا رئيسيًا لأنسجة الجسم كالعظام والجلد والشعر والعضلات. وقد يُهدد نقص البروتين الصحة، إذ يُعيق وظائف الجسم، كما يُمكن أن يُؤثر سلبًا على نمو الأطفال.',
        'Protein is a main building block of body tissues such as bone, skin, hair and muscle. A lack of protein threatens health by impairing body functions, and can hold back children’s growth.',
      ),
    },
    {
      key: 'minerals',
      share: 5,
      name: t('المعادن', 'Minerals'),
      text: t(
        'تُعدّ المعادن عناصر غذائية أساسية للحفاظ على الحياة والصحة. فهي تُكوّن مواد مختلفة داخل جسم الإنسان وتُنظّم العمليات الفيزيولوجية. وقد يؤدي نقص المعادن إلى مخاطر صحية مثل ضعف النمو وهشاشة العظام.',
        'Minerals are essential nutrients for life and health. They form many substances in the body and regulate physiological processes. A lack of minerals can lead to health risks such as poor growth and osteoporosis.',
      ),
    },
    {
      key: 'fat',
      share: 19,
      name: t('الدهون', 'Fat'),
      text: t(
        'تُعدّ الدهون أحد مكونات الجسم البشري، وهي بمثابة مخزن للطاقة. قد يؤدي ارتفاع نسبة الدهون في الجسم إلى السمنة ومتلازمة التمثيل الغذائي. كما أن النقص الحاد في الدهون قد يُسبب انخفاضًا في مستوى المناعة واختلالًا في الهرمونات، لذا من المهم الحفاظ على مستوى مناسب من الدهون في الجسم.',
        'Fat is one of the body’s components and acts as an energy store. Too much body fat can lead to obesity and metabolic syndrome, while a severe lack of fat can weaken immunity and upset hormones — so keeping an appropriate level of body fat matters.',
      ),
    },
  ],
  // كيف تتجمع المكونات (نفس جدول أعلى تقرير InBody)
  levels: [
    { name: t('ماء الجسم الكلي', 'Total body water'), parts: ['water'] },
    { name: t('الكتلة العضلية الرخوة', 'Soft lean mass'), parts: ['water', 'protein'] },
    { name: t('الكتلة الخالية من الدهون', 'Fat-free mass'), parts: ['water', 'protein', 'minerals'] },
    { name: t('الوزن', 'Weight'), parts: ['water', 'protein', 'minerals', 'fat'] },
  ],
  shareNote: t(
    'النسب في الشكل تقريبية لشخص بالغ متوسط، وتختلف من شخص لآخر.',
    'Shares in the figure are approximate for an average adult and differ from person to person.',
  ),
};

// ---------------------------------------------------------------------------
// كيف تقرأ تقرير InBody؟ — قسم بقسم
// ---------------------------------------------------------------------------

export interface GuideSection {
  key: string;
  icon: string;
  title: I18nText;
  what: I18nText;         // وش يعني
  read: I18nText;         // كيف تقرأه
  app: I18nText;          // وش يسوي التطبيق بهذا الرقم
}

export const inbodyGuide = {
  title: t('كيف تقرأ تقرير InBody؟', 'How to read an InBody report'),
  intro: t(
    'جهاز InBody يمرر تياراً كهربائياً ضعيفاً جداً (لا تحس فيه) عبر اليدين والقدمين بعدة ترددات. الماء والعضل يوصلون الكهرباء بسهولة والدهون تقاومها، فيحسب الجهاز من "المقاومة" كمية الماء والعضل والدهون في كل جزء من جسمك. التقرير مقسّم لأقسام، وهذا شرح كل قسم وكيف يستخدمه التطبيق لبناء خطتك.',
    'InBody passes a very weak electrical current (you can’t feel it) through your hands and feet at several frequencies. Water and muscle conduct electricity easily while fat resists it, so from this "impedance" the device calculates how much water, muscle and fat is in each part of your body. The report is split into sections — here is what each one means and how the app uses it to build your plan.',
  ),
  sections: [
    {
      key: 'composition', icon: 'layers-outline',
      title: t('تحليل تكوين الجسم', 'Body Composition Analysis'),
      what: t('يقسم وزنك إلى: ماء، بروتين، معادن، ودهون، ويجمعها في: الكتلة الرخوة، والكتلة الخالية من الدهون، ثم الوزن.', 'Splits your weight into water, protein, minerals and fat, then groups them into soft lean mass, fat-free mass and weight.'),
      read: t('الرقم الكبير هو قيمتك، وبين القوسين المعدل الطبيعي لجنسك وطولك. قارن رقمك بالمدى.', 'The big number is your value; the range in brackets is normal for your sex and height. Compare yours to the range.'),
      app: t('نستخدم الكتلة الخالية من الدهون لحساب البروتين اليومي بدقة أكبر من الوزن الكلي.', 'We use fat-free mass to calculate daily protein more accurately than total weight.'),
    },
    {
      key: 'muscle_fat', icon: 'barbell-outline',
      title: t('تحليل العضل والدهون', 'Muscle-Fat Analysis'),
      what: t('ثلاثة أشرطة: الوزن، والكتلة العضلية الهيكلية (SMM)، وكتلة الدهون.', 'Three bars: weight, skeletal muscle mass (SMM) and body fat mass.'),
      read: t('انظر لشكل الأشرطة: الشكل المثالي أن يكون شريط العضل أطول من شريط الوزن، وشريط الدهون أقصر منهما (شكل حرف D). إذا كان شريط الدهون الأطول (شكل C) فالأولوية لخسارة الدهون وبناء العضل.', 'Look at the shape: ideally the muscle bar is longer than the weight bar and the fat bar is the shortest ("D" shape). If the fat bar is longest ("C" shape), the priority is losing fat and building muscle.'),
      app: t('يحدد نوع جسمك (رياضي، متوازن، دهون مرتفعة مع عضل قليل…) والهدف المقترح.', 'Determines your body type (athletic, balanced, high fat with low muscle…) and the recommended goal.'),
    },
    {
      key: 'obesity', icon: 'speedometer-outline',
      title: t('تحليل السمنة: BMI و PBF', 'Obesity Analysis: BMI & PBF'),
      what: t('BMI مؤشر كتلة الجسم (الوزن ÷ مربع الطول)، و PBF نسبة الدهون من وزنك.', 'BMI is weight ÷ height², and PBF is the percentage of your weight that is fat.'),
      read: t('نسبة الدهون أهم من BMI، لأن الرياضي قد يكون BMI عنده مرتفع بسبب العضل. المعدل الطبيعي تقريباً: رجال 10–20%، نساء 18–28%.', 'PBF matters more than BMI, since an athlete can have a high BMI from muscle. Normal is roughly 10–20% for men and 18–28% for women.'),
      app: t('يحدد حالة الدهون (منخفضة/طبيعية/مرتفعة) ومعدل النزول الآمن أسبوعياً.', 'Sets your fat status (low/normal/high) and a safe weekly rate of loss.'),
    },
    {
      key: 'segmental', icon: 'body-outline',
      title: t('تحليل العضل لكل جزء', 'Segmental Lean Analysis'),
      what: t('كمية العضل في كل ذراع، والجذع، وكل رجل، ونسبتها من المعدل الطبيعي.', 'Muscle mass in each arm, the trunk and each leg, and its percentage of normal.'),
      read: t('100% = طبيعي. أقل من 90% يعني الجزء ضعيف. قارن اليمين باليسار: فرق أكثر من 5% يعني عدم توازن.', '100% = normal. Under 90% means the segment is weak. Compare right vs left: more than 5% difference means an imbalance.'),
      app: t('يضيف تمارين إضافية للأجزاء الضعيفة، وتمارين بطرف واحد (يد أو رجل) تبدأ بالجهة الأضعف لتعديل التوازن.', 'Adds extra work for weak segments, and one-side (single arm/leg) exercises starting with the weaker side to fix imbalances.'),
    },
    {
      key: 'segmental_fat', icon: 'pie-chart-outline',
      title: t('تحليل الدهون لكل جزء', 'Segmental Fat Analysis'),
      what: t('كمية الدهون في كل جزء ونسبتها من المعدل.', 'Fat in each segment and its percentage of normal.'),
      read: t('ارتفاع دهون الجذع بالذات يرتبط غالباً بالدهون الحشوية. لا يمكن "حرق الدهون من منطقة معينة"، النزول يكون من الجسم كله.', 'High trunk fat in particular is often linked to visceral fat. You can’t spot-reduce fat — it comes off the whole body.'),
      app: t('نعرضه لك للمتابعة، ونعتمد على نسبة الدهون الكلية والدهون الحشوية في بناء الخطة.', 'Shown for tracking; the plan relies on total body fat and visceral fat.'),
    },
    {
      key: 'ecw', icon: 'water-outline',
      title: t('نسبة الماء خارج الخلايا (ECW Ratio)', 'ECW Ratio'),
      what: t('نسبة الماء خارج الخلايا إلى ماء الجسم الكلي. تعكس توازن السوائل في جسمك.', 'Extracellular water divided by total body water. It reflects your fluid balance.'),
      read: t('الطبيعي 0.36–0.39. أعلى من 0.39 قد يدل على وذمة (احتباس سوائل أو انتفاخ)، وأحياناً يظهر في التقرير تنبيه بعدم حساب النتيجة. هذا يستدعي مراجعة طبيب.', 'Normal is 0.36–0.39. Above 0.39 may indicate edema (fluid retention/swelling), and the report may say the score can’t be calculated. This warrants seeing a doctor.'),
      app: t('إذا كانت مرتفعة ننبهك أول شيء، ونخلي شدة الخطة معتدلة حتى تطمئن.', 'If elevated, we warn you first and keep the plan at moderate intensity until you’re checked.'),
    },
    {
      key: 'visceral', icon: 'fitness-outline',
      title: t('الدهون الحشوية', 'Visceral Fat'),
      what: t('الدهون المخزنة داخل البطن حول الأعضاء. تظهر كمستوى (1–20) أو كمساحة بالسنتيمتر المربع حسب الجهاز.', 'Fat stored inside the abdomen around the organs. Shown as a level (1–20) or an area in cm² depending on the device.'),
      read: t('المستوى الطبيعي أقل من 10، والمساحة الطبيعية أقل من 100 سم². ارتفاعها مرتبط بالسكري وأمراض القلب أكثر من الدهون تحت الجلد.', 'A normal level is under 10, and a normal area is under 100 cm². High visceral fat is linked to diabetes and heart disease more than fat under the skin.'),
      app: t('عند ارتفاعها نضيف كارديو منتظم في أيام التمرين والراحة.', 'When high, we add regular cardio on training and rest days.'),
    },
    {
      key: 'control', icon: 'flag-outline',
      title: t('التحكم بالوزن', 'Weight Control'),
      what: t('الوزن المستهدف، وكم تحتاج تغيّر من الدهون والعضل للوصول له.', 'Your target weight and how much fat and muscle to change to reach it.'),
      read: t('الإشارة السالبة تعني خسارة والموجبة تعني زيادة. مثال: التحكم بالدهون −9.3 والتحكم بالعضل +3.1 يعني تخسر دهون وتبني عضل بنفس الوقت.', 'Negative means lose and positive means gain. E.g. fat control −9.3 and muscle control +3.1 means lose fat and build muscle at the same time.'),
      app: t('نحسب منه معدل النزول الأسبوعي والمدة المتوقعة للوصول لهدفك.', 'We use it to set your weekly rate and the expected time to reach your goal.'),
    },
    {
      key: 'research', icon: 'flask-outline',
      title: t('المؤشرات البحثية ومعدل الأيض', 'Research Parameters & BMR'),
      what: t('أهمها معدل الأيض الأساسي (BMR): السعرات التي يحرقها جسمك وهو في راحة تامة. وفيها أيضاً نسبة الخصر للورك وكتلة الخلايا.', 'The key one is basal metabolic rate (BMR): the calories your body burns at complete rest. It also shows waist-hip ratio and body cell mass.'),
      read: t('BMR مقاس من كتلة عضلك الفعلية، فهو أدق من الحاسبات العامة.', 'BMR is derived from your actual lean mass, so it’s more accurate than generic calculators.'),
      app: t('نبني سعراتك اليومية على BMR المقاس، ولا نخلي سعراتك تنزل تحته أبداً.', 'We build your daily calories on the measured BMR and never let them drop below it.'),
    },
    {
      key: 'phase', icon: 'pulse-outline',
      title: t('زاوية الطور', 'Phase Angle'),
      what: t('مؤشر على صحة الخلايا وسلامة أغشيتها.', 'An indicator of cell health and membrane integrity.'),
      read: t('كلما ارتفعت كان أفضل. تنخفض مع التقدم في العمر وقلة الحركة، وترتفع مع تمارين المقاومة والتغذية الجيدة.', 'Higher is better. It drops with age and inactivity, and rises with resistance training and good nutrition.'),
      app: t('نعرضها للمتابعة بين تقرير وآخر.', 'Shown so you can track it between reports.'),
    },
    {
      key: 'history', icon: 'trending-up-outline',
      title: t('سجل تكوين الجسم ونتيجة InBody', 'Body Composition History & InBody Score'),
      what: t('السجل يعرض آخر فحوصاتك، والنتيجة (من 100) تقييم عام لتكوين جسمك.', 'History shows your recent tests, and the score (out of 100) is an overall rating of your composition.'),
      read: t('ركّز على اتجاه العضل والدهون أكثر من الوزن: نزول الدهون مع ثبات العضل تقدم ممتاز حتى لو الوزن ما تغير كثير. الشخص العضلي قد تتجاوز نتيجته 100.', 'Watch the trend of muscle and fat more than weight: fat going down while muscle holds is great progress even if weight barely moves. A muscular person can score over 100.'),
      app: t('ارفع كل تقرير جديد، ونقارنه بالسابق ونحدّث خطتك.', 'Upload every new report — we compare it with the previous one and update your plan.'),
    },
  ] as GuideSection[],
  prepTitle: t('قبل الفحص: عشان تكون النتيجة دقيقة', 'Before the test: for accurate results'),
  prep: [
    t('افحص الصباح وأنت صائم (أو بعد الأكل بساعتين على الأقل).', 'Test in the morning, fasted (or at least 2 hours after eating).'),
    t('ادخل الحمام قبل الفحص.', 'Use the bathroom before the test.'),
    t('لا تتمرن ولا تدخل الساونا قبل الفحص.', 'Don’t exercise or use the sauna before the test.'),
    t('اشرب ماء بشكل طبيعي في اليوم السابق، وتجنب الكافيين الكثير.', 'Drink normally the day before and avoid lots of caffeine.'),
    t('اخلع المعادن والإكسسوارات، واوقف منتصباً ويداك بعيدتان عن جسمك.', 'Remove metal and accessories; stand upright with your arms away from your body.'),
    t('كرر الفحص كل 4–6 أسابيع بنفس الوقت والظروف لتكون المقارنة صحيحة.', 'Repeat every 4–6 weeks at the same time and conditions so comparisons are valid.'),
  ],
  warning: t(
    'لا يُنصح بالفحص لمن لديه جهاز منظم ضربات القلب أو أجهزة طبية مزروعة، وللحامل استشيري طبيبتك أولاً.',
    'Not recommended if you have a pacemaker or implanted medical device; if pregnant, ask your doctor first.',
  ),
};
