// شرح مفصّل لكل عضلة: الاسم التشريحي، المكان، الوظيفة، ونصيحة للإحساس بها أثناء التمرين
import type { I18nText } from '../lib/types';
import type { Muscle } from './rig';

const t = (ar: string, en: string): I18nText => ({ ar, en });

export interface MuscleInfo {
  latin: string;
  location: I18nText;
  function: I18nText;
  feel: I18nText;
}

export const ANATOMY: Record<Muscle, MuscleInfo> = {
  chest: {
    latin: 'Pectoralis major & minor',
    location: t('عضلة مروحية تغطي مقدمة القفص الصدري، تبدأ من عظمة القص والترقوة وتنتهي في أعلى عظمة العضد.', 'A fan-shaped muscle over the front of the rib cage, running from the sternum and collarbone to the top of the upper-arm bone.'),
    function: t('تقرّب الذراع نحو منتصف الجسم وتدفعه للأمام، وتلف العضد للداخل. الجزء العلوي (الترقوي) يعمل أكثر في الضغط المائل.', 'Brings the arm across the body and pushes it forward, and rotates the upper arm inward. The upper (clavicular) head works more on incline presses.'),
    feel: t('اضغط لوحي الكتف للخلف وللأسفل وتخيّل أنك تقرّب كوعيك من بعض بدل ما "تدفع" الوزن.', 'Pin your shoulder blades back and down and think of squeezing your elbows together rather than just pushing the weight.'),
  },
  shoulders: {
    latin: 'Deltoideus (anterior & lateral)',
    location: t('العضلة المستديرة فوق مفصل الكتف، لها ثلاث رؤوس: أمامي وجانبي وخلفي.', 'The rounded cap over the shoulder joint, with three heads: front, side and rear.'),
    function: t('الرأس الأمامي يرفع الذراع للأمام، والجانبي يبعده للجانب — وهو اللي يعطي الكتف عرضه.', 'The front head raises the arm forward; the side head lifts it out to the side — it is what gives the shoulders width.'),
    feel: t('في الرفرفة الجانبية قُد الحركة بالكوع لا باليد، ووقّف عند مستوى الكتف.', 'On lateral raises lead with the elbow, not the hand, and stop at shoulder height.'),
  },
  rearDelts: {
    latin: 'Deltoideus (posterior)',
    location: t('الرأس الخلفي لعضلة الكتف، على ظهر مفصل الكتف.', 'The rear head of the deltoid, on the back of the shoulder joint.'),
    function: t('يسحب الذراع للخلف ويلفه للخارج؛ يوازن قوة الصدر ويحسّن وقفة الكتفين.', 'Pulls the arm back and rotates it outward; balances the chest and improves shoulder posture.'),
    feel: t('استخدم وزن خفيف، وافتح الذراعين للجانب كأنك ترسم قوس بدون ما تعصر لوحي الكتف بقوة.', 'Go light and sweep the arms out in a wide arc without over-squeezing the shoulder blades.'),
  },
  triceps: {
    latin: 'Triceps brachii',
    location: t('خلف العضد، بثلاث رؤوس (طويل وجانبي وإنسي) وتشكّل ثلثي حجم الذراع.', 'Back of the upper arm, with three heads (long, lateral, medial) — about two-thirds of arm size.'),
    function: t('تمد الكوع (تفرد الذراع). الرأس الطويل يمر فوق الكتف لذلك يشتغل أكثر عندما تكون الذراع فوق الرأس.', 'Straightens the elbow. The long head crosses the shoulder, so it works hardest with the arm overhead.'),
    feel: t('ثبّت الكوع في مكانه واقفل الذراع تماماً في النهاية مع عصر لمدة ثانية.', 'Keep the elbow fixed and fully lock out with a one-second squeeze.'),
  },
  biceps: {
    latin: 'Biceps brachii & brachialis',
    location: t('مقدمة العضد، برأسين (طويل وقصير)، وتحتها عضلة العضدية.', 'Front of the upper arm, two heads (long and short), with the brachialis underneath.'),
    function: t('تثني الكوع وتلف الساعد بحيث يتجه الكف للأعلى.', 'Bends the elbow and turns the forearm palm-up.'),
    feel: t('لا تهز الجسم؛ لف الكف للخارج في أعلى الحركة وانزل ببطء (ثانيتين إلى ثلاث).', 'No swinging; turn the pinky up at the top and lower slowly (2–3 seconds).'),
  },
  forearms: {
    latin: 'Brachioradialis & wrist flexors/extensors',
    location: t('عضلات الساعد بين الكوع والرسغ.', 'The muscles between the elbow and the wrist.'),
    function: t('مسؤولة عن قوة القبضة وثني الرسغ والكوع (خاصة بقبضة المطرقة).', 'Grip strength and bending the wrist and elbow (especially with a hammer grip).'),
    feel: t('اقبض على المقبض بقوة طوال المجموعة، وأبقِ الرسغ مستقيماً.', 'Squeeze the handle hard for the whole set and keep the wrist straight.'),
  },
  abs: {
    latin: 'Rectus abdominis & obliques',
    location: t('مقدمة البطن (عضلة "السكس باك") والعضلات المائلة على الجانبين.', 'Front of the abdomen (the "six-pack") and the obliques on the sides.'),
    function: t('تثني الجذع، وتثبّت العمود الفقري ضد الانحناء والالتفاف أثناء الرفعات.', 'Flexes the trunk and braces the spine against bending and twisting during lifts.'),
    feel: t('قرّب الأضلاع من الحوض واخرج النفس بالكامل في لحظة الانقباض.', 'Bring your ribs toward your pelvis and exhale fully at the squeeze.'),
  },
  upperBack: {
    latin: 'Trapezius & rhomboids',
    location: t('بين لوحي الكتف ومن الرقبة إلى منتصف الظهر.', 'Between the shoulder blades, from the neck to mid-back.'),
    function: t('تقرّب لوحي الكتف من بعض وترفعهما وتنزلهما؛ أساس الوقفة المستقيمة.', 'Squeezes the shoulder blades together and lifts/lowers them; key for upright posture.'),
    feel: t('ابدأ كل سحبة بتقريب لوحي الكتف قبل ثني الكوع.', 'Start every pull by drawing the shoulder blades together before bending the elbows.'),
  },
  lats: {
    latin: 'Latissimus dorsi',
    location: t('أعرض عضلة في الظهر، من أسفل الظهر والحوض حتى أعلى العضد تحت الإبط.', 'The widest back muscle, from the lower back and pelvis up to the upper arm under the armpit.'),
    function: t('تسحب الذراع للأسفل وللخلف نحو الجسم؛ تعطي شكل V للظهر.', 'Pulls the arm down and back toward the body; creates the V-taper.'),
    feel: t('تخيّل أنك تسحب بكوعيك نحو جيوبك الخلفية، لا بيديك.', 'Think of driving your elbows into your back pockets, not pulling with your hands.'),
  },
  lowerBack: {
    latin: 'Erector spinae',
    location: t('عمودان من العضلات على جانبي العمود الفقري من الحوض حتى الرقبة.', 'Two columns of muscle alongside the spine from pelvis to neck.'),
    function: t('تمد الظهر وتحافظ عليه مستقيماً تحت الحمل (مثل الرفعة المميتة).', 'Extends the back and keeps it neutral under load (e.g. deadlifts).'),
    feel: t('حافظ على ظهر محايد: الصدر مرفوع والنظر للأمام قليلاً للأسفل.', 'Keep a neutral spine: chest proud, gaze slightly down and forward.'),
  },
  glutes: {
    latin: 'Gluteus maximus & medius',
    location: t('عضلات الأرداف خلف الحوض؛ الكبرى أقوى عضلة في الجسم.', 'The buttock muscles behind the pelvis; the maximus is the strongest muscle in the body.'),
    function: t('تمد مفصل الورك (تدفع الحوض للأمام) وتثبّت الركبة والحوض أثناء المشي والجري.', 'Extends the hip (drives it forward) and stabilises the pelvis and knee while walking and running.'),
    feel: t('في الأعلى اعصر الأرداف وادفع الحوض للأمام بدون تقويس أسفل الظهر.', 'At the top squeeze the glutes and drive the hips through without arching the lower back.'),
  },
  quads: {
    latin: 'Quadriceps femoris',
    location: t('أربع عضلات في مقدمة الفخذ تنتهي بوتر فوق الركبة.', 'Four muscles on the front of the thigh ending in a tendon over the kneecap.'),
    function: t('تمد الركبة؛ الأساس في السكوات والطلوع والقفز.', 'Straightens the knee; the engine of squats, stairs and jumps.'),
    feel: t('خلّ الركبة تمشي باتجاه أصابع القدم وادفع بكامل القدم.', 'Let the knees travel over the toes and push through the whole foot.'),
  },
  hamstrings: {
    latin: 'Biceps femoris, semitendinosus, semimembranosus',
    location: t('ثلاث عضلات خلف الفخذ من عظمة الجلوس حتى أسفل الركبة.', 'Three muscles on the back of the thigh, from the sitting bone to below the knee.'),
    function: t('تثني الركبة وتمد الورك؛ مهمة للجري ولحماية الركبة.', 'Bends the knee and extends the hip; important for sprinting and knee health.'),
    feel: t('في تمارين الانحناء ادفع الحوض للخلف حتى تحس بشد خلف الفخذ، ثم ارجع.', 'On hinges push the hips back until you feel a stretch behind the thigh, then return.'),
  },
  calves: {
    latin: 'Gastrocnemius & soleus',
    location: t('خلف الساق بين الركبة والكعب، وتنتهي بوتر أخيل.', 'Back of the lower leg between knee and heel, ending in the Achilles tendon.'),
    function: t('ترفع الكعب (الوقوف على الأصابع) وتدفعك للأمام في المشي والجري.', 'Raises the heel (going onto the toes) and propels you when walking and running.'),
    feel: t('انزل للآخر حتى تحس بالتمدد، واثبت ثانية في الأعلى.', 'Drop into a full stretch at the bottom and pause for a second at the top.'),
  },
};
