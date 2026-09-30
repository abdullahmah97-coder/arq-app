// خلفية المحادثة: لون أغمق شوي من الصفحات ونقشة سدو خفيفة متكررة (مثل خلفية الواتساب، بهوية أرك)
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';
import { brand } from '@/theme';

export function ChatBackdrop() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="arq-chat-sadu" width={56} height={56} patternUnits="userSpaceOnUse">
            <Path d="M28 13 L43 28 L28 43 L13 28 Z" fill="none" stroke={brand.deepGreen} strokeWidth={1.3} strokeOpacity={0.07} />
            <Path d="M28 23 L33 28 L28 33 L23 28 Z" fill={brand.orange} fillOpacity={0.08} />
            <Path d="M0 0 L7 0 L0 7 Z M56 0 L56 7 L49 0 Z M0 56 L0 49 L7 56 Z M56 56 L49 56 L56 49 Z" fill={brand.deepGreen} fillOpacity={0.06} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={brand.deepGreen} fillOpacity={0.035} />
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#arq-chat-sadu)" />
      </Svg>
    </View>
  );
}
