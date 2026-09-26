import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { G, Path, Polygon } from 'react-native-svg';
import { brand, gradients } from '../theme';
import { LOGO, type LogoVariant } from './logo-paths';

/** شعار ARQ الرسمي بمتغيراته الأربعة، بألوان الهوية فقط */
export function Logo({ variant = 'mark', height = 32, color = brand.deepGreen }: {
  variant?: LogoVariant; height?: number; color?: string;
}) {
  const l = LOGO[variant];
  const width = (l.w / l.h) * height;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${l.w} ${l.h}`}>
      {l.d.map((d, i) => <Path key={i} d={d} fill={color} />)}
    </Svg>
  );
}

/** تدرج الهوية */
export function BrandGradient({ name = 'dune', style, children }: {
  name?: keyof typeof gradients; style?: StyleProp<ViewStyle>; children?: ReactNode;
}) {
  const c = gradients[name];
  return (
    <LinearGradient colors={c as unknown as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={style}>
      {children}
    </LinearGradient>
  );
}

/**
 * نمط السدو المستوحى من هندسة الشعار (شرائط مائلة بزاوية 45°)
 * يُرسم بشفافية فوق التدرج كما في "Pattern Color Usage"
 */
export function SaduPattern({ color = brand.cream, opacity = 0.14, variant = 'chevron', style }: {
  color?: string; opacity?: number; variant?: 'chevron' | 'arrows' | 'peaks'; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice">
        <G fill={color} opacity={opacity}>
          {variant === 'chevron' && (
            <>
              <Polygon points="40,0 62,0 100,38 138,0 160,0 100,60" />
              <Polygon points="60,40 60,58 100,98 140,58 140,40 100,80" />
            </>
          )}
          {variant === 'arrows' && (
            <>
              <Polygon points="120,-10 136,-10 70,56 54,56" />
              <Polygon points="150,20 166,20 110,76 94,76" />
              <Polygon points="160,60 176,60 200,84 200,100 184,100 160,76" />
            </>
          )}
          {variant === 'peaks' && (
            <>
              <Polygon points="0,120 60,60 120,120 104,120 60,76 16,120" />
              <Polygon points="80,120 140,60 200,120 184,120 140,76 96,120" />
            </>
          )}
        </G>
      </Svg>
    </View>
  );
}

/** المعين الصغير — عنصر فاصل من الهوية */
export function Diamond({ size = 8, color = brand.orange }: { size?: number; color?: string }) {
  return <View style={{ width: size, height: size, backgroundColor: color, transform: [{ rotate: '45deg' }] }} />;
}
