#!/usr/bin/env python3
"""يبني مكتبة التمارين الموسّعة من Free Exercise DB (ملكية عامة، Unlicense) + الترجمة العربية.
الاستخدام: python3 tools/build-exercise-library.py <مجلد free-exercise-db> <مجلد الترجمة ar_*.json> <catalog.json>
الناتج: src/three/fedb.json (بيانات مضغوطة) — الصور تُرفع لحاوية exercises بنفس المسار <id>/<n>.jpg
"""
import glob, json, math, re, sys

src, ar_dir, cat_path = sys.argv[1:4]
fed = json.load(open(f'{src}/dist/exercises.json'))
cat = json.load(open(cat_path))
ar = {}
for f in sorted(glob.glob(f'{ar_dir}/ar_*.json')):
    ar.update(json.load(open(f)))

norm = lambda s: re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip()
curated = {}
for e in cat:
    curated.setdefault(norm(e['en']), e['id'])
    for a in e['aliases']:
        curated.setdefault(norm(a), e['id'])

MUSCLE = {'abdominals': 'abs', 'abductors': 'glutes', 'adductors': 'quads', 'biceps': 'biceps', 'calves': 'calves', 'chest': 'chest',
          'forearms': 'forearms', 'glutes': 'glutes', 'hamstrings': 'hamstrings', 'lats': 'lats', 'lower back': 'lowerBack',
          'middle back': 'upperBack', 'neck': 'upperBack', 'quadriceps': 'quads', 'shoulders': 'shoulders', 'traps': 'upperBack', 'triceps': 'triceps'}
EQUIP = {'barbell': 'barbell', 'dumbbell': 'dumbbell', 'cable': 'cable', 'machine': 'machine', 'kettlebells': 'kettlebell', 'bands': 'bands',
         'medicine ball': 'medicine_ball', 'exercise ball': 'exercise_ball', 'foam roll': 'foam_roll', 'e-z curl bar': 'ez_bar',
         'body only': 'bodyweight', 'other': 'other', None: 'bodyweight'}
CAT = {'strength': 'strength', 'stretching': 'stretching', 'plyometrics': 'plyometrics', 'powerlifting': 'powerlifting',
       'olympic weightlifting': 'olympic', 'strongman': 'strongman', 'cardio': 'cardio'}
LEVEL = {'beginner': 0, 'intermediate': 1, 'expert': 2}
BOIL = re.compile(r'^(repeat( for| the)?.*(recommended|desired|prescribed).*|repeat\.?|switch (arms|legs|sides)( and repeat.*)?\.?)$', re.I)
# خمس تمارين بدون شرح في المصدر: شرح إنجليزي مختصر مطابق للعربي
EN_FIX = {
    'Iron_Cross': ['Stand with a dumbbell in each hand at your sides, feet shoulder width apart.', 'Squat down and raise the dumbbells in front to shoulder height, then open them out to the sides like a cross as you stand.', 'Lower the dumbbells slowly and repeat. Use a light weight.'],
    'One-Arm_Kettlebell_Swings': ['Stand with the kettlebell in front of you, hinge at the hips and grab it with one hand, back flat.', 'Swing it back between your legs, then drive your hips forward hard until it rises to chest height.', 'Let it swing back between your legs and repeat; the power comes from the hips, not the arm.'],
    'Push_Press': ['Hold the bar on the front of your shoulders, feet under your hips.', 'Dip slightly at the knees, then drive up hard and use that momentum to press the bar overhead.', 'Lower the bar back to your shoulders under control.'],
    'Side_Bridge': ['Lie on your side and prop yourself up on your forearm, elbow under the shoulder.', 'Lift your hips so your body forms a straight line from head to feet.', 'Hold, then switch sides.'],
    'Side_Jackknife': ['Lie on your side with legs stacked and your top hand behind your head.', 'Raise your legs and upper body together, squeezing your obliques.', 'Lower slowly, then switch sides after your reps.'],
}

def group(steps, n):
    """يقسم خطوات الإنجليزي على عدد خطوات العربي بالترتيب"""
    if not steps:
        return [''] * n
    if len(steps) <= n:
        return steps + [''] * (n - len(steps))
    size = len(steps) / n
    out = []
    for k in range(n):
        a, b = round(k * size), round((k + 1) * size)
        out.append(' '.join(steps[a:b]))
    return out

