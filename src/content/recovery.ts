// محتوى «ثقافة الاستشفاء»: مواضيع قصيرة مبنية على الإرشادات الرياضية المعروفة، ودليل «وين يعورك؟»
// تثقيفي فقط وما يغني عن التشخيص: أي علامة خطر توجّه لأخصائي أو طبيب
import type { I18nText } from '../lib/types';

const t = (ar: string, en: string): I18nText => ({ ar, en });

export interface RecoveryTopic { id: string; icon: string; title: I18nText; summary: I18nText; points: I18nText[]; caution?: I18nText }

export const RECOVERY_TOPICS: RecoveryTopic[] = [
  {
    id: 'sleep', icon: 'moon-outline',
    title: t('النوم: أقوى أداة استشفاء', 'Sleep: your strongest recovery tool'),
    summary: t('العضلة تتصلّح وتكبر وأنت نايم، والنوم القليل ينزّل القوة والتركيز ويزيد الجوع.', 'Muscle repairs and grows while you sleep; short sleep lowers strength and focus and raises hunger.'),
    points: [
      t('هدفك ٧–٩ ساعات، وبنفس المواعيد تقريباً حتى بالإجازة.', 'Aim for 7–9 hours at roughly the same times, weekends included.'),
      t('وقّف القهوة والشاي ومشروبات الطاقة قبل النوم بست ساعات تقريباً.', 'Stop coffee, tea and energy drinks about six hours before bed.'),
      t('غرفة باردة ومظلمة وهادئة، وخفف الجوال آخر نص ساعة.', 'Keep the room cool, dark and quiet, and put the phone down for the last half hour.'),
      t('قيلولة ٢٠–٣٠ دقيقة تساعد إذا نومك بالليل ناقص، بس لا تكون قريبة من المغرب.', 'A 20–30 minute nap helps when night sleep is short, just not too late in the day.'),
      t('إذا جاهزيتك حمراء في التطبيق، غالباً السبب نوم أو إجهاد: خفف التمرين اليوم.', 'If your readiness is red in the app, sleep or stress is usually why: train lighter today.'),
    ],
  },
  {
    id: 'refuel', icon: 'restaurant-outline',
    title: t('الأكل والمويه بعد التمرين', 'Refuelling and hydration'),
    summary: t('بعد التمرين جسمك يحتاج بروتين يبني فيه، وكارب يعوّض الطاقة، ومويه تعوّض العرق.', 'After training your body needs protein to rebuild, carbs to refill energy and water to replace sweat.'),
    points: [
      t('وجبة فيها ٢٠–٤٠ جم بروتين خلال ساعتين بعد التمرين (دجاج، بيض، زبادي يوناني، لبن، بروتين).', 'Have 20–40 g of protein within two hours after training (chicken, eggs, Greek yoghurt, laban, a shake).'),
      t('مجموع البروتين في اليوم أهم من التوقيت: تقريباً ١٫٦ جم لكل كيلو من وزنك لمن يبني عضل.', 'Total daily protein matters more than timing: about 1.6 g per kg of body weight when building muscle.'),
      t('أضف كارب (رز، خبز، تمر، فواكه) خصوصاً بعد التمارين الطويلة أو إذا بتتمرن مرة ثانية قريب.', 'Add carbs (rice, bread, dates, fruit), especially after long sessions or before training again soon.'),
      t('اشرب مويه على طول اليوم؛ لون البول الفاتح علامة جيدة. في حر الصيف زد المويه والأملاح.', 'Drink water through the day; pale urine is a good sign. In the summer heat add more water and salts.'),
      t('تقدر تصوّر وجبتك بعد التمرين والتطبيق يحسب لك البروتين والكارب.', 'Snap your post-workout meal and the app works out the protein and carbs.'),
    ],
  },
  {
    id: 'active', icon: 'walk-outline',
    title: t('الاستشفاء النشط ويوم الراحة', 'Active recovery and rest days'),
    summary: t('يوم الراحة مو يوم كنبة: حركة خفيفة تنشّط الدورة الدموية وتخفف التيبّس.', 'A rest day isn\'t a couch day: light movement boosts circulation and eases stiffness.'),
    points: [
      t('مشي ٢٠–٤٠ دقيقة، أو دراجة وسباحة بشدة خفيفة تقدر تسولف فيها.', 'Walk 20–40 minutes, or cycle or swim at an easy, chatty pace.'),
      t('خذ على الأقل يوم أو يومين راحة بالأسبوع حسب برنامجك.', 'Take at least one or two rest days a week, depending on your programme.'),
      t('كل ٤–٨ أسابيع خذ أسبوع تخفيف: نفس التمارين بحجم أقل (تقريباً النص).', 'Every 4–8 weeks take a deload week: same exercises at roughly half the volume.'),
      t('علامات الإجهاد الزائد: نوم سيء، نبض راحة أعلى من العادة، أداء ينزل، ومزاج متعكر. تابعها من صفحة الصحة.', 'Signs of overreaching: poor sleep, higher resting heart rate, falling performance and low mood. Track them on the health page.'),
    ],
  },
  {
    id: 'stretch', icon: 'body-outline',
    title: t('الإطالة والمرونة', 'Stretching and mobility'),
    summary: t('الإطالة بعد التمرين تريّح العضلات وتحسّن مدى الحركة مع الوقت.', 'Stretching after training relaxes the muscles and improves range of motion over time.'),
    points: [
      t('قبل التمرين: إحماء حركي (دوائر ومشي وتمارين خفيفة) بدل الإطالة الطويلة.', 'Before training: a dynamic warm-up (circles, walking, light sets) rather than long holds.'),
      t('بعد التمرين: اثبت ٣٠–٦٠ ثانية بكل إطالة، وتنفّس بهدوء.', 'After training: hold each stretch 30–60 seconds and breathe slowly.'),
      t('المفروض تحس بشد مريح، مو ألم حاد.', 'You should feel a comfortable pull, never sharp pain.'),
      t('روتين الاستشفاء في التطبيق يختار لك الإطالات حسب العضلات اللي تمرنت عليها اليوم.', 'The app\'s recovery routine picks stretches for the muscles you trained today.'),
    ],
  },
  {
    id: 'foam', icon: 'ellipse-outline',
    title: t('الفوم رولر والمساج', 'Foam rolling and massage'),
    summary: t('يخففون الإحساس بألم العضلات والتيبّس لفترة، ويساعدونك تتحرك براحة.', 'They ease muscle soreness and stiffness for a while and help you move comfortably.'),
    points: [
      t('٣٠–٩٠ ثانية لكل منطقة بضغط متوسط، وتوقف عند النقاط المشدودة وتنفّس.', 'Spend 30–90 seconds per area with moderate pressure; pause and breathe on tight spots.'),
      t('ابعد عن العظام والمفاصل، وما تدحرج على أسفل الظهر مباشرة.', 'Avoid bones and joints, and don\'t roll directly on the lower back.'),
      t('المساج الرياضي عند أخصائي مفيد بعد الأسابيع الثقيلة أو قبل المنافسات.', 'A sports massage from a therapist helps after heavy weeks or before competitions.'),
    ],
  },
  {
    id: 'cold_heat', icon: 'thermometer-outline',
    title: t('البارد والحار: متى تستخدم كل واحد؟', 'Cold and heat: when to use each'),
    summary: t('البارد يخفف الألم بعد الجهد العالي، والحار يريّح العضلات المتيبسة.', 'Cold eases pain after hard efforts; heat relaxes stiff muscles.'),
    points: [
      t('الماء البارد (١٠–١٥ درجة لمدة ١٠ دقائق تقريباً) يفيد بعد المباريات والتمارين الطويلة.', 'Cold water (about 10–15 °C for around 10 minutes) helps after matches and long sessions.'),
      t('إذا هدفك تضخيم، لا تسوي حمام ثلج بعد تمرين الحديد كل مرة: ممكن يقلل استفادة العضلة.', 'If your goal is muscle growth, skip routine ice baths right after lifting: they may blunt the muscle gains.'),
      t('الساونا والماء الدافي للتيبّس والاسترخاء، واشرب مويه قبل وبعد.', 'Sauna and warm water ease stiffness and help you relax; drink water before and after.'),
      t('إصابة جديدة فيها تورم: لا حرارة أول يومين. الثلج دايماً ملفوف بقماش ١٠–١٥ دقيقة.', 'For a new injury with swelling, no heat for the first two days. Always wrap ice in cloth, 10–15 minutes.'),
    ],
    caution: t('عندك مشكلة قلب أو ضغط أو حامل؟ استشر طبيبك قبل الساونا أو الماء البارد جداً.', 'Heart or blood-pressure condition, or pregnant? Ask your doctor before saunas or very cold water.'),
  },
  {
    id: 'doms', icon: 'medkit-outline',
    title: t('ألم عضلات طبيعي أو إصابة؟', 'Normal soreness or an injury?'),
    summary: t('ألم العضلات بعد التمرين (يسمونه DOMS) طبيعي، لكن فيه علامات تقول لك وقف وراجع أخصائي.', 'Muscle soreness after training (called DOMS) is normal, but some signs mean stop and see a professional.'),
    points: [
      t('الطبيعي: يبدأ بعد يوم إلى يومين، ألم عام بالعضلة اللي اشتغلت، يخف مع الحركة، ويروح خلال ٣–٥ أيام.', 'Normal: starts 1–2 days later, a general ache in the muscle you trained, eases with movement, gone in 3–5 days.'),
      t('راجع أخصائي: ألم حاد أو مفاجئ وقت التمرين، صوت «طق»، تورم أو كدمة، ألم بالمفصل نفسه.', 'See a professional: sharp or sudden pain during training, a “pop”, swelling or bruising, pain in the joint itself.'),
      t('راجع أخصائي: تنميل أو ضعف، ألم يصحّيك من النوم، أو ألم ما يتحسن بعد أسبوع.', 'See a professional: numbness or weakness, pain that wakes you up, or pain that isn\'t better after a week.'),
      t('أول ما تتصاوب: خفف الحمل، ثلج ملفوف، ارفع المكان المصاب، وارجع للحركة الخفيفة بالتدريج بدون ألم.', 'Right after a strain: offload, wrapped ice, elevate, then return to light pain-free movement gradually.'),
    ],
    caution: t('ألم صدر، ضيق نفس شديد، أو دوخة وإغماء وقت التمرين: وقف فوراً واتصل ٩٩٧.', 'Chest pain, severe shortness of breath, or dizziness and fainting while training: stop now and call 997.'),
  },
];

