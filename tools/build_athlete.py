#!/usr/bin/env python3
"""
بناء مجسّم رياضي واقعي (رجل/امرأة) من ملفات MakeHuman/MPFB2 (رخصة CC0) إلى GLB بهيكل Mixamo.

الاستخدام:
  python3 tools/build_athlete.py <MPFB2_DATA_DIR> male   assets/models/athlete_male.glb
  python3 tools/build_athlete.py <MPFB2_DATA_DIR> female assets/models/athlete_female.glb

MPFB2_DATA_DIR = مجلد src/mpfb/data من https://github.com/makehumancommunity/mpfb2
"""
import gzip, json, math, os, struct, sys
import numpy as np
import pygltflib as G

DATA, GENDER, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
MALE = GENDER == 'male'

# ---------------------------------------------------------------------------
# الشبكة الأساسية
# ---------------------------------------------------------------------------
verts, faces, face_groups = [], [], []
group = None
with open(os.path.join(DATA, '3dobjs/base.obj')) as f:
    for line in f:
        if line.startswith('v '):
            verts.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('g '):
            group = line.split()[1]
        elif line.startswith('f '):
            idx = [int(p.split('/')[0]) - 1 for p in line.split()[1:]]
            faces.append(idx); face_groups.append(group)
V = np.array(verts, dtype=np.float64)
vgroups = json.load(open(os.path.join(DATA, 'mesh_metadata/basemesh_vertex_groups.json')))

def group_indices(name):
    out = []
    for a, b in vgroups[name]:
        out.extend(range(a, b + 1))
    return np.array(out)

# ---------------------------------------------------------------------------
# الأهداف (Targets) — نفس منطق MakeHuman للمعدِّلات الكبرى
# ---------------------------------------------------------------------------
def load_target(rel):
    p = os.path.join(DATA, 'targets', rel + '.target.gz')
    if not os.path.exists(p):
        return None
    d = []
    with gzip.open(p, 'rt') as f:
        for line in f:
            s = line.split()
            if len(s) == 4 and not line.startswith('#'):
                d.append((int(s[0]), float(s[1]), float(s[2]), float(s[3])))
    return d

def apply(rel, w):
    if abs(w) < 1e-4:
        return
    t = load_target(rel)
    if t is None:
        print('missing target', rel); return
    for i, dx, dy, dz in t:
        V[i] += w * np.array([dx, dy, dz])

def three_way(v):  # min/average/max
    if v < 0.5:
        return {'min': (0.5 - v) * 2, 'average': 1 - (0.5 - v) * 2, 'max': 0}
    return {'min': 0, 'average': 1 - (v - 0.5) * 2, 'max': (v - 0.5) * 2}

P = dict(gender=1.0 if MALE else 0.0, muscle=0.82 if MALE else 0.7, weight=0.42 if MALE else 0.4,
         height=0.5 if MALE else 0.55, proportions=1.0,
         race={'caucasian': 0.6, 'african': 0.25, 'asian': 0.15})
genders = {'male': P['gender'], 'female': 1 - P['gender']}
mus = three_way(P['muscle']); wei = three_way(P['weight'])

for g, gw in genders.items():
    if gw <= 0: continue
    for m, mw in mus.items():
        for w, ww in wei.items():
            k = gw * mw * ww
            if k <= 0: continue
            apply(f'macrodetails/universal-{g}-young-{m}muscle-{w}weight', k)
            apply(f'macrodetails/proportions/{g}-young-{m}muscle-{w}weight-idealproportions', k * (P['proportions'] - 0.5) * 2)
            hw = (P['height'] - 0.5) * 2
            if hw > 0: apply(f'macrodetails/height/{g}-young-{m}muscle-{w}weight-maxheight', k * hw)
    for race, rw in P['race'].items():
        apply(f'macrodetails/{race}-{g}-young', gw * rw)

if MALE:
    apply('torso/torso-vshape-incr', 0.45)
    apply('torso/torso-muscle-pectoral-incr', 0.35)
    apply('torso/torso-muscle-dorsi-incr', 0.35)
else:
    apply('torso/torso-vshape-incr', 0.15)

