# قوالب إيميلات أرك (Supabase Auth): هوية كاملة — صورة الغلاف بالشعار، شريط السدو، أيقونات، خط Noto Kufi Arabic
# الناتج: templates.json (subject + html) + معاينات
import json, os, sys

BASE = os.environ.get('ASSET_BASE', 'https://hfplqbnbuskiaeblxpfo.supabase.co/storage/v1/object/public/brands/arq-email')
OUT = os.path.dirname(os.path.abspath(__file__))

DEEP, GREEN, ORANGE, AMBER, SAND, CREAM, CARD = '#0A332D', '#2F4B3C', '#F1551D', '#FEA94F', '#F7DFBB', '#F8EDDA', '#FFFBF5'
INK = '#33443D'   # نص عادي على الكريمي
MUTED = '#6B7A72'
AR = "'Noto Kufi Arabic', Tahoma, 'Geeza Pro', 'Segoe UI', Arial, sans-serif"
EN = "'Avenir Next', 'Segoe UI', Helvetica, Arial, sans-serif"

def img(name, w, alt='', style=''):
    return f'<img src="{BASE}/{name}" width="{w}" alt="{alt}" style="display:block;border:0;outline:none;text-decoration:none;{style}">'

def button(url, label, font=AR, size=18):
    return f"""<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto">
  <tr><td align="center" bgcolor="{ORANGE}" style="border-radius:14px;background:{ORANGE};box-shadow:0 8px 18px rgba(241,85,29,0.28)">
    <a href="{url}" target="_blank" style="display:inline-block;padding:17px 46px;font-family:{font};font-size:{size}px;font-weight:700;line-height:1.2;color:#FFFFFF;text-decoration:none;border-radius:14px">{label}</a>
  </td></tr>
</table>"""

def features():
    items = [
        ('feat-plan.png', 'خطتك الأسبوعية', 'تمرين ووجبات على مقاسك، تتعدّل مع تقدّمك'),
        ('feat-friends.png', 'تحدّى أصدقاءك', 'اجمع النقاط، اطلع بالرتب، وتنافس مع ربعك'),
        ('feat-streak.png', 'سجّل حضورك للنادي', 'وحافظ على سلسلتك يوم ورا يوم'),
    ]
    rows = ''.join(f"""
      <tr>
        <td width="60" valign="middle" style="padding:8px 0 8px 14px">{img(f, 48, '', 'margin:0')}</td>
        <td valign="middle" style="padding:8px 0;text-align:right">
          <div style="font-family:{AR};font-size:15px;font-weight:700;color:{DEEP};line-height:1.6">{t}</div>
          <div style="font-family:{AR};font-size:13px;color:{MUTED};line-height:1.7">{sub}</div>
        </td>
      </tr>""" for f, t, sub in items)
    return f"""
<tr><td class="px" style="padding:6px 36px 28px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{CREAM};border-radius:18px">
    <tr><td style="padding:20px 22px 14px" dir="rtl">
      <div style="font-family:{AR};font-size:14px;font-weight:700;color:{ORANGE};text-align:right;margin:0 0 8px">وش ينتظرك في أرك؟</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="rtl">{rows}
      </table>
    </td></tr>
  </table>
</td></tr>"""

def code_box(token):
    return f"""<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto">
  <tr><td align="center" style="background:{CREAM};border:2px dashed {AMBER};border-radius:16px;padding:16px 20px">
    <div dir="ltr" style="font-family:'SF Mono',Menlo,Consolas,'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:5px;color:{DEEP};line-height:1.1;white-space:nowrap">{token}</div>
  </td></tr>
</table>"""

def fallback(url):
    return f"""<p style="margin:22px 0 0;font-family:{AR};font-size:12px;line-height:1.8;color:{MUTED};text-align:center">الزر ما اشتغل؟ انسخ هذا الرابط وافتحه:<br>
  <span dir="ltr" style="unicode-bidi:embed"><a href="{url}" target="_blank" dir="ltr" style="color:{ORANGE};text-decoration:underline;word-break:break-all;font-family:{EN};font-size:11px">{url}</a></span></p>"""

