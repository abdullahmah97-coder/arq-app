# الإطلاق التجريبي — ARQ أرك

الهدف: تطبيق حقيقي على جوالات المختبرين (آيفون وأندرويد)، وتقدر تعدّل وتطوّر وتوصل التحديث لهم **خلال دقائق بدون مراجعة متجر**، وبعدها تنتقل للإطلاق الفعلي بنفس الكود.

```
            ┌────────────── التطوير ──────────────┐
  الكود ──► │ npm run update:beta  (تحديث فوري)    │ ──► جوالات المختبرين (يفتحون التطبيق = آخر نسخة)
            │ npm run beta:ios / beta:android      │ ──► بناء جديد (فقط لو غيّرت شي أصلي Native)
            └─────────────────────────────────────┘
  الخادم التجريبي: Supabase "arq-staging"      ←→     الخادم الفعلي: Supabase "arq" (عند الإطلاق)
```

## النسخ الأربع للتطبيق

| النسخة | الاسم على الجوال | المعرّف | لمين | طريقة التثبيت |
|---|---|---|---|---|
| `development` | ARQ Dev | `sa.arq.app.dev` | أنت/المطوّر | بناء تطوير مع إعادة تحميل فورية |
| `preview` | ARQ Preview | `sa.arq.app.preview` | فريق صغير (أسرع طريقة) | رابط تثبيت مباشر (APK لأندرويد، أجهزة مسجّلة للآيفون) |
| `beta` | ARQ أرك | `sa.arq.app` | المختبرين | **TestFlight** + **Google Play اختبار داخلي** |
| `production` | ARQ أرك | `sa.arq.app` | الجميع | App Store + Google Play |

كل النسخ ما عدا الإطلاق تظهر فيها شارة **«تجريبي»** بجانب الاسم، وزر **«أرسل ملاحظة»** في صفحة حسابي. الإعداد في `app.config.ts` و `eas.json`.

---

## ما تحتاجه (مرة وحدة)

