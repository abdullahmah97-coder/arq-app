// تنقّل آمن: صفحات التبويبات ما تنفتح نسخة ثانية فوق الصفحات، والرجوع له بديل لو ما فيه صفحة سابقة
import { router, type Href } from 'expo-router';

/** يفتح رابط. لو كان تبويب (/(tabs)/...) يرجع له بدل ما يفتح نسخة ثانية من التبويبات */
export function openHref(href: string) {
  if (href === '/(tabs)' || href.startsWith('/(tabs)/')) router.dismissTo(href as Href);
  else router.push(href as Href);
}

/** يرجع للصفحة السابقة، ولو ما فيه (مثلاً انفتحت من إشعار) يروح للرئيسية */
export function goBackOrHome() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}
