# ربط بوابات الدخول مع أرك | ARQ gate integration

## بالعربي
كل بوابة لها مفتاح خاص يصدره مدير النادي من: إدارة النادي ← بوابات الدخول. المفتاح يظهر مرة وحدة فقط.

البوابة تقرأ رمز QR من جوال العضو (النص يبدأ بـ `arq://entry/`) أو الرقم من ٦ خانات، وترسله لأرك:

```
POST https://hfplqbnbuskiaeblxpfo.supabase.co/rest/v1/rpc/gate_verify
Headers:
  apikey: <مفتاح anon العام للتطبيق>
  Content-Type: application/json
Body:
  { "gate_key": "arqg_…", "token": "<نص رمز QR كامل أو الرقم>" }
```

الرد (مصفوفة فيها صف واحد):
```
[{ "allowed": true, "reason": "ok", "first_name": "Ahmed", "days_left": 23 }]
```
- افتح البوابة فقط إذا `allowed = true`.
- أسباب الرفض: `expired` منتهي، `frozen` مجمّد، `upcoming` ما بدأ، `no_membership` ما عنده اشتراك، `wrong_gym` اشتراكه لنادي ثاني، `code_used` مستخدم، `code_expired` انتهى، `code_not_found` غير صحيح، `invalid_gate` مفتاح البوابة غلط أو موقوف.
- الرمز يستخدم مرة وحدة وصلاحيته ٩٠ ثانية. كل عملية تنسجل في سجل الدخول وتحسب حضور للعضو.

## English
Each gate gets its own key, created by the gym manager in Manage gym → Entry gates (shown once).

The gate scans the member's QR (text starting with `arq://entry/`) or reads the 6-digit code, then calls the endpoint above with `gate_key` and `token`. Open only when `allowed` is `true`. Tokens are single-use and valid for 90 seconds; every attempt is logged and a successful one records the member's visit.
