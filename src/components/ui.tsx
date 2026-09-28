import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Logo } from '../brand/Brand';
import { useAuth } from '../lib/auth';
import { publicUrl } from '../lib/supabase';
import { brand, colors, font, fonts, radius, space, TAB_BAR_SPACE } from '../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Screen({ children, scroll = true, padded = true, edges = ['top'] }: {
  children: ReactNode; scroll?: boolean; padded?: boolean; edges?: ('top' | 'bottom')[];
}) {
  const inner = padded ? { padding: space.lg, gap: space.lg } : undefined;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={edges}>
      {scroll ? (
        <ScrollView contentContainerStyle={[inner, { paddingBottom: TAB_BAR_SPACE }]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/** نص بخط الهوية: Bold للعناوين، Light للنصوص (وRegular للأحجام الصغيرة لسهولة القراءة) */
export function T({ children, style, muted, size = 'md', bold, semibold, center, numberOfLines, color }: {
  children: ReactNode; style?: StyleProp<TextStyle>; muted?: boolean; size?: keyof typeof font;
  bold?: boolean; semibold?: boolean; center?: boolean; numberOfLines?: number; color?: string;
}) {
  const family = bold ? fonts.title : semibold ? fonts.semibold : font[size] <= font.sm ? fonts.regular : fonts.body;
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{
        color: color ?? (muted ? colors.muted : colors.text),
        fontSize: font[size],
        fontFamily: family,
        textAlign: center ? 'center' : undefined,
        writingDirection: 'auto',
      }, style]}
    >
      {children}
    </Text>
  );
}

export function H({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <T size="xl" bold style={style}>{children}</T>;
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const s = [styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style];
  if (onPress) return <Pressable onPress={onPress} style={({ pressed }) => [s, pressed && { opacity: 0.85 }]}>{children}</Pressable>;
  return <View style={s}>{children}</View>;
}

export function Row({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, icon, style, small }: {
  title: string; onPress?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
  loading?: boolean; disabled?: boolean; icon?: IconName; style?: StyleProp<ViewStyle>; small?: boolean;
}) {
  const bg = { primary: colors.primary, secondary: colors.cardAlt, ghost: 'transparent', danger: colors.danger, dark: brand.deepGreen }[variant];
  const fg = variant === 'primary' || variant === 'danger' || variant === 'dark' ? brand.cream : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        variant === 'ghost' && { borderWidth: 1.5, borderColor: colors.text },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon ? <Ionicons name={icon} size={small ? 16 : 20} color={fg} /> : null}
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: fg, fontSize: small ? font.sm : font.md, fontFamily: fonts.semibold, flexShrink: 1 }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Input({ label, hint, style, ...props }: TextInputProps & { label?: string; hint?: string }) {
  return (
    <View style={{ gap: space.xs }}>
      {label ? <T size="sm" muted>{label}</T> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        {...props}
        style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card }, props.multiline && { minHeight: 90, textAlignVertical: 'top' }, style]}
      />
      {hint ? <T size="xs" muted>{hint}</T> : null}
    </View>
  );
}

export function Segmented<V extends string | number>({ options, value, onChange, wrap }: {
  options: { value: V; label: string }[]; value: V; onChange: (v: V) => void; wrap?: boolean;
}) {
  return (
    <View style={[styles.segment, { backgroundColor: colors.cardAlt }, wrap && { flexWrap: 'wrap', backgroundColor: 'transparent', padding: 0, gap: space.sm }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            // الشرائح (wrap) بدون flex:1: في Yoga قيمة flexBasis:'auto' ما تلغي flex:1، فتنضغط الشريحة لعرض صفر ويختفي النص
            style={[
              wrap ? styles.chip : styles.segmentItem,
              active && { backgroundColor: brand.deepGreen, borderColor: brand.deepGreen },
            ]}
          >
            <Text style={{ color: active ? brand.cream : colors.text, fontFamily: active ? fonts.semibold : fonts.regular, fontSize: font.sm }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function OptionCard({ title, subtitle, icon, selected, onPress }: {
  title: string; subtitle?: string; icon?: IconName; selected?: boolean; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, styles.option, selected && { borderColor: colors.primary, backgroundColor: '#FDEBDD' }]}>
      {icon ? <Ionicons name={icon} size={24} color={selected ? colors.primary : colors.muted} /> : null}
      <View style={{ flex: 1 }}>
        <T semibold>{title}</T>
        {subtitle ? <T size="sm" muted>{subtitle}</T> : null}
      </View>
      <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? colors.primary : colors.border} />
    </Pressable>
  );
}

export function Avatar({ uri, name, size = 40 }: { uri?: string | null; name?: string | null; size?: number }) {
  const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?';
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.cardAlt }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: brand.deepGreen, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: brand.amber, fontFamily: fonts.title, fontSize: size * 0.4 }}>{initial}</Text>
    </View>
  );
}

export function Stat({ label, value, icon, color = colors.primary }: { label: string; value: string | number; icon: IconName; color?: string }) {
  return (
    <Card style={{ flex: 1, gap: space.xs, alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={20} color={color} />
      <T size="xxl" bold>{value}</T>
      <T size="xs" muted>{label}</T>
    </Card>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: space.xl, gap: space.lg }}>
      <Logo variant="mark" height={48} color={brand.orange} />
      <ActivityIndicator color={brand.deepGreen} />
    </View>
  );
}

export function Empty({ text, icon = 'sparkles-outline' }: { text: string; icon?: IconName }) {
  return (
    <View style={{ alignItems: 'center', padding: space.xl, gap: space.sm }}>
      <Ionicons name={icon} size={32} color={colors.muted} />
      <T muted center>{text}</T>
    </View>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <T size="lg" bold>{title}</T>
      {action ? <Pressable onPress={onAction} hitSlop={8}><T size="sm" semibold color={colors.primary}>{action}</T></Pressable> : null}
    </Row>
  );
}

export function IconButton({ icon, onPress, color = colors.text, size = 22 }: { icon: IconName; onPress: () => void; color?: string; size?: number }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: space.xs })}>
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: colors.border },
  btn: { minHeight: 50, borderRadius: radius.md, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  btnSmall: { minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.sm },
  input: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, color: colors.text, paddingHorizontal: space.md, paddingVertical: 12, fontSize: font.md, fontFamily: fonts.regular, textAlign: 'auto', writingDirection: 'auto' },
  segment: { flexDirection: 'row', backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: 4, gap: 4 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: 'transparent' },
  chip: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: space.lg, borderWidth: 1, backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius.pill },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});

/** صورة الحساب كزر يفتح الملف الشخصي (بديل تبويب "حسابي" في الشريط العائم) */
export function ProfileButton({ size = 34 }: { size?: number }) {
  const { profile } = useAuth();
  if (!profile) return null;
  return (
    <Pressable onPress={() => router.push('/(tabs)/profile')} hitSlop={8} style={{ borderWidth: 1.5, borderColor: brand.orange, borderRadius: 999, padding: 2 }}>
      <Avatar size={size} uri={publicUrl('avatars', profile.avatar_url)} name={profile.full_name ?? profile.username} />
    </Pressable>
  );
}
