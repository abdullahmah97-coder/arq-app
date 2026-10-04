// أول دخول بعد إنشاء الحساب: نفتح جولة التعريف مرة وحدة فوق الرئيسية.
// إعلان البداية يتأجل للمرة الجاية لو الجولة تنتظر (LaunchAdGate يتحقق من نفس الحالة).
import { router } from 'expo-router';
import { useEffect } from 'react';
import { useUser } from '@/lib/auth';
import { isTourPending } from '@/lib/tour';

/** حسابات انفتحت لها الجولة في هالتشغيل (عشان ما تنفتح مرتين لو انعاد تركيب التبويبات) */
const opened = new Set<string>();

export function TourGate() {
  const { userId } = useUser();
  useEffect(() => {
    if (opened.has(userId)) return;
    let dead = false;
    // ننتظر الرئيسية ترسم أول، بعدين تطلع الجولة فوقها
    const timer = setTimeout(async () => {
      const pending = await isTourPending(userId);
      if (!pending || dead || opened.has(userId)) return;
      opened.add(userId);
      router.push('/tour');
    }, 450);
    return () => { dead = true; clearTimeout(timer); };
  }, [userId]);
  return null;
}