def page(t):
    """t: dict(key, preheader, badge, eyebrow, title, body, action_html, note, en_title, en_body, en_action, features)"""
    feats = features() if t.get('features') else ''
    return f"""<!doctype html>
<html lang="ar" dir="rtl" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>{t['title_plain']}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@400;700&display=swap" rel="stylesheet">
<style>
  :root {{ color-scheme: light; supported-color-schemes: light; }}
  body {{ margin:0; padding:0; background:{CREAM}; -webkit-text-size-adjust:100%; }}
  a {{ color:{ORANGE}; }}
  @media only screen and (max-width:620px) {{
    .container {{ width:100% !important; border-radius:0 !important; }}
    .px {{ padding-left:22px !important; padding-right:22px !important; }}
    .title {{ font-size:25px !important; }}
    .col3 {{ padding:0 2px !important; }}
  }}
</style>
</head>
<body style="margin:0;padding:0;background:{CREAM}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">{t['preheader']}&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{CREAM}" style="background:{CREAM}">
<tr><td align="center" style="padding:28px 12px 36px">

<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="{CARD}" style="width:600px;max-width:600px;background:{CARD};border-radius:26px;overflow:hidden;border:1px solid #EFDDBF">
  <!-- الغلاف: شعار أرك على صورة الكثبان -->
  <tr><td style="padding:0;background:{SAND}" bgcolor="{SAND}">{img('hero.jpg', 600, 'أرك ARQ — تمرّن، التزم، وتقدّم', 'width:100%;max-width:600px;height:auto;font-family:' + AR + ';font-size:22px;font-weight:700;color:' + DEEP + ';text-align:center')}</td></tr>

  <!-- الأيقونة -->
  <tr><td align="center" style="padding:4px 0 0">{img(f"badge-{t['badge']}.jpg", 98, '', 'margin:0 auto')}</td></tr>

  <!-- المحتوى العربي -->
  <tr><td class="px" dir="rtl" align="center" style="padding:10px 44px 8px;text-align:center">
    <div style="font-family:{AR};font-size:13px;font-weight:700;color:{ORANGE};line-height:1.6;margin:0 0 6px">{t['eyebrow']}</div>
    <h1 class="title" style="margin:0 0 14px;font-family:{AR};font-size:28px;font-weight:700;line-height:1.5;color:{DEEP}">{t['title']}</h1>
    <p style="margin:0 0 26px;font-family:{AR};font-size:16px;line-height:2;color:{INK}">{t['body']}</p>
    {t['action_html']}
    {t.get('fallback', '')}
    <p style="margin:22px 0 0;font-family:{AR};font-size:13px;line-height:1.9;color:{MUTED}">{t['note']}</p>
  </td></tr>
  <tr><td style="padding:14px 0 0"></td></tr>
  {feats}

  <!-- English -->
  <tr><td class="px" style="padding:0 44px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #EFDDBF;font-size:0;line-height:0">&nbsp;</td></tr></table>
  </td></tr>
  <tr><td class="px" dir="ltr" align="left" style="padding:22px 44px 30px;text-align:left">
    <div style="font-family:{EN};font-size:17px;font-weight:700;color:{DEEP};line-height:1.4;margin:0 0 6px">{t['en_title']}</div>
    <div style="font-family:{EN};font-size:14px;line-height:1.7;color:{INK};margin:0 0 10px">{t['en_body']}</div>
    {t['en_action']}
  </td></tr>

  <!-- شريط السدو + التذييل -->
  <tr><td style="padding:0;background:{DEEP};font-size:0;line-height:0" bgcolor="{DEEP}">{img('sadu.png', 600, '', 'width:100%;max-width:600px;height:auto')}</td></tr>
  <tr><td align="center" bgcolor="{DEEP}" style="background:{DEEP};padding:26px 30px 30px;text-align:center">
    {img('mark.png', 46, 'أرك', 'margin:0 auto 12px')}
    <div style="font-family:{AR};font-size:15px;font-weight:700;color:{CREAM};line-height:1.7">أرك · تمرّن، التزم، <span style="color:{AMBER}">وتقدّم</span></div>
    <div dir="ltr" style="font-family:{EN};font-size:12px;color:#9FB3A9;line-height:1.7;margin-top:2px">ARQ · Train. Commit. Progress.</div>
  </td></tr>
</table>

<p style="margin:18px 0 0;font-family:{AR};font-size:11px;line-height:1.8;color:{MUTED};text-align:center">إيميل تلقائي من تطبيق أرك، لا ترد عليه<br><span dir="ltr" style="font-family:{EN}">Automated email from the ARQ app — please don't reply</span></p>
</td></tr>
</table>
</body>
</html>"""

URL = '{{ .ConfirmationURL }}'

def en_link(label):
    return f'<a href="{URL}" target="_blank" style="font-family:{EN};font-size:15px;font-weight:700;color:{ORANGE};text-decoration:none">{label} &rarr;</a>'

