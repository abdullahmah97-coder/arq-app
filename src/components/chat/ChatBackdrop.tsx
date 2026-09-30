// خلفية المحادثة بهوية أرك: لون خلفية التطبيق، وفوقه شعار أرك صغير متكرر بشفافية خفيفة
// (شطرنج بين الشعار ومعيّن الهوية الصغير — مثل خلفية الواتساب بس بشعارنا).
// الشعار نفسه بدون أي تحريف (نفس المسارات والنسبة من دليل الهوية)، وألوانه تتبع ثيم لون التطبيق.
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, G, Path, Pattern, Rect } from 'react-native-svg';
import { LOGO } from '@/brand/logo-paths';
import { brand, colors } from '@/theme';

/** عرض الشعار في النقشة، ومقاس المربع اللي يتكرر */
const MARK_W = 30;
const TILE_W = 92;
const TILE_H = 80;
/** نص قطر المعيّن */
const D = 3.2;

export function ChatBackdrop() {
  const s = MARK_W / LOGO.mark.w;
  const markH = LOGO.mark.h * s;
  // مكان الشعارين والمعيّنين داخل المربع
  const cells = [
    { x: TILE_W * 0.25, y: TILE_H * 0.25, mark: true },
    { x: TILE_W * 0.75, y: TILE_H * 0.75, mark: true },
    { x: TILE_W * 0.75, y: TILE_H * 0.25, mark: false },
    { x: TILE_W * 0.25, y: TILE_H * 0.75, mark: false },
  ];
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="arq-chat-mark" width={TILE_W} height={TILE_H} patternUnits="userSpaceOnUse">
            {cells.map((c, i) => c.mark ? (
              <G key={i} transform={`translate(${c.x - MARK_W / 2} ${c.y - markH / 2}) scale(${s})`}>
                {LOGO.mark.d.map((p, j) => <Path key={j} d={p} fill={brand.deepGreen} fillOpacity={0.065} />)}
              </G>
            ) : (
              <Path key={i} d={`M${c.x} ${c.y - D} L${c.x + D} ${c.y} L${c.x} ${c.y + D} L${c.x - D} ${c.y} Z`} fill={brand.orange} fillOpacity={0.16} />
            ))}
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#arq-chat-mark)" />
      </Svg>
    </View>
  );
}
