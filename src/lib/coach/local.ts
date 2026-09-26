// المدرب المحلي: يفهم الطلبات الشائعة بالعربي والإنجليزي ويبني تمريناً من مكتبة التمارين ثلاثية الأبعاد.
// يُستخدم عندما لا يتوفر الذكاء الاصطناعي (بدون إنترنت، أو قبل إعداد المفتاح)، وهو قابل للاختبار.
import { EXERCISES, findExercise } from '../../three/catalog';
import { MOTIONS } from '../../three/motions';
import type { Muscle } from '../../three/rig';
import type { CoachContext, CoachReply, CoachRoute, CoachWorkout } from './types';

type Group = 'chest' | 'back' | 'legs' | 'glutes' | 'shoulders' | 'arms' | 'core';

const GROUP_MUSCLES: Record<Group, Muscle[]> = {
  chest: ['chest'], back: ['lats', 'upperBack'], legs: ['quads', 'hamstrings', 'calves'], glutes: ['glutes'],
  shoulders: ['shoulders', 'rearDelts'], arms: ['biceps', 'triceps'], core: ['abs'],
};
const GROUP_WORDS: Record<Group, RegExp> = {
  chest: /صدر|بنش|chest|bench|pecs?/i,
  back: /ظهر|سحب|مجنص|back|lats?|pull/i,
  legs: /رجل|ارجل|أرجل|فخذ|سكوات|ساق|leg|quad|hamstring|squat|lower body/i,
  glutes: /مؤخر|ارداف|أرداف|قلوت|glute|butt|hip thrust/i,
  shoulders: /كتف|اكتاف|أكتاف|shoulder|delt/i,
  arms: /ذراع|يد|باي|تراي|arm|bicep|tricep/i,
  core: /بطن|كور|خصر|abs?\b|core|six ?pack|plank/i,
};
const GROUP_NAME: Record<Group, [string, string]> = {
  chest: ['صدر', 'Chest'], back: ['ظهر', 'Back'], legs: ['أرجل', 'Legs'], glutes: ['أرداف', 'Glutes'],
  shoulders: ['أكتاف', 'Shoulders'], arms: ['ذراعين', 'Arms'], core: ['بطن', 'Core'],
};

// أدوات منزلية: بدون أدوات = حصيرة فقط؛ بالدمبل = دمبلات (والكرسي/الكنبة بدل البنش)
const NO_EQUIP = new Set(['split_squat', 'glute_bridge', 'plank', 'walking_lunge', 'bulgarian_split_squat', 'calf_raise']);
const DUMBBELL_KINDS = new Set(['dumbbells', 'goblet', 'hammerDumbbells', 'dumbbellR', 'mat', 'bench', 'benchBehind', 'benchSideRow', 'inclineBench', 'seatBack']);

const ROUTES: [RegExp, CoachRoute][] = [
  [/نوم|نمت|جاهزي|نبض|hrv|خطوات|خطواتي|ساعت?ي? .*بيانات|sleep|recovery|readiness|steps|strain/i, 'health'],
  [/in ?body|انبدي|إنبدي|تكوين الجسم|body composition/i, 'inbody'],
  [/اربط.*(ساعة|جوال)|ساعة|ساعتي|watch|apple health|health connect/i, 'devices'],
  [/تحدي|تحدى|challenge/i, 'challenge_new'],
  [/ترتيب|منافس|صدارة|leaderboard|rank/i, 'compete'],
  [/وزني|تقدمي|تقدّمي|progress|weight log/i, 'progress'],
  [/اصدقاء|أصدقاء|صديق|friend/i, 'friends'],
  [/خطتي|الخطة|جدولي|my plan|schedule/i, 'plan'],
];

