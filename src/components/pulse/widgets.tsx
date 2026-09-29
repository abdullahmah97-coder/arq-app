// عناصر الوضع الغامر: أرقام العرض (Noah Bold)، بطاقات داكنة، ألوان المناطق
import { createContext, useContext, type ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import type { IconName } from '@/components/ui';
import type { RecoveryZone } from '@/lib/health';
import { LONG_PRESS_MS, useHomeLongPress } from '@/lib/homeLayout';
import { brand, fonts, night, pulse, radius, space } from '@/theme';

/** نص فوق صورة/تدرج داكن: ألوان فاتحة ثابتة مهما كان الثيم */
const DarkCtx = createContext(false);
const LIGHT = { text: '#F8EDDA', muted: 'rgba(248,237,218,0.72)', faint: 'rgba(248,237,218,0.45)' };
export function OnDark({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <DarkCtx.Provider value><View style={style}>{children}</View></DarkCtx.Provider>;
}
const useInk = () => (useContext(DarkCtx) ? LIGHT : night);

export const zoneColor = (z: RecoveryZone | null | undefined) =>
  z === 'green' ? pulse.green : z === 'yellow' ? pulse.yellow : z === 'red' ? pulse.red : night.faint;

/** رقم عرض كبير بخط Noah Bold */
export function Num({ children, size = 40, color, style }: { children: ReactNode; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  const ink = useInk();
  return (
    <Text style={[{ fontFamily: fonts.display, fontSize: size, lineHeight: size * 1.08, color: color ?? ink.text, includeFontPadding: false, letterSpacing: -0.5 }, style]}>
      {children}
    </Text>
  );
}

/** نص على الخلفية الداكنة */
export function NT({ children, size = 14, bold, semibold, muted, faint, color, center, style, numberOfLines }: {
  children: ReactNode; size?: number; bold?: boolean; semibold?: boolean; muted?: boolean; faint?: boolean; color?: string;
  center?: boolean; style?: StyleProp<TextStyle>; numberOfLines?: number;
}) {
  const ink = useInk();
  return (
    <Text numberOfLines={numberOfLines} style={[{
      fontFamily: bold ? fonts.title : semibold ? fonts.semibold : fonts.regular, fontSize: size,
      color: color ?? (faint ? ink.faint : muted ? ink.muted : ink.text),
      textAlign: center ? 'center' : undefined, writingDirection: 'auto',
    }, style]}>{children}</Text>
  );
}

export function NCard({ children, style, onPress, strong }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; strong?: boolean }) {
  const longPress = useHomeLongPress();
  const s: StyleProp<ViewStyle> = [{
    backgroundColor: strong ? night.cardStrong : night.card, borderRadius: 20, padding: space.lg,
    borderWidth: 1, borderColor: night.line, gap: space.md, overflow: 'hidden',
  }, style];
  if (onPress) return <Pressable onPress={onPress} onLongPress={longPress} delayLongPress={LONG_PRESS_MS} style={({ pressed }) => [s, pressed && { opacity: 0.85 }]}>{children}</Pressable>;
  return <View style={s}>{children}</View>;
}

/** رقاقة مقياس صغيرة: أيقونة + قيمة + اسم */
export function MetricChip({ icon, label, value, unit, color, onPress }: {
  icon: IconName; label: string; value: string; unit?: string; color: string; onPress?: () => void;
}) {
  const longPress = useHomeLongPress();
  return (
    <Pressable onPress={onPress} onLongPress={longPress} delayLongPress={LONG_PRESS_MS} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.8 : 1 })}>
      <View style={{ backgroundColor: night.card, borderRadius: 16, borderWidth: 1, borderColor: night.line, paddingVertical: 12, paddingHorizontal: 12, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color, transform: [{ rotate: '45deg' }] }} />
          <NT size={11} muted numberOfLines={1}>{label}</NT>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
          <Num size={24} color={color}>{value}</Num>
          {unit ? <NT size={11} faint style={{ marginBottom: 2 }}>{unit}</NT> : null}
        </View>
      </View>
    </Pressable>
  );
}

/** عنوان قسم داكن */
export function NSection({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 7, height: 7, backgroundColor: brand.orange, transform: [{ rotate: '45deg' }] }} />
        <NT size={16} bold>{title}</NT>
      </View>
      {action ? <Pressable onPress={onAction} hitSlop={8}><NT size={13} semibold color={night.accent}>{action}</NT></Pressable> : null}
    </View>
  );
}

export function Pill({ children, color, bg = 'rgba(254,169,79,0.14)', center }: { children: ReactNode; color?: string; bg?: string; center?: boolean }) {
  return (
    <View style={{ alignSelf: center ? 'center' : 'flex-start', backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
      <NT size={11} semibold color={color ?? night.accent}>{children}</NT>
    </View>
  );
}
