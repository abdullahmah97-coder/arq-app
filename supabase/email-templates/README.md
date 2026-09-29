# إيميلات أرك (Supabase Auth)

قوالب الإيميلات اللي يرسلها Supabase (تأكيد التسجيل، الدعوة، رابط الدخول، تغيير الإيميل، استرجاع كلمة المرور، رمز التحقق) بهوية أرك.

- الإرسال: Resend عبر SMTP، من `no-reply@joinarq.com` باسم «أرك ARQ».
- الصور مرفوعة في Supabase Storage: الحاوية العامة `brands` في مجلد `arq-email/`.
- القوالب تنلصق في لوحة Supabase: Authentication ← Emails ← Templates (العنوان + HTML من `templates.json`).

إعادة البناء:

```bash
python3 assets.py   # صور الغلاف والأيقونات من ملفات الهوية (assets/brand، assets/imagery، Noto Kufi Arabic، Ionicons)
python3 build.py    # templates.json + ملف HTML لكل قالب
```