// أسماء التمارين الشائعة بالعامية
const AR_EXERCISES: [RegExp, string][] = [
  [/ترابيس|تربيس|شراقز|شرق/, 'upright_row'], [/سكوات|قرفصاء/, 'back_squat'], [/ديدلفت|ديد لفت|رفعة ميتة|الرفعة المميتة/, 'deadlift'], [/رومان|rdl/i, 'rdl_bb'],
  [/بنش/, 'bench_bb'], [/ضغط (ال)?كتف|ضغط علوي/, 'ohp_standing'], [/عقلة|عقله/, 'pullup'], [/سحب (امامي|أمامي|علوي)|لات/, 'lat_pulldown'],
  [/تجديف/, 'row_bb'], [/بلانك|لوح/, 'plank'], [/هيب ?ثرست|دفع (ال)?حوض/, 'hip_thrust_bb'], [/جسر/, 'glute_bridge'],
  [/لنج|طعن/, 'walking_lunge'], [/بلغاري/, 'bulgarian_split_squat'], [/رفرف|جانبي/, 'lateral_raise'], [/هامر|مطرقة/, 'curl_hammer'],
  [/باي|بايسبس/, 'curl_db'], [/تراي|ترايسبس/, 'triceps_pushdown'], [/ديبس|متوازي/, 'dips'], [/سمانة|بطات|كالف/, 'calf_raise'],
  [/ليق ?برس|دفع (ال)?(ارجل|أرجل)/, 'leg_press'], [/هاك/, 'hack_squat'], [/تفتيح|فلاي/, 'pec_deck'], [/عجلة|ويل/, 'ab_wheel'],
];
function findAny(text: string) {
  for (const [re, id] of AR_EXERCISES) if (re.test(text)) return findExercise(id);
  return findExercise(text.replace(/كيف|أسوي|اسوي|شرح|اشرح|طريقة|صح|تمرين|how to|how do i|explain|properly|form|technique|do a|\?|؟/gi, ' ').trim()) ?? findExercise(text);
}

const L = (ctx: CoachContext, ar: string, en: string) => (ctx.lang === 'en' ? en : ar);

function repsFor(ctx: CoachContext, compound: boolean): { reps: string; rest: number } {
  if (ctx.goal === 'gain') return compound ? { reps: '6-10', rest: 120 } : { reps: '8-12', rest: 75 };
  if (ctx.goal === 'lose') return compound ? { reps: '10-12', rest: 75 } : { reps: '12-15', rest: 45 };
  return compound ? { reps: '8-12', rest: 90 } : { reps: '10-15', rest: 60 };
}

function pick(groups: Group[], count: number, equip: 'gym' | 'dumbbells' | 'none', seed: number) {
  const ok = (id: string) => {
    if (equip === 'none') return NO_EQUIP.has(id);
    if (equip === 'dumbbells') return NO_EQUIP.has(id) || MOTIONS[id as keyof typeof MOTIONS].props.every((p) => DUMBBELL_KINDS.has(p.kind));
    return true;
  };
  // لكل مجموعة: تمارين عضلتها الأساسية ضمن المطلوب، والمركّبة (أكثر من عضلة أساسية) أولاً
  const perGroup = groups.map((g) => EXERCISES
    .filter((e) => ok(e.id) && MOTIONS[e.motion].primary.some((m) => GROUP_MUSCLES[g].includes(m)))
    .sort((a, b) => MOTIONS[b.motion].primary.length - MOTIONS[a.motion].primary.length));
  const out: string[] = [];
  for (let round = 0; out.length < count && round < 8; round++) {
    for (let gi = 0; gi < perGroup.length && out.length < count; gi++) {
      const list = perGroup[gi].filter((e) => !out.includes(e.id));
      if (!list.length) continue;
      // تنويع بسيط حسب اليوم مع إبقاء المركّب أولاً في الجولة الأولى
      const idx = round === 0 ? 0 : (seed + round + gi) % list.length;
      out.push(list[idx].id);
    }
  }
  // لو المطلوب قليل (مثلاً بدون أدوات) نكمّل من أي مجموعة متاحة
  if (out.length < Math.min(3, count)) {
    for (const e of EXERCISES) if (out.length < 3 && ok(e.id) && !out.includes(e.id)) out.push(e.id);
  }
  return out;
}