def muscles(lst, exclude=()):
    out = []
    for m in lst:
        x = MUSCLE.get(m)
        if x and x not in out and x not in exclude:
            out.append(x)
    return out

# تطابقات مؤكدة يدوياً بين تمارين أرك الحالية وتمارين المصدر (نفس الحركة بالضبط): تاخذ الصور ولا تتكرر
SAME = {
    'Barbell_Squat': 'back_squat', 'Leg_Extensions': 'leg_extension', 'Lying_Leg_Curls': 'leg_curl_lying', 'Barbell_Deadlift': 'deadlift',
    'Butt_Lift_Bridge': 'glute_bridge', 'Standing_Calf_Raises': 'calf_raise', 'Barbell_Bench_Press_-_Medium_Grip': 'bench_bb',
    'Machine_Bench_Press': 'chest_press_machine', 'Cable_Crossover': 'cable_fly', 'Parallel_Bar_Dip': 'dips',
    'Standing_Military_Press': 'ohp_standing', 'Dumbbell_Shoulder_Press': 'shoulder_press_db_seated',
    'Machine_Shoulder_Military_Press': 'shoulder_press_machine', 'Side_Lateral_Raise': 'lateral_raise',
    'Wide-Grip_Lat_Pulldown': 'lat_pulldown', 'Close-Grip_Front_Lat_Pulldown': 'lat_pulldown_close', 'Seated_Cable_Rows': 'row_cable_seated',
    'Bent_Over_Barbell_Row': 'row_bb', 'Dumbbell_Bicep_Curl': 'curl_db', 'Hammer_Curls': 'curl_hammer',
    'Standing_Dumbbell_Triceps_Extension': 'triceps_overhead_db', 'Front_Barbell_Squat': 'front_squat', 'Plie_Dumbbell_Squat': 'sumo_squat',
    'Dumbbell_Step_Ups': 'step_up', 'Thigh_Abductor': 'hip_abduction', 'Barbell_Incline_Bench_Press_-_Medium_Grip': 'incline_bench_bb',
    'Close-Grip_Barbell_Bench_Press': 'close_grip_bench', 'Incline_Dumbbell_Flyes': 'incline_db_fly',
    'Bent_Over_Two-Arm_Long_Bar_Row': 't_bar_row', 'EZ-Bar_Skullcrusher': 'skull_crusher', 'Tricep_Dumbbell_Kickback': 'triceps_kickback',
    'Ab_Roller': 'ab_wheel', 'Pullups': 'pullup', 'Chin-Up': 'chin_up',
}
items, photos_for_curated = [], {}
for f in fed:
    imgs = len(f.get('images') or [])
    cid = SAME.get(f['id']) or curated.get(norm(f['name']))
    if cid:
        if imgs and (cid not in photos_for_curated or f['id'] in SAME):
            photos_for_curated[cid] = [f['id'], imgs]
        continue
    a = ar[f['id']]
    en = [s.strip().replace('\n', ' ') for s in (EN_FIX.get(f['id']) or f['instructions']) if s.strip() and not BOIL.match(s.strip())]
    en = [re.sub(r'\s*li>\s*$', '', s) for s in en]
    p = muscles(f['primaryMuscles'])
    s = muscles(f['secondaryMuscles'], p)
    items.append({
        'i': f['id'], 'n': [a[0], f['name']], 'p': p, 's': s,
        'e': EQUIP[f.get('equipment')], 'c': CAT[f['category']], 'l': LEVEL[f['level']],
        'f': f.get('force') or '', 'g': imgs,
        'st': [[x, y] for x, y in zip(a[1], group(en, len(a[1])))],
    })

out = {'source': 'free-exercise-db@' + json.load(open(f'{ar_dir}/meta.json'))['sha'], 'license': 'Unlicense (public domain)',
       'items': items, 'curatedPhotos': photos_for_curated}
json.dump(out, open('src/three/fedb.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(items), 'new exercises;', len(photos_for_curated), 'curated exercises get photos')
