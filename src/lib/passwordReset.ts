// استرجاع الحساب: رمز يوصل على الإيميل، وبعده كلمة مرور جديدة.
// نستخدم رمز بدل رابط: الرابط يفتح المتصفح مو التطبيق، والرمز ينكتب في التطبيق نفسه.
import { supabase } from './supabase';

/** الإيميل المكتوب في صفحة الدخول أو التسجيل: نعبّيه في صفحة الاسترجاع بدل ما نحطه في الرابط */
let typedEmail = '';
export const handOffEmail = (email: string) => { typedEmail = email.trim(); };
export const takeHandedEmail = () => typedEmail;

export const looksLikeEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

/** يرسل رمز الاسترجاع. Supabase يرد بنجاح حتى لو الإيميل مو مسجّل (عشان ما يكشف الحسابات) */
export async function sendRecoveryCode(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  if (error) throw error;
}

/**
 * يتحقق من الرمز ثم يحفظ كلمة المرور الجديدة.
 * الرمز والكلمة الجديدة ينطلبون مع بعض لأن التحقق يفتح الجلسة، والتطبيق ينتقل لحسابك على طول.
 * saved=false: دخل حسابه بس الخادم رفض الكلمة الجديدة (نادر).
 */
export async function resetPasswordWithCode(email: string, code: string, password: string): Promise<{ saved: boolean; error?: unknown }> {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.replace(/\D/g, ''), type: 'recovery' });
  if (error) throw error;
  const { error: saveError } = await supabase.auth.updateUser({ password });
  // «نفس كلمة المرور القديمة» = ما فيه شي يتغير، وهي اللي بيدخل فيها
  if (saveError && saveError.code !== 'same_password') return { saved: false, error: saveError };
  return { saved: true };
}