V *= 0.1  # ديسيمتر → متر

# ---------------------------------------------------------------------------
# المفاصل من هيكل Mixamo في MPFB
# ---------------------------------------------------------------------------
rig = json.load(open(os.path.join(DATA, 'rigs/standard/rig.mixamo.json')))['bones']
def joint_pos(spec):
    if spec['strategy'] == 'CUBE':
        return V[group_indices(spec['cube_name'])].mean(axis=0)
    if spec['strategy'] == 'MEAN':
        return V[spec['vertex_indices']].mean(axis=0)
    x, y, z = spec['default_position']
    return np.array([x, z, -y])

bones = list(rig.keys())
# ترتيب: الأب قبل الابن
ordered, seen = [], set()
def visit(n):
    if n in seen: return
    p = rig[n].get('parent') or ''
    if p: visit(p)
    seen.add(n); ordered.append(n)
for b in bones: visit(b)
heads = {b: joint_pos(rig[b]['head']) for b in ordered}
tails = {b: joint_pos(rig[b]['tail']) for b in ordered}

# الأرض عند أسفل القدم
body_idx_all = group_indices('body')
floor = V[body_idx_all][:, 1].min()
V[:, 1] -= floor
for b in ordered:
    heads[b][1] -= floor; tails[b][1] -= floor

H = lambda n: heads['mixamorig:' + n]

# ---------------------------------------------------------------------------
# الأوزان
# ---------------------------------------------------------------------------
wjson = json.load(open(os.path.join(DATA, 'rigs/standard/weights.mixamo.json')))['weights']
bone_index = {b: i for i, b in enumerate(ordered)}
per_vertex = [[] for _ in range(len(V))]
for b, lst in wjson.items():
    if b not in bone_index: continue
    for vi, w in lst:
        per_vertex[vi].append((w, bone_index[b]))
def top4(vi, fallback='mixamorig:Head'):
    l = sorted(per_vertex[vi], reverse=True)[:4]
    if not l: l = [(1.0, bone_index[fallback])]
    s = sum(w for w, _ in l)
    l = [(w / s, b) for w, b in l] + [(0.0, 0)] * (4 - len(l))
    return [b for _, b in l], [w for w, _ in l]
dominant = np.array([max(per_vertex[i])[1] if per_vertex[i] else -1 for i in range(len(V))])
bname = lambda i: ordered[i].split(':')[1] if i >= 0 else ''

# ---------------------------------------------------------------------------
# الوجوه والنورمال
# ---------------------------------------------------------------------------
def tris_of(face_sel):
    t = []
    for fi in face_sel:
        q = faces[fi]
        t.append((q[0], q[1], q[2]))
        if len(q) == 4: t.append((q[0], q[2], q[3]))
    return np.array(t, dtype=np.int64)

body_faces = [i for i, g in enumerate(face_groups) if g == 'body']
eye_faces = [i for i, g in enumerate(face_groups) if g in ('helper-l-eye', 'helper-r-eye')]

def vertex_normals(tris):
    N = np.zeros_like(V)
    a, b, c = V[tris[:, 0]], V[tris[:, 1]], V[tris[:, 2]]
    fn = np.cross(b - a, c - a)
    for k in range(3): np.add.at(N, tris[:, k], fn)
    ln = np.linalg.norm(N, axis=1); ln[ln == 0] = 1
    return N / ln[:, None]
BT = tris_of(body_faces)
NRM = vertex_normals(BT)

# ---------------------------------------------------------------------------
# مناطق الوجه والملابس
# ---------------------------------------------------------------------------
eyeL = V[group_indices('joint-l-eye')].mean(0); eyeR = V[group_indices('joint-r-eye')].mean(0)
eyeY = (eyeL[1] + eyeR[1]) / 2; faceZ = max(eyeL[2], eyeR[2])
neckY = H('Neck')[1]; headY = H('Head')[1]
hipsY = H('Hips')[1]; kneeY = (H('LeftLeg')[1] + H('RightLeg')[1]) / 2
ankleY = (H('LeftFoot')[1] + H('RightFoot')[1]) / 2
shoulderY = H('LeftArm')[1]
elbowL = H('LeftForeArm'); armL = H('LeftArm')

