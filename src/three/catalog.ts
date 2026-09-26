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
