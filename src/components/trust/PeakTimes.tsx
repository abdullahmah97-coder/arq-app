// أوقات الذروة: متوسط الموجودين لكل ساعة (آخر ٨ أسابيع) مع مؤشر «الحين» واقتراح أهدى وقت قريب من وقتك
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { Card, Segmented, T } from '@/components/ui';
import { loadPeak, myUsualHours, quietestNear, type PeakCell } from '@/lib/trust';
import { brand, colors, fonts, space } from '@/theme';

const HOURS = Array.from({ length: 19 }, (_, i) => i + 5); // ٥ الصبح → ١١ الليل
const MIN_SAMPLES = 10;
const fmtHour = (h: number, lng: string) => {
  const hh = h % 12 === 0 ? 12 : h % 12;
  return lng === 'en' ? `${hh}${h < 12 ? 'a' : 'p'}` : `${hh}${h < 12 ? 'ص' : 'م'}`;
};

export function PeakTimes({ gymId }: { gymId: string }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language === 'en' ? 'en' : 'ar';
  const now = new Date();
  const riyadh = new Date(now.getTime() + (now.getTimezoneOffset() + 180) * 60000); // توقيت الرياض
  const [dow, setDow] = useState(riyadh.getDay());
  const [data, setData] = useState<{ cells: PeakCell[]; samples: number } | null>(null);
  const [usual, setUsual] = useState<{ dow: number; hour: number }[]>([]);
  const [w, setW] = useState(0);
  useEffect(() => { loadPeak(gymId).then(setData).catch(() => setData({ cells: [], samples: 0 })); myUsualHours().then(setUsual).catch(() => {}); }, [gymId]);

  const max = useMemo(() => Math.max(0.5, ...(data?.cells ?? []).map((c) => c.avg)), [data]);
  if (!data) return null;
  const days = t('weekdaysShort', { returnObjects: true }) as string[];
  const enough = data.samples >= MIN_SAMPLES;
  const at = (h: number) => data.cells.find((c) => c.dow === dow && c.hour === h)?.avg ?? 0;
  const myHour = usual.find((u) => u.dow === dow)?.hour ?? usual[0]?.hour;
  const quiet = myHour != null && enough ? quietestNear(data.cells, dow, myHour) : null;
  const busiest = enough ? HOURS.reduce((a, h) => (at(h) > at(a) ? h : a), HOURS[0]) : null;
  const H = 110; const barW = w ? (w - 4) / HOURS.length : 0;

  return (
    <Card style={{ gap: space.sm }}>
      <T size="lg" bold>{t('trust.peakTitle')}</T>
      <Segmented<number> wrap value={dow} onChange={setDow} options={days.map((d, i) => ({ value: i, label: d }))} />
      {enough ? (
        <>
          <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: H + 18 }}>
            {w ? (
              <Svg width={w} height={H + 18}>
                <Line x1={0} x2={w} y1={H} y2={H} stroke={colors.border} strokeWidth={1} />
                {HOURS.map((h, i) => {
                  const v = at(h); const bh = Math.max(2, (v / max) * (H - 8));
                  const isNow = dow === riyadh.getDay() && h === riyadh.getHours();
                  const x = lng === 'ar' ? w - (i + 1) * barW : i * barW; // اليمين = الصبح بالعربي
                  return <Rect key={h} x={x + 2} y={H - bh} width={Math.max(2, barW - 4)} height={bh} rx={3} fill={isNow ? brand.orange : h === busiest ? brand.deepGreen : brand.amber} opacity={isNow || h === busiest ? 1 : 0.75} />;
                })}
                {HOURS.filter((h) => h % 3 === 0).map((h) => {
                  const i = HOURS.indexOf(h); const x = lng === 'ar' ? w - (i + 0.5) * barW : (i + 0.5) * barW;
                  return <SvgText key={h} x={x} y={H + 14} fontSize={10} fill={colors.muted} textAnchor="middle" fontFamily={fonts.regular}>{fmtHour(h, lng)}</SvgText>;
                })}
              </Svg>
            ) : null}
          </View>
          {busiest != null && at(busiest) > 0 ? <T size="sm">{t('trust.busiestAt', { hour: fmtHour(busiest, lng) })}</T> : null}
          {quiet ? <T size="sm" semibold color={brand.green}>{t('trust.quietSuggestion', { hour: fmtHour(quiet.hour, lng) })}</T> : null}
          <T size="xs" muted>{t('trust.peakNote')}</T>
        </>
      ) : <T size="sm" muted>{t('trust.peakNotEnough')}</T>}
    </Card>
  );
}
