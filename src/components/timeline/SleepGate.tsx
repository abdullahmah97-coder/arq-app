// قفل النوم على التطبيق كله: بعد «تصبحون على خير 🌙» شاشة الليل تغطي كل الصفحات وشريط التبويبات،
// وما ينفتح التطبيق إلا بـ«صباح الخير ☀️» (أو «ما نمت؟ تراجع»). يشتغل حتى لو فتح التطبيق من إشعار.
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { knownSleep, loadOpenSleep, onSleepChanged, sameSleep, type OpenSleep } from '@/lib/timeline';
import { SleepScreen, WokeToast, type Woke } from './SleepScreen';

export function SleepGate({ uid }: { uid: string }) {
  const [sleep, setSleep] = useState<OpenSleep | null | undefined>(() => knownSleep(uid));
  const [woke, setWoke] = useState<Woke | null>(null);
  const clearWoke = useCallback(() => setWoke(null), []);

  // أي تغيير (من هالجهاز أو من الخادم) يوصل هنا
  useEffect(() => onSleepChanged((u, s) => { if (u === uid) setSleep((p) => (sameSleep(p, s) ? p : s)); }), [uid]);
  // أول ما يفتح، وكل ما يرجع للتطبيق: نسأل الخادم (يعرف لو نام أو صحى من جهاز ثاني)
  useEffect(() => {
    void loadOpenSleep(uid);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') void loadOpenSleep(uid); });
    return () => sub.remove();
  }, [uid]);

  if (sleep) {
    return (
      <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
        <StatusBar style="light" />
        <SleepScreen uid={uid} sleep={sleep} onWoke={setWoke} full />
      </View>
    );
  }
  return woke ? <WokeToast uid={uid} woke={woke} onDone={clearWoke} /> : null;
}
