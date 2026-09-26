import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { View } from 'react-native';
import { BrandGradient, Diamond, SaduPattern } from '@/brand/Brand';
import { Button, Card, Row, Screen, T } from '@/components/ui';
import { bodyComposition as C } from '@/content/learn';
import { useLocalized } from '@/lib/i18n';
import { brand, colors, radius, space } from '@/theme';

const COMPONENT_COLORS: Record<string, string> = {
  water: brand.deepGreen,
  protein: brand.green,
  minerals: brand.amber,
  fat: brand.orange,
};

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  water: 'water', protein: 'barbell', minerals: 'diamond', fat: 'flame',
};

export default function BodyComposition() {
  const { L, lng } = useLocalized();

  return (
    <Screen edges={['bottom']}>
      <BrandGradient name="ember" style={{ borderRadius: radius.lg, padding: space.xl, overflow: 'hidden', gap: space.sm }}>
        <SaduPattern variant="peaks" opacity={0.12} />
        <T size="xs" semibold color={brand.amber}>InBody · {lng === 'ar' ? 'التكنولوجيا' : 'Technology'}</T>
        <T size="xxl" bold color={brand.cream}>{L(C.title)}</T>
      </BrandGradient>

      {C.intro.map((p, i) => <T key={i} style={{ lineHeight: 28 }}>{L(p)}</T>)}

      {/* الشكل: المكونات الأربعة كنسب من الوزن */}
      <Card style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', height: 34, borderRadius: radius.sm, overflow: 'hidden' }}>
          {C.components.map((c) => (
            <View key={c.key} style={{ flex: c.share, backgroundColor: COMPONENT_COLORS[c.key], alignItems: 'center', justifyContent: 'center' }}>
              {c.share >= 10 ? <T size="xs" semibold color={brand.cream}>{c.share}%</T> : null}
            </View>
          ))}
        </View>
        <Row style={{ flexWrap: 'wrap' }} gap={space.md}>
          {C.components.map((c) => (
            <Row key={c.key} gap={6}>
              <View style={{ width: 12, height: 12, backgroundColor: COMPONENT_COLORS[c.key], borderRadius: 2 }} />
              <T size="sm">{L(c.name)} {c.share < 10 ? `${c.share}%` : ''}</T>
            </Row>
          ))}
        </Row>

        {/* كيف تتجمع المكونات — نفس منطق جدول أعلى التقرير */}
        <View style={{ gap: 6, marginTop: space.sm }}>
          {C.levels.map((lv) => (
            <View key={lv.name.en} style={{ gap: 4 }}>
              <T size="xs" muted>{L(lv.name)}</T>
              <View style={{ flexDirection: 'row', height: 14, gap: 2 }}>
                {C.components.map((c) => (
                  <View key={c.key} style={{
                    flex: c.share,
                    backgroundColor: lv.parts.includes(c.key) ? COMPONENT_COLORS[c.key] : colors.cardAlt,
                    borderRadius: 2,
                  }} />
                ))}
              </View>
            </View>
          ))}
        </View>
        <T size="xs" muted>{L(C.shareNote)}</T>
      </Card>

      {C.components.map((c) => (
        <Card key={c.key} style={{ gap: space.sm, borderStartWidth: 4, borderStartColor: COMPONENT_COLORS[c.key] }}>
          <Row>
            <View style={{ width: 36, height: 36, borderRadius: radius.md, backgroundColor: COMPONENT_COLORS[c.key], alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={ICONS[c.key]} size={18} color={brand.cream} />
            </View>
            <T size="lg" bold>{L(c.name)}</T>
          </Row>
          <T style={{ lineHeight: 26 }}>{L(c.text)}</T>
        </Card>
      ))}

      <Row style={{ justifyContent: 'center', marginVertical: space.sm }}>
        <Diamond /><Diamond color={brand.amber} /><Diamond color={brand.deepGreen} />
      </Row>
      <Button title={lng === 'ar' ? 'كيف أقرأ تقرير InBody؟' : 'How to read an InBody report'} variant="dark" icon="document-text-outline"
        onPress={() => router.push('/learn/inbody')} />
      <Button title={lng === 'ar' ? 'أضف تقرير InBody' : 'Add InBody report'} icon="add-circle-outline"
        onPress={() => router.push('/inbody')} />
    </Screen>
  );
}
