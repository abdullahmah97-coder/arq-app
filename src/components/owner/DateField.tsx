// حقل تاريخ بالتقويم بدل الكتابة (الكتابة بكيبورد عربي كانت تلخبط): يوم بتوقيت الرياض «YYYY-MM-DD»
// يضغطه ← يطلع تقويم الشهر ← يختار اليوم. و«بدون تاريخ» يمسحه.
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { uiIsRTL } from '@/components/chat/Bubble';
import { T } from '@/components/ui';
import { riyadhDay } from '@/lib/launchAdsCore';
import { brand, colors, font, fonts, radius, space } from '@/theme';

type Lng = 'ar' | 'en';
const WEEK = { ar: ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'], en: ['S', 'M', 'T', 'W', 'T', 'F', 'S'] };
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const loc = (lng: Lng) => (lng === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB');
const parts = (day: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
};

/** «الأربعاء، ١ أكتوبر ٢٠٢٦» للعرض */
export function prettyDay(day: string, lng: Lng): string {
  const p = parts(day);
  if (!p) return day;
  try { return new Date(p.y, p.m, p.d, 12).toLocaleDateString(loc(lng), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return day; }
}

export function DateField({ label, value, onChange, lng, min }: {
  label: string; value: string; onChange: (v: string) => void; lng: Lng;
  /** أقدم يوم مسموح (مثلاً يوم البداية لحقل النهاية) */
  min?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const has = !!parts(value);
  return (
    <View style={{ gap: space.xs, flex: 1 }}>
      <T size="sm" muted>{label}</T>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${label}: ${has ? prettyDay(value, lng) : t('ads.noDate')}`}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: space.md, paddingVertical: 8,
          borderWidth: 1, borderColor: has ? brand.deepGreen : colors.border, borderRadius: radius.md, backgroundColor: colors.card, opacity: pressed ? 0.7 : 1,
        })}>
        <Ionicons name="calendar-outline" size={17} color={has ? brand.deepGreen : colors.muted} />
        <T size="sm" semibold={has} muted={!has} style={{ flex: 1 }} numberOfLines={2}>{has ? prettyDay(value, lng) : t('ads.noDate')}</T>
      </Pressable>
      {open ? (
        <CalendarSheet title={label} value={value} min={min} lng={lng}
          onPick={(v) => { setOpen(false); onChange(v); }} onClose={() => setOpen(false)} />
      ) : null}
    </View>
  );
}

/** تقويم الشهر (ينفتح على شهر القيمة الحالية، أو اليوم) */
function CalendarSheet({ title, value, min, lng, onPick, onClose }: {
  title: string; value: string; min?: string; lng: Lng; onPick: (v: string) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const today = riyadhDay();
  const [month, setMonth] = useState(() => {
    const s = parts(value) ?? parts(min ?? '') ?? parts(today)!;
    return { y: s.y, m: s.m };
  });
  const rtl = uiIsRTL();

  const first = new Date(month.y, month.m, 1, 12).getDay();
  const days = new Date(month.y, month.m + 1, 0, 12).getDate();
  const cells: (number | null)[] = [...Array<null>(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const rows = Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7));
  let monthLabel = `${month.y}-${pad(month.m + 1)}`;
  try { monthLabel = new Date(month.y, month.m, 1, 12).toLocaleDateString(loc(lng), { month: 'long', year: 'numeric' }); } catch { /* نخليها بالأرقام */ }
  const shift = (n: number) => setMonth((x) => { const d = new Date(x.y, x.m + n, 1, 12); return { y: d.getFullYear(), m: d.getMonth() }; });
  const todayOk = !min || today >= min;
  const pill = ({ pressed }: { pressed: boolean }) => ({
    flex: 1, alignItems: 'center' as const, paddingVertical: 12, borderRadius: radius.pill, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.7 : 1,
  });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(10,51,45,0.45)', justifyContent: 'flex-end' }}>
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22 }}>
          <Pressable onPress={() => {}} style={{ padding: space.lg, gap: space.md }}>
            <T bold center>{title}</T>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Pressable onPress={() => shift(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('ads.prevMonth')} style={{ padding: 6 }}>
                <Ionicons name="chevron-back" size={22} color={colors.text} style={{ transform: [{ scaleX: rtl ? -1 : 1 }] }} />
              </Pressable>
              <T semibold center style={{ flex: 1 }}>{monthLabel}</T>
              <Pressable onPress={() => shift(1)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('ads.nextMonth')} style={{ padding: 6 }}>
                <Ionicons name="chevron-forward" size={22} color={colors.text} style={{ transform: [{ scaleX: rtl ? -1 : 1 }] }} />
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row' }}>
              {WEEK[lng].map((w, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', color: colors.muted, fontFamily: fonts.regular, fontSize: font.xs }}>{w}</Text>)}
            </View>
            {rows.map((r, ri) => (
              <View key={ri} style={{ flexDirection: 'row' }}>
                {r.map((d, ci) => {
                  if (!d) return <View key={ci} style={{ flex: 1, height: 42 }} />;
                  const day = ymd(month.y, month.m, d);
                  const sel = day === value;
                  const isToday = day === today;
                  const off = !!min && day < min;
                  return (
                    <Pressable key={ci} disabled={off} onPress={() => onPick(day)} accessibilityRole="button" accessibilityLabel={prettyDay(day, lng)}
                      style={{ flex: 1, height: 42, alignItems: 'center', justifyContent: 'center' }}>
                      <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: sel ? brand.deepGreen : 'transparent', borderWidth: isToday && !sel ? 1.5 : 0, borderColor: brand.orange }}>
                        <Text style={{ fontFamily: sel || isToday ? fonts.semibold : fonts.regular, fontSize: font.sm,
                          color: sel ? brand.cream : off ? colors.border : colors.text }}>{d}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {todayOk ? (
                <Pressable onPress={() => onPick(today)} accessibilityRole="button" style={pill}>
                  <T size="sm" semibold>{t('ads.today')}</T>
                </Pressable>
              ) : null}
              <Pressable onPress={() => onPick('')} accessibilityRole="button" style={pill}>
                <T size="sm" semibold color={colors.danger}>{t('ads.noDate')}</T>
              </Pressable>
            </View>
          </Pressable>
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}
