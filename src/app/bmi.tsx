// حاسبة كتلة الجسم (BMI): تكتب وزنك وطولك (تبدأ من ملفك الصحي) ويطلع الرقم وتصنيفه،
// والوزن الصحي لطولك، وكم كيلو زيادة عن حده الأعلى أو ناقص عن حده الأدنى. الحساب على الجهاز وما ينحفظ شي.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, Card, Input, Row, Screen, T } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { bmiOf, parseNum, scalePos, type BmiClass } from '@/lib/bmi';
import { brand, colors, radius, space } from '@/theme';

const CLASS_COLOR: Record<BmiClass, string> = {
  under: colors.silver,
  normal: colors.success,
  over: colors.gold,
  obese1: colors.fire,
  obese2: colors.danger,
  obese3: colors.danger,
};
// شريط من 15 إلى 40: نحيف ‹18.5، طبيعي ‹25، زيادة ‹30، سمنة
const SEGMENTS: { to: number; color: string; label: string }[] = [
  { to: 18.5, color: colors.silver, label: 'bmi.seg_under' },
  { to: 25, color: colors.success, label: 'bmi.seg_normal' },
  { to: 30, color: colors.gold, label: 'bmi.seg_over' },
  { to: 40, color: colors.danger, label: 'bmi.seg_obese' },
];
const span = (i: number) => SEGMENTS[i].to - (i === 0 ? 15 : SEGMENTS[i - 1].to);
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export default function BmiCalculator() {
  const { t } = useTranslation();
  const { health } = useUser();
  const [weight, setWeight] = useState(health?.weight_kg ? String(health.weight_kg) : '');
  const [height, setHeight] = useState(health?.height_cm ? String(health.height_cm) : '');
  // الملف الصحي ممكن يوصل بعد ما تنفتح الشاشة: نعبّي بس الخانة اللي للحين فاضية
  useEffect(() => {
    if (health?.weight_kg) setWeight((v) => v || String(health.weight_kg));
    if (health?.height_cm) setHeight((v) => v || String(health.height_cm));
  }, [health?.weight_kg, health?.height_cm]);

  const w = parseNum(weight);
  const h = parseNum(height);
  const r = bmiOf(w, h);
  const typed = weight.trim() !== '' && height.trim() !== '';

  return (
    <Screen edges={['bottom']}>
      <Card style={{ gap: space.md }}>
        <T size="sm" muted style={{ lineHeight: 21 }}>{t('bmi.intro')}</T>
        <Row gap={space.md}>
          <View style={{ flex: 1 }}>
            <Input label={t('bmi.weight')} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="80" maxLength={5}
              accessibilityLabel={t('bmi.weight')} />
          </View>
          <View style={{ flex: 1 }}>
            <Input label={t('bmi.height')} value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder="175" maxLength={5}
              accessibilityLabel={t('bmi.height')} />
          </View>
        </Row>
        {typed && !r ? <T size="sm" color={colors.danger}>{t('bmi.invalid')}</T> : null}
      </Card>

      {r ? (
        <Card style={{ gap: space.md }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View accessible accessibilityLabel={`${t('bmi.yourBmi')} ${fmt(r.bmi)}`}>
              <T size="xs" muted>{t('bmi.yourBmi')}</T>
              <T bold style={{ fontSize: 40, lineHeight: 48 }}>{fmt(r.bmi)}</T>
            </View>
            <View style={{ backgroundColor: CLASS_COLOR[r.cls], borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 }}>
              <T size="sm" bold color={brand.cream}>{t(`bmi.cls_${r.cls}`)}</T>
            </View>
          </Row>

          {/* الشريط: ألوان الفئات ومؤشر مكانك */}
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden' }}>
              {SEGMENTS.map((s, i) => <View key={s.to} style={{ flex: span(i), backgroundColor: s.color }} />)}
            </View>
            <View style={{ height: 14 }}>
              <View style={{ position: 'absolute', start: `${scalePos(r.bmi) * 100}%`, marginStart: -7, top: 0 }}>
                <Ionicons name="caret-up" size={14} color={colors.text} />
              </View>
            </View>
            <View style={{ flexDirection: 'row' }}>
              {SEGMENTS.map((s, i) => (
                <T key={s.to} size="xs" muted center numberOfLines={1} style={{ flex: span(i), fontSize: 10 }}>{t(s.label)}</T>
              ))}
            </View>
          </View>

          <View style={{ backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: space.md, gap: 4 }}>
            <T size="sm" muted>{t('bmi.healthyRange')}</T>
            <T bold>{t('bmi.rangeKg', { min: fmt(r.healthyMin), max: fmt(r.healthyMax) })}</T>
          </View>

          {r.excessKg > 0 ? (
            <View style={{ borderColor: colors.fire, borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: 4 }}>
              <T size="sm" muted>{t('bmi.excessTitle')}</T>
              <T bold size="lg" color={colors.fire}>{t('bmi.kg', { n: fmt(r.excessKg) })}</T>
              <T size="sm" style={{ lineHeight: 21 }}>{t('bmi.excessBody', { n: fmt(r.excessKg), max: fmt(r.healthyMax) })}</T>
            </View>
          ) : r.shortKg > 0 ? (
            <View style={{ borderColor: colors.silver, borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: 4 }}>
              <T size="sm" muted>{t('bmi.shortTitle')}</T>
              <T bold size="lg">{t('bmi.kg', { n: fmt(r.shortKg) })}</T>
              <T size="sm" style={{ lineHeight: 21 }}>{t('bmi.shortBody', { n: fmt(r.shortKg), min: fmt(r.healthyMin) })}</T>
            </View>
          ) : (
            <T size="sm" color={colors.success} semibold>{t('bmi.inRange')}</T>
          )}
        </Card>
      ) : null}

      <Card style={{ gap: space.sm }}>
        <T size="xs" muted style={{ lineHeight: 19 }}>{t('bmi.note')}</T>
        <Button small variant="secondary" icon="analytics-outline" title={t('bmi.inbody')} onPress={() => router.push('/inbody')} />
      </Card>
    </Screen>
  );
}
