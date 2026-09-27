// بديل SafeAreaView للشاشات المعروضة بملء الشاشة فوق غيرها (fullScreenModal):
// على بعض إصدارات iOS ترجع مسافة الأمان العلوية صفر داخلها، فيطلع رأس الصفحة تحت الساعة والبطارية.
// نأخذ الأكبر بين القيمة الحالية وقيمة الشاشة وقت تشغيل التطبيق.
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

type Edge = 'top' | 'bottom';

export function useFullScreenInsets() {
  const i = useSafeAreaInsets();
  const base = initialWindowMetrics?.insets;
  return { top: Math.max(i.top, base?.top ?? 0), bottom: Math.max(i.bottom, base?.bottom ?? 0) };
}

export function FullSafeView({ edges = ['top', 'bottom'], style, children }: { edges?: Edge[]; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const ins = useFullScreenInsets();
  return (
    <View style={[{ paddingTop: edges.includes('top') ? ins.top : 0, paddingBottom: edges.includes('bottom') ? ins.bottom : 0 }, style]}>
      {children}
    </View>
  );
}