def region_of(i):
    b = bname(dominant[i]); p = V[i]; n = NRM[i]
    return b, p, n

# الوجه (للحجاب): بيضاوي أمامي
def in_face(p, n):
    dy = (p[1] - (eyeY - 0.03)) / 0.105
    dx = p[0] / 0.068
    return n[2] > 0.25 and dx * dx + dy * dy < 1.0 and p[2] > faceZ - 0.09

cloth_mask = {}
def mark(name, cond):
    cloth_mask[name] = np.array([cond(i) for i in range(len(V))])

def seg_t(p, a, b):
    return float(np.dot(p - a, b - a) / np.dot(b - a, b - a))
def side_of(b): return 'Left' if b.startswith('Left') else 'Right'

def is_torso(b): return b in ('Spine', 'Spine1', 'Spine2') or b.endswith('Shoulder')

def sneakers(i):
    b, p, n = region_of(i)
    if b.endswith('Foot') or b.endswith('ToeBase') or b.endswith('Toe_End'): return p[1] < ankleY + 0.035
    if b.endswith('Leg') and not b.endswith('UpLeg'): return p[1] < ankleY + 0.03
    return False

# تصاميم ARQ (ملفات ARQ_DESIGNS): الرجل = تيشيرت بدون أكمام أخضر داكن + شورت أخضر بلوحة جانبية سوداء
# وخطوط سدو + لفافات معصم؛ المرأة = جاكيت كريمي بسحّاب وياقة عالية + ليقنز كريمي بخط أحمر جانبي + حجاب رياضي.
if MALE:
    def tee(i):
        b, p, n = region_of(i)
        if not (b in ('Spine', 'Spine1', 'Spine2', 'Hips', 'Neck') or b.endswith('Shoulder')): return False
        if b in ('Spine', 'Hips') and p[1] < hipsY + 0.035: return False
        for s in ('Left', 'Right'):   # فتحة إبط واسعة (تيشيرت بدون أكمام)
            c = H(s + 'Arm') + np.array([0.0, -0.035, 0.0])
            if np.linalg.norm((p - c) * np.array([1.0, 1.0, 1.3])) < 0.105: return False
        nx, ny = p[0] / 0.07, (p[1] - (neckY + 0.012)) / 0.05   # ياقة دائرية
        if nx * nx + ny * ny < 1 or p[1] > neckY + 0.012: return False
        return True
    def shorts(i):
        b, p, n = region_of(i)
        if b == 'Hips': return p[1] > kneeY
        if b.endswith('UpLeg'): return p[1] > kneeY + 0.40 * (hipsY - kneeY)
        if b == 'Spine': return p[1] < hipsY + 0.1
        return False
    def wraps(i):
        b, p, n = region_of(i)
        if b.endswith('ForeArm'):
            s = side_of(b); return seg_t(p, H(s + 'ForeArm'), H(s + 'Hand')) > 0.8
        if b.endswith('Hand'):
            s = side_of(b); return np.linalg.norm(p - H(s + 'Hand')) < 0.022
        return False
    # الترتيب = الأولوية (الأعلى يغطي عند التداخل)
    ORDER = ['tee', 'wraps', 'shorts', 'sneakers']
    mark('tee', tee); mark('shorts', shorts); mark('wraps', wraps); mark('sneakers', sneakers)
else:
    def jacket(i):
        b, p, n = region_of(i)
        if is_torso(b): return b != 'Spine' or p[1] >= hipsY + 0.03
        if b == 'Hips': return p[1] > hipsY + 0.04
        if b.endswith('Arm') and not b.endswith('ForeArm'): return True
        if b.endswith('ForeArm'):
            s = side_of(b); return seg_t(p, H(s + 'ForeArm'), H(s + 'Hand')) < 0.97
        if b == 'Neck': return p[1] < neckY + 0.035   # ياقة عالية
        return False
    def leggings(i):
        b, p, n = region_of(i)
        if b == 'Hips' or b.endswith('UpLeg') or b.endswith('Leg'): return p[1] > ankleY + 0.03
        if b == 'Spine': return p[1] < hipsY + 0.08
        return False
    def hijab(i):
        b, p, n = region_of(i)
        if b in ('Head', 'Neck'): return not in_face(p, n)
        return False
    ORDER = ['jacket', 'hijab', 'leggings', 'sneakers']
    mark('jacket', jacket); mark('leggings', leggings); mark('hijab', hijab); mark('sneakers', sneakers)

