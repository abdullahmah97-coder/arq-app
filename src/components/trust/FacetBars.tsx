// متوسط التقييم المفصّل: النظافة، الأجهزة، الزحمة، المدربين، التعامل
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Row, T } from '@/components/ui';
import { FACETS, type Facets } from '@/lib/trust';
import { brand, colors } from '@/theme';

export function FacetBars({ f }: { f: Facets | null }) {
  const { t } = useTranslation();
  if (!f || !f.rated) return null;
  return (
    <View style={{ gap: 6, paddingTop: 4 }}>
      {FACETS.map((k) => {
        const v = f[k];
        if (v == null) return null;
        return (
          <Row key={k} gap={8}>
            <T size="xs" muted style={{ width: 78 }}>{t(`trust.facet_${k}`)}</T>
            <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.cardAlt, overflow: 'hidden' }}>
              <View style={{ width: `${(v / 5) * 100}%`, height: '100%', backgroundColor: v >= 4 ? brand.green : v >= 3 ? brand.amber : brand.orange }} />
            </View>
            <T size="xs" semibold style={{ width: 26, textAlign: 'center' }}>{v.toFixed(1)}</T>
          </Row>
        );
      })}
      <T size="xs" muted>{t('trust.facetsFrom', { count: f.rated })}</T>
    </View>
  );
}