export function buildWorkout(ctx: CoachContext, groups: Group[], minutes: number, equip: 'gym' | 'dumbbells' | 'none', seed = new Date().getDate()): CoachWorkout {
  const count = Math.max(3, Math.min(8, Math.round(minutes / 7)));
  const ids = pick(groups, count, equip, seed);
  const red = ctx.zone === 'red';
  const exercises = ids.map((id, i) => {
    const compound = MOTIONS[id as keyof typeof MOTIONS].primary.length > 1 || i === 0;
    const r = repsFor(ctx, compound);
    const isHold = id === 'plank';
    return {
      exercise_id: id,
      sets: red ? 2 : ctx.level === 'beginner' ? 3 : i < 2 ? 4 : 3,
      reps: isHold ? (ctx.lang === 'en' ? '30-45 s' : '30-45 ث') : r.reps,
      rest_sec: isHold ? 45 : r.rest,
    };
  });
  // الاسم من العضلات اللي فعلاً في التمرين (مو من الطلب فقط)
  const covered = groups.filter((g) => ids.some((id) => MOTIONS[id as keyof typeof MOTIONS].primary.some((m) => GROUP_MUSCLES[g].includes(m))));
  const names = covered.length >= 3 ? [L(ctx, 'كامل الجسم', 'Full body')] : (covered.length ? covered : groups).map((g) => GROUP_NAME[g][ctx.lang === 'en' ? 1 : 0]);
  const where = equip === 'none' ? L(ctx, ' بالبيت', ' at home') : equip === 'dumbbells' ? L(ctx, ' بالدمبل', ' with dumbbells') : '';
  return {
    title: L(ctx, `تمرين ${names.join(' + ')}${where}`, `${names.join(' + ')} workout${where}`),
    minutes,
    exercises,
    note: red
      ? L(ctx, 'جاهزيتك اليوم منخفضة، فخفّفت المجموعات. خلّ الشدة مريحة (تقدر تسوي ٢-٣ عدات زيادة).', 'Your recovery is low today, so I trimmed the sets. Keep it comfortable (2–3 reps in reserve).')
      : equip === 'none'
        ? L(ctx, 'ما يحتاج أدوات: حصيرة وكرسي أو كنبة للبلغاري.', 'No equipment needed: a mat, and a chair or sofa for the Bulgarian split squat.')
        : undefined,
  };
}

const CHIPS_AR = ['تمرين صدر ٣٠ دقيقة', 'تمرين بالبيت بدون أدوات', 'وش أتمرن اليوم حسب جاهزيتي؟', 'كيف أسوي سكوات صح؟', 'وجبة بعد التمرين'];
const CHIPS_EN = ['30-min chest workout', 'Home workout, no equipment', 'What should I train today?', 'How do I squat properly?', 'Post-workout meal'];
export const starterChips = (lang: 'ar' | 'en') => (lang === 'en' ? CHIPS_EN : CHIPS_AR);

// تحويل الأرقام العربية الهندية إلى لاتينية
const digits = (s: string) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

