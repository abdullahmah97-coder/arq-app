// دليل التمارين: الاسم، الحركة ثلاثية الأبعاد، الخطوات، الأخطاء الشائعة، والتنفس (عربي/إنجليزي)
import type { I18nText } from '../lib/types';
import type { Muscle } from './rig';
import { MOTIONS } from './motions';
import { CURATED_PHOTOS, FEDB_EXERCISES, type LibCategory, type LibEquipment, type LibLevel } from './fedb';

const t = (ar: string, en: string): I18nText => ({ ar, en });

export interface ExerciseGuide {
  id: string;
  motion: keyof typeof MOTIONS;
  name: I18nText;
  aliases?: string[];         // أسماء إنجليزية بديلة (للربط مع خطط الذكاء الاصطناعي)
  steps: I18nText[];
  mistakes: I18nText[];
  breathing: I18nText;
  tip?: I18nText;
  /** تمرين إضافي (له حركة 3D) — المدرب المحلي ما يختاره كأول تمرين للمجموعة */
  extra?: boolean;
  /** من المكتبة الإضافية: شرح + خريطة عضلات فقط (بدون حركة 3D خاصة) */
  library?: boolean;
  /** العضلات (لتمارين المكتبة؛ غيرها تؤخذ من الحركة) */
  primary?: Muscle[];
  secondary?: Muscle[];
  /** الأدوات (نص إنجليزي مختصر للمدرب الذكي) */
  equipment?: string;
  /** مصدر التمرين: fedb = المكتبة الموسّعة (Free Exercise DB) */
  source?: 'fedb';
  /** صور بداية ونهاية الحركة (مسارات داخل حاوية exercises) */
  photos?: string[];
  category?: LibCategory;
  equip?: LibEquipment;
  level?: LibLevel;
}

export const MUSCLE_NAMES: Record<Muscle, I18nText> = {
  chest: t('الصدر', 'Chest'),
  shoulders: t('الأكتاف', 'Shoulders'),
  rearDelts: t('الكتف الخلفي', 'Rear delts'),
  triceps: t('التراي', 'Triceps'),
  biceps: t('الباي', 'Biceps'),
  forearms: t('الساعد', 'Forearms'),
  abs: t('البطن', 'Abs'),
  upperBack: t('أعلى الظهر', 'Upper back'),
  lats: t('المجنص (الظهر العريض)', 'Lats'),
  lowerBack: t('أسفل الظهر', 'Lower back'),
  glutes: t('الأرداف', 'Glutes'),
  quads: t('الفخذ الأمامي', 'Quads'),
  hamstrings: t('الفخذ الخلفي', 'Hamstrings'),
  calves: t('السمانة', 'Calves'),
};

const EXHALE_UP = t('خذ نفس قبل النزول، وأخرجه وأنت تدفع للأعلى.', 'Inhale on the way down, exhale as you push up.');
const EXHALE_PULL = t('أخرج النفس وأنت تسحب، وخذ نفس وأنت ترجع ببطء.', 'Exhale as you pull, inhale as you return slowly.');
const EXHALE_PUSH = t('أخرج النفس وأنت تدفع، وخذ نفس وأنت ترجع ببطء.', 'Exhale as you push, inhale as you return slowly.');
const BRACE = t('شد البطن كأنك بتتلقى ضربة، وتنفس بهدوء بدون ما تحبس نفسك.', 'Brace your core as if about to be punched; breathe steadily without holding your breath.');

