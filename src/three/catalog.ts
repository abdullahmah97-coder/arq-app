// دليل التمارين: الاسم، الحركة ثلاثية الأبعاد، الخطوات، الأخطاء الشائعة، والتنفس (عربي/إنجليزي)
import type { I18nText } from '../lib/types';
import type { Muscle } from './rig';
import { MOTIONS } from './motions';

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
];

const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const BY_NAME = new Map<string, ExerciseGuide>();
for (const e of EXERCISES) {
  BY_NAME.set(norm(e.name.en), e);
  for (const a of e.aliases ?? []) BY_NAME.set(norm(a), e);
}

// كلمات مفتاحية لربط أي اسم تمرين (من الذكاء الاصطناعي) بأقرب حركة
const KEYWORDS: [RegExp, string][] = [
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
  return null;
}

export function getExercise(id: string): ExerciseGuide | null {
  return BY_ID.get(id) ?? null;
}
