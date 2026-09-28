// رسم رمز QR بـ react-native-svg (مسار واحد لكل المربعات السوداء + هامش ٤ مربعات)
import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { encodeQr, type Ecc } from '@/lib/qr';

export function QrCode({ value, size = 240, ecc = 'M', color = '#0A332D', background = '#FFFFFF' }: {
  value: string; size?: number; ecc?: Ecc; color?: string; background?: string;
}) {
  const { d, n } = useMemo(() => {
    const q = encodeQr(value, ecc);
    const quiet = 4;
    let path = '';
    q.modules.forEach((row, y) => row.forEach((dark, x) => { if (dark) path += `M${x + quiet} ${y + quiet}h1v1h-1z`; }));
    return { d: path, n: q.size + quiet * 2 };
  }, [value, ecc]);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} accessibilityRole="image">
      <Rect x={0} y={0} width={n} height={n} fill={background} />
      <Path d={d} fill={color} />
    </Svg>
  );
}