# ---------------------------------------------------------------------------
# ألوان الجلد (مع تظليل التجاويف والشعر/اللحية/الحواجب)
# ---------------------------------------------------------------------------
def hexc(h):
    h = h.lstrip('#'); return np.array([int(h[k:k + 2], 16) / 255 for k in (0, 2, 4)])
def to_lin(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

SKIN = hexc('#C48A62' if MALE else '#D3A07C')
HAIR = hexc('#1E1511'); LIP = hexc('#A7614F' if MALE else '#B8665A')
colors = np.tile(SKIN, (len(V), 1))

# تجاويف: فرق النورمال عن متوسط الجيران (تقريب انحناء)
nbr_sum = np.zeros_like(V); nbr_cnt = np.zeros(len(V))
for k1, k2 in ((0, 1), (1, 2), (2, 0)):
    np.add.at(nbr_sum, BT[:, k1], V[BT[:, k2]]); np.add.at(nbr_cnt, BT[:, k1], 1)
    np.add.at(nbr_sum, BT[:, k2], V[BT[:, k1]]); np.add.at(nbr_cnt, BT[:, k2], 1)
nbr_cnt[nbr_cnt == 0] = 1
lap = nbr_sum / nbr_cnt[:, None] - V
curv = np.einsum('ij,ij->i', lap, NRM) / 0.004
shade = np.clip(1 - 0.22 * np.clip(curv, 0, 1) + 0.06 * np.clip(-curv, 0, 1), 0.72, 1.06)
colors *= shade[:, None]

def sstep(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)

for i in body_idx_all:
    b, p, n = region_of(i)
    if b not in ('Head', 'Neck'): continue
    rel = p[1] - eyeY; ax = abs(p[0]); front = n[2]
    # الشفاه
    lip = sstep(-0.082, -0.074, rel) * (1 - sstep(-0.062, -0.056, rel)) * (1 - sstep(0.018, 0.026, ax)) * sstep(0.45, 0.65, front)
    colors[i] = colors[i] * (1 - 0.45 * lip) + LIP * 0.45 * lip
    # الحواجب
    brow = sstep(0.011, 0.016, rel) * (1 - sstep(0.024, 0.029, rel)) * sstep(0.008, 0.014, ax) * (1 - sstep(0.05, 0.058, ax)) * sstep(0.3, 0.5, front)
    colors[i] = colors[i] * (1 - 0.75 * brow) + HAIR * 0.75 * brow
    if MALE:
        # شعر قصير: فوق خط الشعر (ينخفض للخلف)
        hairline = eyeY + 0.058 - 0.075 * max(0.0, -front) - 0.02 * sstep(0.04, 0.07, ax)
        hair = sstep(hairline - 0.004, hairline + 0.01, p[1]) * (1 - sstep(0.55, 0.8, front) * (1 - sstep(eyeY + 0.075, eyeY + 0.09, p[1])))
        colors[i] = colors[i] * (1 - 0.82 * hair) + HAIR * 0.82 * hair
        # لحية قصيرة مهذبة (خفيفة) + شارب
        jaw_line = sstep(-0.004, 0.012, -rel - 0.028)           # تحت مستوى الوجنتين
        cheek_side = sstep(0.035, 0.05, ax)
        chin_zone = (1 - sstep(0.03, 0.045, ax)) * sstep(0.074, 0.084, -rel)
        above_neck = sstep(neckY + 0.02, neckY + 0.05, p[1])
        beard = max(jaw_line * cheek_side, chin_zone) * above_neck * sstep(-0.5, -0.2, front) * (1 - sstep(0.075, 0.09, ax + 0.0))
        must = sstep(-0.058, -0.054, rel) * (1 - sstep(-0.047, -0.043, rel)) * (1 - sstep(0.026, 0.032, ax)) * sstep(0.35, 0.55, front)
        beard = max(beard * (1 - lip), must)
        colors[i] = colors[i] * (1 - 0.3 * beard) + HAIR * 0.3 * beard

GREEN = hexc('#0A332D'); GREEN2 = hexc('#2F4B3C'); CREAM = hexc('#F1E6CF'); CREAM2 = hexc('#E6D6B5')
ORANGE = hexc('#F1551D'); BLACK = hexc('#161B19'); SOLE = hexc('#26211D')

def leg_angle(p, b):
    """زاوية النقطة حول محور الساق (0 = الجانب الخارجي)."""
    s = side_of(b)
    a = H(s + 'UpLeg'); k = H(s + 'Leg')
    ax = (k - a) / np.linalg.norm(k - a)
    out = 1.0 if s == 'Left' else -1.0
    n = NRM[i_cur[0]]
    r = n - np.dot(n, ax) * ax
    return math.atan2(r[2], r[0] * out)

i_cur = [0]
def cloth_color(name, i):
    i_cur[0] = i
    b, p, n = region_of(i)
    if name == 'tee':
        return GREEN
    if name == 'shorts':
        if b.endswith('UpLeg') or b == 'Hips':
            try: ang = leg_angle(p, b if b != 'Hips' else ('LeftUpLeg' if p[0] > 0 else 'RightUpLeg'))
            except Exception: ang = 9
            if abs(ang) < 0.45: return BLACK      # لوحة جانبية سوداء
        return GREEN2
    if name == 'wraps':
        if b.endswith('ForeArm'):
            t = seg_t(p, H(side_of(b) + 'ForeArm'), H(side_of(b) + 'Hand'))
            if 0.87 < t < 0.9: return CREAM
        return GREEN
    if name == 'sneakers':
        if p[1] < 0.022: return SOLE
        if p[1] < 0.03: return CREAM2
        if 0.04 < p[1] < 0.052 and abs(n[0]) > 0.5: return GREEN
        return hexc('#F4EFE6')
    if name == 'jacket':
        if abs(p[0]) < 0.0045 and n[2] > 0.3 and is_torso(b) or (b == 'Neck' and abs(p[0]) < 0.005 and n[2] > 0.3):
            return hexc('#8C8475')  # السحّاب
        if b.endswith('ForeArm'):
            t = seg_t(p, H(side_of(b) + 'ForeArm'), H(side_of(b) + 'Hand'))
            if t > 0.9: return CREAM2  # الكُم المطاطي
        return CREAM
    if name == 'leggings':
        if b.endswith('UpLeg') or (b.endswith('Leg') and not b.endswith('UpLeg')):
            bb = b if b.endswith('UpLeg') else b.replace('Leg', 'UpLeg')
            if abs(leg_angle(p, bb)) < 0.16: return ORANGE  # خط جانبي أحمر
        return CREAM2
    if name == 'hijab':
        return GREEN
    return GREEN

# ---------------------------------------------------------------------------
# بناء الـ glTF
# ---------------------------------------------------------------------------
gl = G.GLTF2(asset=G.Asset(generator='ARQ build_athlete.py (MakeHuman/MPFB CC0 assets)'))
blob = bytearray()
def add_buf(arr, target=None, ctype=G.FLOAT, typ='VEC3', normalized=False, minmax=False):
    data = arr.tobytes()
    while len(blob) % 4: blob.append(0)
    off = len(blob); blob.extend(data)
    bv = G.BufferView(buffer=0, byteOffset=off, byteLength=len(data), target=target)
    gl.bufferViews.append(bv)
    acc = G.Accessor(bufferView=len(gl.bufferViews) - 1, componentType=ctype, count=len(arr), type=typ, normalized=normalized)
    if minmax:
        acc.min = arr.min(axis=0).tolist(); acc.max = arr.max(axis=0).tolist()
    gl.accessors.append(acc)
    return len(gl.accessors) - 1

# العظام
nodes_of = {}
gl.nodes.append(G.Node(name='Armature', children=[]))
for b in ordered:
    p = rig[b].get('parent') or ''
    t = heads[b] - (heads[p] if p else 0)
    gl.nodes.append(G.Node(name=b, translation=[float(x) for x in t], children=[]))
    nodes_of[b] = len(gl.nodes) - 1
    if p: gl.nodes[nodes_of[p]].children.append(nodes_of[b])
    else: gl.nodes[0].children.append(nodes_of[b])
ibm = np.array([np.array([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [-heads[b][0], -heads[b][1], -heads[b][2], 1]], dtype=np.float32).flatten() for b in ordered], dtype=np.float32)
ibm_acc = add_buf(ibm, ctype=G.FLOAT, typ='MAT4')
gl.skins.append(G.Skin(name='Armature', joints=[nodes_of[b] for b in ordered], inverseBindMatrices=ibm_acc, skeleton=nodes_of[ordered[0]]))

def add_material(name, rough=0.62, color=(1, 1, 1, 1), sheen=False):
    m = G.Material(name=name, pbrMetallicRoughness=G.PbrMetallicRoughness(baseColorFactor=list(color), metallicFactor=0.0, roughnessFactor=rough))
    gl.materials.append(m); return len(gl.materials) - 1

def add_skinned_mesh(name, vidx, tris_global, col, offset=0.0, material=None):
    remap = {int(v): k for k, v in enumerate(vidx)}
    pos = (V[vidx] + NRM[vidx] * offset).astype(np.float32)
    nrm = NRM[vidx].astype(np.float32)
    cl = to_lin(np.clip(col, 0, 1)).astype(np.float32)
    J = np.zeros((len(vidx), 4), dtype=np.uint16); W = np.zeros((len(vidx), 4), dtype=np.float32)
    for k, v in enumerate(vidx):
        j, w = top4(int(v)); J[k] = j; W[k] = w
    idx = np.array([[remap[a], remap[b], remap[c]] for a, b, c in tris_global], dtype=np.uint32).flatten()
    attrs = G.Attributes(
        POSITION=add_buf(pos, G.ARRAY_BUFFER, minmax=True), NORMAL=add_buf(nrm, G.ARRAY_BUFFER),
        COLOR_0=add_buf(cl, G.ARRAY_BUFFER), JOINTS_0=add_buf(J, G.ARRAY_BUFFER, G.UNSIGNED_SHORT, 'VEC4'),
        WEIGHTS_0=add_buf(W, G.ARRAY_BUFFER, G.FLOAT, 'VEC4'))
    ia = add_buf(idx, G.ELEMENT_ARRAY_BUFFER, G.UNSIGNED_INT, 'SCALAR')
    gl.meshes.append(G.Mesh(name=name, primitives=[G.Primitive(attributes=attrs, indices=ia, material=material)]))
    gl.nodes.append(G.Node(name=name, mesh=len(gl.meshes) - 1, skin=0))
    return len(gl.nodes) - 1

skin_mat = add_material('Skin', 0.58)
cloth_mat = add_material('Cloth', 0.85)
eye_mat = add_material('Eye', 0.2)

# كل قطعة تأخذ الوجوه المغطاة بالكامل بقناعها (يُسمح بالتداخل: التيشيرت فوق الشورت، الجاكيت فوق الليقنز)،
# والجلد يُحذف فقط تحت داخل القماش — وتحت الحواف يبقى الجلد، فلا تظهر ثقوب أو شرائط.
OFFSET = {'tee': 0.013, 'shorts': 0.008, 'wraps': 0.006, 'sneakers': 0.009,
          'jacket': 0.016, 'leggings': 0.004, 'hijab': 0.017}
SMOOTH = {'tee': 8, 'jacket': 12, 'hijab': 6, 'shorts': 3, 'leggings': 2, 'wraps': 2, 'sneakers': 4}
cloth_faces = {c: [fi for fi in body_faces if all(cloth_mask[c][v] for v in faces[fi])] for c in ORDER}
covered = set()
cloth_geo = {}
for name in ORDER:
    fs = cloth_faces[name]
    if not fs: continue
    t = tris_of(fs); vi = np.unique(t)
    # حواف القطعة = أضلاع الأوجه الأصلية المستخدمة مرة واحدة
    ecount = {}
    for fi in fs:
        q = faces[fi]
        for k in range(len(q)):
            e = tuple(sorted((q[k], q[(k + 1) % len(q)])))
            ecount[e] = ecount.get(e, 0) + 1
    bnbr = {}
    for (x, y), c in ecount.items():
        if c == 1:
            bnbr.setdefault(x, set()).add(y); bnbr.setdefault(y, set()).add(x)
    adj = {int(v): set() for v in vi}
    for q in (faces[fi] for fi in fs):
        for k in range(len(q)):
            x, y = q[k], q[(k + 1) % len(q)]
            adj[x].add(y); adj[y].add(x)
    depth = {int(v): (0 if int(v) in bnbr else 99) for v in vi}
    for _ in range(3):
        for v in vi:
            v = int(v); depth[v] = min(depth[v], min((depth[u] + 1 for u in adj[v]), default=99))
    for fi in fs:
        if all(depth[v] >= 2 for v in faces[fi]): covered.add(fi)
    cloth_geo[name] = (fs, t, vi, bnbr, adj, depth)

skin_faces = [fi for fi in body_faces if fi not in covered]
scene_nodes = [0]
st = tris_of(skin_faces)
scene_nodes.append(add_skinned_mesh('Body', np.unique(st), st, colors[np.unique(st)], 0.0, skin_mat))
cloth_surface = {}
for name in ORDER:
    if name not in cloth_geo: continue
    fs, t, vi, bnbr, adj, depth = cloth_geo[name]
    col = np.array([cloth_color(name, int(v)) for v in vi]) * np.clip(shade[vi], 0.9, 1.04)[:, None]
    off = OFFSET[name]
    fac = np.array([(0.8, 0.92, 1.0)[min(depth[int(v)], 2)] for v in vi])
    pos = V[vi] + NRM[vi] * (off * fac)[:, None]
    loc = {int(v): k for k, v in enumerate(vi)}
    # تنعيم خط الحافة على امتداده (يزيل الدرجات المربعة)
    for _ in range(12):
        newp = pos.copy()
        for v, nb in bnbr.items():
            if len(nb) != 2: continue
            k = loc[v]; newp[k] = pos[k] * 0.5 + pos[[loc[u] for u in nb]].mean(0) * 0.5
        pos = newp
    # تنعيم سطح القماش (يخفي تفاصيل الجسم الدقيقة تحته) مع تثبيت الحافة
    for _ in range(SMOOTH[name]):
        newp = pos.copy()
        for k, v in enumerate(vi):
            if int(v) in bnbr: continue
            nb = [loc[u] for u in adj[int(v)]]
            newp[k] = pos[k] * 0.4 + pos[nb].mean(0) * 0.6
        pos = newp
    cloth_surface[name] = (vi, pos)
    saved = V[vi].copy(); V[vi] = pos
    scene_nodes.append(add_skinned_mesh('Cloth_' + name, vi, t, col, 0.0, cloth_mat))
    V[vi] = saved

# شعار ARQ على الصدر الأيسر (متجهات الشعار الأصلية بدون تحريف)
def logo_polys():
    import re
    svg = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'brand', 'mark.svg')).read()
    polys = []
    for d in re.findall(r' d="([^"]+)"', svg):
        for sub in d.split('Z'):
            nums = re.findall(r'-?\d+\.?\d*', sub)
            pts = [(float(nums[k]), float(nums[k + 1])) for k in range(0, len(nums) - 1, 2)]
            if len(pts) >= 3: polys.append(pts)
    return polys