export type PainArea = 'neck' | 'shoulder' | 'elbow' | 'wrist' | 'upperBack' | 'lowerBack' | 'hip' | 'knee' | 'ankle' | 'muscle';
export interface PainGuide { area: PainArea; icon: string; name: I18nText; common: I18nText; selfCare: I18nText[]; redFlags: I18nText[]; urgent?: I18nText }

export const PAIN_GUIDE: PainGuide[] = [
  {
    area: 'muscle', icon: 'fitness-outline', name: t('ألم عام بالعضلات بعد التمرين', 'General muscle soreness'),
    common: t('غالباً ألم عضلات متأخر طبيعي، خصوصاً بعد تمرين جديد أو أثقل من العادة.', 'Usually normal delayed soreness, especially after a new or heavier session.'),
    selfCare: [
      t('حركة خفيفة ومشي، وإطالة خفيفة للعضلة.', 'Light movement, walking and gentle stretching.'),
      t('نوم كافي وبروتين ومويه.', 'Enough sleep, protein and water.'),
      t('درّب عضلات ثانية لين تخف، أو خفف الوزن لنفس العضلة.', 'Train other muscles until it eases, or go lighter on the same muscle.'),
    ],
    redFlags: [t('بول غامق جداً مع ألم شديد وتورم بعد تمرين قاسي', 'Very dark urine with severe pain and swelling after an extreme session')],
    urgent: t('البول الغامق جداً مع ألم عضلات شديد يحتاج طوارئ فوراً.', 'Very dark urine with severe muscle pain needs the emergency room now.'),
  },
  {
    area: 'lowerBack', icon: 'body-outline', name: t('أسفل الظهر', 'Lower back'),
    common: t('أشيع شي بعد الديدلفت والسكوات والانحناء؛ غالباً شد عضلي يتحسن خلال أيام.', 'Very common after deadlifts, squats and bending; usually a muscle strain that improves within days.'),
    selfCare: [
      t('الحركة الخفيفة أفضل من الراحة التامة بالسرير.', 'Gentle movement beats full bed rest.'),
      t('وقف التمارين اللي تحمّل الظهر لين يخف، وارجع بوزن خفيف وتكنيك صحيح.', 'Pause back-loading lifts until it eases, then return light with good technique.'),
      t('حرارة خفيفة وإطالة وضعية الطفل تريّحه.', 'Gentle heat and child\'s pose help.'),
    ],
    redFlags: [
      t('ألم ينزل للرجل تحت الركبة مع تنميل أو ضعف', 'Pain travelling below the knee with numbness or weakness'),
      t('ألم ما يتحسن بعد أسبوعين', 'Pain not improving after two weeks'),
    ],
    urgent: t('تنميل حول منطقة الجلوس، أو صعوبة بالتحكم بالبول: طوارئ فوراً.', 'Numbness around the groin/seat area or trouble controlling your bladder: emergency room now.'),
  },
  {
    area: 'shoulder', icon: 'barbell-outline', name: t('الكتف', 'Shoulder'),
    common: t('غالباً من البنش والضغط فوق الرأس بوزن أو تكنيك غير مناسب.', 'Often from bench and overhead pressing with too much load or poor technique.'),
    selfCare: [
      t('خفف البنش والضغط فوق الرأس، وجرّب قبضة أضيق ومدى أقل بدون ألم.', 'Ease off bench and overhead pressing; try a narrower grip and a pain-free range.'),
      t('تمارين الدوران الخارجي والفيس بول بوزن خفيف تقوّي الكتف.', 'Light external rotations and face pulls strengthen the shoulder.'),
    ],
    redFlags: [
      t('ما تقدر ترفع يدك', 'You can\'t lift your arm'),
      t('ألم بالليل يصحّيك', 'Night pain that wakes you'),
      t('ألم بعد سقطة أو صوت طق', 'Pain after a fall or a pop'),
    ],
  },
  {
    area: 'knee', icon: 'walk-outline', name: t('الركبة', 'Knee'),
    common: t('ألم قدام الركبة شائع مع السكوات والاندفاع والجري الكثير.', 'Front-of-knee pain is common with squats, lunges and lots of running.'),
    selfCare: [
      t('خفف العمق والوزن مؤقتاً، وقوّي الفخذ والأرداف.', 'Temporarily reduce depth and load, and strengthen quads and glutes.'),
      t('زد الجري والقفز بالتدريج، مو فجأة.', 'Build running and jumping volume gradually, not suddenly.'),
    ],
    redFlags: [
      t('تورم سريع بعد إصابة', 'Rapid swelling after an injury'),
      t('صوت طق مع إحساس إن الركبة تخونك', 'A pop with the knee giving way'),
      t('الركبة تقفل أو ما تنفرد', 'The knee locks or won\'t straighten'),
    ],
  },
  {
    area: 'neck', icon: 'person-outline', name: t('الرقبة', 'Neck'),
    common: t('شد عضلي من الشرق أو وضعية الجوال والمكتب.', 'Muscle tension from shrugs or phone and desk posture.'),
    selfCare: [
      t('إطالة جانبية هادئة للرقبة وحركة خفيفة.', 'Gentle side-neck stretches and light movement.'),
      t('خذ فواصل من الجوال والمكتب.', 'Take breaks from the phone and desk.'),
    ],
    redFlags: [t('تنميل أو ضعف باليد', 'Numbness or weakness in the arm')],
    urgent: t('صداع قوي مفاجئ أو دوخة شديدة: طوارئ فوراً.', 'A sudden severe headache or severe dizziness: emergency room now.'),
  },
  {
    area: 'upperBack', icon: 'body-outline', name: t('بين الكتفين وأعلى الظهر', 'Upper back'),
    common: t('شد عضلي من تمارين السحب أو الجلوس الطويل.', 'Muscle tightness from pulling work or long sitting.'),
    selfCare: [t('فوم رولر لأعلى الظهر وإطالة الظهر العلوي.', 'Foam-roll the upper back and stretch it.'), t('ركّز على إبعاد الكتفين عن الأذن وقت السحب.', 'Keep shoulders down away from the ears when pulling.')],
    redFlags: [t('ألم مع ضيق نفس أو ألم بالصدر', 'Pain with shortness of breath or chest pain')],
    urgent: t('ألم بالصدر أو ضيق نفس: طوارئ فوراً (٩٩٧).', 'Chest pain or shortness of breath: emergency now (997).'),
  },
  {
    area: 'elbow', icon: 'hand-left-outline', name: t('الكوع', 'Elbow'),
    common: t('من القبضة القوية وتمارين السحب والباي والتراي الكثيرة.', 'From heavy gripping and lots of pulling, biceps and triceps work.'),
    selfCare: [t('خفف تمارين الذراع والسحب وغيّر القبضة.', 'Reduce arm and pulling volume and change your grip.'), t('ارجع بالتدريج بأوزان خفيفة وحركة بطيئة.', 'Return gradually with light weights and slow reps.')],
    redFlags: [t('ضعف واضح أو تشوّه بالعضلة بعد صوت طق', 'Obvious weakness or a changed muscle shape after a pop')],
  },
  {
    area: 'wrist', icon: 'hand-right-outline', name: t('المعصم', 'Wrist'),
    common: t('من ثني المعصم للخلف في البنش والضغط.', 'From the wrist bending back during bench and pressing.'),
    selfCare: [t('خل المعصم مستقيم فوق الساعد، واستخدم لفافات المعصم.', 'Stack the wrist straight over the forearm and use wrist wraps.')],
    redFlags: [t('ألم بعد سقطة على اليد', 'Pain after falling on your hand'), t('تنميل بالأصابع', 'Numbness in the fingers')],
  },
  {
    area: 'hip', icon: 'accessibility-outline', name: t('الورك', 'Hip'),
    common: t('ضيق مقدمة الورك من الجلوس الطويل أو السكوات العميق.', 'Tight front of the hip from long sitting or deep squats.'),
    selfCare: [t('إطالة مقدمة الورك والأرداف.', 'Stretch the hip flexors and glutes.'), t('قوّي الأرداف بتمارين الجسر وهيب ثرست.', 'Strengthen glutes with bridges and hip thrusts.')],
    redFlags: [t('ألم بالفخذ الداخلي أو الورك يمنعك تمشي', 'Groin or hip pain that stops you walking')],
  },
  {
    area: 'ankle', icon: 'footsteps-outline', name: t('الكاحل', 'Ankle'),
    common: t('التواء من الجري أو القفز أو الرياضات الجماعية.', 'A sprain from running, jumping or team sports.'),
    selfCare: [t('ثلج ملفوف ورفع الرجل أول يومين.', 'Wrapped ice and elevation for the first two days.'), t('بعدها حركة وتمارين توازن بالتدريج.', 'Then gradual movement and balance work.')],
    redFlags: [t('ما تقدر تمشي ٤ خطوات', 'You can\'t take four steps'), t('ألم لما تضغط على العظم', 'Pain when pressing on the bone')],
  },
];

export const recoveryTopic = (id: string) => RECOVERY_TOPICS.find((x) => x.id === id) ?? null;