export function localCoach(message: string, ctx: CoachContext): CoachReply {
  const m = digits(message.trim());
  const low = m.toLowerCase();
  const chips = starterChips(ctx.lang);

  // 1) شرح تمرين محدد: "كيف أسوي …" / "شرح …" / "how to …"
  if (/كيف|شرح|اشرح|طريقة|how|explain|form|technique/i.test(low)) {
    const ex = findAny(m);
    if (ex) {
      return {
        text: L(ctx, `هذا شرح **${ex.name.ar}** بالمجسّم ثلاثي الأبعاد، مع العضلات العاملة والأخطاء الشائعة.`, `Here's **${ex.name.en}** in 3D, with the muscles worked and common mistakes.`),
        open: { kind: 'exercise', id: ex.id }, source: 'local',
      };
    }
  }

  // 2) الأكل
  if (/وجب|اكل|أكل|غدا|عشا|فطور|بروتين|سعرات|meal|food|eat|protein|calorie|snack/i.test(low)) {
    const p = ctx.protein_g ? Math.round(ctx.protein_g / 4) : 30;
    return {
      text: L(ctx,
        `بعد التمرين خلال ساعتين: بروتين تقريباً **${p} جم** + كارب.\nأمثلة:\n• ٢ بيض + ٣ بياض مع خبز بر وخيار\n• صدر دجاج ١٥٠ جم مع رز وسلطة\n• زبادي يوناني + موز + ملعقة شوفان\n${ctx.calories ? `هدفك اليومي ${ctx.calories} سعرة — التفاصيل في خطتك.` : ''}`,
        `Within ~2 hours after training: about **${p} g protein** + carbs.\nIdeas:\n• 2 eggs + 3 whites with wholegrain bread\n• 150 g chicken breast with rice and salad\n• Greek yogurt + banana + a spoon of oats\n${ctx.calories ? `Your daily target is ${ctx.calories} kcal — see your plan for details.` : ''}`),
      open: { kind: 'screen', route: 'plan' }, chips, source: 'local',
    };
  }

  // 3) طلب تمرين: عضلة/مدة/مكان
  const groups = (Object.keys(GROUP_WORDS) as Group[]).filter((g) => GROUP_WORDS[g].test(low));
  const wantsWorkout = groups.length > 0 || /تمرين|تمارين|جلسة|روتين|workout|session|routine|train|full ?body|كامل/i.test(low);
  const todayQ = /اليوم|جاهزي|وش أتمرن|وش اتمرن|ماذا أتمرن|today|what should i train/i.test(low);
  if (todayQ && ctx.today && !groups.length) {
    if (ctx.today.rest) {
      return { text: L(ctx, 'اليوم راحة في خطتك 😌 امشِ ٢٠–٣٠ دقيقة وتمدد، وارجع بكرة بطاقة.', 'Today is a rest day in your plan 😌 Take a 20–30 min walk and stretch.'), chips, source: 'local' };
    }
    const zoneLine = ctx.zone === 'red' ? L(ctx, 'جاهزيتك منخفضة، فخففت الحجم.', 'Recovery is low, so I trimmed the volume.')
      : ctx.zone === 'yellow' ? L(ctx, 'جاهزيتك متوسطة: حافظ على الأوزان وخفّف الحجم.', 'Moderate recovery: keep the weights, trim the volume.')
        : ctx.zone === 'green' ? L(ctx, 'جاهزيتك عالية — اضغط اليوم 💪', 'High recovery — push it today 💪') : '';
    const items = ctx.today.exercises.map((e, i) => {
      const id = (e.exercise_id && findExercise(e.exercise_id)?.id) || findExercise(e.name)?.id;
      return id ? { exercise_id: id, sets: ctx.zone === 'red' ? Math.max(2, Math.round(e.sets * 0.66)) : ctx.zone === 'yellow' && i >= 2 ? Math.max(2, e.sets - 1) : e.sets, reps: e.reps, rest_sec: 90 } : null;
    }).filter((x): x is NonNullable<typeof x> => !!x);
    return {
      text: L(ctx, `تمرين اليوم من خطتك: **${ctx.today.focus}**. ${zoneLine}`, `Today's session from your plan: **${ctx.today.focus}**. ${zoneLine}`),
      workout: { title: ctx.today.focus, minutes: items.length * 8, exercises: items },
      source: 'local',
    };
  }
  if (wantsWorkout) {
    const mins = Number(/(\d{2,3})\s*(د|دق|دقيقة|دقائق|min|minutes?)/i.exec(m)?.[1] ?? 40);
    const equip = /بدون (ادوات|أدوات|معدات)|بيت|البيت|منزل|no equipment|bodyweight|at home|home/i.test(low)
      ? (/دمبل|dumbbell/i.test(low) ? 'dumbbells' : 'none')
      : /دمبل|dumbbell/i.test(low) ? 'dumbbells' : 'gym';
    const g: Group[] = groups.length ? groups
      : /كامل|full ?body|جسم/i.test(low) || equip === 'none' ? ['legs', 'chest', 'back', 'core']
        : ['legs', 'chest', 'back'];
    const w = buildWorkout(ctx, g, Math.max(15, Math.min(90, mins)), equip);
    return {
      text: L(ctx, `جهّزت لك **${w.title}** (${w.minutes} دقيقة تقريباً). اضغط أي تمرين تشوفه 3D.`, `Here's your **${w.title}** (~${w.minutes} min). Tap any exercise to watch it in 3D.`),
      workout: w, source: 'local',
    };
  }

  // 4) فتح صفحة
  for (const [re, route] of ROUTES) {
    if (re.test(low)) {
      return { text: L(ctx, 'تفضل 👇', 'Here you go 👇'), open: { kind: 'screen', route }, chips, source: 'local' };
    }
  }

  return {
    text: L(ctx,
      'أقدر أجهز لك تمرين حسب العضلة والوقت والمكان، أشرح لك أي تمرين بالمجسّم، أقترح وجبات، أو أفتح لك نومك وجاهزيتك. جرّب:',
      'I can build a workout by muscle, time and place, explain any exercise in 3D, suggest meals, or open your sleep and recovery. Try:'),
    chips, source: 'local',
  };
}