export const EXERCISES: ExerciseGuide[] = [
  // ------------------------------------------------------------------ أرجل
  {
    id: 'goblet_squat', motion: 'goblet_squat', name: t('سكوات بالكرسي (Goblet Squat)', 'Goblet Squat'),
    steps: [
      t('امسك الدمبل عمودياً أمام صدرك، والكوعين لتحت.', 'Hold the dumbbell vertically against your chest, elbows pointing down.'),
      t('افتح قدميك بعرض الكتفين وأصابعك للخارج قليلاً.', 'Feet shoulder-width apart, toes slightly out.'),
      t('انزل كأنك تجلس على كرسي، مع إبقاء الصدر مرفوع والركب باتجاه أصابع القدم.', 'Sit down as if onto a chair, chest up, knees tracking over your toes.'),
      t('انزل حتى يصير الفخذ موازي للأرض أو أعمق، ثم ادفع بكامل القدم للأعلى.', 'Go to thighs parallel or deeper, then drive up through your whole foot.'),
    ],
    mistakes: [
      t('رفع الكعب عن الأرض.', 'Lifting the heels.'),
      t('دخول الركب للداخل.', 'Knees caving in.'),
      t('تقويس أسفل الظهر في الأسفل.', 'Rounding the lower back at the bottom.'),
    ],
    breathing: EXHALE_UP,
  },
  {
    id: 'back_squat', motion: 'back_squat', name: t('سكوات بالبار', 'Barbell Back Squat'), aliases: ['Back Squat', 'Squat'],
    steps: [
      t('حط البار على أعلى الظهر (ليس على الرقبة) وامسكه بقبضة أعرض من الكتفين.', 'Rest the bar on your upper back (not your neck), grip wider than shoulders.'),
      t('شد البطن وخذ خطوتين للخلف، والقدمين بعرض الكتفين.', 'Brace, step back twice, feet shoulder-width.'),
      t('ارجع بالحوض وانزل مع إبقاء الظهر مستقيم والنظر للأمام.', 'Sit back and down keeping a neutral back and eyes forward.'),
      t('اصعد بدفع الأرض بكامل القدم حتى تستقيم.', 'Drive the floor away with your whole foot until standing tall.'),
    ],
    mistakes: [
      t('نزول سطحي جداً.', 'Cutting depth short.'),
      t('ميل الجذع للأمام بشكل مبالغ فيه.', 'Excessive forward lean.'),
      t('دخول الركب للداخل عند الصعود.', 'Knees caving in on the way up.'),
    ],
    breathing: t('خذ نفس عميق وشد البطن قبل النزول، وأخرجه بعد تجاوز أصعب نقطة في الصعود.', 'Take a big breath and brace before descending; exhale after passing the hardest point on the way up.'),
    tip: t('استخدم حامل الأمان دائماً بوزن ثقيل.', 'Always use safety pins with heavy loads.'),
  },
  {
    id: 'leg_press', motion: 'leg_press', name: t('ليق برس', 'Leg Press'),
    steps: [
      t('اجلس وظهرك كامل على المسند، والقدمين بعرض الكتفين في منتصف المنصة.', 'Sit with your whole back on the pad, feet shoulder-width mid-platform.'),
      t('فك الأمان وانزل ببطء حتى تقارب الركب 90 درجة.', 'Release the safety and lower slowly to about 90° at the knee.'),
      t('ادفع بالكعب للأعلى بدون ما تقفل الركب تماماً.', 'Press through your heels without locking the knees.'),
    ],
    mistakes: [
      t('رفع أسفل الظهر عن المسند في الأسفل.', 'Lower back lifting off the pad at the bottom.'),
      t('قفل الركبة بقوة في الأعلى.', 'Snapping the knees locked at the top.'),
    ],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'hack_squat', motion: 'hack_squat', name: t('هاك سكوات', 'Hack Squat'),
    steps: [
      t('ظهرك وكتفيك على المسند، والقدمين في منتصف المنصة.', 'Back and shoulders against the pads, feet mid-platform.'),
      t('انزل ببطء حتى يصير الفخذ موازي تقريباً.', 'Lower slowly until thighs are about parallel.'),
      t('ادفع للأعلى مع إبقاء الظهر ملاصق للمسند.', 'Drive up keeping your back glued to the pad.'),
    ],
    mistakes: [t('رفع الكعب.', 'Heels lifting.'), t('النزول بسرعة والارتداد من الأسفل.', 'Dropping fast and bouncing out of the bottom.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'leg_extension', motion: 'leg_extension', name: t('رفرفة أرجل بالجهاز', 'Leg Extension'),
    steps: [
      t('اضبط المسند بحيث تكون ركبتك على محور الجهاز والوسادة فوق الكاحل.', 'Align your knee with the machine pivot and the pad above your ankle.'),
      t('افرد رجلك للأعلى وثبّت لحظة في الأعلى.', 'Extend your legs and pause briefly at the top.'),
      t('انزل ببطء بدون ما يرتطم الوزن.', 'Lower slowly without letting the stack slam.'),
    ],
    mistakes: [t('رفع الحوض عن المقعد.', 'Lifting the hips off the seat.'), t('استخدام الزخم بدل العضلة.', 'Using momentum instead of the muscle.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'leg_curl_lying', motion: 'leg_curl_lying', name: t('ثني أرجل بالجهاز', 'Lying Leg Curl'),
    steps: [
      t('انبطح على الجهاز والوسادة فوق الكعب مباشرة.', 'Lie face down with the pad just above your heels.'),
      t('اثنِ الركبة وسحب الكعب باتجاه الأرداف.', 'Curl your heels towards your glutes.'),
      t('ارجع ببطء حتى تستقيم الرجل تقريباً.', 'Return slowly until the legs are nearly straight.'),
    ],
    mistakes: [t('رفع الحوض عن المسند.', 'Lifting the hips off the bench.'), t('حركة ناقصة في الأعلى.', 'Half reps at the top.')],
    breathing: EXHALE_PULL,
  },
  {
    id: 'leg_curl_seated', motion: 'leg_curl_seated', name: t('ثني أرجل جالس', 'Seated Leg Curl'),
    steps: [
      t('اجلس والوسادة خلف الكاحل، وثبّت فخذك بالمسند العلوي.', 'Sit with the pad behind your ankles and lock your thighs under the top pad.'),
      t('اسحب الكعب للأسفل والخلف قدر ما تقدر.', 'Pull your heels down and back as far as you can.'),
      t('ارجع ببطء.', 'Return slowly.'),
    ],
    mistakes: [t('الميل للأمام بالجذع.', 'Leaning the torso forward.'), t('الإرجاع السريع.', 'Letting the weight snap back.')],
    breathing: EXHALE_PULL,
  },
  {
    id: 'split_squat', motion: 'split_squat', name: t('طعنات ثابتة', 'Split Squat'),
    steps: [
      t('خطوة كبيرة للأمام، والكعب الخلفي مرفوع.', 'Take a long stride, back heel raised.'),
      t('انزل عمودياً حتى تقترب الركبة الخلفية من الأرض.', 'Drop straight down until the back knee nearly touches the floor.'),
      t('ادفع بالرجل الأمامية للأعلى، ثم بدّل بعد انتهاء المجموعة.', 'Drive up through the front leg; switch sides after the set.'),
    ],
    mistakes: [t('تقدم الركبة الأمامية بزيادة وارتفاع الكعب.', 'Front knee shooting forward and heel lifting.'), t('ميل الجذع للأمام.', 'Leaning the torso forward.')],
    breathing: EXHALE_UP,
  },
  {
    id: 'walking_lunge', motion: 'walking_lunge', name: t('طعنات مشي بالدمبل', 'Dumbbell Walking Lunge'), aliases: ['Walking Lunge', 'Lunge'],
    steps: [
      t('دمبل في كل يد والذراعين على الجانبين.', 'A dumbbell in each hand at your sides.'),
      t('خطوة للأمام وانزل حتى تقارب الركبة الخلفية الأرض.', 'Step forward and lower until the back knee nearly touches the floor.'),
      t('ادفع بالرجل الأمامية وتقدم بالرجل الأخرى للخطوة التالية.', 'Push through the front leg and step through into the next lunge.'),
    ],
    mistakes: [t('خطوات قصيرة جداً.', 'Steps that are too short.'), t('خبط الركبة الخلفية بالأرض.', 'Banging the back knee on the floor.')],
    breathing: EXHALE_UP,
  },
  {
    id: 'bulgarian_split_squat', motion: 'bulgarian_split_squat', name: t('بلغاري سبليت سكوات', 'Bulgarian Split Squat'),
    steps: [
      t('ظهر قدمك الخلفية على بنش خلفك، والقدم الأمامية على بعد خطوة كبيرة.', 'Rest the top of your back foot on a bench, front foot a long stride ahead.'),
      t('انزل عمودياً حتى يصير الفخذ الأمامي موازي للأرض.', 'Lower straight down until the front thigh is parallel.'),
      t('ادفع بالكعب الأمامي للأعلى.', 'Drive up through the front heel.'),
    ],
    mistakes: [t('القدم الأمامية قريبة جداً من البنش.', 'Front foot too close to the bench.'), t('الاعتماد على الرجل الخلفية.', 'Pushing with the back leg.')],
    breathing: EXHALE_UP,
  },
  {
    id: 'rdl_db', motion: 'rdl_db', name: t('ديدلفت روماني بالدمبل', 'Dumbbell Romanian Deadlift'),
    steps: [
      t('قف والدمبلات أمام فخذك، وركبتك مثنية قليلاً.', 'Stand with dumbbells in front of your thighs, knees soft.'),
      t('ارجع بالحوض للخلف ونزّل الدمبل قريب من رجلك مع ظهر مستقيم.', 'Push your hips back and slide the weights down your legs with a flat back.'),
      t('انزل حتى تحس بشد في الفخذ الخلفي (تحت الركبة تقريباً).', 'Go until you feel a strong hamstring stretch (around mid-shin).'),
      t('ارجع بدفع الحوض للأمام وعصر الأرداف.', 'Stand by driving your hips forward and squeezing your glutes.'),
    ],
    mistakes: [t('تقويس الظهر.', 'Rounding the back.'), t('ثني الركب كأنه سكوات.', 'Bending the knees like a squat.'), t('إبعاد الوزن عن الرجل.', 'Letting the weights drift away from the legs.')],
    breathing: EXHALE_UP,
  },
  {
    id: 'rdl_bb', motion: 'rdl_bb', name: t('ديدلفت روماني بالبار', 'Barbell Romanian Deadlift'), aliases: ['Romanian Deadlift', 'RDL'],
    steps: [
      t('امسك البار بعرض الكتفين، وقف مستقيم والركب مثنية قليلاً.', 'Hold the bar shoulder-width, stand tall with soft knees.'),
      t('ارجع بالحوض ونزّل البار ملاصق للفخذ ثم الساق.', 'Hinge back, sliding the bar down your thighs and shins.'),
      t('ارجع بعصر الأرداف حتى تستقيم.', 'Squeeze your glutes to return to standing.'),
    ],
    mistakes: [t('تقويس الظهر.', 'Rounding the back.'), t('رفع الرأس للأعلى بشكل مبالغ.', 'Cranking the neck up.')],
    breathing: EXHALE_UP,
  },
  {
    id: 'deadlift', motion: 'deadlift', name: t('ديدلفت تقليدي', 'Conventional Deadlift'), aliases: ['Deadlift'],
    steps: [
      t('قف والبار فوق منتصف القدم، وامسكه خارج الركب.', 'Stand with the bar over mid-foot and grip just outside your knees.'),
      t('انزل بالحوض حتى تلمس الساق البار، صدر مرفوع وظهر مستقيم.', 'Drop your hips until the shins touch the bar; chest up, back flat.'),
      t('ادفع الأرض بقدمك واسحب البار ملاصق لجسمك حتى تقف.', 'Push the floor away and drag the bar up your body to lockout.'),
      t('ارجع بنفس الطريق: الحوض أولاً ثم الركب.', 'Return the same way: hips back first, then knees.'),
    ],
    mistakes: [t('تقويس الظهر.', 'Rounding the back.'), t('سحب البار بالذراعين.', 'Pulling with the arms.'), t('ميل الجذع للخلف في الأعلى.', 'Leaning back at lockout.')],
    breathing: t('خذ نفس وشد البطن قبل كل تكرار، وأخرج النفس في الأعلى.', 'Breathe in and brace before every rep; exhale at the top.'),
    tip: t('ابدأ بوزن خفيف وتعلّم الحركة مع مدرب.', 'Start light and learn the pattern with a coach.'),
  },
  {
    id: 'glute_bridge', motion: 'glute_bridge', name: t('جسر الأرداف', 'Glute Bridge'),
    steps: [
      t('استلقِ على ظهرك والركب مثنية والقدمين على الأرض.', 'Lie on your back, knees bent, feet flat.'),
      t('ارفع الحوض بعصر الأرداف حتى يصير خط مستقيم من الكتف للركبة.', 'Squeeze your glutes to lift your hips into a straight line from shoulders to knees.'),
      t('ثبّت ثانية في الأعلى ثم انزل ببطء.', 'Hold one second at the top, then lower slowly.'),
    ],
    mistakes: [t('تقويس أسفل الظهر في الأعلى.', 'Arching the lower back at the top.'), t('الدفع بأصابع القدم بدل الكعب.', 'Pushing through the toes instead of the heels.')],
    breathing: EXHALE_UP,
  },
  {
    id: 'hip_thrust_db', motion: 'hip_thrust_db', name: t('هيب ثرست بالدمبل', 'Dumbbell Hip Thrust'),
    steps: [
      t('أعلى ظهرك على حافة البنش، والدمبل على الحوض.', 'Upper back on the bench edge, dumbbell on your hips.'),
      t('ارفع الحوض حتى يصير الجسم مستقيم من الكتف للركبة.', 'Drive your hips up until your body is straight from shoulders to knees.'),
      t('اعصر الأرداف في الأعلى ثم انزل ببطء.', 'Squeeze at the top and lower slowly.'),
    ],
    mistakes: [t('رفع الذقن للأعلى وتقويس الظهر.', 'Throwing the chin up and arching.'), t('القدمين بعيدين جداً.', 'Feet too far out.')],
    breathing: EXHALE_UP,
  },
  {
    id: 'hip_thrust_bb', motion: 'hip_thrust_bb', name: t('هيب ثرست بالبار', 'Barbell Hip Thrust'), aliases: ['Hip Thrust'],
    steps: [
      t('أعلى ظهرك على البنش، والبار فوق الحوض (استخدم وسادة).', 'Upper back on the bench, bar over your hips (use a pad).'),
      t('ادفع بالكعب وارفع الحوض حتى يستوي الجسم.', 'Drive through your heels and lift your hips until level.'),
      t('ثبّت وعصر الأرداف ثم انزل ببطء.', 'Pause and squeeze, then lower under control.'),
    ],
    mistakes: [t('تقويس أسفل الظهر.', 'Hyper-extending the lower back.'), t('النظر للسقف.', 'Looking at the ceiling.')],
    breathing: EXHALE_UP,
  },
  {
    id: 'calf_raise', motion: 'calf_raise', name: t('سمانة واقف', 'Standing Calf Raise'), aliases: ['Calf Raise', 'Seated + Standing Calf Raise'],
    steps: [
      t('قف والدمبلات بجانبك (أو على حافة درجة).', 'Stand holding dumbbells (or on the edge of a step).'),
      t('ارتفع على أطراف أصابعك لأعلى نقطة وثبّت ثانية.', 'Rise onto the balls of your feet as high as possible and hold one second.'),
      t('انزل ببطء حتى تحس بتمدد السمانة.', 'Lower slowly into a full calf stretch.'),
    ],
    mistakes: [t('حركة سريعة بالارتداد.', 'Bouncing fast reps.'), t('ثني الركب.', 'Bending the knees.')],
    breathing: EXHALE_UP,
  },

  // ------------------------------------------------------------------ صدر
  {
    id: 'bench_bb', motion: 'bench_bb', name: t('بنش برس بالبار', 'Barbell Bench Press'), aliases: ['Bench Press'],
    steps: [
      t('استلقِ والعين تحت البار، والقدمين ثابتة على الأرض.', 'Lie with your eyes under the bar, feet planted.'),
      t('اضغط لوحي الكتف للخلف والأسفل، وامسك البار أعرض من الكتفين قليلاً.', 'Pull your shoulder blades back and down; grip slightly wider than shoulders.'),
      t('نزّل البار ببطء لمنتصف الصدر والكوعين بزاوية 45 درجة تقريباً.', 'Lower the bar slowly to mid-chest with elbows at about 45°.'),
      t('ادفع للأعلى حتى تستقيم الذراعين.', 'Press up until your arms are straight.'),
    ],
    mistakes: [t('فتح الكوعين 90 درجة.', 'Flaring the elbows to 90°.'), t('ارتداد البار من الصدر.', 'Bouncing the bar off the chest.'), t('رفع الحوض عن البنش.', 'Lifting the hips off the bench.')],
    breathing: EXHALE_PUSH,
    tip: t('استخدم مساعد (سبوتر) مع الأوزان الثقيلة.', 'Use a spotter with heavy weights.'),
  },
  {
    id: 'bench_db', motion: 'bench_db', name: t('بنش برس بالدمبل', 'Dumbbell Bench Press'),
    steps: [
      t('استلقِ ودمبل في كل يد فوق الصدر.', 'Lie back with a dumbbell in each hand over your chest.'),
      t('نزّل الدمبلات ببطء لجانب الصدر والكوعين 45 درجة.', 'Lower slowly to the sides of your chest, elbows at 45°.'),
      t('ادفع للأعلى وقرّب الدمبلات من بعض في الأعلى.', 'Press up, bringing the dumbbells together at the top.'),
    ],
    mistakes: [t('نزول ناقص.', 'Short range of motion.'), t('عدم ثبات الرسغ.', 'Wobbly, bent-back wrists.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'chest_press_machine', motion: 'chest_press_machine', name: t('ضغط صدر بالجهاز', 'Machine Chest Press'),
    steps: [
      t('اضبط المقعد بحيث تكون المقابض بمستوى منتصف الصدر.', 'Set the seat so the handles line up with mid-chest.'),
      t('ظهرك على المسند، وادفع المقابض للأمام حتى تستقيم الذراعين.', 'Back against the pad, press the handles forward until your arms are straight.'),
      t('ارجع ببطء حتى تحس بتمدد في الصدر.', 'Return slowly until you feel a chest stretch.'),
    ],
    mistakes: [t('رفع الأكتاف للأعلى.', 'Shrugging the shoulders up.'), t('ترك الوزن يرجع بسرعة.', 'Letting the stack drop back fast.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'incline_db_press', motion: 'incline_db_press', name: t('ضغط صدر مائل بالدمبل', 'Incline Dumbbell Press'),
    steps: [
      t('اضبط البنش على زاوية 30–45 درجة.', 'Set the bench to 30–45°.'),
      t('ادفع الدمبلات للأعلى فوق أعلى الصدر.', 'Press the dumbbells up over your upper chest.'),
      t('نزّلها ببطء لجانب أعلى الصدر.', 'Lower slowly to the sides of your upper chest.'),
    ],
    mistakes: [t('زاوية بنش عالية جداً (تصير تمرين أكتاف).', 'Bench too steep (turns into a shoulder press).'), t('تقويس الظهر بقوة.', 'Excessive back arch.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'pec_deck', motion: 'pec_deck', name: t('تفتيح صدر بالجهاز', 'Pec Deck Fly'),
    steps: [
      t('اجلس وظهرك على المسند، والساعد على الوسائد بمستوى الصدر.', 'Sit with your back on the pad and forearms on the pads at chest height.'),
      t('قرّب الذراعين أمامك بعصر الصدر.', 'Bring your arms together in front by squeezing your chest.'),
      t('ارجع ببطء حتى تحس بتمدد خفيف.', 'Return slowly into a light stretch.'),
    ],
    mistakes: [t('فتح الذراعين أكثر من اللازم.', 'Over-stretching the shoulders at the back.'), t('الدفع باليدين بدل الصدر.', 'Pushing with the hands instead of the chest.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'cable_fly', motion: 'cable_fly', name: t('تفتيح بالكيبل', 'Cable Fly'),
    steps: [
      t('قف بين البكرتين وخطوة للأمام، والكوع مثني قليلاً.', 'Stand between the pulleys with a staggered stance, elbows slightly bent.'),
      t('اجمع اليدين أمام الصدر بحركة قوس واسعة.', 'Bring your hands together in front of your chest in a wide arc.'),
      t('ارجع ببطء مع الحفاظ على ثني الكوع.', 'Return slowly, keeping the elbow bend fixed.'),
    ],
    mistakes: [t('تحويلها لضغط بثني وفرد الكوع.', 'Turning it into a press by bending and straightening the elbows.'), t('وزن ثقيل يسحب الكتف للخلف.', 'Too much weight pulling the shoulders back.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'dips', motion: 'dips', name: t('متوازي (Dips)', 'Dips'),
    steps: [
      t('ارفع جسمك على المتوازي والذراعين مستقيمة.', 'Support yourself on the bars with straight arms.'),
      t('انزل ببطء حتى يصير الكوع 90 درجة، مع ميل بسيط للأمام.', 'Lower slowly to 90° at the elbow, leaning slightly forward.'),
      t('ادفع للأعلى حتى تستقيم الذراعين.', 'Press back up to straight arms.'),
    ],
    mistakes: [t('النزول أعمق من اللازم (ضغط على الكتف).', 'Going too deep (stresses the shoulders).'), t('رفع الأكتاف للأذن.', 'Shrugging the shoulders to the ears.')],
    breathing: EXHALE_PUSH,
    tip: t('إذا ما قدرت، استخدم جهاز المساعدة أو ربطة مطاطية.', 'If needed, use an assisted machine or a band.'),
  },

  // ------------------------------------------------------------------ أكتاف
  {
    id: 'ohp_standing', motion: 'ohp_standing', name: t('ضغط أكتاف بالبار واقف', 'Standing Overhead Press'), aliases: ['Overhead Press', 'OHP'],
    steps: [
      t('البار على أعلى الصدر، والقبضة أعرض من الكتفين قليلاً.', 'Bar on your upper chest, grip slightly wider than shoulders.'),
      t('شد البطن والأرداف، وادفع البار للأعلى بخط مستقيم.', 'Brace your core and glutes and press the bar straight up.'),
      t('بعد تجاوز الرأس، دخّل رأسك تحت البار واقفل الذراعين.', 'Once past your head, move your head through and lock out.'),
    ],
    mistakes: [t('تقويس الظهر للخلف.', 'Leaning back and arching.'), t('دفع البار للأمام بدل الأعلى.', 'Pressing forward instead of up.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'shoulder_press_db_seated', motion: 'shoulder_press_db_seated', name: t('ضغط أكتاف بالدمبل جالس', 'Seated Dumbbell Shoulder Press'),
    steps: [
      t('اجلس وظهرك على المسند، والدمبلات بمستوى الأذن.', 'Sit against the back pad with dumbbells at ear level.'),
      t('ادفع للأعلى حتى تستقيم الذراعين تقريباً.', 'Press up until your arms are nearly straight.'),
      t('انزل ببطء لمستوى الأذن.', 'Lower slowly back to ear level.'),
    ],
    mistakes: [t('تقويس الظهر عن المسند.', 'Arching off the back pad.'), t('خبط الدمبلات ببعض في الأعلى.', 'Clanging the dumbbells at the top.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'shoulder_press_machine', motion: 'shoulder_press_machine', name: t('ضغط أكتاف بالجهاز', 'Machine Shoulder Press'),
    steps: [
      t('اضبط المقعد بحيث تكون المقابض بمستوى الكتف.', 'Adjust the seat so the handles start at shoulder height.'),
      t('ادفع للأعلى بدون قفل الكوع.', 'Press up without locking the elbows.'),
      t('ارجع ببطء.', 'Return slowly.'),
    ],
    mistakes: [t('رفع الحوض عن المقعد.', 'Lifting the hips off the seat.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'lateral_raise', motion: 'lateral_raise', name: t('رفرفة جانبية بالدمبل', 'Dumbbell Lateral Raise'), aliases: ['Lateral Raise', 'Lateral + Rear Delt Raise'],
    steps: [
      t('قف ودمبل خفيف في كل يد، والكوع مثني قليلاً.', 'Stand with a light dumbbell in each hand, elbows soft.'),
      t('ارفع الذراعين للجانب حتى مستوى الكتف.', 'Raise your arms out to the sides to shoulder height.'),
      t('انزل ببطء أبطأ من الصعود.', 'Lower more slowly than you lifted.'),
    ],
    mistakes: [t('هز الجسم لرفع الوزن.', 'Swinging the body.'), t('رفع الأكتاف للأذن.', 'Shrugging.'), t('وزن ثقيل.', 'Going too heavy.')],
    breathing: t('أخرج النفس وأنت ترفع، وخذ نفس وأنت تنزل.', 'Exhale as you raise, inhale as you lower.'),
  },
  {
    id: 'upright_row', motion: 'upright_row', name: t('سحب علوي للترابيس (Upright Row)', 'Upright Row (Traps)'), aliases: ['Upright Row', 'Barbell Upright Row', 'Shrug', 'Barbell Shrug', 'Traps'],
    steps: [
      t('امسك البار بقبضة أضيق من الكتف بقليل، والذراعين ممدودة أمام الفخذ.', 'Hold the bar with a grip slightly narrower than shoulders, arms straight in front of your thighs.'),
      t('اسحب البار للأعلى قريباً من الجسم وقُد الحركة بالكوعين.', 'Pull the bar up close to your body, leading with the elbows.'),
      t('وقّف لما يصل البار لمستوى الصدر والكوعين بمستوى الكتف أو أقل بقليل.', 'Stop when the bar reaches chest height, elbows at or just below shoulder level.'),
      t('اعصر الترابيس ثانية، ثم انزل ببطء.', 'Squeeze your traps for a second, then lower slowly.'),
    ],
    mistakes: [t('رفع الكوعين أعلى من الكتف (يضغط على مفصل الكتف).', 'Elbows above shoulder height (stresses the shoulder).'), t('هز الجسم.', 'Swinging.'), t('قبضة ضيقة جداً.', 'Grip too narrow.')],
    breathing: t('أخرج النفس وأنت تسحب، وخذ نفس وأنت تنزل.', 'Exhale as you pull, inhale as you lower.'),
    tip: t('لو عندك ألم بالكتف، استخدم الدمبل أو هز الأكتاف (Shrug) بدلاً منه.', 'If your shoulder complains, use dumbbells or shrugs instead.'),
  },
  {
    id: 'lateral_raise_cable', motion: 'lateral_raise_cable', name: t('رفرفة جانبية بالكيبل', 'Cable Lateral Raise'),
    steps: [
      t('قف بجانب البكرة السفلية وامسك المقبض باليد البعيدة.', 'Stand beside a low pulley and hold the handle with the far hand.'),
      t('ارفع الذراع للجانب حتى مستوى الكتف.', 'Raise the arm out to shoulder height.'),
      t('انزل ببطء وبدّل الجهة بعد المجموعة.', 'Lower slowly; switch sides after the set.'),
    ],
    mistakes: [t('ميل الجذع بعيد عن البكرة.', 'Leaning away from the pulley.')],
    breathing: t('أخرج النفس وأنت ترفع.', 'Exhale as you raise.'),
  },
  {
    id: 'rear_delt_raise', motion: 'rear_delt_raise', name: t('رفرفة خلفي بالدمبل', 'Rear Delt Raise'), aliases: ['Rear Delt Fly', 'Reverse Fly'],
    steps: [
      t('انحنِ للأمام بظهر مستقيم والدمبلات تحت الصدر.', 'Hinge forward with a flat back, dumbbells under your chest.'),
      t('افتح الذراعين للجانب والكوع مثني قليلاً.', 'Open your arms out to the sides with soft elbows.'),
      t('اعصر أعلى الظهر ثم انزل ببطء.', 'Squeeze your upper back, then lower slowly.'),
    ],
    mistakes: [t('رفع الجذع مع كل تكرار.', 'Lifting the torso each rep.')],
    breathing: EXHALE_PULL,
  },

  // ------------------------------------------------------------------ ظهر
  {
    id: 'lat_pulldown', motion: 'lat_pulldown', name: t('سحب عالي (Lat Pulldown)', 'Lat Pulldown'),
    steps: [
      t('اجلس والفخذ تحت الوسادة، وامسك البار أعرض من الكتفين.', 'Sit with thighs under the pad, grip wider than shoulders.'),
      t('اسحب البار لأعلى الصدر بسحب الكوعين للأسفل.', 'Pull the bar to your upper chest by driving the elbows down.'),
      t('ارجع ببطء حتى تستقيم الذراعين.', 'Return slowly to straight arms.'),
    ],
    mistakes: [t('الميل للخلف بشكل كبير.', 'Leaning way back.'), t('سحب البار خلف الرقبة.', 'Pulling behind the neck.')],
    breathing: EXHALE_PULL,
  },
  {
    id: 'lat_pulldown_close', motion: 'lat_pulldown_close', name: t('سحب عالي قبضة ضيقة', 'Close-Grip Lat Pulldown'),
    steps: [
      t('استخدم مقبض ضيق (V) والكفوف متقابلة.', 'Use a close V-handle with palms facing each other.'),
      t('اسحب المقبض لأعلى الصدر والكوعين قريبة من الجسم.', 'Pull the handle to your upper chest, elbows close to your body.'),
      t('ارجع ببطء.', 'Return slowly.'),
    ],
    mistakes: [t('السحب بالذراعين بدل الظهر.', 'Pulling with the arms instead of the back.')],
    breathing: EXHALE_PULL,
  },
  {
    id: 'pullup', motion: 'pullup', name: t('عقلة (Pull-ups)', 'Pull-ups'), aliases: ['Pull-up', 'Chin-up'],
    steps: [
      t('امسك البار أعرض من الكتفين وتعلّق والذراعين مستقيمة.', 'Grip the bar wider than shoulders and hang with straight arms.'),
      t('اسحب جسمك حتى يتجاوز الذقن البار.', 'Pull yourself up until your chin clears the bar.'),
      t('انزل ببطء لتعلّق كامل.', 'Lower slowly to a full hang.'),
    ],
    mistakes: [t('التأرجح بالجسم.', 'Kipping and swinging.'), t('نزول ناقص.', 'Half reps.')],
    breathing: EXHALE_PULL,
    tip: t('إذا ما قدرت، استخدم جهاز المساعدة أو ربطة مطاطية.', 'If needed, use an assisted machine or a band.'),
  },
  {
    id: 'row_cable_seated', motion: 'row_cable_seated', name: t('سحب أرضي بالكيبل', 'Seated Cable Row'),
    steps: [
      t('اجلس والركب مثنية قليلاً وظهرك مستقيم.', 'Sit with knees slightly bent and a tall back.'),
      t('اسحب المقبض لبطنك وقرّب لوحي الكتف.', 'Pull the handle to your belly, squeezing your shoulder blades.'),
      t('ارجع ببطء مع تمدد الذراعين والظهر.', 'Return slowly, letting the arms and back stretch forward.'),
    ],
    mistakes: [t('الميل للخلف بقوة.', 'Rocking far back.'), t('تقويس الظهر للأمام.', 'Rounding forward.')],
    breathing: EXHALE_PULL,
  },
  {
    id: 'row_db_one_arm', motion: 'row_db_one_arm', name: t('تجديف بالدمبل', 'One-Arm Dumbbell Row'), aliases: ['Dumbbell Row'],
    steps: [
      t('ركبة ويد على البنش، والظهر موازي للأرض.', 'One knee and hand on the bench, back parallel to the floor.'),
      t('اسحب الدمبل باتجاه الحوض والكوع قريب من الجسم.', 'Row the dumbbell towards your hip, elbow close to your body.'),
      t('انزل ببطء وبدّل بعد المجموعة.', 'Lower slowly; switch sides after the set.'),
    ],
    mistakes: [t('لف الجذع لرفع الوزن.', 'Twisting the torso to heave the weight.')],
    breathing: EXHALE_PULL,
  },
  {
    id: 'row_bb', motion: 'row_bb', name: t('تجديف بالبار', 'Barbell Row'), aliases: ['Bent-Over Row'],
    steps: [
      t('انحنِ للأمام 45 درجة تقريباً والظهر مستقيم.', 'Hinge forward to about 45° with a flat back.'),
      t('اسحب البار لأسفل الصدر/أعلى البطن.', 'Row the bar to your lower chest / upper belly.'),
      t('انزل ببطء بدون ما تغيّر زاوية الجسم.', 'Lower slowly without changing your torso angle.'),
    ],
    mistakes: [t('رفع الجذع مع كل سحبة.', 'Standing up with each rep.'), t('تقويس الظهر.', 'Rounding the back.')],
    breathing: EXHALE_PULL,
  },

  // ------------------------------------------------------------------ ذراعين
  {
    id: 'curl_db', motion: 'curl_db', name: t('باي بالدمبل', 'Dumbbell Curl'), aliases: ['Biceps Curl', 'Curl'],
    steps: [
      t('قف والدمبلات بجانبك والكفوف للأمام.', 'Stand with dumbbells at your sides, palms forward.'),
      t('اثنِ الكوع وارفع الدمبل للكتف والكوع ثابت بجانب الجسم.', 'Curl up to your shoulders, elbows pinned to your sides.'),
      t('انزل ببطء حتى تستقيم الذراع.', 'Lower slowly to straight arms.'),
    ],
    mistakes: [t('هز الجسم.', 'Swinging the body.'), t('تقديم الكوع للأمام.', 'Elbows drifting forward.')],
    breathing: t('أخرج النفس وأنت ترفع، وخذ نفس وأنت تنزل.', 'Exhale as you curl, inhale as you lower.'),
  },
  {
    id: 'curl_hammer', motion: 'curl_hammer', name: t('باي هامر', 'Hammer Curl'),
    steps: [
      t('امسك الدمبلات والكفوف متقابلة (مثل المطرقة).', 'Hold the dumbbells with palms facing each other (hammer grip).'),
      t('اثنِ الكوع وارفع بدون تدوير الرسغ.', 'Curl up without rotating the wrists.'),
      t('انزل ببطء.', 'Lower slowly.'),
    ],
    mistakes: [t('استخدام الكتف في الرفع.', 'Using the shoulders to lift.')],
    breathing: t('أخرج النفس وأنت ترفع.', 'Exhale as you curl.'),
  },
  {
    id: 'curl_bb', motion: 'curl_bb', name: t('باي بالبار', 'Barbell Curl'),
    steps: [
      t('امسك البار بعرض الكتفين والكفوف للأعلى.', 'Grip the bar shoulder-width, palms up.'),
      t('ارفع البار للكتف والكوعين ثابتين.', 'Curl the bar to your shoulders with fixed elbows.'),
      t('انزل ببطء.', 'Lower slowly.'),
    ],
    mistakes: [t('الميل للخلف لرفع البار.', 'Leaning back to heave the bar.')],
    breathing: t('أخرج النفس وأنت ترفع.', 'Exhale as you curl.'),
  },
  {
    id: 'triceps_pushdown', motion: 'triceps_pushdown', name: t('تراي بالكيبل (Pushdown)', 'Cable Pushdown'), aliases: ['Triceps Pushdown', 'Rope Pushdown'],
    steps: [
      t('قف أمام البكرة العلوية والكوعين ملاصقة للجسم.', 'Stand at a high pulley with elbows tucked to your sides.'),
      t('ادفع المقبض للأسفل حتى تستقيم الذراعين.', 'Push the handle down until your arms are straight.'),
      t('ارجع ببطء حتى 90 درجة بدون تحريك الكوع.', 'Return slowly to 90° without moving the elbows.'),
    ],
    mistakes: [t('تحريك الكتف والكوع.', 'Letting the elbows and shoulders move.'), t('الميل بالجسم فوق المقبض.', 'Leaning your body weight over the handle.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'triceps_overhead_db', motion: 'triceps_overhead_db', name: t('تراي فرنسي بالدمبل', 'Overhead Dumbbell Extension'), aliases: ['Overhead Triceps Extension'],
    steps: [
      t('امسك دمبل بكلتا اليدين فوق رأسك.', 'Hold one dumbbell overhead with both hands.'),
      t('نزّل الدمبل خلف الرأس بثني الكوع فقط.', 'Lower it behind your head by bending only at the elbows.'),
      t('افرد الذراعين للأعلى.', 'Extend back up to straight arms.'),
    ],
    mistakes: [t('فتح الكوعين للخارج.', 'Flaring the elbows out.'), t('تقويس الظهر.', 'Arching the back.')],
    breathing: EXHALE_PUSH,
  },

  // ------------------------------------------------------------------ بطن
  {
    id: 'plank', motion: 'plank', name: t('بلانك', 'Plank'),
    steps: [
      t('الساعدين على الأرض والكوع تحت الكتف.', 'Forearms on the floor, elbows under shoulders.'),
      t('ارفع جسمك بخط مستقيم من الرأس للكعب.', 'Lift into a straight line from head to heels.'),
      t('شد البطن والأرداف واثبت المدة المطلوبة.', 'Brace your abs and glutes and hold for the set time.'),
    ],
    mistakes: [t('نزول الحوض للأرض.', 'Hips sagging.'), t('رفع الحوض للأعلى.', 'Hips piking up.')],
    breathing: BRACE,
  },
  {
    id: 'hanging_knee_raise', motion: 'hanging_knee_raise', name: t('رفع أرجل معلّق', 'Hanging Knee Raise'),
    steps: [
      t('تعلّق في البار والذراعين مستقيمة.', 'Hang from a bar with straight arms.'),
      t('ارفع الركب للصدر بلف الحوض للأعلى.', 'Raise your knees to your chest by curling your pelvis up.'),
      t('انزل ببطء بدون تأرجح.', 'Lower slowly without swinging.'),
    ],
    mistakes: [t('التأرجح واستخدام الزخم.', 'Swinging and using momentum.')],
    breathing: t('أخرج النفس وأنت ترفع.', 'Exhale as you lift.'),
  },
  {
    id: 'ab_wheel', motion: 'ab_wheel', name: t('عجلة البطن', 'Ab Wheel Rollout'),
    steps: [
      t('على ركبك والعجلة تحت الكتف.', 'Kneel with the wheel under your shoulders.'),
      t('ادفع العجلة للأمام ببطء مع شد البطن وظهر مستقيم.', 'Roll forward slowly, abs braced and back flat.'),
      t('ارجع باستخدام البطن قبل ما يتقوس الظهر.', 'Pull back with your abs before your lower back sags.'),
    ],
    mistakes: [t('تقويس أسفل الظهر.', 'Letting the lower back sag.'), t('الذهاب أبعد من قدرتك.', 'Rolling further than you can control.')],
    breathing: t('خذ نفس وأنت تتقدم، وأخرجه وأنت ترجع.', 'Inhale as you roll out, exhale as you roll back.'),
  },
  // ================================================================== مكتبة موسّعة
  // ------------------------------------------------------------------ أرجل وأرداف
  {
    id: 'front_squat', motion: 'front_squat', name: t('فرونت سكوات', 'Front Squat'), aliases: ['Barbell Front Squat'],
    steps: [
      t('حط البار على مقدمة الكتفين والكوعين مرفوعين للأمام.', 'Rest the bar on the front of your shoulders with elbows high.'),
      t('القدمين بعرض الكتفين، شد البطن وانزل بجذع شبه عمودي.', 'Feet shoulder-width, brace and sit down keeping your torso upright.'),
      t('اصعد وأنت محافظ على الكوعين مرفوعة.', 'Stand up while keeping your elbows high.'),
    ],
    mistakes: [t('نزول الكوعين فيطيح البار للأمام.', 'Elbows dropping so the bar rolls forward.'), t('رفع الكعب.', 'Heels lifting.')],
    breathing: EXHALE_UP,
    tip: t('تركّز على الفخذ الأمامي أكثر من السكوات الخلفي.', 'Hits the quads more than the back squat.'),
  },
  {
    id: 'sumo_squat', motion: 'sumo_squat', name: t('سكوات سومو بالدمبل', 'Dumbbell Sumo Squat'), aliases: ['Sumo Squat', 'Plie Squat'],
    steps: [
      t('افتح قدميك أوسع من الكتفين وأصابعك للخارج.', 'Stand wide with toes pointing out.'),
      t('امسك الدمبل بين رجليك وانزل والركب تفتح باتجاه الأصابع.', 'Hold a dumbbell between your legs and sit down, knees pushing out over your toes.'),
      t('اضغط الأرداف واصعد.', 'Squeeze your glutes to stand up.'),
    ],
    mistakes: [t('دخول الركب للداخل.', 'Knees caving in.'), t('ميلان الجذع للأمام.', 'Leaning the torso forward.')],
    breathing: EXHALE_UP,
  },
  {
    id: 'sumo_deadlift', motion: 'sumo_deadlift', name: t('ديدلفت سومو', 'Sumo Deadlift'),
    steps: [
      t('وقفة واسعة وأصابع للخارج، والبار فوق منتصف القدم.', 'Wide stance, toes out, bar over mid-foot.'),
      t('امسك البار بين رجليك، الصدر مرفوع والظهر مستقيم.', 'Grip the bar inside your knees, chest up, back flat.'),
      t('ادفع الأرض وافتح الركب حتى تقف مستقيم.', 'Push the floor away and spread your knees until you stand tall.'),
    ],
    mistakes: [t('تقويس الظهر.', 'Rounding the back.'), t('رفع الحوض قبل الصدر.', 'Hips shooting up before the chest.')],
    breathing: t('خذ نفس وشد البطن قبل السحب، وأخرجه فوق.', 'Breathe in and brace before the pull, exhale at the top.'),
  },
  {
    id: 'step_up', motion: 'step_up', name: t('ستيب أب (صعود الصندوق)', 'Dumbbell Step-Up'), aliases: ['Step Up', 'Box Step Up'],
    steps: [
      t('حط قدم كاملة على صندوق أو بنش منخفض.', 'Place one whole foot on a box or low bench.'),
      t('اصعد بدفع الرجل اللي فوق، مو بالقفز من الرجل الثانية.', 'Drive up through the top leg, not by bouncing off the back one.'),
      t('انزل ببطء وبدّل الرجل بعد المجموعة.', 'Lower slowly and switch legs after the set.'),
    ],
    mistakes: [t('الدفع من الرجل اللي تحت.', 'Pushing off the bottom leg.'), t('دخول الركبة للداخل.', 'Knee caving in.')],
    breathing: EXHALE_UP,
  },
  {
    id: 'reverse_lunge', motion: 'split_squat', name: t('لنج خلفي', 'Reverse Lunge'), aliases: ['Reverse Lunges', 'Bodyweight Lunge'],
    steps: [
      t('من الوقوف ارجع خطوة واسعة للخلف.', 'From standing, take a long step back.'),
      t('انزل حتى تقرب الركبة الخلفية من الأرض.', 'Lower until your back knee nearly touches the floor.'),
      t('ادفع بالرجل الأمامية وارجع للوقوف.', 'Drive through the front foot back to standing.'),
    ],
    mistakes: [t('خطوة قصيرة جداً.', 'Stepping too short.'), t('ميلان الجذع.', 'Leaning the torso.')],
    breathing: EXHALE_UP,
    tip: t('أريح على الركبة من اللنج الأمامي.', 'Easier on the knees than a forward lunge.'),
  },
  {
    id: 'good_morning', motion: 'good_morning', name: t('قود مورنينق', 'Good Morning'),
    steps: [
      t('البار على أعلى الظهر والركب مثنية قليلاً.', 'Bar on your upper back, knees slightly bent.'),
      t('ارجع بالحوض وانحني بظهر مستقيم حتى تحس بشد الفخذ الخلفي.', 'Push your hips back and hinge with a flat back until you feel the hamstrings stretch.'),
      t('ارجع للوقوف بشد الأرداف.', 'Return to standing by squeezing your glutes.'),
    ],
    mistakes: [t('تقويس الظهر.', 'Rounding the back.'), t('وزن ثقيل من البداية.', 'Going heavy too soon.')],
    breathing: EXHALE_UP,
    tip: t('ابدأ بوزن خفيف جداً.', 'Start very light.'),
  },
  {
    id: 'donkey_kick', motion: 'donkey_kick', name: t('ركلة الأرداف (دنكي كيك)', 'Donkey Kick'), aliases: ['Glute Kickback', 'Quadruped Kickback'],
    steps: [
      t('على يديك وركبك، اليدين تحت الكتف والركب تحت الحوض.', 'On hands and knees, hands under shoulders and knees under hips.'),
      t('ارفع رجل وحدة للسقف والركبة مثنية ٩٠ درجة.', 'Lift one leg toward the ceiling, knee bent 90°.'),
      t('اضغط الأرداف فوق ثانية وانزل ببطء.', 'Squeeze the glute at the top for a second, then lower slowly.'),
    ],
    mistakes: [t('تقويس أسفل الظهر.', 'Arching the lower back.'), t('الأرجحة بسرعة.', 'Swinging fast.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'hip_abduction', motion: 'hip_abduction', name: t('جهاز فتح الأرجل (أبدكشن)', 'Hip Abduction Machine'), aliases: ['Hip Abduction', 'Abductor Machine'],
    steps: [
      t('اجلس وظهرك على المسند والوسائد على جانب الركب.', 'Sit back with the pads on the outside of your knees.'),
      t('افتح رجليك للخارج بقوة الأرداف.', 'Push your legs apart using your glutes.'),
      t('ارجع ببطء بدون ما تضرب الأوزان.', 'Return slowly without letting the weights slam.'),
    ],
    mistakes: [t('الرجوع بسرعة.', 'Snapping back quickly.'), t('الميلان للأمام والخلف.', 'Rocking the torso.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'seated_calf_raise', motion: 'seated_calf_raise', name: t('سمانة جلوس', 'Seated Calf Raise'),
    steps: [
      t('اجلس والوزن على الركب، ومقدمة القدم على مرتفع.', 'Sit with the weight on your knees and the balls of your feet raised.'),
      t('ارفع الكعب لأعلى نقطة وثبّت ثانية.', 'Raise your heels as high as possible and hold a second.'),
      t('انزل ببطء لآخر مدى.', 'Lower slowly to a full stretch.'),
    ],
    mistakes: [t('مدى حركة قصير.', 'Short range of motion.'), t('الارتداد بسرعة.', 'Bouncing.')],
    breathing: EXHALE_PUSH,
    tip: t('تركّز على العضلة النعلية تحت السمانة.', 'Targets the soleus under the calf.'),
  },
  {
    id: 'single_leg_rdl', motion: 'single_leg_rdl', name: t('رومانيان رجل وحدة', 'Single-Leg Romanian Deadlift'), aliases: ['Single Leg RDL', 'Single Leg Deadlift'],
    steps: [
      t('قف على رجل وحدة والركبة مثنية قليلاً.', 'Stand on one leg with a soft knee.'),
      t('انحني للأمام والرجل الثانية ترتفع خلفك بخط مستقيم مع الظهر.', 'Hinge forward as the other leg rises behind you in line with your back.'),
      t('ارجع للوقوف بشد أرداف الرجل الواقفة.', 'Return to standing by squeezing the standing glute.'),
    ],
    mistakes: [t('فتح الحوض للجنب.', 'Opening the hip to the side.'), t('تقويس الظهر.', 'Rounding the back.')],
    breathing: EXHALE_UP,
    tip: t('امسك جدار بيد لو التوازن صعب.', 'Hold a wall if balance is hard.'),
  },
  {
    id: 'kb_swing', motion: 'kb_swing', name: t('سوينق بالكيتل بل', 'Kettlebell Swing'), aliases: ['Kettlebell Swing', 'Dumbbell Swing'],
    steps: [
      t('امسك الكيتل بل (أو دمبل) بيدينك والقدمين أوسع من الكتف.', 'Hold a kettlebell (or dumbbell) with both hands, feet a bit wider than shoulders.'),
      t('ارجع بالحوض وخل الوزن يمر بين رجليك.', 'Hinge back and let the weight swing between your legs.'),
      t('ادفع الحوض للأمام بقوة لين يوصل الوزن لمستوى الصدر.', 'Snap your hips forward so the weight floats to chest height.'),
    ],
    mistakes: [t('الرفع بالأكتاف بدل الحوض.', 'Lifting with the shoulders instead of the hips.'), t('السكوات بدل الانحناء.', 'Squatting instead of hinging.')],
    breathing: t('أخرج النفس بقوة عند دفع الحوض.', 'Exhale sharply as you drive the hips.'),
  },
  {
    id: 'wall_sit', motion: 'wall_sit', name: t('جلسة الحائط', 'Wall Sit'),
    steps: [
      t('الصق ظهرك بالحائط وانزل لين الفخذ موازي للأرض.', 'Lean your back on a wall and slide down until thighs are parallel.'),
      t('الركب فوق الكعب مباشرة.', 'Knees directly over your heels.'),
      t('اثبت ٣٠–٦٠ ثانية.', 'Hold for 30–60 seconds.'),
    ],
    mistakes: [t('الركب متقدمة عن الأصابع.', 'Knees past the toes.'), t('دفع الحائط باليدين.', 'Pushing on the wall with your hands.')],
    breathing: BRACE,
  },
  {
    id: 'air_squat', motion: 'air_squat', name: t('سكوات بوزن الجسم', 'Bodyweight Squat'), aliases: ['Air Squat', 'Bodyweight Squats'],
    steps: [
      t('القدمين بعرض الكتفين.', 'Feet shoulder-width apart.'),
      t('انزل كأنك تجلس ومد يدينك للأمام للتوازن.', 'Sit down and reach your arms forward for balance.'),
      t('اصعد بدفع الأرض بكامل القدم.', 'Stand up by driving through your whole foot.'),
    ],
    mistakes: [t('رفع الكعب.', 'Lifting the heels.'), t('دخول الركب.', 'Knees caving in.')],
    breathing: EXHALE_UP,
  },
  // ------------------------------------------------------------------ صدر
  {
    id: 'incline_bench_bb', motion: 'incline_bench_bb', name: t('بنش مائل بالبار', 'Incline Barbell Bench Press'), aliases: ['Incline Bench Press', 'Incline Barbell Press'],
    steps: [
      t('البنش على ٣٠–٤٥ درجة والقبضة أعرض من الكتف.', 'Set the bench to 30–45° and grip slightly wider than your shoulders.'),
      t('نزّل البار لأعلى الصدر تحت الترقوة.', 'Lower the bar to your upper chest below the collarbones.'),
      t('ادفع للأعلى بدون ما تقفل الكوع بقوة.', 'Press up without slamming your elbows locked.'),
    ],
    mistakes: [t('رفع الحوض عن البنش.', 'Lifting the hips off the bench.'), t('ميلان عالي جداً فيصير تمرين كتف.', 'Too steep an angle, turning it into a shoulder press.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'close_grip_bench', motion: 'close_grip_bench', name: t('بنش قبضة ضيقة', 'Close-Grip Bench Press'), aliases: ['Close Grip Bench', 'Close-Grip Bench'],
    steps: [
      t('امسك البار بعرض الكتفين تقريباً.', 'Grip the bar about shoulder-width.'),
      t('نزّله لأسفل الصدر والكوعين قريبة من الجسم.', 'Lower it to your lower chest, elbows close to your body.'),
      t('ادفع بالترايسبس للأعلى.', 'Press up with your triceps.'),
    ],
    mistakes: [t('قبضة ضيقة جداً تضغط الرسغ.', 'Grip so narrow it strains the wrists.'), t('فتح الكوعين للخارج.', 'Flaring the elbows.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'push_up', motion: 'push_up', name: t('ضغط', 'Push-Up'), aliases: ['Push Up', 'Pushups', 'Press Up'],
    steps: [
      t('اليدين أعرض قليلاً من الكتف والجسم مستقيم من الرأس للكعب.', 'Hands slightly wider than shoulders, body straight from head to heels.'),
      t('انزل حتى يقرب صدرك من الأرض والكوعين بزاوية ٤٥°.', 'Lower until your chest nearly touches the floor, elbows at about 45°.'),
      t('ادفع الأرض وارجع لفوق.', 'Push the floor away back to the top.'),
    ],
    mistakes: [t('نزول الحوض.', 'Hips sagging.'), t('فتح الكوعين ٩٠°.', 'Elbows flared to 90°.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'knee_push_up', motion: 'knee_push_up', name: t('ضغط على الركب', 'Knee Push-Up'), aliases: ['Knee Push Up', 'Modified Push Up'],
    steps: [
      t('الركب على الأرض والجسم مستقيم من الرأس للركبة.', 'Knees on the floor, body straight from head to knees.'),
      t('انزل بصدرك بين يديك.', 'Lower your chest between your hands.'),
      t('ادفع لفوق وشد البطن.', 'Press up with your core tight.'),
    ],
    mistakes: [t('ثني الحوض.', 'Bending at the hips.'), t('نزول نصف المدى.', 'Half reps.')],
    breathing: EXHALE_PUSH,
    tip: t('خطوة مثالية قبل الضغط الكامل.', 'The perfect step before full push-ups.'),
  },
  {
    id: 'db_fly', motion: 'db_fly', name: t('تفتيح دمبل مستوي', 'Dumbbell Fly'), aliases: ['Dumbbell Flyes', 'Flat Dumbbell Fly'],
    steps: [
      t('استلقِ والدمبلين فوق الصدر والكوعين مثنية قليلاً.', 'Lie back with dumbbells above your chest, elbows slightly bent.'),
      t('افتح يدينك للجنب بقوس واسع لين تحس بشد الصدر.', 'Open your arms in a wide arc until you feel a chest stretch.'),
      t('ارجع بنفس القوس كأنك تحضن شجرة.', 'Bring them back along the same arc, like hugging a tree.'),
    ],
    mistakes: [t('فرد الكوع بالكامل.', 'Locking the elbows straight.'), t('النزول أعمق من الكتف.', 'Going deeper than your shoulders allow.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'incline_db_fly', motion: 'incline_db_fly', name: t('تفتيح دمبل مائل', 'Incline Dumbbell Fly'),
    steps: [
      t('البنش مائل ٣٠° والدمبلين فوق الصدر.', 'Bench at 30°, dumbbells above your chest.'),
      t('افتح يدينك بقوس واسع مع ثني خفيف بالكوع.', 'Open your arms in a wide arc with a soft elbow bend.'),
      t('ارجع للأعلى وشد أعلى الصدر.', 'Bring them back up squeezing your upper chest.'),
    ],
    mistakes: [t('تحويلها لضغط.', 'Turning it into a press.'), t('وزن ثقيل على المفصل.', 'Too heavy for the shoulder joint.')],
    breathing: EXHALE_PUSH,
  },
  // ------------------------------------------------------------------ أكتاف
  {
    id: 'arnold_press', motion: 'arnold_press', name: t('ضغط أرنولد', 'Arnold Press'), aliases: ['Arnold Dumbbell Press'],
    steps: [
      t('اجلس والدمبل أمام وجهك وكفوفك باتجاهك.', 'Sit with dumbbells in front of your face, palms facing you.'),
      t('ادفع للأعلى وأنت تلف الكفوف للأمام.', 'Press up while rotating your palms to face forward.'),
      t('ارجع ببطء بعكس الحركة.', 'Reverse the rotation slowly on the way down.'),
    ],
    mistakes: [t('تقويس الظهر.', 'Arching the back.'), t('السرعة في الدوران.', 'Rushing the rotation.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'front_raise', motion: 'front_raise', name: t('رفرفة أمامي', 'Front Raise'), aliases: ['Dumbbell Front Raise'],
    steps: [
      t('قف والدمبل أمام الفخذين.', 'Stand with dumbbells in front of your thighs.'),
      t('ارفع يدينك للأمام لمستوى الكتف مع كوع مثني قليلاً.', 'Raise your arms forward to shoulder height with a soft elbow.'),
      t('انزل ببطء.', 'Lower slowly.'),
    ],
    mistakes: [t('الأرجحة بالجسم.', 'Swinging your body.'), t('الرفع فوق الكتف.', 'Raising above shoulder height.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'face_pull', motion: 'face_pull', name: t('فيس بول', 'Face Pull'), aliases: ['Cable Face Pull', 'Rope Face Pull'],
    steps: [
      t('حط الحبل بمستوى الوجه وامسكه والكفوف لتحت.', 'Set the rope at face height and grip it palms down.'),
      t('اسحب باتجاه وجهك والكوعين عالية للجنب.', 'Pull toward your face with elbows high and wide.'),
      t('افتح الحبل عند وجهك واضغط الكتف الخلفي.', 'Pull the rope apart at your face and squeeze your rear delts.'),
    ],
    mistakes: [t('نزول الكوعين.', 'Letting the elbows drop.'), t('الميلان للخلف.', 'Leaning back.')],
    breathing: EXHALE_PULL,
    tip: t('ممتاز لصحة الكتف وتحسين وقفة الجسم.', 'Great for shoulder health and posture.'),
  },
  {
    id: 'reverse_pec_deck', motion: 'reverse_pec_deck', name: t('تفتيح عكسي بالجهاز', 'Reverse Pec Deck'), aliases: ['Reverse Fly Machine', 'Rear Delt Machine'],
    steps: [
      t('اجلس ووجهك للجهاز وامسك المقابض قدامك.', 'Sit facing the machine and hold the handles in front of you.'),
      t('افتح يدينك للخلف والكوع مثني قليلاً.', 'Open your arms back with a slight elbow bend.'),
      t('اضغط الكتف الخلفي وارجع ببطء.', 'Squeeze your rear delts and return slowly.'),
    ],
    mistakes: [t('رفع الأكتاف للأذن.', 'Shrugging toward your ears.'), t('استخدام قوة الظهر بالأرجحة.', 'Using momentum.')],
    breathing: EXHALE_PULL,
  },
  // ------------------------------------------------------------------ ظهر
  {
    id: 't_bar_row', motion: 't_bar_row', name: t('تجديف تي بار', 'T-Bar Row'), aliases: ['T Bar Row', 'Landmine Row'],
    steps: [
      t('قف فوق البار وانحني بظهر مستقيم.', 'Straddle the bar and hinge forward with a flat back.'),
      t('اسحب المقبض باتجاه أسفل الصدر.', 'Pull the handle toward your lower chest.'),
      t('اضغط لوحي الكتف وارجع ببطء.', 'Squeeze your shoulder blades and lower slowly.'),
    ],
    mistakes: [t('رفع الجذع مع كل عدّة.', 'Standing up on every rep.'), t('تقويس الظهر.', 'Rounding the back.')],
    breathing: EXHALE_PULL,
  },
  {
    id: 'chin_up', motion: 'chin_up', name: t('عقلة بقبضة معكوسة', 'Chin-Up'), aliases: ['Chin Up', 'Chinups'],
    steps: [
      t('امسك البار والكفوف باتجاهك بعرض الكتفين.', 'Grip the bar palms facing you, shoulder-width.'),
      t('اسحب جسمك لين يعدي ذقنك البار.', 'Pull up until your chin clears the bar.'),
      t('انزل ببطء لين تفرد يدينك.', 'Lower slowly to straight arms.'),
    ],
    mistakes: [t('الأرجحة بالرجلين.', 'Kipping with your legs.'), t('نصف المدى.', 'Half reps.')],
    breathing: EXHALE_PULL,
    tip: t('تشغل البايسبس أكثر من العقلة العادية.', 'Works the biceps more than regular pull-ups.'),
  },
  {
    id: 'straight_arm_pulldown', motion: 'straight_arm_pulldown', name: t('سحب بيد مفرودة', 'Straight-Arm Pulldown'), aliases: ['Straight Arm Pulldown', 'Cable Pullover'],
    steps: [
      t('قف أمام الكيبل العالي وانحني قليلاً.', 'Stand facing a high cable, hinged slightly forward.'),
      t('اسحب البار لتحت لين الفخذ ويدينك شبه مفرودة.', 'Sweep the bar down to your thighs with nearly straight arms.'),
      t('ارجع ببطء وحس بشد الظهر العريض.', 'Return slowly, feeling the lats stretch.'),
    ],
    mistakes: [t('ثني الكوع وتحويله لضغط تراي.', 'Bending the elbows into a triceps pushdown.'), t('تحريك الجذع.', 'Moving the torso.')],
    breathing: EXHALE_PULL,
  },
  {
    id: 'superman', motion: 'superman', name: t('سوبرمان', 'Superman'), aliases: ['Superman Hold', 'Back Extension'],
    steps: [
      t('استلقِ على بطنك ويدينك ممدودة قدامك.', 'Lie face down with arms stretched overhead.'),
      t('ارفع يدينك وصدرك ورجليك سوا عن الأرض.', 'Lift your arms, chest and legs off the floor together.'),
      t('اثبت ثانيتين وانزل ببطء.', 'Hold two seconds and lower slowly.'),
    ],
    mistakes: [t('رفع الرقبة بقوة.', 'Cranking the neck up.'), t('الحركة السريعة.', 'Rushing the reps.')],
    breathing: t('أخرج النفس وأنت ترفع، وخذ نفس وأنت تنزل.', 'Exhale as you lift, inhale as you lower.'),
  },
  {
    id: 'db_pullover', motion: 'db_pullover', name: t('بول أوفر بالدمبل', 'Dumbbell Pullover'), aliases: ['Pullover'],
    steps: [
      t('استلقِ وامسك دمبل واحد بيدينك فوق صدرك.', 'Lie back holding one dumbbell with both hands above your chest.'),
      t('نزّله خلف رأسك بقوس مع كوع مثني قليلاً.', 'Lower it behind your head in an arc with slightly bent elbows.'),
      t('ارجعه فوق الصدر بشد الظهر والصدر.', 'Pull it back over your chest using lats and chest.'),
    ],
    mistakes: [t('تقويس الظهر بقوة.', 'Excessive back arch.'), t('ثني الكوع كثير.', 'Bending the elbows too much.')],
    breathing: t('خذ نفس وأنت تنزل الدمبل، وأخرجه وأنت ترجعه.', 'Inhale as the dumbbell goes back, exhale as you return it.'),
  },
  // ------------------------------------------------------------------ ذراعين
  {
    id: 'concentration_curl', motion: 'concentration_curl', name: t('تركيز باي', 'Concentration Curl'), aliases: ['Preacher Curl', 'Seated Concentration Curl'],
    steps: [
      t('اجلس وحط كوعك على باطن فخذك.', 'Sit and brace your elbow against your inner thigh.'),
      t('ارفع الدمبل باتجاه كتفك بدون تحريك الكوع.', 'Curl the dumbbell toward your shoulder without moving the elbow.'),
      t('انزل ببطء لين تفرد يدك.', 'Lower slowly to a full stretch.'),
    ],
    mistakes: [t('تحريك الكتف.', 'Swinging the shoulder.'), t('نصف المدى.', 'Half reps.')],
    breathing: EXHALE_PULL,
  },
  {
    id: 'cable_curl', motion: 'cable_curl', name: t('باي بالكيبل', 'Cable Curl'), aliases: ['Cable Bicep Curl', 'Cable Biceps Curl'],
    steps: [
      t('امسك البار من الكيبل السفلي والكوعين جنبك.', 'Hold the bar from a low cable, elbows by your sides.'),
      t('ارفع لين مستوى الكتف.', 'Curl up to shoulder level.'),
      t('انزل ببطء مع مقاومة الكيبل.', 'Lower slowly against the cable.'),
    ],
    mistakes: [t('تقدّم الكوعين للأمام.', 'Elbows drifting forward.'), t('ميلان الجسم.', 'Leaning back.')],
    breathing: EXHALE_PULL,
  },
  {
    id: 'incline_db_curl', motion: 'incline_db_curl', name: t('باي على بنش مائل', 'Incline Dumbbell Curl'), aliases: ['Incline Curl'],
    steps: [
      t('اجلس على بنش مائل ٤٥° ويدينك متدلية خلف جسمك.', 'Sit on a 45° bench, arms hanging behind your body.'),
      t('ارفع الدمبلين بدون ما يتقدم الكوع.', 'Curl both dumbbells without moving your elbows forward.'),
      t('انزل ببطء لآخر مدى.', 'Lower slowly to a full stretch.'),
    ],
    mistakes: [t('رفع الكتفين عن البنش.', 'Shoulders coming off the bench.'), t('وزن ثقيل.', 'Too heavy.')],
    breathing: EXHALE_PULL,
    tip: t('تمطّط البايسبس أكثر من الباي العادي.', 'Gives the biceps a bigger stretch.'),
  },
  {
    id: 'skull_crusher', motion: 'skull_crusher', name: t('سكل كراشر', 'Skull Crusher'), aliases: ['Lying Triceps Extension', 'EZ Bar Skull Crusher'],
    steps: [
      t('استلقِ والبار فوق صدرك واليدين مفرودة.', 'Lie back with the bar above your chest, arms straight.'),
      t('اثنِ الكوعين ونزّل البار باتجاه جبهتك.', 'Bend your elbows to lower the bar toward your forehead.'),
      t('افرد يدينك بقوة الترايسبس.', 'Extend your arms using your triceps.'),
    ],
    mistakes: [t('فتح الكوعين.', 'Flaring the elbows.'), t('تحريك الكتف.', 'Moving at the shoulders.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'triceps_kickback', motion: 'triceps_kickback', name: t('كيك باك تراي', 'Triceps Kickback'), aliases: ['Dumbbell Kickback'],
    steps: [
      t('انحني على البنش ويدك الثانية مسنودة.', 'Lean on a bench with your other hand supporting you.'),
      t('ثبّت العضد جنب جسمك.', 'Keep your upper arm tight to your side.'),
      t('افرد يدك للخلف واضغط التراي ثم ارجع ببطء.', 'Extend your arm back, squeeze the triceps, then return slowly.'),
    ],
    mistakes: [t('أرجحة العضد.', 'Swinging the upper arm.'), t('وزن ثقيل.', 'Too heavy.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'bench_dips', motion: 'bench_dips', name: t('ديبس على البنش', 'Bench Dips'), aliases: ['Bench Dip', 'Chair Dips'],
    steps: [
      t('يدينك على طرف البنش خلفك ورجليك قدامك.', 'Hands on the edge of a bench behind you, legs in front.'),
      t('انزل بثني الكوعين لين ٩٠ درجة.', 'Lower by bending your elbows to about 90°.'),
      t('ادفع لفوق بالترايسبس.', 'Press back up with your triceps.'),
    ],
    mistakes: [t('النزول أعمق من اللازم.', 'Going too deep for your shoulders.'), t('الابتعاد عن البنش.', 'Drifting away from the bench.')],
    breathing: EXHALE_PUSH,
    tip: t('ثنِّ الركب لتسهيلها.', 'Bend your knees to make it easier.'),
  },
  // ------------------------------------------------------------------ بطن
  {
    id: 'crunch', motion: 'crunch', name: t('كرنش', 'Crunch'), aliases: ['Crunches', 'Ab Crunch'],
    steps: [
      t('استلقِ والركب مثنية ويدينك جنب رأسك.', 'Lie back, knees bent, hands beside your head.'),
      t('ارفع كتفيك عن الأرض بشد البطن.', 'Curl your shoulders off the floor by contracting your abs.'),
      t('انزل ببطء بدون ما ترتاح.', 'Lower slowly without fully relaxing.'),
    ],
    mistakes: [t('سحب الرأس باليدين.', 'Pulling on your head.'), t('الارتداد بسرعة.', 'Bouncing.')],
    breathing: t('أخرج النفس وأنت ترتفع.', 'Exhale as you curl up.'),
  },
  {
    id: 'lying_leg_raise', motion: 'lying_leg_raise', name: t('رفع الأرجل استلقاء', 'Lying Leg Raise'), aliases: ['Leg Raises', 'Lying Leg Raises'],
    steps: [
      t('استلقِ ويدينك جنبك أو تحت الحوض.', 'Lie flat with hands by your sides or under your hips.'),
      t('ارفع رجليك مفرودة لين ٩٠ درجة.', 'Raise straight legs up to 90°.'),
      t('نزّلها ببطء بدون ما يتقوس ظهرك.', 'Lower slowly without arching your back.'),
    ],
    mistakes: [t('تقويس أسفل الظهر.', 'Arching the lower back.'), t('إسقاط الرجلين بسرعة.', 'Dropping the legs fast.')],
    breathing: t('أخرج النفس وأنت ترفع.', 'Exhale as you lift.'),
  },
  {
    id: 'mountain_climber', motion: 'mountain_climber', name: t('متسلق الجبل', 'Mountain Climber'), aliases: ['Mountain Climbers'],
    steps: [
      t('ابدأ بوضعية الضغط والجسم مستقيم.', 'Start in a push-up position with a straight body.'),
      t('اسحب ركبة باتجاه صدرك ثم بدّل بسرعة.', 'Drive one knee toward your chest, then switch quickly.'),
      t('خل الحوض ثابت والكتف فوق اليدين.', 'Keep your hips level and shoulders over your hands.'),
    ],
    mistakes: [t('رفع الحوض لفوق.', 'Hips piking up.'), t('الكتف يرجع خلف اليدين.', 'Shoulders drifting behind the hands.')],
    breathing: t('تنفس بإيقاع منتظم مع الحركة.', 'Breathe rhythmically with the movement.'),
  },
  {
    id: 'dead_bug', motion: 'dead_bug', name: t('دِد بق', 'Dead Bug'),
    steps: [
      t('استلقِ ويدينك للسقف والركب مثنية فوق الحوض.', 'Lie back, arms to the ceiling, knees bent over your hips.'),
      t('مد يد ورجل عكسها ببطء لين تقرب من الأرض.', 'Slowly extend the opposite arm and leg toward the floor.'),
      t('ارجع وبدّل الجهة، وخل أسفل ظهرك لاصق بالأرض.', 'Return and switch sides, keeping your lower back on the floor.'),
    ],
    mistakes: [t('ارتفاع أسفل الظهر عن الأرض.', 'Lower back lifting off the floor.'), t('السرعة.', 'Going too fast.')],
    breathing: t('أخرج النفس وأنت تمد يدك ورجلك.', 'Exhale as you extend the arm and leg.'),
  },
  {
    id: 'cable_crunch', motion: 'cable_crunch', name: t('كرنش بالكيبل', 'Cable Crunch'), aliases: ['Kneeling Cable Crunch'],
    steps: [
      t('اجثِ أمام الكيبل وامسك الحبل جنب رأسك.', 'Kneel in front of a high cable holding the rope beside your head.'),
      t('انحني للأسفل بتقويس العمود الفقري وشد البطن.', 'Crunch down by curling your spine and contracting your abs.'),
      t('ارجع ببطء بدون ما تحرك الحوض.', 'Return slowly without moving your hips.'),
    ],
    mistakes: [t('السحب باليدين.', 'Pulling with your arms.'), t('الجلوس على الكعب بدل الانحناء.', 'Sitting back on your heels instead of crunching.')],
    breathing: t('أخرج النفس وأنت تنزل.', 'Exhale as you crunch down.'),
  },
  // ------------------------------------------------------------------ كارديو
  {
    id: 'jumping_jack', motion: 'jumping_jack', name: t('جمبنق جاك', 'Jumping Jacks'), aliases: ['Jumping Jack', 'Star Jumps'],
    steps: [
      t('قف والرجلين مضمومة ويدينك جنبك.', 'Stand with feet together and arms by your sides.'),
      t('اقفز وافتح رجليك وارفع يدينك فوق رأسك.', 'Jump your feet out and raise your arms overhead.'),
      t('اقفز وارجع لوضع البداية وكرر بإيقاع سريع.', 'Jump back to the start and repeat at a quick pace.'),
    ],
    mistakes: [t('الهبوط على الكعب.', 'Landing on your heels.'), t('ثني الظهر.', 'Hunching over.')],
    breathing: t('تنفس بإيقاع منتظم.', 'Breathe steadily.'),
  },
  {
    id: 'high_knees', motion: 'high_knees', name: t('ركب عالية', 'High Knees'), aliases: ['High Knee Run'],
    steps: [
      t('اركض مكانك وارفع الركبة لمستوى الحوض.', 'Run in place driving each knee up to hip height.'),
      t('حرك يدينك عكس رجليك.', 'Pump your arms opposite your legs.'),
      t('هبوط خفيف على مقدمة القدم.', 'Land lightly on the balls of your feet.'),
    ],
    mistakes: [t('ميلان للخلف.', 'Leaning back.'), t('رفع قليل للركبة.', 'Knees too low.')],
    breathing: t('تنفس بإيقاع سريع ومنتظم.', 'Breathe quickly and rhythmically.'),
  },
  {
    id: 'burpee', motion: 'burpee', name: t('بيربي', 'Burpee'), aliases: ['Burpees'],
    steps: [
      t('من الوقوف انزل سكوات وحط يدينك على الأرض.', 'From standing, squat down and place your hands on the floor.'),
      t('اقفز برجليك للخلف لوضع الضغط.', 'Jump your feet back into a push-up position.'),
      t('ارجع برجليك للأمام واقفز لفوق ويدينك مرفوعة.', 'Jump your feet forward and leap up with arms overhead.'),
    ],
    mistakes: [t('نزول الحوض في وضع الضغط.', 'Sagging hips in the plank.'), t('الهبوط بقوة على الركب.', 'Landing hard on locked knees.')],
    breathing: t('أخرج النفس مع القفزة.', 'Exhale on the jump.'),
    tip: t('بدّل القفزة بالوقوف لتسهيلها.', 'Step instead of jump to make it easier.'),
  },
  // ================================================================== تمارين جديدة بحركة 3D (مصدرها قاعدة التمارين المفتوحة، الشرح مكتوب لأرك)
  // ------------------------------------------------------------------ صدر
  {
    id: 'decline_bench_bb', motion: 'decline_bench_bb', extra: true, name: t('بنش مائل للأسفل بالبار', 'Decline Barbell Bench Press'),
    aliases: ['Decline Bench Press', 'Decline Barbell Bench Press', 'Decline Press'],
    steps: [
      t('ثبّت رجليك تحت المسند واستلقِ على البنش المائل للأسفل.', 'Hook your legs under the pads and lie back on the decline bench.'),
      t('امسك البار أعرض من الكتفين بقليل وارفعه فوق أسفل صدرك.', 'Grip slightly wider than your shoulders and unrack the bar over your lower chest.'),
      t('نزّل البار ببطء حتى يلمس أسفل الصدر، والكوعين بزاوية ٤٥ تقريباً عن الجسم.', 'Lower slowly to your lower chest with elbows about 45° from your body.'),
      t('ادفع البار لفوق حتى تستقيم يدينك بدون ما تقفل الكوع بقوة.', 'Press back up until your arms are straight without slamming the elbows.'),
    ],
    mistakes: [t('ارتداد البار من الصدر.', 'Bouncing the bar off your chest.'), t('فتح الكوعين للجنب بزاوية ٩٠.', 'Flaring the elbows out to 90°.')],
    breathing: EXHALE_UP,
    tip: t('خل معك مساعد (سبوتر)، لأن فك البار من هالوضعية أصعب.', 'Use a spotter — unracking from this angle is awkward.'),
  },
  {
    id: 'incline_push_up', motion: 'incline_push_up', extra: true, name: t('ضغط مائل (اليدين على صندوق)', 'Incline Push-Up'),
    aliases: ['Incline Push Up', 'Incline Pushups', 'Hands Elevated Push Up'],
    steps: [
      t('حط يدينك على حافة صندوق أو بنش بعرض الكتفين.', 'Place your hands on the edge of a box or bench, shoulder-width apart.'),
      t('ارجع برجليك لورا حتى يصير جسمك خط مستقيم من الراس للكعب.', 'Walk your feet back until your body is a straight line from head to heels.'),
      t('نزّل صدرك للحافة والكوعين مائلة لورا.', 'Lower your chest to the edge with your elbows angled back.'),
      t('ادفع الصندوق بعيد عنك وارجع لوضع البداية.', 'Push the box away and return to the start.'),
    ],
    mistakes: [t('نزول الحوض.', 'Sagging hips.'), t('النزول نص المسافة.', 'Half reps.')],
    breathing: EXHALE_UP,
    tip: t('كل ما كان السطح أعلى صار أسهل — خطوة ممتازة قبل الضغط العادي.', 'The higher the surface, the easier it gets — a great step before regular push-ups.'),
  },
  {
    id: 'decline_push_up', motion: 'decline_push_up', extra: true, name: t('ضغط والرجلين مرفوعة', 'Decline Push-Up'),
    aliases: ['Decline Push Up', 'Feet Elevated Push Up', 'Push-Ups With Feet Elevated'],
    steps: [
      t('حط أصابع رجلك على صندوق أو بنش، ويدينك على الأرض أعرض من الكتفين بقليل.', 'Put your toes on a box or bench and your hands on the floor slightly wider than your shoulders.'),
      t('شد البطن والأرداف حتى يصير جسمك مستقيم.', 'Brace your abs and glutes so your body stays straight.'),
      t('انزل حتى يقرب صدرك من الأرض.', 'Lower until your chest nearly touches the floor.'),
      t('ادفع لفوق بقوة بدون ما يطيح الحوض.', 'Press up powerfully without letting your hips drop.'),
    ],
    mistakes: [t('تقويس أسفل الظهر.', 'Arching the lower back.'), t('الراس يسبق الجسم للأرض.', 'Leading with your head.')],
    breathing: EXHALE_UP,
    tip: t('يشغّل أعلى الصدر والأكتاف أكثر من الضغط العادي.', 'Works the upper chest and shoulders more than a regular push-up.'),
  },
  {
    id: 'diamond_push_up', motion: 'diamond_push_up', extra: true, name: t('ضغط دايموند', 'Diamond Push-Up'),
    aliases: ['Diamond Push Up', 'Close Grip Push Up', 'Triangle Push Up', 'Push-Ups - Close Triceps Position'],
    steps: [
      t('حط يدينك تحت صدرك، والإبهامين والسبابتين يتلاقون بشكل مثلث.', 'Place your hands under your chest with thumbs and index fingers touching in a diamond.'),
      t('افرد رجلك لورا وشد جسمك.', 'Extend your legs back and brace your whole body.'),
      t('انزل والكوعين قريبة من جسمك باتجاه الخلف.', 'Lower with your elbows tucked back along your sides.'),
      t('ادفع حتى تستقيم يدينك.', 'Press until your arms are straight.'),
    ],
    mistakes: [t('فتح الكوعين للجنب.', 'Elbows flaring out.'), t('نزول الحوض.', 'Sagging hips.')],
    breathing: EXHALE_UP,
    tip: t('لو صعب عليك، ابدأ على الركب.', 'If it is too hard, start on your knees.'),
  },
  {
    id: 'wide_push_up', motion: 'wide_push_up', extra: true, name: t('ضغط واسع', 'Wide Push-Up'), aliases: ['Wide Push Up', 'Wide Grip Push Up', 'Push-Up Wide'],
    steps: [
      t('حط يدينك على الأرض أعرض من كتفينك بشبر تقريباً.', 'Place your hands about a hand-span wider than your shoulders.'),
      t('خل جسمك مستقيم والبطن مشدود.', 'Keep your body straight and your core tight.'),
      t('انزل حتى يقرب صدرك من الأرض.', 'Lower until your chest is close to the floor.'),
      t('ادفع لفوق وأنت تحس بالصدر يشتغل.', 'Push back up, feeling your chest do the work.'),
    ],
    mistakes: [t('فتح اليدين زيادة (يضغط على الكتف).', 'Hands so wide it strains your shoulders.'), t('نزول ناقص.', 'Partial reps.')],
    breathing: EXHALE_UP,
  },
  {
    id: 'low_cable_crossover', motion: 'low_cable_crossover', extra: true, name: t('تفتيح كيبل من تحت لفوق', 'Low Cable Crossover'),
    aliases: ['Low Cable Crossover', 'Low To High Cable Fly', 'Low Cable Fly'],
    steps: [
      t('اضبط البكرتين على أوطى ارتفاع وامسك مقبض بكل يد.', 'Set both pulleys at the lowest position and hold a handle in each hand.'),
      t('اوقف بالنص بخطوة للأمام، واليدين تحت جنب الحوض والكوع مثني شوي.', 'Stand in the middle with a split stance, hands low by your hips and elbows slightly bent.'),
      t('ارفع يدينك بقوس لفوق حتى يتلاقون قدام أعلى الصدر.', 'Sweep your hands up in an arc until they meet in front of your upper chest.'),
      t('ارجع ببطء لتحت وأنت تحس بالتمدد.', 'Lower slowly, feeling the stretch.'),
    ],
    mistakes: [t('ثني الكوع زيادة فتصير حركة سحب.', 'Bending the elbows so much it turns into a curl.'), t('رفع الأكتاف للأذن.', 'Shrugging your shoulders.')],
    breathing: t('أخرج النفس وأنت ترفع يدينك، وخذ نفس وأنت تنزل.', 'Exhale as you bring your hands up, inhale as you lower.'),
  },
  // ------------------------------------------------------------------ ظهر
  {
    id: 'inverted_row', motion: 'inverted_row', extra: true, name: t('سحب مقلوب (بوزن الجسم)', 'Inverted Row'),
    aliases: ['Inverted Row', 'Bodyweight Row', 'Australian Pull Up'],
    steps: [
      t('اضبط البار على ارتفاع الخصر تقريباً وانسدح تحته.', 'Set a bar at about waist height and lie underneath it.'),
      t('امسك البار أعرض من الكتفين بقليل، والكعبين على الأرض والجسم مستقيم.', 'Grip slightly wider than your shoulders with heels on the floor and body straight.'),
      t('اسحب صدرك للبار وضم لوحي الكتف.', 'Pull your chest to the bar, squeezing your shoulder blades together.'),
      t('انزل ببطء حتى تستقيم يدينك.', 'Lower slowly until your arms are straight.'),
    ],
    mistakes: [t('نزول الحوض وقت السحب.', 'Hips sagging during the pull.'), t('مد الرقبة للبار بدل الصدر.', 'Reaching with your chin instead of your chest.')],
    breathing: EXHALE_PULL,
    tip: t('قرّب رجلك (جسمك يصير أعمودي أكثر) عشان يصير أسهل.', 'Walk your feet in (body more upright) to make it easier.'),
  },
  {
    id: 'row_db_bent', motion: 'row_db_bent', extra: true, name: t('تجديف دمبل منحني', 'Bent-Over Dumbbell Row'),
    aliases: ['Bent Over Dumbbell Row', 'Bent Over Two-Dumbbell Row', 'Two Arm Dumbbell Row'],
    steps: [
      t('امسك دمبل بكل يد والكفين مقابل بعض.', 'Hold a dumbbell in each hand, palms facing each other.'),
      t('اثنِ ركبك شوي وانحني من الحوض حتى يصير ظهرك مائل ومستقيم.', 'Soften your knees and hinge at the hips until your back is inclined and flat.'),
      t('اسحب الدمبلين لجنب البطن والكوعين قريبة من الجسم.', 'Row the dumbbells to your sides with elbows close to your body.'),
      t('نزّل ببطء بدون ما يتقوس ظهرك.', 'Lower slowly without rounding your back.'),
    ],
    mistakes: [t('تقويس الظهر.', 'Rounding your back.'), t('الوقوف وقت السحب والاعتماد على الزخم.', 'Standing up and using momentum.')],
    breathing: EXHALE_PULL,
  },
  {
    id: 'rack_pull', motion: 'rack_pull', extra: true, name: t('رك بول (سحب من الحامل)', 'Rack Pull'), aliases: ['Rack Pull', 'Rack Pulls', 'Rack Deadlift'],
    steps: [
      t('حط البار على مساند الحامل فوق الركبة بقليل.', 'Set the bar on the rack pins just above your knees.'),
      t('امسك البار بعرض الكتفين وانحني من الحوض وظهرك مستقيم.', 'Grip shoulder-width and hinge at the hips with a flat back.'),
      t('ادفع الحوض للأمام وقف مستقيم وأنت ضام لوحي الكتف.', 'Drive your hips forward and stand tall, squeezing your shoulder blades.'),
      t('رجّع البار للمساند بتحكم.', 'Lower the bar back to the pins under control.'),
    ],
    mistakes: [t('الميلان لورا في الأعلى.', 'Leaning back at the top.'), t('تقويس الظهر.', 'Rounding your back.')],
    breathing: t('خذ نفس وشد البطن قبل السحب، وأخرجه لما توقف.', 'Breathe in and brace before pulling; exhale once you are standing.'),
  },
  {
    id: 'hyperextension', motion: 'hyperextension', extra: true, name: t('تمديد الظهر على جهاز ٤٥°', 'Back Extension (45°)'),
    aliases: ['Hyperextension', 'Hyperextensions', 'Back Extension', '45 Degree Back Extension', 'Hyperextensions (Back Extensions)'],
    steps: [
      t('اضبط المسند تحت الحوض مباشرة وثبّت كاحلك تحت المسند الخلفي.', 'Set the pad just below your hips and lock your ankles under the rear pad.'),
      t('ضم يدينك على صدرك وخل جسمك مستقيم.', 'Cross your arms over your chest and keep your body straight.'),
      t('انزل من الحوض ببطء وظهرك مستقيم.', 'Hinge down slowly from the hips with a flat back.'),
      t('ارجع لفوق بعصر الأرداف حتى يصير جسمك خط مستقيم.', 'Rise by squeezing your glutes until your body is one straight line.'),
    ],
    mistakes: [t('الرفع أعلى من الخط المستقيم (تقويس).', 'Overarching past a straight line.'), t('الحركة السريعة.', 'Swinging up fast.')],
    breathing: t('خذ نفس وأنت تنزل، وأخرجه وأنت ترتفع.', 'Inhale as you lower, exhale as you rise.'),
  },
  // ------------------------------------------------------------------ أكتاف
  {
    id: 'band_pull_apart', motion: 'band_pull_apart', extra: true, name: t('فتح المطاط', 'Band Pull-Apart'), aliases: ['Band Pull Apart', 'Band Pull-Aparts'],
    steps: [
      t('امسك مطاط المقاومة قدامك على مستوى الكتف.', 'Hold a resistance band in front of you at shoulder height.'),
      t('خل يدينك ممدودة والكوع مثني شوي.', 'Keep your arms extended with a slight bend in the elbows.'),
      t('افتح يدينك للجنب حتى يلمس المطاط صدرك.', 'Pull the band apart until it touches your chest.'),
      t('ارجع ببطء لوضع البداية.', 'Return slowly to the start.'),
    ],
    mistakes: [t('رفع الأكتاف للأذن.', 'Shrugging toward your ears.'), t('تقويس أسفل الظهر.', 'Arching your lower back.')],
    breathing: EXHALE_PULL,
    tip: t('تمرين ممتاز للإحماء وتحسين وقفة الكتف.', 'A great warm-up and posture exercise.'),
  },
  {
    id: 'push_press', motion: 'push_press', extra: true, name: t('بوش برس', 'Push Press'), aliases: ['Push Press', 'Barbell Push Press'],
    steps: [
      t('ابدأ والبار على مقدمة الكتف، والقبضة أعرض من الكتف بقليل.', 'Start with the bar on your front shoulders, grip just wider than your shoulders.'),
      t('انزل بركبك نزلة قصيرة وسريعة وجذعك مستقيم.', 'Dip your knees briefly and quickly, keeping your torso upright.'),
      t('ادفع برجلك بقوة واستغل الدفعة لرفع البار فوق راسك.', 'Drive hard through your legs and use that drive to press the bar overhead.'),
      t('ثبّت البار فوق ثم رجّعه لكتفك بتحكم.', 'Lock it out overhead, then lower it back to your shoulders under control.'),
    ],
    mistakes: [t('النزول عميق مثل السكوات.', 'Dipping too deep, like a squat.'), t('تقويس الظهر في الأعلى.', 'Arching your back at lockout.')],
    breathing: t('خذ نفس وشد البطن قبل النزلة، وأخرجه مع الدفع.', 'Breathe in and brace before the dip; exhale as you drive up.'),
  },
  // ------------------------------------------------------------------ ذراعين
  {
    id: 'preacher_curl', motion: 'preacher_curl', extra: true, name: t('بريتشر كيرل', 'Preacher Curl'), aliases: ['Preacher Curl', 'EZ Bar Preacher Curl', 'Scott Curl'],
    steps: [
      t('اجلس وحط ظهر العضد كامل على مسند البريتشر.', 'Sit and rest the backs of your upper arms fully on the preacher pad.'),
      t('امسك البار بقبضة من تحت بعرض الكتفين.', 'Grip the bar underhand, shoulder-width.'),
      t('ارفع البار بثني الكوع فقط حتى تحس بعصرة الباي.', 'Curl by bending only at the elbows until your biceps are fully squeezed.'),
      t('نزّل ببطء حتى تستقيم يدك تقريباً.', 'Lower slowly until your arms are almost straight.'),
    ],
    mistakes: [t('رفع العضد عن المسند.', 'Lifting your upper arms off the pad.'), t('النزول السريع في الأسفل (يضغط على الكوع).', 'Dropping fast at the bottom (stresses the elbow).')],
    breathing: t('أخرج النفس وأنت ترفع، وخذ نفس وأنت تنزل.', 'Exhale as you curl up, inhale as you lower.'),
  },
  {
    id: 'wrist_curl', motion: 'wrist_curl', extra: true, name: t('ثني الرسغ (للساعد)', 'Wrist Curl'),
    aliases: ['Wrist Curl', 'Seated Dumbbell Wrist Curl', 'Seated Dumbbell Palms-Up Wrist Curl'],
    steps: [
      t('اجلس وحط ساعدك على فخذك والكف لفوق، والرسغ برا الركبة.', 'Sit with your forearms on your thighs, palms up and wrists just past your knees.'),
      t('خل الدمبل ينزل لأطراف أصابعك ببطء.', 'Let the dumbbells roll down toward your fingertips slowly.'),
      t('ارفع الدمبل بثني الرسغ فقط لأعلى نقطة.', 'Curl the weight up by flexing only your wrists.'),
      t('نزّل بتحكم وكرر.', 'Lower under control and repeat.'),
    ],
    mistakes: [t('رفع الساعد عن الفخذ.', 'Lifting your forearms off your thighs.'), t('وزن ثقيل بحركة قصيرة.', 'Going heavy with a short range.')],
    breathing: t('تنفس بهدوء، وأخرج النفس مع الرفع.', 'Breathe easily; exhale as you curl up.'),
  },
  {
    id: 'overhead_cable_triceps', motion: 'overhead_cable_triceps', extra: true, name: t('تراي كيبل فوق الراس', 'Overhead Cable Triceps Extension'),
    aliases: ['Cable Overhead Triceps Extension', 'Overhead Rope Extension', 'Cable Rope Overhead Triceps Extension', 'Triceps Overhead Extension with Rope'],
    steps: [
      t('امسك الحبل وعطِ ظهرك للجهاز، مع خطوة للأمام وميلان بسيط.', 'Hold the rope, face away from the machine, step forward and lean slightly.'),
      t('خل كوعينك جنب راسك والحبل خلف الرقبة.', 'Keep your elbows by your head with the rope behind your neck.'),
      t('افرد يدينك لقدام وفوق حتى تستقيم.', 'Extend your arms up and forward until straight.'),
      t('ارجع ببطء حتى تحس بتمدد التراي.', 'Return slowly until you feel the triceps stretch.'),
    ],
    mistakes: [t('فتح الكوعين للجنب.', 'Elbows flaring out.'), t('تحريك الكتف بدل الكوع.', 'Moving from the shoulders instead of the elbows.')],
    breathing: EXHALE_PUSH,
  },
  // ------------------------------------------------------------------ أرجل
  {
    id: 'smith_squat', motion: 'smith_squat', extra: true, name: t('سكوات سميث', 'Smith Machine Squat'), aliases: ['Smith Machine Squat', 'Smith Squat'],
    steps: [
      t('حط بار السميث على أعلى ظهرك وفك الأمان.', 'Set the Smith bar on your upper back and unhook it.'),
      t('القدمين بعرض الكتفين، تحت البار أو قدامه بقليل.', 'Feet shoulder-width, under or slightly in front of the bar.'),
      t('انزل بالحوض لتحت ولورا حتى يصير الفخذ موازي للأرض.', 'Sit down and back until your thighs are parallel to the floor.'),
      t('ادفع بكامل القدم لفوق ورجّع البار للأمان في الأعلى.', 'Drive up through your whole foot and re-hook the bar at the top.'),
    ],
    mistakes: [t('رفع الكعب.', 'Heels lifting.'), t('دخول الركب للداخل.', 'Knees caving in.')],
    breathing: EXHALE_UP,
    tip: t('السكة الثابتة تساعدك تركز على الفخذ، بس تعلّم السكوات الحر بعد.', 'The fixed path helps you focus on the quads, but still learn the free squat.'),
  },
  {
    id: 'db_squat', motion: 'db_squat', extra: true, name: t('سكوات بالدمبل', 'Dumbbell Squat'), aliases: ['Dumbbell Squat', 'DB Squat'],
    steps: [
      t('امسك دمبل بكل يد جنبك والكفين للداخل.', 'Hold a dumbbell at each side, palms facing in.'),
      t('القدمين بعرض الكتفين والصدر مرفوع.', 'Feet shoulder-width, chest up.'),
      t('انزل كأنك تجلس، والدمبلات تنزل جنب رجلك.', 'Sit down with the dumbbells hanging beside your legs.'),
      t('ادفع لفوق بكامل القدم.', 'Stand back up through your whole foot.'),
    ],
    mistakes: [t('انحناء الظهر لقدام.', 'Rounding forward.'), t('رفع الكعب.', 'Heels lifting.')],
    breathing: EXHALE_UP,
  },
  {
    id: 'box_jump', motion: 'box_jump', extra: true, name: t('القفز على الصندوق', 'Box Jump'), aliases: ['Box Jump', 'Box Jumps', 'Front Box Jump'],
    steps: [
      t('اوقف قدام صندوق ثابت بمسافة قصيرة والقدمين بعرض الحوض.', 'Stand a short step from a sturdy box, feet hip-width.'),
      t('انزل نص سكوات وارجع بيدينك لورا.', 'Dip into a quarter squat and swing your arms back.'),
      t('اقفز بقوة وارفع ركبك، وانزل بهدوء على الصندوق بكامل القدم.', 'Jump explosively, bring your knees up and land softly on the box with your whole foot.'),
      t('اوقف مستقيم فوق، ثم انزل خطوة خطوة (لا تنط لتحت).', 'Stand tall on top, then step down one foot at a time (don’t jump down).'),
    ],
    mistakes: [t('الهبوط والركب داخلة لبعض.', 'Landing with your knees caving in.'), t('صندوق أعلى من مستواك.', 'Using a box that is too high for you.')],
    breathing: t('أخرج النفس مع القفزة.', 'Exhale as you jump.'),
  },
  {
    id: 'jump_squat', motion: 'jump_squat', extra: true, name: t('سكوات بالقفز', 'Jump Squat'), aliases: ['Jump Squat', 'Squat Jump', 'Freehand Jump Squat'],
    steps: [
      t('اوقف والقدمين بعرض الكتفين.', 'Stand with your feet shoulder-width apart.'),
      t('انزل سكوات حتى يقرب الفخذ من الموازي.', 'Squat down to near parallel.'),
      t('اقفز لفوق بأقوى ما تقدر وافرد جسمك.', 'Explode upward and fully extend your body.'),
      t('انزل بهدوء على مقدمة القدم وادخل مباشرة في السكوات اللي بعده.', 'Land softly on the balls of your feet and flow into the next squat.'),
    ],
    mistakes: [t('الهبوط والركب مقفلة.', 'Landing with locked knees.'), t('دخول الركب للداخل.', 'Knees caving in.')],
    breathing: t('خذ نفس وأنت تنزل، وأخرجه مع القفزة.', 'Inhale on the way down, exhale as you jump.'),
  },
  {
    id: 'hip_adduction', motion: 'hip_adduction', extra: true, name: t('جهاز الضم (الفخذ الداخلي)', 'Hip Adduction Machine'),
    aliases: ['Hip Adduction', 'Adductor Machine', 'Thigh Adductor'],
    steps: [
      t('اجلس وظهرك على المسند، والمساند على داخل ركبك.', 'Sit with your back on the pad and the pads against your inner knees.'),
      t('ابدأ ورجلك مفتوحة لمسافة مريحة.', 'Start with your legs open to a comfortable width.'),
      t('ضم رجلك لبعض بتحكم حتى يتقابل المسندين.', 'Squeeze your legs together under control until the pads meet.'),
      t('ارجع ببطء بدون ما يضرب الوزن.', 'Return slowly without letting the stack slam.'),
    ],
    mistakes: [t('الفتح أكثر من المريح.', 'Opening wider than is comfortable.'), t('الاعتماد على الزخم.', 'Using momentum.')],
    breathing: t('أخرج النفس وأنت تضم، وخذ نفس وأنت تفتح.', 'Exhale as you squeeze, inhale as you open.'),
  },
  {
    id: 'single_leg_bridge', motion: 'single_leg_bridge', extra: true, name: t('جسر برجل وحدة', 'Single-Leg Glute Bridge'),
    aliases: ['Single Leg Glute Bridge', 'Single Leg Bridge', 'One Leg Glute Bridge'],
    steps: [
      t('انسدح على ظهرك، رجل مثنية والقدم على الأرض والثانية ممدودة.', 'Lie on your back with one knee bent and foot flat, the other leg extended.'),
      t('ادفع بكعب الرجل الثابتة وارفع الحوض.', 'Drive through the planted heel and lift your hips.'),
      t('ارفع حتى يصير الكتف والحوض والركبة خط واحد، واعصر الأرداف.', 'Rise until shoulders, hips and knee form one line; squeeze your glute.'),
      t('نزّل ببطء وكمّل العدد، ثم بدّل الرجل.', 'Lower slowly, finish your reps, then switch legs.'),
    ],
    mistakes: [t('ميلان الحوض لجهة.', 'Letting your hips tilt to one side.'), t('الرفع بتقويس الظهر بدل الأرداف.', 'Arching your back instead of using your glutes.')],
    breathing: t('أخرج النفس وأنت ترفع الحوض.', 'Exhale as you lift your hips.'),
  },
  {
    id: 'cable_kickback', motion: 'cable_kickback', extra: true, name: t('ركلة خلفية بالكيبل', 'Cable Glute Kickback'),
    aliases: ['Cable Kickback', 'Cable Glute Kickback', 'One-Legged Cable Kickback'],
    steps: [
      t('ركّب سوار الكاحل على البكرة السفلية واربطه برجلك.', 'Attach an ankle strap to the low pulley and fasten it around your ankle.'),
      t('امسك الجهاز وميّل للأمام شوي وظهرك مستقيم.', 'Hold the frame and lean forward slightly with a flat back.'),
      t('ادفع رجلك لورا بالكعب حتى تحس بعصرة الأرداف.', 'Kick your leg back, leading with the heel, until your glute squeezes.'),
      t('ارجع ببطء بدون ما ينزل الوزن كامل.', 'Return slowly without letting the weight rest.'),
    ],
    mistakes: [t('تقويس الظهر عشان ترفع أعلى.', 'Arching your back to kick higher.'), t('التأرجح.', 'Swinging.')],
    breathing: t('أخرج النفس مع الدفع لورا.', 'Exhale as you kick back.'),
  },
  {
    id: 'pull_through', motion: 'pull_through', extra: true, name: t('سحب الكيبل بين الرجلين', 'Cable Pull-Through'), aliases: ['Pull Through', 'Cable Pull Through'],
    steps: [
      t('عطِ ظهرك للبكرة السفلية وامسك الحبل من بين رجلك.', 'Face away from a low pulley and hold the rope between your legs.'),
      t('امشِ خطوتين لقدام والقدمين أعرض من الكتف.', 'Walk forward two steps and set your feet wider than your shoulders.'),
      t('انحني من الحوض وخل الحبل يرجع بين رجلك وظهرك مستقيم.', 'Hinge at the hips, letting the rope travel back between your legs with a flat back.'),
      t('ادفع الحوض لقدام وقف مستقيم وأنت تعصر الأرداف.', 'Drive your hips forward to stand tall, squeezing your glutes.'),
    ],
    mistakes: [t('السحب باليدين.', 'Pulling with your arms.'), t('ثني الركب مثل السكوات بدل الانحناء.', 'Squatting instead of hinging.')],
    breathing: t('خذ نفس وأنت تنحني، وأخرجه وأنت تدفع الحوض.', 'Inhale as you hinge, exhale as you drive your hips through.'),
  },
  // ------------------------------------------------------------------ بطن
  {
    id: 'russian_twist', motion: 'russian_twist', extra: true, name: t('روسيان تويست', 'Russian Twist'), aliases: ['Russian Twist', 'Medicine Ball Russian Twist'],
    steps: [
      t('اجلس والركب مثنية، وميّل جذعك لورا وظهرك مستقيم.', 'Sit with knees bent and lean back with a straight spine.'),
      t('امسك الكرة قدام بطنك.', 'Hold the ball in front of your stomach.'),
      t('لف جذعك لجهة وقرّب الكرة من جنب الحوض، ثم للجهة الثانية.', 'Rotate your torso to bring the ball beside one hip, then the other.'),
      t('خل اللفة من الجذع مو من اليدين بس.', 'Turn from your torso, not just your arms.'),
    ],
    mistakes: [t('تقويس الظهر.', 'Rounding your back.'), t('تحريك اليدين بدون لف الجذع.', 'Moving only your arms.')],
    breathing: t('أخرج النفس مع كل لفة.', 'Exhale with each twist.'),
    tip: t('ارفع رجلك عن الأرض عشان يصير أصعب.', 'Lift your feet off the floor to make it harder.'),
  },
  {
    id: 'side_plank', motion: 'side_plank', extra: true, name: t('بلانك جانبي', 'Side Plank'), aliases: ['Side Plank', 'Side Bridge'],
    steps: [
      t('انسدح على جنبك واسند على ساعدك، والكوع تحت الكتف.', 'Lie on your side propped on your forearm, elbow under your shoulder.'),
      t('حط رجل فوق الثانية.', 'Stack your feet.'),
      t('ارفع الحوض حتى يصير جسمك خط مستقيم من الراس للقدم.', 'Lift your hips until your body is straight from head to feet.'),
      t('اثبت المدة المطلوبة، ثم بدّل الجهة.', 'Hold for the target time, then switch sides.'),
    ],
    mistakes: [t('نزول الحوض.', 'Hips sagging.'), t('ميلان الجسم لقدام أو لورا.', 'Rolling forward or back.')],
    breathing: BRACE,
  },
  {
    id: 'bicycle_crunch', motion: 'bicycle_crunch', extra: true, name: t('كرنش الدراجة', 'Bicycle Crunch'), aliases: ['Bicycle Crunch', 'Bicycle Crunches', 'Air Bike'],
    steps: [
      t('انسدح على ظهرك ويدينك خفيفة جنب راسك.', 'Lie on your back with your hands lightly beside your head.'),
      t('ارفع كتفينك عن الأرض وارفع رجلك.', 'Lift your shoulders off the floor and raise your legs.'),
      t('قرّب الكوع من الركبة المعاكسة وافرد الرجل الثانية.', 'Bring one elbow toward the opposite knee while extending the other leg.'),
      t('بدّل الجهة بحركة متواصلة مثل الدراجة.', 'Switch sides in a smooth pedaling motion.'),
    ],
    mistakes: [t('سحب الرقبة باليدين.', 'Pulling on your neck.'), t('السرعة الزايدة.', 'Rushing the reps.')],
    breathing: t('أخرج النفس مع كل لفة.', 'Exhale on each twist.'),
  },
  {
    id: 'reverse_crunch', motion: 'reverse_crunch', extra: true, name: t('كرنش عكسي', 'Reverse Crunch'), aliases: ['Reverse Crunch', 'Reverse Crunches'],
    steps: [
      t('انسدح على ظهرك ويدينك جنبك على الأرض.', 'Lie on your back with your arms by your sides.'),
      t('ارفع رجلك والركب مثنية ٩٠ درجة.', 'Lift your legs with your knees bent at 90°.'),
      t('لف الحوض لفوق وقرّب ركبك من صدرك.', 'Curl your pelvis up, bringing your knees toward your chest.'),
      t('نزّل ببطء بدون ما تطيح رجلك على الأرض.', 'Lower slowly without dropping your feet.'),
    ],
    mistakes: [t('التأرجح بالزخم.', 'Swinging with momentum.'), t('الدفع القوي باليدين على الأرض.', 'Pushing hard with your hands.')],
    breathing: t('أخرج النفس وأنت ترفع الحوض.', 'Exhale as you curl up.'),
  },
  {
    id: 'sit_up', motion: 'sit_up', extra: true, name: t('سيت أب', 'Sit-Up'), aliases: ['Sit Up', 'Sit-Ups', 'Situp'],
    steps: [
      t('انسدح والركب مثنية والقدم على الأرض.', 'Lie back with your knees bent and feet flat.'),
      t('حط يدينك جنب راسك أو على صدرك.', 'Place your hands beside your head or across your chest.'),
      t('ارفع جذعك كامل حتى تجلس.', 'Curl your torso all the way up to sitting.'),
      t('انزل ببطء فقرة فقرة.', 'Lower back down slowly, one vertebra at a time.'),
    ],
    mistakes: [t('سحب الرقبة.', 'Yanking on your neck.'), t('ارتفاع القدمين عن الأرض.', 'Feet lifting off the floor.')],
    breathing: t('أخرج النفس وأنت تطلع.', 'Exhale as you sit up.'),
  },
  {
    id: 'v_up', motion: 'v_up', extra: true, name: t('في أب', 'V-Up'), aliases: ['V Up', 'V-Ups', 'Jackknife Sit-Up', 'Jackknife'],
    steps: [
      t('انسدح ممدود ويدينك فوق راسك.', 'Lie flat with your arms extended overhead.'),
      t('ارفع رجلك وجذعك بنفس الوقت.', 'Lift your legs and torso at the same time.'),
      t('حاول تلمس أصابع رجلك بيدينك وجسمك بشكل V.', 'Reach your hands toward your toes, forming a V.'),
      t('نزّل ببطء بتحكم.', 'Lower slowly under control.'),
    ],
    mistakes: [t('ثني الركب كثير.', 'Bending your knees a lot.'), t('الطيحة بقوة على الأرض.', 'Crashing back down.')],
    breathing: t('أخرج النفس وأنت ترتفع.', 'Exhale as you rise.'),
  },
  {
    id: 'hanging_leg_raise', motion: 'hanging_leg_raise', extra: true, name: t('رفع الرجلين معلّق', 'Hanging Leg Raise'),
    aliases: ['Hanging Leg Raise', 'Hanging Leg Raises'],
    steps: [
      t('تعلّق على البار بقبضة بعرض الكتفين.', 'Hang from a bar with a shoulder-width grip.'),
      t('شد البطن ووقّف التأرجح.', 'Brace your core and stop any swinging.'),
      t('ارفع رجلك ممدودة حتى تصير موازية للأرض أو أعلى.', 'Raise your straight legs to parallel or higher.'),
      t('نزّل ببطء بدون تأرجح.', 'Lower slowly without swinging.'),
    ],
    mistakes: [t('التأرجح.', 'Swinging.'), t('تقويس الظهر بدل لف الحوض.', 'Arching your back instead of tilting your pelvis.')],
    breathing: t('أخرج النفس وأنت ترفع رجلك.', 'Exhale as you raise your legs.'),
    tip: t('لو صعب، ابدأ والركب مثنية.', 'If it’s too hard, start with bent knees.'),
  },
  {
    id: 'pallof_press', motion: 'pallof_press', extra: true, name: t('بالوف برس', 'Pallof Press'), aliases: ['Pallof Press', 'Cable Anti Rotation Press'],
    steps: [
      t('اوقف بجنب الجهاز والكيبل على مستوى الصدر، وامسك المقبض بيدينك قدام صدرك.', 'Stand side-on to a chest-height cable and hold the handle at your chest with both hands.'),
      t('ابعد عن الجهاز حتى يصير فيه شد، وركبك مثنية شوي.', 'Step away until there is tension, knees slightly bent.'),
      t('ادفع يدينك لقدام وقاوم إن الكيبل يلفك.', 'Press your hands straight out and resist the cable twisting you.'),
      t('اثبت ثانيتين وارجع لصدرك.', 'Hold for two seconds, then bring it back to your chest.'),
    ],
    mistakes: [t('لف الجسم مع الكيبل.', 'Rotating with the cable.'), t('قفل الركب.', 'Locking your knees.')],
    breathing: BRACE,
  },
  {
    id: 'woodchop', motion: 'woodchop', extra: true, name: t('ود تشوب بالكيبل', 'Cable Woodchop'),
    aliases: ['Woodchop', 'Wood Chop', 'Cable Woodchop', 'Standing Cable Wood Chop'],
    steps: [
      t('اضبط البكرة عالية واوقف بجنب الجهاز، وامسك المقبض بيدينك.', 'Set the pulley high, stand side-on and hold the handle with both hands.'),
      t('خل يدينك ممدودة ورجلك أعرض من الكتف.', 'Keep your arms extended and feet wider than your shoulders.'),
      t('اسحب المقبض بقوس من فوق لتحت عبر جسمك وأنت تلف الجذع.', 'Pull the handle down across your body in an arc, rotating your torso.'),
      t('ارجع ببطء لفوق بتحكم.', 'Return up slowly under control.'),
    ],
    mistakes: [t('السحب باليدين بس.', 'Pulling only with your arms.'), t('تقويس الظهر.', 'Rounding your back.')],
    breathing: t('أخرج النفس وأنت تسحب لتحت.', 'Exhale as you chop down.'),
  },
  {
    id: 'side_bend_db', motion: 'side_bend_db', extra: true, name: t('ميلان جانبي بالدمبل', 'Dumbbell Side Bend'), aliases: ['Dumbbell Side Bend', 'Side Bend'],
    steps: [
      t('اوقف مستقيم وامسك دمبل بيد وحدة جنبك.', 'Stand tall holding a dumbbell in one hand at your side.'),
      t('ميّل جذعك لجهة الدمبل ببطء.', 'Slowly bend your torso toward the dumbbell.'),
      t('ارجع وميّل للجهة الثانية شوي بعضلات الجنب.', 'Come back up and slightly past center using your side abs.'),
      t('كمّل العدد، ثم بدّل اليد.', 'Finish your reps, then switch hands.'),
    ],
    mistakes: [t('الميلان لقدام أو لورا.', 'Leaning forward or back.'), t('وزن ثقيل بحركة سريعة.', 'Heavy weight with fast reps.')],
    breathing: t('خذ نفس وأنت تميل، وأخرجه وأنت ترجع.', 'Inhale as you bend, exhale as you come back.'),
  },
  {
    id: 'flutter_kicks', motion: 'flutter_kicks', extra: true, name: t('فلتر كيك', 'Flutter Kicks'), aliases: ['Flutter Kicks', 'Flutter Kick'],
    steps: [
      t('انسدح على ظهرك ويدينك جنبك أو تحت الحوض.', 'Lie on your back with your hands by your sides or under your hips.'),
      t('ارفع رجلك ممدودة شوي عن الأرض.', 'Lift your straight legs a little off the floor.'),
      t('حرّك الرجلين لفوق وتحت بالتناوب بحركات قصيرة.', 'Alternate kicking your legs up and down in small movements.'),
      t('خل أسفل ظهرك لاصق بالأرض طول الوقت.', 'Keep your lower back pressed into the floor the whole time.'),
    ],
    mistakes: [t('تقويس أسفل الظهر.', 'Arching your lower back.'), t('رفع الرجلين عالي زيادة.', 'Lifting your legs too high.')],
    breathing: t('تنفس بإيقاع منتظم ولا تحبس نفسك.', 'Breathe steadily; don’t hold your breath.'),
  },
  // ================================================================== مكتبة إضافية: شرح + خريطة العضلات (بدون حركة 3D خاصة)
  // ------------------------------------------------------------------ صدر
  {
    id: 'smith_bench_press', motion: 'muscle_map', library: true, name: t('بنش سميث', 'Smith Machine Bench Press'), aliases: ['Smith Machine Bench Press', 'Smith Bench Press'],
    primary: ['chest'], secondary: ['triceps', 'shoulders'], equipment: 'smith machine, bench',
    steps: [
      t('استلقِ على البنش تحت بار السميث، والبار فوق منتصف صدرك.', 'Lie on the bench under the Smith bar, lined up over your mid-chest.'),
      t('فك الأمان ونزّل البار ببطء حتى يلمس صدرك والكوعين مائلة لتحت.', 'Unhook it and lower slowly to your chest with elbows angled down.'),
      t('ادفع لفوق، ورجّع البار للأمان بعد آخر عدة.', 'Press up, then re-hook the bar after your last rep.'),
    ],
    mistakes: [t('رفع الحوض عن البنش.', 'Lifting your hips off the bench.')],
    breathing: EXHALE_UP,
  },
  {
    id: 'decline_db_press', motion: 'muscle_map', library: true, name: t('بنش دمبل مائل للأسفل', 'Decline Dumbbell Bench Press'), aliases: ['Decline Dumbbell Bench Press', 'Decline Dumbbell Press'],
    primary: ['chest'], secondary: ['triceps', 'shoulders'], equipment: 'dumbbells, decline bench',
    steps: [
      t('ثبّت رجلك واستلقِ على البنش المائل للأسفل والدمبلات على صدرك.', 'Hook your legs and lie back on the decline bench with the dumbbells at your chest.'),
      t('ادفع الدمبلات لفوق حتى يتقاربون فوق أسفل الصدر.', 'Press the dumbbells up until they meet over your lower chest.'),
      t('نزّل ببطء لجنب الصدر.', 'Lower slowly to the sides of your chest.'),
    ],
    mistakes: [t('النزول السريع بدون تحكم.', 'Dropping the weights too fast.')],
    breathing: EXHALE_UP,
  },
  {
    id: 'cable_chest_press', motion: 'muscle_map', library: true, name: t('ضغط صدر بالكيبل واقف', 'Standing Cable Chest Press'), aliases: ['Cable Chest Press', 'Standing Cable Chest Press'],
    primary: ['chest'], secondary: ['triceps', 'shoulders'], equipment: 'cable',
    steps: [
      t('اضبط البكرتين على مستوى الصدر، وامسك مقبض بكل يد وظهرك للجهاز.', 'Set both pulleys at chest height and hold a handle in each hand, facing away.'),
      t('خذ خطوة لقدام بوقفة ثابتة والبطن مشدود.', 'Step forward into a staggered stance with your core braced.'),
      t('ادفع يدينك لقدام حتى تتقابل، ثم ارجع ببطء.', 'Press your hands forward until they meet, then return slowly.'),
    ],
    mistakes: [t('الميلان بالجسم بدل الدفع باليدين.', 'Leaning your body instead of pressing.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'plyo_push_up', motion: 'muscle_map', library: true, name: t('ضغط انفجاري', 'Plyometric Push-Up'), aliases: ['Plyo Push-up', 'Plyometric Push Up', 'Clap Push Up'],
    primary: ['chest'], secondary: ['triceps', 'shoulders'], equipment: 'bodyweight',
    steps: [
      t('ابدأ بوضعية الضغط والجسم مستقيم.', 'Start in a push-up position with a straight body.'),
      t('انزل، ثم ادفع بقوة حتى ترتفع يدينك عن الأرض.', 'Lower, then push explosively so your hands leave the floor.'),
      t('انزل بهدوء والكوع مثني شوي، وكرر.', 'Land softly with slightly bent elbows and repeat.'),
    ],
    mistakes: [t('الهبوط والكوع مقفل.', 'Landing with locked elbows.')],
    breathing: t('أخرج النفس مع الدفعة.', 'Exhale as you push off.'),
    tip: t('أتقن الضغط العادي أول.', 'Master regular push-ups first.'),
  },
  // ------------------------------------------------------------------ ظهر
  {
    id: 'barbell_shrug', motion: 'muscle_map', library: true, name: t('شرق بالبار (ترابيس)', 'Barbell Shrug'), aliases: ['Barbell Shrug', 'Shrug', 'Shrugs'],
    primary: ['upperBack'], secondary: ['forearms'], equipment: 'barbell',
    steps: [
      t('امسك البار قدام فخذك بعرض الكتفين.', 'Hold the bar in front of your thighs at shoulder width.'),
      t('ارفع كتفينك لأذنك بشكل مستقيم لفوق.', 'Lift your shoulders straight up toward your ears.'),
      t('اثبت ثانية ثم نزّل ببطء.', 'Pause for a second, then lower slowly.'),
    ],
    mistakes: [t('لف الكتف بشكل دائري.', 'Rolling your shoulders in circles.'), t('ثني الكوع.', 'Bending your elbows.')],
    breathing: EXHALE_PULL,
  },
  {
    id: 'db_shrug', motion: 'muscle_map', library: true, name: t('شرق بالدمبل', 'Dumbbell Shrug'), aliases: ['Dumbbell Shrug', 'DB Shrug'],
    primary: ['upperBack'], secondary: ['forearms'], equipment: 'dumbbells',
    steps: [
      t('امسك دمبل بكل يد جنبك والكفين للداخل.', 'Hold a dumbbell at each side, palms facing in.'),
      t('ارفع كتفينك لفوق باتجاه الأذن.', 'Raise your shoulders up toward your ears.'),
      t('اعصر فوق ثانية ونزّل ببطء.', 'Squeeze for a second at the top and lower slowly.'),
    ],
    mistakes: [t('تحريك الراس لقدام.', 'Pushing your head forward.')],
    breathing: EXHALE_PULL,
  },
  {
    id: 'machine_row', motion: 'muscle_map', library: true, name: t('تجديف جهاز', 'Machine Row'), aliases: ['Machine Row', 'Seated Machine Row', 'Leverage Iso Row', 'Chest Supported Row'],
    primary: ['upperBack', 'lats'], secondary: ['biceps', 'rearDelts'], equipment: 'machine',
    steps: [
      t('اجلس وصدرك على المسند وامسك المقابض.', 'Sit with your chest on the pad and grab the handles.'),
      t('اسحب المقابض لجنبك وضم لوحي الكتف.', 'Pull the handles to your sides, squeezing your shoulder blades.'),
      t('ارجع ببطء حتى تستقيم يدك.', 'Return slowly until your arms are straight.'),
    ],
    mistakes: [t('إبعاد الصدر عن المسند.', 'Leaning off the chest pad.')],
    breathing: EXHALE_PULL,
  },
  {
    id: 'assisted_pullup', motion: 'muscle_map', library: true, name: t('عقلة بالمساعدة', 'Assisted Pull-Up'), aliases: ['Assisted Pull Up', 'Band Assisted Pull-Up', 'Machine Assisted Pull Up'],
    primary: ['lats'], secondary: ['biceps', 'upperBack'], equipment: 'band or assist machine',
    steps: [
      t('اربط مطاط بالبار وحط ركبتك أو قدمك فيه، أو استخدم جهاز المساعدة.', 'Loop a band over the bar and put a knee or foot in it, or use the assist machine.'),
      t('امسك البار أعرض من الكتفين واسحب حتى يعدّي ذقنك البار.', 'Grip wider than your shoulders and pull until your chin clears the bar.'),
      t('انزل ببطء حتى تستقيم يدك.', 'Lower slowly until your arms are straight.'),
    ],
    mistakes: [t('التأرجح.', 'Swinging.'), t('نص الحركة.', 'Half reps.')],
    breathing: EXHALE_PULL,
    tip: t('قلّل المساعدة تدريجياً حتى تسوي العقلة بدونها.', 'Reduce the assistance gradually until you can do strict pull-ups.'),
  },
  {
    id: 'renegade_row', motion: 'muscle_map', library: true, name: t('تجديف رينيقيد', 'Renegade Row'), aliases: ['Renegade Row', 'Alternating Renegade Row', 'Plank Row'],
    primary: ['upperBack', 'abs'], secondary: ['lats', 'shoulders'], equipment: 'dumbbells or kettlebells',
    steps: [
      t('ابدأ بوضعية الضغط ويدينك ماسكة الدمبلات على الأرض.', 'Start in a push-up position gripping dumbbells on the floor.'),
      t('اسحب دمبل لجنب البطن وخل الحوض ثابت.', 'Row one dumbbell to your side while keeping your hips square.'),
      t('رجّعه للأرض وبدّل اليد.', 'Put it back down and switch sides.'),
    ],
    mistakes: [t('لف الحوض مع السحب.', 'Twisting your hips as you row.')],
    breathing: EXHALE_PULL,
  },
  // ------------------------------------------------------------------ أكتاف
  {
    id: 'standing_db_press', motion: 'muscle_map', library: true, name: t('ضغط كتف بالدمبل واقف', 'Standing Dumbbell Shoulder Press'), aliases: ['Standing Dumbbell Press', 'Standing Dumbbell Shoulder Press'],
    primary: ['shoulders'], secondary: ['triceps', 'abs'], equipment: 'dumbbells',
    steps: [
      t('اوقف والدمبلات على مستوى كتفك والكفين لقدام.', 'Stand with the dumbbells at shoulder height, palms forward.'),
      t('شد البطن وادفع الدمبلات فوق راسك حتى تستقيم يدك.', 'Brace and press the dumbbells overhead until your arms are straight.'),
      t('نزّل ببطء لمستوى الكتف.', 'Lower slowly back to shoulder height.'),
    ],
    mistakes: [t('تقويس أسفل الظهر لورا.', 'Arching your lower back.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'cable_rear_delt_fly', motion: 'muscle_map', library: true, name: t('تفتيح خلفي بالكيبل', 'Cable Rear Delt Fly'), aliases: ['Cable Rear Delt Fly', 'Cable Reverse Fly'],
    primary: ['rearDelts'], secondary: ['upperBack'], equipment: 'cable',
    steps: [
      t('اضبط البكرتين على مستوى الكتف وامسك الكيبلين بشكل متقاطع.', 'Set both pulleys at shoulder height and grab the cables crossed over.'),
      t('افتح يدينك للجنب ولورا والكوع مثني شوي.', 'Open your arms out and back with a slight bend in the elbows.'),
      t('ارجع ببطء لقدام.', 'Return slowly to the front.'),
    ],
    mistakes: [t('رفع الأكتاف للأذن.', 'Shrugging.'), t('وزن ثقيل مع ثني الكوع.', 'Going heavy and bending your elbows.')],
    breathing: EXHALE_PULL,
  },
  {
    id: 'external_rotation', motion: 'muscle_map', library: true, name: t('تدوير الكتف للخارج', 'Cable External Rotation'), aliases: ['External Rotation', 'External Rotation with Cable', 'External Rotation with Band'],
    primary: ['rearDelts'], secondary: ['shoulders'], equipment: 'cable or band',
    steps: [
      t('اوقف بجنب الكيبل والكوع لاصق بجنبك بزاوية ٩٠.', 'Stand side-on to the cable with your elbow at your side bent to 90°.'),
      t('لف ساعدك للخارج بعيد عن بطنك والكوع ثابت.', 'Rotate your forearm outward, away from your stomach, keeping the elbow fixed.'),
      t('ارجع ببطء.', 'Return slowly.'),
    ],
    mistakes: [t('إبعاد الكوع عن الجسم.', 'Letting your elbow drift away from your side.')],
    breathing: t('تنفس بهدوء.', 'Breathe steadily.'),
    tip: t('وزن خفيف — هدفه حماية مفصل الكتف.', 'Go light — it’s for shoulder health.'),
  },
  {
    id: 'battle_ropes', motion: 'muscle_map', library: true, name: t('حبال المعركة', 'Battle Ropes'), aliases: ['Battle Ropes', 'Battling Ropes'],
    primary: ['shoulders'], secondary: ['abs', 'forearms', 'quads'], equipment: 'battle ropes',
    steps: [
      t('امسك طرف كل حبل بيد واوقف بنص سكوات.', 'Hold one rope end in each hand in a half squat.'),
      t('حرّك يدينك لفوق وتحت بسرعة بالتناوب عشان تسوي موجات.', 'Whip your arms up and down quickly, alternating to make waves.'),
      t('خل البطن مشدود والظهر مستقيم طول الوقت.', 'Keep your core tight and your back straight throughout.'),
    ],
    mistakes: [t('الوقوف والرجل مفرودة.', 'Standing with straight legs.')],
    breathing: t('تنفس بإيقاع سريع ومنتظم.', 'Breathe quickly and rhythmically.'),
  },
  // ------------------------------------------------------------------ ذراعين
  {
    id: 'spider_curl', motion: 'muscle_map', library: true, name: t('سبايدر كيرل', 'Spider Curl'), aliases: ['Spider Curl', 'Spider Curls'],
    primary: ['biceps'], secondary: ['forearms'], equipment: 'EZ bar or dumbbells, incline bench',
    steps: [
      t('انسدح على بطنك على بنش مائل ويدك متدلية لتحت.', 'Lie chest-down on an incline bench with your arms hanging straight down.'),
      t('ارفع الوزن بثني الكوع فقط حتى تعصر الباي.', 'Curl by bending only your elbows until your biceps squeeze.'),
      t('نزّل ببطء.', 'Lower slowly.'),
    ],
    mistakes: [t('تحريك العضد لقدام.', 'Swinging your upper arms forward.')],
    breathing: t('أخرج النفس وأنت ترفع، وخذ نفس وأنت تنزل.', 'Exhale as you curl up, inhale as you lower.'),
  },
  {
    id: 'zottman_curl', motion: 'muscle_map', library: true, name: t('زوتمان كيرل', 'Zottman Curl'), aliases: ['Zottman Curl'],
    primary: ['biceps', 'forearms'], secondary: [], equipment: 'dumbbells',
    steps: [
      t('ارفع الدمبلات والكفين لفوق مثل الكيرل العادي.', 'Curl the dumbbells up with your palms facing up.'),
      t('في الأعلى لف الكفين لتحت.', 'At the top, rotate your palms to face down.'),
      t('نزّل ببطء والكفين لتحت، ثم لفّهم لفوق وكرر.', 'Lower slowly palms-down, then turn them back up and repeat.'),
    ],
    mistakes: [t('النزول السريع.', 'Lowering too fast.')],
    breathing: t('أخرج النفس وأنت ترفع، وخذ نفس وأنت تنزل.', 'Exhale as you curl up, inhale as you lower.'),
  },
  {
    id: 'reverse_curl', motion: 'muscle_map', library: true, name: t('كيرل عكسي (قبضة من فوق)', 'Reverse Barbell Curl'), aliases: ['Reverse Barbell Curl', 'Reverse Curl', 'Reverse EZ Bar Curl'],
    primary: ['forearms', 'biceps'], secondary: [], equipment: 'barbell or EZ bar',
    steps: [
      t('امسك البار بقبضة من فوق بعرض الكتفين.', 'Hold the bar with an overhand grip at shoulder width.'),
      t('ارفع البار بثني الكوع والعضد ثابت جنبك.', 'Curl the bar up with your upper arms fixed at your sides.'),
      t('نزّل ببطء.', 'Lower slowly.'),
    ],
    mistakes: [t('ثني الرسغ لتحت.', 'Letting your wrists bend down.')],
    breathing: t('أخرج النفس وأنت ترفع، وخذ نفس وأنت تنزل.', 'Exhale as you curl up, inhale as you lower.'),
  },
  {
    id: 'cable_hammer_curl', motion: 'muscle_map', library: true, name: t('هامر كيرل بالحبل', 'Cable Rope Hammer Curl'), aliases: ['Cable Hammer Curl', 'Rope Hammer Curl', 'Cable Hammer Curls - Rope Attachment'],
    primary: ['biceps', 'forearms'], secondary: [], equipment: 'cable, rope',
    steps: [
      t('ركّب الحبل على البكرة السفلية وامسكه والكفين مقابل بعض.', 'Attach a rope to the low pulley and hold it with palms facing each other.'),
      t('ارفع الحبل لصدرك والكوع ثابت جنبك.', 'Curl the rope toward your chest, elbows fixed at your sides.'),
      t('نزّل ببطء حتى تستقيم يدك.', 'Lower slowly until your arms are straight.'),
    ],
    mistakes: [t('تحريك الكوع لقدام.', 'Letting your elbows drift forward.')],
    breathing: t('أخرج النفس وأنت ترفع، وخذ نفس وأنت تنزل.', 'Exhale as you curl up, inhale as you lower.'),
  },
  {
    id: 'reverse_pushdown', motion: 'muscle_map', library: true, name: t('تراي كيبل بقبضة عكسية', 'Reverse-Grip Triceps Pushdown'), aliases: ['Reverse Grip Triceps Pushdown', 'Reverse Grip Pushdown'],
    primary: ['triceps'], secondary: ['forearms'], equipment: 'cable, straight bar',
    steps: [
      t('امسك البار من تحت (الكفين لفوق) والكوع لاصق بجنبك.', 'Grip the bar underhand (palms up) with elbows pinned to your sides.'),
      t('ادفع البار لتحت حتى تستقيم يدك.', 'Push the bar down until your arms are straight.'),
      t('ارجع ببطء لمستوى الصدر.', 'Return slowly to chest height.'),
    ],
    mistakes: [t('فتح الكوع عن الجسم.', 'Elbows drifting away from your body.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'single_arm_cable_triceps', motion: 'muscle_map', library: true, name: t('تراي كيبل بيد وحدة', 'One-Arm Cable Triceps Extension'), aliases: ['Cable One Arm Tricep Extension', 'Single Arm Cable Pushdown', 'One Arm Pushdown'],
    primary: ['triceps'], secondary: [], equipment: 'cable, handle',
    steps: [
      t('امسك المقبض بيد وحدة والكوع لاصق بجنبك.', 'Hold the handle in one hand with your elbow at your side.'),
      t('افرد يدك لتحت حتى تستقيم واعصر التراي.', 'Extend your arm down until straight and squeeze your triceps.'),
      t('ارجع ببطء وكمّل العدد، ثم بدّل اليد.', 'Return slowly, finish your reps, then switch arms.'),
    ],
    mistakes: [t('لف الجسم مع الحركة.', 'Twisting your body with the movement.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'dip_machine', motion: 'muscle_map', library: true, name: t('جهاز الديبس', 'Dip Machine'), aliases: ['Dip Machine', 'Seated Dip Machine', 'Machine Dips'],
    primary: ['triceps'], secondary: ['chest', 'shoulders'], equipment: 'machine',
    steps: [
      t('اجلس وامسك المقابض جنبك والكوع لورا.', 'Sit and grab the handles at your sides with elbows pointing back.'),
      t('ادفع المقابض لتحت حتى تستقيم يدك.', 'Press the handles down until your arms are straight.'),
      t('ارجع ببطء لين يصير الكوع ٩٠ درجة تقريباً.', 'Return slowly until your elbows reach about 90°.'),
    ],
    mistakes: [t('رفع الأكتاف للأذن.', 'Shrugging your shoulders up.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'close_grip_db_press', motion: 'muscle_map', library: true, name: t('ضغط دمبل قبضة ضيقة', 'Close-Grip Dumbbell Press'), aliases: ['Close-Grip Dumbbell Press', 'Dumbbell Crush Press'],
    primary: ['triceps'], secondary: ['chest'], equipment: 'dumbbells, bench',
    steps: [
      t('استلقِ وامسك الدمبلين فوق صدرك والكفين مقابل بعض ولاصقين.', 'Lie back holding the dumbbells over your chest, palms facing and touching.'),
      t('نزّل الدمبلات لصدرك والكوع قريب من جسمك.', 'Lower them to your chest with elbows close to your body.'),
      t('ادفع لفوق وهم لاصقين ببعض.', 'Press back up while keeping them pressed together.'),
    ],
    mistakes: [t('فتح الكوع للجنب.', 'Flaring your elbows.')],
    breathing: EXHALE_UP,
  },
  {
    id: 'reverse_wrist_curl', motion: 'muscle_map', library: true, name: t('ثني الرسغ العكسي', 'Reverse Wrist Curl'), aliases: ['Reverse Wrist Curl', 'Palms-Down Wrist Curl', 'Seated Dumbbell Palms-Down Wrist Curl'],
    primary: ['forearms'], secondary: [], equipment: 'dumbbells or barbell',
    steps: [
      t('اجلس وساعدك على فخذك والكف لتحت.', 'Sit with your forearms on your thighs, palms facing down.'),
      t('ارفع ظهر الكف لفوق بثني الرسغ فقط.', 'Lift the back of your hands up by extending only your wrists.'),
      t('نزّل ببطء.', 'Lower slowly.'),
    ],
    mistakes: [t('وزن ثقيل — الحركة تحتاج وزن خفيف.', 'Going heavy — this one needs a light weight.')],
    breathing: t('تنفس بهدوء.', 'Breathe steadily.'),
  },
  {
    id: 'wrist_roller', motion: 'muscle_map', library: true, name: t('لفافة الرسغ', 'Wrist Roller'), aliases: ['Wrist Roller'],
    primary: ['forearms'], secondary: ['shoulders'], equipment: 'wrist roller',
    steps: [
      t('امسك العصا قدامك ويدينك ممدودة على مستوى الكتف.', 'Hold the roller in front of you with arms straight at shoulder height.'),
      t('لف العصا بالرسغين بالتناوب حتى يطلع الوزن لفوق.', 'Roll it with alternating wrist turns until the weight reaches the top.'),
      t('نزّل الوزن ببطء بعكس اللف.', 'Lower the weight slowly by rolling the other way.'),
    ],
    mistakes: [t('نزول اليدين وتعب الكتف قبل الساعد.', 'Letting your arms drop so your shoulders give out first.')],
    breathing: t('تنفس بهدوء ولا تحبس نفسك.', 'Breathe steadily; don’t hold your breath.'),
  },
  {
    id: 'plate_pinch', motion: 'muscle_map', library: true, name: t('مسك الأقراص (قوة القبضة)', 'Plate Pinch'), aliases: ['Plate Pinch'],
    primary: ['forearms'], secondary: [], equipment: 'weight plates',
    steps: [
      t('حط قرصين ملساء وجهاً لوجه وامسكهم بأصابعك من الجوانب.', 'Put two smooth plates together and pinch them with your fingers.'),
      t('ارفعهم واوقف مستقيم.', 'Lift them and stand tall.'),
      t('اثبت أطول وقت تقدر، ثم بدّل اليد.', 'Hold as long as you can, then switch hands.'),
    ],
    mistakes: [t('ميلان الجسم لجهة.', 'Leaning to one side.')],
    breathing: t('تنفس بهدوء.', 'Breathe steadily.'),
  },
  // ------------------------------------------------------------------ أرجل
  {
    id: 'trap_bar_deadlift', motion: 'muscle_map', library: true, name: t('ديدلفت بالبار السداسي', 'Trap Bar Deadlift'), aliases: ['Trap Bar Deadlift', 'Hex Bar Deadlift'],
    primary: ['quads', 'glutes'], secondary: ['hamstrings', 'lowerBack', 'upperBack'], equipment: 'trap bar',
    steps: [
      t('اوقف داخل البار السداسي وامسك المقابض جنبك.', 'Stand inside the trap bar and grab the handles at your sides.'),
      t('انزل بالحوض وصدرك مرفوع وظهرك مستقيم.', 'Sit your hips down with chest up and back flat.'),
      t('ادفع الأرض برجلك وقف مستقيم، ثم نزّل بنفس الطريقة.', 'Push the floor away to stand tall, then lower the same way.'),
    ],
    mistakes: [t('تقويس الظهر.', 'Rounding your back.'), t('الوقوف بالظهر قبل الرجل.', 'Letting your hips shoot up first.')],
    breathing: t('خذ نفس وشد البطن قبل الرفع، وأخرجه لما توقف.', 'Breathe in and brace before lifting; exhale once you are standing.'),
  },
  {
    id: 'lateral_lunge', motion: 'muscle_map', library: true, name: t('طعن جانبي', 'Lateral Lunge'), aliases: ['Lateral Lunge', 'Side Lunge', 'Barbell Side Split Squat'],
    primary: ['quads', 'glutes'], secondary: ['hamstrings'], equipment: 'bodyweight or dumbbell',
    steps: [
      t('اوقف والقدمين مضمومة.', 'Stand with your feet together.'),
      t('خذ خطوة واسعة للجنب وانزل على هالرجل والرجل الثانية ممدودة.', 'Take a wide step to the side and sit into that leg, keeping the other leg straight.'),
      t('ادفع بالرجل المثنية وارجع لوضع البداية، ثم بدّل.', 'Push off the bent leg back to the start, then switch sides.'),
    ],
    mistakes: [t('الركبة تدخل للداخل.', 'Knee caving inward.'), t('رفع الكعب.', 'Heel lifting off the floor.')],
    breathing: EXHALE_UP,
  },
  {
    id: 'glute_ham_raise', motion: 'muscle_map', library: true, name: t('نوردك / رفعة الفخذ الخلفي', 'Glute-Ham Raise (Nordic Curl)'), aliases: ['Glute Ham Raise', 'Nordic Curl', 'Nordic Hamstring Curl', 'Natural Glute Ham Raise'],
    primary: ['hamstrings'], secondary: ['glutes', 'calves'], equipment: 'GHD or partner',
    steps: [
      t('اجلس على ركبك وثبّت كاحلك (جهاز أو شخص يمسكها).', 'Kneel and lock your ankles in place (on a machine or held by a partner).'),
      t('خل جسمك مستقيم من الركبة للراس، وانزل لقدام ببطء قد ما تقدر.', 'Keep a straight line from knees to head and lower forward as slowly as you can.'),
      t('ادفع بيدينك من الأرض واسحب بالفخذ الخلفي لترجع.', 'Push off the floor with your hands and pull back up with your hamstrings.'),
    ],
    mistakes: [t('ثني الحوض بدل ما يبقى الجسم مستقيم.', 'Bending at the hips instead of staying straight.')],
    breathing: t('أخرج النفس وأنت ترجع لفوق.', 'Exhale as you pull back up.'),
    tip: t('تمرين صعب — ابدأ بعدات قليلة.', 'It’s tough — start with a few reps.'),
  },
  {
    id: 'standing_leg_curl', motion: 'muscle_map', library: true, name: t('ثني الساق واقف', 'Standing Leg Curl'), aliases: ['Standing Leg Curl', 'Standing Hamstring Curl'],
    primary: ['hamstrings'], secondary: ['calves'], equipment: 'machine',
    steps: [
      t('اوقف في الجهاز والمسند خلف أسفل ساقك.', 'Stand in the machine with the pad behind your lower leg.'),
      t('اثنِ الركبة وارفع الكعب باتجاه الأرداف.', 'Bend your knee and bring your heel toward your glutes.'),
      t('نزّل ببطء وكمّل العدد، ثم بدّل الرجل.', 'Lower slowly, finish your reps, then switch legs.'),
    ],
    mistakes: [t('ميلان الحوض أو الجسم.', 'Twisting your hips or body.')],
    breathing: EXHALE_PULL,
  },
  {
    id: 'box_squat', motion: 'muscle_map', library: true, name: t('سكوات على صندوق', 'Box Squat'), aliases: ['Box Squat', 'Squat To Box'],
    primary: ['quads', 'glutes'], secondary: ['hamstrings', 'lowerBack'], equipment: 'barbell, box',
    steps: [
      t('حط صندوق خلفك على ارتفاع الركبة تقريباً والبار على ظهرك.', 'Place a box behind you at about knee height with the bar on your back.'),
      t('ارجع بالحوض وانزل حتى تجلس على الصندوق بخفة.', 'Sit your hips back and down until you lightly touch the box.'),
      t('ادفع من الصندوق وقف مستقيم بدون ارتداد.', 'Drive up off the box to stand tall without bouncing.'),
    ],
    mistakes: [t('الطيحة على الصندوق بقوة.', 'Dropping hard onto the box.')],
    breathing: EXHALE_UP,
  },
  {
    id: 'leg_press_calf_raise', motion: 'muscle_map', library: true, name: t('سمانة على جهاز الليق برس', 'Leg Press Calf Raise'), aliases: ['Calf Press', 'Leg Press Calf Raise', 'Calf Press On The Leg Press Machine'],
    primary: ['calves'], secondary: [], equipment: 'leg press',
    steps: [
      t('اجلس في الليق برس وحط مقدمة القدم على طرف المنصة.', 'Sit in the leg press with the balls of your feet on the platform edge.'),
      t('ادفع المنصة بأصابع رجلك لأعلى نقطة.', 'Push the platform away with your toes as far as you can.'),
      t('ارجع ببطء حتى تحس بتمدد السمانة.', 'Return slowly until you feel the calf stretch.'),
    ],
    mistakes: [t('ثني الركبة.', 'Bending your knees.')],
    breathing: EXHALE_PUSH,
  },
  {
    id: 'monster_walk', motion: 'muscle_map', library: true, name: t('مشي بالمطاط (مونستر ووك)', 'Monster Walk'), aliases: ['Monster Walk', 'Band Walk', 'Lateral Band Walk'],
    primary: ['glutes'], secondary: ['quads'], equipment: 'mini band',
    steps: [
      t('حط المطاط حول ركبك أو كاحلك وانزل نص سكوات.', 'Place a mini band around your knees or ankles and sink into a half squat.'),
      t('امشِ خطوات صغيرة للجنب أو بشكل مائل لقدام.', 'Take small steps sideways or diagonally forward.'),
      t('خل المطاط مشدود طول الوقت.', 'Keep tension on the band the whole time.'),
    ],
    mistakes: [t('دخول الركب للداخل.', 'Letting your knees cave in.')],
    breathing: t('تنفس بإيقاع منتظم.', 'Breathe steadily.'),
  },
  // ------------------------------------------------------------------ بطن
  {
    id: 'ab_crunch_machine', motion: 'muscle_map', library: true, name: t('جهاز البطن', 'Ab Crunch Machine'), aliases: ['Ab Crunch Machine', 'Machine Crunch'],
    primary: ['abs'], secondary: [], equipment: 'machine',
    steps: [
      t('اجلس في الجهاز وامسك المقابض وثبّت رجلك.', 'Sit in the machine, grab the handles and secure your feet.'),
      t('لف جذعك لقدام بعضلات البطن.', 'Curl your torso forward using your abs.'),
      t('ارجع ببطء بدون ما يضرب الوزن.', 'Return slowly without letting the stack slam.'),
    ],
    mistakes: [t('السحب باليدين بدل البطن.', 'Pulling with your arms instead of your abs.')],
    breathing: t('أخرج النفس وأنت تنزل.', 'Exhale as you crunch down.'),
  },
  {
    id: 'decline_crunch', motion: 'muscle_map', library: true, name: t('كرنش على بنش مائل', 'Decline Crunch'), aliases: ['Decline Crunch', 'Decline Sit Up'],
    primary: ['abs'], secondary: [], equipment: 'decline bench',
    steps: [
      t('ثبّت رجلك في البنش المائل وانسدح لورا.', 'Hook your feet in the decline bench and lie back.'),
      t('ارفع كتفينك وجذعك باتجاه ركبك.', 'Curl your shoulders and torso toward your knees.'),
      t('نزّل ببطء بدون ما تطيح.', 'Lower slowly without dropping back.'),
    ],
    mistakes: [t('سحب الرقبة باليدين.', 'Pulling on your neck.')],
    breathing: t('أخرج النفس وأنت تطلع.', 'Exhale as you curl up.'),
  },
  {
    id: 'oblique_crunch', motion: 'muscle_map', library: true, name: t('كرنش جانبي', 'Oblique Crunch'), aliases: ['Oblique Crunch', 'Oblique Crunches', 'Cross-Body Crunch'],
    primary: ['abs'], secondary: [], equipment: 'bodyweight',
    steps: [
      t('انسدح على ظهرك والركب مثنية ويدينك جنب راسك.', 'Lie on your back with knees bent and hands beside your head.'),
      t('ارفع كتفك وقرّبه من الركبة المعاكسة.', 'Lift one shoulder toward the opposite knee.'),
      t('ارجع ببطء وبدّل الجهة.', 'Lower slowly and switch sides.'),
    ],
    mistakes: [t('سحب الرقبة.', 'Pulling on your neck.')],
    breathing: t('أخرج النفس مع كل رفعة.', 'Exhale on each crunch.'),
  },
  {
    id: 'heel_touchers', motion: 'muscle_map', library: true, name: t('لمس الكعب', 'Alternate Heel Touchers'), aliases: ['Heel Touchers', 'Alternate Heel Touchers', 'Heel Taps'],
    primary: ['abs'], secondary: [], equipment: 'bodyweight',
    steps: [
      t('انسدح والركب مثنية، وارفع كتفينك شوي عن الأرض.', 'Lie with knees bent and lift your shoulders slightly off the floor.'),
      t('ميّل لجهة ولمس الكعب بيدك.', 'Crunch to one side and tap your heel with your hand.'),
      t('بدّل الجهة بدون ما تنزل كتفك.', 'Switch sides without lowering your shoulders.'),
    ],
    mistakes: [t('تنزيل الراس بين كل عدة.', 'Dropping your head between reps.')],
    breathing: t('أخرج النفس مع كل لمسة.', 'Exhale on each tap.'),
  },
  {
    id: 'med_ball_slam', motion: 'muscle_map', library: true, name: t('ضرب الكرة الطبية', 'Medicine Ball Slam'), aliases: ['Medicine Ball Slam', 'Ball Slam', 'Overhead Slam'],
    primary: ['abs', 'lats'], secondary: ['shoulders', 'glutes'], equipment: 'slam ball',
    steps: [
      t('ارفع الكرة فوق راسك وانت على أطراف أصابعك.', 'Raise the ball overhead as you rise onto your toes.'),
      t('اضرب الكرة على الأرض بكل قوتك وانت تنحني.', 'Slam it into the floor as hard as you can while hinging down.'),
      t('امسكها من الأرض بظهر مستقيم وكرر.', 'Pick it up with a flat back and repeat.'),
    ],
    mistakes: [t('تقويس الظهر وقت الالتقاط.', 'Rounding your back to pick the ball up.')],
    breathing: t('أخرج النفس بقوة مع الضربة.', 'Exhale hard as you slam.'),
  },
  {
    id: 'knee_tucks', motion: 'muscle_map', library: true, name: t('ضم الركب جالس', 'Seated Knee Tucks'), aliases: ['Seated Knee Tucks', 'Seated Leg Tucks', 'Leg Pull-In'],
    primary: ['abs'], secondary: [], equipment: 'bodyweight or bench',
    steps: [
      t('اجلس وميّل لورا واسند بيدينك، ورجلك مرفوعة وممدودة.', 'Sit, lean back on your hands and lift your legs straight.'),
      t('قرّب ركبك من صدرك وأنت تقرّب جذعك لها.', 'Pull your knees toward your chest as you bring your torso to meet them.'),
      t('افرد رجلك من جديد بدون ما تلمس الأرض.', 'Extend your legs again without touching the floor.'),
    ],
    mistakes: [t('الاعتماد على الزخم.', 'Using momentum.')],
    breathing: t('أخرج النفس وأنت تضم.', 'Exhale as you tuck.'),
  },
  // ------------------------------------------------------------------ كارديو ولياقة
  {
    id: 'jump_rope', motion: 'muscle_map', library: true, name: t('نط الحبل', 'Jump Rope'), aliases: ['Jump Rope', 'Rope Jumping', 'Skipping'],
    primary: ['calves'], secondary: ['quads', 'shoulders'], equipment: 'jump rope',
    steps: [
      t('امسك الحبل والكوع قريب من جسمك.', 'Hold the rope with elbows close to your body.'),
      t('لف الحبل بالرسغ مو بالكتف.', 'Turn the rope with your wrists, not your shoulders.'),
      t('نط نطات صغيرة على مقدمة القدم.', 'Make small hops on the balls of your feet.'),
    ],
    mistakes: [t('النط عالي زيادة.', 'Jumping too high.')],
    breathing: t('تنفس بإيقاع منتظم.', 'Breathe steadily.'),
  },
  {
    id: 'rowing_machine', motion: 'muscle_map', library: true, name: t('جهاز التجديف', 'Rowing Machine'), aliases: ['Rowing Machine', 'Rower', 'Rowing, Stationary', 'Rowing Stationary'],
    primary: ['upperBack', 'quads'], secondary: ['lats', 'glutes', 'hamstrings', 'biceps'], equipment: 'rower',
    steps: [
      t('ادفع برجلك أول وظهرك مستقيم.', 'Push with your legs first, keeping your back straight.'),
      t('بعدها ميّل لورا شوي واسحب المقبض لأسفل صدرك.', 'Then lean back slightly and pull the handle to your lower chest.'),
      t('ارجع بالعكس: اليدين ثم الجذع ثم الركب.', 'Return in reverse: arms, then torso, then knees.'),
    ],
    mistakes: [t('السحب باليدين قبل الرجل.', 'Pulling with your arms before your legs.')],
    breathing: t('أخرج النفس مع السحبة، وخذ نفس وأنت ترجع.', 'Exhale on the drive, inhale on the recovery.'),
  },
  {
    id: 'treadmill_run', motion: 'muscle_map', library: true, name: t('الجري على السير', 'Treadmill Running'), aliases: ['Treadmill', 'Running, Treadmill', 'Running Treadmill', 'Treadmill Run'],
    primary: ['quads', 'hamstrings'], secondary: ['calves', 'glutes'], equipment: 'treadmill',
    steps: [
      t('ابدأ بمشي خفيف ٣–٥ دقائق للإحماء.', 'Start with 3–5 minutes of easy walking to warm up.'),
      t('زد السرعة لسرعة تقدر تتكلم فيها بصعوبة بسيطة.', 'Raise the speed to a pace where talking is slightly hard.'),
      t('خل خطوتك قصيرة ونزول القدم تحت جسمك.', 'Keep a short stride with your feet landing under your body.'),
    ],
    mistakes: [t('مسك الجهاز طول الوقت.', 'Holding onto the rails the whole time.')],
    breathing: t('تنفس بإيقاع مريح.', 'Breathe at a comfortable rhythm.'),
  },
  {
    id: 'stationary_bike', motion: 'muscle_map', library: true, name: t('الدراجة الثابتة', 'Stationary Bike'), aliases: ['Stationary Bike', 'Bicycling, Stationary', 'Exercise Bike', 'Spin Bike'],
    primary: ['quads'], secondary: ['hamstrings', 'glutes', 'calves'], equipment: 'bike',
    steps: [
      t('اضبط المقعد بحيث تكون الركبة مثنية شوي في أسفل الدورة.', 'Set the seat so your knee is slightly bent at the bottom of the pedal stroke.'),
      t('ابدأ بمقاومة خفيفة للإحماء.', 'Start with light resistance to warm up.'),
      t('زد المقاومة أو السرعة حسب هدفك وخل ظهرك مستقيم.', 'Increase resistance or speed to suit your goal, keeping your back straight.'),
    ],
    mistakes: [t('مقعد واطي زيادة.', 'Seat set too low.')],
    breathing: t('تنفس بإيقاع مريح.', 'Breathe at a comfortable rhythm.'),
  },
  {
    id: 'stair_climber', motion: 'muscle_map', library: true, name: t('جهاز الدرج', 'Stair Climber'), aliases: ['Stair Climber', 'Stairmaster', 'Step Mill'],
    primary: ['glutes', 'quads'], secondary: ['calves', 'hamstrings'], equipment: 'stair climber',
    steps: [
      t('اوقف مستقيم وامسك الجهاز بخفة للتوازن فقط.', 'Stand tall and hold the rails lightly, just for balance.'),
      t('اطلع بكامل القدم على كل درجة.', 'Step with your whole foot on each stair.'),
      t('حافظ على سرعة ثابتة تقدر تكمّل عليها.', 'Keep a steady pace you can sustain.'),
    ],
    mistakes: [t('الاتكاء بالجسم على الجهاز.', 'Leaning your body weight on the rails.')],
    breathing: t('تنفس بإيقاع مريح.', 'Breathe at a comfortable rhythm.'),
  },
  {
    id: 'power_clean', motion: 'muscle_map', library: true, name: t('باور كلين', 'Power Clean'), aliases: ['Power Clean', 'Clean'],
    primary: ['glutes', 'hamstrings', 'quads'], secondary: ['upperBack', 'shoulders', 'calves'], equipment: 'barbell',
    steps: [
      t('ابدأ مثل الديدلفت والبار قريب من ساقك.', 'Set up like a deadlift with the bar close to your shins.'),
      t('ارفع البار لفوق الركبة ثم افرد الحوض والرجل بقوة وارفع كتفك.', 'Lift past the knees, then explode through your hips and legs and shrug.'),
      t('ادخل تحت البار واستقبله على مقدمة الكتف والكوع لقدام.', 'Drop under the bar and catch it on your front shoulders with elbows high.'),
    ],
    mistakes: [t('السحب باليدين بدري.', 'Pulling early with your arms.'), t('البار يبتعد عن الجسم.', 'Letting the bar drift away from your body.')],
    breathing: t('خذ نفس وشد البطن قبل كل عدة.', 'Breathe in and brace before each rep.'),
    tip: t('حركة فنية — تعلّمها بوزن خفيف أو مع مدرب.', 'It’s a technical lift — learn it light or with a coach.'),
  },
];

// صور حقيقية لتمارين أرك الأصلية المطابقة من نفس المصدر
for (const e of EXERCISES) if (CURATED_PHOTOS[e.id]) e.photos = CURATED_PHOTOS[e.id];

/** كل التمارين: تمارين أرك (بحركة 3D) ثم المكتبة الموسّعة. المدرب المحلي يستخدم EXERCISES فقط */
export const ALL_EXERCISES: ExerciseGuide[] = [...EXERCISES, ...FEDB_EXERCISES];
const BY_ID = new Map(ALL_EXERCISES.map((e) => [e.id, e]));

/** العضلات الأساسية والمساعدة للتمرين (من الدليل أو من حركته) */
export function exerciseMuscles(e: ExerciseGuide): { primary: Muscle[]; secondary: Muscle[] } {
  if (e.primary) return { primary: e.primary, secondary: e.secondary ?? [] };
  const m = MOTIONS[e.motion];
  return { primary: m.primary, secondary: m.secondary };
}

/** العضلات لأي معرف تمرين (أو معرف حركة قديم) */
export function musclesOf(id: string): { primary: Muscle[]; secondary: Muscle[] } {
  const e = BY_ID.get(id);
  if (e) return exerciseMuscles(e);
  const m = MOTIONS[id as keyof typeof MOTIONS];
  return m ? { primary: m.primary, secondary: m.secondary } : { primary: [], secondary: [] };
}

/** الأدوات كنص مختصر */
export function exerciseEquipment(e: ExerciseGuide): string {
  if (e.equipment) return e.equipment;
  return MOTIONS[e.motion].props.map((p) => p.kind).join(',') || 'bodyweight';
}

// تصنيف الأداة والنوع لتمارين أرك الأصلية (تمارين المكتبة الموسّعة معها تصنيفها)
const EQUIP_RULES: [RegExp, LibEquipment][] = [
  [/ez ?bar/, 'ez_bar'], [/barbell|smith|trap bar|rackpins/, 'barbell'], [/dumbbell|goblet/, 'dumbbell'], [/kettlebell/, 'kettlebell'],
  [/cable|latbar|latmachine|rowstation/, 'cable'],
  [/machine|legpress|leg press|legextension|legcurl|chestpress|pecdeck|shoulderpress|hipab|hipad/, 'machine'],
  [/band/, 'bands'], [/medball|slam ball/, 'medicine_ball'],
  [/treadmill|bike|rower|stair|battle|wrist roller|weight plates/, 'other'],
];
const CURATED_CATEGORY: Record<string, LibCategory> = {
  jump_rope: 'cardio', rowing_machine: 'cardio', treadmill_run: 'cardio', stationary_bike: 'cardio', stair_climber: 'cardio',
  battle_ropes: 'cardio', jumping_jack: 'cardio', high_knees: 'cardio', burpee: 'cardio', mountain_climber: 'cardio',
  box_jump: 'plyometrics', jump_squat: 'plyometrics', plyo_push_up: 'plyometrics', med_ball_slam: 'plyometrics', power_clean: 'olympic',
};
/** الأداة الأساسية للتمرين (لفلاتر المكتبة) */
export function equipOf(e: ExerciseGuide): LibEquipment {
  if (e.equip) return e.equip;
  const s = exerciseEquipment(e).toLowerCase();
  for (const [re, k] of EQUIP_RULES) if (re.test(s)) return k;
  return 'bodyweight';
}
/** نوع التمرين (قوة، إطالة، كارديو...) */
export function categoryOf(e: ExerciseGuide): LibCategory {
  return e.category ?? CURATED_CATEGORY[e.id] ?? 'strength';
}

/** تطبيع للبحث بالعربي والإنجليزي: بدون تشكيل، والهمزات والتاء المربوطة والياء موحّدة */
export const normSearch = (s: string) => s.toLowerCase()
  .replace(/[\u064B-\u0652\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/[^a-z0-9\u0600-\u06FF]+/g, ' ').trim();

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const BY_NAME = new Map<string, ExerciseGuide>();
for (const e of EXERCISES) {
  BY_NAME.set(norm(e.name.en), e);
  for (const a of e.aliases ?? []) BY_NAME.set(norm(a), e);
}
// أسماء المكتبة الموسّعة: تستخدم بعد الكلمات المفتاحية عشان تبقى تمارين أرك (بحركة 3D) هي الأولى
const LIB_BY_NAME = new Map<string, ExerciseGuide>();
for (const e of FEDB_EXERCISES) if (!LIB_BY_NAME.has(norm(e.name.en))) LIB_BY_NAME.set(norm(e.name.en), e);

// كلمات مفتاحية لربط أي اسم تمرين (من الذكاء الاصطناعي) بأقرب حركة
const KEYWORDS: [RegExp, string][] = [
  // التمارين الجديدة (الأدق أولاً)
  [/decline.*(dumbbell|db).*(press|bench)/, 'decline_db_press'], [/decline.*(bench|press)/, 'decline_bench_bb'], [/smith.*bench/, 'smith_bench_press'],
  [/incline.*push|hands elevated/, 'incline_push_up'], [/decline.*push|feet elevated/, 'decline_push_up'],
  [/diamond|triangle push|close.*(grip|triceps).*push/, 'diamond_push_up'], [/wide.*push|push.*wide/, 'wide_push_up'], [/plyo.*push|clap push/, 'plyo_push_up'],
  [/low.*(crossover|cable fl)|low to high/, 'low_cable_crossover'], [/cable chest press/, 'cable_chest_press'],
  [/inverted row|australian|bodyweight row/, 'inverted_row'], [/renegade|plank row/, 'renegade_row'],
  [/bent.?over.*(dumbbell|two)|(dumbbell|db).*bent.?over.*row|two.?arm.*dumbbell row/, 'row_db_bent'], [/machine row|iso row|chest supported row/, 'machine_row'],
  [/rack pull/, 'rack_pull'], [/trap bar|hex bar/, 'trap_bar_deadlift'], [/hyperextension|back extension|45 degree/, 'hyperextension'],
  [/assisted pull/, 'assisted_pullup'], [/dumbbell shrug|db shrug/, 'db_shrug'], [/shrug/, 'barbell_shrug'],
  [/pull ?apart/, 'band_pull_apart'], [/push press/, 'push_press'], [/standing.*dumbbell.*press/, 'standing_db_press'],
  [/rear delt fl|cable reverse fl/, 'cable_rear_delt_fly'], [/external rotation/, 'external_rotation'], [/battl.*rope/, 'battle_ropes'],
  [/reverse.*wrist|palms down.*wrist/, 'reverse_wrist_curl'], [/wrist curl/, 'wrist_curl'],
  [/preacher|scott curl/, 'preacher_curl'], [/spider curl/, 'spider_curl'], [/zottman/, 'zottman_curl'], [/reverse.*curl/, 'reverse_curl'],
  [/(cable|rope).*hammer|hammer.*(cable|rope)/, 'cable_hammer_curl'],
  [/wrist roller/, 'wrist_roller'], [/plate pinch/, 'plate_pinch'],
  [/overhead.*(cable|rope)|(cable|rope).*overhead/, 'overhead_cable_triceps'], [/reverse.*pushdown/, 'reverse_pushdown'],
  [/(one|single).?arm.*(cable|pushdown).*tri|(one|single).?arm pushdown/, 'single_arm_cable_triceps'], [/dip machine|machine dip/, 'dip_machine'],
  [/close.?grip.*dumbbell|crush press/, 'close_grip_db_press'],
  [/smith.*squat/, 'smith_squat'], [/dumbbell squat|db squat/, 'db_squat'], [/box squat|squat to box/, 'box_squat'],
  [/box jump/, 'box_jump'], [/jump squat|squat jump/, 'jump_squat'], [/adduct/, 'hip_adduction'],
  [/lateral lunge|side lunge|side split squat/, 'lateral_lunge'], [/nordic|glute ham/, 'glute_ham_raise'], [/standing.*leg curl|standing hamstring/, 'standing_leg_curl'],
  [/calf press|leg press calf/, 'leg_press_calf_raise'], [/monster walk|band walk/, 'monster_walk'],
  [/single.?leg.*(bridge|glute bridge)|one.?leg.*bridge/, 'single_leg_bridge'], [/^(?!.*tricep).*cable.*kick ?back|one.?legged cable/, 'cable_kickback'], [/pull ?through/, 'pull_through'],
  [/russian twist/, 'russian_twist'], [/side plank|side bridge/, 'side_plank'], [/bicycle|air bike/, 'bicycle_crunch'], [/reverse crunch/, 'reverse_crunch'],
  [/ab crunch machine|machine crunch/, 'ab_crunch_machine'], [/decline crunch|decline sit/, 'decline_crunch'], [/oblique crunch|cross body crunch/, 'oblique_crunch'],
  [/heel (touch|tap)/, 'heel_touchers'], [/slam/, 'med_ball_slam'], [/knee tuck|leg tuck|leg pull in/, 'knee_tucks'],
  [/sit ?ups?\b/, 'sit_up'], [/\bv ?ups?\b|jack ?knife/, 'v_up'], [/hanging leg raise/, 'hanging_leg_raise'],
  [/pallof|anti rotation/, 'pallof_press'], [/wood ?chop|cable lift/, 'woodchop'], [/side bend/, 'side_bend_db'], [/flutter/, 'flutter_kicks'],
  [/jump rope|rope jump|skipping/, 'jump_rope'], [/rowing machine|\brower\b|ergometer|rowing stationary/, 'rowing_machine'], [/treadmill|running|\bjog/, 'treadmill_run'],
  [/\bbike\b|bicycling|cycling|spin bike/, 'stationary_bike'], [/stair|step mill/, 'stair_climber'], [/power clean|\bclean\b/, 'power_clean'],
  // المكتبة الموسّعة (الأدق أولاً)
  [/front squat/, 'front_squat'], [/sumo.*(deadlift|dl)/, 'sumo_deadlift'], [/sumo|plie/, 'sumo_squat'], [/step.?up/, 'step_up'],
  [/reverse lunge/, 'reverse_lunge'], [/good ?morning/, 'good_morning'], [/donkey|glute kick ?back|quadruped kick/, 'donkey_kick'],
  [/abduct/, 'hip_abduction'], [/seated calf/, 'seated_calf_raise'], [/single.?leg.*(rdl|deadlift|romanian)/, 'single_leg_rdl'],
  [/swing/, 'kb_swing'], [/wall sit/, 'wall_sit'], [/air squat|bodyweight squat/, 'air_squat'],
  [/incline.*(barbell|bench press)|barbell.*incline/, 'incline_bench_bb'], [/close.?grip.*bench/, 'close_grip_bench'],
  [/knee push|modified push/, 'knee_push_up'], [/push ?up|press ?up/, 'push_up'], [/incline.*fl(y|ies)/, 'incline_db_fly'], [/dumbbell fl(y|ies)|db fl(y|ies)|flat fl(y|ies)/, 'db_fly'],
  [/arnold/, 'arnold_press'], [/front raise/, 'front_raise'], [/face pull/, 'face_pull'], [/reverse (pec|fly)|rear delt machine/, 'reverse_pec_deck'],
  [/t.?bar|landmine/, 't_bar_row'], [/chin ?up/, 'chin_up'], [/straight.?arm|cable pullover/, 'straight_arm_pulldown'], [/pullover/, 'db_pullover'],
  [/superman|back extension|hyperextension/, 'superman'],
  [/concentration|preacher/, 'concentration_curl'], [/incline.*curl/, 'incline_db_curl'], [/cable.*curl/, 'cable_curl'],
  [/skull|lying tricep/, 'skull_crusher'], [/kick ?back/, 'triceps_kickback'], [/bench dip|chair dip/, 'bench_dips'],
  [/cable crunch/, 'cable_crunch'], [/crunch|sit.?up/, 'crunch'], [/lying leg raise/, 'lying_leg_raise'], [/mountain/, 'mountain_climber'], [/dead ?bug/, 'dead_bug'],
  [/jumping jack|star jump/, 'jumping_jack'], [/high knee/, 'high_knees'], [/burpee/, 'burpee'],
  [/hack/, 'hack_squat'], [/leg press/, 'leg_press'], [/leg ext/, 'leg_extension'],
  [/seated.*curl|curl.*seated/, 'leg_curl_seated'], [/leg curl|hamstring curl/, 'leg_curl_lying'],
  [/bulgarian/, 'bulgarian_split_squat'], [/split squat/, 'split_squat'], [/lunge/, 'walking_lunge'],
  [/goblet/, 'goblet_squat'], [/squat/, 'back_squat'],
  [/romanian|rdl|stiff/, 'rdl_db'], [/deadlift/, 'deadlift'],
  [/hip thrust/, 'hip_thrust_bb'], [/bridge/, 'glute_bridge'], [/calf/, 'calf_raise'],
  [/incline/, 'incline_db_press'], [/machine.*chest|chest press/, 'chest_press_machine'],
  [/pec deck|butterfly/, 'pec_deck'], [/fly|crossover/, 'cable_fly'], [/push ?up/, 'bench_db'],
  [/dumbbell.*bench|db bench/, 'bench_db'], [/bench/, 'bench_bb'], [/dip/, 'dips'],
  [/overhead press|military|ohp/, 'ohp_standing'], [/machine.*shoulder/, 'shoulder_press_machine'], [/shoulder press|arnold/, 'shoulder_press_db_seated'],
  [/upright row|shrug|traps?\b/, 'upright_row'], [/rear delt|reverse fly|face pull/, 'rear_delt_raise'], [/cable lateral/, 'lateral_raise_cable'], [/lateral|side raise/, 'lateral_raise'],
  [/close.*pulldown|pulldown.*close/, 'lat_pulldown_close'], [/pulldown/, 'lat_pulldown'], [/pull ?up|chin ?up/, 'pullup'],
  [/cable row|seated row/, 'row_cable_seated'], [/one.?arm|single.?arm|dumbbell row/, 'row_db_one_arm'], [/row/, 'row_bb'],
  [/hammer/, 'curl_hammer'], [/barbell curl|ez/, 'curl_bb'], [/curl/, 'curl_db'],
  [/pushdown|push down/, 'triceps_pushdown'], [/tricep|skull|extension/, 'triceps_overhead_db'],
  [/plank/, 'plank'], [/knee raise|leg raise/, 'hanging_knee_raise'], [/wheel|rollout/, 'ab_wheel'],
];

/** يرجع دليل التمرين من المعرف أو الاسم الإنجليزي أو بالتقريب */
export function findExercise(idOrName: string | null | undefined): ExerciseGuide | null {
  if (!idOrName) return null;
  const byId = BY_ID.get(idOrName);
  if (byId) return byId;
  const n = norm(idOrName);
  const exact = BY_NAME.get(n);
  if (exact) return exact;
  for (const [re, id] of KEYWORDS) if (re.test(n)) return BY_ID.get(id) ?? null;
  return LIB_BY_NAME.get(n) ?? null;
}

export function getExercise(id: string): ExerciseGuide | null {
  return BY_ID.get(id) ?? null;
}