T = {
  'confirm-sign-up': dict(
    subject='أكّد إيميلك وابدأ مع أرك 💪 | Confirm your ARQ email',
    preheader='خطوة وحدة وتبدأ رحلتك مع أرك — أكّد إيميلك',
    badge='confirm', eyebrow='خطوة أخيرة', title='هلا فيك في أرك 👋', title_plain='أكّد إيميلك في أرك',
    body='باقي خطوة وحدة: أكّد إيميلك، والتطبيق يفتح لك على طول وتبدأ رحلتك معنا.',
    action_html=button(URL, 'أكّد إيميلي'), fallback=fallback(URL),
    note='إذا ما سجّلت في أرك، تجاهل هذا الإيميل وما راح ينفتح أي حساب.',
    en_title='Welcome to ARQ', en_body='Confirm your email to finish creating your account.', en_action=en_link('Confirm my email'),
    features=True),
  'invite-user': dict(
    subject='دعوة للانضمام إلى أرك 🎉 | You are invited to ARQ',
    preheader='وصلتك دعوة لتطبيق أرك — اقبلها وابدأ',
    badge='invite', eyebrow='دعوة خاصة', title='انضم لأرك 🎉', title_plain='دعوة للانضمام إلى أرك',
    body='انضفت لتطبيق أرك. اقبل الدعوة وجهّز حسابك في دقيقة، وابدأ تمرينك مع مجتمعك.',
    action_html=button(URL, 'اقبل الدعوة'), fallback=fallback(URL),
    note='إذا ما تعرف ليش وصلتك هذي الدعوة، تجاهل الإيميل.',
    en_title='You are invited to ARQ', en_body='Accept the invite to set up your account.', en_action=en_link('Accept the invite'),
    features=True),
  'magic-link-or-otp': dict(
    subject='رابط دخولك إلى أرك ⚡ | Your ARQ sign-in link',
    preheader='رابط دخولك لأرك جاهز',
    badge='magic', eyebrow='دخول سريع', title='رابط دخولك جاهز ⚡', title_plain='رابط الدخول إلى أرك',
    body='اضغط الزر وتدخل حسابك في أرك على طول، بدون كلمة مرور. الرابط يشتغل مرة وحدة.',
    action_html=button(URL, 'ادخل حسابي'), fallback=fallback(URL),
    note='إذا ما طلبت الدخول، تجاهل هذا الإيميل وحسابك بأمان.',
    en_title='Your ARQ sign-in link', en_body='Tap the button to sign in. The link works once.', en_action=en_link('Sign in')),
  'change-email-address': dict(
    subject='أكّد إيميلك الجديد في أرك | Confirm your new ARQ email',
    preheader='أكّد إيميلك الجديد عشان نكمّل التغيير',
    badge='email', eyebrow='تغيير الإيميل', title='أكّد إيميلك الجديد', title_plain='أكّد إيميلك الجديد في أرك',
    body='طلبت تغيير إيميل حسابك في أرك إلى <b style="color:' + DEEP + '" dir="ltr">{{ .NewEmail }}</b>. أكّد عشان نكمّل التغيير.',
    action_html=button(URL, 'أكّد الإيميل الجديد'), fallback=fallback(URL),
    note='إذا ما طلبت هذا التغيير، تجاهل الإيميل وحسابك يبقى على حاله.',
    en_title='Confirm your new email', en_body='Confirm {{ .NewEmail }} as the new email for your ARQ account.', en_action=en_link('Confirm new email')),
  'reset-password': dict(
    subject='رمز استرجاع حسابك في أرك 🔑 | Your ARQ password reset code',
    preheader='رمز التحقق لتغيير كلمة المرور في أرك',
    badge='reset', eyebrow='كلمة المرور', title='نسيت كلمة المرور؟', title_plain='رمز استرجاع حسابك في أرك',
    body='ولا يهمك، تصير. اكتب هذا الرمز في التطبيق بصفحة «نسيت كلمة المرور؟» مع كلمة مرور جديدة، وتدخل حسابك على طول:',
    action_html=code_box('{{ .Token }}'),
    note='الرمز يشتغل مرة وحدة وينتهي بعد ساعة. لا تعطيه لأي أحد، حتى لو قال إنه من أرك.<br>إذا ما طلبت هذا، تجاهل الإيميل وكلمة مرورك ما تتغير.',
    en_title='Reset your password', en_body='Enter this code in the ARQ app under “Forgot password?” together with a new password: <b style="color:' + DEEP + ';letter-spacing:2px">{{ .Token }}</b>', en_action='<span style="font-family:' + EN + ';font-size:12px;color:' + MUTED + '">The code works once and expires in 1 hour. Never share it with anyone. Didn’t ask for it? Ignore this email.</span>'),
  'reauthentication': dict(
    subject='رمز التحقق من أرك | Your ARQ verification code',
    preheader='رمز التحقق حقك من أرك',
    badge='reauth', eyebrow='تحقق من هويتك', title='رمز التحقق', title_plain='رمز التحقق من أرك',
    body='عشان نتأكد إنه أنت، اكتب هذا الرمز في التطبيق:',
    action_html=code_box('{{ .Token }}'),
    note='لا تعطي هذا الرمز لأي أحد، حتى لو قال إنه من أرك.',
    en_title='Your verification code', en_body='Enter this code in the app: <b style="color:' + DEEP + ';letter-spacing:2px">{{ .Token }}</b>', en_action='<span style="font-family:' + EN + ';font-size:12px;color:' + MUTED + '">Never share this code with anyone.</span>'),
}

def build():
    res = {}
    for k, t in T.items():
        res[k] = {'subject': t['subject'], 'html': page(t)}
    return res

if __name__ == '__main__':
    res = build()
    name = sys.argv[1] if len(sys.argv) > 1 else 'templates.json'
    json.dump(res, open(os.path.join(OUT, name), 'w'), ensure_ascii=False, indent=1)
    if name == 'templates.json':
        for k, v in res.items():
            open(os.path.join(OUT, k + '.html'), 'w').write(v['html'])
    for k, v in res.items():
        print(k, len(v['html']))
