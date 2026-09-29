# يبني صور الإيميل (PNG/JPG) من ملفات الهوية: الشعار، صورة الغلاف، أيقونات، وشريط السدو
import base64, json, os, re
from playwright.sync_api import sync_playwright

APP = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets')
os.makedirs(OUT, exist_ok=True)

C = dict(deep='#0A332D', green='#2F4B3C', orange='#F1551D', amber='#FEA94F', sand='#F7DFBB', cream='#F8EDDA', card='#FFFBF5')

def svg(name):
    return open(f'{APP}/assets/brand/{name}.svg').read()

def recolor(s, fill):
    return s.replace('#0A332D', fill)

def lockup_two_tone(en, ar, sep):
    """ARQ بلون، وأرك بلون، والمعيّن بينهم بلون"""
    s = svg('lockup')
    paths = re.findall(r'<path [^>]*/>', s)
    head = s.split('<path', 1)[0]
    # الترتيب في الملف: A R Q ثم عناصر «أرك»، والمعيّن (الفاصل) هو السابع
    colors = [en, en, en, ar, ar, ar, sep, ar, ar]
    out = head + ''.join(p.replace('#0A332D', c) for p, c in zip(paths, colors)) + '</svg>'
    return out

def b64(path):
    return base64.b64encode(open(path, 'rb').read()).decode()

KUFI_B = b64(f'{APP}/node_modules/@expo-google-fonts/noto-kufi-arabic/700Bold/NotoKufiArabic_700Bold.ttf')
KUFI_M = b64(f'{APP}/node_modules/@expo-google-fonts/noto-kufi-arabic/500Medium/NotoKufiArabic_500Medium.ttf')
ION = b64(f'{APP}/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf')
GLYPH = json.load(open(f'{APP}/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json'))
PHOTO = b64(f'{APP}/assets/imagery/run-dune.jpg')

FONTS = f"""
@font-face {{ font-family: Kufi; font-weight: 700; src: url(data:font/ttf;base64,{KUFI_B}); }}
@font-face {{ font-family: Kufi; font-weight: 500; src: url(data:font/ttf;base64,{KUFI_M}); }}
@font-face {{ font-family: Ion; src: url(data:font/ttf;base64,{ION}); }}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ background: transparent; }}
"""

def ion(name):
    return chr(GLYPH[name])

# شريط السدو: معيّنات وأسهم مستوحاة من علامة أرك، يتكرر
def sadu_svg(w, h):
    unit = h * 2  # عرض الوحدة
    parts = []
    x = 0
    i = 0
    while x < w + unit:
        cx = x + unit / 2
        # معيّن كبير برتقالي
        parts.append(f'<path d="M {cx} {h*0.18} L {cx + h*0.32} {h/2} L {cx} {h*0.82} L {cx - h*0.32} {h/2} Z" fill="{C["orange"] if i % 2 == 0 else C["amber"]}"/>')
        # نقطة كريمية في وسطه
        parts.append(f'<path d="M {cx} {h*0.40} L {cx + h*0.1} {h/2} L {cx} {h*0.60} L {cx - h*0.1} {h/2} Z" fill="{C["deep"]}"/>')
        # سهمين صغار بين المعيّنات
        sx = x + unit
        parts.append(f'<path d="M {sx - h*0.22} {h*0.30} L {sx} {h*0.52} L {sx + h*0.22} {h*0.30}" fill="none" stroke="{C["sand"]}" stroke-width="{h*0.07}"/>')
        parts.append(f'<path d="M {sx - h*0.22} {h*0.55} L {sx} {h*0.77} L {sx + h*0.22} {h*0.55}" fill="none" stroke="{C["sand"]}" stroke-width="{h*0.07}" opacity="0.55"/>')
        x += unit
        i += 1
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><rect width="{w}" height="{h}" fill="{C["deep"]}"/>{"".join(parts)}</svg>'

BADGES = {
    'confirm': 'sparkles', 'invite': 'person-add', 'magic': 'flash',
    'email': 'mail-open', 'reset': 'key', 'reauth': 'shield-checkmark',
}
FEATURES = {'plan': 'calendar', 'friends': 'trophy', 'streak': 'flame'}

