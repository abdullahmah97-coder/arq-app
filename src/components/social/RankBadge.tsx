// شارة الرتبة (مبتدئ ← نخبة) + علامة المدرب الموثّق
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { T } from '@/components/ui';
import { useLocalized } from '@/lib/i18n';
import { rankOf } from '@/lib/ranks';
import { brand } from '@/theme';

export function RankBadge({ points, coach, small, onDark }: { points: number; coach?: boolean | null; small?: boolean; onDark?: boolean }) {
  const { L } = useLocalized();
  const r = rankOf(points);
  const dark = r.level === 4;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999,
        paddingHorizontal: small ? 7 : 10, paddingVertical: small ? 2 : 4,
        backgroundColor: onDark ? 'rgba(248,237,218,0.14)' : r.color + '22',
        borderWidth: 1, borderColor: dark ? brand.amber : r.color,
      }}>
        <Ionicons name={r.icon} size={small ? 11 : 13} color={onDark || dark ? brand.amber : r.color} />
        <T size="xs" semibold color={onDark ? brand.cream : dark ? brand.deepGreen : r.color} style={{ fontSize: small ? 11 : 12 }}>{L(r.name)}</T>
      </View>
      {coach ? <CoachCheck size={small ? 14 : 16} /> : null}
    </View>
  );
}

export function CoachCheck({ size = 16 }: { size?: number }) {
  const { t } = useTranslation();
  return <Ionicons name="checkmark-circle" size={size} color={brand.orange} accessibilityLabel={t('social.verifiedCoach')} />;
}