def build_logo():
    import mapbox_earcut as earcut
    top = 'tee' if MALE else 'jacket'
    if top not in cloth_surface: return None
    vi, pos = cloth_surface[top]
    front = np.array([NRM[v][2] > 0.55 and bname(dominant[v]) in ('Spine2', 'Spine1') for v in vi])
    fp = pos[front]; fn = NRM[vi][front]
    width = 0.075 if MALE else 0.06
    cx = 0.085 if MALE else 0.075          # يسار اللابس (+x)
    cy = shoulderY - (0.115 if MALE else 0.1)
    P2, T = [], []
    for poly in logo_polys():
        arr = np.array(poly, dtype=np.float32)
        tri = earcut.triangulate_float32(arr, np.array([len(arr)], dtype=np.uint32))
        base = len(P2)
        for x, y in poly:
            P2.append((cx + (x / 124.039 - 0.5) * width, cy - (y / 124.039 - 0.5 * 90.191 / 124.039) * width))
        T.extend((base + k for k in tri))
    P3, N3 = [], []
    for x, y in P2:
        d = (fp[:, 0] - x) ** 2 + (fp[:, 1] - y) ** 2
        nn = np.argsort(d)[:4]; w = 1 / (np.sqrt(d[nn]) + 1e-4); w /= w.sum()
        z = float((fp[nn, 2] * w).sum()); nrm = (fn[nn] * w[:, None]).sum(0); nrm /= np.linalg.norm(nrm)
        P3.append((x, y, z) + nrm * 0.0025); N3.append(nrm)
    tris = np.array(T, dtype=np.uint32).reshape(-1, 3)
    # الترتيب لتكون الوجوه للأمام
    a, b2, c = (np.array(P3)[tris[:, k]] for k in range(3))
    flip = np.cross(b2 - a, c - a)[:, 2] < 0
    tris[flip] = tris[flip][:, [0, 2, 1]]
    pos3 = np.array(P3, dtype=np.float32); nrm3 = np.array(N3, dtype=np.float32)
    colr = np.tile(to_lin(CREAM if MALE else GREEN), (len(pos3), 1)).astype(np.float32)
    J = np.zeros((len(pos3), 4), dtype=np.uint16); J[:, 0] = bone_index['mixamorig:Spine2']
    W = np.zeros((len(pos3), 4), dtype=np.float32); W[:, 0] = 1
    attrs = G.Attributes(POSITION=add_buf(pos3, G.ARRAY_BUFFER, minmax=True), NORMAL=add_buf(nrm3, G.ARRAY_BUFFER),
                         COLOR_0=add_buf(colr, G.ARRAY_BUFFER), JOINTS_0=add_buf(J, G.ARRAY_BUFFER, G.UNSIGNED_SHORT, 'VEC4'),
                         WEIGHTS_0=add_buf(W, G.ARRAY_BUFFER, G.FLOAT, 'VEC4'))
    ia = add_buf(tris.flatten(), G.ELEMENT_ARRAY_BUFFER, G.UNSIGNED_INT, 'SCALAR')
    gl.meshes.append(G.Mesh(name='Logo', primitives=[G.Primitive(attributes=attrs, indices=ia, material=cloth_mat)]))
    gl.nodes.append(G.Node(name='Logo', mesh=len(gl.meshes) - 1, skin=0))
    return len(gl.nodes) - 1