def page():
    lock_hero = recolor(svg('lockup'), C['deep'])
    mark_amber = recolor(svg('mark'), C['amber'])
    badges = ''.join(f"""
      <div class="badge" id="badge-{k}"><div class="ring"><div class="core"><span class="ion">{ion(v)}</span></div></div></div>""" for k, v in BADGES.items())
    feats = ''.join(f"""
      <div class="feat" id="feat-{k}"><span class="ion">{ion(v)}</span></div>""" for k, v in FEATURES.items())
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{FONTS}
#hero {{ width: 1200px; height: 600px; position: relative; overflow: hidden;
  background: url(data:image/jpeg;base64,{PHOTO}) -540px -95px / 1750px auto no-repeat; }}
#hero .warm {{ position: absolute; inset: 0; background: linear-gradient(90deg, rgba(248,237,218,0) 0%, rgba(248,237,218,0) 45%, rgba(248,237,218,0.55) 78%, rgba(248,237,218,0.8) 100%); }}
#hero .fade {{ position: absolute; left: 0; right: 0; bottom: 0; height: 190px; background: linear-gradient(180deg, rgba(255,251,245,0) 0%, rgba(255,251,245,0.85) 70%, {C['card']} 100%); }}
#hero .top {{ position: absolute; left: 0; right: 0; top: 0; height: 14px; background: linear-gradient(90deg, {C['deep']} 0%, {C['orange']} 55%, {C['amber']} 100%); }}
#hero .logo {{ position: absolute; right: 60px; top: 62px; width: 470px; }}
#hero .logo svg {{ width: 470px; height: auto; display: block; }}
#hero .tag {{ position: absolute; right: 62px; top: 158px; font-family: Kufi; font-weight: 700; font-size: 42px; color: {C['deep']}; direction: rtl; letter-spacing: 0; }}
#hero .tag b {{ color: {C['orange']}; }}
#mark {{ width: 120px; }} #mark svg {{ width: 120px; height: auto; display: block; }}
#sadu {{ width: 1200px; height: 44px; }}
.badge {{ background: {C['card']}; width: 196px; height: 196px; display: flex; align-items: center; justify-content: center; }}
.badge .ring {{ width: 148px; height: 148px; border-radius: 50%; background: {C['card']}; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 24px rgba(10,51,45,0.18); }}
.badge .core {{ width: 124px; height: 124px; border-radius: 50%; background: linear-gradient(135deg, {C['orange']} 0%, {C['amber']} 100%); display: flex; align-items: center; justify-content: center; }}
.badge .ion {{ font-family: Ion; font-size: 64px; color: {C['cream']}; line-height: 1; }}
.feat {{ width: 104px; height: 104px; border-radius: 30px; background: {C['deep']}; display: flex; align-items: center; justify-content: center; }}
.feat .ion {{ font-family: Ion; font-size: 52px; color: {C['amber']}; line-height: 1; }}
.wrap {{ display: flex; flex-wrap: wrap; gap: 20px; padding: 20px; }}
</style></head><body>
<div id="hero"><div class="warm"></div><div class="fade"></div><div class="top"></div>
  <div class="logo">{lock_hero}</div>
  <div class="tag">تمرّن، التزم، <b>وتقدّم</b></div>
</div>
<div class="wrap">
  <div id="mark">{mark_amber}</div>
  <div id="sadu">{sadu_svg(1200, 44)}</div>
  {badges}
  {feats}
</div>
</body></html>"""

def main():
    html = page()
    open(os.path.join(OUT, '_assets.html'), 'w').write(html)
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 1300, 'height': 1400})
        pg.set_content(html)
        pg.wait_for_timeout(800)
        pg.evaluate('document.fonts.ready')
        pg.locator('#hero').screenshot(path=os.path.join(OUT, 'hero.jpg'), type='jpeg', quality=82)
        pg.locator('#sadu').screenshot(path=os.path.join(OUT, 'sadu.png'))
        pg.locator('#mark').screenshot(path=os.path.join(OUT, 'mark.png'), omit_background=True)
        for k in BADGES:
            pg.locator(f'#badge-{k}').screenshot(path=os.path.join(OUT, f'badge-{k}.jpg'), type='jpeg', quality=88)
        for k in FEATURES:
            pg.locator(f'#feat-{k}').screenshot(path=os.path.join(OUT, f'feat-{k}.png'), omit_background=True)
        b.close()
    for f in sorted(os.listdir(OUT)):
        if not f.startswith('_'):
            print(f, os.path.getsize(os.path.join(OUT, f)))

if __name__ == '__main__':
    main()
