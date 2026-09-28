import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { BrandGradient, Logo, SaduPattern } from '@/brand/Brand';
import { Button, Card, Row, Screen, SectionTitle, T } from '@/components/ui';
import { inbodyGuide as G } from '@/content/learn';
import { useLocalized } from '@/lib/i18n';
import { brand, colors, radius, space } from '@/theme';

export default function InBodyGuide() {
  const { t } = useTranslation();
  const { L } = useLocalized();
  const [open, setOpen] = useState<string | null>(G.sections[0].key);

  return (
    <Screen edges={['bottom']}>
      <BrandGradient name="ember" style={{ borderRadius: radius.lg, padding: space.xl, overflow: 'hidden', gap: space.sm }}>
        <SaduPattern variant="arrows" opacity={0.12} />
        <Logo variant="mark" height={30} color={brand.amber} />
        <T size="xxl" bold color={brand.cream}>{L(G.title)}</T>
      </BrandGradient>

      <T style={{ lineHeight: 28 }}>{L(G.intro)}</T>

      <SectionTitle title={t('inbody.learnSections')} />
      {G.sections.map((s, i) => {
        const isOpen = open === s.key;
        return (
          <Card key={s.key} style={{ gap: space.md, padding: 0, overflow: 'hidden' }}>
            <Pressable onPress={() => setOpen(isOpen ? null : s.key)} style={{ padding: space.lg }}>
              <Row>
                <View style={{
                  width: 34, height: 34, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isOpen ? brand.orange : colors.cardAlt,
                }}>
                  <Ionicons name={s.icon as any} size={18} color={isOpen ? brand.cream : brand.deepGreen} />
                </View>
                <View style={{ flex: 1 }}>
                  <T size="xs" muted>{String(i + 1).padStart(2, '0')}</T>
                  <T semibold>{L(s.title)}</T>
                </View>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
              </Row>
            </Pressable>
            {isOpen ? (
              <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md }}>
                <Block label={t('inbody.learnWhat')} text={L(s.what)} />
                <Block label={t('inbody.learnHow')} text={L(s.read)} />
                <View style={{ backgroundColor: brand.deepGreen, borderRadius: radius.md, padding: space.md, gap: 4 }}>
                  <Row gap={6}>
                    <Ionicons name="sparkles" size={14} color={brand.amber} />
                    <T size="xs" semibold color={brand.amber}>{t('inbody.learnInApp')}</T>
                  </Row>
                  <T size="sm" color={brand.cream} style={{ lineHeight: 22 }}>{L(s.app)}</T>
                </View>
              </View>
            ) : null}
          </Card>
        );
      })}

      <SectionTitle title={L(G.prepTitle)} />
      <Card style={{ gap: space.md }}>
        {G.prep.map((p, i) => (
          <Row key={i} style={{ alignItems: 'flex-start' }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
              <T size="xs" bold color={brand.cream}>{i + 1}</T>
            </View>
            <T style={{ flex: 1 }}>{L(p)}</T>
          </Row>
        ))}
      </Card>
      <Card style={{ backgroundColor: '#FDEBDD', borderColor: brand.orange }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <Ionicons name="warning-outline" size={20} color={brand.orange} />
          <T size="sm" style={{ flex: 1 }}>{L(G.warning)}</T>
        </Row>
      </Card>

      <Button title={t('inbody.whatIsBC')} variant="dark" icon="layers-outline" onPress={() => router.push('/learn/body-composition')} />
      <Button title={t('inbody.addReport')} icon="add-circle-outline" onPress={() => router.push('/inbody')} />
    </Screen>
  );
}

function Block({ label, text }: { label: string; text: string }) {
  return (
    <View style={{ gap: 4 }}>
      <T size="xs" semibold color={colors.primary}>{label}</T>
      <T style={{ lineHeight: 26 }}>{text}</T>
    </View>
  );
}