| الحساب | التكلفة | ليش |
|---|---|---|
| [Expo](https://expo.dev/signup) | مجاني للبداية | البناء في السحابة والتحديثات الفورية |
| [Apple Developer](https://developer.apple.com/programs/) | 99$ سنوياً | TestFlight و App Store |
| [Google Play Console](https://play.google.com/console/signup) | 25$ مرة وحدة | الاختبار الداخلي و Google Play |
| [Supabase](https://supabase.com) | مجاني للبداية | مشروعين: `arq-staging` للتجربة و `arq` للإطلاق |
| Anthropic API | حسب الاستخدام | الخطط الذكية وقراءة تقارير InBody (اختياري) |

> ما تحتاج جهاز ماك ولا Xcode ولا Android Studio — كل البناء في سحابة Expo.

---

## الخطوة 1 — الخادم التجريبي (Supabase staging)

1. أنشئ مشروع جديد باسم **arq-staging**.
2. شغّل ملفات `supabase/migrations/` بالترتيب ثم `supabase/seed.sql` (أو `npx supabase link` ثم `npx supabase db push`).
3. الذكاء الاصطناعي (اختياري):
   ```bash
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   npx supabase functions deploy generate-plan
   npx supabase functions deploy analyze-inbody
   npx supabase functions deploy coach
   ```
4. **الأندية:** وثّق أندية المختبرين (`verified = true` في جدول `gyms`) حتى تنحسب نقاط الحضور.
5. من *Project Settings → API* انسخ **Project URL** و **anon key**.

## الخطوة 2 — ربط المشروع بـ Expo

```bash
npm install
npm install -g eas-cli
eas login
eas init                      # ينشئ المشروع على Expo ويكتب projectId في app.json
```
التحديثات الفورية مفعّلة مسبقاً (`expo-updates` + `runtimeVersion: fingerprint`)، ورابطها يُبنى تلقائياً من projectId.

متغيرات البيئة (الخادم التجريبي لنسخ preview/beta، والفعلي للإطلاق):
```bash
eas env:set --name EXPO_PUBLIC_SUPABASE_URL --value https://XXXX.supabase.co --environment preview --visibility plaintext
eas env:set --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value eyJ... --environment preview --visibility plaintext
# نفس الشي لـ development (نفس قيم staging)
# وعند الإطلاق: --environment production بقيم مشروع arq الفعلي
```
> مفتاح anon عام بطبيعته (الحماية بقواعد RLS في قاعدة البيانات). مفتاح Anthropic **ما يدخل التطبيق أبداً** — هو في أسرار Supabase فقط.

## الخطوة 3 (اختيارية وأسرع) — تجربة داخلية برابط تثبيت

```bash
npm run build:preview
```
- **أندرويد:** يطلع رابط APK — أرسله لأي أحد ويثبته مباشرة.
- **آيفون:** سجّل أجهزة المختبرين أولاً `eas device:create` (يطلع رابط يفتحونه من الآيفون)، ثم ابنِ.

## الخطوة 4 — TestFlight (آيفون)

1. في [App Store Connect](https://appstoreconnect.apple.com) أنشئ تطبيق جديد بالمعرّف **`sa.arq.app`**.
2. انسخ **Apple ID** الرقمي للتطبيق وضعه مكان `REPLACE_WITH_APP_STORE_CONNECT_APP_ID` في `eas.json`.
3. ```bash
   npm run beta:ios          # يبني ويرفع لـ TestFlight تلقائياً (EAS يدير الشهادات)
   ```
4. في TestFlight:
   - **مختبرين داخليين** (فريقك، حتى 100): يوصلهم فوراً بعد المعالجة (5–10 دقائق).
   - **مختبرين خارجيين** (حتى 10,000 ورابط عام): أول نسخة تحتاج *Beta App Review* (غالباً يوم). جهّز لهم: وصف «وش تختبر»، إيميل للملاحظات، و**حساب تجريبي** (إيميل + كلمة مرور) للمراجع.

## الخطوة 5 — Google Play اختبار داخلي (أندرويد)

1. في [Play Console](https://play.google.com/console) أنشئ تطبيق باسم ARQ.
2. أول رفعة يدوية (شرط من Google):
   ```bash
   eas build --profile beta --platform android     # ينتج ملف .aab
   ```
   حمّله وارفعه في *Testing → Internal testing → Create release*.
3. أنشئ **Service Account** للرفع التلقائي، وحط ملف JSON في `secrets/google-play-service-account.json` (المجلد مستبعد من git).
4. من بعدها كل نسخة: `npm run beta:android`
5. أضف إيميلات المختبرين في *Internal testing → Testers* (حتى 100) وأرسل لهم رابط الانضمام.
6. **مهم لربط الساعة:** عبّئ نموذج **Health apps declaration** في *App content* (مطلوب لصلاحيات Health Connect).

---

## التطوير أثناء التجربة 🔁

### تعديل عادي (شاشات، نصوص، ألوان، منطق، تمارين 3D…) ← تحديث فوري
```bash
npm run update:beta -- --message "إصلاح زر الحضور + ألوان الثيم"
```
- يوصل للمختبرين **بدون مراجعة وبدون تنزيل من المتجر**: التطبيق يحمّله عند الفتح ويطبّقه في الفتح اللي بعده.
- للتطبيق الفوري: *حسابي → اضغط على رقم النسخة (تحقق من التحديثات)*.
- رقم التحديث يظهر أسفل صفحة حسابي ومع كل ملاحظة يرسلها المختبر.

### تعديل أصلي (Native) ← بناء جديد
لو أضفت مكتبة فيها كود أصلي، أو غيّرت الصلاحيات أو الإضافات في `app.json`:
```bash
npm run beta:ios && npm run beta:android
```
سياسة `fingerprint` تمنع وصول تحديث فوري لنسخة ما تتوافق معه — فما فيه خطر تكسير التطبيق.

### تعديلات قاعدة البيانات
أضف ملف migration جديد في `supabase/migrations/` وطبّقه على **staging** أولاً، ثم على الفعلي عند الإطلاق. شغّل `npm test` قبل أي نشر.

### التراجع عن تحديث سيئ
```bash
eas update:list --branch beta           # اختر المجموعة السابقة
eas update:republish --group <GROUP_ID>
```

---

## قراءة ملاحظات المختبرين 💬

كل ملاحظة تنحفظ في جدول **`beta_feedback`** في Supabase (Table Editor) مع: التصنيف (خطأ/فكرة/تصميم)، الصفحة، رقم النسخة، الجهاز، ومعرّف التحديث.
غيّر `status` إلى `seen` / `fixed` / `wontfix` لمتابعتها.

استعلام سريع لآخر الملاحظات:
```sql
select f.created_at, p.username, f.category, f.message, f.app_version, f.platform, f.status
from beta_feedback f join profiles p on p.id = f.user_id
order by f.created_at desc limit 50;
```

## قائمة ما يحتاج اختبار 🧪

- [ ] التسجيل واختيار الجنس والإعداد الأولي
- [ ] توليد الخطة (بالذكاء الاصطناعي وبدونه) + تعديلها حسب الجاهزية
- [ ] تسجيل الحضور بالموقع داخل نادي موثّق وخارجه
- [ ] ربط **Apple Health / Health Connect**: الخطوات، النوم، النبض، HRV (جرّب بساعة وبدون ساعة)
- [ ] رفع تقرير InBody (صورة و PDF) ومراجعة الأرقام
- [ ] شرح التمارين 3D على أجهزة قديمة وحديثة (الأداء والحرارة)
- [ ] المنشورات والإعجابات والتعليقات والأصدقاء والتحديات (بما فيها تحدي الخطوات)
- [ ] تغيير لون التطبيق واللغة (عربي/إنجليزي)
- [ ] تسجيل تمرين كامل (الأوزان والعدّات) ثم جدول المقارنة مع الجلسة المماثلة السابقة
- [ ] مدرب ARQ الذكي: طلب تمارين بالعربي والإنجليزي، «أضفه لخطة اليوم»، فتح الصفحات
- [ ] حذف الحساب

---

## من التجربة إلى الإطلاق الفعلي 🚀

1. مشروع Supabase **arq** للإطلاق: نفس migrations + seed + الأسرار + الدوال، ومتغيرات `--environment production`.
2. **سياسة خصوصية** على رابط عام (مطلوبة في المتجرين، وخصوصاً لبيانات الصحة والموقع والصور).
3. تأكد من **رخصة الخطوط** (Avenir Next و Noah) للاستخدام داخل تطبيق.
4. صور المتجر ووصفه بالعربي والإنجليزي.
5. ```bash
   eas build --profile production --platform all
   eas submit --profile production --platform ios
   eas submit --profile production --platform android   # يرفعها مسودة في المسار production
   ```
6. بعد الإطلاق، التحديثات الفورية للمستخدمين: `npm run update:production -- --message "..."`

الموجود في التطبيق للمتطلبات: حذف الحساب من داخله ✅، وشرح استخدام كل صلاحية (الموقع، الصور، الكاميرا، الصحة، الحركة) ✅، وبيانات الصحة خاصة ✅.