ln = build_logo()
if ln is not None: scene_nodes.append(ln)

# العيون: بياض + قزحية + بؤبؤ
et = tris_of(eye_faces); ev = np.unique(et)
EN = vertex_normals(et)
ecol = np.zeros((len(ev), 3))
for k, v in enumerate(ev):
    c = eyeL if V[v][0] > 0 else eyeR
    d = V[v] - c; d /= (np.linalg.norm(d) or 1)
    f = d[2]
    ecol[k] = hexc('#F3EEE6') if f < 0.82 else (hexc('#4A2C1A') if f < 0.95 else hexc('#0E0907'))
NRM_backup = NRM.copy(); NRM[ev] = EN[ev]
scene_nodes.append(add_skinned_mesh('Eyes', ev, et, ecol, 0.0, eye_mat))
NRM = NRM_backup

gl.scenes.append(G.Scene(nodes=scene_nodes)); gl.scene = 0
gl.buffers.append(G.Buffer(byteLength=len(blob)))
gl.set_binary_blob(bytes(blob))
gl.save_binary(OUT)
print('saved', OUT, f'{os.path.getsize(OUT)/1e6:.2f}MB', 'height', round(float(V[body_idx_all][:, 1].max()), 3),
      'verts', len(np.unique(st)), 'cloth', {k: int(v.sum()) for k, v in cloth_mask.items()})
